namespace Disci.Web.Services;

public sealed record PageDef(string Key, string Html, string? CleanRoute, string Title, string Script, bool NeedsDemoScript, string? Description, string? Policy);

/// <summary>Danh mục 13 trang của DISCI (suy ra từ các file *.html gốc). Mọi trang dùng chung một khung Razor (Views/Shared/Shell.cshtml).</summary>
public static class PageCatalog
{
    public static readonly IReadOnlyList<PageDef> All = new List<PageDef>
    {
        new("admin", "admin.html", "Admin", "DISCI – Quản trị", "admin.js", true, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "Staff"),
        new("body-status", "body-status.html", "BodyStatus", "DISCI – Cập nhật thể trạng", "body-status.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("cart", "cart.html", "Cart", "DISCI – Giỏ hàng", "cart.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("community", "community.html", "Community", "DISCI – Cộng đồng", "community.js", true, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("dashboard", "dashboard.html", "Dashboard", "DISCI – Trang chủ", "dashboard.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("login", "index.html", null, "Disci – Đăng nhập", "login.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", null),
        new("nutrition", "nutrition.html", "Nutrition", "DISCI – Dinh dưỡng", "nutrition.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("onboarding", "onboarding.html", "Onboarding", "DISCI – Khảo sát", "onboarding.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("profile", "profile.html", "Profile", "DISCI – Cá nhân", "profile.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("progress", "progress.html", "Progress", "DISCI – Tiến độ", "progress.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("schedule", "schedule.html", "Schedule", "DISCI – Lịch tập", "schedule.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("store", "store.html", "Store", "DISCI – Sản phẩm", "store.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
        new("workout", "workout.html", "Workout", "DISCI – Buổi tập", "workout.js", false, "DISCI – ứng dụng luyện tập cá nhân hóa, chi phí thấp, an toàn cho người trẻ Việt Nam.", "member"),
    };

    public static PageDef? ByKey(string key) => All.FirstOrDefault(p => p.Key == key);
    public static PageDef? ByHtml(string name) => All.FirstOrDefault(p => string.Equals(p.Html, name, StringComparison.OrdinalIgnoreCase));
    public static PageDef? ByRoute(string route) => All.FirstOrDefault(p => string.Equals(p.CleanRoute, route.Trim('/'), StringComparison.OrdinalIgnoreCase));

    /// <summary>Đổi ReturnUrl (/Dashboard hoặc /dashboard.html) thành tên file .html mà login.js dùng làm tham số next. Trả null nếu không hợp lệ (chống open redirect).</summary>
    public static string? NextFor(string? returnUrl)
    {
        if (string.IsNullOrEmpty(returnUrl)) return null;
        var path = returnUrl.Split('?', '#')[0].Trim('/');
        return (ByHtml(path) ?? ByRoute(path))?.Html;
    }
}
