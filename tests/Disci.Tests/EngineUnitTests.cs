using Disci.Web.Services.Engine;
using Xunit;

namespace Disci.Tests;

/// <summary>Các kiểm thử độc lập (không dựa vào golden) cho những quy tắc an toàn quan trọng.</summary>
public class EngineUnitTests
{
    private static readonly CatalogSnapshot Cat = CatalogSnapshot.FromJsonDirectory(Path.Combine(AppContext.BaseDirectory, "Seed"));
    private static readonly DisciEngine Eng = new(Cat);

    [Fact] public void Bmi_60kg_170cm_Is_20_8() => Assert.Equal(20.8, DisciEngine.Bmi(60, 170));
    [Fact] public void Bmi_Invalid_Input_Is_Null() { Assert.Null(DisciEngine.Bmi(0, 170)); Assert.Null(DisciEngine.Bmi(60, 0)); }
    [Fact] public void Round_Is_JavaScript_Style_Half_Up() { Assert.Equal(3, DisciEngine.Round(2.5)); Assert.Equal(-2, DisciEngine.Round(-2.5)); Assert.Equal(1.3, DisciEngine.Round1(1.25)); }

    [Fact] public void Risk_Chest_Pain_Is_Level3() => Assert.Equal(3, DisciEngine.AssessRisk(new RiskInput { Symptoms = new Symptoms { Chest = true } }).Level);
    [Fact] public void Risk_Stop_Restriction_Is_Level3() => Assert.Equal(3, DisciEngine.AssessRisk(new RiskInput { Restrictions = new() { "stop" } }).Level);
    [Fact] public void Risk_No_Input_Is_Level1() => Assert.Equal(1, DisciEngine.AssessRisk(new RiskInput()).Level);

    [Fact]
    public void Level3_Plan_Contains_No_Intense_Or_Impact_Exercises()
    {
        var risk = DisciEngine.AssessRisk(new RiskInput { Symptoms = new Symptoms { Dizzy = true } });
        var plan = Eng.GeneratePlan(new TrainingProfile { Goal = "muscle", DaysPerWeek = 6, Minutes = 60, Equip = new() { "dumbbell", "pullup" } }, risk, 1);
        Assert.True(plan.DaysPerWeek <= 4);
        foreach (var e in plan.Days.SelectMany(d => d.Exs))
        {
            var ex = Cat.ExById(e.Id)!;
            Assert.DoesNotContain(ex.Tags, t => risk.Tags.Contains(t));
            Assert.Equal(1, ex.Level);
        }
    }

    [Fact]
    public void Quiet_Plan_Only_Quiet_Exercises()
    {
        var plan = Eng.GeneratePlan(new TrainingProfile { Goal = "fatloss", DaysPerWeek = 4, Minutes = 40, Place = "dorm" }, DisciEngine.AssessRisk(new()), 1);
        Assert.All(plan.Days.SelectMany(d => d.Exs), e => Assert.True(Cat.ExById(e.Id)!.Quiet));
    }

    [Fact]
    public void Nutrition_Blocked_At_Level3() => Assert.True(DisciEngine.NutritionAdvice(new NutritionProfile { Sex = "male", Weight = 70, Height = 175, Age = 25, Activity = 3, Goal = "fatloss" }, 3).Blocked);

    [Fact]
    public void Supplements_Not_Recommended_At_Level3()
        => Assert.DoesNotContain(Eng.RecommendProducts(new ProductQuery { Goal = "health", RiskLevel = 3, Budget = 5000000 }), r => r.Product.Cat == "supp");

    [Fact]
    public void Dates_Are_Monday_Based()
    {
        Assert.Equal(0, DisciEngine.Dow("2026-11-16")); // Thứ 2
        Assert.Equal(6, DisciEngine.Dow("2026-11-22")); // Chủ nhật
        Assert.Equal("2026-11-16", DisciEngine.WeekStart("2026-11-21"));
    }
}
