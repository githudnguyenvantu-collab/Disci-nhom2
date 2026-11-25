using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.State;
using Microsoft.AspNetCore.Identity;

namespace Disci.Web.Services;

public interface IBootService
{
    /// <summary>Đối tượng khởi tạo cho trình duyệt: {user, state, version}. Trả "null" nếu chưa đăng nhập hoặc tài khoản bị khóa/xóa.</summary>
    Task<string> BuildJsonAsync(ClaimsPrincipal principal, CancellationToken ct = default);
    Task<JsonObject?> BuildAsync(ApplicationUser user, CancellationToken ct = default);
}

public sealed class BootService : IBootService
{
    private readonly UserManager<ApplicationUser> _users; private readonly IUserStateService _state;
    public BootService(UserManager<ApplicationUser> users, IUserStateService state) { _users = users; _state = state; }

    /// <summary>Vai trò hiển thị ở giao diện (chuỗi thường như store.js cũ): admin &gt; editor &gt; moderator &gt; user.</summary>
    public static string ClientRole(IEnumerable<string> roles)
    {
        var set = new HashSet<string>(roles);
        return set.Contains(Roles.Admin) ? "admin" : set.Contains(Roles.Editor) ? "editor" : set.Contains(Roles.Moderator) ? "moderator" : "user";
    }

    public async Task<string> BuildJsonAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        if (principal.Identity?.IsAuthenticated != true) return "null";
        var user = await _users.GetUserAsync(principal);
        if (user == null || !user.IsActive || user.DeletedAt != null) return "null";
        return (await BuildAsync(user, ct))!.ToJsonString();
    }

    public async Task<JsonObject?> BuildAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var roles = await _users.GetRolesAsync(user);
        var snap = await _state.LoadAsync(user.Id, ct);
        return new JsonObject
        {
            ["user"] = new JsonObject
            {
                ["id"] = user.Id, ["name"] = user.FullName, ["email"] = user.Email, ["role"] = ClientRole(roles),
                ["roles"] = new JsonArray(roles.Select(r => (JsonNode?)JsonValue.Create(r)).ToArray()),
                ["createdAt"] = new DateTimeOffset(DateTime.SpecifyKind(user.CreatedAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
                ["emailConfirmed"] = user.EmailConfirmed, ["mustChangePw"] = user.MustChangePassword
            },
            ["state"] = snap.State, ["version"] = snap.Version
        };
    }
}
