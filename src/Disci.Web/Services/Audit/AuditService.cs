using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Audit;

public interface IAuditService
{
    Task LogAsync(string? actorId, string? actorEmail, string action, string? entityType = null, string? entityId = null, string? detail = null, string? ip = null, CancellationToken ct = default);
    Task<(List<AuditLog> Items, int Total)> QueryAsync(string? action, string? actor, DateTime? from, DateTime? to, int page, int pageSize, CancellationToken ct = default);
}

/// <summary>Nhật ký hoạt động (AuditLogs). Không bao giờ ghi mật khẩu/token. Ghi nhật ký thất bại không được làm hỏng thao tác chính.</summary>
public sealed class AuditService : IAuditService
{
    private readonly ApplicationDbContext _db; private readonly ILogger<AuditService> _log;
    public AuditService(ApplicationDbContext db, ILogger<AuditService> log) { _db = db; _log = log; }

    public async Task LogAsync(string? actorId, string? actorEmail, string action, string? entityType = null, string? entityId = null, string? detail = null, string? ip = null, CancellationToken ct = default)
    {
        try
        {
            static string? Cut(string? s, int n) => s == null ? null : (s.Length > n ? s[..n] : s);
            _db.AuditLogs.Add(new AuditLog { ActorId = Cut(actorId, 450), ActorEmail = Cut(actorEmail, 256), Action = Cut(action, 60)!, EntityType = Cut(entityType, 60), EntityId = Cut(entityId, 60), Detail = Cut(detail, 1000), Ip = Cut(ip, 45) });
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is DbUpdateException or InvalidOperationException) { _log.LogError(ex, "Không ghi được nhật ký {Action}", action); }
    }

    public async Task<(List<AuditLog> Items, int Total)> QueryAsync(string? action, string? actor, DateTime? from, DateTime? to, int page, int pageSize, CancellationToken ct = default)
    {
        var q = _db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(action)) q = q.Where(a => a.Action.StartsWith(action));
        if (!string.IsNullOrWhiteSpace(actor)) q = q.Where(a => a.ActorEmail != null && a.ActorEmail.Contains(actor));
        if (from != null) q = q.Where(a => a.At >= from); if (to != null) q = q.Where(a => a.At <= to);
        pageSize = Math.Clamp(pageSize, 1, 200); page = Math.Max(1, page);
        return (await q.OrderByDescending(a => a.At).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct), await q.CountAsync(ct));
    }
}
