using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Community;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Disci.Web.Controllers;

public sealed class CommentRequest { public string? Id { get; set; } public string? Text { get; set; } }
public sealed class ReportRequest { public string? Reason { get; set; } }
public sealed class ReadRequest { public List<string>? Ids { get; set; } }
public sealed class MessageRequest { public string? Text { get; set; } }

/// <summary>
/// API cộng đồng. Danh tính luôn lấy từ cookie đăng nhập (không nhận userId từ trình duyệt), nên không thể thích/bình luận/theo dõi thay người khác.
/// Mọi kiểm tra quyền xem bài và quyền sửa nhóm nằm trong CommunityService.
/// </summary>
[Authorize] [Route("api/community")] [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class CommunityController : Controller
{
    private readonly ICommunityService _svc; private readonly UserManager<ApplicationUser> _users;
    public CommunityController(ICommunityService svc, UserManager<ApplicationUser> users) { _svc = svc; _users = users; }

    private async Task<(string? Id, bool Staff)> WhoAsync()
    {
        var u = await _users.GetUserAsync(User);
        if (u is not { IsActive: true, DeletedAt: null }) return (null, false);
        return (u.Id, (await _users.GetRolesAsync(u)).Any(r => r is Roles.Admin or Roles.Editor or Roles.Moderator));
    }
    private IActionResult Out(CommunityResult r) => r.Ok ? Json(r.Data ?? new { ok = true }) : StatusCode(r.Status, new { ok = false, message = r.Error });

    [HttpGet("snapshot")]
    public async Task<IActionResult> Snapshot(CancellationToken ct) { var (id, staff) = await WhoAsync(); if (id == null) return Unauthorized(); var s = await _svc.GetSnapshotAsync(id, staff, ct); s["ok"] = true; return Content(s.ToJsonString(), "application/json"); }

    [HttpGet("notifications")]
    public async Task<IActionResult> Notifications(CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Content(new System.Text.Json.Nodes.JsonObject { ["ok"] = true, ["notifs"] = await _svc.GetNotificationsAsync(id, ct), ["announcements"] = await _svc.GetAnnouncementsAsync(id, ct) }.ToJsonString(), "application/json"); }

    [HttpPost("notifications/read")]
    public async Task<IActionResult> Read([FromBody] ReadRequest? req, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.MarkNotificationsReadAsync(id, req?.Ids, ct)); }

    [HttpPost("posts/{postId}/like")]
    public async Task<IActionResult> Like(string postId, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.ToggleLikeAsync(id, st, postId, ct)); }

    [HttpPost("posts/{postId}/comments")]
    public async Task<IActionResult> Comment(string postId, [FromBody] CommentRequest? req, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.AddCommentAsync(id, st, postId, req?.Text, req?.Id, ct)); }

    [HttpDelete("comments/{commentId}")]
    public async Task<IActionResult> DeleteComment(string commentId, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.DeleteCommentAsync(id, commentId, ct)); }

    [HttpPost("posts/{postId}/share")]
    public async Task<IActionResult> Share(string postId, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.ShareAsync(id, st, postId, ct)); }

    [HttpPost("posts/{postId}/report")]
    public async Task<IActionResult> Report(string postId, [FromBody] ReportRequest? req, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.ReportAsync(id, st, postId, req?.Reason, ct)); }

    [HttpPost("follow/{userId}")]
    public async Task<IActionResult> Follow(string userId, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.ToggleFollowAsync(id, userId, ct)); }

    [HttpPost("groups")]
    public async Task<IActionResult> CreateGroup([FromBody] GroupInput? input, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.CreateGroupAsync(id, input ?? new GroupInput(), ct)); }

    [HttpPost("groups/{groupId}/join")]
    public async Task<IActionResult> JoinGroup(string groupId, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.ToggleJoinGroupAsync(id, groupId, ct)); }

    [HttpPut("groups/{groupId}")]
    public async Task<IActionResult> UpdateGroup(string groupId, [FromBody] GroupInput? input, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.UpdateGroupAsync(id, st, groupId, input ?? new GroupInput(), ct)); }

    [HttpDelete("groups/{groupId}")]
    public async Task<IActionResult> DeleteGroup(string groupId, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.DeleteGroupAsync(id, st, groupId, ct)); }

    [HttpPost("challenges/{challengeId}/join")]
    public async Task<IActionResult> JoinChallenge(string challengeId, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.SetChallengeAsync(id, challengeId, true, ct)); }

    [HttpPost("challenges/{challengeId}/leave")]
    public async Task<IActionResult> LeaveChallenge(string challengeId, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.SetChallengeAsync(id, challengeId, false, ct)); }

    // ---- Tin nhắn nhóm / tin nhắn riêng ----
    [HttpGet("chat/g/{groupId}")] public async Task<IActionResult> GroupChat(string groupId, long? after, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.GetGroupMessagesAsync(id, groupId, after, ct)); }
    [HttpPost("chat/g/{groupId}")] public async Task<IActionResult> GroupSend(string groupId, [FromBody] MessageRequest? req, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.SendGroupMessageAsync(id, groupId, req?.Text, ct)); }
    [HttpGet("chat/u/{userId}")] public async Task<IActionResult> DirectChat(string userId, long? after, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.GetDirectMessagesAsync(id, userId, after, ct)); }
    [HttpPost("chat/u/{userId}")] public async Task<IActionResult> DirectSend(string userId, [FromBody] MessageRequest? req, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.SendDirectMessageAsync(id, userId, req?.Text, ct)); }

    // ---- Stories ----
    [HttpPost("stories")] public async Task<IActionResult> AddStory([FromBody] StoryInput? input, CancellationToken ct) { var (id, _) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.AddStoryAsync(id, input ?? new StoryInput(), ct)); }
    [HttpDelete("stories/{storyId}")] public async Task<IActionResult> DeleteStory(string storyId, CancellationToken ct) { var (id, st) = await WhoAsync(); if (id == null) return Unauthorized(); return Out(await _svc.DeleteStoryAsync(id, st, storyId, ct)); }
}
