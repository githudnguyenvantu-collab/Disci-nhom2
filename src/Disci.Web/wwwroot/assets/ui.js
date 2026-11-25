/* DISCI UI – khung ứng dụng, thành phần dùng chung, biểu đồ SVG, khởi động trang */
(function (root) {
  'use strict';
  var E = root.DISCI_ENGINE, D = root.DISCI_DATA, ST = root.DISCI.store;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmtDate(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function fmtDM(s) { return s.slice(8, 10) + '/' + s.slice(5, 7); }
  function ago(ts) { var d = Date.now() - ts, m = Math.floor(d / 6e4); if (m < 1) return 'Vừa xong'; if (m < 60) return m + ' phút trước'; var h = Math.floor(m / 60); if (h < 24) return h + ' giờ trước'; var dd = Math.floor(h / 24); return dd < 7 ? dd + ' ngày trước' : fmtDate(E.todayStr(ts)); }
  function go(p) { location.href = p; }
  /* Ủy quyền sự kiện: mỗi (phần tử, sự kiện, bộ chọn) chỉ gắn MỘT trình nghe; gọi lại chỉ thay hàm xử lý.
     (Trước đây render() gọi lại làm nhân bản trình nghe → nút mở hộp thoại bị kích hoạt nhiều lần.) */
  function on(el, ev, sel, fn) {
    var k = ev + '|' + sel; el.__h = el.__h || {};
    if (el.__h[k]) { el.__h[k] = fn; return; }
    el.__h[k] = fn;
    el.addEventListener(ev, function (e) { var t = e.target.closest(sel); if (t && el.contains(t)) el.__h[k](t, e); });
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var w = $('.toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; w.setAttribute('role', 'status'); w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
    var t = document.createElement('div'); t.className = 'toast' + (type === 'err' ? ' err' : '');
    t.innerHTML = '<span class="material-symbols-outlined">' + (type === 'err' ? 'error' : 'check_circle') + '</span><span>' + esc(msg) + '</span>'; w.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 260); }, 3400);
  }

  /* ---------- Modal ---------- */
  var lastFocus = null;
  function modal(html, o) {
    o = o || {}; lastFocus = document.activeElement;
    var m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="box' + (o.wide ? ' wide' : '') + '">' + html + '</div>';
    function close() { m.remove(); if (o.onClose) o.onClose(); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} }
    m.close = close;
    m.addEventListener('mousedown', function (e) { if (e.target === m && !o.sticky) close(); });
    document.body.appendChild(m);
    on(m, 'click', '[data-close]', close);
    var f = $('input:not([type=hidden]),select,textarea,button.btn-pri', m); if (f && !o.noFocus) f.focus();
    if (o.onMount) o.onMount(m, close);
    return m;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $$('.srch').forEach(function (n) { n.remove(); }); var ms = $$('.modal'); if (ms.length) ms[ms.length - 1].close ? ms[ms.length - 1].close() : ms[ms.length - 1].remove(); $$('.pop').forEach(function (p) { p.remove(); }); } });
  function confirmBox(o) {
    return new Promise(function (res) {
      var m = modal('<h3>' + esc(o.title) + '</h3><p class="sub">' + (o.html || esc(o.text || '')) + '</p>' + (o.typeWord ? '<label class="lbl">Gõ <b>' + esc(o.typeWord) + '</b> để xác nhận</label><input class="field" id="cf-word" autocomplete="off">' : '') +
        '<div class="row"><button class="btn" data-close>' + esc(o.cancel || 'Hủy') + '</button><button class="btn ' + (o.danger ? 'btn-danger' : 'btn-pri') + '" id="cf-ok">' + esc(o.ok || 'Xác nhận') + '</button></div>', { onClose: function () { res(false); } });
      $('#cf-ok', m).addEventListener('click', function () { if (o.typeWord && $('#cf-word', m).value.trim() !== o.typeWord) { toast('Chưa gõ đúng "' + o.typeWord + '"', 'err'); return; } m.close = function () { m.remove(); }; m.remove(); res(true); });
    });
  }
  function pop(anchor, html) {
    $$('.pop').forEach(function (n) { n.remove(); });
    var p = document.createElement('div'); p.className = 'pop'; p.innerHTML = html; document.body.appendChild(p);
    var r = anchor.getBoundingClientRect(); p.style.top = (r.bottom + 8) + 'px'; p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + 'px';
    p.addEventListener('click', function (e) { e.stopPropagation(); });
    setTimeout(function () { document.addEventListener('click', function c() { p.remove(); document.removeEventListener('click', c); }); }, 0);
    return p;
  }

  /* ---------- Biểu đồ SVG ---------- */
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function lineChart(o) {
    var pts = (o.points || []).filter(function (p) { return p.y != null; });
    if (!pts.length) return '<div class="empty"><span class="material-symbols-outlined">show_chart</span><p>' + esc(o.empty || 'Chưa có dữ liệu để vẽ biểu đồ.') + '</p></div>';
    var W = 640, H = o.height || 220, L = 44, R = 16, T = 14, B = 30, vals = pts.map(function (p) { return p.y; }); if (o.goal != null) vals.push(o.goal);
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), pad = Math.max((mx - mn) * 0.15, 0.5); mn -= pad; mx += pad;
    var X = function (i) { return L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)); }, Y = function (v) { return T + (mx - v) / (mx - mn) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(o.label || 'Biểu đồ đường') + '" style="max-width:100%;height:auto">';
    for (var g = 0; g <= 4; g++) { var gv = mn + (mx - mn) * g / 4, gy = Y(gv); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="rgb(var(--outline-variant))" stroke-dasharray="3 4"/><text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="rgb(var(--on-surface-variant))">' + (Math.round(gv * 10) / 10) + '</text>'; }
    if (o.goal != null) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(o.goal) + '" y2="' + Y(o.goal) + '" stroke="rgb(var(--success))" stroke-width="1.5" stroke-dasharray="6 4"/><text x="' + (W - R) + '" y="' + (Y(o.goal) - 5) + '" text-anchor="end" font-size="11" font-weight="700" fill="rgb(var(--success))">Mục tiêu ' + o.goal + (o.unit || '') + '</text>';
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i) + ' ' + Y(p.y); }).join(' ');
    s += '<path d="' + d + ' L' + X(pts.length - 1) + ' ' + (H - B) + ' L' + X(0) + ' ' + (H - B) + ' Z" fill="rgb(var(--primary) / .10)"/><path d="' + d + '" fill="none" stroke="rgb(var(--primary))" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    var step = Math.ceil(pts.length / 8);
    pts.forEach(function (p, i) { s += '<circle cx="' + X(i) + '" cy="' + Y(p.y) + '" r="4" fill="rgb(var(--surface-container-lowest))" stroke="rgb(var(--primary))" stroke-width="2.5"><title>' + esc(p.label + ': ' + p.y + (o.unit || '')) + '</title></circle>'; if (i % step === 0 || i === pts.length - 1) s += '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="rgb(var(--on-surface-variant))">' + esc(p.label) + '</text>'; });
    return s + '</svg>';
  }
  function barChart(o) {
    var bars = o.bars || [], W = 640, H = o.height || 200, L = 36, R = 10, T = 14, B = 28;
    if (!bars.length || bars.every(function (b) { return !b.value && !b.ref; })) return '<div class="empty"><span class="material-symbols-outlined">bar_chart</span><p>' + esc(o.empty || 'Chưa có dữ liệu.') + '</p></div>';
    var mx = niceMax(Math.max.apply(null, bars.map(function (b) { return Math.max(b.value || 0, b.ref || 0); })) * 1.1), bw = (W - L - R) / bars.length;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(o.label || 'Biểu đồ cột') + '" style="max-width:100%;height:auto">';
    for (var g = 0; g <= 4; g++) { var gy = T + (H - T - B) * g / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="rgb(var(--outline-variant))" stroke-dasharray="3 4"/><text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="rgb(var(--on-surface-variant))">' + Math.round(mx * (1 - g / 4) * 10) / 10 + '</text>'; }
    bars.forEach(function (b, i) {
      var x = L + i * bw, h = (H - T - B) * (b.value || 0) / mx, y = H - B - h, rh = (H - T - B) * (b.ref || 0) / mx;
      if (b.ref) s += '<rect x="' + (x + bw * 0.12) + '" y="' + (H - B - rh) + '" width="' + bw * 0.76 + '" height="' + rh + '" rx="6" fill="rgb(var(--surface-container-high))"/>';
      s += '<rect x="' + (x + bw * 0.24) + '" y="' + y + '" width="' + bw * 0.52 + '" height="' + Math.max(h, 0) + '" rx="6" fill="rgb(var(--primary))"><title>' + esc(b.label + ': ' + (b.value || 0) + (o.unit || '') + (b.ref ? ' / kế hoạch ' + b.ref : '')) + '</title></rect><text x="' + (x + bw / 2) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="11" fill="rgb(var(--on-surface-variant))">' + esc(b.label) + '</text>';
    });
    return s + '</svg>';
  }
  function ring(pct, size, label, sub) {
    size = size || 110; var r = size / 2 - 9, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct || 0));
    return '<div style="position:relative;width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(label || '') + ' ' + v + '%"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgb(var(--surface-container-high))" stroke-width="9"/><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgb(var(--primary))" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + c * (1 - v / 100) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-size:' + size / 4.2 + 'px">' + v + '%</b>' + (sub ? '<span style="font-size:10px;color:rgb(var(--on-surface-variant))">' + esc(sub) + '</span>' : '') + '</div></div>';
  }

  /* ---------- Thành phần tái sử dụng ---------- */
  function alertBox(level, title, text, extra) { var ic = { 1: 'check_circle', 2: 'warning', 3: 'error', info: 'info' }[level]; return '<div class="alert alert-' + level + '" role="alert"><span class="material-symbols-outlined fill">' + ic + '</span><div><b>' + esc(title) + '</b><div>' + text + '</div>' + (extra || '') + '</div></div>'; }
  function riskBadge(l) { return '<span class="badge ' + (l === 1 ? 'b-ok' : l === 2 ? 'b-warn' : 'b-err') + '">' + (l === 1 ? 'Mức 1 – Tiến bộ tốt' : l === 2 ? 'Mức 2 – Lưu ý' : 'Mức 3 – Cảnh báo cao') + '</span>'; }
  function riskPanel(r) { return alertBox(r.level, r.title, '<ul style="margin:6px 0 6px 18px;list-style:disc">' + r.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + esc(r.advice), '<div style="font-size:12px;opacity:.85;margin-top:6px">' + esc(r.disclaimer) + '</div>'); }
  function empty(icon, title, text, btn) { return '<div class="empty"><span class="material-symbols-outlined">' + icon + '</span><p style="font-weight:700;margin:8px 0 2px">' + esc(title) + '</p><p style="font-size:14px">' + esc(text || '') + '</p>' + (btn || '') + '</div>'; }
  function skeleton(n) { var s = ''; for (var i = 0; i < (n || 3); i++) s += '<div class="skel" style="height:90px;margin-bottom:12px"></div>'; return s; }
  function exTile(ex, size) { return '<div class="tile" style="width:' + (size || 56) + 'px;height:' + (size || 56) + 'px;flex:none"><span class="material-symbols-outlined pulse-fig" style="font-size:' + (size || 56) * 0.5 + 'px">' + (D.CAT_ICON[ex.cat] || 'fitness_center') + '</span></div>'; }
  function exLabel(e) { var x = D.exById(e.id); if (!x) return ''; return e.kind === 'time' ? e.sets + ' hiệp × ' + (e.amt >= 120 ? Math.round(e.amt / 60) + ' phút' : e.amt + ' giây') : e.sets + ' hiệp × ' + e.amt + ' lần'; }
  function changeList(changes) {
    if (!changes || !changes.length) return '<p class="sub">Không có thay đổi.</p>';
    return changes.map(function (c) { return '<div class="card-flat" style="margin-bottom:8px"><div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + (c.day ? esc(c.day) + ' · ' : '') + 'Điều gì đã thay đổi?</div><div style="font-weight:700;margin:2px 0"><span style="text-decoration:line-through;opacity:.7">' + esc(c.from) + '</span> → ' + esc(c.to) + '</div><div style="font-size:13px"><b>Tại sao:</b> ' + esc(c.why) + '</div><div style="font-size:13px"><b>Lợi ích / lưu ý:</b> ' + esc(c.benefit || '') + '</div></div>'; }).join('');
  }

  /* ---------- video mô phỏng bài tập (tệp lưu IndexedDB hoặc liên kết YouTube/mp4) ---------- */
  function ytId(u) { var m = String(u || '').match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : ''; }
  function okVideoUrl(u) { u = String(u || '').trim(); return !u || !!ytId(u) || /^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(u); }
  function hasExVideo(x) { return !!(x && (x.videoKey || (x.videoUrl && okVideoUrl(x.videoUrl)))); }
  function exVideoHtml(x, o) {
    o = o || {}; var attr = (o.auto ? ' data-auto="1"' : '') + (o.muted ? ' data-muted="1"' : '') + (o.loop ? ' data-loop="1"' : '');
    if (x.videoKey) return '<div class="exv" data-exv="' + esc(x.videoKey) + '"' + attr + ' style="min-height:120px;display:grid;place-items:center;border-radius:14px;background:rgb(var(--surface-container))"><span class="sub" style="margin:0">Đang tải video…</span></div>';
    var y = ytId(x.videoUrl); if (y) return '<div style="position:relative;padding-top:56.25%;border-radius:14px;overflow:hidden;background:#000"><iframe src="https://www.youtube.com/embed/' + y + (o.auto ? '?autoplay=1&mute=1&loop=1&playlist=' + y : '') + '" title="Video mô phỏng: ' + esc(x.name) + '" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>';
    if (x.videoUrl && okVideoUrl(x.videoUrl)) return '<video controls playsinline preload="metadata" ' + (o.auto ? 'autoplay ' : '') + (o.muted ? 'muted ' : '') + (o.loop ? 'loop ' : '') + 'src="' + esc(x.videoUrl) + '" style="width:100%;max-height:360px;border-radius:14px;background:#000"></video>';
    return '';
  }
  function exVideoMount(el) {
    [].forEach.call((el || document).querySelectorAll('[data-exv]'), function (box) {
      if (box.dataset.done) return; box.dataset.done = '1'; var M = root.DISCI.media;
      if (!M) { box.innerHTML = '<span class="sub" style="margin:0">Không tải được thư viện video.</span>'; return; }
      M.get(box.dataset.exv).then(function (b) {
        if (!b) { box.innerHTML = '<span class="sub" style="margin:0;padding:12px">Không tìm thấy video này trên thiết bị (video lưu theo từng trình duyệt).</span>'; return; }
        var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.loop = !!box.dataset.loop; v.muted = !!box.dataset.muted; v.src = URL.createObjectURL(b); v.style.cssText = 'width:100%;max-height:360px;border-radius:14px;background:#000'; box.style.display = 'block'; box.innerHTML = ''; box.appendChild(v);
        if (box.dataset.auto) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      }, function () { box.innerHTML = '<span class="sub" style="margin:0;padding:12px">Không đọc được video.</span>'; });
    });
  }
  function exerciseModal(id) {
    var x = D.exById(id); if (!x) return;
    var amt = x.kind === 'time' ? x.sets + ' hiệp × ' + x.amt + ' giây' : x.sets + ' hiệp × ' + x.amt + ' lần';
    var warn = '<div class="alert alert-info" style="margin-top:12px"><span class="material-symbols-outlined">info</span><div style="font-size:13px">Thư viện chỉ là nguồn tham khảo. Không phải bài tập nào cũng phù hợp với thể trạng của bạn – hãy dừng nếu thấy đau.</div></div>';
    var mm = modal('<div style="display:flex;gap:14px;align-items:center">' + exTile(x, 64) + '<div><h3 style="margin:0">' + esc(x.name) + '</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="badge b-info">' + D.CATS[x.cat] + '</span><span class="badge b-mute">Mức: ' + D.LEVELS[x.level] + '</span><span class="badge b-mute">' + amt + ' · nghỉ ' + x.rest + 's</span></div></div></div>' +
      '<div style="margin-top:12px">' + (hasExVideo(x) ? '<b style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><span class="material-symbols-outlined">play_circle</span>Video mô phỏng</b>' + exVideoHtml(x) : '<div class="card-flat" style="display:flex;gap:8px;align-items:center"><span class="material-symbols-outlined">videocam_off</span><span class="sub" style="margin:0">Chưa có video mô phỏng cho bài này – xem hướng dẫn tư thế bên dưới.</span></div>') + '</div>' +
      '<p class="sub" style="margin-top:12px"><b>Nhóm cơ tác động:</b> ' + esc(x.muscles) + '<br><b>Dụng cụ:</b> ' + x.equip.map(function (q) { return D.EQUIP[q]; }).join(', ') + (x.quiet ? '<br><span class="badge b-ok">Êm – phù hợp phòng nhỏ</span>' : '<br><span class="badge b-warn">Có thể gây ồn</span>') + '</p>' +
      (x.warn ? '<div class="alert alert-2"><span class="material-symbols-outlined">warning</span><div>' + esc(x.warn) + '</div></div>' : '') +
      '<h4 style="margin:12px 0 4px;font-weight:800">Hướng dẫn tư thế</h4><ol style="margin-left:18px;list-style:decimal;font-size:14px;line-height:22px">' + x.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h4 style="margin:12px 0 4px;font-weight:800">Lỗi thường gặp</h4><ul style="margin-left:18px;list-style:disc;font-size:14px">' + x.mistakes.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' + warn +
      (hasExVideo(x) ? '' : '<p style="font-size:12px;color:rgb(var(--on-surface-variant));margin-top:8px">Quản trị viên có thể tải video mô phỏng lên từ trang quản trị.</p>') + '<div class="row"><button class="btn btn-pri" data-close>Đã hiểu</button></div>', { wide: true }); exVideoMount(mm);
  }

  /* ---------- Khung ứng dụng ---------- */
  var NAV = [['dashboard.html', 'Trang chủ', 'home', 'dashboard'], ['schedule.html', 'Lịch tập', 'calendar_month', 'schedule'], ['progress.html', 'Tiến độ', 'monitoring', 'progress'], ['store.html', 'Sản phẩm', 'storefront', 'store'], ['community.html', 'Cộng đồng', 'groups', 'community'], ['profile.html', 'Cá nhân', 'person', 'profile']];
  var ALIAS = { 'body-status': 'profile', nutrition: 'dashboard', cart: 'store', workout: 'schedule' };
  function applyTheme(t) { var dark = t === 'dark' || (t === 'system' && matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); }
  function cartCount() { return (ST.S ? ST.S.cart : []).reduce(function (s, i) { return s + i.qty; }, 0); }
  function unread() { return ST.S.notifications.filter(function (n) { return n.unread; }).length; }
  /* Tên hiển thị: bỏ phần trong ngoặc như "(demo)" và ký tự không phải chữ; chịu được tên 1 từ, dấu cách thừa */
  function cleanName(n) { return String(n == null ? '' : n).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^\p{L}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  function nameWords(n) { return cleanName(n).split(' ').filter(Boolean); }
  function firstName(n) { var w = nameWords(n); return w.length ? w[w.length - 1] : 'bạn'; }
  function initials(n) { var w = nameWords(n), c = function (x) { return Array.from(x)[0]; }; if (!w.length) return 'U'; return (w.length === 1 ? c(w[0]) : c(w[w.length - 2]) + c(w[w.length - 1])).toUpperCase(); }
  function shell(page, title) {
    var active = ALIAS[page] || page, p = ST.S.profile, ini = initials(p.name), PL = root.DISCI.plat, SITE = PL ? PL.cfg().site : { brand: 'DISCI', tagline: 'Tập luyện cá nhân hóa, chi phí thấp', navHidden: [], footer: '' };
    var NAVX = NAV.filter(function (n) { return (SITE.navHidden || []).indexOf(n[3]) < 0; });
    var LB = SITE.navLabels || {}, lab = function (n) { return esc(LB[n[3]] || n[1]); }, CU = (SITE.navCustom || []).filter(function (c) { return c && c.label && safeHref(c.href); }).slice(0, 3);
    var nav = NAVX.map(function (n) { return '<a href="' + n[0] + '" class="' + (n[3] === active ? 'on' : '') + '"' + (n[3] === active ? ' aria-current="page"' : '') + '>' + lab(n) + '</a>'; }).join('') + CU.map(function (c) { return '<a href="' + esc(safeHref(c.href)) + '">' + esc(c.label) + '</a>'; }).join('');
    var bottom = NAVX.map(function (n) { return '<a href="' + n[0] + '" class="' + (n[3] === active ? 'on' : '') + '"><span class="material-symbols-outlined">' + n[2] + '</span>' + lab(n) + '</a>'; }).join('') + CU.map(function (c) { return '<a href="' + esc(safeHref(c.href)) + '"><span class="material-symbols-outlined">' + esc(/^[a-z_]{2,30}$/.test(c.icon || '') ? c.icon : 'link') + '</span>' + esc(c.label) + '</a>'; }).join('');
    var av = p.avatar ? '<img src="' + p.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc(ini);
    document.body.innerHTML = '<a href="#view" class="no-print" style="position:absolute;left:-999px" onfocus="this.style.left=\'8px\'">Bỏ qua điều hướng</a>' +
      '<div class="nk-util no-print"><div><span>' + esc(SITE.brand) + ' · ' + esc(SITE.tagline) + '</span><div>' + (PL && PL.isStaff() ? '<a href="admin.html" style="color:rgb(var(--accent));font-weight:700">⚙ Quản trị</a>' : '') + '<button id="u-help">Trợ giúp</button><a href="profile.html#security">Dữ liệu của tôi</a><a href="profile.html">' + esc(p.name) + '</a><button id="u-out">Đăng xuất</button></div></div></div>' +
      '<header class="nk-head no-print" id="nk-head"><div><a class="nk-logo" href="dashboard.html" aria-label="DISCI – Trang chủ">' + (PL ? PL.logoHtml(30) : '<span class="material-symbols-outlined fill" style="font-size:30px">bolt</span>') + '<b>' + esc(SITE.brand) + '</b></a>' +
      '<nav class="nk-nav" aria-label="Điều hướng chính">' + nav + '</nav>' +
      '<div class="nk-right"><button class="nk-search" id="btn-search" aria-label="Tìm kiếm"><span class="material-symbols-outlined" style="font-size:22px">search</span>Tìm kiếm</button><button class="icon-btn" id="btn-search2" aria-label="Tìm kiếm" style="display:none"><span class="material-symbols-outlined">search</span></button>' +
      '<button class="icon-btn" id="btn-theme" aria-label="Đổi chế độ sáng/tối"><span class="material-symbols-outlined">contrast</span></button><button class="icon-btn" id="btn-bell" aria-label="Thông báo"><span class="material-symbols-outlined">notifications</span></button><button class="icon-btn" id="btn-cart" aria-label="Giỏ hàng"><span class="material-symbols-outlined">shopping_bag</span></button>' +
      '<a href="profile.html" aria-label="Hồ sơ cá nhân" style="margin-left:4px;width:36px;height:36px;border-radius:50%;background:rgb(var(--primary));color:rgb(var(--on-primary));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;text-decoration:none;overflow:hidden">' + av + '</a></div></div></header>' +
      '<div id="promo" class="no-print"></div><main id="main" class="nk-main"><div id="view" class="nk-view" tabindex="-1"></div></main>' +
      '<footer class="nk-foot no-print"><div>' + (footerCols(SITE) || '<div><h4>Tính năng</h4><a href="schedule.html">Lịch tập & thư viện bài tập</a><a href="progress.html">Tiến độ</a><a href="nutrition.html">Dinh dưỡng</a><a href="store.html">Sản phẩm</a></div><div><h4>Dữ liệu & riêng tư</h4><a href="profile.html#health">Quản lý sức khỏe</a><a href="profile.html#security">Xuất / xóa dữ liệu</a><a href="body-status.html">Cập nhật thể trạng</a></div><div><h4>Hỗ trợ</h4><a href="community.html">Cộng đồng</a><a href="cart.html">Giỏ hàng & đơn demo</a><a href="profile.html#settings">Cài đặt</a></div><div><h4>DISCI</h4><p style="color:#a8a8aa;margin:0;line-height:18px">' + esc(SITE.footerAbout || 'Ứng dụng hỗ trợ luyện tập tại nhà, chi phí thấp cho người trẻ Việt Nam.') + '</p></div>') +
      '<div class="legal">' + (SITE.footer ? esc(SITE.footer) + ' · ' : '') + '© 2026 ' + esc(SITE.brand) + '. DISCI chỉ hỗ trợ luyện tập, không thay thế chẩn đoán hoặc tư vấn y tế. Dữ liệu được lưu trên thiết bị này. Giá, calo và số liệu cộng đồng là tham khảo/demo.</div></div></footer>' +
      '<nav class="app-bottom no-print" aria-label="Điều hướng chính (di động)">' + bottom + '</nav>';
    refreshBadges(); wireHeader(); actBar(PL);
  }
  /* Thanh cảnh báo khi quản trị viên đang nhập vai tài khoản clone */
  function actBar(PL) {
    var ac = ST.actingAs && ST.actingAs(); if (!ac) return;
    document.body.insertAdjacentHTML('afterbegin', '<div class="as-bar no-print" id="as-bar" role="status"><span class="material-symbols-outlined">swap_horiz</span><span>Đang thao tác với tư cách <b>' + esc(ac.name) + '</b> (tài khoản clone · DEMO). Mọi hành động được ghi nhật ký dưới tên quản trị viên.</span><button class="btn btn-sm" id="as-exit">Thoát nhập vai</button></div>');
    var b = document.getElementById('as-exit'); if (b) b.onclick = function () { try { PL.stopActAs(); } catch (e) { ST.stopActAs(); } location.href = 'admin.html#demo'; };
  }
  function footerCols(SITE) {
    var cols = (SITE.footerCols || []).filter(function (c) { return c && c.title; }); if (!cols.length) return '';
    return cols.slice(0, 4).map(function (c) { return '<div><h4>' + esc(c.title) + '</h4>' + (c.links || []).map(function (l) { var h = safeHref(l.href); return h ? '<a href="' + esc(h) + '">' + esc(l.label) + '</a>' : '<span style="display:block;color:#a8a8aa;font-size:13px;margin:3px 0">' + esc(l.label) + '</span>'; }).join('') + '</div>'; }).join('') + (SITE.footerAbout ? '<div><h4>' + esc(SITE.brand) + '</h4><p style="color:#a8a8aa;margin:0;line-height:18px">' + esc(SITE.footerAbout) + '</p></div>' : '');
  }
  function setPromo(html) { var e = document.getElementById('promo'); if (e) e.innerHTML = html ? '<div class="nk-promo">' + html + '</div>' : ''; }
  /* ---------- Tìm kiếm toàn cục ---------- */
  function openSearch() {
    var o = document.createElement('div'); o.className = 'srch'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Tìm kiếm');
    var pop = ['Plank', 'Squat', 'Giảm mỡ', 'Dây kháng lực', 'Phở gà', 'Giãn cơ', 'Thảm tập', 'Cardio'];
    o.innerHTML = '<div class="top"><span class="material-symbols-outlined">search</span><input id="sq-in" placeholder="Tìm bài tập, sản phẩm, món ăn…" autocomplete="off"><button class="btn btn-sm" id="sq-x">Hủy</button></div><div class="res" id="sq-res"></div>'; document.body.appendChild(o);
    var inp = $('#sq-in', o), res = $('#sq-res', o);
    function draw(q) {
      q = q.trim().toLowerCase();
      if (!q) { res.innerHTML = '<h4>Từ khóa phổ biến</h4><div style="display:flex;gap:8px;flex-wrap:wrap">' + pop.map(function (x) { return '<button class="chip" data-pop="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>'; return; }
      var ex = D.EXERCISES.filter(function (e) { return (e.name + ' ' + e.muscles + ' ' + D.CATS[e.cat]).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      var pr = D.PRODUCTS.filter(function (e) { return (e.name + ' ' + e.desc + ' ' + D.PRODUCT_CATS[e.cat]).toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
      var ml = D.MEALS.filter(function (e) { return (e.name + ' ' + e.ing.join(' ')).toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
      var gl = Object.keys(D.GOALS).filter(function (g) { return D.GOALS[g].toLowerCase().indexOf(q) >= 0; });
      var h = '';
      if (ex.length) h += '<h4>Bài tập</h4>' + ex.map(function (e) { return '<button class="row" data-ex="' + e.id + '"><span class="tile" style="width:44px;height:44px"><span class="material-symbols-outlined">' + D.CAT_ICON[e.cat] + '</span></span><span><b>' + esc(e.name) + '</b><br><small style="color:rgb(var(--on-surface-variant))">' + D.CATS[e.cat] + ' · ' + D.LEVELS[e.level] + '</small></span></button>'; }).join('');
      if (pr.length) h += '<h4>Sản phẩm</h4>' + pr.map(function (e) { return '<button class="row" data-pr="' + esc(e.name) + '"><span class="tile" style="width:44px;height:44px"><span class="material-symbols-outlined">' + e.icon + '</span></span><span><b>' + esc(e.name) + '</b><br><small style="color:rgb(var(--on-surface-variant))">' + E.money(e.price) + '</small></span></button>'; }).join('');
      if (ml.length) h += '<h4>Món ăn</h4>' + ml.map(function (e) { return '<button class="row" data-go="nutrition.html"><span class="tile" style="width:44px;height:44px"><span class="material-symbols-outlined">' + e.icon + '</span></span><span><b>' + esc(e.name) + '</b><br><small style="color:rgb(var(--on-surface-variant))">' + e.kcal + ' kcal · đạm ' + e.protein + ' g</small></span></button>'; }).join('');
      if (gl.length) h += '<h4>Mục tiêu</h4>' + gl.map(function (g) { return '<button class="row" data-go="profile.html#goals"><b>' + D.GOALS[g] + '</b></button>'; }).join('');
      res.innerHTML = h || '<div class="empty"><span class="material-symbols-outlined">search_off</span><p>Không tìm thấy kết quả cho "' + esc(q) + '"</p></div>';
    }
    draw(''); inp.focus();
    inp.addEventListener('input', function () { draw(inp.value); });
    on(o, 'click', '[data-pop]', function (b) { inp.value = b.dataset.pop; draw(inp.value); });
    on(o, 'click', '[data-ex]', function (b) { o.remove(); exerciseModal(b.dataset.ex); });
    on(o, 'click', '[data-pr]', function (b) { go('store.html?q=' + encodeURIComponent(b.dataset.pr)); });
    on(o, 'click', '[data-go]', function (b) { go(b.dataset.go); });
    $('#sq-x', o).addEventListener('click', function () { o.remove(); });
  }
  function refreshBadges() {
    [['btn-cart', cartCount()], ['btn-bell', ST.S ? unread() : 0]].forEach(function (x) { var b = document.getElementById(x[0]); if (!b) return; var o = $('.dot', b); if (o) o.remove(); if (x[1]) { var d = document.createElement('span'); d.className = 'dot'; d.textContent = x[1] > 9 ? '9+' : x[1]; b.appendChild(d); } });
  }
  function wireHeader() {
    $('#btn-search').addEventListener('click', openSearch); $('#btn-search2').addEventListener('click', openSearch);
    var hd = $('#nk-head'); window.addEventListener('scroll', function () { hd.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });
    $('#u-help').addEventListener('click', function () { modal('<h3>Trợ giúp</h3><p class="sub">DISCI hỗ trợ luyện tập, không thay thế chẩn đoán hay tư vấn y tế. Dữ liệu được lưu trên thiết bị này; đặt mua và cộng đồng đang ở chế độ demo. Khuyến cáo của bác sĩ luôn được ưu tiên.</p><div class="row"><a class="btn" href="profile.html#security">Dữ liệu của tôi</a><button class="btn btn-pri" data-close>Đã hiểu</button></div>'); });
    $('#u-out').addEventListener('click', function () { confirmBox({ title: 'Đăng xuất?', text: 'Dữ liệu của bạn vẫn được giữ trên thiết bị.', ok: 'Đăng xuất' }).then(function (y) { if (y) { ST.logout(); location.href = 'index.html'; } }); });
    $('#btn-theme').addEventListener('click', function () { var s = ST.S.settings, order = ['light', 'dark', 'system']; s.theme = order[(order.indexOf(s.theme) + 1) % 3]; ST.save(); applyTheme(s.theme); localStorage.setItem(ST.THEME_KEY, s.theme); toast('Giao diện: ' + ({ light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống' })[s.theme]); });
    $('#btn-cart').addEventListener('click', function () { go('cart.html'); });
    $('#btn-bell').addEventListener('click', function (e) {
      e.stopPropagation(); var list = ST.S.notifications;
      var p = pop(e.currentTarget, '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px"><b>Thông báo</b><button class="btn btn-sm" id="rd-all">Đánh dấu đã đọc</button></div>' + (list.length ? list.map(function (n) { return '<div class="it ' + (n.unread ? 'unread' : '') + '" data-id="' + n.id + '"><span class="material-symbols-outlined" style="color:rgb(var(--primary))">' + esc(n.icon) + '</span><div><b>' + esc(n.t) + '</b><div>' + esc(n.d) + '</div><small style="color:rgb(var(--outline))">' + ago(n.at) + '</small></div></div>'; }).join('') : empty('notifications_off', 'Chưa có thông báo', 'Thông báo về lịch tập và cộng đồng sẽ hiện ở đây.')));
      var all = $('#rd-all', p); if (all) all.addEventListener('click', function () { list.forEach(function (n) { n.unread = false; }); ST.save(); refreshBadges(); p.remove(); });
      on(p, 'click', '.it', function (el) { var n = list.filter(function (x) { return x.id === el.dataset.id; })[0]; if (n) { n.unread = false; ST.save(); refreshBadges(); if (n.go && n.go !== location.pathname.split('/').pop()) go(n.go); else p.remove(); } });
    });
    var mq = matchMedia('(max-width:1023px)'); function ml() { var b = document.getElementById('btn-search2'); if (b) b.style.display = mq.matches ? 'inline-flex' : 'none'; } ml(); mq.addEventListener && mq.addEventListener('change', ml);
  }

  /* ---------- Nhắc lịch tập (chỉ hoạt động khi ứng dụng đang mở) ---------- */
  function checkReminder() {
    var s = ST.S; if (!s.settings.remind || !s.plan) return;
    var t = ST.today(), now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
    if (now < s.settings.remindTime || s.reminderFired[t]) return;
    var d = ST.dayFor(t); if (!d || d.type !== 'workout' || d.status === 'done') return;
    s.reminderFired = {}; s.reminderFired[t] = 1; ST.notify('alarm', 'Đến giờ tập rồi!', d.title + ' – ' + d.minutes + ' phút đang chờ bạn.', 'schedule.html'); refreshBadges(); toast('Nhắc lịch: ' + d.title + ' hôm nay');
    if (s.settings.notifyPush && 'Notification' in window && Notification.permission === 'granted') try { new Notification('DISCI – Đến giờ tập', { body: d.title }); } catch (e) {}
  }


  /* ---------- Hiệu ứng xuất hiện khi cuộn (an toàn: không có IntersectionObserver thì hiện ngay) ---------- */
  function reveal(root) {
    var all = $$('.nk-sect,.nk-stat,.nk-day,.nk-feat,.nk-sport,.nk-pcard,.card,.nk-spot', root), els = all.filter(function (e) { return !all.some(function (o) { return o !== e && o.contains(e); }); });
    if (!('IntersectionObserver' in window) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (e, i) { e.setAttribute('data-rv', ''); e.style.setProperty('--d', Math.min(i % 6, 5) * 60 + 'ms'); io.observe(e); });
    setTimeout(function () { els.forEach(function (e) { e.classList.add('in'); }); }, 2500);
  }

  /* ---------- Khởi động trang ---------- */
  function boot(o) {
    var PL = root.DISCI.plat; document.title = (PL ? PL.brand() : 'DISCI') + ' – ' + o.title;
    if (!ST.loadUser()) { var cur = location.pathname.split('/').pop() || 'dashboard.html', next = encodeURIComponent(cur + location.search + location.hash); location.replace('index.html?' + (o.page === 'admin' ? 'mode=admin&' : '') + 'next=' + next); return; }
    if (PL && PL.maintenance()) { document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center"><div class="card" style="max-width:440px"><span class="material-symbols-outlined" style="font-size:48px;color:rgb(var(--accent))">construction</span><h2 style="font-weight:800">Đang bảo trì</h2><p class="sub">' + esc(PL.cfg().system.maintenanceMsg) + '</p><button class="btn" id="mt-out">Đăng xuất</button></div></div>'; document.getElementById('mt-out').onclick = function () { ST.logout(); location.href = 'index.html'; }; return; }
    if (!ST.S.onboarded && ST.S.profile.height && ST.S.profile.age) { ST.S.onboarded = true; ST.save(); }
    if (!ST.S.onboarded && o.page !== 'onboarding' && o.page !== 'body-status' && o.page !== 'admin') { location.replace('onboarding.html'); return; }
    if (PL && !(ST.S.settings && ST.S.settings.themeSet) && PL.cfg().site.defaultTheme && ST.S.settings.theme === 'dark' && PL.cfg().site.defaultTheme !== 'dark') ST.S.settings.theme = PL.cfg().site.defaultTheme;
    applyTheme(ST.S.settings.theme); try { localStorage.setItem(ST.THEME_KEY, ST.S.settings.theme); } catch (e) {} document.documentElement.lang = 'vi';
    var v; if (o.bare) { document.body.innerHTML = '<main id="view"></main>'; v = $('#view'); } else { shell(o.page, o.title); v = $('#view'); v.innerHTML = skeleton(3); }
    var run = function () {
      try { var r = o.render(v); if (r && r.catch) r.catch(fail); } catch (e) { fail(e); }
      if (!o.bare) try { checkReminder(); } catch (e) {}
    };
    function fail(e) { console.error(e); v.innerHTML = alertBox(3, 'Không thể hiển thị trang này', 'Đã xảy ra lỗi: ' + esc(e && e.message || e) + '. Hãy thử tải lại trang.', '<button class="btn btn-sm" style="margin-top:8px" onclick="location.reload()">Tải lại</button>'); }
    run(); try { reveal(v); } catch (e) {}
    if (PL && !o.bare) try { PL.pullNotifs(); refreshBadges(); var bn = PL.activeBanner(), pr = PL.cfg().site.promo; if (bn) setPromo('<b>' + esc(bn.title) + '</b>' + (bn.text ? ' ' + esc(bn.text) : '') + (bn.go ? '<a href="' + esc(bn.go) + '">Xem</a>' : '')); else if (pr && o.page !== 'dashboard') setPromo('<b>' + esc(pr) + '</b>'); if (o.page === 'dashboard') { if (pr && !bn) setPromo('<b>' + esc(pr) + '</b>'); if (!root.DISCI.studio) applyLayout(v); } if (o.page !== 'dashboard') pageBanner(o.page); quickEdit(o.page); if (root.DISCI.studio) root.DISCI.studio.run(o.page); } catch (e) { console.error(e); }
    if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost|http:\/\/127\.)/.test(location.href.slice(0, 22))) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  /* Bố cục trang chủ do Admin tùy chỉnh: ẩn/sắp xếp các khối theo tiêu đề (không đổi mã dựng trang) */
  var DASH_SECTIONS = ['Tổng quan thể trạng', 'Hoạt động của bạn', 'Lịch tập 7 ngày', 'Gợi ý cá nhân hóa hôm nay', 'Luyện theo nhóm cơ', 'Lối tắt'];
  function applyLayout(v) {
    var s = root.DISCI.plat.cfg().site, hidden = s.layoutHidden || [], order = (s.layoutOrder && s.layoutOrder.length ? s.layoutOrder : DASH_SECTIONS);
    if (!hidden.length && (!s.layoutOrder || !s.layoutOrder.length)) return;
    var kids = $$('#view > *', document), cur = null, groups = [], pre = [], tail = [];
    kids.forEach(function (k) { var h = k.classList.contains('nk-sect') && k.querySelector('h3'); if (h) { cur = { key: h.textContent.trim(), nodes: [k] }; groups.push(cur); } else if (cur && k.tagName !== 'P') cur.nodes.push(k); else if (cur) tail.push(k); else pre.push(k); });
    v.style.display = 'flex'; v.style.flexDirection = 'column'; pre.forEach(function (k) { k.style.order = 0; });
    groups.forEach(function (g) { var i = order.indexOf(g.key); g.nodes.forEach(function (n) { n.style.order = 10 + (i < 0 ? 50 : i); if (hidden.indexOf(g.key) >= 0) n.style.display = 'none'; }); });
    tail.forEach(function (k) { k.style.order = 999; });
  }

  /* ---------- Banner từng trang & chỉnh giao diện nhanh (chỉ tài khoản có quyền "appearance") ---------- */
  var PB_PAGES = [['store', 'Sản phẩm'], ['schedule', 'Lịch tập'], ['progress', 'Tiến độ'], ['nutrition', 'Dinh dưỡng'], ['community', 'Cộng đồng'], ['cart', 'Giỏ hàng'], ['profile', 'Cá nhân']];
  function safeHref(h) { h = String(h || '').trim(); return /^(https?:\/\/\S+|\.?\/?[\w\-]+\.html([?#]\S*)?|#\S*)$/i.test(h) ? h : ''; }
  function pageBanner(page) {
    var s = root.DISCI.plat.cfg().site, b = (s.pageBanners || {})[page]; if (!b || b.off || !(b.img || b.title || b.sub)) return;
    var main = $('#main'), view = $('#view'); if (!main || !view || $('.pg-banner', main)) return;
    var el = document.createElement('section'), img = /^data:image\//.test(b.img || '') ? b.img : '';
    el.className = 'pg-banner' + (img ? ' has-img' : '');
    el.innerHTML = '<div class="in">' + (b.title ? '<h2>' + esc(b.title) + '</h2>' : '') + (b.sub ? '<p>' + esc(b.sub) + '</p>' : '') + '</div>';
    if (img) el.firstChild.style.backgroundImage = 'linear-gradient(90deg,rgb(9 9 11/.78),rgb(9 9 11/.28)),url("' + img + '")';
    main.insertBefore(el, view);
  }
  function quickEdit(page) {
    var PL = root.DISCI.plat; if (!PL || !PL.can('appearance') || $('#qe-btn')) return;
    if (page !== 'dashboard' && !PB_PAGES.some(function (x) { return x[0] === page; })) return;
    var b = document.createElement('button'); b.id = 'qe-btn'; b.type = 'button'; b.className = 'qe-fab no-print'; b.setAttribute('aria-label', 'Chỉnh giao diện trang này');
    b.innerHTML = '<span class="material-symbols-outlined">edit</span><span>Chỉnh giao diện</span>'; b.addEventListener('click', function () { var S = root.DISCI.studio; if (S) S.menu(page, { banner: function () { quickEditOpen(page); } }); else quickEditOpen(page); }); document.body.appendChild(b);
  }
  function quickEditOpen(page) {
    var PL = root.DISCI.plat, s = PL.cfg().site, dash = page === 'dashboard', pb = (s.pageBanners || {})[page] || {}, img = dash ? s.heroImg : (pb.img || ''), name = (PB_PAGES.filter(function (x) { return x[0] === page; })[0] || [0, 'Trang chủ'])[1];
    var f = function (id, lbl, val, max) { return '<label class="lbl" for="' + id + '">' + lbl + '</label><input class="field" id="' + id + '" maxlength="' + max + '" value="' + esc(val || '') + '">'; };
    var body = dash
      ? [0, 1, 2].map(function (i) { return f('qe_h' + i, 'Dòng tiêu đề ' + (i + 1), s.heroLines[i], 30); }).join('') + f('qe_sub', 'Mô tả dưới tiêu đề', s.heroSub, 200) + f('qe_cta', 'Chữ trên nút chính (trống = tự động)', s.heroCta, 30) + f('qe_link', 'Liên kết nút (vd: store.html)', s.heroLink, 120)
      : '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;cursor:pointer"><input type="checkbox" id="qe_on" ' + (pb.off ? '' : 'checked') + '> Hiện banner trên trang này</label>' + f('qe_t', 'Tiêu đề banner', pb.title, 60) + f('qe_s', 'Mô tả banner', pb.sub, 160);
    var m = modal('<h3>Chỉnh giao diện · ' + esc(name) + '</h3><p class="sub">Thay đổi áp dụng cho mọi người dùng sau khi lưu. Ảnh tải lên được nén trước khi lưu.</p>' + body +
      f('qe_promo', 'Thanh thông báo đầu trang', s.promo, 140) + '<label class="lbl" for="qe_c1">Màu nhấn chính</label><input type="color" class="adm-color" id="qe_c1" value="' + esc(s.accent) + '">' +
      '<div class="row" style="justify-content:flex-start;margin-top:12px"><button class="btn" type="button" id="qe-up"><span class="material-symbols-outlined">upload</span>Tải ảnh banner</button><button class="btn" type="button" id="qe-rm"' + (img ? '' : ' hidden') + '>Gỡ ảnh</button></div><div id="qe-prev" class="sub">' + (img ? 'Đã có ảnh banner.' : 'Chưa dùng ảnh banner.') + '</div>' +
      '<div class="row"><a class="btn" href="admin.html#appearance">Mở trang quản trị</a><button class="btn" data-close type="button">Hủy</button><button class="btn btn-pri" type="button" id="qe-save">Lưu</button></div>', { wide: true });
    function val(id) { var e = $('#' + id, m); return e ? e.value.trim() : ''; }
    $('#qe-up', m).addEventListener('click', function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { var fl = i.files[0]; if (fl) fileToImage(fl, 1600, function (d) { img = d; $('#qe-prev', m).textContent = 'Đã chọn ảnh mới – bấm Lưu để áp dụng.'; $('#qe-rm', m).hidden = false; }); }; i.click(); });
    $('#qe-rm', m).addEventListener('click', function () { img = ''; $('#qe-prev', m).textContent = 'Sẽ gỡ ảnh khi bạn bấm Lưu.'; });
    $('#qe-save', m).addEventListener('click', function () {
      try {
        var set = function (k, v) { if (JSON.stringify(PL.cfg().site[k]) !== JSON.stringify(v)) PL.setCfg('site.' + k, v, 'chỉnh nhanh'); };
        set('promo', val('qe_promo')); set('accent', val('qe_c1') || s.accent);
        if (dash) { set('heroLines', [val('qe_h0'), val('qe_h1'), val('qe_h2')]); set('heroSub', val('qe_sub')); set('heroCta', val('qe_cta')); set('heroLink', safeHref(val('qe_link'))); set('heroImg', img); }
        else { var all = JSON.parse(JSON.stringify(PL.cfg().site.pageBanners || {})); all[page] = { img: img, title: val('qe_t'), sub: val('qe_s'), off: !$('#qe_on', m).checked }; set('pageBanners', all); }
        m.close(); toast('Đã lưu giao diện'); setTimeout(function () { location.reload(); }, 400);
      } catch (e) { toast(e.message || String(e), 'err'); }
    });
  }
  function needProfile(returnHtml) {
    return '<div class="card" style="text-align:center">' + empty('badge', 'Hoàn thiện hồ sơ để bắt đầu', 'DISCI cần chiều cao, cân nặng và tuổi để tính BMI, TDEE và tạo lịch tập phù hợp với bạn.', '<a class="btn btn-pri" style="margin-top:14px" href="body-status.html"><span class="material-symbols-outlined">monitor_weight</span>Nhập chỉ số cơ thể</a>') + '</div>';
  }
  /* Thu nhỏ ảnh ở trình duyệt rồi TẢI LÊN máy chủ; cb nhận URL ảnh (/media/…). Nếu không tải được (mất mạng…) dùng tạm data-URL để không làm gián đoạn thao tác. */
  function fileToImage(file, max, cb, purpose) {
    var r = new FileReader(); r.onload = function () { var im = new Image(); im.onload = function () {
      var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      var data = c.toDataURL('image/jpeg', 0.78), M = root.DISCI && root.DISCI.media;
      if (!M || !M.uploadImage || !c.toBlob) return cb(data);
      c.toBlob(function (b) {
        if (!b) return cb(data);
        M.uploadImage(b, purpose || 'image').then(cb, function (e) { toast((e && e.message ? e.message + ' ' : '') + 'Ảnh được giữ tạm trên thiết bị này.', 'err'); cb(data); });
      }, 'image/jpeg', 0.78);
    }; im.onerror = function () { toast('Không đọc được ảnh này', 'err'); }; im.src = r.result; }; r.readAsDataURL(file);
  }
  function download(name, text, mime) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }


  /* ---------- Check-in hằng ngày & xử lý buổi bị bỏ (dùng ở nhiều trang) ---------- */
  function checkinModal(done) {
    var c = ST.recentCheckin() || {};
    var rows = [['pain', 'Đang đau cơ/khớp'], ['fatigue', 'Mệt nhiều / ngủ không đủ'], ['chest', 'Đau tức ngực'], ['dizzy', 'Chóng mặt'], ['breath', 'Khó thở bất thường']];
    var m = modal('<h3>Hôm nay bạn thấy thế nào?</h3><p class="sub">Chọn những gì bạn đang gặp. DISCI sẽ giảm cường độ khi cần. Nếu đau ngực, chóng mặt hoặc khó thở: hãy dừng tập và hỏi bác sĩ.</p>' +
      rows.map(function (r) { return '<label style="display:flex;gap:10px;align-items:center;padding:8px 0;font-size:15px;cursor:pointer"><input type="checkbox" data-ck="' + r[0] + '"' + (c[r[0]] ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') +
      '<div class="row"><button class="btn" data-close>Hủy</button><button class="btn btn-pri" id="ck-ok">Lưu check-in</button></div>');
    $('#ck-ok', m).addEventListener('click', function () {
      var o = { date: ST.today(), at: Date.now() }; $$('[data-ck]', m).forEach(function (i) { o[i.dataset.ck] = i.checked; });
      ST.S.checkins = ST.S.checkins.filter(function (x) { return x.date !== o.date; }); ST.S.checkins.push(o); ST.S.checkins = ST.S.checkins.slice(-30); ST.save();
      var res = ST.recompute('Check-in hằng ngày'); m.close(); toast(res.changes.length ? 'Đã điều chỉnh lịch theo check-in' : 'Đã lưu check-in'); if (done) done(res);
    });
  }
  function missedModal(date, done) {
    var h = E.handleMissed(ST.dayFor(date) && ST.S.plan, date, ST.today()); if (!h) { toast('Buổi này không cần xử lý'); return; }
    var m = modal('<h3>Bạn đã bỏ buổi "' + esc(h.title) + '" ngày ' + fmtDate(date) + '</h3><p class="sub">DISCI không dồn tất cả bài tập vào ngày kế tiếp. Chọn một phương án:</p>' +
      h.options.map(function (o, i) { return '<label class="card-flat" style="display:flex;gap:10px;margin-bottom:8px;cursor:pointer"><input type="radio" name="mo" value="' + i + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + (o.type === 'move' ? 'Chuyển buổi tập' : 'Bỏ qua buổi này') + '</b><br><span style="font-size:13px">' + esc(o.why) + '</span></span></label>'; }).join('') +
      '<div class="row"><button class="btn" data-close>Để sau</button><button class="btn btn-pri" id="mo-ok">Áp dụng</button></div>');
    $('#mo-ok', m).addEventListener('click', function () {
      var o = h.options[+($('input[name=mo]:checked', m).value)], S = ST.S; S.skippedHandled = S.skippedHandled || {};
      if (o.type === 'move') S.moves[date] = o.toDate; S.skippedHandled[date] = 1;
      ST.pushHistory('Xử lý buổi bỏ lỡ ' + fmtDate(date), JSON.parse(JSON.stringify(S.plan)), [{ from: h.title + ' – ' + fmtDate(date), to: o.type === 'move' ? 'Chuyển sang ' + fmtDate(o.toDate) : 'Bỏ qua', why: o.why, benefit: 'Tránh quá tải do dồn bài.' }]);
      ST.save(); m.close(); toast(o.type === 'move' ? 'Đã chuyển buổi tập' : 'Đã bỏ qua buổi này'); if (done) done();
    });
  }

  root.DISCI.ui = { exVideoHtml: exVideoHtml, exVideoMount: exVideoMount, hasExVideo: hasExVideo, okVideoUrl: okVideoUrl, ytId: ytId, PB_PAGES: PB_PAGES, safeHref: safeHref, DASH_SECTIONS: DASH_SECTIONS, NAV: NAV, initials: initials, firstName: firstName, setPromo: setPromo, openSearch: openSearch, checkinModal: checkinModal, missedModal: missedModal, $: $, $$: $$, esc: esc, on: on, go: go, toast: toast, modal: modal, confirm: confirmBox, pop: pop, lineChart: lineChart, barChart: barChart, ring: ring, alertBox: alertBox, riskBadge: riskBadge, riskPanel: riskPanel, empty: empty, skeleton: skeleton,
    exTile: exTile, exLabel: exLabel, changeList: changeList, exerciseModal: exerciseModal, fmtDate: fmtDate, fmtDM: fmtDM, ago: ago, boot: boot, needProfile: needProfile, refreshBadges: refreshBadges, applyTheme: applyTheme, reveal: reveal, fileToImage: fileToImage, download: download, shell: shell };
  root.DISCI.toast = toast;
})(window);
