# Lượt 3 – Upload ảnh/video, giỏ hàng & đơn hàng quan hệ

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (không có .NET SDK trong môi trường tạo ra gói này). Đã chạy thật: `node tests/js/media.test.js`,
> `node tests/js/store-adapter.test.js` và 56 test engine gốc – đều đạt. Chưa kiểm thử trong trình duyệt thật. Hãy `dotnet build` + `dotnet test` rồi gửi lại lỗi nếu có.

## Phạm vi lượt này (và vì sao cắt hẹp)
**Cộng đồng (bài viết/bình luận/thích/theo dõi/nhóm/thử thách/xếp hạng) CHƯA chuyển ở lượt này.** `community.js` (80 KB) đọc dữ liệu của *người dùng khác*
qua `ST.udataOf()` – tức localStorage cục bộ – điều không thể có trên máy chủ. Nó cần viết lại tầng dữ liệu của cả trang (API bảng tin, phân trang, thích, bình luận,
theo dõi, nhóm, báo cáo, xếp hạng) nên được làm thành **Lượt 3b** riêng, để không đưa ra một bản vá nửa vời.

## Đã làm
| Hạng mục | Chi tiết |
|---|---|
| Upload ảnh/video | `POST /api/media` (multipart). Mục đích: avatar, cover, post, story, product, banner, image / video, exercise-video, post-video. `banner`, `product`, `exercise-video` chỉ Admin/Editor |
| Kiểm tra tệp (`UploadValidator`) | Đuôi tệp trong danh sách cho phép (JPG/PNG/WEBP/GIF, MP4/WEBM/MOV; **không SVG/HTML**) · nhận diện **nội dung thật (magic bytes)** phải khớp đuôi · Content-Type hợp lệ · dung lượng (ảnh 5 MB, video 50 MB, đổi được ở `SystemSettings`) · quota 200 MB/người · tên hiển thị được làm sạch |
| Lưu trữ an toàn | Ngoài `wwwroot` (`App_Data/uploads`, đổi bằng `Uploads:Root`), tên GUID do máy chủ sinh, chống path traversal; ghi qua tệp tạm + SHA-256 |
| Phục vụ tệp | `GET /media/{guid}.{ext}` và `GET /media/k/{key}` – yêu cầu đăng nhập, `nosniff`, CSP `sandbox`, hỗ trợ Range cho video |
| `media.js` | Viết lại gọi máy chủ nhưng **giữ nguyên API** (`put/get/del/list/clearUser/isPersistent/LIMITS`) nên `ui.js`/admin không phải đổi |
| Ảnh đại diện/bìa/bài viết/sản phẩm/banner | `fileToImage()` vẫn thu nhỏ ở trình duyệt, rồi **tải lên** và trả URL `/media/…` (mất mạng thì tạm dùng data-URL và báo) |
| Giỏ hàng, sản phẩm đã lưu, đơn hàng | Chuyển từ JSON sang bảng `CartItems`, `SavedProducts`, `Orders`+`OrderItems`. Gộp dòng giỏ trùng, kiểm tra số lượng 1–99, giữ thứ tự hiển thị |
| Bảo vệ dữ liệu đơn | Địa chỉ giao hàng đầy đủ chỉ nằm trong cột mã hóa `RawProtected`; cột `ShipPhone` chỉ giữ dạng che (`*******678`) |
| Xóa tài khoản | Xóa luôn tệp vật lý của người dùng |
| Kiểm thử | `UploadTests` (~35 ca: ảnh/video hợp lệ, exe đổi tên `.jpg`, SVG/HTML, sai đuôi, quá lớn, quota, thay theo khóa, path traversal…), `UserStateServiceTests` mở rộng (giỏ/đã lưu/đơn), `tests/js/media.test.js` |

## Lưu ý
1. **Tạo lại migration** (mô hình thay đổi: `MediaAssets.Kind/ClientKey`, `Orders.ClientId/RawProtected`, `CartItems/SavedProducts.Position`): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. Sản phẩm trong giỏ/đã lưu mà **chưa có trong bảng `Products`** (ví dụ sản phẩm tùy chỉnh cũ) không bị mất: giữ ở khóa nội bộ `_unknown.*` và ghép lại khi đọc. Quản lý sản phẩm trên DB thật là **Lượt 4**.
3. Cấu hình tùy chọn: `Uploads:Root`, `Uploads:UserQuotaMb`; `SystemSettings`: `upload.maxImageMb`, `upload.maxVideoMb`.

## Kiểm tra thủ công đề nghị
1. Đổi ảnh đại diện trong Hồ sơ → tải lại trang → ảnh còn; DevTools cho thấy URL dạng `/media/<guid>.jpg`; SSMS: bảng `MediaAssets` có 1 dòng, `App_Data/uploads/<2 ký tự>/<guid>.jpg` tồn tại.
2. Thử tải một tệp `.exe` đổi tên `.jpg`, một tệp `.svg`, một ảnh > 5 MB → đều bị từ chối kèm thông báo tiếng Việt.
3. Thêm sản phẩm vào giỏ, tạo đơn demo → SSMS: `CartItems`, `Orders`, `OrderItems`; cột `RawProtected` là chuỗi mã hóa; `ShipPhone` bị che.
4. Đăng nhập tài khoản khác → không thấy giỏ/đơn của tài khoản kia; mở thẳng `/media/<guid>.jpg` khi chưa đăng nhập → bị chuyển về đăng nhập.
5. Xóa tài khoản thử → tệp trong `App_Data/uploads` của tài khoản đó biến mất.

## Chưa hoàn thiện / giới hạn đã biết
- **Cộng đồng, nhóm, thử thách, bảng xếp hạng, tin nhắn, thông báo liên người dùng** (Lượt 3b). Hiện chúng vẫn chạy trên dữ liệu cá nhân của từng tài khoản (`UserDataBlobs`) – **chưa thấy bài của người khác**.
- **Video cũ trong IndexedDB và dữ liệu localStorage của bản web tĩnh cũ chưa có đường nhập sang** (cần chức năng "Nhập dữ liệu từ tệp xuất của DISCI cũ" – dự kiến cùng Lượt 4).
- Ảnh chỉ được kiểm tra nội dung (magic bytes), **chưa được mã hóa lại** bằng thư viện xử lý ảnh (có thể thêm ImageSharp sau để loại metadata/EXIF).
- Thư viện media của Admin (`scope=all`) đã có API, giao diện quản trị dùng dữ liệu thật ở Lượt 4.
- Tệp mồ côi (đã tải lên nhưng không còn được tham chiếu) chưa có tác vụ dọn tự động.
- Người dùng đã đăng nhập đều xem được mọi media theo URL (URL là GUID khó đoán, phù hợp nội dung cộng đồng). Nội dung riêng tư theo từng người sẽ cần kiểm tra quyền sâu hơn khi làm cộng đồng.
