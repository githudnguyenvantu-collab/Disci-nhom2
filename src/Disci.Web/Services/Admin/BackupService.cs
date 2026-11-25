using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Audit;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Services.Admin;

public interface IBackupService
{
    Task<AdminResult> CreateAsync(Actor actor, string? note, CancellationToken ct = default);
    Task<AdminResult> CreateDatabaseBackupAsync(Actor actor, string? note, CancellationToken ct = default);
    Task<AdminResult> ListAsync(CancellationToken ct = default);
    Task<BackupRecord?> FindAsync(long id, CancellationToken ct = default);
    string PathOf(BackupRecord r);
    Task<AdminResult> RestoreAsync(Actor actor, long id, CancellationToken ct = default);
    Task<AdminResult> UploadAsync(Actor actor, Stream content, long length, string? note = null, CancellationToken ct = default);
    Task<AdminResult> DeleteAsync(Actor actor, long id, CancellationToken ct = default);
}

public sealed class BackupDoc
{
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; }
    public List<SystemSetting> Settings { get; set; } = new();
    public List<ExerciseCategory> ExerciseCategories { get; set; } = new();
    public List<Exercise> Exercises { get; set; } = new();
    public List<ProductCategory> ProductCategories { get; set; } = new();
    public List<Product> Products { get; set; } = new();
    public List<FoodItem> FoodItems { get; set; } = new();
    public List<BadgeDefinition> Badges { get; set; } = new();
    public List<Challenge> Challenges { get; set; } = new();
    public List<Announcement> Announcements { get; set; } = new();
}

/// <summary>
/// Sao lưu/khôi phục LOGIC cho cấu hình & nội dung quản trị: cấu hình hệ thống, bài tập, sản phẩm, món ăn, huy hiệu, thử thách, thông báo hệ thống.
/// KHÔNG gồm tài khoản, mật khẩu, dữ liệu cá nhân người dùng, bài viết, đơn hàng. Sao lưu toàn bộ cơ sở dữ liệu dùng SQL Server (BACKUP DATABASE / SSMS) – xem tài liệu.
/// Khôi phục là upsert trong MỘT giao dịch: nếu có lỗi thì không thay đổi gì.
/// </summary>
public sealed class BackupService : IBackupService
{
    private const long MaxBytes = 20 * 1024 * 1024;
    private static readonly Regex SettingKey = new(@"^(site|system|upload|ui)\.[A-Za-z0-9_.\-]{1,60}$", RegexOptions.Compiled);
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, ReferenceHandler = null };
    private readonly ApplicationDbContext _db; private readonly IAuditService _audit; private readonly ICatalogProvider _catalog; private readonly ISiteSettings _site; private readonly IConfiguration _cfg; private readonly string _root;

    public BackupService(ApplicationDbContext db, IAuditService audit, ICatalogProvider catalog, ISiteSettings site, IConfiguration cfg, IHostEnvironment env)
    {
        _db = db; _audit = audit; _catalog = catalog; _site = site; _cfg = cfg;
        _root = Path.GetFullPath(cfg["Backups:Root"] is { Length: > 0 } r ? r : Path.Combine(env.ContentRootPath, "App_Data", "backups"));
    }

    public string PathOf(BackupRecord r)
    {
        if (!Regex.IsMatch(r.FileName, @"^(backup-\d{8}-\d{6}-[0-9a-f]{8}\.json|DISCI-\d{8}-\d{6}\.bak)$")) throw new InvalidOperationException("Tên tệp sao lưu không hợp lệ.");
        var full = Path.GetFullPath(Path.Combine(_root, r.FileName));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new InvalidOperationException("Đường dẫn ngoài thư mục sao lưu.");
        return full;
    }

    private static string NewName() => $"backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid().ToString("N")[..8]}.json";

    public async Task<AdminResult> CreateAsync(Actor actor, string? note, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được sao lưu.");
        var doc = new BackupDoc
        {
            CreatedAt = DateTime.UtcNow,
            Settings = await _db.SystemSettings.AsNoTracking().ToListAsync(ct), ExerciseCategories = await _db.ExerciseCategories.AsNoTracking().ToListAsync(ct), Exercises = await _db.Exercises.AsNoTracking().ToListAsync(ct),
            ProductCategories = await _db.ProductCategories.AsNoTracking().ToListAsync(ct), Products = await _db.Products.AsNoTracking().ToListAsync(ct), FoodItems = await _db.FoodItems.AsNoTracking().ToListAsync(ct),
            Badges = await _db.BadgeDefinitions.AsNoTracking().ToListAsync(ct), Challenges = await _db.Challenges.AsNoTracking().ToListAsync(ct), Announcements = await _db.Announcements.AsNoTracking().ToListAsync(ct)
        };
        var name = NewName(); Directory.CreateDirectory(_root);
        var rec = new BackupRecord { FileName = name, CreatedBy = actor.Id, Note = note is { Length: > 300 } ? note[..300] : note };
        var path = PathOf(rec);
        await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) await JsonSerializer.SerializeAsync(fs, doc, Json, ct);
        rec.SizeBytes = new FileInfo(path).Length; _db.BackupRecords.Add(rec); await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(actor.Id, actor.Email, "admin.backup.create", "Backup", rec.Id.ToString(), name, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, id = rec.Id, file = name, size = rec.SizeBytes });
    }

    /// <summary>
    /// Sao lưu TOÀN BỘ cơ sở dữ liệu bằng lệnh BACKUP DATABASE của SQL Server (tài khoản, dữ liệu người dùng, bài viết, đơn hàng… tất cả).
    /// Tệp .bak được SQL Server ghi vào thư mục cấu hình ở Backups:SqlRoot – thư mục này phải tồn tại và dịch vụ SQL Server phải có quyền ghi (đường dẫn tính theo máy chạy SQL Server).
    /// Khôi phục KHÔNG làm từ ứng dụng (cần quyền độc quyền trên database): dùng SSMS → Tasks → Restore.
    /// </summary>
    public async Task<AdminResult> CreateDatabaseBackupAsync(Actor actor, string? note, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được sao lưu cơ sở dữ liệu.");
        if (!_db.Database.IsSqlServer()) return AdminResult.Fail(422, "Chỉ hỗ trợ sao lưu toàn bộ khi dùng SQL Server.");
        var dir = _cfg["Backups:SqlRoot"];
        if (string.IsNullOrWhiteSpace(dir)) return AdminResult.Fail(422, "Chưa cấu hình Backups:SqlRoot (thư mục trên máy SQL Server mà dịch vụ SQL Server có quyền ghi, ví dụ C:\\Backup).");
        var file = $"DISCI-{DateTime.UtcNow:yyyyMMdd-HHmmss}.bak"; var path = Path.Combine(dir, file);
        var dbName = _db.Database.GetDbConnection().Database; var quoted = "[" + dbName.Replace("]", "]]") + "]";          // tên database lấy từ chuỗi kết nối, được trích dẫn an toàn
        try
        {
            _db.Database.SetCommandTimeout(900);
            await _db.Database.ExecuteSqlRawAsync("BACKUP DATABASE " + quoted + " TO DISK = @p0 WITH INIT, CHECKSUM, NAME = @p1",
                new object[] { new Microsoft.Data.SqlClient.SqlParameter("p0", path), new Microsoft.Data.SqlClient.SqlParameter("p1", "DISCI full backup " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm")) }, ct);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return AdminResult.Fail(500, "SQL Server không ghi được tệp sao lưu (kiểm tra quyền thư mục Backups:SqlRoot): " + (ex.Message.Length > 300 ? ex.Message[..300] : ex.Message));
        }
        long size = 0; try { if (File.Exists(path)) size = new FileInfo(path).Length; } catch (IOException) { }              // chỉ đo được khi SQL Server chạy cùng máy
        var rec = new BackupRecord { FileName = file, SizeBytes = size, CreatedBy = actor.Id, Note = "Toàn bộ CSDL (.bak)" + (string.IsNullOrWhiteSpace(note) ? "" : " – " + (note.Length > 250 ? note[..250] : note)) };
        _db.BackupRecords.Add(rec); await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(actor.Id, actor.Email, "admin.backup.database", "Backup", rec.Id.ToString(), file, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, id = rec.Id, file, location = path });
    }

    public async Task<AdminResult> ListAsync(CancellationToken ct = default)
        => AdminResult.Success(await _db.BackupRecords.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(200).Select(b => new { id = b.Id, file = b.FileName, size = b.SizeBytes, at = b.CreatedAt, note = b.Note, by = b.CreatedBy }).ToListAsync(ct));

    public Task<BackupRecord?> FindAsync(long id, CancellationToken ct = default) => _db.BackupRecords.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id, ct);

    public async Task<AdminResult> UploadAsync(Actor actor, Stream content, long length, string? note = null, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được tải lên bản sao lưu.");
        if (length <= 0 || length > MaxBytes) return AdminResult.Fail(422, "Tệp sao lưu rỗng hoặc quá lớn (tối đa 20 MB).");
        BackupDoc? doc;
        try { doc = await JsonSerializer.DeserializeAsync<BackupDoc>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }, ct); }
        catch (JsonException) { return AdminResult.Fail(422, "Tệp không phải bản sao lưu DISCI hợp lệ."); }
        if (doc == null || doc.Version != 1) return AdminResult.Fail(422, "Phiên bản bản sao lưu không được hỗ trợ.");
        var name = NewName(); Directory.CreateDirectory(_root); var rec = new BackupRecord { FileName = name, CreatedBy = actor.Id, Note = note is { Length: > 300 } ? note[..300] : (note ?? "Tải lên") };
        var path = PathOf(rec); await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) await JsonSerializer.SerializeAsync(fs, doc, Json, ct);   // ghi lại từ dữ liệu đã phân tích, không lưu byte thô
        rec.SizeBytes = new FileInfo(path).Length; _db.BackupRecords.Add(rec); await _db.SaveChangesAsync(ct);
        await _audit.LogAsync(actor.Id, actor.Email, "admin.backup.upload", "Backup", rec.Id.ToString(), name, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, id = rec.Id });
    }

    public async Task<AdminResult> RestoreAsync(Actor actor, long id, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được khôi phục.");
        var rec = await FindAsync(id, ct); if (rec == null) return AdminResult.Fail(404, "Không tìm thấy bản sao lưu.");
        if (rec.FileName.EndsWith(".bak", StringComparison.OrdinalIgnoreCase)) return AdminResult.Fail(422, "Bản sao lưu toàn bộ CSDL (.bak) được khôi phục bằng SSMS (Tasks → Restore), không làm từ ứng dụng.");
        var path = PathOf(rec); if (!File.Exists(path)) return AdminResult.Fail(404, "Tệp sao lưu không còn trên máy chủ.");
        BackupDoc? doc;
        await using (var fs = File.OpenRead(path)) doc = await JsonSerializer.DeserializeAsync<BackupDoc>(fs, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }, ct);
        if (doc == null || doc.Version != 1) return AdminResult.Fail(422, "Bản sao lưu không hợp lệ.");

        var catKeys = (await _db.ExerciseCategories.Select(c => c.Key).ToListAsync(ct)).Concat(doc.ExerciseCategories.Select(c => c.Key)).ToHashSet();
        var pcatKeys = (await _db.ProductCategories.Select(c => c.Key).ToListAsync(ct)).Concat(doc.ProductCategories.Select(c => c.Key)).ToHashSet();
        if (doc.Exercises.Any(e => !catKeys.Contains(e.CategoryKey))) return AdminResult.Fail(422, "Bản sao lưu có bài tập tham chiếu nhóm cơ không tồn tại.");
        if (doc.Products.Any(p => !pcatKeys.Contains(p.CategoryKey))) return AdminResult.Fail(422, "Bản sao lưu có sản phẩm tham chiếu danh mục không tồn tại.");

        // Tất cả thay đổi nằm trong một lần SaveChanges (một giao dịch): lỗi ở bất kỳ đâu thì không đổi gì.
        foreach (var c in doc.ExerciseCategories) await Upsert(_db.ExerciseCategories, c, new object[] { c.Key }, ct);
        foreach (var c in doc.ProductCategories) await Upsert(_db.ProductCategories, c, new object[] { c.Key }, ct);
        foreach (var e in doc.Exercises) { e.Category = null!; e.Replacement = null; await Upsert(_db.Exercises, e, new object[] { e.Id }, ct); }
        foreach (var p in doc.Products) { p.Category = null!; await Upsert(_db.Products, p, new object[] { p.Id }, ct); }
        foreach (var f in doc.FoodItems) await Upsert(_db.FoodItems, f, new object[] { f.Id }, ct);
        foreach (var b in doc.Badges) await Upsert(_db.BadgeDefinitions, b, new object[] { b.Id }, ct);
        foreach (var c in doc.Challenges) await Upsert(_db.Challenges, c, new object[] { c.Id }, ct);
        foreach (var s in doc.Settings.Where(s => SettingKey.IsMatch(s.Key))) await Upsert(_db.SystemSettings, s, new object[] { s.Key }, ct);
        _db.Announcements.RemoveRange(await _db.Announcements.ToListAsync(ct));
        foreach (var a in doc.Announcements) { a.Id = 0; _db.Announcements.Add(a); }
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { _db.ChangeTracker.Clear(); return AdminResult.Fail(422, "Không khôi phục được: dữ liệu trong bản sao lưu vi phạm ràng buộc. Không có gì bị thay đổi."); }
        _catalog.Invalidate(); _site.Invalidate();
        await _audit.LogAsync(actor.Id, actor.Email, "admin.backup.restore", "Backup", id.ToString(), rec.FileName, actor.Ip, ct);
        return AdminResult.Success(new { ok = true, exercises = doc.Exercises.Count, products = doc.Products.Count, foods = doc.FoodItems.Count, challenges = doc.Challenges.Count, settings = doc.Settings.Count });
    }

    private async Task Upsert<T>(DbSet<T> set, T item, object[] key, CancellationToken ct) where T : class
    {
        var existing = await set.FindAsync(key, ct);
        if (existing == null) set.Add(item); else _db.Entry(existing).CurrentValues.SetValues(item);
    }

    public async Task<AdminResult> DeleteAsync(Actor actor, long id, CancellationToken ct = default)
    {
        if (!actor.IsAdmin) return AdminResult.Fail(403, "Chỉ quản trị viên (Admin) mới được xóa bản sao lưu.");
        var rec = await _db.BackupRecords.FirstOrDefaultAsync(b => b.Id == id, ct); if (rec == null) return AdminResult.Fail(404, "Không tìm thấy bản sao lưu.");
        var path = PathOf(rec); _db.BackupRecords.Remove(rec); await _db.SaveChangesAsync(ct);
        if (!rec.FileName.EndsWith(".bak", StringComparison.OrdinalIgnoreCase)) { try { if (File.Exists(path)) File.Delete(path); } catch (IOException) { } }   // .bak nằm trên máy SQL Server: chỉ gỡ bản ghi
        await _audit.LogAsync(actor.Id, actor.Email, "admin.backup.delete", "Backup", id.ToString(), rec.FileName, actor.Ip, ct);
        return AdminResult.Success(new { ok = true });
    }
}
