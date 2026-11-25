namespace Disci.Web.Services.Admin;

public sealed record AdminResult(bool Ok, int Status, string? Error = null, object? Data = null)
{
    public static AdminResult Success(object? data = null) => new(true, 200, null, data);
    public static AdminResult Fail(int status, string error) => new(false, status, error);
}

/// <summary>Người thực hiện thao tác quản trị (lấy từ cookie đăng nhập ở controller, không bao giờ từ dữ liệu trình duyệt gửi lên).</summary>
public sealed record Actor(string Id, string? Email, bool IsAdmin, bool IsEditor, bool IsModerator, string? Ip = null)
{
    public bool IsStaff => IsAdmin || IsEditor || IsModerator;
}
