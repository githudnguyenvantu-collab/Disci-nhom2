using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Audit;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Admin;

public sealed class CreateUserInput { public string? Name { get; set; } public string? Email { get; set; } public string? Role { get; set; } public string? Password { get; set; } }
public sealed class AnnouncementInput { public string? Id { get; set; } public string? Title { get; set; } public string? Body { get; set; } public string? Audience { get; set; } public string? Kind { get; set; } public string? Link { get; set; } public DateTime? ExpiresAt { get; set; } }

public interface IAdminService
{
    Task<AdminResult> DashboardAsync(CancellationToken ct = default);
    Task<AdminResult> SnapshotAsync(Actor actor, CancellationToken ct = default);
    // Tài khoản & vai trò
    Task<AdminResult> ListUsersAsync(string? q, string? role, string? status, int page, int pageSize, CancellationToken ct = default);
    Task<AdminResult> CreateUserAsync(Actor actor, CreateUserInput input, CancellationToken ct = default);
    Task<AdminResult> SetRoleAsync(Actor actor, string userId, string role, CancellationToken ct = default);
    Task<AdminResult> SetActiveAsync(Actor actor, string userId, bool active, CancellationToken ct = default);
    Task<AdminResult> ResetPasswordAsync(Actor actor, string userId, CancellationToken ct = default);
    Task<AdminResult> DeleteUserAsync(Actor actor, string userId, CancellationToken ct = default);
    // Kiểm duyệt
    Task<AdminResult> ListReportsAsync(string? status, int page, int pageSize, CancellationToken ct = default);
    Task<AdminResult> ResolveReportAsync(Actor actor, string reportId, string action, string? note, CancellationToken ct = default);
    Task<AdminResult> SetPostHiddenAsync(Actor actor, string postClientId, bool hidden, string? reason, CancellationToken ct = default);
    Task<AdminResult> DeletePostAsync(Actor actor, string postClientId, CancellationToken ct = default);
    Task<AdminResult> SetCommentHiddenAsync(Actor actor, string commentClientId, bool hidden, CancellationToken ct = default);
    Task<AdminResult> DeleteCommentAsync(Actor actor, string commentClientId, CancellationToken ct = default);
    Task<AdminResult> DeleteStoryAsync(Actor actor, string storyClientId, CancellationToken ct = default);
    Task<AdminResult> ListPostsAsync(string? q, bool? hidden, int page, int pageSize, CancellationToken ct = default);
    // Thông báo hệ thống
    Task<AdminResult> ListAnnouncementsAsync(CancellationToken ct = default);
    Task<AdminResult> CreateAnnouncementAsync(Actor actor, AnnouncementInput input, CancellationToken ct = default);
    Task<AdminResult> DeleteAnnouncementAsync(Actor actor, string id, CancellationToken ct = default);
    // Cấu hình hệ thống / giao diện
    Task<AdminResult> GetSettingsAsync(bool publicOnly, CancellationToken ct = default);
    Task<AdminResult> PutSettingsAsync(Actor actor, JsonObject settings, CancellationToken ct = default);
}

public sealed class AdminService : IAdminService
{
    private static readonly Regex SettingKey = new(@"^(site|system|upload|ui)\.[A-Za-z0-9_.\-]{1,60}$", RegexOptions.Compiled);
    private static readonly string[] PublicPrefixes = { "site.", "ui." };            // tên, giao diện, đăng ký mở/đóng... – hiển thị cho mọi người
    private const int MaxSettingBytes = 200_000;
    private readonly ApplicationDbContext _db; private readonly UserManager<ApplicationUser> _users; private readonly IAuditService _audit; private readonly IAccountDeletionService _deletion; private readonly ISiteSettings _site;

    public AdminService(ApplicationDbContext db, UserManager<ApplicationUser> users, IAuditService audit, IAccountDeletionService deletion, ISiteSettings site) { _db = db; _users = users; _audit = audit; _deletion = deletion; _site = site; }

    private Task Log(Actor a, string action, string? type, string? id, string? detail, CancellationToken ct) => _audit.LogAsync(a.Id, a.Email, action, type, id, detail, a.Ip, ct);
    private static long Ms(DateTime d) => new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)).ToUnixTimeMilliseconds();

    // ===================== THỐNG KÊ =====================
    public async Task<AdminResult> DashboardAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow; var d7 = now.AddDays(-7);
        var totalUsers = await _db.Users.CountAsync(u => u.DeletedAt == null, ct);
        var data = new
        {
            users = new { total = totalUsers, active = await _db.Users.CountAsync(u => u.DeletedAt == null && u.IsActive, ct), locked = await _db.Users.CountAsync(u => u.DeletedAt == null && !u.IsActive, ct), demo = await _db.Users.CountAsync(u => u.IsDemo, ct), newLast7Days = await _db.Users.CountAsync(u => u.CreatedAt >= d7, ct) },
            content = new { posts = await _db.Posts.CountAsync(ct), hiddenPosts = await _db.Posts.CountAsync(p => p.Hidden, ct), comments = await _db.Comments.CountAsync(ct), groups = await _db.Groups.CountAsync(ct), challenges = await _db.Challenges.CountAsync(c => c.IsActive, ct) },
            moderation = new { openReports = await _db.Reports.CountAsync(r => r.Status == "open", ct) },
            training = new { sessions = await _db.WorkoutSessions.CountAsync(s => s.Status == "done", ct), sessionsLast7Days = await _db.WorkoutSessions.CountAsync(s => s.Status == "done" && s.DoneOn >= DateOnly.FromDateTime(d7), ct), exercises = await _db.Exercises.CountAsync(e => e.IsActive, ct) },
            commerce = new { products = await _db.Products.CountAsync(p => p.IsActive, ct), orders = await _db.Orders.CountAsync(ct) },
            storage = new { mediaFiles = await _db.MediaAssets.CountAsync(ct), mediaBytes = await _db.MediaAssets.SumAsync(m => (long?)m.SizeBytes, ct) ?? 0 },
            recentActivity = (await _db.AuditLogs.AsNoTracking().OrderByDescending(a => a.At).Take(8).Select(a => new { at = a.At, actor = a.ActorEmail, action = a.Action, detail = a.Detail }).ToListAsync(ct))
        };
        return AdminResult.Success(data);
    }

    // ===================== TÀI KHOẢN & VAI TRÒ =====================
    private async Task<int> ActiveAdminCountAsync(CancellationToken ct)
        => (await _users.GetUsersInRoleAsync(Roles.Admin)).Count(u => u.IsActive && u.DeletedAt == null);

    private static string PrimaryRole(IEnumerable<string> roles) { var s = roles.ToHashSet(); return s.Contains(Roles.Admin) ? Roles.Admin : s.Contains(Roles.Editor) ? Roles.Editor : s.Contains(Roles.Moderator) ? Roles.Moderator : Roles.User; }

    public async Task<AdminResult> ListUsersAsync(string? q, string? role, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 100); page = Math.Max(1, page);
        var users = _db.Users.AsNoTracking().Where(u => u.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(q)) { q = q.Trim(); users = users.Where(u => u.FullName.Contains(q) || (u.Email != null && u.Email.Contains(q))); }
        if (status == "active") users = users.Where(u => u.IsActive); else if (status == "locked") users = users.Where(u => !u.IsActive); else if (status == "demo") users = users.Where(u => u.IsDemo);
        if (!string.IsNullOrEmpty(role) && Roles.All.Contains(role))
        {
            var rid = await _db.Roles.Where(r => r.Name == role).Select(r => r.Id).FirstOrDefaultAsync(ct);
            users = role == Roles.User ? users.Where(u => !_db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId != rid)) : users.Where(u => _db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == rid));
        }
        var total = await users.CountAsync(ct);
        var page_ = await users.OrderByDescending(u => u.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new { u.Id, u.FullName, u.Email, u.IsActive, u.IsDemo, u.EmailConfirmed, u.CreatedAt, u.LastLoginAt, u.MustChangePassword }).ToListAsync(ct);
        var ids = page_.Select(u => u.Id).ToList();
        var roleRows = await (from ur in _db.UserRoles where ids.Contains(ur.UserId) join r in _db.Roles on ur.RoleId equals r.Id select new { ur.UserId, r.Name }).ToListAsync(ct);
        var rolesBy = roleRows.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.Select(x => x.Name ?? "").ToList());
        var posts = await _db.Posts.Where(p => ids.Contains(p.UserId)).GroupBy(p => p.UserId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        var sess = await _db.WorkoutSessions.Where(s => ids.Contains(s.UserId) && s.Status == "done").GroupBy(s => s.UserId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N, ct);
        var items = page_.Select(u => new { id = u.Id, name = u.FullName, email = u.Email, role = PrimaryRole(rolesBy.GetValueOrDefault(u.Id) ?? new List<string>()), active = u.IsActive, demo = u.IsDemo, emailConfirmed = u.EmailConfirmed, mustChangePw = u.MustChangePassword, createdAt = Ms(u.CreatedAt), lastLoginAt = u.LastLoginAt == null ? (long?)null : Ms(u.LastLoginAt.Value), posts = posts.GetValueOrDefault(u.Id), sessions = sess.GetValueOrDefault(u.Id) });
        return AdminResult.Success(new { items, total, page, pageSize });
    }

    private static readonly Regex EmailRx = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    /// <summary>Mật khẩu tạm 12 ký tự, luôn có chữ hoa, chữ thường và chữ số (bỏ ký tự dễ nhầm như 0/O, 1/l).</summary>
    public static string GenerateTempPassword()
    {
        const string up = "ABCDEFGHJKLMNPQRSTUVWXYZ", lo = "abcdefghijkmnpqrstuvwxyz", dg = "23456789"; var all = up + lo + dg;
        var chars = new List<char> { up[RandomNumberGenerator.GetInt32(up.Length)], lo[RandomNumberGenerator.GetInt32(lo.Length)], dg[RandomNumberGenerator.GetInt32(dg.Length)] };
        while (chars.Count < 12) chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        return new string(chars.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray());
    }

    public async Task<AdminResult> CreateUserAsync(Actor actor, CreateUserInput input, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được tạo tài khoản.");
        var name = (input.Name ?? "").Trim(); var email = (input.Email ?? "").Trim(); var role = string.IsNullOrEmpty(input.Role) ? Roles.User : input.Role!;
        if (name.Length is < 2 or > 120) return AdminResult.Fail(422, "Họ tên cần từ 2 đến 120 ký tự.");
        if (!EmailRx.IsMatch(email) || email.Length > 254) return AdminResult.Fail(422, "Email chưa đúng định dạng.");
        if (!Roles.All.Contains(role)) return AdminResult.Fail(422, "Vai trò không hợp lệ.");
        if (await _users.FindByEmailAsync(email) != null) return AdminResult.Fail(409, "Email này đã được đăng ký.");
        var generated = string.IsNullOrEmpty(input.Password); var pw = generated ? GenerateTempPassword() : input.Password!;
        var u = new ApplicationUser { UserName = email, Email = email, FullName = name, EmailConfirmed = true, MustChangePassword = true };
        var r = await _users.CreateAsync(u, pw);
        if (!r.Succeeded) return AdminResult.Fail(422, "Mật khẩu cần ≥ 8 ký tự, gồm chữ và số.");
        await _users.AddToRoleAsync(u, role);
        _db.UserProfiles.Add(new UserProfile { UserId = u.Id }); await _db.SaveChangesAsync(ct);
        await Log(actor, "admin.user.create", "User", u.Id, $"{email} ({role})", ct);
        return AdminResult.Success(new { ok = true, id = u.Id, role, tempPassword = generated ? pw : null });   // mật khẩu tạm chỉ hiển thị MỘT lần cho quản trị viên
    }

    public async Task<AdminResult> SetRoleAsync(Actor actor, string userId, string role, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được đổi vai trò.");
        if (!Roles.All.Contains(role)) return AdminResult.Fail(422, "Vai trò không hợp lệ.");
        var u = await _users.FindByIdAsync(userId); if (u == null || u.DeletedAt != null) return AdminResult.Fail(404, "Không tìm thấy tài khoản.");
        var current = await _users.GetRolesAsync(u);
        if (current.Contains(Roles.Admin) && role != Roles.Admin && u.IsActive && await ActiveAdminCountAsync(ct) <= 1) return AdminResult.Fail(409, "Không thể hạ quyền quản trị viên cuối cùng của hệ thống.");
        await _users.RemoveFromRolesAsync(u, current); await _users.AddToRoleAsync(u, role);
        await _users.UpdateSecurityStampAsync(u);      // buộc phiên đăng nhập cũ của tài khoản này được kiểm tra lại quyền
        await Log(actor, "admin.user.role", "User", u.Id, $"{PrimaryRole(current)} → {role}", ct);
        return AdminResult.Success(new { ok = true, role });
    }

    public async Task<AdminResult> SetActiveAsync(Actor actor, string userId, bool active, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Không có quyền.");
        if (userId == actor.Id) return AdminResult.Fail(409, "Bạn không thể tự khóa tài khoản của mình.");
        var u = await _users.FindByIdAsync(userId); if (u == null || u.DeletedAt != null) return AdminResult.Fail(404, "Không tìm thấy tài khoản.");
        var roles = await _users.GetRolesAsync(u); var targetIsStaff = roles.Any(r => r is Roles.Admin or Roles.Editor or Roles.Moderator);
        if (targetIsStaff && !actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được khóa/mở khóa tài khoản nhân sự.");
        if (!active && roles.Contains(Roles.Admin) && u.IsActive && await ActiveAdminCountAsync(ct) <= 1) return AdminResult.Fail(409, "Không thể khóa quản trị viên cuối cùng của hệ thống.");
        u.IsActive = active; await _users.UpdateAsync(u); await _users.UpdateSecurityStampAsync(u);
        await Log(actor, active ? "admin.user.unlock" : "admin.user.lock", "User", u.Id, u.Email, ct);
        return AdminResult.Success(new { ok = true, active });
    }

    public async Task<AdminResult> ResetPasswordAsync(Actor actor, string userId, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được đặt lại mật khẩu.");
        var u = await _users.FindByIdAsync(userId); if (u == null || u.DeletedAt != null) return AdminResult.Fail(404, "Không tìm thấy tài khoản.");
        var pw = GenerateTempPassword(); var token = await _users.GeneratePasswordResetTokenAsync(u);
        var r = await _users.ResetPasswordAsync(u, token, pw); if (!r.Succeeded) return AdminResult.Fail(500, "Không đặt lại được mật khẩu.");
        u.MustChangePassword = true; await _users.UpdateAsync(u); await _users.UpdateSecurityStampAsync(u);
        await Log(actor, "admin.user.password.reset", "User", u.Id, u.Email, ct);                 // KHÔNG ghi mật khẩu vào nhật ký
        return AdminResult.Success(new { ok = true, tempPassword = pw });
    }

    public async Task<AdminResult> DeleteUserAsync(Actor actor, string userId, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được xóa tài khoản.");
        if (userId == actor.Id) return AdminResult.Fail(409, "Hãy dùng chức năng xóa tài khoản trong Hồ sơ để tự xóa tài khoản của bạn.");
        var u = await _users.FindByIdAsync(userId); if (u == null || u.DeletedAt != null) return AdminResult.Fail(404, "Không tìm thấy tài khoản.");
        if (await _users.IsInRoleAsync(u, Roles.Admin) && u.IsActive && await ActiveAdminCountAsync(ct) <= 1) return AdminResult.Fail(409, "Không thể xóa quản trị viên cuối cùng của hệ thống.");
        var email = u.Email; var res = await _deletion.DeleteAsync(u, ct);
        if (!res.Succeeded) return AdminResult.Fail(500, "Không xóa được tài khoản.");
        await Log(actor, "admin.user.delete", "User", userId, email, ct);
        return AdminResult.Success(new { ok = true });
    }

    // ===================== KIỂM DUYỆT =====================
    public async Task<AdminResult> ListReportsAsync(string? status, int page, int pageSize, CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 100); page = Math.Max(1, page);
        var q = _db.Reports.AsNoTracking().AsQueryable(); if (!string.IsNullOrEmpty(status)) q = q.Where(r => r.Status == status);
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(r => r.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new { id = r.Id, reason = r.Reason, status = r.Status, at = r.CreatedAt, reporter = _db.Users.Where(u => u.Id == r.ReporterId).Select(u => u.FullName).FirstOrDefault(),
                post = r.Post == null ? null : new { id = r.Post.ClientId, author = r.Post.User.FullName, authorId = r.Post.UserId, text = r.Post.Body.Length > 200 ? r.Post.Body.Substring(0, 200) : r.Post.Body, hidden = r.Post.Hidden } }).ToListAsync(ct);
        return AdminResult.Success(new { items = rows, total, page, pageSize });
    }

    public async Task<AdminResult> ResolveReportAsync(Actor actor, string reportId, string action, string? note, CancellationToken ct = default)
    {
        if (!(actor.IsAdmin || actor.IsModerator)) return AdminResult.Fail(403, "Chỉ Admin/Moderator được xử lý báo cáo.");
        var numeric = long.TryParse(reportId, out var rid) ? rid : -1;
        var r = await _db.Reports.Include(x => x.Post).FirstOrDefaultAsync(x => x.ClientId == reportId || x.Id == numeric, ct); if (r == null) return AdminResult.Fail(404, "Không tìm thấy báo cáo.");
        if (action is not ("dismiss" or "hide" or "delete" or "resolve")) return AdminResult.Fail(422, "Hành động không hợp lệ (dismiss | hide | delete | resolve).");
        var postClientId = r.Post?.ClientId;
        if (action == "hide" && postClientId != null) { var res = await SetPostHiddenAsync(actor, postClientId, true, note ?? r.Reason, ct); if (!res.Ok) return res; }
        r.Status = action == "dismiss" ? "dismissed" : "resolved"; r.HandledBy = actor.Id;
        if (action == "delete" && postClientId != null) { await _db.SaveChangesAsync(ct); var res = await DeletePostAsync(actor, postClientId, ct); if (!res.Ok) return res; }
        else await _db.SaveChangesAsync(ct);
        await Log(actor, "admin.report." + action, "Report", reportId, postClientId, ct);
        return AdminResult.Success(new { ok = true, status = r.Status });
    }

    public async Task<AdminResult> ListPostsAsync(string? q, bool? hidden, int page, int pageSize, CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 100); page = Math.Max(1, page);
        var posts = _db.Posts.AsNoTracking().Where(p => p.ClientId != null);
        if (hidden != null) posts = posts.Where(p => p.Hidden == hidden);
        if (!string.IsNullOrWhiteSpace(q)) { q = q.Trim(); posts = posts.Where(p => p.Body.Contains(q) || p.User.FullName.Contains(q)); }
        var total = await posts.CountAsync(ct);
        var rows = await posts.OrderByDescending(p => p.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(p => new { id = p.ClientId, author = p.User.FullName, authorId = p.UserId, text = p.Body.Length > 300 ? p.Body.Substring(0, 300) : p.Body, visibility = p.Visibility, hidden = p.Hidden, at = p.CreatedAt, comments = p.Comments.Count, reports = _db.Reports.Count(r => r.PostId == p.Id) }).ToListAsync(ct);
        return AdminResult.Success(new { items = rows, total, page, pageSize });
    }

    public async Task<AdminResult> SetPostHiddenAsync(Actor actor, string postClientId, bool hidden, string? reason, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Chỉ Nhân sự quản trị (Admin/Editor/Moderator) được ẩn/hiện bài viết.");
        var p = await _db.Posts.FirstOrDefaultAsync(x => x.ClientId == postClientId, ct); if (p == null) return AdminResult.Fail(404, "Không tìm thấy bài viết.");
        p.Hidden = hidden;
        if (hidden) _db.Notifications.Add(new Notification { ClientId = "n" + Guid.NewGuid().ToString("N")[..12], UserId = p.UserId, FromUserId = actor.Id, Type = "mod", PostClientId = postClientId, Body = "Bài viết của bạn đã bị ẩn do vi phạm quy tắc cộng đồng." + (string.IsNullOrWhiteSpace(reason) ? "" : " Lý do: " + (reason!.Length > 200 ? reason[..200] : reason)) });
        await _db.SaveChangesAsync(ct);
        await Log(actor, hidden ? "admin.post.hide" : "admin.post.unhide", "Post", postClientId, reason, ct);
        return AdminResult.Success(new { ok = true, hidden });
    }

    public async Task<AdminResult> DeletePostAsync(Actor actor, string postClientId, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Chỉ Nhân sự quản trị (Admin/Editor/Moderator) được xóa bài viết.");
        var p = await _db.Posts.FirstOrDefaultAsync(x => x.ClientId == postClientId, ct); if (p == null) return AdminResult.Fail(404, "Không tìm thấy bài viết.");
        _db.Reports.RemoveRange(await _db.Reports.Where(r => r.PostId == p.Id).ToListAsync(ct)); _db.Posts.Remove(p); await _db.SaveChangesAsync(ct);   // bình luận/thích/lưu/chia sẻ xóa theo cascade
        await Log(actor, "admin.post.delete", "Post", postClientId, null, ct);
        return AdminResult.Success(new { ok = true });
    }

    public async Task<AdminResult> SetCommentHiddenAsync(Actor actor, string commentClientId, bool hidden, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Chỉ Nhân sự quản trị (Admin/Editor/Moderator) được ẩn/hiện bình luận.");
        var c = await _db.Comments.FirstOrDefaultAsync(x => x.ClientId == commentClientId, ct); if (c == null) return AdminResult.Fail(404, "Không tìm thấy bình luận.");
        c.Hidden = hidden; await _db.SaveChangesAsync(ct); await Log(actor, hidden ? "admin.comment.hide" : "admin.comment.unhide", "Comment", commentClientId, null, ct);
        return AdminResult.Success(new { ok = true, hidden });
    }

    public async Task<AdminResult> DeleteCommentAsync(Actor actor, string commentClientId, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Chỉ Nhân sự quản trị (Admin/Editor/Moderator) được xóa bình luận.");
        var c = await _db.Comments.FirstOrDefaultAsync(x => x.ClientId == commentClientId, ct); if (c == null) return AdminResult.Fail(404, "Không tìm thấy bình luận.");
        _db.Comments.Remove(c); await _db.SaveChangesAsync(ct); await Log(actor, "admin.comment.delete", "Comment", commentClientId, null, ct);
        return AdminResult.Success(new { ok = true });
    }

    public async Task<AdminResult> DeleteStoryAsync(Actor actor, string storyClientId, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Chỉ nhân sự quản trị được xóa story.");
        var s = await _db.Stories.FirstOrDefaultAsync(x => x.ClientId == storyClientId, ct); if (s == null) return AdminResult.Fail(404, "Không tìm thấy story.");
        _db.Stories.Remove(s); await _db.SaveChangesAsync(ct); await Log(actor, "admin.story.delete", "Story", storyClientId, null, ct);
        return AdminResult.Success(new { ok = true });
    }

    // ===================== THÔNG BÁO HỆ THỐNG =====================
    private static readonly Regex AudienceRx = new(@"^(all|role:(admin|editor|moderator|user)|user:[A-Za-z0-9\-]{1,60})$", RegexOptions.Compiled);
    private static readonly Regex LinkRx = new(@"^[A-Za-z0-9_\-./?=&#%]{0,200}$", RegexOptions.Compiled);          // không có ':' nên không thể là javascript:/http:
    private static readonly Regex KindRx = new(@"^[a-z_]{2,20}$", RegexOptions.Compiled);
    private static readonly Regex ClientIdRx = new(@"^[A-Za-z0-9_\-]{4,40}$", RegexOptions.Compiled);

    private static object AnnDto(Announcement a) => new { id = a.ClientId ?? "an" + a.Id, title = a.Title, text = a.Body ?? "", body = a.Body, audience = a.Audience, kind = a.Kind, go = a.Link ?? "", active = a.IsActive, at = Ms(a.CreatedAt), createdAt = a.CreatedAt, until = a.ExpiresAt == null ? 0L : Ms(a.ExpiresAt.Value), expiresAt = a.ExpiresAt };

    public async Task<AdminResult> ListAnnouncementsAsync(CancellationToken ct = default)
        => AdminResult.Success((await _db.Announcements.AsNoTracking().OrderByDescending(a => a.CreatedAt).Take(200).ToListAsync(ct)).Select(AnnDto));

    public async Task<AdminResult> CreateAnnouncementAsync(Actor actor, AnnouncementInput input, CancellationToken ct = default)
    {
        if (!(actor.IsAdmin || actor.IsEditor)) return AdminResult.Fail(403, "Chỉ Admin/Editor được đăng thông báo hệ thống.");
        var title = (input.Title ?? "").Trim(); if (title.Length is 0 or > 150) return AdminResult.Fail(422, "Tiêu đề cần từ 1 đến 150 ký tự.");
        var body = (input.Body ?? "").Trim(); if (body.Length > 1000) body = body[..1000];
        var aud = string.IsNullOrEmpty(input.Audience) ? "all" : input.Audience!; if (!AudienceRx.IsMatch(aud)) return AdminResult.Fail(422, "Đối tượng nhận thông báo không hợp lệ.");
        var kind = string.IsNullOrEmpty(input.Kind) ? "info" : input.Kind!; if (!KindRx.IsMatch(kind)) return AdminResult.Fail(422, "Kiểu hiển thị không hợp lệ.");
        var link = (input.Link ?? "").Trim(); if (!LinkRx.IsMatch(link) || link.StartsWith("//") || link.Contains("..")) return AdminResult.Fail(422, "Liên kết chỉ được là trang nội bộ (ví dụ community.html).");
        var cid = input.Id != null && ClientIdRx.IsMatch(input.Id) && !await _db.Announcements.AnyAsync(x => x.ClientId == input.Id, ct) ? input.Id : "an" + Guid.NewGuid().ToString("N")[..12];
        var a = new Announcement { ClientId = cid, Title = title, Body = body, Audience = aud, Kind = kind, Link = link.Length == 0 ? null : link, ExpiresAt = input.ExpiresAt }; _db.Announcements.Add(a); await _db.SaveChangesAsync(ct);
        await Log(actor, "admin.announcement.create", "Announcement", cid, title + " → " + aud, ct);
        return AdminResult.Success(new { ok = true, id = cid });
    }

    public async Task<AdminResult> DeleteAnnouncementAsync(Actor actor, string id, CancellationToken ct = default)
    {
        if (!(actor.IsAdmin || actor.IsEditor)) return AdminResult.Fail(403, "Chỉ Admin/Editor được xóa thông báo hệ thống.");
        var numeric = long.TryParse(id, out var n) ? n : -1;
        var a = await _db.Announcements.FirstOrDefaultAsync(x => x.ClientId == id || x.Id == numeric, ct); if (a == null) return AdminResult.Fail(404, "Không tìm thấy thông báo.");
        _db.Announcements.Remove(a); await _db.SaveChangesAsync(ct); await Log(actor, "admin.announcement.delete", "Announcement", id, a.Title, ct);
        return AdminResult.Success(new { ok = true });
    }

    // ===================== ẢNH CHỤP QUẢN TRỊ (cho giao diện Admin) =====================
    /// <summary>Một lần tải đủ dữ liệu để vẽ các tab Người dùng, Nội dung, Báo cáo, Thông báo, Nhật ký, Sao lưu. Nhật ký và sao lưu chỉ trả cho Admin.</summary>
    public async Task<AdminResult> SnapshotAsync(Actor actor, CancellationToken ct = default)
    {
        if (!actor.IsStaff) return AdminResult.Fail(403, "Không có quyền.");
        var users = await _db.Users.AsNoTracking().Where(u => u.DeletedAt == null).OrderByDescending(u => u.CreatedAt).Take(500)
            .Select(u => new { u.Id, u.FullName, u.Email, u.IsActive, u.IsDemo, u.EmailConfirmed, u.CreatedAt, u.LastLoginAt, u.MustChangePassword }).ToListAsync(ct);
        var ids = users.Select(u => u.Id).ToList();
        var roleRows = await (from ur in _db.UserRoles where ids.Contains(ur.UserId) join r in _db.Roles on ur.RoleId equals r.Id select new { ur.UserId, r.Name }).ToListAsync(ct);
        var rolesBy = roleRows.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.Select(x => x.Name ?? "").ToList());
        var today = Engine.DisciEngine.TodayStr(DateTimeOffset.UtcNow); var since = DateOnly.ParseExact(Engine.DisciEngine.AddDays(today, -120), "yyyy-MM-dd");
        var agg = await _db.WorkoutSessions.AsNoTracking().Where(s => s.Status == "done" && ids.Contains(s.UserId)).GroupBy(s => s.UserId).Select(g => new { g.Key, N = g.Count(), Min = g.Sum(x => x.Minutes) }).ToDictionaryAsync(x => x.Key, ct);
        var recent = await _db.WorkoutSessions.AsNoTracking().Where(s => s.Status == "done" && s.DoneOn >= since && ids.Contains(s.UserId)).Select(s => new { s.UserId, s.DoneOn }).Distinct().ToListAsync(ct);
        var datesBy = recent.GroupBy(x => x.UserId).ToDictionary(g => g.Key, g => g.Select(x => new Engine.SessionRecord { Date = x.DoneOn.ToString("yyyy-MM-dd"), Status = "done" }).ToList());
        var usersJ = new JsonArray();
        foreach (var u in users)
        {
            var st = Engine.DisciEngine.StreakOf(datesBy.GetValueOrDefault(u.Id) ?? new List<Engine.SessionRecord>(), today); var a = agg.GetValueOrDefault(u.Id); int n = a?.N ?? 0;
            usersJ.Add(new JsonObject { ["id"] = u.Id, ["name"] = u.FullName, ["email"] = u.Email, ["role"] = BootService.ClientRole(rolesBy.GetValueOrDefault(u.Id) ?? new List<string>()), ["locked"] = !u.IsActive, ["demo"] = u.IsDemo, ["emailConfirmed"] = u.EmailConfirmed, ["mustChangePw"] = u.MustChangePassword,
                ["createdAt"] = Ms(u.CreatedAt), ["lastLogin"] = u.LastLoginAt == null ? 0 : Ms(u.LastLoginAt.Value), ["stats"] = new JsonObject { ["streak"] = st.Current, ["sessions"] = n, ["minutes"] = a?.Min ?? 0, ["points"] = n * 20 + st.Current * 10 } });
        }

        var posts = await _db.Posts.AsNoTracking().Where(p => p.ClientId != null).OrderByDescending(p => p.CreatedAt).Take(300).Select(p => new { p.Id, p.ClientId, p.UserId, p.RawJson, p.Hidden, p.CreatedAt }).ToListAsync(ct);
        var pids = posts.Select(p => p.Id).ToList(); var cid = posts.ToDictionary(p => p.Id, p => p.ClientId!);
        var postsJ = new JsonArray();
        foreach (var p in posts) { if (JsonNode.Parse(p.RawJson) is JsonObject o) { o["by"] = p.UserId; o["hidden"] = p.Hidden; postsJ.Add(o); } }
        var commentsJ = new JsonObject();
        foreach (var g in (await _db.Comments.AsNoTracking().Where(c => pids.Contains(c.PostId)).OrderBy(c => c.CreatedAt).ToListAsync(ct)).GroupBy(c => c.PostId))
            commentsJ[cid[g.Key]] = new JsonArray(g.Select(c => (JsonNode?)new JsonObject { ["id"] = c.ClientId ?? "c" + c.Id, ["by"] = c.UserId, ["text"] = c.Body, ["at"] = Ms(c.CreatedAt), ["hidden"] = c.Hidden }).ToArray());
        var likesJ = new JsonObject();
        foreach (var g in (await _db.PostLikes.AsNoTracking().Where(l => pids.Contains(l.PostId)).Select(l => new { l.PostId, l.UserId }).ToListAsync(ct)).GroupBy(l => l.PostId)) likesJ[cid[g.Key]] = new JsonArray(g.Select(x => (JsonNode?)JsonValue.Create(x.UserId)).ToArray());

        var reportsJ = new JsonArray();
        foreach (var r in await _db.Reports.AsNoTracking().Include(r => r.Post).OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync(ct))
            reportsJ.Add(new JsonObject { ["id"] = r.ClientId ?? "r" + r.Id, ["postId"] = r.Post?.ClientId, ["by"] = r.ReporterId, ["reason"] = r.Reason, ["at"] = Ms(r.CreatedAt), ["st"] = r.Status });

        var annJ = new JsonArray(); foreach (var a in await _db.Announcements.AsNoTracking().OrderByDescending(a => a.CreatedAt).Take(200).ToListAsync(ct)) annJ.Add(JsonSerializer.SerializeToNode(AnnDto(a)));

        var storiesJ = new JsonArray();
        foreach (var st in await _db.Stories.AsNoTracking().Where(x => x.ExpiresAt > DateTime.UtcNow).OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct))
            storiesJ.Add(new JsonObject { ["id"] = st.ClientId ?? "s" + st.Id, ["by"] = st.UserId, ["text"] = st.Text ?? "", ["img"] = st.MediaUrl ?? "", ["hue"] = st.Hue ?? 0, ["at"] = Ms(st.CreatedAt) });
        var snap = new JsonObject { ["ok"] = true, ["me"] = actor.Id, ["stories"] = storiesJ, ["users"] = usersJ, ["posts"] = postsJ, ["comments"] = commentsJ, ["likes"] = likesJ, ["reports"] = reportsJ, ["announcements"] = annJ };
        if (actor.IsAdmin)
        {
            var auditJ = new JsonArray();
            foreach (var l in await _db.AuditLogs.AsNoTracking().OrderByDescending(l => l.At).Take(300).ToListAsync(ct))
                auditJ.Add(new JsonObject { ["id"] = "a" + l.Id, ["at"] = Ms(l.At), ["by"] = l.ActorId, ["name"] = l.ActorEmail ?? "Hệ thống", ["role"] = "", ["action"] = l.Action, ["target"] = l.EntityId ?? l.EntityType ?? "", ["detail"] = l.Detail ?? "", ["ip"] = l.Ip });
            snap["audit"] = auditJ;
            snap["backups"] = JsonSerializer.SerializeToNode(await _db.BackupRecords.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(50).Select(b => new { id = b.Id, file = b.FileName, size = b.SizeBytes, at = b.CreatedAt, note = b.Note }).ToListAsync(ct));
        }
        if (actor.IsAdmin || actor.IsEditor) snap["catalog"] = await CatalogDto.AllAsync(_db, true, ct);
        return AdminResult.Success(snap);
    }

    // ===================== CẤU HÌNH =====================
    public async Task<AdminResult> GetSettingsAsync(bool publicOnly, CancellationToken ct = default)
    {
        var rows = await _db.SystemSettings.AsNoTracking().ToListAsync(ct); var o = new JsonObject();
        foreach (var r in rows.Where(r => !publicOnly || PublicPrefixes.Any(p => r.Key.StartsWith(p, StringComparison.Ordinal))))
        { try { o[r.Key] = JsonNode.Parse(r.ValueJson); } catch (JsonException) { } }
        return AdminResult.Success(o);
    }

    public async Task<AdminResult> PutSettingsAsync(Actor actor, JsonObject settings, CancellationToken ct = default)
    {
        // Admin: mọi khóa. Editor (quyền "giao diện"): chỉ khóa site.config và KHÔNG được đổi nhánh "system" của nó (giữ nguyên bản đã lưu).
        if (!actor.IsAdmin && !(actor.IsEditor && settings.All(k => k.Key == "site.config"))) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được đổi cấu hình hệ thống. Biên tập viên chỉ được sửa giao diện (site.config).");
        if (settings.Count is 0 or > 100) return AdminResult.Fail(422, "Số khóa cấu hình không hợp lệ.");
        foreach (var kv in settings)
        {
            if (!SettingKey.IsMatch(kv.Key)) return AdminResult.Fail(422, $"Khóa cấu hình không hợp lệ: {kv.Key}");
            if ((kv.Value?.ToJsonString().Length ?? 0) > MaxSettingBytes) return AdminResult.Fail(422, $"Giá trị '{kv.Key}' quá lớn.");
        }
        if (!actor.IsAdmin && settings["site.config"] is JsonObject incoming)
        {
            var stored = await _db.SystemSettings.AsNoTracking().Where(s => s.Key == "site.config").Select(s => s.ValueJson).FirstOrDefaultAsync(ct);
            JsonNode? keepSystem = null; try { keepSystem = (stored == null ? null : JsonNode.Parse(stored) as JsonObject)?["system"]?.DeepClone(); } catch (JsonException) { }
            incoming.Remove("system"); if (keepSystem != null) incoming["system"] = keepSystem;
        }
        foreach (var kv in settings)
        {
            var json = kv.Value?.ToJsonString() ?? "null";
            var row = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == kv.Key, ct);
            if (row == null) _db.SystemSettings.Add(new SystemSetting { Key = kv.Key, ValueJson = json, UpdatedBy = actor.Id }); else { row.ValueJson = json; row.UpdatedAt = DateTime.UtcNow; row.UpdatedBy = actor.Id; }
        }
        await _db.SaveChangesAsync(ct); _site.Invalidate();
        await Log(actor, "admin.settings.update", "Settings", null, string.Join(", ", settings.Select(k => k.Key)), ct);
        return AdminResult.Success(new { ok = true });
    }
}
