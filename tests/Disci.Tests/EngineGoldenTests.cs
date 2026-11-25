using System.Text.Json;
using Disci.Web.Services.Engine;
using Xunit;

namespace Disci.Tests;

/// <summary>
/// So khớp bản C# với kết quả của engine.js gốc (golden.json do tools/gen-golden.js sinh ra từ chính engine.js).
/// Nếu muốn sinh lại: node tools/gen-golden.js &lt;thư mục assets của DISCI cũ&gt;
/// </summary>
public class EngineGoldenTests
{
    private static readonly JsonSerializerOptions Opt = new() { PropertyNameCaseInsensitive = true };
    private static readonly JsonSerializerOptions Out = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static readonly CatalogSnapshot Cat = CatalogSnapshot.FromJsonDirectory(Path.Combine(AppContext.BaseDirectory, "Seed"));
    private static readonly DisciEngine Eng = new(Cat);
    private static readonly JsonElement Root = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Golden", "golden.json"))).RootElement;
    private const long Now = 1700000000000;

    private static T Get<T>(JsonElement e, string name) => e.GetProperty(name).Deserialize<T>(Opt)!;
    private static string J(object? o) => JsonSerializer.Serialize(o, Out);
    private static void AssertSame(object? expected, object? actual, string what)
        => Assert.True(J(expected) == J(actual), $"{what}\n--- JS (kỳ vọng) ---\n{J(expected)}\n--- C# ---\n{J(actual)}");

    [Fact]
    public void Bmi_Matches()
    {
        foreach (var c in Root.GetProperty("bmi").EnumerateArray())
        {
            double w = c.GetProperty("w").GetDouble(), h = c.GetProperty("h").GetDouble();
            var exp = c.GetProperty("bmi"); var b = DisciEngine.Bmi(w, h);
            if (exp.ValueKind == JsonValueKind.Null) Assert.Null(b); else Assert.Equal(exp.GetDouble(), b);
            Assert.Equal(c.GetProperty("cat").GetString(), DisciEngine.BmiCategory(b).Key);
        }
    }

    [Fact]
    public void Tdee_Matches()
    {
        foreach (var c in Root.GetProperty("tdee").EnumerateArray())
        {
            string sex = c.GetProperty("sex").GetString()!, goal = c.GetProperty("goal").GetString()!;
            double w = c.GetProperty("w").GetDouble(), h = c.GetProperty("h").GetDouble(), age = c.GetProperty("age").GetDouble();
            int act = c.GetProperty("act").GetInt32();
            var td = DisciEngine.Tdee(sex, w, h, age, act);
            Assert.Equal(c.GetProperty("bmr").GetInt32(), DisciEngine.Bmr(sex, w, h, age));
            Assert.Equal(c.GetProperty("tdee").GetInt32(), td);
            Assert.Equal(c.GetProperty("kcal").GetInt32(), DisciEngine.TargetCalories(td, goal, sex));
            Assert.Equal(c.GetProperty("protein").GetInt32(), DisciEngine.ProteinTarget(w, goal));
        }
    }

    [Fact]
    public void AssessRisk_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("risk").EnumerateArray())
            AssertSame(Get<RiskResult>(c, "result"), DisciEngine.AssessRisk(Get<RiskInput>(c, "input")), $"risk[{i++}]");
    }

    [Fact]
    public void GeneratePlan_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("plans").EnumerateArray())
        {
            var risk = DisciEngine.AssessRisk(Get<RiskInput>(c, "riskInput"));
            AssertSame(Get<WorkoutPlanModel>(c, "plan"), Eng.GeneratePlan(Get<TrainingProfile>(c, "profile"), risk, Now), $"plans[{i++}]");
        }
    }

    [Fact]
    public void AdaptPlan_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("adapt").EnumerateArray())
        {
            var risk = DisciEngine.AssessRisk(Get<RiskInput>(c, "riskInput"));
            var actual = Eng.AdaptPlan(Get<WorkoutPlanModel>(c, "plan"), Get<TrainingProfile>(c, "profile"), risk, Now + 1);
            AssertSame(Get<AdaptResult>(c, "result"), actual, $"adapt[{i++}]");
        }
    }

    [Fact]
    public void HandleMissed_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("missed").EnumerateArray())
        {
            var actual = DisciEngine.HandleMissed(Get<WorkoutPlanModel>(c, "plan"), c.GetProperty("missedDate").GetString()!, c.GetProperty("today").GetString()!);
            var exp = c.GetProperty("result").ValueKind == JsonValueKind.Null ? null : Get<MissedResult>(c, "result");
            AssertSame(exp, actual, $"missed[{i++}]");
        }
    }

    [Fact]
    public void Streak_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("streak").EnumerateArray())
            AssertSame(Get<StreakResult>(c, "result"), DisciEngine.StreakOf(Get<List<SessionRecord>>(c, "sessions"), c.GetProperty("today").GetString()!), $"streak[{i++}]");
    }

    [Fact]
    public void AnalyzeProgress_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("progress").EnumerateArray())
            AssertSame(Get<ProgressResult>(c, "result"), Eng.AnalyzeProgress(Get<ProgressInput>(c, "input")), $"progress[{i++}]");
    }

    [Fact]
    public void NutritionAdvice_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("nutrition").EnumerateArray())
            AssertSame(Get<NutritionAdviceResult>(c, "result"), DisciEngine.NutritionAdvice(Get<NutritionProfile>(c, "profile"), c.GetProperty("risk").GetProperty("level").GetInt32()), $"nutrition[{i++}]");
    }

    [Fact]
    public void PlanMenu_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("menu").EnumerateArray())
        {
            var m = Eng.PlanMenu(c.GetProperty("kcal").GetDouble(), c.GetProperty("seed").GetInt32());
            Assert.True(Get<List<string>>(c, "ids").SequenceEqual(m.Meals.Select(x => x.Id)), $"menu[{i}] ids");
            AssertSame(Get<MenuTotal>(c, "total"), m.Total, $"menu[{i}] total"); i++;
        }
    }

    [Fact]
    public void RecommendProducts_Matches()
    {
        int i = 0;
        foreach (var c in Root.GetProperty("products").EnumerateArray())
        {
            var q = Get<ProductQuery>(c, "query");
            var recs = Eng.RecommendProducts(q);
            var exp = c.GetProperty("recs").EnumerateArray().Select(r => new { id = r.GetProperty("id").GetString(), score = r.GetProperty("score").GetDouble(), reason = r.GetProperty("reason").GetString() }).ToList();
            var act = recs.Select(r => new { id = (string?)r.Product.Id, score = r.Score, reason = (string?)r.Reason }).ToList();
            AssertSame(exp, act, $"products[{i}] recs");
            var kit = DisciEngine.BuildStarterKit(recs, q.Budget ?? 1000000);
            Assert.True(Get<List<string>>(c.GetProperty("kit"), "ids").SequenceEqual(kit.Items.Select(x => x.Id)), $"products[{i}] kit");
            Assert.Equal(c.GetProperty("kit").GetProperty("total").GetDouble(), kit.Total); i++;
        }
    }

    [Fact]
    public void CostVsGym_Matches()
    {
        var g = Root.GetProperty("gym").EnumerateArray().ToList();
        var a = DisciEngine.CostVsGym(500000, 6); var b = DisciEngine.CostVsGym(1200000, 12, 400000);
        Assert.Equal(g[0].GetProperty("gym").GetDouble(), a.Gym); Assert.Equal(g[0].GetProperty("breakEvenMonths").GetDouble(), a.BreakEvenMonths);
        Assert.Equal(g[1].GetProperty("saving").GetDouble(), b.Saving); Assert.Equal(g[1].GetProperty("breakEvenMonths").GetDouble(), b.BreakEvenMonths);
    }
}
