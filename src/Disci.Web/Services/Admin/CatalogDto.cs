using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Disci.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Admin;

/// <summary>Chuyển bài tập/sản phẩm/món ăn/thử thách trong DB sang đúng hình dạng mà giao diện (data.js) dùng; trường mở rộng (ExtraJson) được ghép lại để không mất gì.</summary>
public static class CatalogDto
{
    public static readonly HashSet<string> ExerciseKnown = new() { "id", "name", "cat", "muscles", "level", "equip", "kind", "sets", "amt", "rest", "tags", "quiet", "steps", "mistakes", "rep", "warn", "met", "image", "video", "active", "custom" };
    public static readonly HashSet<string> ProductKnown = new() { "id", "name", "cat", "price", "desc", "unlocks", "goals", "space", "prio", "icon", "specs", "how", "forWho", "note", "image", "supplement", "active", "custom" };
    public static readonly HashSet<string> FoodKnown = new() { "id", "name", "slot", "kcal", "protein", "cost", "ing", "icon", "active", "custom" };
    public static readonly HashSet<string> ChallengeKnown = new() { "id", "name", "days", "goal", "metric", "desc", "reward", "active", "custom" };

    private static readonly Regex ExtraKey = new(@"^[A-Za-z][A-Za-z0-9_]{0,30}$", RegexOptions.Compiled);
    private static readonly Regex MediaUrl = new(@"^/media/[0-9a-f]{32}\.(jpg|png|webp|gif|mp4|webm|mov)$", RegexOptions.Compiled);
    private static readonly Regex MediaKey = new(@"^[A-Za-z0-9_.:\-]{0,120}$", RegexOptions.Compiled);
    private const int MaxExtraChars = 20_000;

    public sealed class Invalid : Exception { public Invalid(string m) : base(m) { } }

    /// <summary>Thu các trường ngoài danh sách đã biết vào ExtraJson sau khi kiểm tra kích thước/độ sâu/kiểu; `images` chỉ nhận ảnh đã tải lên hệ thống.</summary>
    public static string SanitizeExtras(JsonObject o, HashSet<string> known)
    {
        var extra = new JsonObject();
        foreach (var kv in o)
        {
            if (known.Contains(kv.Key) || kv.Key is "hidden" or "patched" or "base") continue;
            if (!ExtraKey.IsMatch(kv.Key)) throw new Invalid($"Tên trường '{kv.Key}' không hợp lệ.");
            if (kv.Value == null) continue;
            Check(kv.Value, kv.Key, 0);
            if (kv.Key == "images")
            {
                if (kv.Value is not JsonArray arr) throw new Invalid("'images' phải là danh sách.");
                foreach (var n in arr) if (!(n is JsonValue v && v.TryGetValue<string>(out var s) && MediaUrl.IsMatch(s))) throw new Invalid("Ảnh sản phẩm phải được tải lên qua hệ thống (/media/…). Hãy thử tải lại ảnh.");
            }
            if (kv.Key.EndsWith("Key", StringComparison.Ordinal) && !(kv.Value is JsonValue kvv && kvv.TryGetValue<string>(out var ks) && MediaKey.IsMatch(ks))) throw new Invalid($"'{kv.Key}' không hợp lệ.");
            extra[kv.Key] = kv.Value.DeepClone();
        }
        var json = extra.ToJsonString();
        if (json.Length > MaxExtraChars) throw new Invalid("Dữ liệu mở rộng quá lớn (tối đa 20.000 ký tự).");
        return json;
    }

    private static void Check(JsonNode n, string path, int depth)
    {
        if (depth > 4) throw new Invalid($"'{path}' lồng quá sâu.");
        switch (n)
        {
            case JsonValue v:
                if (v.TryGetValue<string>(out var s)) { if (s.Length > 2000) throw new Invalid($"'{path}' quá dài (tối đa 2000 ký tự)."); }
                else if (v.TryGetValue<double>(out var d)) { if (!double.IsFinite(d)) throw new Invalid($"'{path}' không hợp lệ."); }
                else if (!v.TryGetValue<bool>(out _)) throw new Invalid($"'{path}' có kiểu dữ liệu không hỗ trợ.");
                break;
            case JsonArray a: if (a.Count > 60) throw new Invalid($"'{path}' tối đa 60 mục."); foreach (var x in a) if (x != null) Check(x, path, depth + 1); break;
            case JsonObject o: if (o.Count > 40) throw new Invalid($"'{path}' tối đa 40 trường."); foreach (var kv in o) if (kv.Value != null) Check(kv.Value, path + "." + kv.Key, depth + 1); break;
        }
    }

    private static JsonArray L(string json) => JsonNode.Parse(json) as JsonArray ?? new JsonArray();
    private static JsonObject WithExtras(JsonObject baseObj, string extraJson)
    {
        if (!string.IsNullOrEmpty(extraJson) && extraJson != "{}" && JsonNode.Parse(extraJson) is JsonObject ex)
            foreach (var kv in ex) if (!baseObj.ContainsKey(kv.Key)) baseObj[kv.Key] = kv.Value?.DeepClone();
        return baseObj;
    }

    public static async Task<List<JsonObject>> ListAsync(ApplicationDbContext db, string kind, bool includeInactive, CancellationToken ct = default)
    {
        var res = new List<JsonObject>();
        switch (kind)
        {
            case "exercise":
                foreach (var e in await db.Exercises.AsNoTracking().Where(e => includeInactive || e.IsActive).OrderBy(e => e.CategoryKey).ThenBy(e => e.Id).ToListAsync(ct))
                    res.Add(WithExtras(new JsonObject { ["id"] = e.Id, ["name"] = e.Name, ["cat"] = e.CategoryKey, ["muscles"] = e.Muscles, ["level"] = e.Level, ["equip"] = L(e.EquipJson), ["kind"] = e.Kind, ["sets"] = e.Sets, ["amt"] = e.Amt, ["rest"] = e.Rest, ["tags"] = L(e.TagsJson), ["quiet"] = e.Quiet, ["steps"] = L(e.StepsJson), ["mistakes"] = L(e.MistakesJson), ["rep"] = e.ReplacementId, ["warn"] = e.Warning ?? "", ["met"] = e.Met, ["image"] = e.ImageUrl, ["video"] = e.VideoUrl, ["active"] = e.IsActive, ["custom"] = e.IsCustom }, e.ExtraJson));
                break;
            case "product":
                foreach (var p in await db.Products.AsNoTracking().Where(p => includeInactive || p.IsActive).OrderBy(p => p.CategoryKey).ThenBy(p => p.Id).ToListAsync(ct))
                    res.Add(WithExtras(new JsonObject { ["id"] = p.Id, ["name"] = p.Name, ["cat"] = p.CategoryKey, ["price"] = p.PriceVnd, ["desc"] = p.Description ?? "", ["unlocks"] = p.Unlocks, ["goals"] = L(p.GoalsJson), ["space"] = p.Space, ["prio"] = p.Priority, ["icon"] = p.Icon, ["specs"] = L(p.SpecsJson), ["how"] = p.HowToUse ?? "", ["forWho"] = p.ForWho ?? "", ["note"] = p.Note ?? "", ["image"] = p.ImageUrl, ["supplement"] = p.IsSupplement, ["active"] = p.IsActive, ["custom"] = p.IsCustom }, p.ExtraJson));
                break;
            case "food":
                foreach (var f in await db.FoodItems.AsNoTracking().Where(f => includeInactive || f.IsActive).OrderBy(f => f.Slot).ThenBy(f => f.Id).ToListAsync(ct))
                    res.Add(WithExtras(new JsonObject { ["id"] = f.Id, ["name"] = f.Name, ["slot"] = f.Slot, ["kcal"] = f.Kcal, ["protein"] = f.ProteinG, ["cost"] = f.EstCostVnd, ["ing"] = L(f.IngredientsJson), ["icon"] = f.Icon, ["active"] = f.IsActive }, f.ExtraJson));
                break;
            case "challenge":
                foreach (var c in await db.Challenges.AsNoTracking().Where(c => includeInactive || c.IsActive).OrderBy(c => c.Id).ToListAsync(ct))
                    res.Add(WithExtras(new JsonObject { ["id"] = c.Id, ["name"] = c.Name, ["days"] = c.Days, ["goal"] = c.Goal, ["metric"] = c.Metric, ["desc"] = c.Description ?? "", ["reward"] = c.Reward ?? "", ["active"] = c.IsActive }, c.ExtraJson));
                break;
            default: throw new Invalid("Loại danh mục không tồn tại (exercise | product | food | challenge).");
        }
        return res;
    }

    public static async Task<JsonObject> AllAsync(ApplicationDbContext db, bool includeInactive, CancellationToken ct = default)
    {
        var o = new JsonObject();
        foreach (var k in new[] { "exercise", "product", "food", "challenge" }) o[k] = new JsonArray((await ListAsync(db, k, includeInactive, ct)).Select(x => (JsonNode?)x).ToArray());
        return o;
    }
}
