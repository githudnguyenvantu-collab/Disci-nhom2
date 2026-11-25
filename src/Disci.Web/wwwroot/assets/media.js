/* DISCI MEDIA – tải ảnh/video lên máy chủ ASP.NET Core (lưu ngoài wwwroot, kiểm tra loại/nội dung/dung lượng ở backend).
   Giữ nguyên API của phiên bản IndexedDB cũ (put/get/del/list/clearUser/isPersistent/LIMITS) để giao diện không phải đổi.
   Giới hạn ở đây chỉ để báo lỗi sớm cho người dùng; máy chủ luôn kiểm tra lại. */
(function (root) {
  'use strict';
  function csrf() { return root.DISCI_CSRF || ''; }
  function req(method, url, body) {
    var init = { method: method, credentials: 'same-origin', headers: { 'RequestVerificationToken': csrf() } };
    if (body) init.body = body;
    return root.fetch(url, init);
  }
  function json(r) { return r.json().catch(function () { return {}; }); }
  function fail(r, j) { var e = new Error((j && j.message) || (r.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : 'Không tải lên được. Vui lòng thử lại.')); e.status = r.status; return e; }
  var LIMITS = { maxBytes: 50 * 1024 * 1024, maxSeconds: 180, userBytes: 200 * 1024 * 1024, types: ['video/mp4', 'video/webm', 'video/quicktime'] };

  function upload(file, purpose, key, name) {
    var fd = new FormData(); fd.append('purpose', purpose); if (key) fd.append('key', key);
    fd.append('file', file, name || file.name || 'tep');
    return req('POST', '/api/media', fd).then(function (r) { return json(r).then(function (j) { if (!r.ok || !j.ok) throw fail(r, j); return j; }); });
  }
  /* put(key, file, user) → lưu video theo khóa của giao diện (ví dụ videoKey của bài viết/bài tập). */
  function put(key, file, user, purpose) {
    if (file.size > LIMITS.maxBytes) return Promise.reject(new Error('Video vượt quá 50 MB.'));
    return upload(file, purpose || (/^exv_/.test(key) ? 'exercise-video' : 'video'), key).then(function () { return { persistent: true }; });
  }
  /* uploadImage(blob, purpose) → URL ảnh trên máy chủ (dùng cho ảnh đại diện, ảnh bìa, ảnh bài viết, ảnh sản phẩm, banner). */
  function uploadImage(blob, purpose) {
    var t = blob.type || 'image/jpeg', ext = t === 'image/png' ? '.png' : t === 'image/webp' ? '.webp' : t === 'image/gif' ? '.gif' : '.jpg';
    return upload(blob, purpose || 'image', null, 'anh' + ext).then(function (j) { return j.url; });
  }
  function get(key) {
    return req('GET', '/media/k/' + encodeURIComponent(key)).then(function (r) { return r.ok ? r.blob() : null; }, function () { return null; });
  }
  function del(key) { return req('DELETE', '/api/media/k/' + encodeURIComponent(key)).then(function () {}); }
  /* Xóa toàn bộ media của CHÍNH người dùng đang đăng nhập (dùng khi xóa dữ liệu/xóa tài khoản). Tham số user giữ lại cho tương thích. */
  function clearUser() { return req('DELETE', '/api/media/mine').then(function () {}, function () {}); }
  function list(scope) { return req('GET', '/api/media' + (scope === 'all' ? '?scope=all' : '')).then(function (r) { return r.ok ? r.json() : []; }, function () { return []; }); }
  function isPersistent() { return Promise.resolve(true); }

  var api = { put: put, get: get, del: del, list: list, clearUser: clearUser, isPersistent: isPersistent, uploadImage: uploadImage, LIMITS: LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.DISCI = root.DISCI || {}; root.DISCI.media = api; }
})(typeof window !== 'undefined' ? window : globalThis);
