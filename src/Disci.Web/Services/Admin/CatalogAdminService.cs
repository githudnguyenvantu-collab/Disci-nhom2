using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Audit;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Admin;

public interface ICatalogAdminService
{
    Task<AdminResult> ListAsync(string kind, bool includeInactive, CancellationToken ct = default);
    Task<AdminResult> UpsertAsync(Actor actor, string kind, JsonObject body, CancellationToken ct = default);
    Task<AdminResult> SetActiveAsync(Actor actor, string kind, string id, bool active, CancellationToken ct = default);
    Task<AdminResult> DeleteAsync(Actor actor, string kind, string id, CancellationToken ct = default);
}

/// <summary>
/// Quản lý bài tập, sản phẩm, món ăn, thử thách trên SQL Server (Admin/Editor). Dữ liệu gốc (seed) chỉ được ẩn, không xóa;
/// dữ liệu do quản trị thêm (IsCustom) được xóa nếu không còn được tham chiếu. Mọi giá trị được kiểm tra khoảng/định dạng/tập cho phép trước khi ghi.
/// </summary>
public sealed class CatalogAdminService : ICatalogAdminService
{
    private sealed class Invalid : Exception { public Invalid(string m) : base(m) { } }
    private static readonly Regex IdRx = new(@"^[a-z0-9][a-z0-9_\-]{1,39}$", RegexOptions.Compiled);
    private static readonly Regex KeyRx = new(@"^[a-z0-9_]{2,20}$", RegexOptions.Compiled);
    private static readonly Regex MediaUrlRx = new(@"^(/media/[0-9a-f]{32}\.(jpg|png|webp|gif|mp4|webm|mov)|/media/k/[A-Za-z0-9_.:\-]{1,120})$", RegexOptions.Compiled);
    private static readonly HashSet<string> Tags = new() { "knee", "impact", "spine", "shoulder", "wrist", "overhead", "intense" };
    private static readonly HashSet<string> Goals = new() { "fatloss", "muscle", "endurance", "health" };

    private readonly ApplicationDbContext _db; private readonly IAuditService _audit; private readonly ICatalogProvider _catalog;
    public CatalogAdminService(ApplicationDbContext db, IAuditService audit, ICatalogProvider catalog) { _db = db; _audit = audit; _catalog = catalog; }

    // ---------- tiện ích kiểm tra ----------
    private static string Str(JsonObject o, string k, int min, int max, bool required = true)
    {
        var s = (o[k] as JsonValue)?.TryGetValue<string>(out var v) == true ? v?.Trim() ?? "" : "";
        if (required && s.Length < min) throw new Invalid($"'{k}' không được để trống.");
        if (s.Length > max) throw new Invalid($"'{k}' tối đa {max} ký tự.");
        return s;
    }
    private static double Num(JsonObject o, string k, double min, double max, double? def = null)
    {
        if (o[k] is JsonValue v && v.TryGetValue<double>(out var d)) { if (!double.IsFinite(d) || d < min || d > max) throw new Invalid($"'{k}' phải trong khoảng {min}–{max}."); return d; }
        if (def != null) return def.Value; throw new Invalid($"'{k}' phải là số.");
    }
    private static bool Bool(JsonObject o, string k, bool def = false) => o[k] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : def;
    private static List<string> StrList(JsonObject o, string k, int maxItems, int maxLen)
    {
        var l = new List<string>(); if (o[k] is not JsonArray a) return l;
        if (a.Count > maxItems) throw new Invalid($"'{k}' tối đa {maxItems} mục.");
        foreach (var n in a) { var s = (n as JsonValue)?.TryGetValue<string>(out var v) == true ? v?.Trim() ?? "" : ""; if (s.Length == 0) continue; if (s.Length > maxLen) throw new Invalid($"Mục trong '{k}' tối đa {maxLen} ký tự."); l.Add(s); }
        return l;
    }
    private static string? Media(JsonObject o, string k)
    {
        var s = Str(o, k, 0, 300, false); if (s.Length == 0) return null;
        if (!MediaUrlRx.IsMatch(s)) throw new Invalid($"'{k}' phải là tệp đã tải lên qua hệ thống (/media/…).");
        return s;
    }
    private static string OneOf(JsonObject o, string k, params string[] allowed) { var s = Str(o, k, 1, 20); if (!allowed.Contains(s)) throw new Invalid($"'{k}' phải là một trong: {string.Join(", ", allowed)}."); return s; }
    private static string Id(JsonObject o) { var s = Str(o, "id", 2, 40); if (!IdRx.IsMatch(s)) throw new Invalid("'id' chỉ gồm chữ thường, số, gạch dưới/gạch ngang (2–40 ký tự)."); return s; }
    private static string J(IEnumerable<string> l) => JsonSerializer.Serialize(l);
    private static List<string> L(string json) => JsonSerializer.Deserialize<List<string>>(json) ?? new();

    // ---------- liệt kê ----------
    public async Task<AdminResult> ListAsync(string kind, bool includeInactive, CancellationToken ct = default)
    {
        try { return AdminResult.Success(await CatalogDto.ListAsync(_db, kind, includeInactive, ct)); }
        catch (CatalogDto.Invalid) { return AdminResult.Fail(404, "Loại danh mục không tồn tại (exercise | product | food | challenge)."); }
    }

    private static bool CanEdit(Actor a) => a.IsAdmin || a.IsEditor;

    // ---------- thêm/sửa ----------
    public async Task<AdminResult> UpsertAsync(Actor actor, string kind, JsonObject body, CancellationToken ct = default)
    {
        if (!CanEdit(actor)) return AdminResult.Fail(403, "Chỉ Admin/Editor được chỉnh sửa danh mục.");
        string id;
        try
        {
            switch (kind)
            {
                case "exercise": id = await UpsertExerciseAsync(body, ct); break;
                case "product": id = await UpsertProductAsync(body, ct); break;
                case "food": id = await UpsertFoodAsync(body, ct); break;
                case "challenge": id = await UpsertChallengeAsync(body, ct); break;
                default: return AdminResult.Fail(404, "Loại danh mục không tồn tại.");
            }
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is Invalid or CatalogDto.Invalid) { _db.ChangeTracker.Clear(); return AdminResult.Fail(422, ex.Message); }
        _catalog.Invalidate();
        await _audit.LogAsync(actor.Id, actor.Email, $"admin.{kind}.save", kind, id, null, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, id });
    }

    private async Task<string> UpsertExerciseAsync(JsonObject o, CancellationToken ct)
    {
        var id = Id(o); var cat = Str(o, "cat", 1, 20);
        if (!await _db.ExerciseCategories.AnyAsync(c => c.Key == cat, ct)) throw new Invalid("Nhóm cơ không tồn tại.");
        var tags = StrList(o, "tags", 10, 20); if (tags.Any(t => !Tags.Contains(t))) throw new Invalid("Thẻ cảnh báo không hợp lệ.");
        var equip = StrList(o, "equip", 10, 20); if (equip.Any(q => !KeyRx.IsMatch(q))) throw new Invalid("Mã dụng cụ không hợp lệ.");
        var rep = Str(o, "rep", 0, 40, false); if (rep.Length > 0 && (rep == id || !await _db.Exercises.AnyAsync(x => x.Id == rep, ct))) throw new Invalid("Bài thay thế không hợp lệ.");
        var ex = await _db.Exercises.FirstOrDefaultAsync(x => x.Id == id, ct); if (ex == null) { ex = new Exercise { Id = id, IsCustom = true }; _db.Exercises.Add(ex); }
        ex.Name = Str(o, "name", 1, 120); ex.CategoryKey = cat; ex.Muscles = Str(o, "muscles", 0, 200, false); ex.Level = (int)Num(o, "level", 1, 3); ex.EquipJson = J(equip); ex.TagsJson = J(tags);
        ex.Kind = OneOf(o, "kind", "reps", "time"); ex.Sets = (int)Num(o, "sets", 1, 20); ex.Amt = (int)Num(o, "amt", 1, 600); ex.Rest = (int)Num(o, "rest", 0, 600); ex.Quiet = Bool(o, "quiet");
        ex.StepsJson = J(StrList(o, "steps", 12, 300)); ex.MistakesJson = J(StrList(o, "mistakes", 12, 300)); ex.ReplacementId = rep.Length == 0 ? null : rep;
        var warn = Str(o, "warn", 0, 500, false); ex.Warning = warn.Length == 0 ? null : warn; ex.Met = Num(o, "met", 1, 20, 4);
        ex.ImageUrl = Media(o, "image"); ex.VideoUrl = Media(o, "video"); ex.ExtraJson = CatalogDto.SanitizeExtras(o, CatalogDto.ExerciseKnown); ex.IsActive = Bool(o, "active", true);
        return id;
    }

    private async Task<string> UpsertProductAsync(JsonObject o, CancellationToken ct)
    {
        var id = Id(o); var cat = Str(o, "cat", 1, 20);
        if (!await _db.ProductCategories.AnyAsync(c => c.Key == cat, ct)) throw new Invalid("Danh mục sản phẩm không tồn tại.");
        var goals = StrList(o, "goals", 4, 20); if (goals.Any(g => !Goals.Contains(g))) throw new Invalid("Mục tiêu không hợp lệ.");
        var unlocks = Str(o, "unlocks", 0, 20, false); if (unlocks.Length > 0 && !KeyRx.IsMatch(unlocks)) throw new Invalid("Mã dụng cụ mở khóa không hợp lệ.");
        var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct); if (p == null) { p = new Product { Id = id, IsCustom = true }; _db.Products.Add(p); }
        p.Name = Str(o, "name", 1, 150); p.CategoryKey = cat; p.PriceVnd = (int)Num(o, "price", 0, 1_000_000_000); p.Description = Str(o, "desc", 0, 1000, false);
        p.Unlocks = unlocks.Length == 0 ? null : unlocks; p.GoalsJson = J(goals); p.Space = OneOf(o, "space", "small", "medium", "large");
        var prio = Str(o, "prio", 0, 20, false); if (prio.Length > 0 && prio is not ("essential" or "consider" or "optional")) throw new Invalid("'prio' không hợp lệ."); p.Priority = prio;
        p.Icon = Str(o, "icon", 0, 40, false); p.SpecsJson = J(StrList(o, "specs", 10, 100)); p.HowToUse = Str(o, "how", 0, 1000, false); p.ForWho = Str(o, "forWho", 0, 500, false); p.Note = Str(o, "note", 0, 500, false);
        p.ImageUrl = Media(o, "image"); p.ExtraJson = CatalogDto.SanitizeExtras(o, CatalogDto.ProductKnown); p.IsSupplement = cat == "supp" || Bool(o, "supplement"); p.IsActive = Bool(o, "active", true);
        return id;
    }

    private async Task<string> UpsertFoodAsync(JsonObject o, CancellationToken ct)
    {
        var id = Id(o); var f = await _db.FoodItems.FirstOrDefaultAsync(x => x.Id == id, ct); if (f == null) { f = new FoodItem { Id = id }; _db.FoodItems.Add(f); }
        f.Name = Str(o, "name", 1, 150); f.Slot = OneOf(o, "slot", "sang", "trua", "toi", "phu"); f.Kcal = (int)Num(o, "kcal", 0, 5000); f.ProteinG = (int)Num(o, "protein", 0, 500); f.EstCostVnd = (int)Num(o, "cost", 0, 10_000_000);
        f.IngredientsJson = J(StrList(o, "ing", 20, 80)); f.Icon = Str(o, "icon", 0, 40, false); f.ExtraJson = CatalogDto.SanitizeExtras(o, CatalogDto.FoodKnown); f.IsActive = Bool(o, "active", true);
        return id;
    }

    private async Task<string> UpsertChallengeAsync(JsonObject o, CancellationToken ct)
    {
        var id = Id(o); var c = await _db.Challenges.FirstOrDefaultAsync(x => x.Id == id, ct); if (c == null) { c = new Challenge { Id = id }; _db.Challenges.Add(c); }
        c.Name = Str(o, "name", 1, 150); c.Days = (int)Num(o, "days", 1, 365); c.Goal = (int)Num(o, "goal", 1, 100000); c.Metric = OneOf(o, "metric", "streak", "sessions", "sessions30", "sessions28", "minutes", "manual");
        var d = Str(o, "desc", 0, 500, false); c.Description = d.Length == 0 ? null : d; var r = Str(o, "reward", 0, 150, false); c.Reward = r.Length == 0 ? null : r; c.ExtraJson = CatalogDto.SanitizeExtras(o, CatalogDto.ChallengeKnown); c.IsActive = Bool(o, "active", true);
        return id;
    }

    // ---------- ẩn/hiện, xóa ----------
    public async Task<AdminResult> SetActiveAsync(Actor actor, string kind, string id, bool active, CancellationToken ct = default)
    {
        if (!CanEdit(actor)) return AdminResult.Fail(403, "Chỉ Admin/Editor được chỉnh sửa danh mục.");
        bool found = kind switch
        {
            "exercise" => await Toggle(_db.Exercises.Where(x => x.Id == id), x => x.IsActive = active, ct),
            "product" => await Toggle(_db.Products.Where(x => x.Id == id), x => x.IsActive = active, ct),
            "food" => await Toggle(_db.FoodItems.Where(x => x.Id == id), x => x.IsActive = active, ct),
            "challenge" => await Toggle(_db.Challenges.Where(x => x.Id == id), x => x.IsActive = active, ct),
            _ => false
        };
        if (!found) return AdminResult.Fail(404, "Không tìm thấy mục.");
        _catalog.Invalidate(); await _audit.LogAsync(actor.Id, actor.Email, $"admin.{kind}.{(active ? "show" : "hide")}", kind, id, null, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, active });
    }
    private async Task<bool> Toggle<T>(IQueryable<T> q, Action<T> set, CancellationToken ct) where T : class { var e = await q.FirstOrDefaultAsync(ct); if (e == null) return false; set(e); await _db.SaveChangesAsync(ct); return true; }

    public async Task<AdminResult> DeleteAsync(Actor actor, string kind, string id, CancellationToken ct = default)
    {
        if (!CanEdit(actor)) return AdminResult.Fail(403, "Chỉ Admin/Editor được chỉnh sửa danh mục.");
        try
        {
            switch (kind)
            {
                case "exercise":
                    var ex = await _db.Exercises.FirstOrDefaultAsync(x => x.Id == id, ct); if (ex == null) return AdminResult.Fail(404, "Không tìm thấy bài tập.");
                    if (!ex.IsCustom) return AdminResult.Fail(409, "Bài tập gốc của hệ thống chỉ có thể ẩn, không thể xóa.");
                    if (await _db.Exercises.AnyAsync(x => x.ReplacementId == id, ct) || await _db.WorkoutSessionDetails.AnyAsync(d => d.ExerciseId == id, ct)) return AdminResult.Fail(409, "Bài tập đang được tham chiếu. Hãy ẩn thay vì xóa.");
                    _db.Exercises.Remove(ex); break;
                case "product":
                    var pr = await _db.Products.FirstOrDefaultAsync(x => x.Id == id, ct); if (pr == null) return AdminResult.Fail(404, "Không tìm thấy sản phẩm.");
                    if (!pr.IsCustom) return AdminResult.Fail(409, "Sản phẩm gốc của hệ thống chỉ có thể ẩn, không thể xóa.");
                    if (await _db.OrderItems.AnyAsync(i => i.ProductId == id, ct)) return AdminResult.Fail(409, "Sản phẩm đã có trong đơn hàng. Hãy ẩn thay vì xóa.");
                    _db.CartItems.RemoveRange(_db.CartItems.Where(c => c.ProductId == id)); _db.SavedProducts.RemoveRange(_db.SavedProducts.Where(s => s.ProductId == id)); _db.Products.Remove(pr); break;
                case "food":
                    var fo = await _db.FoodItems.FirstOrDefaultAsync(x => x.Id == id, ct); if (fo == null) return AdminResult.Fail(404, "Không tìm thấy món ăn.");
                    if (await _db.NutritionLogs.AnyAsync(n => n.FoodItemId == id, ct)) return AdminResult.Fail(409, "Món ăn đã có trong nhật ký người dùng. Hãy ẩn thay vì xóa.");
                    _db.FoodItems.Remove(fo); break;
                case "challenge":
                    var ch = await _db.Challenges.FirstOrDefaultAsync(x => x.Id == id, ct); if (ch == null) return AdminResult.Fail(404, "Không tìm thấy thử thách.");
                    _db.Challenges.Remove(ch); break;                                     // người tham gia xóa theo cascade
                default: return AdminResult.Fail(404, "Loại danh mục không tồn tại.");
            }
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) { return AdminResult.Fail(409, "Mục đang được tham chiếu nên không thể xóa. Hãy ẩn thay vì xóa."); }
        _catalog.Invalidate(); await _audit.LogAsync(actor.Id, actor.Email, $"admin.{kind}.delete", kind, id, null, actor.Ip, ct);
        return AdminResult.Success(new { ok = true });
    }
}
