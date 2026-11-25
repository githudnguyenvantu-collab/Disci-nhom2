using System.Text.Json;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Engine;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Data;

public static class Roles
{
    public const string Admin = "Admin", Editor = "Editor", Moderator = "Moderator", User = "User";
    public static readonly string[] All = { Admin, Editor, Moderator, User };
}

/// <summary>Seed idempotent: chạy nhiều lần không tạo trùng. Dữ liệu danh mục lấy từ Data/Seed/*.json (xuất từ assets/data.js).</summary>
public class DbSeeder
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<IdentityRole> _roles;
    private readonly IConfiguration _cfg;
    private readonly IHostEnvironment _env;
    private readonly ILogger<DbSeeder> _log;

    public DbSeeder(ApplicationDbContext db, UserManager<ApplicationUser> users, RoleManager<IdentityRole> roles, IConfiguration cfg, IHostEnvironment env, ILogger<DbSeeder> log)
    { _db = db; _users = users; _roles = roles; _cfg = cfg; _env = env; _log = log; }

    public async Task SeedAsync()
    {
        await SeedRolesAsync();
        await SeedAdminAsync();
        await SeedCatalogAsync();
        await SeedSettingsAsync();
        if (_cfg.GetValue("Seed:CreateDemoUser", _env.IsDevelopment())) await SeedDemoUserAsync();
    }

    private static string Dump(object? v) => JsonSerializer.Serialize(v);
    private T[] Read<T>(string file) => JsonSerializer.Deserialize<T[]>(File.ReadAllText(Path.Combine(_env.ContentRootPath, "Data", "Seed", file)), Json)!;

    private async Task SeedRolesAsync()
    {
        foreach (var r in Roles.All)
            if (!await _roles.RoleExistsAsync(r)) await _roles.CreateAsync(new IdentityRole(r));
    }

    public const string DemoUserEmail = "demo@disci.vn", DemoUserPassword = "Demo@1234";
    /// <summary>Chỉ dùng ở môi trường Development khi chưa cấu hình Seed:Admin:*. Production KHÔNG bao giờ có tài khoản mặc định.</summary>
    public const string DevAdminEmail = "admin@disci.vn", DevAdminPassword = "Admin@1234";

    /// <summary>Email/mật khẩu admin: lấy từ cấu hình (User Secrets, biến môi trường, appsettings). Thiếu thì chỉ ở Development mới dùng tài khoản dev mặc định.</summary>
    public (string? Email, string? Password) AdminCredentials()
    {
        var email = _cfg["Seed:Admin:Email"]; var pwd = _cfg["Seed:Admin:Password"];
        if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(pwd)) return (email.Trim(), pwd);
        return _env.IsDevelopment() ? (DevAdminEmail, DevAdminPassword) : (null, null);
    }

    /// <summary>Đảm bảo tài khoản Admin và Demo User tồn tại (dùng cho nút "Đăng nhập demo", chỉ gọi ở Development).</summary>
    public async Task EnsureDemoAccountsAsync()
    {
        await SeedAdminAsync();
        await SeedDemoUserAsync();
    }

    /// <summary>
    /// Development: đưa tài khoản về trạng thái đăng nhập được bằng đúng mật khẩu cấu hình – sửa mật khẩu bị lệch (ví dụ tài khoản tạo từ lần chạy trước),
    /// bỏ khóa tạm do nhập sai, bỏ khóa/xóa mềm, bỏ yêu cầu đổi mật khẩu. KHÔNG chạy ở Production.
    /// </summary>
    private async Task RepairDevAccountAsync(ApplicationUser u, string password)
    {
        var changed = false;
        if (!u.IsActive) { u.IsActive = true; changed = true; }
        if (u.DeletedAt != null) { u.DeletedAt = null; changed = true; }
        if (!u.EmailConfirmed) { u.EmailConfirmed = true; changed = true; }
        if (u.MustChangePassword) { u.MustChangePassword = false; changed = true; }
        if (changed) await _users.UpdateAsync(u);
        if (!await _users.CheckPasswordAsync(u, password))
        {
            var token = await _users.GeneratePasswordResetTokenAsync(u);
            var r = await _users.ResetPasswordAsync(u, token, password);
            if (r.Succeeded) _log.LogWarning("Development: đã đặt lại mật khẩu của {Email} theo cấu hình.", u.Email);
            else _log.LogError("Development: không đặt lại được mật khẩu của {Email}: {Errors}", u.Email, string.Join("; ", r.Errors.Select(e => e.Description)));
        }
        await _users.SetLockoutEndDateAsync(u, null);
        await _users.ResetAccessFailedCountAsync(u);
    }

    /// <summary>
    /// Tài khoản quản trị: cấu hình bằng User Secrets / biến môi trường / appsettings (Seed:Admin:Email, Seed:Admin:Password).
    /// Production không có mật khẩu mặc định; Development không cấu hình thì dùng admin@disci.vn / Admin@1234.
    /// </summary>
    private async Task SeedAdminAsync()
    {
        var (email, pwd) = AdminCredentials();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(pwd))
        {
            _log.LogWarning("Chưa cấu hình Seed:Admin:Email/Password – bỏ qua tạo tài khoản Admin. Xem README-LUOT1.md.");
            return;
        }
        var u = await _users.FindByEmailAsync(email);
        if (u == null)
        {
            u = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FullName = "Quản trị DISCI" };
            var r = await _users.CreateAsync(u, pwd);
            if (!r.Succeeded) { _log.LogError("Không tạo được Admin: {Errors}", string.Join("; ", r.Errors.Select(e => e.Description))); return; }
        }
        else if (_env.IsDevelopment()) await RepairDevAccountAsync(u, pwd);
        if (!await _users.IsInRoleAsync(u, Roles.Admin)) await _users.AddToRoleAsync(u, Roles.Admin);
    }

    private async Task SeedDemoUserAsync()
    {
        var u = await _users.FindByEmailAsync(DemoUserEmail);
        if (u == null)
        {
            u = new ApplicationUser { UserName = DemoUserEmail, Email = DemoUserEmail, EmailConfirmed = true, FullName = "Người dùng Demo", IsDemo = true };
            var r = await _users.CreateAsync(u, DemoUserPassword);
            if (!r.Succeeded) { _log.LogWarning("Không tạo được user demo: {E}", string.Join("; ", r.Errors.Select(e => e.Description))); return; }
        }
        else if (_env.IsDevelopment()) await RepairDevAccountAsync(u, DemoUserPassword);
        if (!await _users.IsInRoleAsync(u, Roles.User)) await _users.AddToRoleAsync(u, Roles.User);
        if (!await _db.UserProfiles.AnyAsync(p => p.UserId == u.Id))
        {
            _db.UserProfiles.Add(new UserProfile { UserId = u.Id, OnboardingCompleted = true });
            await _db.SaveChangesAsync();
        }
    }

    private async Task SeedCatalogAsync()
    {
        using var refDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(_env.ContentRootPath, "Data", "Seed", "reference.json")));
        var root = refDoc.RootElement;

        if (!await _db.ExerciseCategories.AnyAsync())
        {
            var names = root.GetProperty("cats").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");
            var icons = root.GetProperty("catIcon").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString());
            _db.ExerciseCategories.AddRange(names.Select(k => new ExerciseCategory { Key = k.Key, Name = k.Value, Icon = icons.GetValueOrDefault(k.Key) }));
            await _db.SaveChangesAsync();
        }

        if (!await _db.Exercises.AnyAsync())
        {
            var list = Read<ExerciseDef>("exercises.json");
            _db.Exercises.AddRange(list.Select(e => new Exercise
            {
                Id = e.Id, CategoryKey = e.Cat, Name = e.Name, Muscles = e.Muscles, Level = e.Level, EquipJson = Dump(e.Equip), TagsJson = Dump(e.Tags),
                Kind = e.Kind, Sets = e.Sets, Amt = e.Amt, Rest = e.Rest, Quiet = e.Quiet, StepsJson = Dump(e.Steps), MistakesJson = Dump(e.Mistakes),
                Warning = string.IsNullOrEmpty(e.Warn) ? null : e.Warn, Met = e.Met
            }));
            await _db.SaveChangesAsync();
            // bài thay thế: cập nhật sau khi mọi bài đã tồn tại (tránh lỗi khóa ngoại tham chiếu tới hàng chưa chèn)
            var map = list.Where(e => !string.IsNullOrEmpty(e.Rep)).ToDictionary(e => e.Id, e => e.Rep!);
            var ids = map.Values.ToHashSet();
            foreach (var ex in await _db.Exercises.Where(x => map.Keys.Contains(x.Id)).ToListAsync())
                if (_db.Exercises.Local.Any(l => l.Id == map[ex.Id]) || await _db.Exercises.AnyAsync(x => x.Id == map[ex.Id])) ex.ReplacementId = map[ex.Id];
            await _db.SaveChangesAsync();
        }

        if (!await _db.ProductCategories.AnyAsync())
        {
            _db.ProductCategories.AddRange(root.GetProperty("productCats").EnumerateObject().Select(p => new ProductCategory { Key = p.Name, Name = p.Value.GetString() ?? "" }));
            await _db.SaveChangesAsync();
        }

        if (!await _db.Products.AnyAsync())
        {
            _db.Products.AddRange(Read<ProductDef>("products.json").Select(p => new Product
            {
                Id = p.Id, CategoryKey = p.Cat, Name = p.Name, PriceVnd = p.Price, Description = p.Desc, Unlocks = p.Unlocks, GoalsJson = Dump(p.Goals),
                Space = p.Space, Priority = p.Prio, Icon = p.Icon, SpecsJson = Dump(p.Specs), HowToUse = p.How, ForWho = p.ForWho, Note = p.Note,
                IsSupplement = p.Cat == "supp"
            }));
            await _db.SaveChangesAsync();
        }

        if (!await _db.FoodItems.AnyAsync())
        {
            _db.FoodItems.AddRange(Read<MealDef>("meals.json").Select(m => new FoodItem { Id = m.Id, Name = m.Name, Slot = m.Slot, Kcal = m.Kcal, ProteinG = m.Protein, EstCostVnd = m.Cost, IngredientsJson = Dump(m.Ing), Icon = m.Icon }));
            await _db.SaveChangesAsync();
        }

        if (!await _db.BadgeDefinitions.AnyAsync())
        {
            _db.BadgeDefinitions.AddRange(Read<BadgeDef>("badges.json").Select(b => new BadgeDefinition { Id = b.Id, Name = b.Name, Icon = b.Icon, Test = b.Test }));
            await _db.SaveChangesAsync();
        }

        if (!await _db.Challenges.AnyAsync())
        {
            foreach (var c in JsonDocument.Parse(File.ReadAllText(Path.Combine(_env.ContentRootPath, "Data", "Seed", "challenges.json"))).RootElement.EnumerateArray())
                _db.Challenges.Add(new Challenge
                {
                    Id = c.GetProperty("id").GetString()!, Name = c.GetProperty("name").GetString()!, Days = c.GetProperty("days").GetInt32(), Goal = c.GetProperty("goal").GetInt32(),
                    Metric = c.GetProperty("metric").GetString()!, Description = c.TryGetProperty("desc", out var d) ? d.GetString() : null,
                    Reward = c.TryGetProperty("reward", out var rw) ? rw.GetString() : null, DemoMembers = c.TryGetProperty("demoMembers", out var dm) ? dm.GetInt32() : 0
                });
            await _db.SaveChangesAsync();
        }
    }

    private async Task SeedSettingsAsync()
    {
        if (await _db.SystemSettings.AnyAsync()) return;
        _db.SystemSettings.AddRange(
            new SystemSetting { Key = "site.name", ValueJson = Dump("DISCI") },
            new SystemSetting { Key = "site.theme.default", ValueJson = Dump("dark") },
            new SystemSetting { Key = "site.registration.open", ValueJson = Dump(true) },
            new SystemSetting { Key = "upload.maxImageMb", ValueJson = Dump(5) },
            new SystemSetting { Key = "upload.maxVideoMb", ValueJson = Dump(50) });
        await _db.SaveChangesAsync();
    }
}
