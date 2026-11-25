# Lượt 2 – Tài khoản, lưu dữ liệu lên SQL Server, khung trang Razor

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (môi trường không có .NET SDK). Đã chạy thật: bộ kiểm thử Node cho `store.js` bản mới
> (`node tests/js/store-adapter.test.js` → đạt) và 56 test engine gốc (đạt). Chưa kiểm thử trong trình duyệt thật. Hãy build rồi gửi lại lỗi nếu có.

## Cách hoạt động (để giữ nguyên 100% giao diện và nghiệp vụ JS)
```
Trình duyệt (UI cũ, store.js đồng bộ)  ──PUT /api/state (chỉ khóa thay đổi)──►  StateController → UserStateService → SQL Server
        ▲                                                                                      │
        └──── window.DISCI_BOOT (trạng thái nhúng sẵn vào trang khi tải) ◄── Shell.cshtml ◄────┘
Đăng nhập/đăng ký/đổi & quên mật khẩu ──► AccountController → ASP.NET Core Identity (PBKDF2, khóa tạm sau 5 lần sai)
```
- Mọi thuật toán (BMI, TDEE, cảnh báo, tạo lịch, tiến độ…) vẫn chạy ở `engine.js`/`store.js` như cũ; bản C# (`Services/Engine`) dùng để kiểm chứng/đối chiếu và cho các API sau này.
- Địa chỉ `*.html` cũ được giữ (mọi liên kết trong JS vẫn chạy) **và** có đường dẫn MVC gọn: `/Dashboard /Onboarding /Schedule /Workout /Progress /BodyStatus /Nutrition /Store /Cart /Community /Profile /Admin`.
- `/Account/Login`, `/Account/Register`, `/Admin/Login` chuyển tới khung đăng nhập và giữ trang đích (`next`).

## Đã làm
| Hạng mục | Chi tiết |
|---|---|
| Đăng nhập / đăng ký / đăng xuất | `AccountController` + Identity. Đăng ký công khai **chỉ tạo vai trò User**. Email xác thực: gửi (hiện chỉ ghi log) |
| Đổi mật khẩu, quên/đặt lại mật khẩu | Qua email (liên kết token). Tài khoản Admin/Editor/Moderator **không** tự đặt lại qua trang đăng nhập |
| Đăng nhập quản trị riêng | Bỏ tab Thành viên/Quản trị. Nút tròn **Shield** góc trên bên trái mở đăng nhập quản trị → `POST /Admin/LoginApi` (máy chủ kiểm tra vai trò thật) |
| Phân quyền thật | Trang thành viên `[Authorize]`; `/Admin` + `/admin.html` policy `Staff`; `/api/*` trả 401/403 thay vì chuyển hướng; chống CSRF (token trong header) cho mọi POST/PUT |
| Lưu dữ liệu lên SQL Server | `UserStateService`: hồ sơ → `UserProfile`; thể trạng → `BodyMetrics`; buổi tập → `WorkoutSessions`; lịch/lịch sử → `WorkoutPlans`+`WorkoutDays`; các khóa còn lại → `UserDataBlobs` |
| Mã hóa dữ liệu nhạy cảm | `health`, `checkins`, `address` mã hóa bằng Data Protection trước khi ghi DB |
| Không mất dữ liệu khi chuyển trang | Thay đổi chưa kịp gửi được lưu tạm (sessionStorage) và áp lại + gửi tiếp ở trang sau |
| Xóa tài khoản | `AccountDeletionService` xóa theo thứ tự an toàn với khóa ngoại; không cho xóa Admin cuối cùng |
| Service worker | Viết lại: chỉ cache tài nguyên tĩnh, **không cache HTML/API** (bản cũ cache trang riêng của người dùng) |
| Kiểm thử | `UserStateServiceTests` (SQLite bộ nhớ: round-trip, mã hóa, từ chối dữ liệu sai, diff buổi tập, thay lịch, xóa tài khoản) + `tests/js/store-adapter.test.js` |

## Lưu ý quan trọng
1. **Tạo lại migration** (mô hình đã đổi so với Lượt 1; nếu đã tạo `InitialCreate` thì xóa thư mục `Migrations` và database rồi làm lại):
   `Add-Migration InitialCreate` → `Update-Database`.
2. Đăng ký Admin qua User Secrets như README-LUOT1. Tài khoản `demo@disci.vn / Demo@1234` (đã onboarding) chỉ có ở Development; nút "Vào bằng tài khoản demo" cũng chỉ hiện ở Development.
3. `dotnet test` chạy cả golden test engine và test lưu trạng thái.

## Kiểm tra thủ công đề nghị (sau khi chạy được)
1. Đăng ký tài khoản mới → vào Onboarding → hoàn tất → Dashboard hiển thị đúng lịch.
2. Ghi một buổi tập, cập nhật thể trạng, tải lại trang → dữ liệu còn nguyên.
3. Mở SSMS: các bảng `UserProfiles`, `BodyMetrics`, `WorkoutPlans`, `WorkoutDays`, `WorkoutSessions`, `UserDataBlobs` có dữ liệu; cột `Value` của khóa `health` là chuỗi mã hóa.
4. Đăng nhập trình duyệt/thiết bị khác cùng tài khoản → thấy đúng dữ liệu.
5. Đăng nhập user thường rồi gõ `/Admin` hoặc `/admin.html` → bị chặn (403).
6. Nhấn nút Shield → đăng nhập bằng user thường bị từ chối; bằng Admin thì vào được.
7. Đăng nhập sai 5 lần → bị khóa tạm.
8. Xem log console của ứng dụng để lấy liên kết đặt lại mật khẩu/xác thực email (chưa gửi email thật).

## Chưa hoàn thiện / giới hạn đã biết
- **Admin Dashboard vẫn dùng dữ liệu cục bộ** (`platform.js`, `admin.js`, danh sách người dùng, nhập vai tài khoản clone, Demo Data Center): chỉ trang `/admin.html` đã được bảo vệ bằng quyền thật; thao tác dữ liệu quản trị trên DB thật là **Lượt 4**.
- **Cửa hàng/giỏ hàng/đơn hàng, cộng đồng, ảnh/video:** vẫn nằm trong `UserDataBlobs` (trên SQL Server nhưng chưa quan hệ hóa); ảnh đại diện/bìa còn là data-URL trong `UserProfile.ExtraJson` cho tới khi có upload ở **Lượt 3**. Video IndexedDB chưa chuyển.
- Email chỉ ghi log (cần cấu hình SMTP/SendGrid khi triển khai). `RequireConfirmedAccount` đang tắt.
- Xóa tài khoản chưa yêu cầu nhập lại mật khẩu (giao diện cũ không có ô này) – nên bổ sung.
- Hai thiết bị ghi **cùng một khóa** cùng lúc: bản ghi sau thắng (last-write-wins). Dữ liệu được nạp lại từ DB mỗi lần tải trang.
- Yêu cầu gửi khi đóng trang dùng `keepalive` (giới hạn ~64 KB); phần vượt được lưu tạm và gửi ở trang kế tiếp.
- Các test UI dùng jsdom/Python của dự án cũ (`tests/ui.*.js`, `*.e2e.py`) chưa được chạy lại với bản MVC.
- `RawJson`/`ExtraJson` hiện là nguồn chuẩn khi đọc lại; các cột quan hệ là bản chiếu phục vụ truy vấn/kiểm tra. Chuẩn hóa hoàn toàn sẽ làm dần ở các lượt sau.
