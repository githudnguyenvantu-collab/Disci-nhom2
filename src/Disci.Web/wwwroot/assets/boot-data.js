/* Cầu nối máy chủ → giao diện.
   Shell.cshtml nhúng dữ liệu khởi tạo dưới dạng <script type="application/json">; file này đọc chúng và gán vào window.DISCI_*
   để store.js / platform.js (nạp sau) dùng.
   – DISCI_BOOT   : { user, state, version } của người đang đăng nhập, hoặc null nếu chưa đăng nhập
   – DISCI_SITE   : cấu hình công khai (site.*, ui.*)
   – DISCI_CATALOG: danh mục bài tập/món ăn/sản phẩm (chỉ có khi đã đăng nhập)
   – DISCI_CSRF   : token chống giả mạo, gửi kèm header RequestVerificationToken
   – DISCI_FLAGS  : { demoLogin } – bật nút đăng nhập nhanh (chỉ môi trường Development)
   Thiếu file này thì DISCI_BOOT luôn rỗng: đăng nhập xong vẫn bị coi là chưa đăng nhập và token CSRF rỗng (lỗi 400). */
(function (root) {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function read(id, fallback) {
    var n = el(id);
    if (!n) return fallback;
    try {
      var t = (n.textContent || '').trim();
      return t ? JSON.parse(t) : fallback;
    } catch (e) {
      if (root.console) console.error('[DISCI] Không đọc được #' + id + ':', e);
      return fallback;
    }
  }
  var boot = el('disci-boot');
  root.DISCI_BOOT = read('disci-boot', null);
  root.DISCI_SITE = read('disci-site', null) || {};
  root.DISCI_CATALOG = read('disci-catalog', null);
  root.DISCI_CSRF = read('disci-csrf', '') || '';
  root.DISCI_FLAGS = { demoLogin: !!boot && boot.getAttribute('data-demo-login') === 'true' };
})(window);
