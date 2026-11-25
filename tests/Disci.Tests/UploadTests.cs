using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Media;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Disci.Tests;

public class UploadValidatorTests
{
    private static byte[] Pad(byte[] head, int len = 64) { var b = new byte[Math.Max(len, head.Length)]; head.CopyTo(b, 0); return b; }
    public static readonly byte[] Jpeg = Pad(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 });
    public static readonly byte[] Png = Pad(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
    public static readonly byte[] Gif = Pad("GIF89a"u8.ToArray());
    public static readonly byte[] Webp = Pad("RIFF\0\0\0\0WEBPVP8 "u8.ToArray());
    public static readonly byte[] Webm = Pad(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 });
    public static readonly byte[] Mp4 = Pad(new byte[] { 0, 0, 0, 0x18 }.Concat("ftypisom"u8.ToArray()).ToArray());
    public static readonly byte[] Mov = Pad(new byte[] { 0, 0, 0, 0x14 }.Concat("ftypqt  "u8.ToArray()).ToArray());
    private const long Img = 5 * 1024 * 1024, Vid = 50 * 1024 * 1024;

    private static ValidationResult V(string name, string? ct, byte[] bytes, string purpose, long? len = null) => UploadValidator.Validate(name, ct, len ?? bytes.Length, bytes, purpose, Img, Vid);

    [Theory]
    [InlineData("a.jpg", "image/jpeg", "avatar", ".jpg")] [InlineData("a.JPEG", "image/jpeg", "post", ".jpg")]
    [InlineData("a.png", "image/png", "cover", ".png")] [InlineData("a.gif", "image/gif", "story", ".gif")] [InlineData("a.webp", "image/webp", "product", ".webp")]
    public void Valid_Images_Are_Accepted(string name, string ct, string purpose, string ext)
    {
        var bytes = ext switch { ".jpg" => Jpeg, ".png" => Png, ".gif" => Gif, _ => Webp };
        var r = V(name, ct, bytes, purpose); Assert.True(r.Ok, r.Error); Assert.Equal(ext, r.File!.Extension);
    }

    [Theory]
    [InlineData("v.mp4", "video/mp4")] [InlineData("v.webm", "video/webm")] [InlineData("v.mov", "video/quicktime")] [InlineData("v.mp4", "application/octet-stream")]
    public void Valid_Videos_Are_Accepted(string name, string ct)
    {
        var bytes = name.EndsWith("webm") ? Webm : name.EndsWith("mov") ? Mov : Mp4;
        Assert.True(V(name, ct, bytes, "video").Ok);
    }

    [Fact] public void Mp4_And_Mov_Are_Interchangeable_By_Extension_But_Stored_By_Content()
    {
        var r = V("clip.mov", "video/quicktime", Mp4, "video"); Assert.True(r.Ok); Assert.Equal(".mp4", r.File!.Extension);
    }

    [Theory]
    [InlineData("shell.exe")] [InlineData("page.html")] [InlineData("logo.svg")] [InlineData("a.php")] [InlineData("a.js")] [InlineData("noext")] [InlineData("a.jpg.exe")]
    public void Dangerous_Or_Unknown_Extensions_Are_Rejected(string name) => Assert.False(V(name, "image/jpeg", Jpeg, "avatar").Ok);

    [Fact] public void Executable_Renamed_To_Jpg_Is_Rejected_By_Content()
    {
        var exe = new byte[64]; exe[0] = (byte)'M'; exe[1] = (byte)'Z';
        Assert.False(V("anh.jpg", "image/jpeg", exe, "avatar").Ok);
        Assert.False(V("anh.jpg", "image/jpeg", "<html><script>alert(1)</script></html>"u8.ToArray(), "avatar").Ok);
        Assert.False(V("anh.jpg", "image/jpeg", "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"u8.ToArray(), "avatar").Ok);
    }

    [Fact] public void Content_Must_Match_Extension() => Assert.False(V("a.jpg", "image/jpeg", Png, "avatar").Ok);
    [Fact] public void Kind_Must_Match_Purpose() { Assert.False(V("v.mp4", "video/mp4", Mp4, "avatar").Ok); Assert.False(V("a.png", "image/png", Png, "video").Ok); }
    [Fact] public void Unknown_Purpose_Is_Rejected() => Assert.False(V("a.jpg", "image/jpeg", Jpeg, "../../etc").Ok);
    [Fact] public void Empty_And_Oversized_Files_Are_Rejected() { Assert.False(V("a.jpg", "image/jpeg", Jpeg, "avatar", 0).Ok); Assert.False(V("a.jpg", "image/jpeg", Jpeg, "avatar", Img + 1).Ok); Assert.True(V("a.jpg", "image/jpeg", Jpeg, "avatar", Img).Ok); Assert.False(V("v.mp4", "video/mp4", Mp4, "video", Vid + 1).Ok); }
    [Fact] public void Suspicious_Declared_ContentType_Is_Rejected() => Assert.False(V("a.jpg", "text/html", Jpeg, "avatar").Ok);

    [Fact] public void Display_Name_Is_Sanitized()
    {
        Assert.Equal("evil.jpg", UploadValidator.SanitizeDisplayName("..\\..\\evil<>.jpg"));
        Assert.Equal("passwd", UploadValidator.SanitizeDisplayName("../../etc/passwd"));
        Assert.Equal("tep", UploadValidator.SanitizeDisplayName("   "));
        Assert.True(UploadValidator.SanitizeDisplayName(new string('a', 500) + ".jpg").Length <= 120);
    }

    [Theory]
    [InlineData("0123456789abcdef0123456789abcdef.jpg", true)] [InlineData("0123456789abcdef0123456789abcdef.exe", false)] [InlineData("../0123456789abcdef0123456789abcdef.jpg", false)]
    [InlineData("a.jpg", false)] [InlineData("0123456789ABCDEF0123456789abcdef.jpg", false)] [InlineData("", false)] [InlineData(null, false)]
    public void Stored_Name_Pattern(string? n, bool ok) => Assert.Equal(ok, UploadValidator.IsSafeStoredName(n));
}

public sealed class MediaServiceTests : IDisposable
{
    private sealed class FakeEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test"; public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = Path.GetTempPath(); public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    private readonly SqliteConnection _conn = new("DataSource=:memory:"); private readonly string _root = Path.Combine(Path.GetTempPath(), "disci-test-" + Guid.NewGuid().ToString("N"));
    private readonly ApplicationDbContext _db;

    public MediaServiceTests()
    {
        _conn.Open(); _db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(_conn).Options); _db.Database.EnsureCreated();
        _db.Users.Add(new ApplicationUser { Id = "u1", UserName = "a@b.vn", Email = "a@b.vn", FullName = "An" }); _db.SaveChanges();
    }
    public void Dispose() { _db.Dispose(); _conn.Dispose(); try { Directory.Delete(_root, true); } catch (IOException) { } }

    private MediaService Svc(int quotaMb = 200) => new(_db, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Uploads:Root"] = _root, ["Uploads:UserQuotaMb"] = quotaMb.ToString() }).Build(), new FakeEnv());
    private static IFormFile File(string name, string ct, byte[] bytes) => new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", name) { Headers = new HeaderDictionary(), ContentType = ct };
    private static byte[] Big(byte[] head, int len) { var b = new byte[len]; head.CopyTo(b, 0); return b; }
    private int FilesOnDisk() => Directory.Exists(_root) ? Directory.GetFiles(_root, "*", SearchOption.AllDirectories).Length : 0;

    [Fact]
    public async Task Saves_Valid_Image_With_Server_Generated_Name()
    {
        var r = await Svc().SaveAsync(File("../../../Ảnh của tôi.jpg", "image/jpeg", UploadValidatorTests.Jpeg), "u1", "avatar", null);
        Assert.True(r.Ok, r.Error); var a = r.Asset!;
        Assert.True(UploadValidator.IsSafeStoredName(a.StoredName)); Assert.Equal("/media/" + a.StoredName, r.Url);
        Assert.DoesNotContain("..", a.OriginalName); Assert.Equal("image", a.Kind); Assert.Equal(64, a.Sha256!.Length);
        Assert.True(System.IO.File.Exists(Svc().PathOf(a))); Assert.StartsWith(Path.GetFullPath(_root), Svc().PathOf(a));
        Assert.Equal(1, _db.MediaAssets.Count());
    }

    [Fact]
    public async Task Rejects_Fake_Image_And_Leaves_No_Trace()
    {
        var r = await Svc().SaveAsync(File("a.jpg", "image/jpeg", "<script>alert(1)</script>"u8.ToArray()), "u1", "post", null);
        Assert.False(r.Ok); Assert.Equal(0, _db.MediaAssets.Count()); Assert.Equal(0, FilesOnDisk());
    }

    [Fact]
    public async Task Same_ClientKey_Replaces_Old_File()
    {
        var svc = Svc();
        var a = (await svc.SaveAsync(File("v.mp4", "video/mp4", UploadValidatorTests.Mp4), "u1", "video", "vid_1")).Asset!; var oldPath = svc.PathOf(a);
        var b = (await svc.SaveAsync(File("v2.webm", "video/webm", UploadValidatorTests.Webm), "u1", "video", "vid_1")).Asset!;
        Assert.Equal(1, _db.MediaAssets.Count()); Assert.False(System.IO.File.Exists(oldPath)); Assert.True(System.IO.File.Exists(svc.PathOf(b)));
        Assert.Equal(b.StoredName, (await svc.FindByKeyAsync("vid_1", "u1"))!.StoredName);
    }

    [Fact]
    public async Task Enforces_Per_User_Quota()
    {
        var svc = Svc(quotaMb: 1);
        Assert.True((await svc.SaveAsync(File("a.jpg", "image/jpeg", Big(UploadValidatorTests.Jpeg, 600_000)), "u1", "post", null)).Ok);
        var second = await svc.SaveAsync(File("b.jpg", "image/jpeg", Big(UploadValidatorTests.Jpeg, 600_000)), "u1", "post", null);
        Assert.False(second.Ok); Assert.Contains("dung lượng", second.Error); Assert.Equal(1, FilesOnDisk());
    }

    [Fact]
    public async Task Invalid_Client_Key_Is_Rejected() => Assert.False((await Svc().SaveAsync(File("v.mp4", "video/mp4", UploadValidatorTests.Mp4), "u1", "video", "../../x")).Ok);

    [Fact]
    public void Path_Traversal_In_Stored_Name_Is_Blocked() => Assert.Throws<InvalidOperationException>(() => Svc().PathOf(new MediaAsset { StoredName = "../../etc/passwd" }));

    [Fact]
    public async Task DeleteAllOfUser_Removes_Rows_And_Files()
    {
        var svc = Svc();
        await svc.SaveAsync(File("a.jpg", "image/jpeg", UploadValidatorTests.Jpeg), "u1", "avatar", null); await svc.SaveAsync(File("b.png", "image/png", UploadValidatorTests.Png), "u1", "post", null);
        Assert.Equal(2, await svc.DeleteAllOfUserAsync("u1")); Assert.Equal(0, _db.MediaAssets.Count()); Assert.Equal(0, FilesOnDisk());
    }
}
