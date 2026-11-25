using System.Text.Json;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services;
using Disci.Web.Services.Admin;
using Disci.Web.Services.Audit;
using Disci.Web.Services.Engine;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Disci.Tests;

public sealed class AdminServiceTests : IDisposable
{
    private sealed class FakeEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test"; public string ApplicationName { get; set; } = "t";
        public string ContentRootPath { get; set; } = Path.GetTempPath(); public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    private sealed class FakeCatalog : ICatalogProvider
    {
        public int Invalidations;
        public Task<string> GetPublicJsonAsync(CancellationToken ct = default) => Task.FromResult("{}");
        public Task<DisciEngine> GetEngineAsync(CancellationToken ct = default) => throw new NotSupportedException();
        public void Invalidate() => Invalidations++;
    }

    private readonly SqliteConnection _conn = new("DataSource=:memory:"); private readonly ServiceProvider _sp; private readonly string _backupRoot = Path.Combine(Path.GetTempPath(), "disci-bk-" + Guid.NewGuid().ToString("N"));
    private readonly FakeCatalog _catalog = new();

    public AdminServiceTests()
    {
        _conn.Open();
        var sc = new ServiceCollection();
        sc.AddLogging(); sc.AddDataProtection().UseEphemeralDataProtectionProvider();
        sc.AddDbContext<ApplicationDbContext>(o => o.UseSqlite(_conn));
        sc.AddIdentityCore<ApplicationUser>(o => { o.Password.RequiredLength = 8; o.Password.RequireDigit = false; o.Password.RequireLowercase = false; o.Password.RequireUppercase = false; o.Password.RequireNonAlphanumeric = false; })
            .AddRoles<IdentityRole>().AddEntityFrameworkStores<ApplicationDbContext>();
        sc.AddMemoryCache(); sc.AddScoped<ISiteSettings, SiteSettings>();
        sc.AddSingleton<IHostEnvironment>(new FakeEnv()); sc.AddSingleton<ICatalogProvider>(_catalog);
        sc.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Backups:Root"] = _backupRoot }).Build());
        sc.AddScoped<IAuditService, AuditService>(); sc.AddScoped<IAccountDeletionService, AccountDeletionService>(); sc.AddScoped<IAdminService, AdminService>();
        sc.AddScoped<ICatalogAdminService, CatalogAdminService>(); sc.AddScoped<IBackupService, BackupService>();
        _sp = sc.BuildServiceProvider();
        using var s = _sp.CreateScope(); var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); db.Database.EnsureCreated();
        var rm = s.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>(); foreach (var r in Roles.All) rm.CreateAsync(new IdentityRole(r)).GetAwaiter().GetResult();
        db.ExerciseCategories.Add(new ExerciseCategory { Key = "nguc", Name = "Ngực" }); db.ProductCategories.Add(new ProductCategory { Key = "band", Name = "Dây" }); db.SaveChanges();
    }
    public void Dispose() { _sp.Dispose(); _conn.Dispose(); try { Directory.Delete(_backupRoot, true); } catch (IOException) { } }

    private async Task<T> With<T>(Func<IServiceProvider, Task<T>> f) { using var s = _sp.CreateScope(); return await f(s.ServiceProvider); }
    private Task<AdminResult> Adm(Func<IAdminService, Task<AdminResult>> f) => With(sp => f(sp.GetRequiredService<IAdminService>()));
    private Task<AdminResult> Cat(Func<ICatalogAdminService, Task<AdminResult>> f) => With(sp => f(sp.GetRequiredService<ICatalogAdminService>()));
    private Task<AdminResult> Bk(Func<IBackupService, Task<AdminResult>> f) => With(sp => f(sp.GetRequiredService<IBackupService>()));
    private T Db<T>(Func<ApplicationDbContext, T> f) { using var s = _sp.CreateScope(); return f(s.ServiceProvider.GetRequiredService<ApplicationDbContext>()); }
    private static JsonNode? J(AdminResult r) => JsonSerializer.SerializeToNode(r.Data);

    private async Task<(ApplicationUser U, Actor A)> Make(string email, string role, bool active = true)
    {
        using var s = _sp.CreateScope(); var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var u = new ApplicationUser { UserName = email, Email = email, FullName = email.Split('@')[0], IsActive = active, EmailConfirmed = true };
        Assert.True((await um.CreateAsync(u, "Abcdef12")).Succeeded); await um.AddToRoleAsync(u, role);
        return (u, new Actor(u.Id, email, role == Roles.Admin, role == Roles.Editor, role == Roles.Moderator, "127.0.0.1"));
    }

    // ---------------- Tài khoản & vai trò ----------------
    [Fact]
    public async Task Only_Admin_Can_Create_Users_And_Temp_Password_Is_Strong()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, mod) = await Make("mo@x.vn", Roles.Moderator);
        Assert.Equal(403, (await Adm(s => s.CreateUserAsync(mod, new CreateUserInput { Name = "Lan", Email = "lan@x.vn" }))).Status);
        var r = await Adm(s => s.CreateUserAsync(admin, new CreateUserInput { Name = "Lan Anh", Email = "lan@x.vn", Role = Roles.Editor })); Assert.True(r.Ok);
        var pw = (string)J(r)!["tempPassword"]!; Assert.True(pw.Length >= 12 && pw.Any(char.IsLetter) && pw.Any(char.IsDigit) && pw.Any(char.IsUpper) && pw.Any(char.IsLower));
        using (var s = _sp.CreateScope())
        {
            var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(); var u = (await um.FindByEmailAsync("lan@x.vn"))!;
            Assert.True(await um.CheckPasswordAsync(u, pw)); Assert.True(u.MustChangePassword); Assert.True(await um.IsInRoleAsync(u, Roles.Editor));
        }
        Assert.Equal(409, (await Adm(s => s.CreateUserAsync(admin, new CreateUserInput { Name = "Trùng", Email = "lan@x.vn" }))).Status);
        Assert.Equal(422, (await Adm(s => s.CreateUserAsync(admin, new CreateUserInput { Name = "X", Email = "sai" }))).Status);
        Assert.Equal(422, (await Adm(s => s.CreateUserAsync(admin, new CreateUserInput { Name = "Hợp lệ", Email = "h@x.vn", Role = "Hacker" }))).Status);
        Assert.Equal(422, (await Adm(s => s.CreateUserAsync(admin, new CreateUserInput { Name = "Hợp lệ", Email = "h2@x.vn", Password = "123" }))).Status);
    }

    [Fact]
    public async Task Last_Active_Admin_Is_Protected()
    {
        var (a1, admin1) = await Make("a1@x.vn", Roles.Admin);
        Assert.Equal(409, (await Adm(s => s.SetRoleAsync(admin1, a1.Id, Roles.User))).Status);             // hạ quyền admin cuối cùng
        var (a2, admin2) = await Make("a2@x.vn", Roles.Admin);
        Assert.Equal(409, (await Adm(s => s.SetActiveAsync(admin2, a2.Id, false))).Status);                // tự khóa mình
        Assert.True((await Adm(s => s.SetRoleAsync(admin1, a2.Id, Roles.User))).Ok);                       // có admin thứ hai thì hạ quyền được
        Assert.Equal(409, (await Adm(s => s.SetActiveAsync(admin2, a1.Id, false))).Status);                // a1 giờ là admin cuối cùng: không khóa được
        Assert.Equal(409, (await Adm(s => s.DeleteUserAsync(admin2, a1.Id))).Status);                      // cũng không xóa được
        Assert.NotNull(Db(d => d.Users.Find(a1.Id)));
    }

    [Fact]
    public async Task Moderator_Can_Lock_Normal_Users_But_Not_Staff()
    {
        var (_, mod) = await Make("mo@x.vn", Roles.Moderator); var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (normal, _) = await Make("u@x.vn", Roles.User); var (staff, _) = await Make("ed@x.vn", Roles.Editor);
        Assert.Equal(403, (await Adm(s => s.SetActiveAsync(mod, staff.Id, false))).Status);
        var stampBefore = Db(d => d.Users.Find(normal.Id)!.SecurityStamp);
        Assert.True((await Adm(s => s.SetActiveAsync(mod, normal.Id, false))).Ok);
        Assert.False(Db(d => d.Users.Find(normal.Id)!.IsActive)); Assert.NotEqual(stampBefore, Db(d => d.Users.Find(normal.Id)!.SecurityStamp));     // phiên cũ bị vô hiệu
        Assert.True((await Adm(s => s.SetActiveAsync(admin, staff.Id, false))).Ok);
        Assert.Equal(403, (await Adm(s => s.ResetPasswordAsync(mod, normal.Id))).Status); Assert.Equal(403, (await Adm(s => s.DeleteUserAsync(mod, normal.Id))).Status); Assert.Equal(403, (await Adm(s => s.SetRoleAsync(mod, normal.Id, Roles.Admin))).Status);
    }

    [Fact]
    public async Task Reset_Password_Gives_Temp_Password_Forces_Change_And_Is_Not_Logged()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (u, _) = await Make("u@x.vn", Roles.User);
        var r = await Adm(s => s.ResetPasswordAsync(admin, u.Id)); Assert.True(r.Ok); var pw = (string)J(r)!["tempPassword"]!;
        using (var s = _sp.CreateScope()) { var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(); var x = (await um.FindByIdAsync(u.Id))!; Assert.True(await um.CheckPasswordAsync(x, pw)); Assert.False(await um.CheckPasswordAsync(x, "Abcdef12")); Assert.True(x.MustChangePassword); }
        Assert.DoesNotContain(Db(d => d.AuditLogs.ToList()), l => (l.Detail ?? "").Contains(pw));
        Assert.Contains(Db(d => d.AuditLogs.ToList()), l => l.Action == "admin.user.password.reset" && l.ActorEmail == "ad@x.vn" && l.Ip == "127.0.0.1");
    }

    [Fact]
    public async Task List_Users_Filters_And_Pages()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); for (int i = 0; i < 5; i++) await Make($"u{i}@x.vn", Roles.User); await Make("lock@x.vn", Roles.User, active: false); await Make("ed@x.vn", Roles.Editor);
        var all = J(await Adm(s => s.ListUsersAsync(null, null, null, 1, 3)))!; Assert.Equal(8, (int)all["total"]!); Assert.Equal(3, ((JsonArray)all["items"]!).Count);
        Assert.Equal(1, (int)J(await Adm(s => s.ListUsersAsync(null, null, "locked", 1, 25)))!["total"]!);
        Assert.Equal(1, (int)J(await Adm(s => s.ListUsersAsync(null, Roles.Editor, null, 1, 25)))!["total"]!);
        Assert.Equal(6, (int)J(await Adm(s => s.ListUsersAsync(null, Roles.User, null, 1, 25)))!["total"]!);
        Assert.Equal(1, (int)J(await Adm(s => s.ListUsersAsync("u3@", null, null, 1, 25)))!["total"]!);
        Assert.Equal("admin".ToLowerInvariant(), ((string)((JsonArray)J(await Adm(s => s.ListUsersAsync("ad@", null, null, 1, 5)))!["items"]!)[0]!["role"]!).ToLowerInvariant());
        _ = admin;
    }

    // ---------------- Kiểm duyệt ----------------
    private void SeedPostWithActivity(string owner = "own")
    {
        Db(d => {
            d.Users.Add(new ApplicationUser { Id = owner, UserName = owner + "@x.vn", Email = owner + "@x.vn", FullName = "Chủ bài" });
            d.SaveChanges(); var p = new Post { UserId = owner, ClientId = "p1", Body = "nội dung vi phạm", Visibility = "public", RawJson = "{}" }; d.Posts.Add(p); d.SaveChanges();
            d.Comments.Add(new Comment { PostId = p.Id, UserId = owner, Body = "bình luận", ClientId = "c1" }); d.PostLikes.Add(new PostLike { PostId = p.Id, UserId = owner });
            d.Reports.Add(new Report { ClientId = "r1", ReporterId = owner, PostId = p.Id, Reason = "spam" }); d.SaveChanges(); return 0;
        });
    }

    [Fact]
    public async Task Content_Moderation_Is_For_Staff_And_Report_Resolution_For_Admin_Or_Moderator()
    {
        SeedPostWithActivity(); var (_, editor) = await Make("ed@x.vn", Roles.Editor); var (_, mod) = await Make("mo@x.vn", Roles.Moderator);
        var outsider = new Actor("khong-phai-nhan-su", null, false, false, false);
        Assert.Equal(403, (await Adm(s => s.SetPostHiddenAsync(outsider, "p1", true, "x"))).Status); Assert.Equal(403, (await Adm(s => s.DeletePostAsync(outsider, "p1"))).Status); Assert.Equal(403, (await Adm(s => s.SetCommentHiddenAsync(outsider, "c1", true))).Status);
        Assert.Equal(403, (await Adm(s => s.ResolveReportAsync(editor, "r1", "dismiss", null))).Status);        // Editor có quyền nội dung (khớp ma trận mặc định) nhưng không xử lý báo cáo
        var r = await Adm(s => s.SetPostHiddenAsync(mod, "p1", true, "Nội dung phản cảm")); Assert.True(r.Ok); Assert.True(Db(d => d.Posts.Single().Hidden));
        var n = Db(d => d.Notifications.Single(x => x.UserId == "own")); Assert.Equal("mod", n.Type); Assert.Contains("phản cảm", n.Body);
        Assert.True((await Adm(s => s.SetPostHiddenAsync(mod, "p1", false, null))).Ok); Assert.False(Db(d => d.Posts.Single().Hidden));
        Assert.True((await Adm(s => s.SetCommentHiddenAsync(mod, "c1", true))).Ok); Assert.True(Db(d => d.Comments.Single().Hidden));
        Assert.Equal(404, (await Adm(s => s.DeletePostAsync(mod, "khong-co"))).Status);
    }

    [Fact]
    public async Task Resolve_Report_Actions()
    {
        SeedPostWithActivity(); var (_, mod) = await Make("mo@x.vn", Roles.Moderator); var id = Db(d => d.Reports.Single().Id);
        Assert.Equal(422, (await Adm(s => s.ResolveReportAsync(mod, id.ToString(), "nuke", null))).Status);
        Assert.True((await Adm(s => s.ResolveReportAsync(mod, id.ToString(), "hide", "vi phạm"))).Ok);
        Assert.True(Db(d => d.Posts.Single().Hidden)); Assert.Equal("resolved", Db(d => d.Reports.Single().Status)); Assert.NotNull(Db(d => d.Reports.Single().HandledBy));
        var rid2 = Db(d => { var p = d.Posts.Single(); var r = new Report { ClientId = "r2", ReporterId = "own", PostId = p.Id, Reason = "spam" }; d.Reports.Add(r); d.SaveChanges(); return r.Id; });
        Assert.True((await Adm(s => s.ResolveReportAsync(mod, rid2.ToString(), "dismiss", null))).Ok); Assert.Equal("dismissed", Db(d => d.Reports.Single(r => r.Id == rid2).Status));
        Assert.True((await Adm(s => s.ResolveReportAsync(mod, id.ToString(), "delete", null))).Ok);
        Assert.Equal(0, Db(d => d.Posts.Count() + d.Comments.Count() + d.PostLikes.Count() + d.Reports.Count()));            // xóa bài kéo theo bình luận/thích/báo cáo
    }

    // ---------------- Cấu hình ----------------
    [Fact]
    public async Task Settings_Are_Admin_Only_Validated_And_Public_Subset_Excludes_System()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        Assert.Equal(403, (await Adm(s => s.PutSettingsAsync(editor, (JsonObject)JsonNode.Parse("""{"site.name":"X"}""")!))).Status);
        Assert.Equal(422, (await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"AspNetUsers.hack":"x"}""")!))).Status);
        Assert.Equal(422, (await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.../x":"x"}""")!))).Status);
        Assert.Equal(422, (await Adm(s => s.PutSettingsAsync(admin, new JsonObject { ["site.big"] = new string('a', 250_000) }))).Status);
        Assert.True((await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.name":"DISCI Lab","ui.theme":{"accent":"#0f0"},"system.allowRegister":false}""")!))).Ok);
        var pub = (JsonObject)J(await Adm(s => s.GetSettingsAsync(true)))!; Assert.Equal("DISCI Lab", (string)pub["site.name"]!); Assert.True(pub.ContainsKey("ui.theme")); Assert.False(pub.ContainsKey("system.allowRegister"));
        Assert.True(((JsonObject)J(await Adm(s => s.GetSettingsAsync(false)))!).ContainsKey("system.allowRegister"));
    }

    // ---------------- Danh mục ----------------
    private static JsonObject Ex(string id, Action<JsonObject>? tweak = null)
    {
        var o = (JsonObject)JsonNode.Parse($$"""{"id":"{{id}}","name":"Hít đất","cat":"nguc","muscles":"Ngực","level":1,"equip":["mat"],"kind":"reps","sets":3,"amt":10,"rest":45,"tags":["wrist"],"quiet":true,"steps":["Chống tay"],"mistakes":["Võng lưng"],"met":4.5}""")!; tweak?.Invoke(o); return o;
    }

    [Fact]
    public async Task Exercise_Upsert_Validates_Strictly_And_Invalidates_Cache()
    {
        var (_, editor) = await Make("ed@x.vn", Roles.Editor); var (_, mod) = await Make("mo@x.vn", Roles.Moderator);
        Assert.Equal(403, (await Cat(s => s.UpsertAsync(mod, "exercise", Ex("hit_dat")))).Status);
        foreach (var bad in new Action<JsonObject>[] { o => o["level"] = 9, o => o["cat"] = "khong_co", o => o["tags"] = new JsonArray("hack"), o => o["video"] = "javascript:alert(1)", o => o["image"] = "https://evil.example/x.jpg", o => o["kind"] = "lol", o => o["sets"] = 0, o => o["rep"] = "hit_dat", o => o["id"] = "Có Dấu!", o => o["name"] = "" })
            Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "exercise", Ex("hit_dat", bad)))).Status);
        Assert.Equal(0, Db(d => d.Exercises.Count()));
        var before = _catalog.Invalidations;
        Assert.True((await Cat(s => s.UpsertAsync(editor, "exercise", Ex("hit_dat", o => o["video"] = "/media/k/exv_hit_dat")))).Ok); Assert.True(_catalog.Invalidations > before);
        var e = Db(d => d.Exercises.Single()); Assert.True(e.IsCustom); Assert.Equal("/media/k/exv_hit_dat", e.VideoUrl); Assert.Equal(4.5, e.Met);
        Assert.True((await Cat(s => s.UpsertAsync(editor, "exercise", Ex("hit_dat", o => o["name"] = "Hít đất chuẩn")))).Ok); Assert.Equal(1, Db(d => d.Exercises.Count())); Assert.Equal("Hít đất chuẩn", Db(d => d.Exercises.Single().Name));
    }

    [Fact]
    public async Task Seeded_Items_Can_Only_Be_Hidden_Custom_Items_Can_Be_Deleted_Unless_Referenced()
    {
        var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        Db(d => { d.Exercises.Add(new Exercise { Id = "goc", CategoryKey = "nguc", Name = "Bài gốc", Sets = 3, Amt = 10, IsCustom = false }); d.SaveChanges(); return 0; });
        Assert.Equal(409, (await Cat(s => s.DeleteAsync(editor, "exercise", "goc"))).Status);
        Assert.True((await Cat(s => s.SetActiveAsync(editor, "exercise", "goc", false))).Ok); Assert.False(Db(d => d.Exercises.Single().IsActive));
        await Cat(s => s.UpsertAsync(editor, "exercise", Ex("tuy_chinh"))); await Cat(s => s.UpsertAsync(editor, "exercise", Ex("thay_the", o => o["rep"] = "tuy_chinh")));
        Assert.Equal(409, (await Cat(s => s.DeleteAsync(editor, "exercise", "tuy_chinh"))).Status);            // đang là bài thay thế của bài khác
        Assert.True((await Cat(s => s.DeleteAsync(editor, "exercise", "thay_the"))).Ok); Assert.True((await Cat(s => s.DeleteAsync(editor, "exercise", "tuy_chinh"))).Ok);
        Assert.Equal(404, (await Cat(s => s.DeleteAsync(editor, "exercise", "khong-co"))).Status); Assert.Equal(404, (await Cat(s => s.ListAsync("virus", true))).Status);
    }

    [Fact]
    public async Task Product_Food_Challenge_Validation()
    {
        var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        Assert.True((await Cat(s => s.UpsertAsync(editor, "product", (JsonObject)JsonNode.Parse("""{"id":"day_tap","name":"Dây kháng lực","cat":"band","price":150000,"space":"small","prio":"essential","goals":["muscle"],"unlocks":"band","specs":["3 mức"]}""")!))).Ok);
        Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "product", (JsonObject)JsonNode.Parse("""{"id":"x1","name":"A","cat":"band","price":-5,"space":"small"}""")!))).Status);
        Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "product", (JsonObject)JsonNode.Parse("""{"id":"x2","name":"A","cat":"khong","price":5,"space":"small"}""")!))).Status);
        Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "product", (JsonObject)JsonNode.Parse("""{"id":"x3","name":"A","cat":"band","price":5,"space":"small","goals":["bay"]}""")!))).Status);
        Assert.True((await Cat(s => s.UpsertAsync(editor, "food", (JsonObject)JsonNode.Parse("""{"id":"pho_bo","name":"Phở bò","slot":"sang","kcal":450,"protein":25,"cost":45000,"ing":["bánh phở","thịt bò"]}""")!))).Ok);
        Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "food", (JsonObject)JsonNode.Parse("""{"id":"pho_bo","name":"Phở bò","slot":"khuya","kcal":450,"protein":25,"cost":45000}""")!))).Status);
        Assert.True((await Cat(s => s.UpsertAsync(editor, "challenge", (JsonObject)JsonNode.Parse("""{"id":"ch_moi","name":"21 ngày","days":21,"goal":15,"metric":"sessions","desc":"Tập đều","reward":"Huy hiệu"}""")!))).Ok);
        Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "challenge", (JsonObject)JsonNode.Parse("""{"id":"ch_hong","name":"X","days":0,"goal":15,"metric":"sessions"}""")!))).Status);
        Assert.Equal(1, Db(d => d.Products.Count())); Assert.Equal(1, Db(d => d.FoodItems.Count())); Assert.Equal(1, Db(d => d.Challenges.Count()));
        Assert.True((await Cat(s => s.DeleteAsync(editor, "product", "day_tap"))).Ok);
    }

    [Fact]
    public async Task Catalog_Accepts_Seed_Style_Ids_With_Hyphens_And_Keeps_Extra_Fields()
    {
        var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        var prod = (JsonObject)JsonNode.Parse("""{"id":"band-set3","name":"Dây 3 mức","cat":"band","price":150000,"space":"small","prio":"consider","goals":["muscle"],"unlocks":"band","images":["/media/0123456789abcdef0123456789abcdef.jpg"],"brand":"DISCI","sku":"B3","stock":12,"badge":"Mới","highlights":["Gọn nhẹ","Bền"],"specTable":[{"k":"Chất liệu","v":"Cao su"}],"longDesc":"Mô tả dài","videoKey":"pv_band-set3"}""")!;
        Assert.True((await Cat(s => s.UpsertAsync(editor, "product", prod))).Ok);
        var back = (JsonObject)((System.Collections.IEnumerable)(await Cat(s => s.ListAsync("product", true))).Data!).Cast<JsonObject>().Single();
        Assert.Equal("band-set3", (string)back["id"]!); Assert.Equal("DISCI", (string)back["brand"]!); Assert.Equal(12, (int)back["stock"]!); Assert.Equal("Cao su", (string)back["specTable"]![0]!["v"]!);
        Assert.Equal("/media/0123456789abcdef0123456789abcdef.jpg", (string)back["images"]![0]!); Assert.Equal("pv_band-set3", (string)back["videoKey"]!); Assert.True((bool)back["active"]!); Assert.True((bool)back["custom"]!);
        // trường mở rộng bị kiểm tra
        foreach (var bad in new Action<JsonObject>[] { o => o["images"] = new JsonArray("https://evil.example/x.jpg"), o => o["images"] = new JsonArray("data:image/png;base64,AAAA"), o => o["longDesc"] = new string('x', 2500), o => o["bad key!"] = "x", o => o["videoKey"] = "../x", o => o["lots"] = new JsonArray(Enumerable.Range(0, 70).Select(i => (JsonNode?)i).ToArray()) })
        {
            var p2 = (JsonObject)prod.DeepClone(); bad(p2); Assert.Equal(422, (await Cat(s => s.UpsertAsync(editor, "product", p2))).Status);
        }
        Assert.Equal(1, Db(d => d.Products.Count()));
    }

    [Fact]
    public async Task Challenge_Metrics_From_Seed_Data_Are_Accepted()
    {
        var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        foreach (var m in new[] { "streak", "sessions30", "sessions28", "manual" })
            Assert.True((await Cat(s => s.UpsertAsync(editor, "challenge", (JsonObject)JsonNode.Parse($$"""{"id":"ch_{{m}}","name":"TT {{m}}","days":7,"goal":7,"metric":"{{m}}","demoMembers":1284}""")!))).Ok, m);
        var all = ((System.Collections.IEnumerable)(await Cat(s => s.ListAsync("challenge", true))).Data!).Cast<JsonObject>().ToList();
        Assert.Equal(4, all.Count); Assert.All(all, c => Assert.Equal(1284, (int)c["demoMembers"]!));           // trường phụ (demoMembers) được giữ
    }

    [Fact]
    public async Task Editor_May_Only_Change_Appearance_And_Cannot_Alter_System_Branch()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        Assert.True((await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.config":{"site":{"brand":"A"},"system":{"maintenance":false,"bannedWords":["x"]}},"system.maintenance":false}""")!))).Ok);
        Assert.Equal(403, (await Adm(s => s.PutSettingsAsync(editor, (JsonObject)JsonNode.Parse("""{"system.maintenance":true}""")!))).Status);
        Assert.Equal(403, (await Adm(s => s.PutSettingsAsync(editor, (JsonObject)JsonNode.Parse("""{"site.config":{},"system.maintenance":true}""")!))).Status);
        Assert.True((await Adm(s => s.PutSettingsAsync(editor, (JsonObject)JsonNode.Parse("""{"site.config":{"site":{"brand":"B"},"system":{"maintenance":true,"bannedWords":[]}}}""")!))).Ok);
        var cfg = JsonNode.Parse(Db(d => d.SystemSettings.Single(x => x.Key == "site.config").ValueJson))!;
        Assert.Equal("B", (string)cfg["site"]!["brand"]!); Assert.False((bool)cfg["system"]!["maintenance"]!); Assert.Equal("x", (string)cfg["system"]!["bannedWords"]![0]!);   // nhánh system giữ nguyên bản của Admin
        Assert.Equal("false", Db(d => d.SystemSettings.Single(x => x.Key == "system.maintenance").ValueJson));
    }

    [Fact]
    public async Task Site_Settings_Expose_Only_Public_Keys_And_Report_Maintenance()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin);
        using var s0 = _sp.CreateScope(); var site = s0.ServiceProvider.GetRequiredService<ISiteSettings>();
        Assert.False((await site.GetMaintenanceAsync()).On);
        Assert.True((await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.config":{"site":{"brand":"Lab"}},"system.maintenance":true,"system.maintenanceMsg":"Quay lại 9h"}""")!))).Ok);
        var m = await site.GetMaintenanceAsync(); Assert.True(m.On); Assert.Equal("Quay lại 9h", m.Message);
        var pub = JsonNode.Parse(await site.GetPublicJsonAsync())!.AsObject(); Assert.True(pub.ContainsKey("site.config")); Assert.False(pub.ContainsKey("system.maintenance"));
    }

    // ---------------- Sao lưu / khôi phục ----------------
    [Fact]
    public async Task Backup_Restore_Roundtrip_Is_Atomic_And_Admin_Only()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        await Cat(s => s.UpsertAsync(editor, "exercise", Ex("bk_ex"))); await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.name":"Goc"}""")!));
        await Adm(s => s.CreateAnnouncementAsync(editor, new AnnouncementInput { Title = "Bảo trì", Body = "tối nay" }));
        Assert.Equal(403, (await Bk(s => s.CreateAsync(editor, null))).Status);
        var created = await Bk(s => s.CreateAsync(admin, "trước khi sửa")); Assert.True(created.Ok); var id = (long)J(created)!["id"]!;

        await Cat(s => s.DeleteAsync(editor, "exercise", "bk_ex")); await Adm(s => s.PutSettingsAsync(admin, (JsonObject)JsonNode.Parse("""{"site.name":"Da doi"}""")!));
        Assert.Equal(0, Db(d => d.Exercises.Count()));
        Assert.Equal(403, (await Bk(s => s.RestoreAsync(editor, id))).Status);
        Assert.True((await Bk(s => s.RestoreAsync(admin, id))).Ok);
        Assert.Equal("bk_ex", Db(d => d.Exercises.Single().Id)); Assert.Equal("\"Goc\"", Db(d => d.SystemSettings.Single(x => x.Key == "site.name").ValueJson)); Assert.Equal(1, Db(d => d.Announcements.Count()));

        Assert.Equal(422, (await With(async sp => await sp.GetRequiredService<IBackupService>().UploadAsync(admin, new MemoryStream("không phải json"u8.ToArray()), 20))).Status);
        Assert.Equal(422, (await With(async sp => await sp.GetRequiredService<IBackupService>().UploadAsync(admin, new MemoryStream("""{"version":99}"""u8.ToArray()), 14))).Status);
        Assert.True((await Bk(s => s.DeleteAsync(admin, id))).Ok); Assert.Equal(0, Db(d => d.BackupRecords.Count())); Assert.Empty(Directory.GetFiles(_backupRoot));
    }

    [Fact]
    public async Task Restore_With_Bad_References_Changes_Nothing()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin);
        var created = await Bk(s => s.CreateAsync(admin, null)); var id = (long)J(created)!["id"]!;
        var path = await With(async sp => sp.GetRequiredService<IBackupService>().PathOf((await sp.GetRequiredService<IBackupService>().FindAsync(id))!));
        var doc = JsonNode.Parse(await File.ReadAllTextAsync(path))!; doc["exercises"] = new JsonArray(JsonNode.Parse("""{"id":"mo_coi","name":"Bài mồ côi","categoryKey":"nhom_khong_ton_tai","level":1,"kind":"reps","sets":1,"amt":1,"rest":0}"""));
        await File.WriteAllTextAsync(path, doc.ToJsonString());
        Assert.Equal(422, (await Bk(s => s.RestoreAsync(admin, id))).Status); Assert.Equal(0, Db(d => d.Exercises.Count()));
    }

    [Fact]
    public void Backup_Path_Traversal_Is_Blocked() => Assert.Throws<InvalidOperationException>(() => With(async sp => sp.GetRequiredService<IBackupService>().PathOf(new BackupRecord { FileName = "../../etc/passwd" })).GetAwaiter().GetResult());

    [Fact]
    public async Task Full_Database_Backup_Is_Admin_Only_And_Guarded_By_Provider()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, editor) = await Make("ed@x.vn", Roles.Editor);
        Assert.Equal(403, (await Bk(s => s.CreateDatabaseBackupAsync(editor, null))).Status);
        var r = await Bk(s => s.CreateDatabaseBackupAsync(admin, null)); Assert.Equal(422, r.Status); Assert.Contains("SQL Server", r.Error);          // test dùng SQLite: không chạy BACKUP DATABASE
        Assert.Equal(0, Db(d => d.BackupRecords.Count()));
    }

    [Fact]
    public async Task Database_Backup_Records_Cannot_Be_Restored_From_The_App_But_Can_Be_Unlisted()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin);
        var id = Db(d => { var r = new BackupRecord { FileName = "DISCI-20260101-120000.bak", Note = "Toàn bộ CSDL (.bak)" }; d.BackupRecords.Add(r); d.SaveChanges(); return r.Id; });
        var restore = await Bk(s => s.RestoreAsync(admin, id)); Assert.Equal(422, restore.Status); Assert.Contains("SSMS", restore.Error);
        Assert.True((await Bk(s => s.DeleteAsync(admin, id))).Ok); Assert.Equal(0, Db(d => d.BackupRecords.Count()));                                  // gỡ bản ghi, không đụng tệp trên máy SQL Server
        Assert.Throws<InvalidOperationException>(() => With(async sp => sp.GetRequiredService<IBackupService>().PathOf(new BackupRecord { FileName = "../DISCI-20260101-120000.bak" })).GetAwaiter().GetResult());
    }

    [Fact]
    public void Smtp_Sender_Is_Only_Used_When_Fully_Configured()
    {
        static IConfiguration Cfg(params (string, string?)[] kv) => new ConfigurationBuilder().AddInMemoryCollection(kv.ToDictionary(x => x.Item1, x => x.Item2)).Build();
        Assert.False(Disci.Web.Services.Email.SmtpEmailSender.IsConfigured(Cfg()));
        Assert.False(Disci.Web.Services.Email.SmtpEmailSender.IsConfigured(Cfg(("Email:Smtp:Host", "smtp.example.com"))));                       // thiếu người gửi
        Assert.False(Disci.Web.Services.Email.SmtpEmailSender.IsConfigured(Cfg(("Email:From", "no-reply@example.com"))));                         // thiếu máy chủ
        Assert.True(Disci.Web.Services.Email.SmtpEmailSender.IsConfigured(Cfg(("Email:Smtp:Host", "smtp.example.com"), ("Email:From", "no-reply@example.com"))));
    }

    // ---------------- Nhật ký & thống kê ----------------
    [Fact]
    public async Task Audit_Records_Admin_Actions_And_Can_Be_Filtered()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (u, _) = await Make("u@x.vn", Roles.User);
        await Adm(s => s.SetActiveAsync(admin, u.Id, false)); await Adm(s => s.SetActiveAsync(admin, u.Id, true)); await Adm(s => s.SetRoleAsync(admin, u.Id, Roles.Moderator));
        using var sc = _sp.CreateScope(); var audit = sc.ServiceProvider.GetRequiredService<IAuditService>();
        var (all, total) = await audit.QueryAsync("admin.user", null, null, null, 1, 50); Assert.Equal(3, total); Assert.All(all, l => { Assert.Equal("ad@x.vn", l.ActorEmail); Assert.Equal(u.Id, l.EntityId); });
        Assert.Single((await audit.QueryAsync("admin.user.role", null, null, null, 1, 50)).Items); Assert.Empty((await audit.QueryAsync(null, "nguoi-la", null, null, 1, 50)).Items);
    }

    [Fact]
    public async Task Dashboard_Counts()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); await Make("u@x.vn", Roles.User); await Make("l@x.vn", Roles.User, active: false); SeedPostWithActivity("p_owner");
        var d = J(await Adm(s => s.DashboardAsync()))!; Assert.Equal(4, (int)d["users"]!["total"]!); Assert.Equal(1, (int)d["users"]!["locked"]!); Assert.Equal(1, (int)d["content"]!["posts"]!); Assert.Equal(1, (int)d["moderation"]!["openReports"]!);
        _ = admin;
    }
}

public sealed class AdminSnapshotAndAnnouncementTests : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:"); private readonly ServiceProvider _sp;
    public AdminSnapshotAndAnnouncementTests()
    {
        _conn.Open(); var sc = new ServiceCollection();
        sc.AddLogging(); sc.AddDataProtection().UseEphemeralDataProtectionProvider(); sc.AddDbContext<ApplicationDbContext>(o => o.UseSqlite(_conn));
        sc.AddIdentityCore<ApplicationUser>(o => { o.Password.RequiredLength = 8; o.Password.RequireDigit = false; o.Password.RequireLowercase = false; o.Password.RequireUppercase = false; o.Password.RequireNonAlphanumeric = false; }).AddRoles<IdentityRole>().AddEntityFrameworkStores<ApplicationDbContext>();
        sc.AddMemoryCache(); sc.AddScoped<ISiteSettings, SiteSettings>(); sc.AddSingleton<ICatalogProvider>(new NullCatalog()); sc.AddScoped<IAuditService, AuditService>(); sc.AddScoped<IAccountDeletionService, AccountDeletionService>(); sc.AddScoped<IAdminService, AdminService>();
        sc.AddScoped<Disci.Web.Services.Community.ICommunityService, Disci.Web.Services.Community.CommunityService>();
        _sp = sc.BuildServiceProvider(); using var s = _sp.CreateScope(); var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); db.Database.EnsureCreated();
        var rm = s.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>(); foreach (var r in Roles.All) rm.CreateAsync(new IdentityRole(r)).GetAwaiter().GetResult();
    }
    private sealed class NullCatalog : ICatalogProvider { public Task<string> GetPublicJsonAsync(CancellationToken ct = default) => Task.FromResult("{}"); public Task<DisciEngine> GetEngineAsync(CancellationToken ct = default) => throw new NotSupportedException(); public void Invalidate() { } }
    public void Dispose() { _sp.Dispose(); _conn.Dispose(); }

    private async Task<(ApplicationUser U, Actor A)> Make(string email, string role)
    {
        using var s = _sp.CreateScope(); var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var u = new ApplicationUser { UserName = email, Email = email, FullName = email.Split('@')[0], EmailConfirmed = true }; Assert.True((await um.CreateAsync(u, "Abcdef12")).Succeeded); await um.AddToRoleAsync(u, role);
        return (u, new Actor(u.Id, email, role == Roles.Admin, role == Roles.Editor, role == Roles.Moderator, "1.2.3.4"));
    }
    private async Task<T> With<T>(Func<IServiceProvider, Task<T>> f) { using var s = _sp.CreateScope(); return await f(s.ServiceProvider); }

    [Fact]
    public async Task Snapshot_Is_Staff_Only_And_Audit_Backups_Are_Admin_Only()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, mod) = await Make("mo@x.vn", Roles.Moderator); var (_, user) = await Make("u@x.vn", Roles.User);
        Assert.Equal(403, (await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(user))).Status);
        var m = (JsonObject)(await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(mod))).Data!; Assert.False(m.ContainsKey("audit")); Assert.False(m.ContainsKey("backups")); Assert.Equal(3, ((JsonArray)m["users"]!).Count);
        var a = (JsonObject)(await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(admin))).Data!; Assert.True(a.ContainsKey("audit")); Assert.True(a.ContainsKey("backups"));
        var u0 = ((JsonArray)a["users"]!).Select(x => (JsonObject)x!).Single(x => (string)x["email"]! == "mo@x.vn"); Assert.Equal("moderator", (string)u0["role"]!); Assert.False((bool)u0["locked"]!);
    }

    [Fact]
    public async Task Snapshot_Includes_Hidden_Posts_Comments_And_Reports_With_Client_Ids()
    {
        var (owner, _) = await Make("own@x.vn", Roles.User); var (_, mod) = await Make("mo@x.vn", Roles.Moderator);
        using (var s = _sp.CreateScope())
        {
            var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); var p = new Post { UserId = owner.Id, ClientId = "pX", Body = "bài", Hidden = true, RawJson = """{"id":"pX","text":"bài","at":1}""" }; db.Posts.Add(p); db.SaveChanges();
            db.Comments.Add(new Comment { PostId = p.Id, UserId = owner.Id, Body = "bl", ClientId = "cX", Hidden = true }); db.Reports.Add(new Report { ClientId = "rX", ReporterId = owner.Id, PostId = p.Id, Reason = "spam" }); db.SaveChanges();
        }
        var snap = (JsonObject)(await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(mod))).Data!;
        var post = (JsonObject)((JsonArray)snap["posts"]!)[0]!; Assert.Equal("pX", (string)post["id"]!); Assert.True((bool)post["hidden"]!); Assert.Equal(owner.Id, (string)post["by"]!);
        Assert.True((bool)snap["comments"]!["pX"]![0]!["hidden"]!); Assert.Equal("rX", (string)snap["reports"]![0]!["id"]!); Assert.Equal("pX", (string)snap["reports"]![0]!["postId"]!);
        Assert.True((await With(sp => sp.GetRequiredService<IAdminService>().ResolveReportAsync(mod, "rX", "resolve", null))).Ok);           // xử lý báo cáo bằng mã của giao diện
        Assert.Equal("resolved", ((JsonArray)((JsonObject)(await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(mod))).Data!)["reports"]!)[0]!["st"]!.ToString());
    }

    [Fact]
    public async Task Announcements_Are_Validated_And_Delivered_Only_To_Their_Audience()
    {
        var (_, admin) = await Make("ad@x.vn", Roles.Admin); var (_, editor) = await Make("ed@x.vn", Roles.Editor); var (uA, _) = await Make("a@x.vn", Roles.User); var (uB, _) = await Make("b@x.vn", Roles.User);
        async Task<AdminResult> Send(Actor who, string? aud, string? link = null, string? id = null, DateTime? exp = null) => await With(sp => sp.GetRequiredService<IAdminService>().CreateAnnouncementAsync(who, new AnnouncementInput { Id = id, Title = "Tin " + aud, Audience = aud, Link = link, ExpiresAt = exp }));
        Assert.Equal(403, (await Send(new Actor("x", null, false, false, true), "all")).Status);                                   // Moderator không đăng thông báo
        foreach (var badAud in new[] { "role:hacker", "user:", "staff", "user:a b" }) Assert.Equal(422, (await Send(editor, badAud)).Status);
        foreach (var badLink in new[] { "javascript:alert(1)", "https://evil.example", "//evil.example", "../../etc/passwd" }) Assert.Equal(422, (await Send(editor, "all", badLink)).Status);
        Assert.True((await Send(editor, "all", "community.html", "an_local_1")).Ok); Assert.True((await Send(admin, "role:admin")).Ok); Assert.True((await Send(editor, "user:" + uA.Id)).Ok); Assert.True((await Send(editor, "all", null, null, DateTime.UtcNow.AddDays(-1))).Ok);
        async Task<string[]> For(string uid) { var arr = await With(sp => sp.GetRequiredService<Disci.Web.Services.Community.ICommunityService>().GetAnnouncementsAsync(uid)); return arr.Select(n => (string)n!["title"]!).OrderBy(x => x).ToArray(); }
        Assert.Equal(new[] { "Tin all", "Tin user:" + uA.Id }, await For(uA.Id));                                                   // đúng đối tượng, bỏ thông báo đã hết hạn
        Assert.Equal(new[] { "Tin all" }, await For(uB.Id));
        Assert.Contains("Tin role:admin", await For(admin.Id));
        Assert.True((await With(sp => sp.GetRequiredService<IAdminService>().DeleteAnnouncementAsync(editor, "an_local_1"))).Ok);    // xóa bằng mã do giao diện đặt
        Assert.Empty(await For(uB.Id));
    }

    [Fact]
    public async Task Staff_Can_Remove_Stories_And_Snapshot_Lists_Active_Ones()
    {
        var (owner, _) = await Make("own@x.vn", Roles.User); var (_, mod) = await Make("mo@x.vn", Roles.Moderator);
        using (var s = _sp.CreateScope()) { var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); db.Stories.Add(new Story { UserId = owner.Id, ClientId = "sX", Text = "tin", Hue = 10 }); db.Stories.Add(new Story { UserId = owner.Id, ClientId = "sOld", Text = "cũ", ExpiresAt = DateTime.UtcNow.AddHours(-1) }); db.SaveChanges(); }
        var snap = (JsonObject)(await With(sp => sp.GetRequiredService<IAdminService>().SnapshotAsync(mod))).Data!;
        Assert.Equal(new[] { "sX" }, ((JsonArray)snap["stories"]!).Select(x => (string)x!["id"]!).ToArray());                                  // story hết hạn không hiện
        Assert.Equal(403, (await With(sp => sp.GetRequiredService<IAdminService>().DeleteStoryAsync(new Actor("x", null, false, false, false), "sX"))).Status);
        Assert.Equal(404, (await With(sp => sp.GetRequiredService<IAdminService>().DeleteStoryAsync(mod, "khong-co"))).Status);
        Assert.True((await With(sp => sp.GetRequiredService<IAdminService>().DeleteStoryAsync(mod, "sX"))).Ok);
        using var s2 = _sp.CreateScope(); Assert.Equal(1, s2.ServiceProvider.GetRequiredService<ApplicationDbContext>().Stories.Count());
    }
}