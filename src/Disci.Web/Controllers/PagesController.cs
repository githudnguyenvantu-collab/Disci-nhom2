using Disci.Web.Models;
using Disci.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Disci.Web.Controllers;

/// <summary>
/// Các trang giao diện DISCI. Giữ nguyên địa chỉ *.html cũ (để mọi liên kết trong JavaScript hiện có tiếp tục hoạt động) và bổ sung đường dẫn MVC gọn (/Dashboard, /Workout ...).
/// Quyền truy cập được kiểm tra ở backend: trang thành viên cần đăng nhập; trang quản trị cần vai trò Admin/Editor/Moderator.
/// </summary>
public class PagesController : Controller
{
    private IActionResult Shell(string key) => View("~/Views/Shared/Shell.cshtml", new ShellModel(PageCatalog.ByKey(key)!));

    [HttpGet("/index.html")]
    public IActionResult Login() => Shell("login");

    [Authorize(Policy = "Staff")] [HttpGet("/admin.html")] [HttpGet("/Admin")]
    public IActionResult Admin() => Shell("admin");

    [Authorize] [HttpGet("/body-status.html")] [HttpGet("/BodyStatus")]
    public IActionResult BodyStatus() => Shell("body-status");

    [Authorize] [HttpGet("/cart.html")] [HttpGet("/Cart")]
    public IActionResult Cart() => Shell("cart");

    [Authorize] [HttpGet("/community.html")] [HttpGet("/Community")]
    public IActionResult Community() => Shell("community");

    [Authorize] [HttpGet("/dashboard.html")] [HttpGet("/Dashboard")]
    public IActionResult Dashboard() => Shell("dashboard");

    [Authorize] [HttpGet("/nutrition.html")] [HttpGet("/Nutrition")]
    public IActionResult Nutrition() => Shell("nutrition");

    [Authorize] [HttpGet("/onboarding.html")] [HttpGet("/Onboarding")]
    public IActionResult Onboarding() => Shell("onboarding");

    [Authorize] [HttpGet("/profile.html")] [HttpGet("/Profile")]
    public IActionResult Profile() => Shell("profile");

    [Authorize] [HttpGet("/progress.html")] [HttpGet("/Progress")]
    public IActionResult Progress() => Shell("progress");

    [Authorize] [HttpGet("/schedule.html")] [HttpGet("/Schedule")]
    public IActionResult Schedule() => Shell("schedule");

    [Authorize] [HttpGet("/store.html")] [HttpGet("/Store")]
    public IActionResult Store() => Shell("store");

    [Authorize] [HttpGet("/workout.html")] [HttpGet("/Workout")]
    public IActionResult Workout() => Shell("workout");
}
