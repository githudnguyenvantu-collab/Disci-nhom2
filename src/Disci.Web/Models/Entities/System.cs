using System.ComponentModel.DataAnnotations;

namespace Disci.Web.Models.Entities;

/// <summary>Cấu hình hệ thống & giao diện (thay cho assets/site-config.js, tùy chỉnh giao diện trong Admin).</summary>
public class SystemSetting
{
    [Key, MaxLength(80)] public string Key { get; set; } = "";
    public string ValueJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(450)] public string? UpdatedBy { get; set; }
}

public class AuditLog
{
    public long Id { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
    [MaxLength(450)] public string? ActorId { get; set; }
    [MaxLength(256)] public string? ActorEmail { get; set; }
    [Required, MaxLength(60)] public string Action { get; set; } = "";
    [MaxLength(60)] public string? EntityType { get; set; }
    [MaxLength(60)] public string? EntityId { get; set; }
    [MaxLength(1000)] public string? Detail { get; set; }
    [MaxLength(45)] public string? Ip { get; set; }
}

public class BackupRecord
{
    public long Id { get; set; }
    [Required, MaxLength(200)] public string FileName { get; set; } = "";
    public long SizeBytes { get; set; }
    [MaxLength(450)] public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(300)] public string? Note { get; set; }
}

/// <summary>Sổ đăng ký file đã tải lên (ảnh/video). File lưu ngoài DB; DB chỉ giữ metadata.</summary>
public class MediaAsset
{
    public long Id { get; set; }
    public string? OwnerId { get; set; }
    [Required, MaxLength(20)] public string Purpose { get; set; } = "";      // avatar | cover | post | product | exercise-video | banner | ...
    [Required, MaxLength(255)] public string OriginalName { get; set; } = "";
    [Required, MaxLength(100)] public string StoredName { get; set; } = "";  // GUID + phần mở rộng đã kiểm tra
    [Required, MaxLength(100)] public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    [MaxLength(64)] public string? Sha256 { get; set; }
    public int? DurationSeconds { get; set; }
    [MaxLength(10)] public string Kind { get; set; } = "image";             // image | video
    [MaxLength(120)] public string? ClientKey { get; set; }                  // khóa do giao diện đặt (ví dụ video bài viết/bài tập)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Kho khóa-giá trị theo người dùng cho các mảng dữ liệu chưa được chuẩn hóa thành bảng riêng (thông báo, cộng đồng cục bộ, giỏ hàng...).
/// Giai đoạn chuyển tiếp: dữ liệu nằm trong SQL Server (không còn ở localStorage) nhưng chưa quan hệ hóa. Khóa nhạy cảm được mã hóa (IsProtected).
/// </summary>
public class UserDataBlob
{
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(40)] public string Key { get; set; } = "";
    public string Value { get; set; } = "null";
    public bool IsProtected { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
