# Lượt 4a – Backend quản trị thật (DISCI ADMIN) + nhập dữ liệu từ bản cũ

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (môi trường tạo gói này không có .NET SDK). Đã chạy thật và đạt: 4 bộ test Node (`store-adapter`, `media`,
> `community-adapter`) và 56 test engine gốc. Chưa kiểm thử trong trình duyệt. Hãy `dotnet build` + `dotnet test` rồi gửi lại lỗi nếu có.

## Phạm vi: 4a (lượt này) và 4b (kế tiếp)
`admin.js` (122 KB, 66 hàm `PL.*`) vẫn đọc/ghi dữ liệu cục bộ của `platform.js`. Lượt này xây **toàn bộ backend quản trị trên SQL Server, có phân quyền thật và kiểm thử**.
**Lượt 4b** sẽ nối giao diện `admin.js` vào các API dưới đây (cùng cách đã làm cho Cộng đồng). **Cho tới khi có 4b, giao diện Admin cũ chưa thao tác lên DB thật**
– nhưng trang `/admin.html` đã được bảo vệ bằng quyền thật và các API đã dùng được (Postman/DevTools).

## API quản trị (`/api/admin/*`, policy `Staff`; từng thao tác còn được kiểm tra vai trò chi tiết ở service)
| Nhóm | Endpoint | Quyền |
|---|---|---|
| Thống kê | `GET dashboard` | Staff |
| Tài khoản | `GET users` (lọc/tìm/phân trang) · `POST users` · `PUT users/{id}/role` · `PUT users/{id}/active` · `POST users/{id}/reset-password` · `DELETE users/{id}` | Tạo/đổi vai trò/đặt lại mật khẩu/xóa: **Admin**. Khóa/mở khóa: Admin (mọi tài khoản) hoặc Moderator (chỉ người dùng thường) |
| Kiểm duyệt | `GET posts`, `POST posts/{id}/hide|unhide`, `DELETE posts/{id}`, `POST comments/{id}/hide|unhide`, `DELETE comments/{id}`, `GET reports`, `POST reports/{id}/resolve` | Admin, Moderator |
| Danh mục | `GET/PUT catalog/{exercise|product|food|challenge}`, `POST …/{id}/active`, `DELETE …/{id}` | Admin, Editor |
| Thông báo hệ thống | `GET/POST/DELETE announcements` | Admin, Editor |
| Cấu hình & giao diện | `GET/PUT settings` · công khai: `GET /api/site` (chỉ khóa `site.*`, `ui.*`) | Admin |
| Nhật ký hoạt động | `GET audit` (lọc theo hành động/người/thời gian) | Admin |
| Sao lưu/khôi phục | `GET/POST backups`, `POST backups/upload`, `POST backups/{id}/restore`, `GET backups/{id}/download`, `DELETE backups/{id}` | Admin |

## Bảo vệ đã cài đặt
- **Không thể khóa/xóa/hạ quyền quản trị viên cuối cùng**; không tự khóa mình; Moderator không động vào tài khoản nhân sự.
- Khóa tài khoản và đổi vai trò **làm mới Security Stamp** (cookie kiểm tra lại mỗi phút) + mọi API/boot kiểm tra `IsActive` ngay trong từng request.
- Mật khẩu tạm 12 ký tự ngẫu nhiên (chữ hoa/thường/số), **chỉ hiển thị một lần**, bắt buộc đổi ở lần đăng nhập đầu (`MustChangePassword`), **không ghi vào nhật ký**.
- Danh mục: kiểm tra khoảng giá trị/tập cho phép/định dạng; URL ảnh/video chỉ nhận `/media/…` (chặn `javascript:` và URL ngoài); dữ liệu gốc chỉ được ẩn, dữ liệu tự thêm xóa được nếu không còn tham chiếu.
- Nhật ký (`AuditLogs`): đăng nhập thành công/thất bại/khóa tạm, đăng ký, đổi mật khẩu, xóa tài khoản và **mọi thao tác quản trị** (người thực hiện, IP, đối tượng).
- Khôi phục chạy trong **một giao dịch** (lỗi thì không đổi gì); tệp sao lưu ghi lại từ dữ liệu đã phân tích, tên do máy chủ sinh, chống path traversal.

## Nhập dữ liệu từ DISCI bản cũ
Hồ sơ → **Nhập dữ liệu từ tệp**: chọn tệp `disci-du-lieu-….json` đã xuất từ bản web tĩnh. `POST /api/state/import` kiểm tra **từng khóa riêng**
(khóa hợp lệ được nhập, khóa lỗi được báo lại), chỉ ghi vào tài khoản đang đăng nhập, bỏ qua email trong tệp. Video IndexedDB của bản cũ không nằm trong tệp xuất nên không được nhập.

## Kiểm thử
`AdminServiceTests` (~20 ca): tạo tài khoản & mật khẩu tạm, bảo vệ admin cuối cùng, phân quyền Moderator/Editor/Admin, đặt lại mật khẩu không lộ trong nhật ký, lọc/phân trang, kiểm duyệt + cascade, xử lý báo cáo, cấu hình (khóa hợp lệ, giới hạn kích thước, tập công khai), danh mục (kiểm tra chặt, ẩn/xóa, tham chiếu), sao lưu/khôi phục (đi-về, nguyên tử, tải lên sai định dạng, tham chiếu hỏng), nhật ký, thống kê.

## Lưu ý
1. **Tạo lại migration** (thêm `ApplicationUser.MustChangePassword`): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. **Sao lưu logic ≠ sao lưu toàn bộ.** Sao lưu trong ứng dụng gồm cấu hình & nội dung quản trị (cài đặt, bài tập, sản phẩm, món ăn, huy hiệu, thử thách, thông báo hệ thống), **không** gồm tài khoản/mật khẩu/dữ liệu cá nhân/bài viết/đơn hàng.
   Sao lưu **toàn bộ** cơ sở dữ liệu hãy dùng SQL Server: SSMS → chuột phải database `DISCI` → *Tasks → Back Up…* (hoặc `BACKUP DATABASE [DISCI] TO DISK = N'C:\Backup\DISCI.bak'`), khôi phục bằng *Tasks → Restore*. Nhớ sao lưu cả thư mục `App_Data/uploads` (ảnh/video) và khóa Data Protection khi triển khai thật.
3. Thử nhanh bằng DevTools (đăng nhập Admin): `fetch('/api/admin/dashboard').then(r=>r.json())`. Với tài khoản User thường kết quả phải là 403.

## Chưa hoàn thiện / giới hạn đã biết (chuyển sang 4b hoặc sau)
- **Giao diện Admin chưa nối API** (4b): quản lý tài khoản/vai trò, kiểm duyệt, danh mục, thông báo, cấu hình, nhật ký, sao lưu trên giao diện hiện còn dùng dữ liệu cục bộ.
- **Quản lý giao diện/banner/thương hiệu (`PL.cfg().site…`) và ma trận quyền chi tiết** của giao diện cũ chưa lưu vào `SystemSettings`; quyền thật được máy chủ áp theo 3 vai trò cố định (Admin/Editor/Moderator) – ma trận hiển thị trong giao diện cũ chỉ mang tính mô tả cho tới khi được thay thế.
- **Demo Data Center & mô phỏng** (tạo người dùng/bài viết demo, xem dưới vai trò người dùng khác "clone") chưa chuyển lên máy chủ. Cờ `IsDemo` đã có trên bảng.
- **Chế độ bảo trì** (`system.maintenance`) mới chỉ lưu cấu hình, chưa có middleware chặn người dùng.
- Thư viện media của Admin: API `GET /api/media?scope=all` đã có, chưa có giao diện thực.
- Email thông báo cho tài khoản do Admin tạo/đặt lại mật khẩu chưa gửi (mật khẩu tạm hiển thị cho Admin để chuyển giao).
