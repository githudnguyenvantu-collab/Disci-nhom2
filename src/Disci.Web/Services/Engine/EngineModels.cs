using System.Text.Json;
using System.Text.Json.Serialization;

namespace Disci.Web.Services.Engine;

/// <summary>Bài tập trong thư viện (nguồn: assets/data.js → EXERCISES).</summary>
public sealed class ExerciseDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Cat { get; set; } = "";
    public string Muscles { get; set; } = "";
    public int Level { get; set; }
    public List<string> Equip { get; set; } = new();
    public string Kind { get; set; } = "reps";        // reps | time
    public int Sets { get; set; }
    public int Amt { get; set; }
    public int Rest { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool Quiet { get; set; }
    public List<string> Steps { get; set; } = new();
    public List<string> Mistakes { get; set; } = new();
    public string? Rep { get; set; }                    // id bài thay thế
    public string? Warn { get; set; }
    public double Met { get; set; } = 4;
}

public sealed class ProductDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Cat { get; set; } = "";
    public int Price { get; set; }
    public string? Desc { get; set; }
    public string? Unlocks { get; set; }
    public List<string> Goals { get; set; } = new();
    public string Space { get; set; } = "small";
    public string Prio { get; set; } = "";
    public string? Icon { get; set; }
    public List<string> Specs { get; set; } = new();
    public string? How { get; set; }
    public string? ForWho { get; set; }
    public string? Note { get; set; }
    public bool Custom { get; set; }
}

public sealed class MealDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slot { get; set; } = "";
    public int Kcal { get; set; }
    public int Protein { get; set; }
    public int Cost { get; set; }
    public List<string> Ing { get; set; } = new();
    public string? Icon { get; set; }
}

public sealed class BadgeDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Test { get; set; } = "";
}

/// <summary>Ảnh chụp danh mục (bài tập, sản phẩm, món ăn, huy hiệu) dùng làm đầu vào cho engine. Engine không chạm DB.</summary>
public sealed class CatalogSnapshot
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private readonly Dictionary<string, ExerciseDef> _byId;

    public IReadOnlyList<ExerciseDef> Exercises { get; }
    public IReadOnlyList<ProductDef> Products { get; }
    public IReadOnlyList<MealDef> Meals { get; }
    public IReadOnlyList<BadgeDef> Badges { get; }
    public IReadOnlyDictionary<string, string> Goals { get; }
    public IReadOnlyDictionary<string, string> Equip { get; }

    public CatalogSnapshot(IEnumerable<ExerciseDef> ex, IEnumerable<ProductDef> pr, IEnumerable<MealDef> me,
        IEnumerable<BadgeDef> ba, IReadOnlyDictionary<string, string> goals, IReadOnlyDictionary<string, string> equip)
    {
        Exercises = ex.ToList(); Products = pr.ToList(); Meals = me.ToList(); Badges = ba.ToList();
        Goals = goals; Equip = equip;
        _byId = Exercises.ToDictionary(e => e.Id);
    }

    public ExerciseDef? ExById(string? id) => id != null && _byId.TryGetValue(id, out var e) ? e : null;

    /// <summary>Nạp từ thư mục chứa exercises.json, products.json, meals.json, badges.json, reference.json.</summary>
    public static CatalogSnapshot FromJsonDirectory(string dir)
    {
        T Read<T>(string f) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(dir, f)), Json)!;
        using var refDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "reference.json")));
        Dictionary<string, string> Dict(string name) =>
            refDoc.RootElement.GetProperty(name).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");
        return new CatalogSnapshot(Read<List<ExerciseDef>>("exercises.json"), Read<List<ProductDef>>("products.json"),
            Read<List<MealDef>>("meals.json"), Read<List<BadgeDef>>("badges.json"), Dict("goals"), Dict("equip"));
    }
}

// ---------- Đầu vào / đầu ra của engine ----------
public sealed class Symptoms { public bool Chest { get; set; } public bool Dizzy { get; set; } public bool Breath { get; set; } public bool Pain { get; set; } public bool Fatigue { get; set; } }

public sealed class RiskInput
{
    public double? Bmi { get; set; }
    public int? Age { get; set; }
    public int? Sbp { get; set; }
    public int? Dbp { get; set; }
    public int? Rhr { get; set; }
    public Symptoms? Symptoms { get; set; }
    public List<string>? Restrictions { get; set; }
}

public sealed class RiskResult
{
    public int Level { get; set; } = 1;
    public string Title { get; set; } = "";
    public List<string> Reasons { get; set; } = new();
    public string Advice { get; set; } = "";
    public List<string> Tags { get; set; } = new();
    public string Disclaimer { get; set; } = "";
}

public sealed class TrainingProfile
{
    public string? Goal { get; set; }
    public int? DaysPerWeek { get; set; }
    public int? Minutes { get; set; }
    public List<string>? Equip { get; set; }
    public int? Level { get; set; }
    public int? Activity { get; set; }
    public bool Quiet { get; set; }
    public string? Place { get; set; }
}

public sealed class PlanEntry
{
    public string Id { get; set; } = "";
    public int Sets { get; set; }
    public int Amt { get; set; }
    public int Rest { get; set; }
    public string Kind { get; set; } = "reps";
    public PlanEntry Clone() => (PlanEntry)MemberwiseClone();
}

public sealed class PlanDay
{
    public int Dow { get; set; }
    public string Type { get; set; } = "rest";       // rest | workout
    public string Title { get; set; } = "";
    public string Focus { get; set; } = "";
    public string? Target { get; set; }
    public List<PlanEntry> Exs { get; set; } = new();
    public int Minutes { get; set; }
    public PlanDay Clone() { var d = (PlanDay)MemberwiseClone(); d.Exs = Exs.Select(e => e.Clone()).ToList(); return d; }
}

public sealed class WorkoutPlanModel
{
    public string Id { get; set; } = "";
    public long CreatedAt { get; set; }
    public int Version { get; set; } = 1;
    public int Level { get; set; } = 1;
    public string Goal { get; set; } = "health";
    public int DaysPerWeek { get; set; }
    public int Minutes { get; set; }
    public bool Quiet { get; set; }
    public List<PlanDay> Days { get; set; } = new();
    public List<string> Reasons { get; set; } = new();
    public WorkoutPlanModel Clone() { var p = (WorkoutPlanModel)MemberwiseClone(); p.Days = Days.Select(d => d.Clone()).ToList(); p.Reasons = Reasons.ToList(); return p; }
}

public sealed class PlanChange
{
    public string? Day { get; set; }
    public string From { get; set; } = "";
    public string To { get; set; } = "";
    public string Why { get; set; } = "";
    public string Benefit { get; set; } = "";
}

public sealed class AdaptResult { public WorkoutPlanModel Plan { get; set; } = new(); public List<PlanChange> Changes { get; set; } = new(); }

public sealed class MissedOption { public string Type { get; set; } = ""; public string? ToDate { get; set; } public string Why { get; set; } = ""; }
public sealed class MissedResult { public string Date { get; set; } = ""; public string Title { get; set; } = ""; public List<MissedOption> Options { get; set; } = new(); public string Recommended { get; set; } = ""; }

public sealed class SessionRecord { public string Date { get; set; } = ""; public string Status { get; set; } = "done"; public double? Minutes { get; set; } public double? Calories { get; set; } public double? Rpe { get; set; } }
public sealed class MetricRecord { public string Date { get; set; } = ""; public double? Weight { get; set; } }
public sealed class StreakResult { public int Current { get; set; } public int Best { get; set; } }

public sealed class ProgressInput
{
    public List<SessionRecord>? Sessions { get; set; }
    public List<MetricRecord>? Metrics { get; set; }
    public string Today { get; set; } = "";
    public WorkoutPlanModel? Plan { get; set; }
    public double? GoalWeight { get; set; }
    public string? Goal { get; set; }
    public int? RiskLevel { get; set; }
}

public sealed class WeekStat { public string Start { get; set; } = ""; public int Sessions { get; set; } public double Minutes { get; set; } public int Planned { get; set; } public double? Rpe { get; set; } }

public sealed class ProgressResult
{
    public int Total { get; set; }
    public double Minutes { get; set; }
    public double Calories { get; set; }
    public int Streak { get; set; }
    public int BestStreak { get; set; }
    public List<WeekStat> Weeks { get; set; } = new();
    public int CompletionRate { get; set; }
    public double? WeightFirst { get; set; }
    public double? WeightLast { get; set; }
    public double? WeightDelta { get; set; }
    public double? SlopePerWeek { get; set; }
    public double? GoalGap { get; set; }
    public string Status { get; set; } = "good";
    public List<string> Tips { get; set; } = new();
}

public sealed class BadgeState { public string Id { get; set; } = ""; public string Name { get; set; } = ""; public string Icon { get; set; } = ""; public bool Earned { get; set; } }

public sealed class ProductQuery
{
    public List<string>? Equip { get; set; }
    public int? Level { get; set; }
    public int? Activity { get; set; }
    public bool Quiet { get; set; }
    public string? Place { get; set; }
    public int? RiskLevel { get; set; }
    public List<string>? Tags { get; set; }
    public double? Budget { get; set; }
    public string? Goal { get; set; }
    public string? Space { get; set; }
}
public sealed class ProductRec { public ProductDef Product { get; set; } = new(); public double Score { get; set; } public string Reason { get; set; } = ""; }
public sealed class StarterKit { public List<ProductDef> Items { get; set; } = new(); public double Total { get; set; } }
public sealed class GymCost { public double Home { get; set; } public double Gym { get; set; } public double Saving { get; set; } public double? BreakEvenMonths { get; set; } }

public sealed class MenuTotal { public int Kcal { get; set; } public int Protein { get; set; } public int Cost { get; set; } }
public sealed class MenuPlan { public List<MealDef> Meals { get; set; } = new(); public MenuTotal Total { get; set; } = new(); }

public sealed class NutritionProfile { public string? Sex { get; set; } public double Weight { get; set; } public double Height { get; set; } public double Age { get; set; } public int Activity { get; set; } public string? Goal { get; set; } }
public sealed class NutritionAdviceResult { public bool Blocked { get; set; } public string? Reason { get; set; } public int? Bmr { get; set; } public int? Tdee { get; set; } public int? Kcal { get; set; } public int? Protein { get; set; } }
