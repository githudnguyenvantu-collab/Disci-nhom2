using System.ComponentModel.DataAnnotations;
using System.Net.Mail;
using System.Text;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services;
using Disci.Web.Services.Email;
using Disci.Web.Services.State;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Controllers;

public sealed class LoginRequest { public string? Email { get; set; } public string? Password { get; set; } public bool Remember { get; set; } }
public sealed class DemoLoginRequest { public string? Role { get; set; } }
public sealed class RegisterRequest { public string? Name { get; set; } public string? Email { get; set; } public string? Password { get; set; } }
public sealed class ChangePasswordRequest { public string? Current { get; set; } public string? Next { get; set; } }
public sealed class ForgotRequest { public string? Email { get; set; } }
public sealed class ResetRequest { public string? Email { get; set; } public string? Token { get; set; } public string? Password { get; set; } }

/// <summary>
/// Đăng nhập/đăng ký/đăng xuất/đổi & đặt lại mật khẩu bằng ASP.NET Core Identity (băm mật khẩu PBKDF2 do Identity quản lý, khóa tạm sau 5 lần sai).
/// Các endpoint *Api trả JSON cùng hình dạng mà store.js cũ đã dùng ({ok, message, errors}) để giữ nguyên giao diện.
/// </summary>
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class AccountController : Controller
{
    private readonly UserManager<ApplicationUser> _users; private readonly SignInManager<ApplicationUser> _signIn;
    private readonly IUserStateService _state; private readonly IBootService _boot; private readonly IAntiforgery _af;
    private readonly IAppEmailSender _email; private readonly IAccountDeletionService _deletion; private readonly ApplicationDbContext _db;
    private readonly ILogger<AccountController> _log; private readonly Services.Audit.IAuditService _audit;
    private readonly DbSeeder _seeder; private readonly IWebHostEnvironment _env;
    private string? Ip() => HttpContext.Connection.RemoteIpAddress?.ToString();

    public AccountController(UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, IUserStateService state, IBootService boot, IAntiforgery af,
        IAppEmailSender email, IAccountDeletionService deletion, ApplicationDbContext db, ILogger<AccountController> log, Services.Audit.IAuditService audit,
        DbSeeder seeder, IWebHostEnvironment env)
    { _seeder = seeder; _env = env; _audit = audit; _users = users; _signIn = signIn; _state = state; _boot = boot; _af = af; _email = email; _deletion = deletion; _db = db; _log = log; }

    // ---------- Trang ----------
    /// <summary>Khung đăng nhập nằm ở /index.html (để liên kết tương đối của JS hoạt động); /Account/Login chỉ chuyển hướng tới đó và giữ trang đích (next).</summary>
    [HttpGet("/Account/Login")]
    public IActionResult Login(string? returnUrl, string? mode) => RedirectToLoginShell(returnUrl, mode);

    [HttpGet("/Admin/Login")]
    public IActionResult AdminLogin(string? returnUrl) => RedirectToLoginShell(returnUrl ?? "/admin.html", "admin");

    [HttpGet("/Account/Register")]
    public IActionResult Register() => Redirect("/index.html?tab=register");

    [HttpGet("/Account/Denied")]
    public IActionResult Denied() { Response.StatusCode = 403; return View(); }

    [HttpGet("/Account/ResetPassword")]
    public IActionResult ResetPassword(string? email, string? token) { ViewData["Email"] = email; ViewData["Token"] = token; return View(); }

    [HttpGet("/Account/ConfirmEmail")]
    public async Task<IActionResult> ConfirmEmail(string? userId, string? token)
    {
        var ok = false;
        var user = string.IsNullOrEmpty(userId) ? null : await _users.FindByIdAsync(userId);
        if (user != null && !string.IsNullOrEmpty(token))
        {
            try { ok = (await _users.ConfirmEmailAsync(user, Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token)))).Succeeded; } catch (FormatException) { }
        }
        ViewData["Ok"] = ok;
        return View();
    }

    private IActionResult RedirectToLoginShell(string? returnUrl, string? mode)
    {
        var next = PageCatalog.NextFor(returnUrl);
        var q = new List<string>();
        if (mode == "admin") q.Add("mode=admin");
        if (next != null) q.Add("next=" + Uri.EscapeDataString(next));
        return Redirect("/index.html" + (q.Count > 0 ? "?" + string.Join("&", q) : ""));
    }

    // ---------- API ----------
    // Các endpoint đăng nhập chạy TRƯỚC khi có phiên nên miễn kiểm tra CSRF (chưa có phiên nào để bị lợi dụng); mọi POST/PUT/DELETE khác vẫn bắt buộc token.
    [HttpPost("/Account/LoginApi")]
    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    public Task<IActionResult> LoginApi([FromBody] LoginRequest? req) => DoLoginAsync(req, staffOnly: false);

    /// <summary>Đăng nhập quản trị riêng (mở từ nút Shield/Lock). Chỉ tài khoản có vai trò Admin/Editor/Moderator được vào.</summary>
    [HttpPost("/Admin/LoginApi")]
    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    public Task<IActionResult> AdminLoginApi([FromBody] LoginRequest? req) => DoLoginAsync(req, staffOnly: true);

    /// <summary>
    /// Nút "Đăng nhập demo": vào thẳng bằng tài khoản người dùng demo (role = "user") hoặc quản trị demo (role = "admin") mà không cần gõ mật khẩu.
    /// CHỈ hoạt động ở môi trường Development – Production trả 404 nên không thể dùng làm cửa hậu.
    /// </summary>
    [HttpPost("/Account/DemoLoginApi")]
    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> DemoLoginApi([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] DemoLoginRequest? req)
    {
        if (!_env.IsDevelopment()) return NotFound();
        var admin = string.Equals(req?.Role, "admin", StringComparison.OrdinalIgnoreCase);
        await _seeder.EnsureDemoAccountsAsync();
        var email = admin ? _seeder.AdminCredentials().Email : DbSeeder.DemoUserEmail;
        var user = string.IsNullOrWhiteSpace(email) ? null : await _users.FindByEmailAsync(email);
        if (user == null || user.DeletedAt != null || !user.IsActive)
            return Json(new { ok = false, code = "auth", message = "Không tìm thấy hoặc không dùng được tài khoản demo. Xem cửa sổ log của ứng dụng để biết lý do." });
        await _signIn.SignInAsync(user, isPersistent: false);
        user.LastLoginAt = DateTime.UtcNow; await _users.UpdateAsync(user);
        await _audit.LogAsync(user.Id, user.Email, admin ? "auth.login.admin" : "auth.login", "User", user.Id, "demo", Ip());
        return await SessionJsonAsync(user);
    }

    private async Task<IActionResult> DoLoginAsync(LoginRequest? req, bool staffOnly)
    {
        var email = (req?.Email ?? "").Trim(); var pw = req?.Password ?? "";
        if (!IsEmail(email) || pw.Length == 0) return Json(new { ok = false, code = "validation", message = "Vui lòng nhập email hợp lệ và mật khẩu." });
        const string bad = "Email hoặc mật khẩu không chính xác.";
        var user = await _users.FindByEmailAsync(email);
        if (user == null || user.DeletedAt != null) return Json(new { ok = false, code = "auth", message = bad });

        var check = await _signIn.CheckPasswordSignInAsync(user, pw, lockoutOnFailure: true);
        if (check.IsLockedOut) { await _audit.LogAsync(user.Id, user.Email, "auth.lockout", "User", user.Id, null, Ip()); return Json(new { ok = false, code = "locked", message = "Tài khoản tạm thời bị khóa do nhập sai nhiều lần. Hãy thử lại sau ít phút." }); }
        if (!check.Succeeded) { await _audit.LogAsync(user.Id, user.Email, "auth.login.fail", "User", user.Id, staffOnly ? "admin" : null, Ip()); return Json(new { ok = false, code = "auth", message = bad }); }
        if (!user.IsActive) return Json(new { ok = false, code = "locked", message = "Tài khoản này đã bị khóa. Hãy liên hệ quản trị viên DISCI." });

        if (staffOnly)
        {
            var roles = await _users.GetRolesAsync(user);
            if (!roles.Any(r => r is Roles.Admin or Roles.Editor or Roles.Moderator))
                return Json(new { ok = false, code = "forbidden", message = "Tài khoản này chưa có quyền quản trị. Hãy nhờ quản trị viên cấp quyền, hoặc đăng nhập ở trang thành viên." });
        }
        await _signIn.SignInAsync(user, isPersistent: req!.Remember);
        user.LastLoginAt = DateTime.UtcNow; await _users.UpdateAsync(user);
        await _audit.LogAsync(user.Id, user.Email, staffOnly ? "auth.login.admin" : "auth.login", "User", user.Id, null, Ip());
        return await SessionJsonAsync(user);
    }

    [HttpPost("/Account/RegisterApi")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterApi([FromBody] RegisterRequest? req)
    {
        req ??= new RegisterRequest();
        var name = (req.Name ?? "").Trim(); var email = (req.Email ?? "").Trim(); var pw = req.Password ?? "";
        var errs = new Dictionary<string, string>();
        var open = await _db.SystemSettings.AsNoTracking().Where(s => s.Key == "site.registration.open").Select(s => s.ValueJson).FirstOrDefaultAsync();
        if (open == "false") return Json(new { ok = false, errors = new { email = "Quản trị viên đang tạm đóng đăng ký tài khoản mới." } });
        if (name.Length < 2 || name.Length > 120) errs["name"] = "Họ tên cần từ 2 đến 120 ký tự.";
        if (!IsEmail(email)) errs["email"] = "Email chưa đúng định dạng.";
        if (errs.Count == 0 && await _users.FindByEmailAsync(email) != null) errs["email"] = "Email này đã được đăng ký.";
        if (errs.Count > 0) return Json(new { ok = false, errors = errs });

        var user = new ApplicationUser { UserName = email, Email = email, FullName = name };
        var res = await _users.CreateAsync(user, pw);     // Identity kiểm tra độ dài + LetterAndDigitPasswordValidator
        if (!res.Succeeded)
        {
            var pwErr = res.Errors.Any(e => e.Code.StartsWith("Password") || e.Code == "LetterAndDigit");
            var dup = res.Errors.Any(e => e.Code.StartsWith("Duplicate"));
            return Json(new { ok = false, errors = new Dictionary<string, string> { [dup ? "email" : pwErr ? "pw" : "email"] = dup ? "Email này đã được đăng ký." : pwErr ? "Mật khẩu cần ≥ 8 ký tự, gồm chữ và số." : "Không thể tạo tài khoản. Vui lòng thử lại." } });
        }
        await _users.AddToRoleAsync(user, Roles.User);    // đăng ký công khai LUÔN chỉ tạo vai trò User
        await _state.InitializeNewUserAsync(user.Id);
        await _audit.LogAsync(user.Id, user.Email, "auth.register", "User", user.Id, null, Ip());
        await SendConfirmationAsync(user);
        await _signIn.SignInAsync(user, isPersistent: false);
        return await SessionJsonAsync(user);
    }

    /// <summary>Đăng xuất. Có thể kèm {keys} là các khóa trạng thái chưa kịp lưu để ghi lần cuối trước khi hủy phiên.</summary>
    [HttpPost("/Account/LogoutApi")]
    [AllowAnonymous]
    public async Task<IActionResult> LogoutApi([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] JsonObject? body)
    {
        var user = await _users.GetUserAsync(User);
        if (user != null && body?["keys"] is JsonObject keys && keys.Count > 0) await _state.SaveAsync(user.Id, keys);
        await _signIn.SignOutAsync();
        return Json(new { ok = true });
    }

    [HttpPost("/Account/ChangePasswordApi")]
    [Authorize]
    public async Task<IActionResult> ChangePasswordApi([FromBody] ChangePasswordRequest? req)
    {
        req ??= new ChangePasswordRequest();
        var user = await _users.GetUserAsync(User); if (user == null) return Unauthorized();
        var res = await _users.ChangePasswordAsync(user, req.Current ?? "", req.Next ?? "");
        if (!res.Succeeded)
        {
            var wrong = res.Errors.Any(e => e.Code == "PasswordMismatch");
            return Json(new { ok = false, message = wrong ? "Mật khẩu hiện tại không đúng." : "Mật khẩu mới cần ≥ 8 ký tự, gồm chữ và số." });
        }
        if (user.MustChangePassword) { user.MustChangePassword = false; await _users.UpdateAsync(user); }
        await _audit.LogAsync(user.Id, user.Email, "auth.password.change", "User", user.Id, null, Ip());
        await _signIn.RefreshSignInAsync(user);
        return Json(new { ok = true });
    }

    /// <summary>Luôn trả cùng một thông điệp (không tiết lộ email có tồn tại không). Tài khoản quản trị không tự đặt lại qua đường này.</summary>
    [HttpPost("/Account/ForgotPasswordApi")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPasswordApi([FromBody] ForgotRequest? req)
    {
        req ??= new ForgotRequest();
        var email = (req.Email ?? "").Trim();
        if (IsEmail(email))
        {
            var user = await _users.FindByEmailAsync(email);
            if (user != null && user.IsActive && user.DeletedAt == null && !(await _users.GetRolesAsync(user)).Any(r => r is Roles.Admin or Roles.Editor or Roles.Moderator))
            {
                var token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(await _users.GeneratePasswordResetTokenAsync(user)));
                var link = $"{Request.Scheme}://{Request.Host}/Account/ResetPassword?email={Uri.EscapeDataString(email)}&token={token}";
                await _email.SendAsync(email, "Đặt lại mật khẩu DISCI", $"<p>Nhấn vào liên kết để đặt lại mật khẩu (có hiệu lực giới hạn thời gian):</p><p><a href=\"{link}\">{link}</a></p>");
            }
        }
        return Json(new { ok = true, message = "Nếu email này đã đăng ký, DISCI đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư." });
    }

    [HttpPost("/Account/ResetPasswordApi")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPasswordApi([FromBody] ResetRequest? req)
    {
        req ??= new ResetRequest();
        const string fail = "Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.";
        var user = await _users.FindByEmailAsync((req.Email ?? "").Trim());
        if (user == null || string.IsNullOrEmpty(req.Token)) return Json(new { ok = false, message = fail });
        string token; try { token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(req.Token)); } catch (FormatException) { return Json(new { ok = false, message = fail }); }
        var res = await _users.ResetPasswordAsync(user, token, req.Password ?? "");
        if (res.Succeeded) return Json(new { ok = true, message = "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới." });
        var weak = res.Errors.Any(e => e.Code.StartsWith("Password") || e.Code == "LetterAndDigit");
        return Json(new { ok = false, message = weak ? "Mật khẩu mới cần ≥ 8 ký tự, gồm chữ và số." : fail });
    }

    [HttpPost("/Account/DeleteApi")]
    [Authorize]
    public async Task<IActionResult> DeleteApi()
    {
        var user = await _users.GetUserAsync(User); if (user == null) return Unauthorized();
        if (await _users.IsInRoleAsync(user, Roles.Admin) && (await _users.GetUsersInRoleAsync(Roles.Admin)).Count(u => u.IsActive) <= 1)
            return Json(new { ok = false, message = "Không thể xóa quản trị viên cuối cùng của hệ thống." });
        var email = user.Email; var uid = user.Id;
        var res = await _deletion.DeleteAsync(user);
        if (!res.Succeeded) return Json(new { ok = false, message = "Không thể xóa tài khoản lúc này." });
        await _audit.LogAsync(null, email, "auth.account.delete", "User", uid, "tự xóa", Ip());
        await _signIn.SignOutAsync();
        return Json(new { ok = true });
    }

    // ---------- Hỗ trợ ----------
    private async Task<IActionResult> SessionJsonAsync(ApplicationUser user)
    {
        // Token chống giả mạo gắn với danh tính: phải cấp lại sau khi đăng nhập (HttpContext.User chưa cập nhật trong cùng request).
        HttpContext.User = await _signIn.CreateUserPrincipalAsync(user);
        var csrf = _af.GetAndStoreTokens(HttpContext).RequestToken;
        var boot = await _boot.BuildAsync(user);
        return Json(new { ok = true, user = boot!["user"], state = boot["state"], version = boot["version"], csrf });
    }

    private async Task SendConfirmationAsync(ApplicationUser user)
    {
        var token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(await _users.GenerateEmailConfirmationTokenAsync(user)));
        var link = $"{Request.Scheme}://{Request.Host}/Account/ConfirmEmail?userId={Uri.EscapeDataString(user.Id)}&token={token}";
        await _email.SendAsync(user.Email!, "Xác thực tài khoản DISCI", $"<p>Chào {System.Net.WebUtility.HtmlEncode(user.FullName)}, hãy xác thực email:</p><p><a href=\"{link}\">{link}</a></p>");
    }

    private static bool IsEmail(string s)
    {
        if (s.Length is < 5 or > 254) return false;
        try { return new MailAddress(s).Address == s && s.Contains('.', StringComparison.Ordinal) && s.IndexOf('@') > 0; } catch (FormatException) { return false; }
    }
}