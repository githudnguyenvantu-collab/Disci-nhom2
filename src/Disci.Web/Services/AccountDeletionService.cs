using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services;

public interface IAccountDeletionService { Task<IdentityResult> DeleteAsync(ApplicationUser user, CancellationToken ct = default); }

/// <summary>
/// Xóa tài khoản và dữ liệu liên quan. Các khóa ngoại mặc định RESTRICT nên phải xóa tường minh theo thứ tự:
/// dữ liệu thứ cấp (bình luận/thích/theo dõi/tin nhắn/báo cáo/đơn hàng...) → buổi tập → nhóm sở hữu → tài khoản (phần còn lại CASCADE).
/// </summary>
public sealed class AccountDeletionService : IAccountDeletionService
{
    private readonly ApplicationDbContext _db; private readonly UserManager<ApplicationUser> _users; private readonly Media.IMediaService? _media;
    public AccountDeletionService(ApplicationDbContext db, UserManager<ApplicationUser> users, Media.IMediaService? media = null) { _db = db; _users = users; _media = media; }

    public async Task<IdentityResult> DeleteAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var id = user.Id;
        // SQLite/InMemory dùng trong test không hỗ trợ mọi kiểu giao dịch; SQL Server thì có.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var ownPosts = _db.Posts.Where(p => p.UserId == id).Select(p => p.Id);
        await _db.Reports.Where(r => r.ReporterId == id || (r.PostId != null && ownPosts.Contains(r.PostId.Value))).ExecuteDeleteAsync(ct);
        await _db.Comments.Where(c => c.UserId == id).ExecuteDeleteAsync(ct);
        await _db.PostLikes.Where(x => x.UserId == id).ExecuteDeleteAsync(ct);
        await _db.PostSaves.Where(x => x.UserId == id).ExecuteDeleteAsync(ct);
        await _db.PostShares.Where(x => x.UserId == id).ExecuteDeleteAsync(ct);
        await _db.Follows.Where(f => f.FolloweeId == id || f.FollowerId == id).ExecuteDeleteAsync(ct);
        await _db.Friendships.Where(f => f.FriendId == id || f.UserId == id).ExecuteDeleteAsync(ct);
        await _db.DirectMessages.Where(m => m.SenderId == id || m.ReceiverId == id).ExecuteDeleteAsync(ct);
        await _db.GroupMessages.Where(m => m.UserId == id).ExecuteDeleteAsync(ct);
        await _db.OrderItems.Where(i => i.Order.UserId == id).ExecuteDeleteAsync(ct);
        await _db.Orders.Where(o => o.UserId == id).ExecuteDeleteAsync(ct);
        await _db.WorkoutSessionDetails.Where(d => d.Session.UserId == id).ExecuteDeleteAsync(ct);
        await _db.WorkoutSessions.Where(s => s.UserId == id).ExecuteDeleteAsync(ct);
        var ownedGroups = _db.Groups.Where(g => g.OwnerId == id).Select(g => g.Id);
        await _db.Posts.Where(p => p.GroupId != null && ownedGroups.Contains(p.GroupId.Value) && p.UserId != id).ExecuteUpdateAsync(s => s.SetProperty(p => p.GroupId, (long?)null), ct);
        await _db.Groups.Where(g => g.OwnerId == id).ExecuteDeleteAsync(ct);
        if (_media != null) await _media.DeleteAllOfUserAsync(id, ct);              // xóa cả file vật lý
        else await _db.MediaAssets.Where(m => m.OwnerId == id).ExecuteDeleteAsync(ct);

        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded) { await tx.RollbackAsync(ct); return result; }
        await tx.CommitAsync(ct);
        return result;
    }
}
