using System.ComponentModel.DataAnnotations;

namespace Disci.Web.Models.Entities;

public class ExerciseCategory
{
    [Key, MaxLength(20)] public string Key { get; set; } = "";     // nguc, lung, vai, tay, bung, chan, cardio, toanthan, gian
    [Required, MaxLength(60)] public string Name { get; set; } = "";
    [MaxLength(40)] public string? Icon { get; set; }
}

public class Exercise
{
    [Key, MaxLength(40)] public string Id { get; set; } = "";
    [Required, MaxLength(20)] public string CategoryKey { get; set; } = "";
    public ExerciseCategory Category { get; set; } = null!;
    [Required, MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(200)] public string Muscles { get; set; } = "";
    [Range(1, 3)] public int Level { get; set; } = 1;
    public string EquipJson { get; set; } = "[]";
    public string TagsJson { get; set; } = "[]";
    [Required, MaxLength(10)] public string Kind { get; set; } = "reps";     // reps | time
    [Range(1, 20)] public int Sets { get; set; }
    [Range(1, 600)] public int Amt { get; set; }
    [Range(0, 600)] public int Rest { get; set; }
    public bool Quiet { get; set; }
    public string StepsJson { get; set; } = "[]";
    public string MistakesJson { get; set; } = "[]";
    [MaxLength(40)] public string? ReplacementId { get; set; }
    public Exercise? Replacement { get; set; }
    [MaxLength(500)] public string? Warning { get; set; }
    public double Met { get; set; } = 4;
    [MaxLength(300)] public string? ImageUrl { get; set; }
    [MaxLength(300)] public string? VideoUrl { get; set; }
    public string ExtraJson { get; set; } = "{}";                            // trường mở rộng của giao diện (ví dụ videoKey) – giữ nguyên khi đọc lại
    public bool IsActive { get; set; } = true;
    public bool IsCustom { get; set; }                                       // do quản trị thêm
}

/// <summary>Mỗi lần tạo/điều chỉnh lịch là một phiên bản mới; bản cũ giữ lại (Active=false) để xem lịch sử và khôi phục.</summary>
public class WorkoutPlan
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public int Version { get; set; } = 1;
    [Range(1, 3)] public int RiskLevel { get; set; } = 1;
    [MaxLength(20)] public string Goal { get; set; } = "health";
    public int DaysPerWeek { get; set; }
    public int Minutes { get; set; }
    public bool Quiet { get; set; }
    public bool Active { get; set; } = true;
    public string ReasonsJson { get; set; } = "[]";
    public string ChangeLogJson { get; set; } = "[]";
    [MaxLength(40)] public string? ClientId { get; set; }      // id lịch do giao diện sinh (p<epoch>)
    public int HistorySeq { get; set; }                        // 0 = bản mới nhất trong lịch sử (Active = false)
    public string RawJson { get; set; } = "{}";                // lịch nguyên vẹn (nguồn chuẩn khi đọc lại)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<WorkoutDay> Days { get; set; } = new();
}

public class WorkoutDay
{
    public long Id { get; set; }
    public long PlanId { get; set; }
    public WorkoutPlan Plan { get; set; } = null!;
    [Range(0, 6)] public int Dow { get; set; }                               // 0 = Thứ 2 … 6 = CN
    [Required, MaxLength(10)] public string Type { get; set; } = "rest";    // rest | workout
    [MaxLength(20)] public string Focus { get; set; } = "rest";
    [MaxLength(80)] public string Title { get; set; } = "";
    [MaxLength(80)] public string? Target { get; set; }
    public int Minutes { get; set; }
    public string EntriesJson { get; set; } = "[]";                          // [{id,sets,amt,rest,kind}]
}

/// <summary>Chỉnh tay của người dùng trên lịch: đổi ngày, đánh dấu nghỉ, thêm buổi.</summary>
public class WorkoutScheduleOverride
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly Date { get; set; }
    [Required, MaxLength(20)] public string Action { get; set; } = "";     // move | rest | add | skip
    public string PayloadJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class WorkoutSession
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public long? PlanId { get; set; }
    public WorkoutPlan? Plan { get; set; }
    public DateOnly DoneOn { get; set; }
    [MaxLength(120)] public string? Title { get; set; }
    [Range(0, 600)] public int Minutes { get; set; }
    [Range(0, 5000)] public int Calories { get; set; }
    [Range(1, 10)] public int? Rpe { get; set; }
    [Required, MaxLength(12)] public string Status { get; set; } = "done";  // done | skipped
    [MaxLength(10)] public string Source { get; set; } = "player";          // player | manual
    [MaxLength(500)] public string? Note { get; set; }
    [MaxLength(40)] public string? ClientId { get; set; }
    public string RawJson { get; set; } = "{}";
    public List<WorkoutSessionDetail> Details { get; set; } = new();
}

public class WorkoutSessionDetail
{
    public long Id { get; set; }
    public long SessionId { get; set; }
    public WorkoutSession Session { get; set; } = null!;
    [Required, MaxLength(40)] public string ExerciseId { get; set; } = "";
    public Exercise Exercise { get; set; } = null!;
    public int SetsDone { get; set; }
    public int RepsDone { get; set; }
    public int SecondsDone { get; set; }
}

public class ProgressRecord
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly WeekStart { get; set; }
    public int Sessions { get; set; }
    public int Minutes { get; set; }
    [Range(0, 100)] public int CompletionPct { get; set; }
}

public class BadgeDefinition
{
    [Key, MaxLength(30)] public string Id { get; set; } = "";
    [Required, MaxLength(80)] public string Name { get; set; } = "";
    [MaxLength(40)] public string Icon { get; set; } = "";
    [Required, MaxLength(40)] public string Test { get; set; } = "";        // ví dụ sessions>=10
}

public class UserBadge
{
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(30)] public string BadgeId { get; set; } = "";
    public BadgeDefinition Badge { get; set; } = null!;
    public DateTime EarnedAt { get; set; } = DateTime.UtcNow;
}

public class NutritionPlan
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly PlanDate { get; set; }
    public int TargetKcal { get; set; }
    public int TargetProteinG { get; set; }
}

public class FoodItem
{
    [Key, MaxLength(30)] public string Id { get; set; } = "";
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Required, MaxLength(10)] public string Slot { get; set; } = "";        // sang | trua | toi | phu
    public int Kcal { get; set; }
    public int ProteinG { get; set; }
    public int EstCostVnd { get; set; }
    public string IngredientsJson { get; set; } = "[]";
    [MaxLength(40)] public string? Icon { get; set; }
    public string ExtraJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
}

/// <summary>Nhật ký ăn uống: món trong danh mục (FoodItemId) hoặc món tự nhập (CustomName).</summary>
public class NutritionLog
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    public DateOnly LogDate { get; set; }
    [MaxLength(30)] public string? FoodItemId { get; set; }
    public FoodItem? FoodItem { get; set; }
    [MaxLength(150)] public string? CustomName { get; set; }
    [Range(0, 5000)] public int Kcal { get; set; }
    [Range(0, 500)] public int ProteinG { get; set; }
    public int Position { get; set; }                                        // thứ tự trong ngày (giao diện xóa theo chỉ số)
    public string RawJson { get; set; } = "{}";                              // mục nhật ký nguyên vẹn từ giao diện
}
