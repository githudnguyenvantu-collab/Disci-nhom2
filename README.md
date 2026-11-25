# DISCI – ASP.NET Core MVC (chuyển đổi từ web tĩnh)

DISCI là ứng dụng theo dõi tập luyện/dinh dưỡng/cộng đồng/cửa hàng. Bản này chuyển DISCI từ HTML+JS+localStorage sang **ASP.NET Core 8 MVC + EF Core + SQL Server + ASP.NET Core Identity**,
**giữ nguyên giao diện (CSS/JS/animation/responsive) và toàn bộ thuật toán** (BMI, TDEE, cảnh báo 3 mức, tạo lịch, tiến độ…).

> ## ⚠ Đọc trước: trạng thái kiểm chứng
> Gói này được viết trong môi trường **không có .NET SDK**. **Toàn bộ mã C# (≈40 file, 92 test) CHƯA từng được biên dịch hay chạy.** Đã chạy thật: 56 test engine gốc,
> 6 bộ test Node cho tầng JavaScript mới (store/media/cộng đồng/quản trị/danh mục-cấu hình/chat-stories) và kiểm tra cú pháp mọi file JS. **Hãy build, chạy test, rồi gửi lại lỗi** trước khi dùng thật.
> Chưa kiểm thử trong trình duyệt thật, chưa kiểm thử tải/hiệu năng, chưa rà soát bảo mật độc lập.

## 1. Chạy dự án
**Yêu cầu:** Visual Studio 2022 (workload *ASP.NET and web development*) hoặc .NET 8 SDK; SQL Server (LocalDB đi kèm VS, hoặc Express). SSMS chỉ để xem dữ liệu.
1. Mở `Disci.sln`. Chuỗi kết nối: `src/Disci.Web/appsettings.json` → `ConnectionStrings:DefaultConnection` (mặc định LocalDB `(localdb)\MSSQLLocalDB`; SQL Express: `localhost\SQLEXPRESS`).
2. **Tài khoản Admin** (không có mật khẩu mặc định trong mã nguồn):
   ```bash
   cd src/Disci.Web
   dotnet user-secrets set "Seed:Admin:Email" "admin@example.com"
   dotnet user-secrets set "Seed:Admin:Password" "MatKhau-Cua-Ban-1"
   ```
3. **Tạo migration + database** (làm một lần; migration chưa được tạo sẵn vì cần .NET SDK). Package Manager Console (Default project = `Disci.Web`):
   `Add-Migration InitialCreate` → `Update-Database`  (hoặc `dotnet ef migrations add InitialCreate` / `dotnet ef database update`). Ứng dụng cũng tự `Migrate()` + seed khi khởi động.
   Nếu đã có migration/database từ gói cũ hơn, **xóa thư mục `Migrations` và database rồi làm lại** (mô hình đã đổi nhiều lần).
4. Chạy: `dotnet run --project src/Disci.Web` → mở `/health` (kỳ vọng 55 bài tập, 18 sản phẩm, 22 món, 4 thử thách) rồi `/`.
5. Test: `dotnet test` (C#) · `node tests/js/<tên>.test.js` (JS; cần Node 18+).

**Tài khoản:** Admin = tài khoản bạn đặt ở bước 2 (đăng nhập quản trị bằng **nút tròn Shield góc trên bên trái** màn hình đăng nhập).
**Demo User** (chỉ môi trường Development): `demo@disci.vn` / `Demo@1234`.

**Nút đăng nhập demo (chỉ môi trường Development):** màn hình đăng nhập có 2 nút — *Demo · Giao diện người dùng* và *Demo · Giao diện quản trị* — bấm là vào thẳng, không cần gõ mật khẩu.
Máy chủ tự tạo/sửa tài khoản demo khi bấm (`POST /Account/DemoLoginApi`, Production trả 404 nên không thể dùng làm cửa hậu).
Ở Development, mỗi lần khởi động ứng dụng còn tự **đặt lại mật khẩu** của Admin (theo `Seed:Admin:*`, nếu thiếu dùng `admin@disci.vn` / `Admin@1234`) và `demo@disci.vn` về đúng giá trị cấu hình, đồng thời mở khóa nếu bị khóa do nhập sai.

> **Sửa lỗi không đăng nhập được:** thiếu `wwwroot/assets/boot-data.js` (file nạp phiên đăng nhập + token CSRF từ máy chủ vào trình duyệt) → đã bổ sung. Đã gỡ khối log chẩn đoán tạm trong `Program.cs`.

## 2. Kiến trúc
```
Trình duyệt: giao diện DISCI cũ (JS) ──► store.js / platform.js / media.js (bộ chuyển đổi gọi máy chủ, giữ API cũ)
                │ window.DISCI_BOOT/CATALOG/SITE (máy chủ nhúng vào trang)         │ fetch + token CSRF
Controllers (Pages, Account, State, Community, Media, AdminApi, Site, Home)  ──►  Services  ──►  EF Core  ──►  SQL Server
Services: UserStateService · CommunityService · AdminService · CatalogAdminService · BackupService · MediaService · AuditService · SiteSettings · DisciEngine (C#, đối chiếu engine.js)
```
- Mọi liên kết `*.html` cũ vẫn chạy và có thêm đường dẫn MVC gọn (`/Dashboard`, `/Workout`, `/Community`, `/Admin`…). Trang thành viên cần đăng nhập; `/admin.html` cần vai trò Admin/Editor/Moderator.
- Quyền kiểm tra **ở máy chủ** (policy + kiểm tra chi tiết trong service), danh tính luôn lấy từ cookie. Chống CSRF cho mọi POST/PUT/DELETE. Dữ liệu sức khỏe/địa chỉ/đơn hàng mã hóa bằng Data Protection.
- Thiết kế dữ liệu: bảng quan hệ cho hồ sơ, thể trạng, lịch tập, buổi tập, bài viết, bình luận, thích, theo dõi, nhóm, thử thách, thông báo, giỏ hàng, đơn hàng, danh mục, cấu hình, nhật ký; cột `RawJson/ExtraJson` giữ nguyên vẹn dữ liệu giao diện.

## 3. Báo cáo chuyển đổi 24 module
✅ = chạy trên SQL Server (đã viết + có test, **chưa build**) · 🟡 = một phần · ❌ = chưa chuyển

| # | Module | | Ghi chú |
|---|---|---|---|
| 1 | Đăng nhập & đăng ký | ✅ | Identity, khóa tạm 5 lần sai, quên/đặt lại mật khẩu & xác thực email (gửi thật qua SMTP khi cấu hình `Email:*`, ngược lại ghi log), nút Shield đăng nhập quản trị riêng |
| 2 | Onboarding & khảo sát | ✅ | `UserProfile`, `OnboardingCompleted` |
| 3 | Dashboard | ✅ | engine + dữ liệu người dùng từ DB |
| 4 | Lịch tập cá nhân | ✅ | `WorkoutPlans/Days`, lịch sử phiên bản |
| 5 | Trình tập luyện | ✅ | `WorkoutSessions` |
| 6 | Thư viện bài tập | ✅ | DB + quản trị + chia sẻ cho mọi người dùng |
| 7 | Theo dõi tiến độ | ✅ | engine + buổi tập/thể trạng từ DB |
| 8 | Thể trạng & chỉ số sức khỏe | ✅ | `BodyMetrics`; sức khỏe mã hóa |
| 9 | Dinh dưỡng | ✅ | món ăn & quản trị trên DB; nhật ký ăn của người dùng → `NutritionLogs` (giữ thứ tự, món tự nhập); `nutritionPrefs` (hạt giống thực đơn) còn trong `UserDataBlobs` |
| 10 | Cửa hàng sản phẩm | ✅ | `Products` + quản trị |
| 11 | Giỏ hàng | ✅ | `CartItems`, `Orders/OrderItems` (đơn demo, mã hóa địa chỉ) |
| 12 | Hồ sơ cá nhân | ✅ | xuất/nhập dữ liệu, xóa tài khoản |
| 13–14 | Cộng đồng: bài viết, bình luận, thích, chia sẻ, theo dõi | ✅ | quyền xem lọc ở máy chủ |
| 15 | Nhóm, thử thách, bảng xếp hạng | ✅ | thống kê tính ở máy chủ, tôn trọng riêng tư |
| 16 | Thông báo | ✅ | thông báo người dùng + thông báo hệ thống theo đối tượng |
| 17 | DISCI ADMIN | ✅ | các tab Người dùng, Nội dung, Báo cáo, Thông báo, Nhật ký, Sao lưu, Quản lý danh mục, Giao diện/Hệ thống đã nối; Demo Data Center: xem dòng 21 |
| 18 | Tài khoản & phân quyền | ✅ | 4 vai trò; bảo vệ admin cuối cùng; ma trận quyền giao diện chỉ để ẩn/hiện nút |
| 19 | Nội dung, bài tập, sản phẩm | ✅ | CRUD + kiểm tra chặt |
| 20 | Giao diện & cấu hình hệ thống | ✅ | `site.config`, bảo trì, đóng đăng ký |
| 21 | Demo Data Center & mô phỏng | 🟡 | **Cố ý giữ ở trình duyệt**: dữ liệu DEMO sinh theo thuật toán cố định (cùng bộ cho mọi người), có nhãn DEMO, **không ghi vào DB thật** để không lẫn với dữ liệu thật. Công tắc "hiển thị DEMO" và "Xóa toàn bộ DEMO" áp dụng toàn hệ thống (qua `site.config`). Chưa có: lưu dữ liệu DEMO vào DB, "xem dưới vai trò" tài khoản DEMO trên máy chủ |
| 22 | Nhật ký hoạt động | ✅ | `AuditLogs` |
| 23 | Sao lưu & khôi phục | ✅ | sao lưu/khôi phục **logic** cấu hình+nội dung (một giao dịch) + sao lưu **toàn bộ DB** `.bak` bằng `BACKUP DATABASE` (cần `Backups:SqlRoot`); khôi phục `.bak` bằng SSMS |
| 24 | Khác | ✅ | upload ảnh/video (kiểm tra magic bytes, quota, ngoài wwwroot); tin nhắn nhóm + tin nhắn riêng; Stories 24 giờ; service worker không cache dữ liệu riêng |

## 4. Kiểm thử đã thực hiện
| Loại | Kết quả |
|---|---|
| 56 test engine gốc (`node tests/engine.test.js` trong dự án cũ) | ✅ đạt (engine không bị sửa) |
| 6 bộ test Node cho tầng chuyển đổi JS | ✅ đạt |
| Cú pháp mọi file JS (`node --check`) | ✅ |
| 92 test C# (engine golden ~80 kịch bản đối chiếu engine.js; lưu trạng thái; upload; cộng đồng; quản trị; danh mục; sao lưu) | ⏳ **đã viết, chưa chạy** |
| Biên dịch C#, migration, chạy ứng dụng, thử trên trình duyệt (desktop/tablet/mobile), test UI cũ (jsdom/e2e) | ❌ **chưa thực hiện** |

## 5. Danh sách chưa hoàn thiện / giới hạn
Chi tiết ở mục "Chưa hoàn thiện" của `README-LUOT5.md` và các README lượt trước. Tóm tắt:
- **Dữ liệu DEMO không lưu DB** (cố ý, có nhãn DEMO); không có "xem dưới vai trò tài khoản DEMO" trên máy chủ.
- **Khôi phục `.bak` làm bằng SSMS**; sao lưu `.bak` tự động theo lịch chưa có.
- Làm mới cộng đồng/tin nhắn bằng polling (4–45 giây), chưa dùng SignalR; chưa phân trang phía máy chủ cho danh sách lớn.
- Ảnh chưa được mã hóa lại (còn EXIF); nội dung bài viết chưa lọc từ cấm ở máy chủ (bình luận/tin nhắn có lọc).
- Chưa nhập lại được video IndexedDB của bản cũ; chưa rà soát bảo mật độc lập; chưa kiểm thử tải.
- **Quan trọng nhất: toàn bộ C# chưa từng được biên dịch/chạy** (xem khung cảnh báo đầu tài liệu).
