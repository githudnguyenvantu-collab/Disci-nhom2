using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Security;
using Disci.Web.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Database (SQL Server) ----------
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:DefaultConnection trong appsettings.json.");
builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseSqlServer(connectionString));

// ---------- Identity + Cookie ----------
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(o =>
{
    o.Password.RequiredLength = 8;
    o.Password.RequireDigit = false;           // quy tắc "có chữ + số" do LetterAndDigitPasswordValidator kiểm tra
    o.Password.RequireLowercase = false;
    o.Password.RequireUppercase = false;
    o.Password.RequireNonAlphanumeric = false;
    o.User.RequireUniqueEmail = true;
    o.SignIn.RequireConfirmedAccount = false;  // bật ở Lượt 2 khi có dịch vụ gửi email
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders()
.AddPasswordValidator<LetterAndDigitPasswordValidator>();

builder.Services.Configure<SecurityStampValidatorOptions>(o => o.ValidationInterval = TimeSpan.FromMinutes(1));

builder.Services.ConfigureApplicationCookie(o =>
{
    o.LoginPath = "/Account/Login";
    o.AccessDeniedPath = "/Account/Denied";
    o.Cookie.Name = "DISCI.Auth";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
    // Khu vực quản trị có trang đăng nhập riêng (nút Shield/Lock) – không hiển thị tab "Quản trị" trên form đăng nhập chính.
    o.Events.OnRedirectToLogin = ctx =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; }
        var admin = ctx.Request.Path.StartsWithSegments("/Admin", StringComparison.OrdinalIgnoreCase) || ctx.Request.Path.Value?.Equals("/admin.html", StringComparison.OrdinalIgnoreCase) == true;
        ctx.Response.Redirect(admin ? "/Admin/Login" : ctx.RedirectUri);
        return Task.CompletedTask;
    };
    o.Events.OnRedirectToAccessDenied = ctx =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)) { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; }
        ctx.Response.Redirect(ctx.RedirectUri);
        return Task.CompletedTask;
    };
});

// ---------- Authorization (kiểm tra thật ở backend, không chỉ ẩn nút) ----------
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("AdminOnly", p => p.RequireRole(Roles.Admin));
    o.AddPolicy("Staff", p => p.RequireRole(Roles.Admin, Roles.Editor, Roles.Moderator));
    o.AddPolicy("ContentEditors", p => p.RequireRole(Roles.Admin, Roles.Editor));
    o.AddPolicy("Moderation", p => p.RequireRole(Roles.Admin, Roles.Moderator));
});

// ---------- MVC + Services ----------
builder.Services.AddAntiforgery(o => { o.HeaderName = "RequestVerificationToken"; o.Cookie.Name = "DISCI.Csrf"; o.Cookie.SameSite = SameSiteMode.Lax; });
builder.Services.AddControllersWithViews(o => o.Filters.Add(new Microsoft.AspNetCore.Mvc.AutoValidateAntiforgeryTokenAttribute()));
builder.Services.AddMemoryCache();
builder.Services.AddScoped<ICatalogProvider, DbCatalogProvider>();
builder.Services.AddScoped<DbSeeder>();
builder.Services.AddScoped<Disci.Web.Services.State.IUserStateService, Disci.Web.Services.State.UserStateService>();
builder.Services.AddScoped<Disci.Web.Services.IBootService, Disci.Web.Services.BootService>();
builder.Services.AddScoped<Disci.Web.Services.IAccountDeletionService, Disci.Web.Services.AccountDeletionService>();
builder.Services.AddScoped<Disci.Web.Services.ISiteSettings, Disci.Web.Services.SiteSettings>();
builder.Services.AddScoped<Disci.Web.Services.Audit.IAuditService, Disci.Web.Services.Audit.AuditService>();
builder.Services.AddScoped<Disci.Web.Services.Admin.IAdminService, Disci.Web.Services.Admin.AdminService>();
builder.Services.AddScoped<Disci.Web.Services.Admin.ICatalogAdminService, Disci.Web.Services.Admin.CatalogAdminService>();
builder.Services.AddScoped<Disci.Web.Services.Admin.IBackupService, Disci.Web.Services.Admin.BackupService>();
builder.Services.AddScoped<Disci.Web.Services.Community.ICommunityService, Disci.Web.Services.Community.CommunityService>();
builder.Services.AddScoped<Disci.Web.Services.Media.IMediaService, Disci.Web.Services.Media.MediaService>();
// Có cấu hình SMTP (Email:Smtp:Host + Email:From) thì gửi email thật; ngược lại chỉ ghi nội dung email (kèm liên kết) vào log để phát triển.
if (Disci.Web.Services.Email.SmtpEmailSender.IsConfigured(builder.Configuration)) builder.Services.AddSingleton<Disci.Web.Services.Email.IAppEmailSender, Disci.Web.Services.Email.SmtpEmailSender>();
else builder.Services.AddSingleton<Disci.Web.Services.Email.IAppEmailSender, Disci.Web.Services.Email.LogEmailSender>();
builder.Services.AddDataProtection()
    .SetApplicationName("DISCI")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "keys")));

builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 60_000_000);

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
// Chế độ bảo trì (system.maintenance): chỉ Admin được vào; đăng nhập/tài nguyên tĩnh/health vẫn mở để quản trị viên đăng nhập được.
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    bool exempt = path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/Account/", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/Admin/Login", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase) || path.Equals("/health", StringComparison.OrdinalIgnoreCase) || path.Equals("/api/site", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/manifest.json", StringComparison.OrdinalIgnoreCase) || path.Equals("/sw.js", StringComparison.OrdinalIgnoreCase);
    if (exempt) { await next(); return; }
    var (on, msg) = await ctx.RequestServices.GetRequiredService<Disci.Web.Services.ISiteSettings>().GetMaintenanceAsync(ctx.RequestAborted);
    if (!on || (ctx.User.Identity?.IsAuthenticated == true && ctx.User.IsInRole(Roles.Admin))) { await next(); return; }
    ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable; ctx.Response.Headers["Retry-After"] = "300";
    if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)) { ctx.Response.ContentType = "application/json; charset=utf-8"; await ctx.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(new { ok = false, maintenance = true, message = msg })); return; }
    ctx.Response.ContentType = "text/html; charset=utf-8";
    await ctx.Response.WriteAsync("<!DOCTYPE html><html lang=\"vi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>DISCI – Bảo trì</title><body style=\"font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center\"><div><h1>Đang bảo trì</h1><p>" + System.Net.WebUtility.HtmlEncode(msg) + "</p><p><a href=\"/index.html\">Đăng nhập quản trị</a></p></div></body></html>");
});

app.MapControllerRoute(name: "default", pattern: "{controller=Home}/{action=Index}/{id?}");

// Khởi tạo database + nạp dữ liệu ban đầu (idempotent). Tắt bằng Database:AutoMigrate=false ở môi trường production.
if (app.Configuration.GetValue("Database:AutoMigrate", true))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    var startLog = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DISCI.Startup");
    try
    {
        // Chưa có bảng Identity → tạo bằng migration (tự tạo cả database nếu chưa có).
        // Đã có bảng (tạo bằng script SQL hoặc lần chạy trước) → KHÔNG migrate lại để tránh lỗi "đã có đối tượng tên ...".
        var canConnect = await db.Database.CanConnectAsync();
        var hasTables = canConnect && await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS [Value] FROM sys.tables WHERE name = 'AspNetUsers'").FirstAsync() > 0;
        if (!hasTables)
        {
            if (db.Database.GetMigrations().Any()) await db.Database.MigrateAsync();
            else await db.Database.EnsureCreatedAsync();
            startLog.LogInformation("Đã tạo cấu trúc database DISCI.");
        }
    }
    catch (Exception ex)
    {
        throw new InvalidOperationException("Không khởi tạo được database DISCI. Kiểm tra ConnectionStrings:DefaultConnection (tên máy chủ SQL Server) và SQL Server đang chạy. Chi tiết: " + ex.Message, ex);
    }
    await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();
}

app.Run();