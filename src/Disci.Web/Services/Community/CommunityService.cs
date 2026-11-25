using System.Text.Json;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Engine;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Community;

public sealed record CommunityResult(bool Ok, int Status, string? Error = null, object? Data = null)
{
    public static CommunityResult Success(object? data = null) => new(true, 200, null, data);
    public static CommunityResult Fail(int status, string error) => new(false, status, error);
}
public sealed class StoryInput { public string? Id { get; set; } public string? Text { get; set; } public string? Img { get; set; } public int? Hue { get; set; } }
public sealed class GroupInput { public string? Id { get; set; } public string? Name { get; set; } public string? Desc { get; set; } public int? Hue { get; set; } }

public interface ICommunityService
{
    Task<JsonObject> GetSnapshotAsync(string me, bool isStaff, CancellationToken ct = default);
    Task<JsonArray> GetNotificationsAsync(string me, CancellationToken ct = default);
    Task<JsonArray> GetAnnouncementsAsync(string me, CancellationToken ct = default);
    Task<CommunityResult> ToggleLikeAsync(string me, bool isStaff, string postId, CancellationToken ct = default);
    Task<CommunityResult> AddCommentAsync(string me, bool isStaff, string postId, string? text, string? clientId = null, CancellationToken ct = default);
    Task<CommunityResult> DeleteCommentAsync(string me, string commentId, CancellationToken ct = default);
    Task<CommunityResult> ShareAsync(string me, bool isStaff, string postId, CancellationToken ct = default);
    Task<CommunityResult> ToggleFollowAsync(string me, string targetUserId, CancellationToken ct = default);
    Task<CommunityResult> ReportAsync(string me, bool isStaff, string postId, string? reason, CancellationToken ct = default);
    Task<CommunityResult> CreateGroupAsync(string me, GroupInput input, CancellationToken ct = default);
    Task<CommunityResult> ToggleJoinGroupAsync(string me, string groupId, CancellationToken ct = default);
    Task<CommunityResult> UpdateGroupAsync(string me, bool isStaff, string groupId, GroupInput input, CancellationToken ct = default);
    Task<CommunityResult> DeleteGroupAsync(string me, bool isStaff, string groupId, CancellationToken ct = default);
    Task<CommunityResult> SetChallengeAsync(string me, string challengeId, bool join, CancellationToken ct = default);
    Task<CommunityResult> MarkNotificationsReadAsync(string me, IReadOnlyList<string>? ids, CancellationToken ct = default);
    Task<CommunityResult> GetGroupMessagesAsync(string me, string groupId, long? afterMs, CancellationToken ct = default);
    Task<CommunityResult> SendGroupMessageAsync(string me, string groupId, string? text, CancellationToken ct = default);
    Task<CommunityResult> GetDirectMessagesAsync(string me, string otherUserId, long? afterMs, CancellationToken ct = default);
    Task<CommunityResult> SendDirectMessageAsync(string me, string otherUserId, string? text, CancellationToken ct = default);
    Task<CommunityResult> AddStoryAsync(string me, StoryInput input, CancellationToken ct = default);
    Task<CommunityResult> DeleteStoryAsync(string me, bool isStaff, string storyId, CancellationToken ct = default);
}

/// <summary>
/// Nghiệp vụ cộng đồng chạy trên SQL Server, MỌI kiểm tra quyền ở máy chủ: quyền xem bài (public / followers / private / bị ẩn), chỉ tự thích/bình luận/theo dõi bằng danh tính đăng nhập,
/// chỉ chủ nhóm hoặc nhân sự quản trị được sửa/xóa nhóm. Không bao giờ trả email hay dữ liệu riêng tư của người khác.
/// </summary>
public sealed class CommunityService : ICommunityService
{
    private static readonly string[] DefaultBanned = { "cá độ", "thuốc lắc" };
    private readonly ApplicationDbContext _db;
    public CommunityService(ApplicationDbContext db) => _db = db;

    private static string NewId(string prefix) => prefix + Guid.NewGuid().ToString("N")[..12];
    private static long Ms(DateTime d) => new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)).ToUnixTimeMilliseconds();

    /// <summary>Bài viết mà người dùng `me` được phép xem.</summary>
    private IQueryable<Post> VisiblePosts(string me, bool isStaff)
        => _db.Posts.Where(p => !p.IsDraft && p.User.IsActive && p.User.DeletedAt == null
            && (isStaff || !p.Hidden || p.UserId == me)
            && (p.UserId == me || (p.Visibility != "private" && (p.Visibility != "followers" || _db.Follows.Any(f => f.FollowerId == me && f.FolloweeId == p.UserId)))));

    private async Task<Post?> FindVisiblePostAsync(string me, bool isStaff, string clientId, CancellationToken ct)
        => await VisiblePosts(me, isStaff).FirstOrDefaultAsync(p => p.ClientId == clientId, ct);

    private async Task NotifyAsync(string to, string from, string type, string? postClientId, string? text, CancellationToken ct)
    {
        if (to == from) return;
        if (!await _db.Users.AnyAsync(u => u.Id == to && u.IsActive && u.DeletedAt == null, ct)) return;
        if (type == "like" && await _db.Notifications.AnyAsync(n => n.UserId == to && n.FromUserId == from && n.Type == "like" && n.PostClientId == postClientId, ct)) return;
        _db.Notifications.Add(new Notification { ClientId = NewId("n"), UserId = to, FromUserId = from, Type = type, PostClientId = postClientId, Body = text == null ? null : (text.Length > 500 ? text[..500] : text) });
    }

    // ===================== ẢNH CHỤP CỘNG ĐỒNG =====================
    public async Task<JsonObject> GetSnapshotAsync(string me, bool isStaff, CancellationToken ct = default)
    {
        var posts = await VisiblePosts(me, isStaff).Where(p => p.ClientId != null).OrderByDescending(p => p.CreatedAt).Take(300)
            .Select(p => new { p.Id, p.ClientId, p.UserId, p.RawJson }).ToListAsync(ct);
        var postIds = posts.Select(p => p.Id).ToList(); var cid = posts.ToDictionary(p => p.Id, p => p.ClientId!);

        var likes = await _db.PostLikes.AsNoTracking().Where(l => postIds.Contains(l.PostId)).Select(l => new { l.PostId, l.UserId }).ToListAsync(ct);
        var comments = await _db.Comments.AsNoTracking().Where(c => postIds.Contains(c.PostId) && !c.Hidden && c.User.IsActive && c.User.DeletedAt == null).OrderBy(c => c.CreatedAt)
            .Select(c => new { c.Id, c.ClientId, c.PostId, c.UserId, c.Body, c.CreatedAt }).ToListAsync(ct);
        var shares = await _db.PostShares.AsNoTracking().Where(s => postIds.Contains(s.PostId)).GroupBy(s => s.PostId).Select(g => new { PostId = g.Key, N = g.Count() }).ToListAsync(ct);

        var newest = await _db.Users.AsNoTracking().Where(u => u.IsActive && u.DeletedAt == null).OrderByDescending(u => u.CreatedAt).Take(100).Select(u => u.Id).ToListAsync(ct);
        var groupRows = await _db.Groups.AsNoTracking().Where(g => g.ClientId != null && (g.IsPublic || g.OwnerId == me || _db.GroupMembers.Any(m => m.GroupId == g.Id && m.UserId == me)))
            .OrderByDescending(g => g.CreatedAt).Take(200).ToListAsync(ct);
        var gids = groupRows.Select(g => g.Id).ToList();
        var members = await _db.GroupMembers.AsNoTracking().Where(m => gids.Contains(m.GroupId)).Select(m => new { m.GroupId, m.UserId }).ToListAsync(ct);
        var parts = await _db.ChallengeParticipants.AsNoTracking().Take(20000).Select(p => new { p.ChallengeId, p.UserId }).ToListAsync(ct);
        var nowUtc = DateTime.UtcNow;
        var storyRows = await _db.Stories.AsNoTracking().Where(s => s.ExpiresAt > nowUtc && _db.Users.Any(u => u.Id == s.UserId && u.IsActive && u.DeletedAt == null)).OrderByDescending(s => s.CreatedAt).Take(100).ToListAsync(ct);

        var ids = new HashSet<string> { me };
        foreach (var x in newest) ids.Add(x);
        foreach (var p in posts) ids.Add(p.UserId);
        foreach (var l in likes) ids.Add(l.UserId);
        foreach (var c in comments) ids.Add(c.UserId);
        foreach (var m in members) ids.Add(m.UserId);
        foreach (var p in parts) ids.Add(p.UserId);
        foreach (var g in groupRows) ids.Add(g.OwnerId);
        foreach (var s in storyRows) ids.Add(s.UserId);
        var idList = ids.Take(600).ToList();

        var edges = await _db.Follows.AsNoTracking().Where(f => idList.Contains(f.FollowerId) || idList.Contains(f.FolloweeId)).Take(8000).Select(f => new { f.FollowerId, f.FolloweeId }).ToListAsync(ct);
        foreach (var e in edges) { ids.Add(e.FollowerId); ids.Add(e.FolloweeId); }
        idList = ids.Take(800).ToList();

        var users = await _db.Users.AsNoTracking().Where(u => idList.Contains(u.Id) && u.DeletedAt == null)
            .Select(u => new { u.Id, u.FullName, u.CreatedAt, u.IsActive, u.IsDemo, Avatar = u.Profile != null ? u.Profile.AvatarUrl : null, Cover = u.Profile != null ? u.Profile.CoverUrl : null, Bio = u.Profile != null ? u.Profile.Bio : null, Goal = u.Profile != null ? u.Profile.Goal : null, Extra = u.Profile != null ? u.Profile.ExtraJson : null }).ToListAsync(ct);
        var uids = users.Select(u => u.Id).ToList();
        var roleRows = await (from ur in _db.UserRoles where uids.Contains(ur.UserId) join r in _db.Roles on ur.RoleId equals r.Id select new { ur.UserId, r.Name }).ToListAsync(ct);
        var rolesBy = roleRows.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.Select(x => x.Name ?? "").ToList());
        var settings = await _db.UserDataBlobs.AsNoTracking().Where(b => b.Key == "settings" && uids.Contains(b.UserId)).Select(b => new { b.UserId, b.Value }).ToListAsync(ct);
        var privacyBy = settings.ToDictionary(s => s.UserId, s => PrivacyOf(s.Value));

        // ---- thống kê công khai (chỉ cho người không tắt hiển thị thống kê/bảng xếp hạng) ----
        var statUsers = uids.Where(u => u == me || !privacyBy.TryGetValue(u, out var pv) || pv.ShowStats || pv.ShowBoard).ToList();
        var today = DisciEngine.TodayStr(DateTimeOffset.UtcNow); var since = DateOnly.ParseExact(DisciEngine.AddDays(today, -120), "yyyy-MM-dd");
        var agg = await _db.WorkoutSessions.AsNoTracking().Where(s => s.Status == "done" && statUsers.Contains(s.UserId)).GroupBy(s => s.UserId).Select(g => new { UserId = g.Key, N = g.Count(), Min = g.Sum(x => x.Minutes) }).ToListAsync(ct);
        var recent = await _db.WorkoutSessions.AsNoTracking().Where(s => s.Status == "done" && s.DoneOn >= since && statUsers.Contains(s.UserId)).Select(s => new { s.UserId, s.DoneOn }).Distinct().ToListAsync(ct);
        var datesBy = recent.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.Select(r => new SessionRecord { Date = r.DoneOn.ToString("yyyy-MM-dd"), Status = "done" }).ToList());

        var usersJson = new JsonArray(); var statsJson = new JsonObject();
        foreach (var u in users)
        {
            var extra = u.Extra == null ? null : JsonNode.Parse(u.Extra) as JsonObject;
            string? avatar = u.Avatar ?? SafeInlineImage(extra?["avatar"]); string? cover = u.Cover ?? SafeInlineImage(extra?["cover"]);
            var pv = privacyBy.GetValueOrDefault(u.Id) ?? new Privacy();
            usersJson.Add(new JsonObject
            {
                ["id"] = u.Id, ["name"] = u.FullName, ["role"] = BootService.ClientRole(rolesBy.GetValueOrDefault(u.Id) ?? new List<string>()), ["demo"] = u.IsDemo, ["locked"] = !u.IsActive, ["createdAt"] = Ms(u.CreatedAt),
                ["profile"] = new JsonObject { ["avatar"] = avatar, ["cover"] = cover, ["bio"] = u.Bio ?? "", ["goal"] = u.Goal, ["city"] = (string?)extra?["city"] ?? "" },
                ["privacy"] = new JsonObject { ["showStats"] = pv.ShowStats, ["showBoard"] = pv.ShowBoard }
            });
            if (statUsers.Contains(u.Id))
            {
                var a = agg.FirstOrDefault(x => x.UserId == u.Id); var st = DisciEngine.StreakOf(datesBy.GetValueOrDefault(u.Id) ?? new List<SessionRecord>(), today);
                int n = a?.N ?? 0;
                statsJson[u.Id] = new JsonObject { ["streak"] = st.Current, ["sessions"] = n, ["minutes"] = a?.Min ?? 0, ["points"] = n * 20 + st.Current * 10 };
            }
        }

        var likesJ = new JsonObject(); foreach (var g in likes.GroupBy(l => l.PostId)) likesJ[cid[g.Key]] = new JsonArray(g.Select(x => (JsonNode?)JsonValue.Create(x.UserId)).ToArray());
        var commentsJ = new JsonObject();
        foreach (var g in comments.GroupBy(c => c.PostId))
            commentsJ[cid[g.Key]] = new JsonArray(g.Select(c => (JsonNode?)new JsonObject { ["id"] = c.ClientId ?? "c" + c.Id, ["by"] = c.UserId, ["text"] = c.Body, ["at"] = Ms(c.CreatedAt) }).ToArray());
        var sharesJ = new JsonObject(); foreach (var s in shares) sharesJ[cid[s.PostId]] = s.N;
        var followsJ = new JsonObject(); foreach (var g in edges.GroupBy(e => e.FollowerId)) followsJ[g.Key] = new JsonArray(g.Select(x => (JsonNode?)JsonValue.Create(x.FolloweeId)).ToArray());
        var groupsJ = new JsonArray();
        foreach (var g in groupRows)
            groupsJ.Add(new JsonObject { ["id"] = g.ClientId, ["name"] = g.Name, ["desc"] = g.Description ?? "", ["hue"] = g.Hue, ["owner"] = g.OwnerId, ["demo"] = g.IsDemo, ["at"] = Ms(g.CreatedAt),
                ["members"] = new JsonArray(members.Where(m => m.GroupId == g.Id).Select(m => (JsonNode?)JsonValue.Create(m.UserId)).ToArray()) });
        var chJ = new JsonObject(); foreach (var g in parts.GroupBy(p => p.ChallengeId)) chJ[g.Key] = new JsonArray(g.Select(x => (JsonNode?)JsonValue.Create(x.UserId)).ToArray());
        var postsJ = new JsonArray();
        foreach (var p in posts) { if (JsonNode.Parse(p.RawJson) is JsonObject o) { o["by"] = p.UserId; postsJ.Add(o); } }

        return new JsonObject
        {
            ["users"] = usersJson, ["stats"] = statsJson, ["posts"] = postsJ, ["likes"] = likesJ, ["comments"] = commentsJ, ["shares"] = sharesJ,
            ["follows"] = followsJ, ["groups"] = groupsJ, ["chPart"] = chJ, ["stories"] = new JsonArray(storyRows.Select(s => (JsonNode?)new JsonObject { ["id"] = s.ClientId ?? "s" + s.Id, ["by"] = s.UserId, ["text"] = s.Text ?? "", ["img"] = s.MediaUrl ?? "", ["hue"] = s.Hue ?? 0, ["at"] = Ms(s.CreatedAt) }).ToArray()), ["notifs"] = await GetNotificationsAsync(me, ct), ["announcements"] = await GetAnnouncementsAsync(me, ct), ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
    }

    private sealed class Privacy { public bool ShowStats { get; set; } = true; public bool ShowBoard { get; set; } = true; }
    private static Privacy PrivacyOf(string settingsJson)
    {
        try
        {
            var p = (JsonNode.Parse(settingsJson) as JsonObject)?["privacy"] as JsonObject;
            return new Privacy { ShowStats = !(p?["showStats"] is JsonValue a && a.TryGetValue<bool>(out var av) && !av), ShowBoard = !(p?["showBoard"] is JsonValue b && b.TryGetValue<bool>(out var bv) && !bv) };
        }
        catch (JsonException) { return new Privacy(); }
    }
    /// <summary>Ảnh đại diện/bìa: chỉ gửi nếu là URL hoặc data-URL nhỏ (tránh phình ảnh chụp cộng đồng).</summary>
    private static string? SafeInlineImage(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) && !string.IsNullOrEmpty(s) && s.Length <= 20_000 ? s : null;

    public async Task<JsonArray> GetNotificationsAsync(string me, CancellationToken ct = default)
    {
        var rows = await _db.Notifications.AsNoTracking().Where(n => n.UserId == me).OrderByDescending(n => n.CreatedAt).Take(200).ToListAsync(ct);
        return new JsonArray(rows.Select(n => (JsonNode?)new JsonObject { ["id"] = n.ClientId ?? "n" + n.Id, ["to"] = me, ["from"] = n.FromUserId, ["type"] = n.Type, ["postId"] = n.PostClientId ?? "", ["text"] = n.Body ?? "", ["at"] = Ms(n.CreatedAt), ["read"] = n.IsRead }).ToArray());
    }

    /// <summary>Giao diện sinh id cục bộ để thao tác tức thì; máy chủ chấp nhận nếu đúng định dạng và chưa dùng, ngược lại tự sinh id mới.</summary>
    private static readonly System.Text.RegularExpressions.Regex IdRx = new(@"^[A-Za-z0-9_\-]{4,40}$", System.Text.RegularExpressions.RegexOptions.Compiled);
    private static async Task<string> UsableIdAsync(string? proposed, string prefix, Func<string, Task<bool>> exists)
        => proposed != null && IdRx.IsMatch(proposed) && !await exists(proposed) ? proposed : NewId(prefix);

    /// <summary>Thông báo hệ thống còn hiệu lực dành cho `me`: gửi tất cả (all), theo vai trò (role:x) hoặc riêng một người (user:id). Lọc ở máy chủ.</summary>
    public async Task<JsonArray> GetAnnouncementsAsync(string me, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var names = await (from ur in _db.UserRoles where ur.UserId == me join r in _db.Roles on ur.RoleId equals r.Id select r.Name).ToListAsync(ct);
        var role = BootService.ClientRole(names.Select(n => n ?? ""));
        var rows = await _db.Announcements.AsNoTracking().Where(a => a.IsActive && (a.ExpiresAt == null || a.ExpiresAt > now)).OrderByDescending(a => a.CreatedAt).Take(50).ToListAsync(ct);
        var arr = new JsonArray();
        foreach (var a in rows.Where(a => a.Audience == "all" || a.Audience == "role:" + role || a.Audience == "user:" + me))
            arr.Add(new JsonObject { ["id"] = a.ClientId ?? "an" + a.Id, ["title"] = a.Title, ["text"] = a.Body ?? "", ["audience"] = a.Audience, ["kind"] = a.Kind, ["go"] = a.Link ?? "", ["at"] = Ms(a.CreatedAt), ["until"] = a.ExpiresAt == null ? 0L : Ms(a.ExpiresAt.Value) });
        return arr;
    }

    // ===================== BÀI VIẾT: thích / bình luận / chia sẻ / báo cáo =====================
    public async Task<CommunityResult> ToggleLikeAsync(string me, bool isStaff, string postId, CancellationToken ct = default)
    {
        var p = await FindVisiblePostAsync(me, isStaff, postId, ct); if (p == null) return CommunityResult.Fail(404, "Không tìm thấy bài viết.");
        var like = await _db.PostLikes.FirstOrDefaultAsync(l => l.PostId == p.Id && l.UserId == me, ct); bool liked;
        if (like != null) { _db.PostLikes.Remove(like); liked = false; }
        else { _db.PostLikes.Add(new PostLike { PostId = p.Id, UserId = me }); liked = true; await NotifyAsync(p.UserId, me, "like", p.ClientId, null, ct); }
        await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, liked, count = await _db.PostLikes.CountAsync(l => l.PostId == p.Id, ct) });
    }

    private async Task<string[]> BannedAsync(CancellationToken ct)
    {
        var v = await _db.SystemSettings.AsNoTracking().Where(s => s.Key == "system.bannedWords").Select(s => s.ValueJson).FirstOrDefaultAsync(ct);
        try { return v == null ? DefaultBanned : JsonSerializer.Deserialize<string[]>(v) ?? DefaultBanned; } catch (JsonException) { return DefaultBanned; }
    }

    public async Task<CommunityResult> AddCommentAsync(string me, bool isStaff, string postId, string? text, string? clientId = null, CancellationToken ct = default)
    {
        text = (text ?? "").Trim(); if (text.Length == 0) return CommunityResult.Fail(422, "Hãy nhập nội dung bình luận.");
        if (text.Length > 500) text = text[..500];
        var bad = (await BannedAsync(ct)).FirstOrDefault(w => !string.IsNullOrWhiteSpace(w) && text.Contains(w, StringComparison.OrdinalIgnoreCase));
        if (bad != null) return CommunityResult.Fail(422, $"Nội dung chứa từ bị cấm: \"{bad}\".");
        var since = DateTime.UtcNow.AddMinutes(-1);
        if (await _db.Comments.CountAsync(c => c.UserId == me && c.CreatedAt > since, ct) >= 20) return CommunityResult.Fail(429, "Bạn bình luận quá nhanh. Hãy thử lại sau ít giây.");
        var p = await FindVisiblePostAsync(me, isStaff, postId, ct); if (p == null) return CommunityResult.Fail(404, "Không tìm thấy bài viết.");
        var cid = await UsableIdAsync(clientId, "c", id => _db.Comments.AnyAsync(x => x.ClientId == id, ct));
        var c = new Comment { ClientId = cid, PostId = p.Id, UserId = me, Body = text };
        _db.Comments.Add(c); await NotifyAsync(p.UserId, me, "comment", p.ClientId, text, ct); await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, comment = new { id = c.ClientId, by = me, text = c.Body, at = Ms(c.CreatedAt) } });
    }

    /// <summary>Người dùng chỉ xóa được bình luận CỦA MÌNH (nhân sự quản trị dùng chức năng kiểm duyệt ở Lượt 4).</summary>
    public async Task<CommunityResult> DeleteCommentAsync(string me, string commentId, CancellationToken ct = default)
    {
        var c = await _db.Comments.FirstOrDefaultAsync(x => x.ClientId == commentId && x.UserId == me, ct); if (c == null) return CommunityResult.Fail(404, "Không tìm thấy bình luận.");
        _db.Comments.Remove(c); await _db.SaveChangesAsync(ct); return CommunityResult.Success(new { ok = true });
    }

    public async Task<CommunityResult> ShareAsync(string me, bool isStaff, string postId, CancellationToken ct = default)
    {
        var p = await FindVisiblePostAsync(me, isStaff, postId, ct); if (p == null) return CommunityResult.Fail(404, "Không tìm thấy bài viết.");
        if (p.Visibility == "private" && p.UserId != me) return CommunityResult.Fail(403, "Không thể chia sẻ bài riêng tư.");
        _db.PostShares.Add(new PostShare { PostId = p.Id, UserId = me }); await NotifyAsync(p.UserId, me, "share", p.ClientId, null, ct); await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, count = await _db.PostShares.CountAsync(s => s.PostId == p.Id, ct) });
    }

    public async Task<CommunityResult> ReportAsync(string me, bool isStaff, string postId, string? reason, CancellationToken ct = default)
    {
        var p = await FindVisiblePostAsync(me, isStaff, postId, ct); if (p == null) return CommunityResult.Fail(404, "Không tìm thấy bài viết.");
        reason = (reason ?? "").Trim(); if (reason.Length == 0) return CommunityResult.Fail(422, "Hãy chọn lý do báo cáo."); if (reason.Length > 60) reason = reason[..60];
        if (!await _db.Reports.AnyAsync(r => r.ReporterId == me && r.PostId == p.Id && r.Status == "open", ct))
        { _db.Reports.Add(new Report { ClientId = NewId("r"), ReporterId = me, PostId = p.Id, Reason = reason }); await _db.SaveChangesAsync(ct); }
        return CommunityResult.Success(new { ok = true });
    }

    // ===================== THEO DÕI =====================
    public async Task<CommunityResult> ToggleFollowAsync(string me, string targetUserId, CancellationToken ct = default)
    {
        if (targetUserId == me) return CommunityResult.Fail(422, "Bạn không thể tự theo dõi chính mình.");
        if (!await _db.Users.AnyAsync(u => u.Id == targetUserId && u.IsActive && u.DeletedAt == null, ct)) return CommunityResult.Fail(404, "Không tìm thấy người dùng.");
        var f = await _db.Follows.FirstOrDefaultAsync(x => x.FollowerId == me && x.FolloweeId == targetUserId, ct); bool following;
        if (f != null) { _db.Follows.Remove(f); following = false; }
        else { _db.Follows.Add(new Follow { FollowerId = me, FolloweeId = targetUserId }); following = true; await NotifyAsync(targetUserId, me, "follow", null, null, ct); }
        await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, following, followers = await _db.Follows.CountAsync(x => x.FolloweeId == targetUserId, ct) });
    }

    // ===================== NHÓM =====================
    private static (string? Name, string Desc, int? Hue, string? Error) CleanGroup(GroupInput i)
    {
        var name = (i.Name ?? "").Trim(); if (name.Length == 0) return (null, "", null, "Hãy nhập tên nhóm.");
        if (name.Length > 60) name = name[..60];
        var desc = (i.Desc ?? "").Trim(); if (desc.Length > 300) desc = desc[..300];
        return (name, desc, i.Hue is >= 0 and <= 360 ? i.Hue : null, null);
    }
    private static object GroupDto(Group g, IEnumerable<string> members) => new { id = g.ClientId, name = g.Name, desc = g.Description ?? "", hue = g.Hue, owner = g.OwnerId, demo = g.IsDemo, at = Ms(g.CreatedAt), members };

    public async Task<CommunityResult> CreateGroupAsync(string me, GroupInput input, CancellationToken ct = default)
    {
        var (name, desc, hue, err) = CleanGroup(input); if (err != null) return CommunityResult.Fail(422, err);
        if (await _db.Groups.CountAsync(g => g.OwnerId == me, ct) >= 20) return CommunityResult.Fail(429, "Bạn đã tạo tối đa 20 nhóm.");
        var gid = await UsableIdAsync(input.Id, "g", id => _db.Groups.AnyAsync(x => x.ClientId == id, ct));
        var g = new Group { ClientId = gid, Name = name!, Description = desc, Hue = hue ?? Random.Shared.Next(0, 360), OwnerId = me, IsPublic = true };
        _db.Groups.Add(g); await _db.SaveChangesAsync(ct);
        _db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = me, Role = "owner" }); await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, group = GroupDto(g, new[] { me }) });
    }

    public async Task<CommunityResult> ToggleJoinGroupAsync(string me, string groupId, CancellationToken ct = default)
    {
        var g = await _db.Groups.FirstOrDefaultAsync(x => x.ClientId == groupId, ct); if (g == null) return CommunityResult.Fail(404, "Không tìm thấy nhóm.");
        var m = await _db.GroupMembers.FirstOrDefaultAsync(x => x.GroupId == g.Id && x.UserId == me, ct); bool joined;
        if (m != null) { _db.GroupMembers.Remove(m); joined = false; }
        else { if (!g.IsPublic) return CommunityResult.Fail(403, "Nhóm này không công khai."); _db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = me }); joined = true; }
        await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, joined, members = await _db.GroupMembers.CountAsync(x => x.GroupId == g.Id, ct) });
    }

    public async Task<CommunityResult> UpdateGroupAsync(string me, bool isStaff, string groupId, GroupInput input, CancellationToken ct = default)
    {
        var g = await _db.Groups.FirstOrDefaultAsync(x => x.ClientId == groupId, ct); if (g == null) return CommunityResult.Fail(404, "Không tìm thấy nhóm.");
        if (g.OwnerId != me && !isStaff) return CommunityResult.Fail(403, "Chỉ chủ nhóm mới được sửa nhóm.");
        var (name, desc, hue, err) = CleanGroup(input); if (err != null) return CommunityResult.Fail(422, err);
        g.Name = name!; g.Description = desc; if (hue != null) g.Hue = hue; await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, group = GroupDto(g, await _db.GroupMembers.Where(m => m.GroupId == g.Id).Select(m => m.UserId).ToListAsync(ct)) });
    }

    public async Task<CommunityResult> DeleteGroupAsync(string me, bool isStaff, string groupId, CancellationToken ct = default)
    {
        var g = await _db.Groups.FirstOrDefaultAsync(x => x.ClientId == groupId, ct); if (g == null) return CommunityResult.Fail(404, "Không tìm thấy nhóm.");
        if (g.OwnerId != me && !isStaff) return CommunityResult.Fail(403, "Chỉ chủ nhóm mới được xóa nhóm.");
        foreach (var p in await _db.Posts.Where(p => p.GroupId == g.Id).ToListAsync(ct)) p.GroupId = null;     // bài viết ở lại, chỉ gỡ khỏi nhóm
        _db.Groups.Remove(g); await _db.SaveChangesAsync(ct);                                                  // thành viên xóa theo cascade
        return CommunityResult.Success(new { ok = true });
    }

    // ===================== THỬ THÁCH =====================
    public async Task<CommunityResult> SetChallengeAsync(string me, string challengeId, bool join, CancellationToken ct = default)
    {
        if (!await _db.Challenges.AnyAsync(c => c.Id == challengeId && c.IsActive, ct)) return CommunityResult.Fail(404, "Không tìm thấy thử thách.");
        var row = await _db.ChallengeParticipants.FirstOrDefaultAsync(p => p.ChallengeId == challengeId && p.UserId == me, ct);
        if (join && row == null) _db.ChallengeParticipants.Add(new ChallengeParticipant { ChallengeId = challengeId, UserId = me, JoinedOn = DateOnly.ParseExact(DisciEngine.TodayStr(DateTimeOffset.UtcNow), "yyyy-MM-dd") });
        else if (!join && row != null) _db.ChallengeParticipants.Remove(row);
        await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, participants = await _db.ChallengeParticipants.CountAsync(p => p.ChallengeId == challengeId, ct) });
    }

    // ===================== THÔNG BÁO =====================
    public async Task<CommunityResult> MarkNotificationsReadAsync(string me, IReadOnlyList<string>? ids, CancellationToken ct = default)
    {
        var q = _db.Notifications.Where(n => n.UserId == me && !n.IsRead);
        if (ids is { Count: > 0 }) { var l = ids.ToList(); q = q.Where(n => l.Contains(n.ClientId!)); }
        foreach (var n in await q.ToListAsync(ct)) n.IsRead = true;
        await _db.SaveChangesAsync(ct); return CommunityResult.Success(new { ok = true });
    }

    // ===================== TIN NHẮN =====================
    private static readonly System.Text.RegularExpressions.Regex StoryImgRx = new(@"^/media/[0-9a-f]{32}\.(jpg|png|webp|gif)$", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>Mốc "sau thời điểm này" tính theo mili-giây (Ms() cắt phần tick nhỏ hơn): lấy tin có CreatedAt ≥ mốc + 1 ms để không trả lại tin cuối đã có.</summary>
    private static DateTime? AfterUtc(long? ms) => ms is > 0 and < 4_102_444_800_000 ? DateTimeOffset.FromUnixTimeMilliseconds(ms.Value).UtcDateTime.AddMilliseconds(1) : null;

    /// <summary>Kiểm tra nội dung tin nhắn: không rỗng, ≤ 500 ký tự, không chứa từ cấm, không gửi quá 30 tin/phút (nhóm + riêng cộng lại).</summary>
    private async Task<(string? Text, CommunityResult? Error)> CheckMessageAsync(string me, string? text, CancellationToken ct)
    {
        text = (text ?? "").Trim(); if (text.Length == 0) return (null, CommunityResult.Fail(422, "Hãy nhập nội dung tin nhắn."));
        if (text.Length > 500) text = text[..500];
        var bad = (await BannedAsync(ct)).FirstOrDefault(w => !string.IsNullOrWhiteSpace(w) && text.Contains(w, StringComparison.OrdinalIgnoreCase));
        if (bad != null) return (null, CommunityResult.Fail(422, $"Nội dung chứa từ bị cấm: \"{bad}\"."));
        var since = DateTime.UtcNow.AddMinutes(-1);
        if (await _db.GroupMessages.CountAsync(m => m.UserId == me && m.CreatedAt > since, ct) + await _db.DirectMessages.CountAsync(m => m.SenderId == me && m.CreatedAt > since, ct) >= 30)
            return (null, CommunityResult.Fail(429, "Bạn nhắn quá nhanh. Hãy thử lại sau ít giây."));
        return (text, null);
    }

    private async Task<Group?> GroupIfMemberAsync(string me, string groupId, CancellationToken ct)
        => await _db.Groups.FirstOrDefaultAsync(g => g.ClientId == groupId && _db.GroupMembers.Any(m => m.GroupId == g.Id && m.UserId == me), ct);

    public async Task<CommunityResult> GetGroupMessagesAsync(string me, string groupId, long? afterMs, CancellationToken ct = default)
    {
        var g = await GroupIfMemberAsync(me, groupId, ct); if (g == null) return CommunityResult.Fail(404, "Không tìm thấy nhóm hoặc bạn chưa là thành viên.");
        var q = _db.GroupMessages.AsNoTracking().Where(m => m.GroupId == g.Id && _db.Users.Any(u => u.Id == m.UserId && u.DeletedAt == null)); if (AfterUtc(afterMs) is { } a) q = q.Where(m => m.CreatedAt >= a);
        var rows = (await q.OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id).Take(100).ToListAsync(ct)).AsEnumerable().Reverse().Select(m => new { id = m.Id, by = m.UserId, text = m.Body, at = Ms(m.CreatedAt) }).ToList();
        return CommunityResult.Success(new { ok = true, messages = rows });
    }

    public async Task<CommunityResult> SendGroupMessageAsync(string me, string groupId, string? text, CancellationToken ct = default)
    {
        var g = await GroupIfMemberAsync(me, groupId, ct); if (g == null) return CommunityResult.Fail(404, "Không tìm thấy nhóm hoặc bạn chưa là thành viên.");
        var (t, err) = await CheckMessageAsync(me, text, ct); if (err != null) return err;
        var m = new GroupMessage { GroupId = g.Id, UserId = me, Body = t! }; _db.GroupMessages.Add(m); await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, message = new { id = m.Id, by = me, text = m.Body, at = Ms(m.CreatedAt) } });
    }

    public async Task<CommunityResult> GetDirectMessagesAsync(string me, string otherUserId, long? afterMs, CancellationToken ct = default)
    {
        if (otherUserId == me || !await _db.Users.AnyAsync(u => u.Id == otherUserId && u.DeletedAt == null, ct)) return CommunityResult.Fail(404, "Không tìm thấy người dùng.");
        var q = _db.DirectMessages.Where(m => (m.SenderId == me && m.ReceiverId == otherUserId) || (m.SenderId == otherUserId && m.ReceiverId == me)); if (AfterUtc(afterMs) is { } a) q = q.Where(m => m.CreatedAt >= a);
        var rows = (await q.OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id).Take(100).ToListAsync(ct)).AsEnumerable().Reverse().ToList();
        var unread = rows.Where(m => m.ReceiverId == me && !m.IsRead).ToList(); foreach (var m in unread) m.IsRead = true; if (unread.Count > 0) await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, messages = rows.Select(m => new { id = m.Id, by = m.SenderId, text = m.Body, at = Ms(m.CreatedAt) }) });
    }

    public async Task<CommunityResult> SendDirectMessageAsync(string me, string otherUserId, string? text, CancellationToken ct = default)
    {
        if (otherUserId == me) return CommunityResult.Fail(422, "Bạn không thể nhắn tin cho chính mình.");
        if (!await _db.Users.AnyAsync(u => u.Id == otherUserId && u.IsActive && u.DeletedAt == null, ct)) return CommunityResult.Fail(404, "Không tìm thấy người dùng.");
        var (t, err) = await CheckMessageAsync(me, text, ct); if (err != null) return err;
        var m = new DirectMessage { SenderId = me, ReceiverId = otherUserId, Body = t! }; _db.DirectMessages.Add(m);
        var recent = DateTime.UtcNow.AddMinutes(-10);   // một thông báo "tin nhắn mới" mỗi 10 phút cho mỗi người gửi, tránh làm ngập chuông thông báo
        if (!await _db.Notifications.AnyAsync(n => n.UserId == otherUserId && n.FromUserId == me && n.Type == "message" && n.CreatedAt > recent, ct)) await NotifyAsync(otherUserId, me, "message", null, t!.Length > 80 ? t[..80] : t, ct);
        await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, message = new { id = m.Id, by = me, text = m.Body, at = Ms(m.CreatedAt) } });
    }

    // ===================== STORIES (24 giờ) =====================
    public async Task<CommunityResult> AddStoryAsync(string me, StoryInput input, CancellationToken ct = default)
    {
        var text = (input.Text ?? "").Trim(); if (text.Length > 200) text = text[..200];
        var img = (input.Img ?? "").Trim();
        if (img.Length > 0 && !StoryImgRx.IsMatch(img)) return CommunityResult.Fail(422, "Ảnh story phải được tải lên qua hệ thống (/media/…).");
        if (text.Length == 0 && img.Length == 0) return CommunityResult.Fail(422, "Story cần có chữ hoặc ảnh.");
        var day = DateTime.UtcNow.AddHours(-24);
        if (await _db.Stories.CountAsync(s => s.UserId == me && s.CreatedAt > day, ct) >= 20) return CommunityResult.Fail(429, "Bạn đã đăng tối đa 20 story trong 24 giờ.");
        _db.Stories.RemoveRange(await _db.Stories.Where(s => s.UserId == me && s.ExpiresAt < DateTime.UtcNow.AddDays(-1)).ToListAsync(ct));   // dọn story đã hết hạn của chính mình
        var cid = await UsableIdAsync(input.Id, "s", id => _db.Stories.AnyAsync(x => x.ClientId == id, ct));
        var s = new Story { ClientId = cid, UserId = me, Text = text.Length == 0 ? null : text, MediaUrl = img.Length == 0 ? null : img, Hue = input.Hue is >= 0 and <= 360 ? input.Hue : Random.Shared.Next(0, 360) };
        _db.Stories.Add(s); await _db.SaveChangesAsync(ct);
        return CommunityResult.Success(new { ok = true, story = new { id = cid, by = me, text = s.Text ?? "", img = s.MediaUrl ?? "", hue = s.Hue, at = Ms(s.CreatedAt) } });
    }

    public async Task<CommunityResult> DeleteStoryAsync(string me, bool isStaff, string storyId, CancellationToken ct = default)
    {
        var s = await _db.Stories.FirstOrDefaultAsync(x => x.ClientId == storyId && (x.UserId == me || isStaff), ct); if (s == null) return CommunityResult.Fail(404, "Không tìm thấy story.");
        _db.Stories.Remove(s); await _db.SaveChangesAsync(ct); return CommunityResult.Success(new { ok = true });
    }
}
