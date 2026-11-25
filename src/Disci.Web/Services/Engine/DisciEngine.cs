using System.Globalization;
using System.Text.RegularExpressions;

namespace Disci.Web.Services.Engine;

/// <summary>
/// Bản port C# của assets/engine.js (BMI · TDEE · cảnh báo 3 mức · tạo lịch · thay bài · bỏ buổi · tiến độ · gợi ý sản phẩm · thực đơn).
/// Không phụ thuộc DB/HTTP. Các ngưỡng sức khỏe là THAM SỐ THAM KHẢO, cần chuyên gia y tế kiểm chứng; kết quả KHÔNG dùng để chẩn đoán.
/// </summary>
public sealed class DisciEngine
{
    private readonly CatalogSnapshot _cat;
    public DisciEngine(CatalogSnapshot catalog) => _cat = catalog;

    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // JS Math.round làm tròn nửa lên (khác Math.Round mặc định của C#).
    public static double Round(double x) => Math.Floor(x + 0.5);
    public static double Round1(double x) => Math.Floor(x * 10 + 0.5) / 10;
    private static string N(double v) => v.ToString(Inv);

    // ---------- Ngày giờ (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè) ----------
    public static readonly string[] DowLabel = { "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật" };
    private static DateOnly Pd(string s) => DateOnly.ParseExact(s, "yyyy-MM-dd", Inv);
    private static string Fmt(DateOnly d) => d.ToString("yyyy-MM-dd", Inv);
    public static string TodayStr(DateTimeOffset now) => Fmt(DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime));
    public static string AddDays(string s, int n) => Fmt(Pd(s).AddDays(n));
    public static int Dow(string s) => ((int)Pd(s).DayOfWeek + 6) % 7;      // 0 = Thứ 2 … 6 = CN
    public static string WeekStart(string s) => AddDays(s, -Dow(s));
    public static int DiffDays(string a, string b) => Pd(a).DayNumber - Pd(b).DayNumber;
    public static string Money(double n) => Round(n).ToString("N0", Inv).Replace(",", ".") + " đ";

    // ---------- 1. BMI ----------
    public static double? Bmi(double w, double h) => (w > 0 && h > 0) ? Round1(w / Math.Pow(h / 100, 2)) : null;
    public static (string Key, string Label) BmiCategory(double? b)
    {
        if (b == null) return ("na", "Chưa đủ dữ liệu");
        if (b < 18.5) return ("low", "Thiếu cân (tham khảo)");
        if (b < 23) return ("normal", "Trong khoảng tham khảo");
        if (b < 25) return ("over", "Thừa cân nhẹ (tham khảo)");
        if (b < 30) return ("pre", "Thừa cân (tham khảo)");
        return ("obese", "Béo phì (tham khảo)");
    }

    // ---------- 2. TDEE (Mifflin-St Jeor) ----------
    private static double ActFactor(int a) => a switch { 1 => 1.2, 2 => 1.375, 3 => 1.55, 4 => 1.725, _ => 1.375 };
    public static int? Bmr(string? sex, double w, double h, double age)
        => (w > 0 && h > 0 && age > 0) ? (int)Round(10 * w + 6.25 * h - 5 * age + (sex == "male" ? 5 : -161)) : null;
    public static int? Tdee(string? sex, double w, double h, double age, int activity)
    {
        var b = Bmr(sex, w, h, age);
        return b == null ? null : (int)Round(b.Value * ActFactor(activity));
    }
    public static int? TargetCalories(int? td, string? goal, string? sex)
    {
        if (td == null) return null;
        double adj = goal == "fatloss" ? 0.85 : goal == "muscle" ? 1.08 : 1;
        return (int)Math.Max(sex == "male" ? 1500 : 1200, Round(td.Value * adj / 10) * 10);
    }
    public static int ProteinTarget(double w, string? goal)
        => (int)Round((goal == "muscle" ? 1.6 : goal == "fatloss" ? 1.4 : 1.2) * w);

    // ---------- 3. Cảnh báo 3 mức ----------
    public static (int Sbp, int Dbp)? ParseBP(string? s)
    {
        var m = Regex.Match(s ?? "", @"(\d{2,3})\s*[/\\-]\s*(\d{2,3})");
        return m.Success ? (int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)) : null;
    }

    public static readonly IReadOnlyDictionary<string, (string Label, string[] Tags)> RestrictMap = new Dictionary<string, (string, string[])>
    {
        ["knee"] = ("Đau/hạn chế khớp gối", new[] { "knee", "impact" }),
        ["back"] = ("Đau/hạn chế lưng – cột sống", new[] { "spine" }),
        ["shoulder"] = ("Đau/hạn chế khớp vai", new[] { "shoulder", "overhead" }),
        ["wrist"] = ("Đau/hạn chế cổ tay", new[] { "wrist" }),
        ["heart"] = ("Khuyến cáo hạn chế cường độ tim mạch", new[] { "intense", "impact" }),
        ["impact"] = ("Tránh bài có va đập mạnh", new[] { "impact" }),
        ["stop"] = ("Bác sĩ khuyến cáo tạm ngưng vận động", Array.Empty<string>())
    };

    public static RiskResult AssessRisk(RiskInput? inp)
    {
        inp ??= new RiskInput();
        var s = inp.Symptoms ?? new Symptoms();
        var r3 = new List<string>(); var r2 = new List<string>(); var tags = new List<string>();
        void Tag(string t) { if (!tags.Contains(t)) tags.Add(t); }
        var rs = inp.Restrictions ?? new List<string>();
        foreach (var k in rs) if (RestrictMap.TryGetValue(k, out var m)) foreach (var t in m.Tags) Tag(t);
        if (rs.Contains("stop")) r3.Add("Bác sĩ đã khuyến cáo tạm ngưng vận động – khuyến cáo của bác sĩ luôn được ưu tiên.");
        else foreach (var k in rs) if (RestrictMap.TryGetValue(k, out var m)) r2.Add(m.Label + " (theo khuyến cáo bạn nhập).");
        if (s.Chest || s.Dizzy || s.Breath) r3.Add("Bạn báo có đau ngực, chóng mặt hoặc khó thở – hãy dừng tập và tham khảo bác sĩ.");
        if (inp.Sbp != null && inp.Dbp != null)
        {
            int sbp = inp.Sbp.Value, dbp = inp.Dbp.Value;
            if (sbp >= 160 || dbp >= 100) r3.Add($"Huyết áp {sbp}/{dbp} mmHg cao hơn ngưỡng tham khảo (≥160/100).");
            else if (sbp >= 140 || dbp >= 90) r2.Add($"Huyết áp {sbp}/{dbp} mmHg ở mức cần lưu ý (≥140/90).");
            else if (sbp < 90 || dbp < 60) r2.Add($"Huyết áp {sbp}/{dbp} mmHg thấp hơn thông thường.");
        }
        if (inp.Rhr != null)
        {
            int rhr = inp.Rhr.Value;
            if (rhr > 110 || rhr < 40) r3.Add($"Nhịp tim nghỉ {rhr} bpm nằm ngoài khoảng tham khảo (40–110).");
            else if (rhr > 100) r2.Add($"Nhịp tim nghỉ {rhr} bpm hơi cao (>100).");
        }
        if (inp.Bmi != null)
        {
            double b = inp.Bmi.Value;
            if (b >= 35 || b < 16) r3.Add($"BMI {N(b)} nằm ngoài khoảng tham khảo an toàn để tự tập cường độ cao.");
            else if (b >= 30 || b < 17) r2.Add($"BMI {N(b)} – nên ưu tiên bài ít va đập.");
        }
        if (inp.Age != null && inp.Age >= 60) r2.Add("Từ 60 tuổi nên ưu tiên cường độ nhẹ – vừa.");
        if (s.Pain) r2.Add("Bạn báo đang đau cơ/khớp – giảm cường độ, tránh bài gây đau.");
        if (s.Fatigue) r2.Add("Bạn báo mệt nhiều – hạ tải để phục hồi.");
        int level = r3.Count > 0 ? 3 : r2.Count > 0 ? 2 : 1;
        if (level >= 2 && (s.Pain || s.Fatigue)) { Tag("impact"); Tag("intense"); }
        if (level == 2) { Tag("impact"); Tag("intense"); }
        if (level == 3) foreach (var t in new[] { "impact", "intense", "overhead", "spine", "shoulder", "knee", "wrist" }) Tag(t);
        var titles = new[] { "", "Mức 1 – Tiến bộ tốt", "Mức 2 – Mức lưu ý", "Mức 3 – Cảnh báo cao" };
        var advice = new[] { "",
            "Duy trì lịch hiện tại và có thể tăng tải từ từ nếu bạn thấy ổn. Tiếp tục theo dõi tiến độ.",
            "Hệ thống giảm cường độ và thay các bài tải trọng/va đập cao bằng bài phù hợp hơn. Hãy lắng nghe cơ thể.",
            "DISCI không gợi ý bài tập nặng. Hãy tạm dừng hoạt động không phù hợp và tham khảo bác sĩ trước khi tập tiếp. Không đề xuất thực phẩm bổ sung trong tình huống này." };
        return new RiskResult
        {
            Level = level, Title = titles[level],
            Reasons = level == 3 ? r3.Concat(r2).ToList() : level == 2 ? r2 : new List<string> { "Chưa có dấu hiệu cần lưu ý theo các tham số tham khảo." },
            Advice = advice[level], Tags = tags,
            Disclaimer = "Chỉ mang tính tham khảo, không phải chẩn đoán y tế. Khuyến cáo của bác sĩ luôn được ưu tiên."
        };
    }

    // ---------- 4. Chọn bài & thay bài ----------
    public sealed class Ctx
    {
        public List<string> EquipOrder { get; } = new();
        public HashSet<string> Equip { get; } = new();
        public List<string> Tags { get; set; } = new();
        public bool Quiet { get; set; }
        public int MaxLevel { get; set; }
        public int RiskLevel { get; set; }
        public void AddEquip(string k) { if (Equip.Add(k)) EquipOrder.Add(k); }
        public Ctx CloneCtx() { var c = new Ctx { Tags = Tags, Quiet = Quiet, MaxLevel = MaxLevel, RiskLevel = RiskLevel }; foreach (var k in EquipOrder) c.AddEquip(k); return c; }
    }

    public static Ctx CtxFrom(TrainingProfile p, int riskLevel, List<string>? tags)
    {
        var c = new Ctx();
        foreach (var k in p.Equip ?? new List<string>()) c.AddEquip(k);
        c.AddEquip("none"); c.AddEquip("mat");
        int ul = (p.Level ?? 0) > 0 ? p.Level!.Value : ((p.Activity ?? 0) >= 3 ? 2 : 1);
        if (riskLevel >= 2) ul = Math.Min(ul, 2);
        if (riskLevel >= 3) ul = 1;
        c.Tags = tags ?? new List<string>(); c.Quiet = p.Quiet || p.Place == "dorm"; c.MaxLevel = ul; c.RiskLevel = riskLevel;
        return c;
    }

    public static bool Allowed(ExerciseDef ex, Ctx ctx)
    {
        if (ex.Level > ctx.MaxLevel) return false;
        foreach (var e in ex.Equip) if (!ctx.Equip.Contains(e)) return false;
        foreach (var t in ex.Tags) if (ctx.Tags.Contains(t)) return false;
        if (ctx.Quiet && !ex.Quiet) return false;
        return true;
    }

    public ExerciseDef? Replacement(ExerciseDef ex, Ctx ctx)
    {
        ExerciseDef? cur = ex; int guard = 0;
        while (cur != null && !string.IsNullOrEmpty(cur.Rep) && guard++ < 4)
        {
            cur = _cat.ExById(cur.Rep);
            if (cur != null && Allowed(cur, ctx)) return cur;
            if (cur == null) break;
        }
        var alts = _cat.Exercises.Where(e => e.Cat == ex.Cat && e.Id != ex.Id && Allowed(e, ctx)).OrderBy(e => e.Level).ToList();
        if (alts.Count > 0) return alts[0];
        if (ex.Cat != "gian") { var g = _cat.Exercises.Where(e => e.Cat == "gian" && Allowed(e, ctx)).ToList(); if (g.Count > 0) return g[0]; }
        return null;
    }

    public static double ExMinutes(PlanEntry e) => e.Kind == "time" ? e.Sets * (e.Amt + e.Rest) / 60.0 : e.Sets * (e.Amt * 3 + e.Rest) / 60.0;
    public static int DayMinutes(IEnumerable<PlanEntry> exs) => (int)Round(8 + exs.Sum(ExMinutes));

    public static PlanEntry MkEntry(ExerciseDef ex, string goal, int riskLevel)
    {
        int sets = ex.Sets, amt = ex.Amt, rest = ex.Rest;
        if (ex.Kind == "reps")
        {
            if (goal == "fatloss") { amt += 3; rest = Math.Max(30, rest - 15); }
            else if (goal == "endurance") { amt += 5; rest = Math.Max(30, rest - 15); }
            else if (goal == "muscle") { amt = Math.Min(amt, 12); }
        }
        else if (ex.Cat == "cardio" && (goal == "fatloss" || goal == "endurance")) amt = (int)Round(amt * 1.3);
        if (riskLevel == 2) { sets = Math.Max(2, sets - 1); rest += 15; }
        return new PlanEntry { Id = ex.Id, Sets = sets, Amt = amt, Rest = rest, Kind = ex.Kind };
    }

    // ---------- 5. Tạo lịch tuần ----------
    private static readonly Dictionary<int, int[]> DaySlots = new()
    { [2] = new[] { 0, 3 }, [3] = new[] { 0, 2, 4 }, [4] = new[] { 0, 1, 3, 4 }, [5] = new[] { 0, 1, 3, 4, 5 }, [6] = new[] { 0, 1, 2, 3, 4, 5 } };

    private static readonly Dictionary<string, Dictionary<int, string[]>> FocusSeq = new()
    {
        ["fatloss"] = new() { [2] = new[] { "full", "cardio" }, [3] = new[] { "full", "cardio", "full" }, [4] = new[] { "upper", "cardio", "lower", "cardio" }, [5] = new[] { "upper", "cardio", "lower", "full", "cardio" }, [6] = new[] { "upper", "cardio", "lower", "cardio", "full", "mobility" } },
        ["muscle"] = new() { [2] = new[] { "full", "full" }, [3] = new[] { "full", "full", "core" }, [4] = new[] { "upper", "lower", "upper", "lower" }, [5] = new[] { "upper", "lower", "cardio", "upper", "lower" }, [6] = new[] { "upper", "lower", "core", "upper", "lower", "mobility" } },
        ["endurance"] = new() { [2] = new[] { "cardio", "full" }, [3] = new[] { "cardio", "full", "cardio" }, [4] = new[] { "cardio", "full", "cardio", "core" }, [5] = new[] { "cardio", "full", "cardio", "lower", "cardio" }, [6] = new[] { "cardio", "full", "cardio", "lower", "cardio", "mobility" } },
        ["health"] = new() { [2] = new[] { "full", "cardio" }, [3] = new[] { "full", "cardio", "core" }, [4] = new[] { "full", "cardio", "core", "full" }, [5] = new[] { "full", "cardio", "core", "full", "mobility" }, [6] = new[] { "full", "cardio", "core", "full", "cardio", "mobility" } }
    };

    private static readonly Dictionary<string, string[]> FocusCats = new()
    {
        ["upper"] = new[] { "nguc", "lung", "vai", "tay", "bung" },
        ["lower"] = new[] { "chan", "chan", "chan", "bung", "gian" },
        ["full"] = new[] { "chan", "nguc", "lung", "chan", "bung", "vai" },
        ["cardio"] = new[] { "cardio", "cardio", "bung", "gian" },
        ["core"] = new[] { "bung", "bung", "bung", "gian", "gian" },
        ["mobility"] = new[] { "gian", "gian", "gian", "gian", "gian" },
        ["light"] = new[] { "cardio", "gian", "gian", "gian" }
    };
    private static readonly Dictionary<string, string> FocusTitle = new()
    { ["upper"] = "Thân trên", ["lower"] = "Thân dưới", ["full"] = "Toàn thân", ["cardio"] = "Cardio nhẹ – vừa", ["core"] = "Cơ lõi & giãn cơ", ["mobility"] = "Giãn cơ & phục hồi", ["light"] = "Vận động nhẹ & giãn cơ" };
    private static readonly Dictionary<string, string> FocusGoalTxt = new()
    { ["upper"] = "Ngực, lưng, vai, tay", ["lower"] = "Đùi, mông, bắp chân", ["full"] = "Toàn thân", ["cardio"] = "Tim phổi", ["core"] = "Bụng, lưng dưới", ["mobility"] = "Linh hoạt, phục hồi", ["light"] = "Vận động nhẹ" };

    private List<PlanEntry> PickForFocus(string focus, Ctx ctx, string goal, int riskLevel, int seed, int minutes)
    {
        var cats = FocusCats[focus]; var used = new HashSet<string>(); var output = new List<PlanEntry>();
        double budget = Math.Max(15, minutes - 8), spent = 0;
        for (int i = 0; i < cats.Length; i++)
        {
            var cat = cats[i];
            var pool = _cat.Exercises.Where(e => e.Cat == cat && !used.Contains(e.Id) && Allowed(e, ctx))
                .OrderByDescending(e => e.Level).ThenBy(e => e.Id, StringComparer.Ordinal).ToList();
            if (pool.Count == 0) continue;
            var pref = pool.Where(e => e.Level <= ctx.MaxLevel).ToList();
            var ex = pref[(seed + i) % pref.Count];
            var ent = MkEntry(ex, goal, riskLevel); double m = ExMinutes(ent);
            if (spent + m > budget && output.Count >= 2) continue;
            output.Add(ent); used.Add(ex.Id); spent += m;
        }
        // lượt bổ sung: thêm bài khác cho đến khi gần đủ thời lượng người dùng chọn
        for (int pass = 0; pass < 3 && spent < budget - 4 && focus != "mobility"; pass++)
        {
            for (int j = 0; j < cats.Length && spent < budget - 4; j++)
            {
                if (cats[j] == "gian") continue;
                var c2 = cats[j];
                var pool2 = _cat.Exercises.Where(e => e.Cat == c2 && !used.Contains(e.Id) && Allowed(e, ctx)).ToList();
                if (pool2.Count == 0) continue;
                var ex2 = pool2[(seed + j + pass) % pool2.Count]; var ent2 = MkEntry(ex2, goal, riskLevel); double m2 = ExMinutes(ent2);
                if (spent + m2 > budget + 3) continue;
                int at = Math.Max(0, output.Count - (Array.IndexOf(cats, "gian") >= 0 ? 1 : 0));
                output.Insert(at, ent2); used.Add(ex2.Id); spent += m2;
            }
        }
        if (output.Count < 2)
        {
            foreach (var e in _cat.Exercises.Where(e => Allowed(e, ctx) && !used.Contains(e.Id)).Take(3))
                if (output.Count < 3) output.Add(MkEntry(e, goal, riskLevel));
        }
        return output;
    }

    public WorkoutPlanModel GeneratePlan(TrainingProfile? profile, RiskResult? risk, long now)
    {
        profile ??= new TrainingProfile(); risk ??= new RiskResult { Level = 1 };
        string goal = string.IsNullOrEmpty(profile.Goal) ? "health" : profile.Goal!;
        if (!FocusSeq.ContainsKey(goal)) goal = "health";
        int days = Math.Min(6, Math.Max(2, (profile.DaysPerWeek ?? 0) != 0 ? profile.DaysPerWeek!.Value : 3));
        int minutes = Math.Min(90, Math.Max(15, (profile.Minutes ?? 0) != 0 ? profile.Minutes!.Value : 40));
        var ctx = CtxFrom(profile, risk.Level, risk.Tags);
        string[] seq;
        if (risk.Level == 3)
        {
            days = Math.Min(days, 4);
            seq = Enumerable.Range(0, days).Select(k => k % 2 == 1 ? "mobility" : "light").ToArray();
            minutes = Math.Min(minutes, 30);
        }
        else seq = FocusSeq[goal][days];
        var slots = DaySlots[days];
        var plan = new WorkoutPlanModel { Id = "p" + now, CreatedAt = now, Version = 1, Level = risk.Level, Goal = goal, DaysPerWeek = days, Minutes = minutes, Quiet = ctx.Quiet };
        for (int d = 0; d < 7; d++)
        {
            int idx = Array.IndexOf(slots, d);
            if (idx < 0) { plan.Days.Add(new PlanDay { Dow = d, Type = "rest", Title = "Ngày nghỉ", Focus = "rest", Minutes = 0 }); continue; }
            var f = seq[idx]; var exs = PickForFocus(f, ctx, goal, risk.Level, idx + d, minutes);
            plan.Days.Add(new PlanDay { Dow = d, Type = "workout", Title = FocusTitle[f], Focus = f, Target = FocusGoalTxt[f], Exs = exs, Minutes = DayMinutes(exs) });
        }
        _cat.Goals.TryGetValue(goal, out var goalName);
        var reasons = new List<string>
        {
            "Mục tiêu \"" + goalName + "\": " + (goal == "fatloss" ? "tăng số lần lặp, nghỉ ngắn hơn và thêm cardio."
                : goal == "muscle" ? "ưu tiên bài sức mạnh 8–12 lần lặp, nghỉ đủ để cơ phục hồi."
                : goal == "endurance" ? "nhiều cardio và lặp cao, nghỉ ngắn." : "cân bằng sức mạnh, tim phổi và giãn cơ."),
            days + " buổi/tuần, mỗi buổi khoảng " + minutes + " phút; các buổi cách nhau để cơ có thời gian phục hồi."
        };
        if (ctx.Quiet) reasons.Add("Chế độ phòng nhỏ/ít ồn: chỉ chọn bài êm, không nhảy, không dậm mạnh.");
        var eqNames = ctx.EquipOrder.Where(k => k != "none" && k != "mat").Select(k => _cat.Equip.TryGetValue(k, out var n) ? n : "").ToList();
        reasons.Add(eqNames.Count > 0 ? "Dụng cụ hiện có: " + string.Join(", ", eqNames) + "." : "Bạn chưa có dụng cụ nên lịch dùng bài tập thân người.");
        if (risk.Level == 2) reasons.Add("Mức lưu ý: giảm 1 hiệp, tăng nghỉ 15 giây, loại bài va đập/tải trọng cao.");
        if (risk.Level == 3) reasons.Add("Cảnh báo cao: chỉ vận động nhẹ và giãn cơ. Hãy tham khảo bác sĩ trước khi tập nặng hơn.");
        plan.Reasons = reasons;
        return plan;
    }

    // ---------- 6. Thích ứng lịch khi thể trạng thay đổi ----------
    public AdaptResult AdaptPlan(WorkoutPlanModel plan, TrainingProfile profile, RiskResult risk, long now)
    {
        var ctx = CtxFrom(profile, risk.Level, risk.Tags); var changes = new List<PlanChange>();
        if (risk.Level == 3 && plan.Level != 3)
        {
            var np3 = GeneratePlan(profile, risk, now);
            changes.Add(new PlanChange { From = $"Lịch cũ ({plan.DaysPerWeek} buổi/tuần)", To = $"Lịch nhẹ {np3.DaysPerWeek} buổi/tuần", Why = "Cảnh báo mức 3: chỉ vận động nhẹ, giãn cơ và tham khảo bác sĩ.", Benefit = "Giảm rủi ro khi chỉ số/khuyến cáo chưa an toàn." });
            return new AdaptResult { Plan = np3, Changes = changes };
        }
        var np = plan.Clone(); np.Id = "p" + now; np.CreatedAt = now; np.Version = (plan.Version == 0 ? 1 : plan.Version) + 1; np.Level = risk.Level; np.Quiet = ctx.Quiet;
        foreach (var day in np.Days)
        {
            var kept = new List<PlanEntry>();
            foreach (var e in day.Exs)
            {
                var ex = _cat.ExById(e.Id);
                if (ex == null) continue;
                if (!Allowed(ex, ctx))
                {
                    var rep = Replacement(ex, ctx);
                    if (rep != null)
                    {
                        kept.Add(MkEntry(rep, np.Goal, risk.Level));
                        changes.Add(new PlanChange { Day = DowLabel[day.Dow], From = ex.Name, To = rep.Name, Why = WhyReplace(ex, ctx), Benefit = string.IsNullOrEmpty(rep.Warn) ? "Ít tải lên các khớp/hệ tim mạch hơn, vẫn tác động nhóm cơ tương tự." : rep.Warn! });
                    }
                    else changes.Add(new PlanChange { Day = DowLabel[day.Dow], From = ex.Name, To = "(bỏ bài)", Why = WhyReplace(ex, ctx), Benefit = "Không có bài thay thế an toàn trong dụng cụ hiện có." });
                }
                else if (risk.Level == 2 && plan.Level != 2 && e.Sets > 2)
                {
                    var c = e.Clone(); c.Sets = e.Sets - 1; c.Rest = e.Rest + 15; kept.Add(c);
                    changes.Add(new PlanChange { Day = DowLabel[day.Dow], From = $"{ex.Name} {e.Sets} hiệp", To = $"{ex.Name} {e.Sets - 1} hiệp", Why = "Mức lưu ý: giảm cường độ.", Benefit = "Phục hồi tốt hơn." });
                }
                else kept.Add(e);
            }
            var seen = new HashSet<string>();
            day.Exs = kept.Where(e => seen.Add(e.Id)).ToList();
            if (day.Type == "workout") day.Minutes = DayMinutes(day.Exs);
        }
        return new AdaptResult { Plan = np, Changes = changes };
    }

    private static string WhyReplace(ExerciseDef ex, Ctx ctx)
    {
        bool Both(string t) => ex.Tags.Contains(t) && ctx.Tags.Contains(t);
        if (Both("knee")) return "Giảm tải cho khớp gối.";
        if (Both("impact")) return "Giảm va đập mạnh theo mức cảnh báo/khuyến cáo.";
        if (Both("spine")) return "Giảm tải cho cột sống.";
        if ((ex.Tags.Contains("shoulder") || ex.Tags.Contains("overhead")) && (ctx.Tags.Contains("shoulder") || ctx.Tags.Contains("overhead"))) return "Giảm tải cho khớp vai.";
        if (Both("wrist")) return "Giảm tải cho cổ tay.";
        if (Both("intense")) return "Giảm cường độ tim mạch.";
        if (ctx.Quiet && !ex.Quiet) return "Chế độ phòng nhỏ/ít ồn.";
        if (ex.Level > ctx.MaxLevel) return "Bài vượt mức độ phù hợp hiện tại.";
        return "Bạn không có dụng cụ cần thiết.";
    }

    // ---------- Phiên tập & calo ----------
    public double SessionCalories(double? weight, IEnumerable<string>? exerciseIds, double? minutes)
    {
        var mets = (exerciseIds ?? Enumerable.Empty<string>()).Select(id => _cat.ExById(id)?.Met ?? 4).ToList();
        double avg = mets.Count > 0 ? mets.Average() : 4;
        double w = (weight ?? 0) != 0 ? weight!.Value : 60;
        return Round(avg * w * (minutes ?? 0) / 60);
    }

    public static StreakResult StreakOf(IEnumerable<SessionRecord> sessions, string today)
    {
        var set = new HashSet<string>(sessions.Where(s => s.Status == "done").Select(s => s.Date));
        int cur = 0; var d = set.Contains(today) ? today : AddDays(today, -1);
        while (set.Contains(d)) { cur++; d = AddDays(d, -1); }
        var dates = set.OrderBy(x => x, StringComparer.Ordinal).ToList(); int best = 0, run = 0; string? prev = null;
        foreach (var x in dates) { run = (prev != null && DiffDays(x, prev) == 1) ? run + 1 : 1; best = Math.Max(best, run); prev = x; }
        return new StreakResult { Current = cur, Best = best };
    }

    // ---------- Xử lý khi bỏ buổi tập ----------
    private static readonly Dictionary<string, string[]> Conflict = new()
    { ["upper"] = new[] { "upper", "full" }, ["lower"] = new[] { "lower", "full" }, ["full"] = new[] { "upper", "lower", "full" }, ["cardio"] = Array.Empty<string>(), ["core"] = new[] { "core" }, ["mobility"] = Array.Empty<string>(), ["light"] = Array.Empty<string>() };

    public static MissedResult? HandleMissed(WorkoutPlanModel plan, string missedDate, string today)
    {
        int wd = Dow(missedDate);
        var day = wd < plan.Days.Count ? plan.Days[wd] : null;
        if (day == null || day.Type != "workout") return null;
        var ws = WeekStart(missedDate); var opts = new List<MissedOption>();
        var bad = Conflict.TryGetValue(day.Focus, out var b) ? b : Array.Empty<string>();
        for (int i = 1; i < 7; i++)
        {
            var t = AddDays(missedDate, i);
            if (WeekStart(t) != ws || string.CompareOrdinal(t, today) < 0) continue;
            int td = Dow(t);
            var tday = td < plan.Days.Count ? plan.Days[td] : null;
            if (tday == null || tday.Type != "rest") continue;
            var prev = td - 1 >= 0 ? plan.Days[td - 1] : null; var next = td + 1 < plan.Days.Count ? plan.Days[td + 1] : null;
            bool clash = new[] { prev, next }.Any(n => n != null && n.Type == "workout" && bad.Contains(n.Focus));
            if (!clash) { opts.Add(new MissedOption { Type = "move", ToDate = t, Why = "Chuyển sang " + DowLabel[Dow(t)] + " (ngày nghỉ), không sát buổi tập cùng nhóm cơ nên vẫn đủ thời gian phục hồi." }); break; }
        }
        opts.Add(new MissedOption { Type = "skip", Why = "Bỏ qua buổi này và tiếp tục lịch từ buổi kế tiếp. DISCI không dồn bài tập vào ngày liền sau để tránh quá tải." });
        return new MissedResult { Date = missedDate, Title = day.Title, Options = opts, Recommended = opts[0].Type };
    }

    // ---------- 7. Phân tích tiến độ ----------
    private static double? Avg(IEnumerable<double?> a)
    {
        var l = a.Where(x => x != null && !double.IsNaN(x.Value)).Select(x => x!.Value).ToList();
        return l.Count > 0 ? Round1(l.Sum() / l.Count) : null;
    }

    public ProgressResult AnalyzeProgress(ProgressInput o)
    {
        var all = o.Sessions ?? new List<SessionRecord>();
        var sessions = all.Where(s => s.Status == "done").ToList(); var today = o.Today;
        var metrics = (o.Metrics ?? new List<MetricRecord>()).OrderBy(m => m.Date, StringComparer.Ordinal).ToList();
        int total = sessions.Count; double minutes = sessions.Sum(x => x.Minutes ?? 0), cal = sessions.Sum(x => x.Calories ?? 0);
        var st = StreakOf(all, today); var weeks = new List<WeekStat>(); var w0 = WeekStart(today);
        for (int i = 7; i >= 0; i--)
        {
            var ws = AddDays(w0, -7 * i); var we = AddDays(ws, 6);
            var ss = sessions.Where(s => string.CompareOrdinal(s.Date, ws) >= 0 && string.CompareOrdinal(s.Date, we) <= 0).ToList();
            weeks.Add(new WeekStat { Start = ws, Sessions = ss.Count, Minutes = ss.Sum(x => x.Minutes ?? 0), Planned = o.Plan?.DaysPerWeek ?? 0, Rpe = Avg(ss.Select(s => s.Rpe)) });
        }
        var cur = weeks[7];
        int rate = cur.Planned != 0 ? (int)Math.Min(100, Round((double)cur.Sessions / cur.Planned * 100)) : 0;
        var last = metrics.Count > 0 ? metrics[^1] : null; var first = metrics.Count > 0 ? metrics[0] : null; double? slope = null;
        var recent = metrics.Where(m => (m.Weight ?? 0) != 0 && DiffDays(today, m.Date) <= 28).ToList();
        if (recent.Count >= 2)
        {
            var a = recent[0]; var b = recent[^1]; int dd = DiffDays(b.Date, a.Date);
            if (dd > 0) slope = Round1((b.Weight!.Value - a.Weight!.Value) / dd * 7);
        }
        double? goalW = (o.GoalWeight ?? 0) != 0 ? o.GoalWeight : null;
        double? gap = (goalW != null && last != null && (last.Weight ?? 0) != 0) ? Round1(last.Weight!.Value - goalW.Value) : null;
        int plannedSoFar = o.Plan != null ? o.Plan.Days.Count(d => d.Type == "workout" && string.CompareOrdinal(AddDays(w0, d.Dow), today) < 0) : 0;
        int doneSoFar = sessions.Count(s => string.CompareOrdinal(s.Date, w0) >= 0 && string.CompareOrdinal(s.Date, today) < 0);
        var tips = new List<string>(); string status = "good"; int level = (o.RiskLevel ?? 0) != 0 ? o.RiskLevel!.Value : 1;
        if (level == 3) { status = "high"; tips.Add("Đang ở mức cảnh báo cao – ưu tiên nghỉ ngơi và tham khảo bác sĩ trước khi tăng tải."); }
        else if (level == 2) { status = "watch"; tips.Add("Đang ở mức lưu ý – giữ cường độ nhẹ cho đến khi các chỉ số ổn."); }
        else if (plannedSoFar > 0 && doneSoFar < plannedSoFar) { status = "watch"; tips.Add("Tuần này bạn đã bỏ " + (plannedSoFar - doneSoFar) + " buổi. Hãy xem đề xuất điều chỉnh, không dồn bài."); }
        else if (rate >= 80 && total >= 6) tips.Add("Bạn duy trì lịch rất tốt. Có thể tăng tải nhẹ (thêm 1–2 lần lặp hoặc 1 hiệp) nếu cơ thể thấy ổn.");
        else if (total == 0) tips.Add("Hãy hoàn thành buổi đầu tiên để bắt đầu theo dõi tiến độ.");
        else tips.Add("Tiếp tục đều đặn; tiến bộ đến từ sự ổn định chứ không phải một buổi thật nặng.");
        if (slope != null && o.Goal == "fatloss" && slope < -1) tips.Add("Cân nặng giảm nhanh hơn 1 kg/tuần. Hãy cân nhắc ăn đủ năng lượng và nghỉ ngơi.");
        var avgRpe = Avg(sessions.Skip(Math.Max(0, sessions.Count - 6)).Select(s => s.Rpe));
        if (avgRpe != null && avgRpe != 0 && avgRpe >= 9) tips.Add("Mức nỗ lực gần đây rất cao (RPE ≥ 9). Nên giảm tải một buổi để phục hồi.");
        bool both = first != null && last != null && (first.Weight ?? 0) != 0 && (last.Weight ?? 0) != 0;
        return new ProgressResult
        {
            Total = total, Minutes = minutes, Calories = cal, Streak = st.Current, BestStreak = st.Best, Weeks = weeks, CompletionRate = rate,
            WeightFirst = first?.Weight, WeightLast = last?.Weight, WeightDelta = both ? Round1(last!.Weight!.Value - first!.Weight!.Value) : null,
            SlopePerWeek = slope, GoalGap = gap, Status = status, Tips = tips
        };
    }

    /// <param name="st">Ví dụ: sessions, streak, minutes, metrics, goalReached (bool → 0/1).</param>
    public List<BadgeState> EvalBadges(IReadOnlyDictionary<string, double> st)
        => _cat.Badges.Select(b =>
        {
            var m = Regex.Match(b.Test, @"(\w+)(>=)?(\d+)?");
            st.TryGetValue(m.Groups[1].Value, out var v);
            bool ok = m.Groups[2].Success ? v >= double.Parse(m.Groups[3].Value, Inv) : v != 0;
            return new BadgeState { Id = b.Id, Name = b.Name, Icon = b.Icon, Earned = ok };
        }).ToList();

    // ---------- 8. Gợi ý sản phẩm ----------
    private static int SpaceRank(string? s) => s switch { "small" => 1, "medium" => 2, "large" => 3, _ => 1 };

    public List<ProductRec> RecommendProducts(ProductQuery? c)
    {
        c ??= new ProductQuery();
        var owned = new HashSet<string>(c.Equip ?? new List<string>());
        double budget = (c.Budget ?? 0) != 0 ? c.Budget!.Value : 1000000;
        int riskLevel = (c.RiskLevel ?? 0) != 0 ? c.RiskLevel!.Value : 1;
        var ctx = CtxFrom(new TrainingProfile { Equip = c.Equip, Level = c.Level, Activity = c.Activity, Quiet = c.Quiet, Place = c.Place }, riskLevel, c.Tags);
        string space = c.Space ?? "small"; var res = new List<ProductRec>();
        foreach (var p in _cat.Products)
        {
            if (p.Custom) continue;
            if (!string.IsNullOrEmpty(p.Unlocks) && owned.Contains(p.Unlocks)) continue;
            if (p.Cat == "supp" && riskLevel >= 3) continue;
            if (p.Price > budget) continue;
            int cnt = 0;
            if (!string.IsNullOrEmpty(p.Unlocks))
            {
                var ctx2 = ctx.CloneCtx(); ctx2.AddEquip(p.Unlocks); ctx2.AddEquip("none");
                cnt = _cat.Exercises.Count(e => e.Equip.Contains(p.Unlocks) && Allowed(e, ctx2));
                if (cnt == 0 && p.Unlocks != "mat") continue;
            }
            bool goalHit = c.Goal != null && p.Goals.Contains(c.Goal);
            double sc = (goalHit ? 3 : 0) + (p.Prio == "essential" ? 3 : p.Prio == "consider" ? 1.5 : 0) + Math.Min(cnt, 8) / 2.0;
            double spacePen = SpaceRank(p.Space) > SpaceRank(space) ? 5 : 0;
            sc = sc - spacePen - p.Price / budget * 3;
            if (p.Cat == "supp") sc -= 1;
            var why = new List<string>();
            if (!string.IsNullOrEmpty(p.Unlocks) && cnt > 0) why.Add($"mở khóa {cnt} bài tập phù hợp với hồ sơ của bạn");
            if (goalHit) why.Add($"hỗ trợ mục tiêu \"{(_cat.Goals.TryGetValue(c.Goal!, out var gn) ? gn : "")}\"");
            if (SpaceRank(p.Space) <= SpaceRank(space)) why.Add(p.Space == "small" ? "gọn, phù hợp không gian nhỏ" : "vừa với không gian của bạn");
            why.Add("giá " + Money(p.Price) + (p.Price <= budget * 0.3 ? " – thấp so với ngân sách " + Money(budget) : " trong ngân sách " + Money(budget)));
            var joined = string.Join("; ", why);
            res.Add(new ProductRec { Product = p, Score = Round1(sc), Reason = char.ToUpperInvariant(joined[0]) + joined[1..] + "." });
        }
        return res.OrderByDescending(r => r.Score).ToList();
    }

    public static StarterKit BuildStarterKit(IEnumerable<ProductRec> recs, double budget)
    {
        var kit = new StarterKit();
        foreach (var r in recs.Where(r => r.Product.Cat != "supp"))
            if (kit.Total + r.Product.Price <= budget && kit.Items.Count < 4 && r.Score > 0) { kit.Items.Add(r.Product); kit.Total += r.Product.Price; }
        return kit;
    }

    public static GymCost CostVsGym(double homeCost, double months, double? gymMonthly = null)
    {
        double g = (gymMonthly ?? 0) != 0 ? gymMonthly!.Value : 350000; double gym = g * months;
        return new GymCost { Home = homeCost, Gym = gym, Saving = gym - homeCost, BreakEvenMonths = Math.Ceiling(homeCost / g * 10) / 10 };
    }

    // ---------- 9. Dinh dưỡng ----------
    public MenuPlan PlanMenu(double targetKcal, int seed)
    {
        var split = new (string Slot, double Ratio)[] { ("sang", 0.25), ("trua", 0.35), ("toi", 0.30) };
        var picks = new List<MealDef>();
        for (int i = 0; i < split.Length; i++)
        {
            double tk = targetKcal * split[i].Ratio;
            var pool = _cat.Meals.Where(m => m.Slot == split[i].Slot).OrderBy(m => Math.Abs(m.Kcal - tk)).Take(3).ToList();
            picks.Add(pool[(seed + i) % pool.Count]);
        }
        double rem = targetKcal - picks.Sum(m => m.Kcal);
        var snacks = _cat.Meals.Where(m => m.Slot == "phu").OrderByDescending(m => (double)m.Protein / m.Kcal).ToList();
        int k = 0;
        while (rem > 80 && k < 2)
        {
            int ix = seed % snacks.Count + k;
            var s = ix < snacks.Count ? snacks[ix] : (k < snacks.Count ? snacks[k] : null);
            if (s == null || s.Kcal > rem + 60) break;
            picks.Add(s); rem -= s.Kcal; k++;
        }
        return new MenuPlan { Meals = picks, Total = new MenuTotal { Kcal = picks.Sum(m => m.Kcal), Protein = picks.Sum(m => m.Protein), Cost = picks.Sum(m => m.Cost) } };
    }

    public static NutritionAdviceResult NutritionAdvice(NutritionProfile p, int riskLevel)
    {
        if (riskLevel >= 3) return new NutritionAdviceResult { Blocked = true, Reason = "Đang ở mức cảnh báo cao – DISCI không gợi ý chế độ ăn. Hãy tham khảo bác sĩ/chuyên gia dinh dưỡng." };
        if (!(p.Weight > 0 && p.Height > 0 && p.Age > 0)) return new NutritionAdviceResult { Blocked = true, Reason = "Chưa đủ thông tin (cân nặng, chiều cao, tuổi) để ước tính năng lượng an toàn." };
        var td = Tdee(p.Sex, p.Weight, p.Height, p.Age, p.Activity);
        return new NutritionAdviceResult { Blocked = false, Bmr = Bmr(p.Sex, p.Weight, p.Height, p.Age), Tdee = td, Kcal = TargetCalories(td, p.Goal, p.Sex), Protein = ProteinTarget(p.Weight, p.Goal) };
    }
}
