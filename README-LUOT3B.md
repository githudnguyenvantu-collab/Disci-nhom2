# Lượt 3b – Cộng đồng chạy trên SQL Server

> **Trạng thái trung thực:** C# **chưa được biên dịch/chạy** (môi trường tạo gói này không có .NET SDK). Đã chạy thật và đạt: `node tests/js/community-adapter.test.js`,
> `store-adapter.test.js`, `media.test.js` và 56 test engine gốc. Chưa kiểm thử trong trình duyệt thật. Hãy `dotnet build` + `dotnet test` rồi gửi lại lỗi nếu có.

## Vì sao làm kiểu này
`platform.js` của DISCI cũ là một "backend giả" chạy trong trình duyệt: mọi người dùng chung một tài liệu `DISCI.plat` trong localStorage, và `community.js` đọc dữ liệu
của người khác bằng `ST.udataOf()`. Trên máy chủ không thể làm vậy. Thay vì viết lại 80 KB giao diện, tôi giữ nguyên `community.js` và thay **tầng dữ liệu**:
máy chủ gửi "ảnh chụp cộng đồng" đã lọc theo quyền xem; thao tác diễn ra tức thì ở máy rồi gửi lên máy chủ; máy chủ là nguồn sự thật (bị từ chối thì khôi phục theo ảnh chụp mới).

## Đã làm
| Hạng mục | Chi tiết |
|---|---|
| Bài viết | `S.posts` của mỗi người ghi vào bảng `Posts` (qua `/api/state`); người khác xem qua ảnh chụp cộng đồng. **Quyền xem do máy chủ lọc**: công khai / chỉ người theo dõi / riêng tư / bài bị ẩn |
| Thích, bình luận, chia sẻ, báo cáo | `PostLikes`, `Comments`, `PostShares`, `Reports`. Danh tính luôn lấy từ cookie (không thể thích/bình luận thay người khác). Không tương tác được với bài mình không có quyền xem |
| Bình luận | Làm sạch, tối đa 500 ký tự, từ cấm (`SystemSettings: system.bannedWords`), giới hạn 20 bình luận/phút, người dùng chỉ xóa được bình luận của chính mình |
| Theo dõi | `Follows`; không tự theo dõi, không theo dõi tài khoản bị khóa |
| Nhóm | Tạo/vào/rời/sửa/xóa; chỉ chủ nhóm hoặc nhân sự quản trị được sửa/xóa; xóa nhóm giữ lại bài viết |
| Thử thách | Tham gia/rời (`ChallengeParticipants`); không tạo trùng |
| Thông báo | Máy chủ tạo thông báo thích/bình luận/chia sẻ/theo dõi cho đúng người nhận (không trùng, không tự thông báo); đánh dấu đã đọc lên máy chủ |
| Bảng xếp hạng/thống kê | Tính trên máy chủ (số buổi, phút, streak, điểm) và **chỉ gửi cho người không tắt hiển thị thống kê/bảng xếp hạng** |
| Riêng tư | Ảnh chụp không bao giờ chứa email, băm mật khẩu hay dữ liệu sức khỏe của người khác |
| Làm mới | Trang Cộng đồng tải ảnh chụp khi mở và làm mới nhẹ mỗi 45 giây; thông báo làm mới mỗi ≤ 20 giây ở mọi trang |
| Sửa lỗi Lượt 2 | `platform.js` bọc `ST.login` nhưng bỏ mất tham số `who` → đăng nhập quản trị (nút Shield) không tới `/Admin/LoginApi`. **Đã sửa** |
| Kiểm thử | `CommunityServiceTests` (quyền xem bài, tương tác với bài không thấy được, thích không trùng thông báo, bình luận kiểm duyệt + giới hạn, theo dõi, quyền sở hữu nhóm, thử thách, không lộ email/thống kê bị ẩn, bài từ state + cascade xóa, chống chiếm mã bài) + `tests/js/community-adapter.test.js` |

## Lưu ý
1. **Tạo lại migration** (thêm `Posts/Comments/Groups/Reports/Notifications.ClientId`, `Posts.RawJson`, `Groups.Hue`, `Notifications.Type/FromUserId/PostClientId`): xóa thư mục `Migrations` + database rồi `Add-Migration InitialCreate` → `Update-Database`.
2. Cần **ít nhất hai tài khoản** để thấy cộng đồng thật (đăng ký thêm tài khoản thứ hai ở trình duyệt/cửa sổ ẩn danh khác).

## Kiểm tra thủ công đề nghị
1. Tài khoản A đăng bài (công khai) → đăng nhập tài khoản B (cửa sổ ẩn danh) → thấy bài của A ở Cộng đồng.
2. A đăng bài "chỉ người theo dõi" → B **không** thấy; B theo dõi A → thấy. Bài "riêng tư" B không bao giờ thấy.
3. B thích + bình luận → A có thông báo (chuông/tab Thông báo), cập nhật trong ≤ 45 giây hoặc khi tải lại.
4. B thử gõ trực tiếp `POST /api/community/posts/<id-bài-riêng-tư>/like` (DevTools) → 404.
5. SSMS: bảng `Posts`, `Comments`, `PostLikes`, `Follows`, `Groups`, `GroupMembers`, `Notifications` có dữ liệu thật.
6. B tắt "hiển thị thống kê/bảng xếp hạng" trong Hồ sơ → biến mất khỏi bảng xếp hạng của A.

## Chưa hoàn thiện / giới hạn đã biết
- **Dữ liệu DEMO, mô phỏng, tài khoản "clone" và kiểm duyệt của quản trị viên** (ẩn bài/bình luận, xử lý báo cáo, đăng bài chính thức, thông báo hệ thống, stories) vẫn ở dữ liệu cục bộ → **Lượt 4**. Báo cáo của người dùng đã ghi vào bảng `Reports` nhưng chưa có màn hình xử lý thật.
- **Tin nhắn nhóm/chat và Stories** chưa chuyển (không có thời gian thực; bảng `DirectMessage`/`Story` đã có nhưng chưa nối giao diện).
- Ảnh chụp giới hạn 300 bài mới nhất, tối đa ~800 người dùng và 200 nhóm; chưa phân trang/tìm kiếm phía máy chủ (đủ cho quy mô lớp học/CLB, cần phân trang khi lớn hơn).
- Làm mới bằng polling (45 giây), chưa có SignalR/WebSocket.
- Bài viết lưu qua `/api/state` nên có độ trễ ~0,3–1 giây trước khi người khác thấy; mã bài do giao diện sinh nên máy chủ từ chối nếu trùng mã của người khác.
- Từ cấm chỉ áp dụng cho bình luận (bài viết đi qua `/api/state` chưa lọc từ cấm ở máy chủ).
