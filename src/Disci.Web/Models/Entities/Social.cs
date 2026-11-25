using System.ComponentModel.DataAnnotations;

namespace Disci.Web.Models.Entities;

public class Post
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public ApplicationUser User { get; set; } = null!;
    [MaxLength(40)] public string? Topic { get; set; }
    [Required, MaxLength(5000)] public string Body { get; set; } = "";
    [MaxLength(300)] public string? MediaUrl { get; set; }
    [MaxLength(300)] public string? ThumbUrl { get; set; }
    [MaxLength(10)] public string? MediaType { get; set; }                   // image | video | link
    [Required, MaxLength(12)] public string Visibility { get; set; } = "public";   // public | friends | private
    public bool IsDraft { get; set; }
    public bool Edited { get; set; }
    public bool Hidden { get; set; }                                         // bị ẩn do báo cáo/kiểm duyệt
    public bool IsDemo { get; set; }
    public long? GroupId { get; set; }
    public Group? Group { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }                    // id bài viết do giao diện sinh (ST.uid) – dùng trong URL/liên kết
    public string RawJson { get; set; } = "{}";                              // bài nguyên vẹn (nguồn chuẩn khi đọc lại)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<Comment> Comments { get; set; } = new();
}

public class Comment
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public Post Post { get; set; } = null!;
    [Required] public string UserId { get; set; } = "";
    public ApplicationUser User { get; set; } = null!;
    [Required, MaxLength(2000)] public string Body { get; set; } = "";
    public bool Hidden { get; set; }
    public bool IsDemo { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class PostLike { public long PostId { get; set; } public Post Post { get; set; } = null!; [Required] public string UserId { get; set; } = ""; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; }
public class PostSave { public long PostId { get; set; } public Post Post { get; set; } = null!; [Required] public string UserId { get; set; } = ""; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; }
public class PostShare { public long Id { get; set; } public long PostId { get; set; } public Post Post { get; set; } = null!; [Required] public string UserId { get; set; } = ""; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; }

public class Follow { [Required] public string FollowerId { get; set; } = ""; [Required] public string FolloweeId { get; set; } = ""; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; }
public class Friendship { [Required] public string UserId { get; set; } = ""; [Required] public string FriendId { get; set; } = ""; [Required, MaxLength(12)] public string Status { get; set; } = "pending"; }

public class Story
{
    public long Id { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    public int? Hue { get; set; }
    [Required] public string UserId { get; set; } = "";
    [MaxLength(300)] public string? MediaUrl { get; set; }
    [MaxLength(300)] public string? Text { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(24);
}

public class Group
{
    public long Id { get; set; }
    [Required, MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(500)] public string? Description { get; set; }
    [MaxLength(300)] public string? CoverUrl { get; set; }
    [Required] public string OwnerId { get; set; } = "";
    [MaxLength(40)] public string? ClientId { get; set; }
    public int? Hue { get; set; }
    public bool IsPublic { get; set; } = true;
    public bool IsDemo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class GroupMember { public long GroupId { get; set; } public Group Group { get; set; } = null!; [Required] public string UserId { get; set; } = ""; [MaxLength(12)] public string Role { get; set; } = "member"; public DateTime JoinedAt { get; set; } = DateTime.UtcNow; }

public class Challenge
{
    [Key, MaxLength(30)] public string Id { get; set; } = "";
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    public int Days { get; set; }
    public int Goal { get; set; }
    [Required, MaxLength(20)] public string Metric { get; set; } = "";       // streak | sessions30 | sessions28 | sessions | minutes | manual
    [MaxLength(500)] public string? Description { get; set; }
    [MaxLength(150)] public string? Reward { get; set; }
    public string ExtraJson { get; set; } = "{}";
    public int DemoMembers { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ChallengeParticipant { [Required, MaxLength(30)] public string ChallengeId { get; set; } = ""; public Challenge Challenge { get; set; } = null!; [Required] public string UserId { get; set; } = ""; public DateOnly JoinedOn { get; set; } }

public class DirectMessage
{
    public long Id { get; set; }
    [Required] public string SenderId { get; set; } = "";
    [Required] public string ReceiverId { get; set; } = "";
    [Required, MaxLength(2000)] public string Body { get; set; } = "";
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Report
{
    public long Id { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    [Required] public string ReporterId { get; set; } = "";
    public long? PostId { get; set; }
    public Post? Post { get; set; }
    public long? CommentId { get; set; }
    [Required, MaxLength(60)] public string Reason { get; set; } = "";
    [MaxLength(500)] public string? Detail { get; set; }
    [Required, MaxLength(12)] public string Status { get; set; } = "open";   // open | resolved | dismissed
    public string? HandledBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Notification
{
    public long Id { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    [MaxLength(20)] public string Type { get; set; } = "";                   // like | comment | share | follow | mod
    [MaxLength(450)] public string? FromUserId { get; set; }                 // người gây ra thông báo (không ràng buộc FK để giữ lịch sử)
    [MaxLength(40)] public string? PostClientId { get; set; }
    [Required] public string UserId { get; set; } = "";
    [MaxLength(150)] public string Title { get; set; } = "";
    [MaxLength(500)] public string? Body { get; set; }
    [MaxLength(200)] public string? Link { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Thông báo hệ thống do quản trị gửi tới tất cả hoặc một nhóm người dùng.</summary>
public class Announcement
{
    public long Id { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    [MaxLength(200)] public string? Link { get; set; }                       // trang đích (đường dẫn tương đối, không có scheme)
    [MaxLength(20)] public string Kind { get; set; } = "info";
    [Required, MaxLength(150)] public string Title { get; set; } = "";
    [MaxLength(1000)] public string? Body { get; set; }
    [MaxLength(60)] public string Audience { get; set; } = "all";           // all | role:<vai trò> | user:<id>
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
}

/// <summary>Tin nhắn trong nhóm (chỉ thành viên nhóm đọc/gửi được).</summary>
public class GroupMessage
{
    public long Id { get; set; }
    public long GroupId { get; set; }
    public Group Group { get; set; } = null!;
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(500)] public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
