# Lượt 4b – Nối giao diện DISCI ADMIN vào backend thật

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (môi trường tạo gói này không có .NET SDK). Đã chạy thật và đạt: `node tests/js/admin-adapter.test.js`,
> `community-adapter`, `store-adapter`, `media` và 56 test engine gốc. Chưa kiểm thử trong trình duyệt thật. Hãy `dotnet build` + `dotnet test` rồi gửi lại lỗi nếu có.

## Cách nối
Giữ nguyên giao diện `admin.js`; thay tầng dữ liệu (`platform.js`) như đã làm với Cộng đồng. Khi vào `/admin.html`, trang tải **ảnh chụp quản trị** `GET /api/admin/snapshot`
(người dùng, bài viết kể cả bị ẩn, bình luận, báo cáo, thông báo hệ thống; **nhật ký và sao lưu chỉ trả cho Admin**), thao tác tức thì ở máy rồi gửi hành động lên máy chủ.
Máy chủ **kiểm tra lại quyền từng thao tác**; bị từ chối thì giao diện báo lỗi và tự tải lại đúng dữ liệu.

## Các tab đã chạy trên SQL Server
| Tab | Thao tác |
|---|---|
| Người dùng | Danh sách thật (email, vai trò, khóa, đăng nhập gần nhất, số buổi/streak/điểm) · tạo tài khoản (mật khẩu tạm hiện một lần) · đổi vai trò · khóa/mở khóa · đặt lại mật khẩu · xóa tài khoản |
| Nội dung | Ẩn/hiện/gỡ bài viết, ẩn/hiện/xóa bình luận (bài của người dùng thật); tác giả được thông báo khi bị ẩn |
| Báo cáo | Xem báo cáo thật của người dùng; bỏ qua / đánh dấu đã xử lý (kèm gỡ bài) |
| Thông báo hệ thống | Gửi tới tất cả / theo vai trò / một người; hạn hiển thị; liên kết nội bộ. **Được giao tới người dùng từ máy chủ** (lọc đối tượng + hết hạn ở máy chủ) |
| Nhật ký | Hiển thị `AuditLogs` thật (đăng nhập, khóa tạm, mọi thao tác quản trị). **Không xóa được từ giao diện** |
| Hệ thống → Sao lưu | Tạo / tải về / khôi phục / xóa bản sao lưu trên máy chủ; khôi phục từ tệp tải lên (một giao dịch, lỗi thì không đổi gì) |
| Thông tin tài khoản đang đăng nhập | Đổi mật khẩu, đăng xuất qua `/Account/*` (Lượt 2) |

## Quyền (khớp ma trận mặc định của giao diện cũ)
- **Admin:** mọi thao tác. **Editor:** nội dung (ẩn/xóa bài, bình luận), thông báo hệ thống, danh mục (API). **Moderator:** nội dung, **báo cáo**, xem người dùng, khóa người dùng thường.
- Ma trận quyền chỉnh được trong giao diện cũ **chỉ ẩn/hiện nút**; quyền thật do máy chủ áp theo 3 vai trò cố định ở trên.
- Không thể khóa/xóa/hạ quyền quản trị viên cuối cùng; không tự khóa mình.

## Lưu ý
1. **Tạo lại migration** (thêm `Announcements.ClientId/Link/Kind`, rộng `Audience`): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. Cần một tài khoản Admin (User Secrets – xem README-LUOT1) và tối thiểu một người dùng thường để thử kiểm duyệt.
3. "Gỡ bài" và "Ẩn bài" khác nhau ở giao diện cũ nhưng **cùng một trạng thái ẩn trên máy chủ** (bài biến khỏi cộng đồng, tác giả được thông báo; khôi phục được).

## Kiểm tra thủ công đề nghị
1. Đăng nhập Admin → `/Admin` → tab Người dùng thấy tài khoản thật (có email). Khóa một người dùng → người đó mất quyền truy cập trong ≤ 1 phút và `/api/state` trả 401/403.
2. Tạo tài khoản mới (Editor) → copy mật khẩu tạm → đăng nhập bằng tài khoản đó → bị buộc đổi mật khẩu; Editor vào được `/Admin` nhưng không thấy tab Người dùng/Hệ thống.
3. Người dùng A đăng bài, B báo cáo → Admin/Moderator thấy báo cáo, gỡ bài → A có thông báo, bài biến khỏi Cộng đồng của B.
4. Gửi thông báo "Nhóm: Người dùng" → người dùng thường thấy sau ≤ 20 giây (hoặc khi tải lại); người nhóm khác không thấy; thông báo hết hạn tự biến mất.
5. Hệ thống → Tạo bản sao lưu → sửa/ẩn một mục → Khôi phục → trở lại như cũ. Tải một tệp `.json` bất kỳ lên để khôi phục → bị từ chối, dữ liệu không đổi.
6. Tab Nhật ký có các sự kiện vừa làm (người thực hiện + IP); nút "Xóa nhật ký" báo không cho phép.
7. DevTools với tài khoản User thường: `fetch('/api/admin/snapshot')` → 403.

## Chưa chuyển lên máy chủ (còn chạy trên dữ liệu cục bộ của trình duyệt Admin)
- **Danh mục** (bài tập, dinh dưỡng, sản phẩm) và **Nhóm & thử thách** trong tab Quản lý: API quản trị đã có (`/api/admin/catalog/*`) nhưng giao diện chưa nối; thay đổi ở đây chưa ảnh hưởng người dùng khác.
- **Giao diện / thương hiệu / banner / luồng / ma trận quyền / cấu hình hệ thống** (tab Giao diện, Luồng, Hệ thống → "Lưu cấu hình"): chưa lưu vào `SystemSettings` nên **chưa áp dụng toàn hệ thống**. Chế độ bảo trì và "đóng đăng ký" chưa có hiệu lực ở máy chủ (đăng ký công khai chỉ đọc `site.registration.open`).
- **Demo Data Center, mô phỏng, xem dưới vai trò người dùng DEMO**: vẫn cục bộ. Bài/bình luận/báo cáo DEMO và chính thức (local) tiếp tục hoạt động như cũ trong trang Admin.
- Thư viện media (video) của Admin chưa dùng `GET /api/media?scope=all`.
- Hộp thông tin chi tiết người dùng chưa hiện số bài/chỉ số cơ thể (máy chủ chưa gửi dữ liệu riêng tư của người khác – cố ý).
