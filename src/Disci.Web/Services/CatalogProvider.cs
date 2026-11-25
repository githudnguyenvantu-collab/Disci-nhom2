using System.Text.Json;
using Disci.Web.Data;
using Disci.Web.Services.Admin;
using Disci.Web.Services.Engine;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Disci.Web.Services;

public interface ICatalogProvider
{
    Task<DisciEngine> GetEngineAsync(CancellationToken ct = default);
    Task<string> GetPublicJsonAsync(CancellationToken ct = default);   // danh mục đầy đủ (kể cả mục bị ẩn) nhúng vào trang để giao diện dựng lại D.EXERCISES/PRODUCTS/MEALS
    void Invalidate();   // gọi khi quản trị sửa bài tập/sản phẩm/món ăn
}

/// <summary>Dựng CatalogSnapshot từ SQL Server (đã được seed/quản trị chỉnh sửa) rồi cấp cho DisciEngine. Cache trong bộ nhớ.</summary>
public class DbCatalogProvider : ICatalogProvider
{
    private const string Key = "disci.engine";
    private readonly ApplicationDbContext _db; private readonly IMemoryCache _cache; private readonly IHostEnvironment _env;
    public DbCatalogProvider(ApplicationDbContext db, IMemoryCache cache, IHostEnvironment env) { _db = db; _cache = cache; _env = env; }

    private const string JsonKey = "disci.catalog.json";
    public void Invalidate() { _cache.Remove(Key); _cache.Remove(JsonKey); }

    public async Task<string> GetPublicJsonAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(JsonKey, out string? hit) && hit != null) return hit;
        var json = (await CatalogDto.AllAsync(_db, true, ct)).ToJsonString();
        _cache.Set(JsonKey, json, TimeSpan.FromMinutes(30)); return json;
    }

    public async Task<DisciEngine> GetEngineAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(Key, out DisciEngine? hit) && hit != null) return hit;
        static List<string> L(string j) => JsonSerializer.Deserialize<List<string>>(j) ?? new();

        var ex = (await _db.Exercises.AsNoTracking().Where(e => e.IsActive).OrderBy(e => e.IsCustom).ThenBy(e => e.Id).ToListAsync(ct))
            .Select(e => new ExerciseDef { Id = e.Id, Name = e.Name, Cat = e.CategoryKey, Muscles = e.Muscles, Level = e.Level, Equip = L(e.EquipJson), Kind = e.Kind, Sets = e.Sets, Amt = e.Amt, Rest = e.Rest, Tags = L(e.TagsJson), Quiet = e.Quiet, Steps = L(e.StepsJson), Mistakes = L(e.MistakesJson), Rep = e.ReplacementId, Warn = e.Warning, Met = e.Met }).ToList();
        var pr = (await _db.Products.AsNoTracking().Where(p => p.IsActive).ToListAsync(ct))
            .Select(p => new ProductDef { Id = p.Id, Name = p.Name, Cat = p.CategoryKey, Price = p.PriceVnd, Desc = p.Description, Unlocks = p.Unlocks, Goals = L(p.GoalsJson), Space = p.Space, Prio = p.Priority, Icon = p.Icon, Specs = L(p.SpecsJson), How = p.HowToUse, ForWho = p.ForWho, Note = p.Note, Custom = p.IsCustom }).ToList();
        var me = (await _db.FoodItems.AsNoTracking().Where(m => m.IsActive).ToListAsync(ct))
            .Select(m => new MealDef { Id = m.Id, Name = m.Name, Slot = m.Slot, Kcal = m.Kcal, Protein = m.ProteinG, Cost = m.EstCostVnd, Ing = L(m.IngredientsJson), Icon = m.Icon }).ToList();
        var ba = (await _db.BadgeDefinitions.AsNoTracking().ToListAsync(ct)).Select(b => new BadgeDef { Id = b.Id, Name = b.Name, Icon = b.Icon, Test = b.Test }).ToList();

        using var refDoc = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(_env.ContentRootPath, "Data", "Seed", "reference.json"), ct));
        Dictionary<string, string> D(string n) => refDoc.RootElement.GetProperty(n).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");

        var engine = new DisciEngine(new CatalogSnapshot(ex, pr, me, ba, D("goals"), D("equip")));
        _cache.Set(Key, engine, TimeSpan.FromMinutes(30));
        return engine;
    }
}
