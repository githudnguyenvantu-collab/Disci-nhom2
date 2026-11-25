using Disci.Web.Data;
using Microsoft.AspNetCore.Mvc;

namespace Disci.Web.Controllers;

/// <summary>Trang gốc chuyển hướng; /health kiểm tra kết nối CSDL.</summary>
public class HomeController : Controller
{
    private readonly ApplicationDbContext _db;
    public HomeController(ApplicationDbContext db) => _db = db;

    [HttpGet("/")]
    public IActionResult Index() => Redirect(User.Identity?.IsAuthenticated == true ? "/dashboard.html" : "/index.html");

    [HttpGet("/Home/Error")]
    public IActionResult Error() => Problem();

    [HttpGet("/health")]
    public async Task<IActionResult> Health(CancellationToken ct)
    {
        var canConnect = await _db.Database.CanConnectAsync(ct);
        if (!canConnect) return StatusCode(503, new { status = "db-unreachable" });
        return Ok(new
        {
            status = "ok",
            exercises = _db.Exercises.Count(),
            products = _db.Products.Count(),
            foodItems = _db.FoodItems.Count(),
            challenges = _db.Challenges.Count()
        });
    }
}
