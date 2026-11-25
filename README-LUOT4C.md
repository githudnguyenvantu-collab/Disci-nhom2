# Lượt 4c – Danh mục, cấu hình hệ thống và chế độ bảo trì trên máy chủ

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (môi trường tạo gói này không có .NET SDK). Đã chạy thật và đạt: 5 bộ test Node
> (`catalog-config-adapter`, `admin-adapter`, `community-adapter`, `store-adapter`, `media`) và 56 test engine gốc. Chưa kiểm thử trong trình duyệt thật.

## Đã làm
| Hạng mục | Chi tiết |
|---|---|
| **Danh mục dùng chung** | Bài tập, món ăn, sản phẩm, thử thách nằm trong SQL Server. Máy chủ nhúng danh mục vào mọi trang đã đăng nhập (`window.DISCI_CATALOG`) nên **mọi người dùng thấy cùng dữ liệu** và engine tạo lịch dùng đúng danh mục hiện hành (mục bị ẩn không được gợi ý nhưng lịch cũ vẫn mở được) |
| **Quản lý danh mục (Admin/Editor)** | Thêm/sửa/ẩn/khôi phục bản gốc/xóa trên giao diện Quản lý cũ → gửi lên `/api/admin/catalog/*`. Mục gốc chỉ ẩn/khôi phục; mục tự thêm xóa được nếu không còn được tham chiếu (đơn hàng, nhật ký ăn, bài thay thế…). Thử thách gốc xóa = ẩn |
| **Trường mở rộng** | Ảnh sản phẩm (`images[]`), thương hiệu, SKU, tồn kho, bảng thông số, mô tả dài, `videoKey`, `demoMembers`… được lưu (`ExtraJson`) và trả lại nguyên vẹn; kiểm tra khóa/kích thước/độ sâu; ảnh chỉ nhận tệp đã tải lên hệ thống |
| **Sửa lỗi quan trọng** | Mã sản phẩm gốc có dấu gạch ngang (`band-set3`, `db-adj`…) và metric thử thách (`sessions30`, `sessions28`, `manual`) trước đây sẽ bị từ chối khi sửa → đã cho phép |
| **Cấu hình giao diện/thương hiệu/luồng** | `PL.cfg()` được lưu ở khóa `site.config` (nhúng vào mọi trang qua `window.DISCI_SITE`); gộp nhiều thay đổi liên tiếp thành một lần gửi. **Admin** ghi mọi khóa; **Editor** chỉ ghi `site.config` và **không** đổi được nhánh `system` (máy chủ giữ nguyên bản của Admin) |
| **Chế độ bảo trì** | Middleware máy chủ: khi `system.maintenance = true` chỉ **Admin** được vào (đăng nhập, tài nguyên tĩnh, `/health`, `/api/site` vẫn mở); còn lại nhận 503 (JSON cho `/api/*`, trang thông báo cho giao diện) |
| **Đóng/mở đăng ký** | `site.registration.open` do Admin điều khiển, máy chủ từ chối đăng ký khi đóng |
| **Ảnh banner/logo** | `pickImage` của Admin giờ tải ảnh lên máy chủ và lưu URL `/media/…` (cấu hình không còn phình vì data-URL) |
| Kiểm thử | Test C# mới: trường mở rộng + chặn dữ liệu xấu, id có gạch ngang, metric thử thách, Editor chỉ sửa giao diện, `ISiteSettings`/bảo trì; test Node: danh mục từ máy chủ ↔ cấu trúc cũ, thao tác Admin, đồng bộ cấu hình theo vai trò |

## Lưu ý
1. **Tạo lại migration** (thêm `ExtraJson` cho 4 bảng danh mục): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. Mỗi trang đã đăng nhập mang theo danh mục đầy đủ (~60 KB JSON, **không nén** vì nén kèm token CSRF qua HTTPS có rủi ro BREACH). Đủ cho quy mô lớp học/CLB; nếu lớn hơn nên chuyển sang tải riêng có ETag.
3. Cấu hình là **một tài liệu** `site.config` (tối đa 200 KB); hai quản trị viên sửa cùng lúc thì bản lưu sau thắng.
4. Quyền thật vẫn theo 3 vai trò cố định; ma trận quyền trong giao diện chỉ ẩn/hiện nút.

## Kiểm tra thủ công đề nghị
1. Admin sửa tên một bài tập, ẩn một món ăn, thêm một sản phẩm có ảnh → đăng nhập tài khoản khác (cửa sổ ẩn danh): thấy đúng thay đổi; tạo lịch mới không còn gợi ý bài đã ẩn.
2. Admin đổi tên thương hiệu/màu ở tab Giao diện → mở trang ở tài khoản khác thấy thay đổi; kiểm tra SSMS: bảng `SystemSettings`, khóa `site.config`.
3. Admin bật "Bảo trì" → người dùng thường nhận trang bảo trì (và `/api/*` trả 503); Admin vẫn vào được; tắt bảo trì → trở lại bình thường (≤ 10 giây).
4. Admin tắt "Cho phép đăng ký" → đăng ký mới bị từ chối ở máy chủ.
5. Editor đổi màu giao diện được; thử đổi chế độ bảo trì (DevTools `PUT /api/admin/settings`) → 403.
6. Sửa một sản phẩm gốc (ví dụ `band-set3`) → lưu thành công và hiển thị ở Cửa hàng của người khác.

## Chưa hoàn thiện
- **Demo Data Center & mô phỏng** vẫn chạy cục bộ trong trình duyệt Admin (tạo người dùng/bài viết demo, "xem dưới vai trò" người dùng khác). Cờ `IsDemo` đã có trên các bảng nhưng chưa có API tạo/xóa dữ liệu demo trên máy chủ.
- Bài viết chưa lọc từ cấm ở máy chủ (chỉ bình luận); tin nhắn nhóm và Stories chưa chuyển.

## Bổ sung sau cùng
Nhật ký ăn uống của người dùng (`nutritionLog`) đã chuyển sang bảng `NutritionLogs` (thêm cột `Position`, `RawJson` → vẫn cần tạo lại migration). Món đã bị xóa khỏi danh mục vẫn giữ trong nhật ký, chỉ bỏ liên kết khóa ngoại. Bảng `NutritionPlans` chưa dùng.
