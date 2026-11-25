using System.Text.Json;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Disci.Web.Services;

public interface ISiteSettings
{
    /// <summary>JSON các cấu hình công khai (khóa site.* và ui.*) – nhúng vào mọi trang để giao diện áp dụng thương hiệu/màu sắc/luồng do quản trị cấu hình.</summary>
    Task<string> GetPublicJsonAsync(CancellationToken ct = default);
    /// <summary>Chế độ bảo trì (system.maintenance + system.maintenanceMsg) – máy chủ dùng để chặn người dùng thường.</summary>
    Task<(bool On, string Message)> GetMaintenanceAsync(CancellationToken ct = default);
    void Invalidate();
}

public sealed class SiteSettings : ISiteSettings
{
    private const string KeyPublic = "disci.site.public", KeyMaint = "disci.site.maint", DefaultMsg = "DISCI đang bảo trì. Vui lòng quay lại sau.";
    private readonly ApplicationDbContext _db; private readonly IMemoryCache _cache;
    public SiteSettings(ApplicationDbContext db, IMemoryCache cache) { _db = db; _cache = cache; }

    public void Invalidate() { _cache.Remove(KeyPublic); _cache.Remove(KeyMaint); }

    public async Task<string> GetPublicJsonAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(KeyPublic, out string? hit) && hit != null) return hit;
        var o = new JsonObject();
        foreach (var r in await _db.SystemSettings.AsNoTracking().Where(s => s.Key.StartsWith("site.") || s.Key.StartsWith("ui.")).ToListAsync(ct))
        { try { o[r.Key] = JsonNode.Parse(r.ValueJson); } catch (JsonException) { } }
        var json = o.ToJsonString(); _cache.Set(KeyPublic, json, TimeSpan.FromSeconds(20)); return json;
    }

    public async Task<(bool On, string Message)> GetMaintenanceAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(KeyMaint, out (bool, string) hit)) return hit;
        var rows = await _db.SystemSettings.AsNoTracking().Where(s => s.Key == "system.maintenance" || s.Key == "system.maintenanceMsg").ToDictionaryAsync(s => s.Key, s => s.ValueJson, ct);
        bool on = rows.TryGetValue("system.maintenance", out var m) && m.Trim() == "true";
        string msg = DefaultMsg; if (rows.TryGetValue("system.maintenanceMsg", out var mm)) { try { var t = JsonNode.Parse(mm)?.GetValue<string>(); if (!string.IsNullOrWhiteSpace(t)) msg = t!; } catch (Exception ex) when (ex is JsonException or InvalidOperationException) { } }
        var res = (on, msg); _cache.Set(KeyMaint, res, TimeSpan.FromSeconds(10)); return res;
    }
}
