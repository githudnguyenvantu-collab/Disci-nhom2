namespace Disci.Web.Services.Email;

public interface IAppEmailSender { Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default); }

/// <summary>
/// Chưa cấu hình SMTP: ghi nội dung email (gồm liên kết xác thực/đặt lại mật khẩu) vào log để phát triển và kiểm thử.
/// Production cần thay bằng bản triển khai gửi email thật (SMTP/SendGrid...) – xem danh sách chưa hoàn thiện.
/// </summary>
public sealed class LogEmailSender : IAppEmailSender
{
    private readonly ILogger<LogEmailSender> _log;
    public LogEmailSender(ILogger<LogEmailSender> log) => _log = log;
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        _log.LogWarning("[EMAIL-CHƯA-GỬI-THẬT] Tới: {To} | Chủ đề: {Subject}\n{Body}", to, subject, htmlBody);
        return Task.CompletedTask;
    }
}
