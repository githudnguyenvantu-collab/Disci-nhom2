# Lượt 5 – Hoàn thiện các phần còn thiếu

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (không có .NET SDK trong môi trường tạo gói này). Đã chạy thật và đạt: 6 bộ test Node
> (`chat-stories-adapter`, `catalog-config-adapter`, `admin-adapter`, `community-adapter`, `store-adapter`, `media`) và 56 test engine gốc.

## Đã làm
| Hạng mục | Chi tiết |
|---|---|
| **Tin nhắn nhóm** | `GroupMessages`: chỉ thành viên nhóm đọc/gửi; ≤ 500 ký tự; lọc từ cấm; giới hạn 30 tin/phút; rời/xóa nhóm là hết quyền đọc / xóa luôn tin nhắn |
| **Tin nhắn riêng** | `DirectMessages`: chỉ hai người trong hội thoại thấy; tự đánh dấu đã đọc khi mở; thông báo "tin nhắn mới" tối đa 1 lần/10 phút cho mỗi người gửi; không nhắn cho tài khoản bị khóa |
| **Giao diện chat** | Hộp chat cũ giờ tải tin thật, làm mới mỗi 4 giây khi đang mở, gửi bằng Enter. Nhóm/tài khoản DEMO vẫn dùng chế độ cục bộ cũ (có ghi chú rõ) |
| **Stories 24 giờ** | `Stories`: ảnh phải là tệp đã tải lên hệ thống (từ chối data-URL/URL ngoài); ≤ 200 ký tự; tối đa 20 story/24 giờ; hết hạn tự biến mất; chủ story hoặc nhân sự xóa được (`DELETE /api/admin/stories/{id}`) |
| **Email thật (SMTP)** | `SmtpEmailSender`: đặt `Email:From`, `Email:Smtp:Host` (+ `Port`, `User`, `Password`, `EnableSsl`) bằng User Secrets/biến môi trường. Không cấu hình thì vẫn ghi email (kèm liên kết) vào log. Lỗi gửi chỉ ghi log, không làm hỏng đăng ký/quên mật khẩu |
| **Sao lưu toàn bộ CSDL** | Nút "Sao lưu toàn bộ cơ sở dữ liệu (.bak)" ở tab Hệ thống → `BACKUP DATABASE` (SQL Server). Cần `Backups:SqlRoot` (thư mục trên máy SQL Server mà dịch vụ SQL Server có quyền ghi). Khôi phục `.bak` làm bằng SSMS (ứng dụng từ chối để tránh phá database đang chạy) |
| **DEMO toàn hệ thống** | Dữ liệu DEMO vẫn sinh ở trình duyệt (cố ý – không lẫn vào DB thật). "Xóa toàn bộ DEMO" giờ cũng tắt `showDemo` trong `site.config` nên áp dụng cho mọi người dùng; tab Demo ghi rõ điều này |
| Kiểm thử | Test C# mới: chat nhóm/riêng (quyền, thứ tự, lọc `after`, giới hạn, thông báo một lần), Stories (hạn, quyền xóa, giới hạn), sao lưu `.bak` (chỉ Admin, từ chối khi không phải SQL Server, không khôi phục từ app), `SmtpEmailSender.IsConfigured`, xóa story của nhân sự; test Node cho Stories/chat |

## Lưu ý
1. **Tạo lại migration** (thêm `GroupMessages`, `Stories.ClientId/Hue`, chỉ mục tin nhắn): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. Tin nhắn lấy mới bằng **polling** (không phải thời gian thực): độ trễ tối đa ~4 giây khi hộp chat đang mở.
3. Tin nhắn riêng cho phép giữa mọi người dùng đang hoạt động (chưa có chặn/khóa người gửi, chưa có "chỉ người theo dõi mới được nhắn").

## Kiểm tra thủ công đề nghị
1. Hai tài khoản A, B: A tạo nhóm, B vào nhóm → mở chat nhóm ở cả hai trình duyệt → tin của A hiện ở B trong ≤ 4 giây; tài khoản C (chưa vào nhóm) không mở được chat (404).
2. A nhắn riêng B → B có thông báo (chuông) 1 lần dù A gửi nhiều tin liên tiếp; B mở hội thoại thấy đủ tin.
3. A đăng story có ảnh → B thấy ở thanh story; sau 24 giờ biến mất; Admin xóa được story của A ở tab Nội dung.
4. Cấu hình SMTP (ví dụ tài khoản Mailtrap) → đăng ký tài khoản mới → nhận email xác thực; "Quên mật khẩu" nhận email đặt lại.
5. Đặt `Backups:SqlRoot` = thư mục SQL Server ghi được (LocalDB: thư mục của người dùng Windows) → bấm sao lưu `.bak` → có tệp mới + dòng trong danh sách; mở SSMS → Restore Database để thử khôi phục sang database khác.
6. Admin bấm "Xóa toàn bộ DEMO" → tài khoản khác không còn thấy nội dung DEMO sau khi tải lại.

## Chưa hoàn thiện / giới hạn
- **Dữ liệu DEMO không lưu vào DB** và không có "xem dưới vai trò" tài khoản DEMO trên máy chủ (cố ý, xem trên).
- Sao lưu `.bak` chưa theo lịch tự động; khôi phục bằng SSMS.
- Chat dùng polling; chưa có chỉ báo "đang gõ", đính kèm ảnh, hay xóa/sửa tin nhắn.
- Nội dung bài viết chưa lọc từ cấm ở máy chủ (bình luận, tin nhắn có lọc).
