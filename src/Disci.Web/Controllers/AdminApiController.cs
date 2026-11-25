using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Admin;
using Disci.Web.Services.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Disci.Web.Controllers;

public sealed class ActiveRequest { public bool Active { get; set; } }
public sealed class RoleRequest { public string? Role { get; set; } }
public sealed class HideRequest { public string? Reason { get; set; } }
public sealed class ResolveRequest { public string? Action { get; set; } public string? Note { get; set; } }
public sealed class BackupRequest { public string? Note { get; set; } }

/// <summary>
/// API quản trị DISCI ADMIN. Cả controller yêu cầu policy "Staff" (Admin/Editor/Moderator); từng thao tác còn được kiểm tra vai trò chi tiết trong service
/// (ví dụ chỉ Admin đổi vai trò/xóa tài khoản/sao lưu, chỉ Admin/Moderator kiểm duyệt, chỉ Admin/Editor sửa danh mục). Người dùng thường nhận 403.
/// </summary>
[Authorize(Policy = "Staff")] [Route("api/admin")] [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class AdminApiController : Controller
{
    private readonly IAdminService _admin; private readonly ICatalogAdminService _catalog; private readonly IBackupService _backup; private readonly IAuditService _audit; private readonly UserManager<ApplicationUser> _users;
    public AdminApiController(IAdminService admin, ICatalogAdminService catalog, IBackupService backup, IAuditService audit, UserManager<ApplicationUser> users) { _admin = admin; _catalog = catalog; _backup = backup; _audit = audit; _users = users; }

    private async Task<Actor?> ActorAsync()
    {
        var u = await _users.GetUserAsync(User); if (u is not { IsActive: true, DeletedAt: null }) return null;
        var roles = await _users.GetRolesAsync(u);
        return new Actor(u.Id, u.Email, roles.Contains(Roles.Admin), roles.Contains(Roles.Editor), roles.Contains(Roles.Moderator), HttpContext.Connection.RemoteIpAddress?.ToString());
    }
    private IActionResult Out(AdminResult r) => r.Ok ? Json(r.Data ?? new { ok = true }) : StatusCode(r.Status, new { ok = false, message = r.Error });
    private async Task<IActionResult> Run(Func<Actor, Task<AdminResult>> f) { var a = await ActorAsync(); return a == null ? Unauthorized() : Out(await f(a)); }

    [HttpGet("snapshot")] public async Task<IActionResult> Snapshot(CancellationToken ct) { var a = await ActorAsync(); if (a == null) return Unauthorized(); var r = await _admin.SnapshotAsync(a, ct); return r.Ok ? Content(((System.Text.Json.Nodes.JsonObject)r.Data!).ToJsonString(), "application/json") : Out(r); }
    [HttpGet("dashboard")] public Task<IActionResult> Dashboard(CancellationToken ct) => Run(_ => _admin.DashboardAsync(ct));

    // ---- Tài khoản ----
    [HttpGet("users")] public Task<IActionResult> Users(string? q, string? role, string? status, int page = 1, int pageSize = 25, CancellationToken ct = default) => Run(_ => _admin.ListUsersAsync(q, role, status, page, pageSize, ct));
    [HttpPost("users")] public Task<IActionResult> CreateUser([FromBody] CreateUserInput? input, CancellationToken ct) => Run(a => _admin.CreateUserAsync(a, input ?? new CreateUserInput(), ct));
    [HttpPut("users/{id}/role")] public Task<IActionResult> SetRole(string id, [FromBody] RoleRequest? req, CancellationToken ct) => Run(a => _admin.SetRoleAsync(a, id, req?.Role ?? "", ct));
    [HttpPut("users/{id}/active")] public Task<IActionResult> SetActive(string id, [FromBody] ActiveRequest? req, CancellationToken ct) => Run(a => _admin.SetActiveAsync(a, id, req?.Active ?? true, ct));
    [HttpPost("users/{id}/reset-password")] public Task<IActionResult> ResetPassword(string id, CancellationToken ct) => Run(a => _admin.ResetPasswordAsync(a, id, ct));
    [HttpDelete("users/{id}")] public Task<IActionResult> DeleteUser(string id, CancellationToken ct) => Run(a => _admin.DeleteUserAsync(a, id, ct));

    // ---- Kiểm duyệt ----
    [HttpGet("posts")] public Task<IActionResult> Posts(string? q, bool? hidden, int page = 1, int pageSize = 25, CancellationToken ct = default) => Run(_ => _admin.ListPostsAsync(q, hidden, page, pageSize, ct));
    [HttpPost("posts/{id}/hide")] public Task<IActionResult> HidePost(string id, [FromBody] HideRequest? req, CancellationToken ct) => Run(a => _admin.SetPostHiddenAsync(a, id, true, req?.Reason, ct));
    [HttpPost("posts/{id}/unhide")] public Task<IActionResult> UnhidePost(string id, CancellationToken ct) => Run(a => _admin.SetPostHiddenAsync(a, id, false, null, ct));
    [HttpDelete("posts/{id}")] public Task<IActionResult> DeletePost(string id, CancellationToken ct) => Run(a => _admin.DeletePostAsync(a, id, ct));
    [HttpPost("comments/{id}/hide")] public Task<IActionResult> HideComment(string id, CancellationToken ct) => Run(a => _admin.SetCommentHiddenAsync(a, id, true, ct));
    [HttpPost("comments/{id}/unhide")] public Task<IActionResult> UnhideComment(string id, CancellationToken ct) => Run(a => _admin.SetCommentHiddenAsync(a, id, false, ct));
    [HttpDelete("comments/{id}")] public Task<IActionResult> DeleteComment(string id, CancellationToken ct) => Run(a => _admin.DeleteCommentAsync(a, id, ct));
    [HttpDelete("stories/{id}")] public Task<IActionResult> DeleteStory(string id, CancellationToken ct) => Run(a => _admin.DeleteStoryAsync(a, id, ct));
    [HttpGet("reports")] public Task<IActionResult> Reports(string? status, int page = 1, int pageSize = 25, CancellationToken ct = default) => Run(_ => _admin.ListReportsAsync(status, page, pageSize, ct));
    [HttpPost("reports/{id}/resolve")] public Task<IActionResult> Resolve(string id, [FromBody] ResolveRequest? req, CancellationToken ct) => Run(a => _admin.ResolveReportAsync(a, id, req?.Action ?? "", req?.Note, ct));

    // ---- Danh mục: exercise | product | food | challenge ----
    [HttpGet("catalog/{kind}")] public Task<IActionResult> CatalogList(string kind, bool all = true, CancellationToken ct = default) => Run(_ => _catalog.ListAsync(kind, all, ct));
    [HttpPut("catalog/{kind}")] public Task<IActionResult> CatalogSave(string kind, [FromBody] JsonObject? body, CancellationToken ct) => Run(a => body == null ? Task.FromResult(AdminResult.Fail(400, "Thiếu nội dung.")) : _catalog.UpsertAsync(a, kind, body, ct));
    [HttpPost("catalog/{kind}/{id}/active")] public Task<IActionResult> CatalogActive(string kind, string id, [FromBody] ActiveRequest? req, CancellationToken ct) => Run(a => _catalog.SetActiveAsync(a, kind, id, req?.Active ?? true, ct));
    [HttpDelete("catalog/{kind}/{id}")] public Task<IActionResult> CatalogDelete(string kind, string id, CancellationToken ct) => Run(a => _catalog.DeleteAsync(a, kind, id, ct));

    // ---- Thông báo hệ thống ----
    [HttpGet("announcements")] public Task<IActionResult> Announcements(CancellationToken ct) => Run(_ => _admin.ListAnnouncementsAsync(ct));
    [HttpPost("announcements")] public Task<IActionResult> CreateAnnouncement([FromBody] AnnouncementInput? input, CancellationToken ct) => Run(a => _admin.CreateAnnouncementAsync(a, input ?? new AnnouncementInput(), ct));
    [HttpDelete("announcements/{id}")] public Task<IActionResult> DeleteAnnouncement(string id, CancellationToken ct) => Run(a => _admin.DeleteAnnouncementAsync(a, id, ct));

    // ---- Cấu hình hệ thống / giao diện (chỉ Admin) ----
    [Authorize(Policy = "AdminOnly")] [HttpGet("settings")] public Task<IActionResult> GetSettings(CancellationToken ct) => Run(_ => _admin.GetSettingsAsync(false, ct));
    [Authorize(Policy = "AdminOnly")] [HttpPut("settings")] public Task<IActionResult> PutSettings([FromBody] JsonObject? body, CancellationToken ct) => Run(a => body == null ? Task.FromResult(AdminResult.Fail(400, "Thiếu nội dung.")) : _admin.PutSettingsAsync(a, body, ct));

    // ---- Nhật ký hoạt động (chỉ Admin) ----
    [Authorize(Policy = "AdminOnly")] [HttpGet("audit")]
    public async Task<IActionResult> AuditLog(string? action, string? actor, DateTime? from, DateTime? to, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        var (items, total) = await _audit.QueryAsync(action, actor, from, to, page, pageSize, ct);
        return Json(new { total, page, pageSize, items = items.Select(a => new { a.Id, at = a.At, actor = a.ActorEmail, action = a.Action, entityType = a.EntityType, entityId = a.EntityId, detail = a.Detail, ip = a.Ip }) });
    }

    // ---- Sao lưu / khôi phục (chỉ Admin) ----
    [Authorize(Policy = "AdminOnly")] [HttpGet("backups")] public Task<IActionResult> Backups(CancellationToken ct) => Run(_ => _backup.ListAsync(ct));
    [Authorize(Policy = "AdminOnly")] [HttpPost("backups")] public Task<IActionResult> CreateBackup([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] BackupRequest? req, CancellationToken ct) => Run(a => _backup.CreateAsync(a, req?.Note, ct));
    [Authorize(Policy = "AdminOnly")] [HttpPost("backups/database")] public Task<IActionResult> CreateDatabaseBackup([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] BackupRequest? req, CancellationToken ct) => Run(a => _backup.CreateDatabaseBackupAsync(a, req?.Note, ct));
    [Authorize(Policy = "AdminOnly")] [HttpPost("backups/upload")] [RequestSizeLimit(21_000_000)]
    public Task<IActionResult> UploadBackup(IFormFile? file, CancellationToken ct) => Run(async a => file == null ? AdminResult.Fail(400, "Chưa chọn tệp.") : await _backup.UploadAsync(a, file.OpenReadStream(), file.Length, "Tải lên: " + Path.GetFileName(file.FileName), ct));
    [Authorize(Policy = "AdminOnly")] [HttpPost("backups/{id:long}/restore")] public Task<IActionResult> Restore(long id, CancellationToken ct) => Run(a => _backup.RestoreAsync(a, id, ct));
    [Authorize(Policy = "AdminOnly")] [HttpDelete("backups/{id:long}")] public Task<IActionResult> DeleteBackup(long id, CancellationToken ct) => Run(a => _backup.DeleteAsync(a, id, ct));
    [Authorize(Policy = "AdminOnly")] [HttpGet("backups/{id:long}/download")]
    public async Task<IActionResult> Download(long id, CancellationToken ct)
    {
        var rec = await _backup.FindAsync(id, ct); if (rec == null) return NotFound();
        var path = _backup.PathOf(rec); if (!System.IO.File.Exists(path)) return NotFound();
        return PhysicalFile(path, "application/json", rec.FileName);
    }
}

/// <summary>Cấu hình công khai (tên, giao diện, đăng ký mở/đóng…) cho mọi trang kể cả trang đăng nhập. Chỉ khóa tiền tố site./ui.</summary>
public class SiteController : Controller
{
    private readonly IAdminService _admin;
    public SiteController(IAdminService admin) => _admin = admin;
    [AllowAnonymous] [HttpGet("/api/site")] [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Site(CancellationToken ct) => Json((await _admin.GetSettingsAsync(true, ct)).Data);
}
