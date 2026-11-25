using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Media;

public sealed record MediaOutcome(bool Ok, string? Error, MediaAsset? Asset = null)
{
    public string? Url => Asset == null ? null : "/media/" + Asset.StoredName;
}

public interface IMediaService
{
    Task<MediaOutcome> SaveAsync(IFormFile file, string userId, string purpose, string? clientKey, CancellationToken ct = default);
    Task<MediaAsset?> FindByStoredNameAsync(string storedName, CancellationToken ct = default);
    Task<MediaAsset?> FindByKeyAsync(string key, string preferOwnerId, CancellationToken ct = default);
    string PathOf(MediaAsset a);
    Task DeleteAsync(MediaAsset a, CancellationToken ct = default);
    Task<int> DeleteAllOfUserAsync(string userId, CancellationToken ct = default);
}

/// <summary>
/// Lưu ảnh/video ra thư mục NGOÀI wwwroot (mặc định App_Data/uploads) với tên ngẫu nhiên do máy chủ sinh (GUID + đuôi đã kiểm tra),
/// chỉ phục vụ qua MediaController (kiểm tra đăng nhập, nosniff). Siêu dữ liệu nằm trong bảng MediaAssets.
/// </summary>
public sealed class MediaService : IMediaService
{
    private static readonly Regex KeyRx = new(@"^[A-Za-z0-9_\-:.]{1,120}$", RegexOptions.Compiled);
    private readonly ApplicationDbContext _db; private readonly string _root; private readonly long _userQuota;

    public MediaService(ApplicationDbContext db, IConfiguration cfg, IHostEnvironment env)
    {
        _db = db;
        _root = Path.GetFullPath(cfg["Uploads:Root"] is { Length: > 0 } r ? r : Path.Combine(env.ContentRootPath, "App_Data", "uploads"));
        _userQuota = cfg.GetValue("Uploads:UserQuotaMb", 200) * 1024L * 1024L;
    }

    public string PathOf(MediaAsset a)
    {
        if (!UploadValidator.IsSafeStoredName(a.StoredName)) throw new InvalidOperationException("Tên tệp lưu trữ không hợp lệ.");
        var full = Path.GetFullPath(Path.Combine(_root, a.StoredName[..2], a.StoredName));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new InvalidOperationException("Đường dẫn tệp ngoài thư mục lưu trữ.");   // chống path traversal
        return full;
    }

    private async Task<long> LimitMbAsync(string key, long fallbackMb, CancellationToken ct)
    {
        var v = await _db.SystemSettings.AsNoTracking().Where(s => s.Key == key).Select(s => s.ValueJson).FirstOrDefaultAsync(ct);
        return long.TryParse(v, out var mb) && mb is > 0 and <= 500 ? mb : fallbackMb;
    }

    public async Task<MediaOutcome> SaveAsync(IFormFile file, string userId, string purpose, string? clientKey, CancellationToken ct = default)
    {
        if (clientKey != null && !KeyRx.IsMatch(clientKey)) return new MediaOutcome(false, "Khóa media không hợp lệ.");
        var maxImg = await LimitMbAsync("upload.maxImageMb", 5, ct) * 1024 * 1024; var maxVid = await LimitMbAsync("upload.maxVideoMb", 50, ct) * 1024 * 1024;

        var header = new byte[16]; int read;
        await using (var probe = file.OpenReadStream()) read = await probe.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        var v = UploadValidator.Validate(file.FileName, file.ContentType, file.Length, header.AsSpan(0, read), purpose, maxImg, maxVid);
        if (!v.Ok) return new MediaOutcome(false, v.Error);

        MediaAsset? old = clientKey == null ? null : await _db.MediaAssets.FirstOrDefaultAsync(m => m.OwnerId == userId && m.ClientKey == clientKey, ct);
        var oldId = old?.Id ?? 0L;
        var used = await _db.MediaAssets.Where(m => m.OwnerId == userId && m.Id != oldId).SumAsync(m => (long?)m.SizeBytes, ct) ?? 0;
        if (used + file.Length > _userQuota) return new MediaOutcome(false, $"Vượt dung lượng cho phép của tài khoản ({_userQuota / (1024 * 1024)} MB). Hãy xóa bớt tệp cũ.");

        var stored = Guid.NewGuid().ToString("N") + v.File!.Extension;
        var asset = new MediaAsset { OwnerId = userId, Purpose = purpose, Kind = v.File.Kind, OriginalName = UploadValidator.SanitizeDisplayName(file.FileName), StoredName = stored, ContentType = v.File.ContentType, SizeBytes = file.Length, ClientKey = clientKey };
        var path = PathOf(asset); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".part";
        try
        {
            using var sha = SHA256.Create(); long total = 0;
            await using (var src = file.OpenReadStream())
            await using (var dst = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var buf = new byte[81920]; int n;
                while ((n = await src.ReadAsync(buf, ct)) > 0)
                {
                    total += n; if (total > (v.File.Kind == "video" ? maxVid : maxImg)) throw new InvalidDataException("Tệp quá lớn.");
                    sha.TransformBlock(buf, 0, n, null, 0); await dst.WriteAsync(buf.AsMemory(0, n), ct);
                }
                sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
            }
            asset.SizeBytes = total; asset.Sha256 = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
            File.Move(tmp, path);
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            TryDelete(tmp); TryDelete(path);
            return new MediaOutcome(false, ex is InvalidDataException ? "Tệp quá lớn." : "Không lưu được tệp. Vui lòng thử lại.");
        }

        // Xóa bản cũ TRƯỚC rồi mới thêm bản mới (hai lệnh riêng) để không vi phạm chỉ mục duy nhất (OwnerId, ClientKey).
        if (old != null) { _db.MediaAssets.Remove(old); await _db.SaveChangesAsync(ct); }
        _db.MediaAssets.Add(asset);
        try { await _db.SaveChangesAsync(ct); }
        catch { TryDelete(path); throw; }
        if (old != null) TryDelete(PathOf(old));
        return new MediaOutcome(true, null, asset);
    }

    public Task<MediaAsset?> FindByStoredNameAsync(string storedName, CancellationToken ct = default)
        => UploadValidator.IsSafeStoredName(storedName) ? _db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(m => m.StoredName == storedName, ct) : Task.FromResult<MediaAsset?>(null);

    public async Task<MediaAsset?> FindByKeyAsync(string key, string preferOwnerId, CancellationToken ct = default)
    {
        var q = _db.MediaAssets.AsNoTracking().Where(m => m.ClientKey == key);
        return await q.Where(m => m.OwnerId == preferOwnerId).FirstOrDefaultAsync(ct) ?? await q.OrderByDescending(m => m.CreatedAt).FirstOrDefaultAsync(ct);
    }

    public async Task DeleteAsync(MediaAsset a, CancellationToken ct = default)
    {
        _db.MediaAssets.Remove(await _db.MediaAssets.FirstAsync(m => m.Id == a.Id, ct));
        await _db.SaveChangesAsync(ct); TryDelete(PathOf(a));
    }

    public async Task<int> DeleteAllOfUserAsync(string userId, CancellationToken ct = default)
    {
        var rows = await _db.MediaAssets.Where(m => m.OwnerId == userId).ToListAsync(ct);
        _db.MediaAssets.RemoveRange(rows); await _db.SaveChangesAsync(ct);
        foreach (var r in rows) TryDelete(PathOf(r));
        return rows.Count;
    }

    private static void TryDelete(string p) { try { if (File.Exists(p)) File.Delete(p); } catch (IOException) { } }
}
