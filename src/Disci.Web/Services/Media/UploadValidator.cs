using System.Text.RegularExpressions;

namespace Disci.Web.Services.Media;

public sealed record DetectedFile(string Kind, string Extension, string ContentType);
public sealed record ValidationResult(bool Ok, string? Error, DetectedFile? File);

/// <summary>
/// Kiểm tra tệp tải lên: đuôi tệp trong danh sách cho phép, NỘI DUNG THẬT (magic bytes) khớp với đuôi, Content-Type khai báo hợp lệ, dung lượng, tên tệp.
/// Không nhận SVG/HTML/script. Loại tệp được quyết định theo nội dung đã nhận diện, không theo tên hay header do trình duyệt gửi.
/// </summary>
public static class UploadValidator
{
    public static readonly string[] ImagePurposes = { "avatar", "cover", "post", "story", "product", "banner", "image" };
    public static readonly string[] VideoPurposes = { "video", "exercise-video", "post-video" };

    private static readonly Dictionary<string, (string Kind, string Mime)> Ext = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = ("image", "image/jpeg"), [".jpeg"] = ("image", "image/jpeg"), [".png"] = ("image", "image/png"),
        [".webp"] = ("image", "image/webp"), [".gif"] = ("image", "image/gif"),
        [".mp4"] = ("video", "video/mp4"), [".mov"] = ("video", "video/quicktime"), [".webm"] = ("video", "video/webm"),
    };
    private static readonly HashSet<string> AllowedDeclared = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm", "application/octet-stream", ""
    };
    private static readonly Regex StoredNameRx = new(@"^[0-9a-f]{32}\.(jpg|png|webp|gif|mp4|mov|webm)$", RegexOptions.Compiled);

    public static bool IsSafeStoredName(string? name) => name != null && StoredNameRx.IsMatch(name);
    public static bool IsPurposeAllowed(string purpose) => ImagePurposes.Contains(purpose) || VideoPurposes.Contains(purpose);
    public static string KindOfPurpose(string purpose) => VideoPurposes.Contains(purpose) ? "video" : "image";

    /// <summary>Tên hiển thị: bỏ đường dẫn, ký tự điều khiển và ký tự nguy hiểm; tối đa 120 ký tự. KHÔNG dùng để lưu file.</summary>
    public static string SanitizeDisplayName(string? raw)
    {
        var n = Path.GetFileName((raw ?? "").Replace('\\', '/'));
        n = new string(n.Where(c => !char.IsControl(c) && "<>:\"|?*".IndexOf(c) < 0).ToArray()).Trim();
        if (n.Length > 120) n = n[^120..];
        return n.Length == 0 ? "tep" : n;
    }

    /// <summary>Nhận diện loại tệp theo byte đầu. Trả null nếu không phải ảnh/video được hỗ trợ.</summary>
    public static DetectedFile? Sniff(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return new("image", ".jpg", "image/jpeg");
        if (h.Length >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47 && h[4] == 0x0D && h[5] == 0x0A && h[6] == 0x1A && h[7] == 0x0A) return new("image", ".png", "image/png");
        if (h.Length >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8' && (h[4] == '7' || h[4] == '9') && h[5] == 'a') return new("image", ".gif", "image/gif");
        if (h.Length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return new("image", ".webp", "image/webp");
        if (h.Length >= 4 && h[0] == 0x1A && h[1] == 0x45 && h[2] == 0xDF && h[3] == 0xA3) return new("video", ".webm", "video/webm");
        if (h.Length >= 12 && h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p')
        {
            var brand = System.Text.Encoding.ASCII.GetString(h.Slice(8, 4));
            return brand.StartsWith("qt", StringComparison.Ordinal) ? new("video", ".mov", "video/quicktime") : new("video", ".mp4", "video/mp4");
        }
        return null;
    }

    public static ValidationResult Validate(string? fileName, string? declaredContentType, long length, ReadOnlySpan<byte> header, string purpose, long maxImageBytes, long maxVideoBytes)
    {
        if (!IsPurposeAllowed(purpose)) return Fail("Mục đích tải lên không hợp lệ.");
        if (length <= 0) return Fail("Tệp rỗng.");
        var expectKind = KindOfPurpose(purpose);
        var ext = Path.GetExtension(fileName ?? "");
        if (!Ext.TryGetValue(ext, out var byExt)) return Fail("Định dạng tệp không được hỗ trợ (ảnh: JPG/PNG/WEBP/GIF; video: MP4/WEBM/MOV).");
        if (byExt.Kind != expectKind) return Fail(expectKind == "video" ? "Chỉ nhận tệp video cho mục này." : "Chỉ nhận tệp ảnh cho mục này.");
        if (!AllowedDeclared.Contains(declaredContentType ?? "")) return Fail("Loại nội dung (Content-Type) không được hỗ trợ.");
        var limit = expectKind == "video" ? maxVideoBytes : maxImageBytes;
        if (length > limit) return Fail($"Tệp quá lớn (tối đa {limit / (1024 * 1024)} MB).");
        var det = Sniff(header);
        if (det == null || det.Kind != expectKind) return Fail("Nội dung tệp không phải ảnh/video hợp lệ.");
        bool extMatches = det.Extension == (byExt.Mime == "image/jpeg" ? ".jpg" : byExt.Mime == "video/quicktime" ? ".mov" : "." + byExt.Mime.Split('/')[1]);
        // MP4 và MOV dùng chung họ 'ftyp': chấp nhận đổi qua lại, nhưng lưu theo nội dung nhận diện được.
        bool ftypFamily = det.Kind == "video" && det.Extension is ".mp4" or ".mov" && byExt.Mime is "video/mp4" or "video/quicktime";
        if (!extMatches && !ftypFamily) return Fail("Nội dung tệp không khớp với đuôi tệp.");
        return new ValidationResult(true, null, det);
    }

    private static ValidationResult Fail(string m) => new(false, m, null);
}
