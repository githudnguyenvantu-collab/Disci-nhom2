using System.Text.Json.Nodes;
using Disci.Web.Models.Entities;
using Disci.Web.Services.State;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Disci.Web.Controllers;

/// <summary>API trạng thái người dùng. Luôn lấy userId từ cookie đăng nhập – không bao giờ tin userId do trình duyệt gửi.</summary>
[Authorize] [Route("api/state")] [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class StateController : Controller
{
    private readonly UserManager<ApplicationUser> _users; private readonly IUserStateService _state;
    public StateController(UserManager<ApplicationUser> users, IUserStateService state) { _users = users; _state = state; }

    private async Task<ApplicationUser?> CurrentAsync()
    {
        var u = await _users.GetUserAsync(User);
        return u is { IsActive: true, DeletedAt: null } ? u : null;
    }

    [HttpGet("")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var u = await CurrentAsync(); if (u == null) return Unauthorized();
        var s = await _state.LoadAsync(u.Id, ct);
        return Json(new { ok = true, state = s.State, version = s.Version });
    }

    /// <summary>
    /// Nhập dữ liệu từ tệp xuất của DISCI bản web tĩnh cũ (hoặc từ chính bản này): body { "data": { ...trạng thái... } }.
    /// Từng khóa được kiểm tra riêng – khóa hợp lệ được nhập, khóa không hợp lệ được liệt kê trong "failed" (không làm hỏng các khóa còn lại).
    /// Chỉ ghi vào tài khoản của người đang đăng nhập; email trong tệp bị bỏ qua. Video IndexedDB của bản cũ không nằm trong tệp xuất nên không được nhập.
    /// </summary>
    [HttpPost("import")] [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Import([FromBody] JsonObject? body, CancellationToken ct)
    {
        var u = await CurrentAsync(); if (u == null) return Unauthorized();
        if ((body?["data"] ?? body?["state"]) is not JsonObject data) return BadRequest(new { ok = false, message = "Thiếu dữ liệu cần nhập." });
        var imported = new List<string>(); var failed = new List<object>();
        foreach (var kv in data.ToList())
        {
            if (kv.Key == "v") continue;
            if (!StateKeys.All.Contains(kv.Key)) { failed.Add(new { key = kv.Key, error = "Khóa dữ liệu không được hỗ trợ." }); continue; }
            var r = await _state.SaveAsync(u.Id, new JsonObject { [kv.Key] = kv.Value?.DeepClone() }, ct);
            if (r.Ok) imported.Add(kv.Key); else failed.Add(new { key = kv.Key, error = r.Error });
        }
        return Json(new { ok = true, imported, failed });
    }

    /// <summary>Body: { "keys": { "<khóa>": <giá trị>, ... } } – chỉ các khóa đã thay đổi.</summary>
    [HttpPut("")] [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Put([FromBody] JsonObject body, CancellationToken ct)
    {
        var u = await CurrentAsync(); if (u == null) return Unauthorized();
        if (body["keys"] is not JsonObject keys) return BadRequest(new { ok = false, message = "Thiếu 'keys'." });
        var r = await _state.SaveAsync(u.Id, keys, ct);
        return r.Ok ? Json(new { ok = true, version = r.Version }) : UnprocessableEntity(new { ok = false, message = r.Error });
    }
}
