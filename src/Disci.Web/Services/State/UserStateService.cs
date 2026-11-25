using System.Globalization;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.State;

public static class StateKeys
{
    /// <summary>Các khóa cấp cao nhất của đối tượng trạng thái (S) mà giao diện DISCI sử dụng (xem blank() trong store.js). Khóa lạ bị từ chối.</summary>
    public static readonly HashSet<string> All = new()
    {
        "v", "onboarded", "profile", "metrics", "health", "checkins", "plan", "planHistory", "sessions", "moves", "restDays", "custom",
        "cart", "orders", "address", "nutritionLog", "nutritionPrefs", "posts", "likes", "comments", "follows", "friends", "reports", "hidden",
        "saved", "challenges", "groups", "messages", "notifications", "reminderFired", "settings", "productSaved", "gymMonthly", "demoLoaded"
    };
    /// <summary>Lưu thành bảng quan hệ (UserProfile, BodyMetrics, WorkoutPlans/Days, WorkoutSessions).</summary>
    public static readonly HashSet<string> Relational = new() { "v", "onboarded", "profile", "metrics", "plan", "planHistory", "sessions", "cart", "productSaved", "orders", "posts", "nutritionLog" };
    /// <summary>Dữ liệu sức khỏe/PII: mã hóa bằng ASP.NET Core Data Protection trước khi ghi vào SQL Server.</summary>
    public static readonly HashSet<string> Protected = new() { "health", "checkins", "address" };
}

public sealed record StateSnapshot(JsonObject State, long Version);
public sealed record SaveOutcome(bool Ok, long Version, string? Error = null);

public interface IUserStateService
{
    Task<StateSnapshot> LoadAsync(string userId, CancellationToken ct = default);
    Task<SaveOutcome> SaveAsync(string userId, JsonObject changedKeys, CancellationToken ct = default);
    Task InitializeNewUserAsync(string userId, CancellationToken ct = default);
}

public sealed class StateValidationException : Exception { public StateValidationException(string m) : base(m) { } }

/// <summary>
/// Cầu nối giữa đối tượng trạng thái của giao diện (S) và SQL Server.
/// Quy ước: các bảng quan hệ giữ cột truy vấn/kiểm tra, còn cột RawJson/ExtraJson giữ bản nguyên vẹn để đọc lại không mất trường nào.
/// Ghi theo từng khóa thay đổi; khi hai thiết bị ghi cùng một khóa thì bản ghi sau thắng (last-write-wins).
/// </summary>
public sealed class UserStateService : IUserStateService
{
    private const int MaxKeyBytes = 2_000_000;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static readonly HashSet<string> Sexes = new() { "male", "female" };
    private static readonly HashSet<string> Goals = new() { "fatloss", "muscle", "endurance", "health" };
    private static readonly HashSet<string> Places = new() { "home", "dorm", "outdoor", "gym" };
    private static readonly HashSet<string> MappedProfileKeys = new() { "name", "email", "sex", "age", "height", "goal", "goalWeight", "daysPerWeek", "minutes", "place", "equip", "budget", "activity", "level", "quiet", "bio" };

    private readonly ApplicationDbContext _db;
    private readonly IDataProtector _protector;

    public UserStateService(ApplicationDbContext db, IDataProtectionProvider dp)
    {
        _db = db; _protector = dp.CreateProtector("Disci.UserData.v1");
    }

    // ======================= ĐỌC =======================
    public async Task<StateSnapshot> LoadAsync(string userId, CancellationToken ct = default)
    {
        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        var prof = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId, ct);
        var state = new JsonObject
        {
            ["v"] = 2,
            ["onboarded"] = prof?.OnboardingCompleted ?? false,
            ["profile"] = BuildProfile(user, prof)
        };

        var metrics = await _db.BodyMetrics.AsNoTracking().Where(m => m.UserId == userId).OrderBy(m => m.Id).Select(m => m.RawJson).ToListAsync(ct);
        state["metrics"] = ArrayOf(metrics);

        var plans = await _db.WorkoutPlans.AsNoTracking().Where(p => p.UserId == userId).Select(p => new { p.Active, p.HistorySeq, p.RawJson, p.ChangeLogJson }).ToListAsync(ct);
        var active = plans.FirstOrDefault(p => p.Active);
        state["plan"] = active == null ? null : Parse(active.RawJson);
        var hist = new JsonArray();
        foreach (var h in plans.Where(p => !p.Active).OrderBy(p => p.HistorySeq))
        {
            var entry = Parse(h.ChangeLogJson) as JsonObject ?? new JsonObject();
            entry["plan"] = Parse(h.RawJson);
            hist.Add(entry);
        }
        state["planHistory"] = hist;

        var sessions = await _db.WorkoutSessions.AsNoTracking().Where(s => s.UserId == userId).OrderBy(s => s.Id).Select(s => s.RawJson).ToListAsync(ct);
        state["sessions"] = ArrayOf(sessions);

        await LoadCommerceAsync(userId, state, ct);
        var nl = new JsonObject();
        foreach (var g in (await _db.NutritionLogs.AsNoTracking().Where(n => n.UserId == userId).OrderBy(n => n.LogDate).ThenBy(n => n.Position).ThenBy(n => n.Id).Select(n => new { n.LogDate, n.RawJson }).ToListAsync(ct)).GroupBy(n => n.LogDate))
            nl[g.Key.ToString("yyyy-MM-dd", Inv)] = ArrayOf(g.Select(x => x.RawJson));
        state["nutritionLog"] = nl;
        state["posts"] = ArrayOf(await _db.Posts.AsNoTracking().Where(p => p.UserId == userId).OrderBy(p => p.Id).Select(p => p.RawJson).ToListAsync(ct));

        foreach (var b in await _db.UserDataBlobs.AsNoTracking().Where(b => b.UserId == userId).ToListAsync(ct))
        {
            if (!StateKeys.All.Contains(b.Key) || StateKeys.Relational.Contains(b.Key)) continue;
            string json;
            try { json = b.IsProtected ? _protector.Unprotect(b.Value) : b.Value; }
            catch (System.Security.Cryptography.CryptographicException) { continue; }   // khóa mã hóa đã đổi: bỏ qua thay vì làm hỏng cả trạng thái
            state[b.Key] = Parse(json);
        }
        return new StateSnapshot(state, prof?.StateVersion ?? 0);
    }

    private static JsonNode? Parse(string json) { try { return JsonNode.Parse(json); } catch (System.Text.Json.JsonException) { return null; } }
    private static JsonArray ArrayOf(IEnumerable<string> raws) { var a = new JsonArray(); foreach (var r in raws) { var n = Parse(r); if (n != null) a.Add(n); } return a; }

    private static JsonObject BuildProfile(ApplicationUser user, UserProfile? p)
    {
        var o = (p == null ? null : Parse(p.ExtraJson) as JsonObject) ?? new JsonObject();
        o["name"] = user.FullName; o["email"] = user.Email;
        if (p == null) return o;
        void S(string k, JsonNode? v) { if (v != null) o[k] = v; }
        S("sex", p.Sex); S("age", p.Age); S("height", p.HeightCm); S("goal", p.Goal); S("goalWeight", p.GoalWeightKg);
        S("daysPerWeek", p.DaysPerWeek); S("minutes", p.MinutesPerSession); S("place", p.Place); S("budget", p.BudgetVnd); S("activity", p.Activity);
        S("level", p.Level); S("bio", p.Bio);
        if (!string.IsNullOrEmpty(p.AvatarUrl)) o["avatar"] = p.AvatarUrl;
        if (!string.IsNullOrEmpty(p.CoverUrl)) o["cover"] = p.CoverUrl;
        o["equip"] = Parse(p.EquipmentJson) ?? new JsonArray();
        o["quiet"] = p.QuietMode;
        return o;
    }

    // ======================= GHI =======================
    public async Task<SaveOutcome> SaveAsync(string userId, JsonObject changed, CancellationToken ct = default)
    {
        foreach (var kv in changed)
        {
            if (!StateKeys.All.Contains(kv.Key)) return new SaveOutcome(false, 0, $"Khóa dữ liệu không hợp lệ: {kv.Key}");
            if ((kv.Value?.ToJsonString().Length ?? 0) > MaxKeyBytes) return new SaveOutcome(false, 0, $"Dữ liệu '{kv.Key}' quá lớn (tối đa 2 MB).");
        }

        for (int attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                var user = await _db.Users.FirstAsync(u => u.Id == userId, ct);
                var prof = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId, ct);
                if (prof == null) { prof = new UserProfile { UserId = userId }; _db.UserProfiles.Add(prof); }

                foreach (var kv in changed)
                {
                    switch (kv.Key)
                    {
                        case "v": break;
                        case "onboarded": prof.OnboardingCompleted = kv.Value is JsonValue ov && ov.TryGetValue<bool>(out var ob) && ob; break;
                        case "profile": ApplyProfile(user, prof, kv.Value as JsonObject ?? throw new StateValidationException("Hồ sơ không hợp lệ.")); break;
                        case "metrics": await ApplyMetricsAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Danh sách thể trạng không hợp lệ."), ct); break;
                        case "sessions": await ApplySessionsAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Danh sách buổi tập không hợp lệ."), ct); break;
                        case "plan": await ApplyActivePlanAsync(userId, kv.Value, ct); break;
                        case "nutritionLog": await ApplyNutritionLogAsync(userId, kv.Value as JsonObject ?? throw new StateValidationException("Nhật ký dinh dưỡng không hợp lệ."), ct); break;
                        case "posts": await ApplyPostsAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Danh sách bài viết không hợp lệ."), ct); break;
                        case "cart": await ApplyCartAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Giỏ hàng không hợp lệ."), ct); break;
                        case "productSaved": await ApplySavedAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Danh sách đã lưu không hợp lệ."), ct); break;
                        case "orders": await ApplyOrdersAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Danh sách đơn hàng không hợp lệ."), ct); break;
                        case "planHistory": await ApplyPlanHistoryAsync(userId, kv.Value as JsonArray ?? throw new StateValidationException("Lịch sử lịch tập không hợp lệ."), ct); break;
                        default: await ApplyBlobAsync(userId, kv.Key, kv.Value, ct); break;
                    }
                }
                prof.StateVersion++; prof.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                return new SaveOutcome(true, prof.StateVersion);
            }
            catch (StateValidationException ex) { _db.ChangeTracker.Clear(); return new SaveOutcome(false, 0, ex.Message); }
            catch (DbUpdateConcurrencyException) { _db.ChangeTracker.Clear(); }
        }
        return new SaveOutcome(false, 0, "Có xung đột khi ghi dữ liệu. Vui lòng thử lại.");
    }

    public async Task InitializeNewUserAsync(string userId, CancellationToken ct = default)
    {
        if (!await _db.UserProfiles.AnyAsync(p => p.UserId == userId, ct)) _db.UserProfiles.Add(new UserProfile { UserId = userId });
        var welcome = new JsonArray(new JsonObject
        {
            ["id"] = Guid.NewGuid().ToString("N")[..10], ["icon"] = "waving_hand", ["t"] = "Chào mừng đến với DISCI",
            ["d"] = "Hãy cập nhật chỉ số cơ thể để nhận lịch tập cá nhân hóa.", ["go"] = "body-status.html",
            ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ["unread"] = true
        });
        await ApplyBlobAsync(userId, "notifications", welcome, ct);
        await _db.SaveChangesAsync(ct);
    }

    // ---- Hồ sơ ----
    private static double? Num(JsonNode? n, double min, double max)
    {
        if (n is not JsonValue v) return null;
        if (!v.TryGetValue<double>(out var d)) { if (v.TryGetValue<int>(out var i)) d = i; else if (v.TryGetValue<long>(out var l)) d = l; else return null; }
        return double.IsFinite(d) && d >= min && d <= max ? d : null;
    }
    private static string? Str(JsonNode? n, int maxLen) => n is JsonValue v && v.TryGetValue<string>(out var s) && s != null ? (s.Length > maxLen ? s[..maxLen] : s) : null;
    private static string? OneOf(JsonNode? n, HashSet<string> allowed) { var s = Str(n, 20); return s != null && allowed.Contains(s) ? s : null; }

    private static void ApplyProfile(ApplicationUser user, UserProfile p, JsonObject o)
    {
        var name = Str(o["name"], 120)?.Trim();
        if (!string.IsNullOrEmpty(name) && name.Length >= 2) user.FullName = name;
        p.Sex = OneOf(o["sex"], Sexes); p.Goal = OneOf(o["goal"], Goals); p.Place = OneOf(o["place"], Places);
        p.Age = (int?)Num(o["age"], 13, 100); p.HeightCm = Num(o["height"], 100, 250); p.GoalWeightKg = Num(o["goalWeight"], 25, 300);
        p.DaysPerWeek = (int?)Num(o["daysPerWeek"], 2, 6); p.MinutesPerSession = (int?)Num(o["minutes"], 15, 90);
        p.BudgetVnd = (int?)Num(o["budget"], 0, 1_000_000_000); p.Activity = (int?)Num(o["activity"], 1, 4); p.Level = (int?)Num(o["level"], 1, 3);
        p.QuietMode = o["quiet"] is JsonValue q && q.TryGetValue<bool>(out var qb) && qb;
        p.Bio = Str(o["bio"], 500);
        var equip = new JsonArray();
        if (o["equip"] is JsonArray ea) foreach (var e in ea.Take(20)) { var s = Str(e, 20); if (!string.IsNullOrEmpty(s)) equip.Add(s); }
        p.EquipmentJson = equip.ToJsonString();

        var extra = new JsonObject();
        foreach (var kv in o)
        {
            if (MappedProfileKeys.Contains(kv.Key) || kv.Key is "avatar" or "cover") continue;
            extra[kv.Key] = kv.Value?.DeepClone();
        }
        // avatar/cover: URL ngắn → cột riêng; data-URL (tạm, cho tới khi có upload ở Lượt 3) → ExtraJson
        string? ShortUrl(JsonNode? n) { var s = Str(n, 100_000_000); return s != null && s.Length <= 300 && !s.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ? s : null; }
        p.AvatarUrl = ShortUrl(o["avatar"]); p.CoverUrl = ShortUrl(o["cover"]);
        if (p.AvatarUrl == null && !string.IsNullOrEmpty(Str(o["avatar"], 100_000_000))) extra["avatar"] = o["avatar"]!.DeepClone();
        if (p.CoverUrl == null && !string.IsNullOrEmpty(Str(o["cover"], 100_000_000))) extra["cover"] = o["cover"]!.DeepClone();
        p.ExtraJson = extra.ToJsonString();
    }

    // ---- Thể trạng ----
    private static bool TryDate(JsonNode? n, out DateOnly d)
    {
        d = default; var s = Str(n, 10);
        return s != null && DateOnly.TryParseExact(s, "yyyy-MM-dd", Inv, DateTimeStyles.None, out d);
    }

    private async Task ApplyMetricsAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 2000) throw new StateValidationException("Quá nhiều bản ghi thể trạng.");
        var rows = new List<BodyMetric>();
        foreach (var n in arr)
        {
            if (n is not JsonObject m) throw new StateValidationException("Bản ghi thể trạng không hợp lệ.");
            if (!TryDate(m["date"], out var date)) throw new StateValidationException("Bản ghi thể trạng có ngày không hợp lệ.");
            var w = Num(m["weight"], 25, 300) ?? throw new StateValidationException("Cân nặng phải trong khoảng 25–300 kg.");
            rows.Add(new BodyMetric { UserId = userId, MeasuredOn = date, WeightKg = w, WaistCm = Num(m["waist"], 30, 250), HipCm = Num(m["hip"], 30, 250), Note = Str(m["note"], 300), RawJson = m.ToJsonString() });
        }
        _db.BodyMetrics.RemoveRange(await _db.BodyMetrics.Where(x => x.UserId == userId).ToListAsync(ct));
        _db.BodyMetrics.AddRange(rows);
    }

    // ---- Buổi tập (so sánh theo id do giao diện sinh) ----
    private async Task ApplySessionsAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 5000) throw new StateValidationException("Quá nhiều buổi tập.");
        var incoming = new Dictionary<string, (JsonObject Raw, DateOnly Date)>();
        foreach (var n in arr)
        {
            if (n is not JsonObject s) throw new StateValidationException("Buổi tập không hợp lệ.");
            var id = Str(s["id"], 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Buổi tập thiếu mã.");
            if (!TryDate(s["date"], out var date)) throw new StateValidationException("Buổi tập có ngày không hợp lệ.");
            if (!incoming.TryAdd(id, (s, date))) throw new StateValidationException("Mã buổi tập bị trùng.");
        }
        var existing = await _db.WorkoutSessions.Where(x => x.UserId == userId && x.ClientId != null).ToListAsync(ct);
        var byId = existing.ToDictionary(x => x.ClientId!);
        foreach (var e in existing.Where(e => !incoming.ContainsKey(e.ClientId!))) _db.WorkoutSessions.Remove(e);
        foreach (var (id, (raw, date)) in incoming)
        {
            var json = raw.ToJsonString();
            if (!byId.TryGetValue(id, out var row)) { row = new WorkoutSession { UserId = userId, ClientId = id }; _db.WorkoutSessions.Add(row); }
            else if (row.RawJson == json) continue;
            var status = Str(raw["status"], 12); 
            row.DoneOn = date; row.Title = Str(raw["title"], 120);
            row.Minutes = (int)(Num(raw["minutes"], 0, 600) ?? 0); row.Calories = (int)(Num(raw["calories"], 0, 5000) ?? 0);
            row.Rpe = (int?)Num(raw["rpe"], 1, 10); row.Status = status is "done" or "skipped" ? status : "done";
            row.Source = "player"; row.RawJson = json;
        }
    }

    // ---- Lịch tập ----
    private static DateTime FromMs(JsonNode? n)
    {
        var ms = Num(n, 0, 4_102_444_800_000);
        return ms == null ? DateTime.UtcNow : DateTimeOffset.FromUnixTimeMilliseconds((long)ms.Value).UtcDateTime;
    }

    private static WorkoutPlan ProjectPlan(string userId, JsonObject p, bool withDays)
    {
        var goal = Str(p["goal"], 20); 
        var plan = new WorkoutPlan
        {
            UserId = userId, ClientId = Str(p["id"], 40), Version = (int)(Num(p["version"], 1, 100000) ?? 1), RiskLevel = (int)(Num(p["level"], 1, 3) ?? 1),
            Goal = goal != null && Goals.Contains(goal) ? goal : "health", DaysPerWeek = (int)(Num(p["daysPerWeek"], 0, 7) ?? 0), Minutes = (int)(Num(p["minutes"], 0, 600) ?? 0),
            Quiet = p["quiet"] is JsonValue q && q.TryGetValue<bool>(out var qb) && qb, ReasonsJson = (p["reasons"] as JsonArray)?.ToJsonString() ?? "[]",
            CreatedAt = FromMs(p["createdAt"]), RawJson = p.ToJsonString()
        };
        if (withDays && p["days"] is JsonArray days)
        {
            var seen = new HashSet<int>();
            foreach (var dn in days)
            {
                if (dn is not JsonObject d) continue;
                var dow = (int?)Num(d["dow"], 0, 6); if (dow == null || !seen.Add(dow.Value)) continue;
                var type = Str(d["type"], 10);
                plan.Days.Add(new WorkoutDay { Dow = dow.Value, Type = type == "workout" ? "workout" : "rest", Focus = Str(d["focus"], 20) ?? "rest", Title = Str(d["title"], 80) ?? "", Target = Str(d["target"], 80), Minutes = (int)(Num(d["minutes"], 0, 600) ?? 0), EntriesJson = (d["exs"] as JsonArray)?.ToJsonString() ?? "[]" });
            }
        }
        return plan;
    }

    private async Task ApplyActivePlanAsync(string userId, JsonNode? node, CancellationToken ct)
    {
        _db.WorkoutPlans.RemoveRange(await _db.WorkoutPlans.Where(x => x.UserId == userId && x.Active).ToListAsync(ct));
        if (node == null) return;
        if (node is not JsonObject p) throw new StateValidationException("Lịch tập không hợp lệ.");
        var plan = ProjectPlan(userId, p, true); plan.Active = true; _db.WorkoutPlans.Add(plan);
    }

    private async Task ApplyPlanHistoryAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 50) throw new StateValidationException("Lịch sử lịch tập quá dài.");
        _db.WorkoutPlans.RemoveRange(await _db.WorkoutPlans.Where(x => x.UserId == userId && !x.Active).ToListAsync(ct));
        int seq = 0;
        foreach (var n in arr)
        {
            if (n is not JsonObject entry || entry["plan"] is not JsonObject inner) continue;
            var plan = ProjectPlan(userId, inner, false); plan.Active = false; plan.HistorySeq = seq++;
            var meta = new JsonObject { ["id"] = entry["id"]?.DeepClone(), ["at"] = entry["at"]?.DeepClone(), ["reason"] = entry["reason"]?.DeepClone(), ["changes"] = entry["changes"]?.DeepClone() ?? new JsonArray() };
            plan.ChangeLogJson = meta.ToJsonString();
            _db.WorkoutPlans.Add(plan);
        }
    }

    // ---- Nhật ký ăn uống: { "yyyy-MM-dd": [ {id}, {id:"custom", meal:{name,kcal,protein,cost}} ] } → bảng NutritionLogs ----
    private async Task ApplyNutritionLogAsync(string userId, JsonObject log, CancellationToken ct)
    {
        if (log.Count > 800) throw new StateValidationException("Nhật ký dinh dưỡng quá dài.");
        var rows = new List<NutritionLog>(); int total = 0;
        foreach (var day in log)
        {
            if (!DateOnly.TryParseExact(day.Key, "yyyy-MM-dd", Inv, DateTimeStyles.None, out var date)) throw new StateValidationException("Nhật ký dinh dưỡng có ngày không hợp lệ.");
            if (day.Value is not JsonArray entries) throw new StateValidationException("Nhật ký dinh dưỡng không hợp lệ.");
            if (entries.Count > 100 || (total += entries.Count) > 8000) throw new StateValidationException("Quá nhiều mục trong nhật ký dinh dưỡng.");
            int pos = 0;
            foreach (var n in entries)
            {
                if (n is not JsonObject e) throw new StateValidationException("Mục nhật ký dinh dưỡng không hợp lệ.");
                var id = Str(e["id"], 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Mục nhật ký dinh dưỡng thiếu mã món.");
                var meal = e["meal"] as JsonObject;
                rows.Add(new NutritionLog { UserId = userId, LogDate = date, Position = pos++, FoodItemId = id == "custom" ? null : id, CustomName = Str(meal?["name"], 150),
                    Kcal = (int)(Num(meal?["kcal"], 0, 5000) ?? 0), ProteinG = (int)(Num(meal?["protein"], 0, 500) ?? 0), RawJson = e.ToJsonString() });
            }
        }
        var wanted = rows.Select(r => r.FoodItemId).Where(x => x != null).Distinct().ToList();
        var known = (await _db.FoodItems.AsNoTracking().Where(f => wanted.Contains(f.Id)).Select(f => f.Id).ToListAsync(ct)).ToHashSet();
        foreach (var r in rows) if (r.FoodItemId != null && !known.Contains(r.FoodItemId)) r.FoodItemId = null;       // món không còn trong danh mục: vẫn giữ mục (RawJson), chỉ bỏ liên kết khóa ngoại
        _db.NutritionLogs.RemoveRange(await _db.NutritionLogs.Where(n => n.UserId == userId).ToListAsync(ct));
        _db.NutritionLogs.AddRange(rows);
    }

    // ---- Bài viết của chính người dùng (S.posts) → bảng Posts; người khác xem qua CommunityService (có kiểm tra quyền xem) ----
    private async Task ApplyPostsAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 2000) throw new StateValidationException("Quá nhiều bài viết.");
        var incoming = new Dictionary<string, JsonObject>();
        foreach (var n in arr)
        {
            if (n is not JsonObject o) throw new StateValidationException("Bài viết không hợp lệ.");
            var id = Str(o["id"], 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Bài viết thiếu mã.");
            if (!incoming.TryAdd(id, o)) throw new StateValidationException("Mã bài viết bị trùng.");
        }
        var ids = incoming.Keys.ToList();
        if (await _db.Posts.AnyAsync(p => ids.Contains(p.ClientId!) && p.UserId != userId, ct)) throw new StateValidationException("Mã bài viết đã tồn tại.");

        var existing = await _db.Posts.Where(p => p.UserId == userId && p.ClientId != null).ToListAsync(ct);
        var byId = existing.ToDictionary(p => p.ClientId!);
        var removed = existing.Where(p => !incoming.ContainsKey(p.ClientId!)).ToList();
        if (removed.Count > 0)
        {
            var rid = removed.Select(p => p.Id).ToList();
            _db.Reports.RemoveRange(await _db.Reports.Where(r => r.PostId != null && rid.Contains(r.PostId.Value)).ToListAsync(ct));   // báo cáo gắn với bài đã xóa
            _db.Posts.RemoveRange(removed);                                                                                          // bình luận/thích/lưu/chia sẻ xóa theo cascade
        }
        var groupIds = incoming.Values.Select(o => Str(o["group"], 40)).Where(g => !string.IsNullOrEmpty(g)).Distinct().ToList();
        var groups = await _db.Groups.AsNoTracking().Where(g => groupIds.Contains(g.ClientId!)).ToDictionaryAsync(g => g.ClientId!, g => g.Id, ct);

        foreach (var (id, raw) in incoming)
        {
            var json = raw.ToJsonString();
            if (!byId.TryGetValue(id, out var row)) { row = new Post { UserId = userId, ClientId = id }; _db.Posts.Add(row); }
            else if (row.RawJson == json) continue;
            var text = Str(raw["text"], 100_000) ?? "";
            row.Body = text.Length > 5000 ? text[..5000] : text; row.Topic = Str(raw["topic"], 40);
            var img = Str(raw["img"], 100_000_000); var hasVideo = !string.IsNullOrEmpty(Str(raw["videoId"], 120)) || !string.IsNullOrEmpty(Str(raw["video"], 300));
            row.MediaUrl = img != null && img.Length <= 300 && !img.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ? img : null;
            row.MediaType = hasVideo ? "video" : !string.IsNullOrEmpty(img) ? "image" : null;
            var vis = Str(raw["vis"], 12); row.Visibility = vis is "private" or "followers" ? vis : "public";
            row.Edited = raw["edited"] is JsonValue ev && ev.TryGetValue<bool>(out var eb) && eb;
            var g = Str(raw["group"], 40); row.GroupId = g != null && groups.TryGetValue(g, out var gid) ? gid : null;
            row.CreatedAt = FromMs(raw["at"]); row.RawJson = json;
        }
    }

    // ---- Cửa hàng: giỏ hàng, sản phẩm đã lưu, đơn hàng ----
    // Sản phẩm chưa có trong bảng Products (ví dụ sản phẩm tùy chỉnh cũ chưa chuyển lên DB) KHÔNG bị bỏ: lưu ở khóa nội bộ _unknown.* và ghép lại khi đọc.
    private const string UnknownCart = "_unknown.cart", UnknownSaved = "_unknown.saved";

    private async Task<HashSet<string>> KnownProductsAsync(IEnumerable<string> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return (await _db.Products.AsNoTracking().Where(p => list.Contains(p.Id)).Select(p => p.Id).ToListAsync(ct)).ToHashSet();
    }

    private async Task SetInternalAsync(string userId, string key, JsonArray items, CancellationToken ct)
    {
        var row = await _db.UserDataBlobs.FirstOrDefaultAsync(b => b.UserId == userId && b.Key == key, ct);
        if (items.Count == 0) { if (row != null) _db.UserDataBlobs.Remove(row); return; }
        if (row == null) _db.UserDataBlobs.Add(new UserDataBlob { UserId = userId, Key = key, Value = items.ToJsonString() });
        else { row.Value = items.ToJsonString(); row.UpdatedAt = DateTime.UtcNow; }
    }

    private async Task ApplyCartAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 200) throw new StateValidationException("Giỏ hàng quá lớn.");
        var lines = new List<(string Id, int Qty, int Pos)>(); int pos = 0;
        foreach (var n in arr)
        {
            if (n is not JsonObject o) throw new StateValidationException("Dòng giỏ hàng không hợp lệ.");
            var id = Str(o["id"], 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Dòng giỏ hàng thiếu mã sản phẩm.");
            var qty = (int)(Num(o["qty"], 1, 99) ?? throw new StateValidationException("Số lượng phải từ 1 đến 99."));
            var i = lines.FindIndex(l => l.Id == id);
            if (i >= 0) lines[i] = (id, Math.Min(99, lines[i].Qty + qty), lines[i].Pos); else lines.Add((id, qty, pos++));
        }
        var known = await KnownProductsAsync(lines.Select(l => l.Id), ct);
        _db.CartItems.RemoveRange(await _db.CartItems.Where(c => c.UserId == userId).ToListAsync(ct));
        _db.CartItems.AddRange(lines.Where(l => known.Contains(l.Id)).Select(l => new CartItem { UserId = userId, ProductId = l.Id, Qty = l.Qty, Position = l.Pos }));
        await SetInternalAsync(userId, UnknownCart, new JsonArray(lines.Where(l => !known.Contains(l.Id)).Select(l => (JsonNode?)new JsonObject { ["id"] = l.Id, ["qty"] = l.Qty, ["pos"] = l.Pos }).ToArray()), ct);
    }

    private async Task ApplySavedAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 500) throw new StateValidationException("Danh sách đã lưu quá dài.");
        var ids = new List<string>();
        foreach (var n in arr) { var id = Str(n, 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Mã sản phẩm đã lưu không hợp lệ."); if (!ids.Contains(id)) ids.Add(id); }
        var known = await KnownProductsAsync(ids, ct);
        _db.SavedProducts.RemoveRange(await _db.SavedProducts.Where(s => s.UserId == userId).ToListAsync(ct));
        _db.SavedProducts.AddRange(ids.Select((id, i) => (id, i)).Where(x => known.Contains(x.id)).Select(x => new SavedProduct { UserId = userId, ProductId = x.id, Position = x.i }));
        await SetInternalAsync(userId, UnknownSaved, new JsonArray(ids.Select((id, i) => (id, i)).Where(x => !known.Contains(x.id)).Select(x => (JsonNode?)new JsonObject { ["id"] = x.id, ["pos"] = x.i }).ToArray()), ct);
    }

    private static string MaskPhone(string? p) { var d = new string((p ?? "").Where(char.IsDigit).ToArray()); return d.Length <= 3 ? d : new string('*', d.Length - 3) + d[^3..]; }

    private async Task ApplyOrdersAsync(string userId, JsonArray arr, CancellationToken ct)
    {
        if (arr.Count > 500) throw new StateValidationException("Quá nhiều đơn hàng.");
        var incoming = new Dictionary<string, JsonObject>();
        foreach (var n in arr)
        {
            if (n is not JsonObject o) throw new StateValidationException("Đơn hàng không hợp lệ.");
            var id = Str(o["id"], 40); if (string.IsNullOrEmpty(id)) throw new StateValidationException("Đơn hàng thiếu mã.");
            if (!incoming.TryAdd(id, o)) throw new StateValidationException("Mã đơn hàng bị trùng.");
        }
        var existing = await _db.Orders.Where(x => x.UserId == userId && x.ClientId != null).ToListAsync(ct);
        var byId = existing.ToDictionary(x => x.ClientId!);
        foreach (var e in existing.Where(e => !incoming.ContainsKey(e.ClientId!))) _db.Orders.Remove(e);   // (hủy đơn demo) OrderItems xóa theo cascade
        var allItemIds = incoming.Values.SelectMany(o => (o["items"] as JsonArray ?? new JsonArray()).OfType<JsonObject>().Select(i => Str(i["id"], 40) ?? "")).ToList();
        var known = await KnownProductsAsync(allItemIds, ct);

        foreach (var (id, raw) in incoming)
        {
            var protectedRaw = _protector.Protect(raw.ToJsonString());
            var addr = raw["address"] as JsonObject;
            if (!byId.TryGetValue(id, out var row))
            {
                row = new Order { UserId = userId, ClientId = id }; _db.Orders.Add(row);
                foreach (var it in (raw["items"] as JsonArray ?? new JsonArray()).OfType<JsonObject>())
                {
                    var pid = Str(it["id"], 40); if (pid == null || !known.Contains(pid)) continue;
                    row.Items.Add(new OrderItem { ProductId = pid, Qty = (int)(Num(it["qty"], 1, 99) ?? 1), UnitPriceVnd = (int)(Num(it["price"], 0, 1_000_000_000) ?? 0) });
                }
            }
            row.Status = "demo"; row.PaymentMethod = Str(raw["pay"], 30) ?? "cod";
            row.SubtotalVnd = (int)(Num(raw["sub"], 0, 2_000_000_000) ?? 0); row.ShippingVnd = (int)(Num(raw["ship"], 0, 2_000_000_000) ?? 0); row.TotalVnd = (int)(Num(raw["total"], 0, 2_000_000_000) ?? 0);
            row.ShipName = Str(addr?["name"], 120) ?? ""; row.ShipPhone = MaskPhone(Str(addr?["phone"], 40)); row.ShipAddress = "";   // địa chỉ đầy đủ chỉ nằm trong RawProtected (đã mã hóa)
            row.CreatedAt = FromMs(raw["at"]); row.RawProtected = protectedRaw;
        }
    }

    private async Task LoadCommerceAsync(string userId, JsonObject state, CancellationToken ct)
    {
        var cart = new List<(int Pos, JsonObject O)>();
        foreach (var c in await _db.CartItems.AsNoTracking().Where(c => c.UserId == userId).ToListAsync(ct)) cart.Add((c.Position, new JsonObject { ["id"] = c.ProductId, ["qty"] = c.Qty }));
        var saved = new List<(int Pos, string Id)>();
        foreach (var s in await _db.SavedProducts.AsNoTracking().Where(s => s.UserId == userId).ToListAsync(ct)) saved.Add((s.Position, s.ProductId));
        foreach (var b in await _db.UserDataBlobs.AsNoTracking().Where(b => b.UserId == userId && (b.Key == UnknownCart || b.Key == UnknownSaved)).ToListAsync(ct))
            if (Parse(b.Value) is JsonArray ua)
                foreach (var n in ua.OfType<JsonObject>())
                {
                    var pos = (int?)Num(n["pos"], 0, 100000) ?? 0; var id = Str(n["id"], 40); if (id == null) continue;
                    if (b.Key == UnknownCart) cart.Add((pos, new JsonObject { ["id"] = id, ["qty"] = (int?)Num(n["qty"], 1, 99) ?? 1 })); else saved.Add((pos, id));
                }
        state["cart"] = new JsonArray(cart.OrderBy(x => x.Pos).Select(x => (JsonNode?)x.O).ToArray());
        state["productSaved"] = new JsonArray(saved.OrderBy(x => x.Pos).Select(x => (JsonNode?)JsonValue.Create(x.Id)).ToArray());

        var orders = new JsonArray();
        foreach (var raw in await _db.Orders.AsNoTracking().Where(o => o.UserId == userId).OrderBy(o => o.Id).Select(o => o.RawProtected).ToListAsync(ct))
        {
            try { var n = Parse(_protector.Unprotect(raw)); if (n != null) orders.Add(n); } catch (System.Security.Cryptography.CryptographicException) { }
        }
        state["orders"] = orders;
    }

    // ---- Các khóa còn lại (kho khóa-giá trị, có mã hóa với dữ liệu nhạy cảm) ----
    private async Task ApplyBlobAsync(string userId, string key, JsonNode? value, CancellationToken ct)
    {
        var json = value?.ToJsonString() ?? "null"; var prot = StateKeys.Protected.Contains(key);
        var stored = prot ? _protector.Protect(json) : json;
        var row = await _db.UserDataBlobs.FirstOrDefaultAsync(b => b.UserId == userId && b.Key == key, ct);
        if (row == null) _db.UserDataBlobs.Add(new UserDataBlob { UserId = userId, Key = key, Value = stored, IsProtected = prot });
        else { row.Value = stored; row.IsProtected = prot; row.UpdatedAt = DateTime.UtcNow; }
    }
}
