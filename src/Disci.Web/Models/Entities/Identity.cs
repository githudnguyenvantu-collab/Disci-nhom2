using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace Disci.Web.Models.Entities;

/// <summary>Tài khoản (ASP.NET Core Identity). Vai trò: Admin, Editor, Moderator, User (bảng AspNetRoles).</summary>
public class ApplicationUser : IdentityUser
{
    [Required, MaxLength(120)] public string FullName { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public DateTime? DeletedAt { get; set; }            // xóa mềm
    public bool IsActive { get; set; } = true;          // quản trị có thể khóa tài khoản
    public bool IsDemo { get; set; }                    // tài khoản do Demo Data Center tạo
    public bool MustChangePassword { get; set; }        // đặt khi quản trị tạo/đặt lại mật khẩu tạm: buộc đổi ở lần đăng nhập đầu
    public UserProfile? Profile { get; set; }
}

/// <summary>Hồ sơ & khảo sát (thay cho disci:u:{id}.profile và disci:onb:*).</summary>
public class UserProfile
{
    [Key] public string UserId { get; set; } = "";
    public ApplicationUser User { get; set; } = null!;
    [MaxLength(10)] public string? Sex { get; set; }              // male | female
    [Range(13, 100)] public int? Age { get; set; }
    [Range(100, 250)] public double? HeightCm { get; set; }
    [MaxLength(20)] public string? Goal { get; set; }             // fatloss | muscle | endurance | health
    [Range(25, 300)] public double? GoalWeightKg { get; set; }
    [Range(2, 6)] public int? DaysPerWeek { get; set; }
    [Range(15, 90)] public int? MinutesPerSession { get; set; }
    [MaxLength(20)] public string? Place { get; set; }            // home | dorm | outdoor | gym
    public string EquipmentJson { get; set; } = "[]";
    [Range(0, 1_000_000_000)] public int? BudgetVnd { get; set; }
    [Range(1, 4)] public int? Activity { get; set; }
    [Range(1, 3)] public int? Level { get; set; }
    public bool QuietMode { get; set; }
    [MaxLength(300)] public string? AvatarUrl { get; set; }
    [MaxLength(300)] public string? CoverUrl { get; set; }
    [MaxLength(500)] public string? Bio { get; set; }
    public bool OnboardingCompleted { get; set; }
    public string? OnboardingDraftJson { get; set; }              // nháp khảo sát (giữ khi tải lại trang)
    public string PrivacyJson { get; set; } = "{}";
    public string ReminderJson { get; set; } = "{}";
    /// <summary>Các trường hồ sơ chưa có cột riêng (weight, space, phone, area, birth, city, avatar/cover dạng data-URL tạm...). Chuẩn hóa dần ở các lượt sau.</summary>
    public string ExtraJson { get; set; } = "{}";
    /// <summary>Tăng sau mỗi lần ghi trạng thái; là concurrency token để hai request song song không ghi đè lẫn nhau.</summary>
    [ConcurrencyCheck] public long StateVersion { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class BodyMetric
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly MeasuredOn { get; set; }
    [Range(25, 300)] public double WeightKg { get; set; }
    [Range(30, 250)] public double? WaistCm { get; set; }
    [Range(30, 250)] public double? HipCm { get; set; }
    [MaxLength(300)] public string? Note { get; set; }
    /// <summary>Bản ghi nguyên vẹn từ giao diện (nguồn chuẩn khi đọc lại); các cột còn lại là bản chiếu phục vụ truy vấn/kiểm tra.</summary>
    public string RawJson { get; set; } = "{}";
}

/// <summary>Đồng ý riêng cho từng loại dữ liệu sức khỏe (bp | rhr | checkup). Chưa đồng ý thì không dùng.</summary>
public class HealthConsent
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(20)] public string DataType { get; set; } = "";
    public bool Granted { get; set; }
    public DateTime DecidedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Kết quả khám/huyết áp/nhịp tim. ValueProtected được mã hóa bằng ASP.NET Core Data Protection ở tầng service.</summary>
public class HealthRecord
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly RecordedOn { get; set; }
    [Required, MaxLength(30)] public string Kind { get; set; } = "";
    [Required] public string ValueProtected { get; set; } = "";
}
