using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Media;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Controllers;

/// <summary>
/// Tải lên và phục vụ ảnh/video. Tệp lưu ngoài wwwroot; chỉ người đã đăng nhập mới xem được (nội dung cộng đồng dùng chung cho thành viên).
/// Mục đích exercise-video / banner / product chỉ dành cho Admin/Editor.
/// </summary>
[Authorize]
public class MediaController : Controller
{
    private static readonly string[] StaffPurposes = { "exercise-video", "banner", "product" };
    private readonly IMediaService _media; private readonly UserManager<ApplicationUser> _users; private readonly ApplicationDbContext _db;
    public MediaController(IMediaService media, UserManager<ApplicationUser> users, ApplicationDbContext db) { _media = media; _users = users; _db = db; }

    private async Task<(ApplicationUser? User, bool Staff)> WhoAsync()
    {
        var u = await _users.GetUserAsync(User);
        if (u is not { IsActive: true, DeletedAt: null }) return (null, false);
        var roles = await _users.GetRolesAsync(u);
        return (u, roles.Any(r => r is Roles.Admin or Roles.Editor or Roles.Moderator));
    }
    private static bool CanEditCatalog(IEnumerable<string> roles) => roles.Any(r => r is Roles.Admin or Roles.Editor);

    [HttpPost("/api/media")] [RequestSizeLimit(60_000_000)] [RequestFormLimits(MultipartBodyLengthLimit = 60_000_000)]
    public async Task<IActionResult> Upload(IFormFile? file, [FromForm] string? purpose, [FromForm] string? key, CancellationToken ct)
    {
        var (u, _) = await WhoAsync(); if (u == null) return Unauthorized();
        if (file == null) return BadRequest(new { ok = false, message = "Chưa chọn tệp." });
        purpose = (purpose ?? "image").Trim().ToLowerInvariant();
        if (StaffPurposes.Contains(purpose) && !CanEditCatalog(await _users.GetRolesAsync(u))) return Forbid();
        var r = await _media.SaveAsync(file, u.Id, purpose, string.IsNullOrWhiteSpace(key) ? null : key.Trim(), ct);
        return r.Ok ? Json(new { ok = true, id = r.Asset!.Id, url = r.Url, kind = r.Asset.Kind, size = r.Asset.SizeBytes, key = r.Asset.ClientKey })
                    : UnprocessableEntity(new { ok = false, message = r.Error });
    }

    [HttpGet("/media/{name}")]
    public async Task<IActionResult> Serve(string name, CancellationToken ct)
    {
        var a = await _media.FindByStoredNameAsync(name, ct); if (a == null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return Stream(a);
    }

    /// <summary>Lấy video/ảnh theo khóa do giao diện đặt (ưu tiên tệp của chính người dùng, sau đó tệp mới nhất của người khác).</summary>
    [HttpGet("/media/k/{key}")]
    public async Task<IActionResult> ServeByKey(string key, CancellationToken ct)
    {
        var (u, _) = await WhoAsync(); if (u == null) return Unauthorized();
        var a = await _media.FindByKeyAsync(key, u.Id, ct); if (a == null) return NotFound();
        Response.Headers.CacheControl = "private, no-cache";
        return Stream(a);
    }

    private IActionResult Stream(MediaAsset a)
    {
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";   // phòng thủ chiều sâu nếu tệp bị mở trực tiếp
        var path = _media.PathOf(a);
        return System.IO.File.Exists(path) ? PhysicalFile(path, a.ContentType, enableRangeProcessing: true) : NotFound();
    }

    [HttpDelete("/api/media/k/{key}")]
    public async Task<IActionResult> DeleteByKey(string key, CancellationToken ct)
    {
        var (u, staff) = await WhoAsync(); if (u == null) return Unauthorized();
        var a = await _db.MediaAssets.AsNoTracking().Where(m => m.ClientKey == key && (m.OwnerId == u.Id || staff)).OrderByDescending(m => m.OwnerId == u.Id).FirstOrDefaultAsync(ct);
        if (a == null) return NotFound(new { ok = false });
        await _media.DeleteAsync(a, ct); return Json(new { ok = true });
    }

    [HttpDelete("/api/media/mine")]
    public async Task<IActionResult> DeleteMine(CancellationToken ct)
    {
        var (u, _) = await WhoAsync(); if (u == null) return Unauthorized();
        return Json(new { ok = true, deleted = await _media.DeleteAllOfUserAsync(u.Id, ct) });
    }

    /// <summary>scope=mine (mặc định) hoặc scope=all (chỉ nhân sự quản trị) – dùng cho thư viện media ở trang Admin.</summary>
    [HttpGet("/api/media")]
    public async Task<IActionResult> List(string? scope, CancellationToken ct)
    {
        var (u, staff) = await WhoAsync(); if (u == null) return Unauthorized();
        var q = _db.MediaAssets.AsNoTracking().AsQueryable();
        if (scope != "all" || !staff) q = q.Where(m => m.OwnerId == u.Id);
        var rows = await q.OrderByDescending(m => m.CreatedAt).Take(1000)
            .Select(m => new { key = m.ClientKey ?? m.StoredName, user = m.OwnerId, type = m.ContentType, size = m.SizeBytes, name = m.OriginalName, at = m.CreatedAt, url = "/media/" + m.StoredName, kind = m.Kind }).ToListAsync(ct);
        return Json(rows);
    }
}
