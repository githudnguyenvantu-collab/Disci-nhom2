using System.Net;
using System.Net.Mail;

namespace Disci.Web.Services.Email;

/// <summary>
/// Gửi email thật qua SMTP. Cấu hình (User Secrets/biến môi trường – KHÔNG đặt mật khẩu trong appsettings.json):
///   Email:Smtp:Host, Email:Smtp:Port (mặc định 587), Email:Smtp:User, Email:Smtp:Password, Email:Smtp:EnableSsl (mặc định true), Email:From, Email:FromName.
/// Gửi lỗi chỉ ghi log và KHÔNG làm hỏng thao tác chính (đăng ký, quên mật khẩu vẫn trả kết quả chung, không lộ email có tồn tại hay không).
/// </summary>
public sealed class SmtpEmailSender : IAppEmailSender
{
    private readonly IConfiguration _cfg; private readonly ILogger<SmtpEmailSender> _log;
    public SmtpEmailSender(IConfiguration cfg, ILogger<SmtpEmailSender> log) { _cfg = cfg; _log = log; }

    /// <summary>Có cấu hình đủ để gửi thật không (dùng để chọn bộ gửi khi khởi động).</summary>
    public static bool IsConfigured(IConfiguration cfg) => !string.IsNullOrWhiteSpace(cfg["Email:Smtp:Host"]) && !string.IsNullOrWhiteSpace(cfg["Email:From"]);

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        try
        {
            using var msg = new MailMessage { From = new MailAddress(_cfg["Email:From"]!, _cfg["Email:FromName"] ?? "DISCI"), Subject = subject, Body = htmlBody, IsBodyHtml = true, SubjectEncoding = System.Text.Encoding.UTF8, BodyEncoding = System.Text.Encoding.UTF8 };
            msg.To.Add(new MailAddress(to));
#pragma warning disable SYSLIB0014   // SmtpClient là API có sẵn của .NET; đủ cho nhu cầu gửi thư giao dịch với lưu lượng nhỏ
            using var client = new SmtpClient(_cfg["Email:Smtp:Host"]!, _cfg.GetValue("Email:Smtp:Port", 587)) { EnableSsl = _cfg.GetValue("Email:Smtp:EnableSsl", true), Timeout = 15000 };
#pragma warning restore SYSLIB0014
            if (!string.IsNullOrWhiteSpace(_cfg["Email:Smtp:User"])) client.Credentials = new NetworkCredential(_cfg["Email:Smtp:User"], _cfg["Email:Smtp:Password"]);
            await client.SendMailAsync(msg, ct);
        }
        catch (Exception ex) when (ex is SmtpException or FormatException or InvalidOperationException or OperationCanceledException or IOException)
        {
            _log.LogError(ex, "Không gửi được email tới {To} (chủ đề: {Subject})", to, subject);
        }
    }
}
