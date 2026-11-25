# DISCI – ASP.NET Core MVC · Lượt 1 (nền tảng)

> **Trạng thái trung thực:** mã nguồn của Lượt 1 được viết trong môi trường **không có .NET SDK**, nên **chưa được biên dịch, chưa chạy migration, chưa chạy test**.
> Hãy build ở máy của bạn và gửi lại mọi lỗi (nếu có) để sửa trước khi sang Lượt 2.

## Lượt 1 có gì
| Thành phần | Vị trí |
|---|---|
| Solution + 2 project (.NET 8) | `Disci.sln`, `src/Disci.Web`, `tests/Disci.Tests` |
| 44 entity phủ các module (tài khoản, sức khỏe, tập luyện, dinh dưỡng, cửa hàng, cộng đồng, hệ thống) | `src/Disci.Web/Models/Entities` |
| `ApplicationDbContext` (khóa ngoại, khóa ghép, chỉ mục, quy ước xóa an toàn cho SQL Server) | `Data/ApplicationDbContext.cs` |
| ASP.NET Core Identity + cookie + 4 vai trò (Admin/Editor/Moderator/User) + policy | `Program.cs` |
| Seed: vai trò, Admin (từ cấu hình), 55 bài tập, 18 sản phẩm, 22 món, huy hiệu, thử thách, cấu hình | `Data/DbSeeder.cs`, `Data/Seed/*.json` |
| **Engine C#** – bản port của `engine.js` (BMI, TDEE, cảnh báo 3 mức, tạo lịch, thay bài, bỏ buổi, tiến độ, huy hiệu, gợi ý sản phẩm, thực đơn) | `Services/Engine` |
| Kiểm thử đối chiếu engine C# với engine.js gốc (golden test, ~80 kịch bản) + unit test an toàn | `tests/Disci.Tests` |
| CSS/JS/ảnh cũ đã đặt trong `wwwroot` để dùng lại ở Lượt 2 (**đã loại `site-config.js`** vì chứa hash mật khẩu admin cũ) | `src/Disci.Web/wwwroot` |

**Cập nhật:** Lượt 2 đã bổ sung giao diện Razor, tài khoản, API trạng thái (xem README-LUOT2.md). Chưa có: upload, Admin thật, sao lưu/khôi phục.

## 1. Cài đặt
- Visual Studio 2022 (workload *ASP.NET and web development*) hoặc .NET 8 SDK.
- SQL Server: **LocalDB** (đi kèm Visual Studio) hoặc **SQL Server Express**. SSMS chỉ dùng để xem dữ liệu.

## 2. Chuỗi kết nối (`src/Disci.Web/appsettings.json`)
- LocalDB (mặc định): `Server=(localdb)\MSSQLLocalDB;Database=DISCI;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True`
- SQL Express: đổi `Server=` thành `localhost\SQLEXPRESS`.
- Trong SSMS, ô *Server name* nhập đúng giá trị `Server=` ở trên (LocalDB: `(localdb)\MSSQLLocalDB`).

## 3. Tài khoản quản trị (không có mật khẩu mặc định trong source)
```bash
cd src/Disci.Web
dotnet user-secrets set "Seed:Admin:Email" "admin@example.com"
dotnet user-secrets set "Seed:Admin:Password" "MatKhau-Cua-Ban-1"
```
Môi trường Development tự tạo thêm tài khoản **demo@disci.vn / Demo@1234** (vai trò User). Production: đặt `Seed:CreateDemoUser=false`.

## 4. Tạo migration và database (làm một lần)
Migration chưa được tạo sẵn vì cần .NET SDK. Trong **Package Manager Console** (Default project = `Disci.Web`):
```powershell
Add-Migration InitialCreate
Update-Database
```
hoặc dùng CLI:
```bash
dotnet tool install --global dotnet-ef
cd src/Disci.Web
dotnet ef migrations add InitialCreate
dotnet ef database update
```
Ứng dụng cũng tự gọi `Migrate()` + seed khi khởi động (tắt bằng `Database:AutoMigrate=false`).
Nếu `Add-Migration` báo lỗi *multiple cascade paths*, hãy gửi nguyên văn lỗi để chỉnh `Cascade` trong `ApplicationDbContext`.

## 5. Chạy và kiểm tra
```bash
dotnet run --project src/Disci.Web
```
Mở `https://localhost:<port>/health` – kỳ vọng `{"status":"ok","exercises":55,"products":18,"foodItems":22,"challenges":4}`.
Mở SSMS → kết nối cùng server → database `DISCI` → xem các bảng.

## 6. Chạy test
```bash
dotnet test
```
Golden test so sánh C# với `engine.js`. Sinh lại dữ liệu đối chiếu (cần Node.js): `node tools/gen-golden.js <thư-mục-assets-DISCI-cũ>`.

## 7. Lưu ý thiết kế
- Mảng/đối tượng linh hoạt (dụng cụ, bước tập, lý do của lịch…) lưu dạng JSON trong cột `nvarchar(max)` (`*Json`).
- Xóa mặc định **RESTRICT**; chỉ CASCADE cho dữ liệu thuộc sở hữu (hồ sơ, chỉ số, lịch, buổi tập, giỏ hàng, thông báo…). Quan hệ thứ cấp (bình luận/thích trên bài người khác, đơn hàng) sẽ do dịch vụ xóa tài khoản xử lý ở Lượt 2.
- `HealthRecord.ValueProtected` sẽ được mã hóa bằng Data Protection ở tầng service (Lượt 2).
- Ngưỡng sức khỏe là tham số tham khảo, **chưa được chuyên gia y tế kiểm chứng**; DISCI không chẩn đoán.
- Dữ liệu demo cộng đồng (DEMO_USERS/POSTS/COMMENTS) chưa seed – thuộc Demo Data Center ở Lượt 3–4.
