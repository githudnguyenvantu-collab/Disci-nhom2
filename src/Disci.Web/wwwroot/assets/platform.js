/* =====================================================================
   DISCI PLATFORM – lớp dữ liệu dùng chung cho Admin + Cộng đồng (v5)
   • Lưu trong localStorage khóa "disci:plat" (CÙNG công nghệ lưu trữ với phần còn lại của DISCI; không đụng tới dữ liệu cũ).
   • Bài đăng thật vẫn nằm trong dữ liệu từng người dùng (S.posts) → không mất dữ liệu cũ; nền tảng chỉ GOM lại để hiển thị chung.
   • Thích/bình luận/theo dõi/nhóm/thử thách/thông báo/nhật ký… là dữ liệu dùng chung ở đây.
   • Mọi bản ghi DEMO có cờ demo:true; bản ghi MÔ PHỎNG có thêm sim:true → luôn tách bạch với dữ liệu thật.
   GIỚI HẠN (nói rõ): chạy hoàn toàn phía trình duyệt, chưa có máy chủ. Phân quyền được kiểm tra trong mã (mọi hàm ghi đều gọi need()),
   nhưng người có quyền truy cập thiết bị/DevTools vẫn sửa được localStorage. Cần backend để bảo mật thật sự (xem docs/schema.sql).
   ===================================================================== */
(function (root) {
  'use strict';
  var D = root.DISCI_DATA, E = root.DISCI_ENGINE, ST = root.DISCI.store, KEY = 'disci:plat';
  var P = null, memo = {};

  /* ---------- tiện ích ---------- */
  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function now() { return Date.now(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function initials(n) { return (root.DISCI.ui && root.DISCI.ui.initials) ? root.DISCI.ui.initials(n) : String(n || 'U').trim().slice(0, 2).toUpperCase(); }
  function defaults() {
    var d = defaults0(); try { var pub = root.DISCI_SITE; if (pub && typeof pub === 'object') Object.keys(pub).forEach(function (k) { if (k in d.cfg.site) d.cfg.site[k] = clone(pub[k]); }); } catch (e) {} return d;
  }
  function defaults0() {
    return {
      v: 1,
      cfg: {
        site: { brand: 'DISCI', tagline: 'Tập luyện cá nhân hóa, chi phí thấp', logoIcon: 'disci', logoImg: '', accent: '#c6ff2e', accent2: '#00e5c8', heroImg: '', heroLines: ['', '', ''], heroSub: '', heroCta: '', heroLink: '', heroOverlay: 60, pageBanners: {}, loginBanners: [], loginL1: '', loginL2: '', loginIntro: '', loginOverlay: 55, loginSlideSec: 6, loginFx: 'full', font: 'inter', radius: 'normal', cardStyle: 'default', btnStyle: 'default', navLabels: {}, navCustom: [], footerCols: [], footerAbout: '', texts: {}, blocks: {}, flow: { afterRegister: 'onboarding.html', landing: { admin: 'admin.html', editor: 'admin.html', moderator: 'admin.html', user: 'dashboard.html' }, onbOff: [], cart: { ship: 30000, freeShip: 500000, pay: { cod: true, bank: true, wallet: true }, payLabels: {}, coupons: [], note: '' }, perms: {}, scripts: {} }, promo: '', footer: '', defaultTheme: 'dark', layoutHidden: [], layoutOrder: [], navHidden: [] },
        system: { allowRegister: true, maintenance: false, maintenanceMsg: 'DISCI đang bảo trì. Vui lòng quay lại sau.', showDemo: true, quickLogin: true, maxVideoMB: 50, bannedWords: ['cá độ', 'thuốc lắc'], communityOpen: true }
      },
      users: [], posts: [], likes: {}, comments: {}, shares: {}, follows: {}, groups: [], challenges: [], chOver: {}, chPart: {}, chProg: {}, stories: [],
      notifs: [], ann: [], mod: {}, reports: [], audit: [], reviews: [],
      catalog: { ex: { add: [], patch: {}, hide: [] }, meal: { add: [], patch: {}, hide: [] }, prod: { add: [], patch: {}, hide: [] } },
      sim: { on: false, script: 'daily', last: 0, steps: 0, log: [], undo: [] }, demo: { seeded: 0, seed: 0, count: 0 }
    };
  }
  function mergeDeep(t, s) { Object.keys(s).forEach(function (k) { if (t[k] === undefined) t[k] = clone(s[k]); else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') mergeDeep(t[k], s[k]); }); return t; }
  function load() { var raw = null; try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} P = mergeDeep(raw && typeof raw === 'object' ? raw : {}, defaults()); return P; }
  function save() {
    memo = {};
    try { var _n = P.notifs; P.notifs = (_n || []).filter(function (n) { return n.sim; }); var _js = JSON.stringify(P); P.notifs = _n; localStorage.setItem(KEY, _js); return true; }
    catch (e) { if (root.DISCI.toast) root.DISCI.toast('Bộ nhớ trình duyệt đã đầy – không thể lưu thay đổi nền tảng. Hãy xóa bớt dữ liệu DEMO hoặc ảnh lớn.', 'err'); return false; }
  }
  function db() { return P || load(); }
  function fresh() { memo = {}; }

  /* ---------- vai trò & phân quyền ---------- */
  var ROLES = { admin: 'Quản trị viên', editor: 'Biên tập viên', moderator: 'Kiểm duyệt viên', user: 'Người dùng' };
  var PERMS = {
    admin: ['*'],
    editor: ['admin.view', 'dashboard', 'content', 'catalog', 'community', 'appearance', 'notify'],
    moderator: ['admin.view', 'dashboard', 'content', 'reports', 'users.view', 'logs'],
    user: []
  };
  var PERM_LABEL = { 'admin.view': 'Vào trang quản trị', dashboard: 'Xem thống kê', 'users.view': 'Xem người dùng', 'users.manage': 'Quản lý tài khoản & phân quyền', content: 'Quản lý bài viết/bình luận/media', reports: 'Xử lý báo cáo', catalog: 'Bài tập · dinh dưỡng · sản phẩm', community: 'Nhóm & thử thách', appearance: 'Tùy chỉnh giao diện', notify: 'Thông báo hệ thống', demo: 'Demo Data Center', sim: 'Mô phỏng demo', system: 'Cấu hình hệ thống', logs: 'Nhật ký hệ thống' };
  function role(u) { u = u || ST.user; return u ? (u.role || 'user') : 'guest'; }
  function can(perm, u) { if (perm === 'actas') { var ru = u || ST.realUser || ST.user; return !!ru && role(ru) === 'admin' && !ru.locked; } var r = role(u), ov = r !== 'admin' && ((cfg().site.flow || {}).perms || {})[r], l = (Array.isArray(ov) ? ov : PERMS[r]) || []; return l.indexOf('*') >= 0 || l.indexOf(perm) >= 0; }
  function need(perm) { if (!can(perm)) { var e = new Error('Bạn không có quyền thực hiện thao tác này (' + (PERM_LABEL[perm] || perm) + ').'); e.code = 'forbidden'; throw e; } }
  function isStaff() { return can('admin.view'); }

  /* ---------- nhật ký ---------- */
  function log(action, target, detail) {
    var ra = ST.realUser, u = ra || ST.user; db().audit.unshift({ id: uid('a'), at: now(), by: u ? u.id : 'system', name: u ? u.name : 'Hệ thống', role: role(u), action: action, target: target || '', detail: (detail || '') + (ra && ST.user ? ' [nhập vai ' + ST.user.name + ']' : '') });
    if (P.audit.length > 600) P.audit.length = 600;
  }

  /* ---------- cấu hình giao diện / hệ thống ---------- */
  function cfg() { return db().cfg; }
  function hex2rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); if (!/^[0-9a-f]{6}$/i.test(h)) return [198, 255, 46]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v * t + b[i] * (1 - t)); }); }
  function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function applySite(o) {
    var s = Object.assign({}, cfg().site, o || {}), okHex = function (h, d) { return /^#[0-9a-f]{6}$/i.test(String(h || '')) ? h : d; }, a = hex2rgb(okHex(s.accent, '#c6ff2e')), b = hex2rgb(okHex(s.accent2, '#00e5c8')), ink = lum(a) > 0.55 ? [12, 12, 12] : [255, 255, 255], base = [9, 9, 11];
    var j = function (c) { return c.join(' '); };
    var css = ':root{--accent:' + j(a) + ';--accent-2:' + j(b) + ';--accent-ink:' + j(ink) + ';--glow:0 0 0 1px rgb(' + j(a) + '/.35),0 8px 32px rgb(' + j(a) + '/.28)}' +
      'html.dark{--primary:' + j(a) + ';--on-primary:' + j(ink) + ';--primary-container:' + j(mix(a, base, .16)) + ';--primary-fixed:' + j(mix(a, base, .1)) + ';--on-primary-container:' + j(mix(a, [255, 255, 255], .6)) + '}' +
      'html:not(.dark){--primary:' + j(mix(a, [0, 0, 0], .55)) + ';--on-primary:255 255 255}';
    css += styleCss(s);
    var el = document.getElementById('plat-style'); if (!el) { el = document.createElement('style'); el.id = 'plat-style'; (document.head || document.documentElement).appendChild(el); } el.textContent = css;
  }
  /* Chẩn đoán hiển thị: mở bất kỳ trang nào kèm ?diag=1 để xem biến màu thực tế trên trình duyệt */
  if (/[?&]diag=1/.test(location.search)) document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var p = document.createElement('span'); p.style.cssText = 'position:fixed;left:-9px;top:0;width:1px;height:1px;background:rgb(var(--accent));color:rgb(var(--accent-ink))'; document.body.appendChild(p);
      var cs = getComputedStyle(document.documentElement), rows = [['--accent', cs.getPropertyValue('--accent')], ['--accent-ink', cs.getPropertyValue('--accent-ink')], ['nền thử rgb(var(--accent))', getComputedStyle(p).backgroundColor], ['html class', document.documentElement.className], ['theme', localStorage.getItem('disci:theme')], ['cfg accent/accent2', JSON.stringify([cfg().site.accent, cfg().site.accent2])], ['forced-colors', matchMedia('(forced-colors: active)').matches], ['prefers-color-scheme dark', matchMedia('(prefers-color-scheme: dark)').matches], ['trình duyệt', navigator.userAgent.slice(0, 90)]];
      var d = document.createElement('pre'); d.style.cssText = 'position:fixed;z-index:99999;right:8px;bottom:8px;max-width:92vw;margin:0;padding:10px 12px;border-radius:10px;background:#fff;color:#000;font:12px/1.4 monospace;white-space:pre-wrap;box-shadow:0 4px 20px #0008'; d.textContent = 'DISCI chẩn đoán\n' + rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'); document.body.appendChild(d); p.remove();
      var inj = [].slice.call(document.querySelectorAll('style,link[rel=stylesheet]')).map(function (n) { return (n.tagName === 'STYLE' ? 'style#' + (n.id || '-') + ' ' + n.textContent.length + 'B ' : 'link ') + (n.href ? n.href.split('/').slice(-2).join('/') : n.className || ''); });
      var dr = document.documentElement.outerHTML.match(/darkreader|data-darkreader|nightmode|stylus|data-night/i);
      d.textContent += '\nstyle/link (' + inj.length + '):\n  ' + inj.join('\n  ') + '\nDark-mode ext: ' + (dr ? dr[0] : 'không thấy');
      document.addEventListener('pointerdown', function (e) {
        var t = e.target.closest && e.target.closest('button,a,.btn'); if (!t) return;
        var X = e.clientX, Y = e.clientY, tag0 = '<' + t.tagName.toLowerCase() + ' class="' + String(t.className).slice(0, 50) + '">'; setTimeout(function () { var n2 = t.isConnected ? t : (document.elementFromPoint(X, Y) || t); n2 = (n2.closest && n2.closest('button,a,.btn')) || n2; var c = getComputedStyle(n2), s = c.backgroundColor + ' | chữ ' + c.color + ' | opacity ' + c.opacity + ' | filter ' + c.filter + ' | focus ' + n2.matches(':focus') + ' | active ' + n2.matches(':active');
          var ex = document.getElementById('diag-press') || (function () { var x = document.createElement('pre'); x.id = 'diag-press'; x.style.cssText = d.style.cssText.replace('bottom:8px', 'top:8px').replace('right:8px', 'left:8px'); document.body.appendChild(x); return x; })();
          ex.textContent = 'NHẤN: ' + tag0 + (t.isConnected ? '' : ' (trang vẽ lại, đo phần tử ở vị trí đó: <' + n2.tagName.toLowerCase() + ' class="' + String(n2.className).slice(0, 40) + '">)') + '\nnền ' + s; }, 200);
      }, true);
    }, 1500);
  });
  var FONTS = { inter: '', system: "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", serif: "Georgia,'Times New Roman',serif", rounded: "'Nunito','Trebuchet MS','Segoe UI',system-ui,sans-serif", mono: "ui-monospace,SFMono-Regular,Consolas,monospace" };
  var RADII = { sharp: [4, 2], round: [22, 14], pill: [30, 22] }, BTNS = { pill: 999, round: 12, square: 4 };
  function styleCss(s) {
    var css = '', f = FONTS[s.font], r = RADII[s.radius], b = BTNS[s.btnStyle], c = s.cardStyle, cs = '.card,.card-flat,.nk-stat,.nk-day,.nk-sport,.nk-feat,.nk-pcard,.nk-spot,.nk-hero,.box,.pg-banner .in,.st-banner,.st-img img';
    if (f) css += ':root{--ff:' + f + ';--fd:' + f + '}body,button,input,select,textarea{font-family:' + f + '}.nk-display,h1,h2{font-family:' + f + '}';
    if (r) css += cs + '{border-radius:' + r[0] + 'px!important}.field,select.field,textarea.field,.chip{border-radius:' + r[1] + 'px!important}';
    if (b) css += '.btn{border-radius:' + b + 'px!important}';
    if (c === 'flat') css += '.card,.card-flat,.nk-stat,.nk-pcard{box-shadow:none!important;border-color:transparent!important;background:rgb(var(--surface-container))!important}';
    else if (c === 'outline') css += '.card,.card-flat,.nk-stat,.nk-pcard{box-shadow:none!important;background:transparent!important;border:1.5px solid rgb(var(--accent)/.55)!important}';
    else if (c === 'elevated') css += '.card,.card-flat,.nk-stat,.nk-pcard{border-color:transparent!important;box-shadow:0 12px 32px rgb(0 0 0/.28)!important}';
    else if (c === 'glass') css += '.card,.card-flat,.nk-stat,.nk-pcard{background:rgb(255 255 255/.06)!important;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-color:rgb(255 255 255/.14)!important}';
    return css;
  }
  function brand() { return cfg().site.brand || 'DISCI'; }
  /* LOGO CHUẨN DUY NHẤT: chữ "d" + vạch tốc độ. Dùng chung cho đăng nhập, header, admin, onboarding, favicon */
  var _mk = 0;
  function markInner(gid) {
    return '<g fill="url(#' + gid + ')"><rect x="0" y="19" width="22" height="5.5" rx="2.75"/><rect x="5" y="29" width="19" height="5.5" rx="2.75"/><rect x="10" y="39" width="16" height="5.5" rx="2.75"/></g>' +
      '<g transform="skewX(-11) translate(11 0)" fill="none" stroke="url(#' + gid + ')" stroke-width="10" stroke-linecap="round"><circle cx="40" cy="35" r="13"/><path d="M54 6v42"/></g>';
  }
  function markDefs(gid) { return '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="76" y2="52"><stop offset="0" stop-color="rgb(var(--accent))"/><stop offset="1" stop-color="#2fd36b"/></linearGradient>'; }
  function markSvg(h) {
    var gid = 'dMk' + (++_mk), hh = h || 30;
    return '<svg class="dmark" viewBox="0 0 76 56" width="' + Math.round(hh * 76 / 56) + '" height="' + hh + '" aria-hidden="true"><defs>' + markDefs(gid) + '</defs>' + markInner(gid) + '</svg>';
  }
  function logoHtml(size) {
    var s = cfg().site, sz = size || 30, ic = s.logoIcon;
    if (s.logoImg) return '<img src="' + s.logoImg + '" alt="" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:10px;object-fit:cover">';
    if (ic && ic !== 'bolt' && ic !== 'disci') return '<span class="material-symbols-outlined fill" style="font-size:' + sz + 'px">' + esc(ic) + '</span>';
    return markSvg(sz);
  }
  function maintenance() { return !!cfg().system.maintenance && role() !== 'admin'; }
  function bannedHit(text) { var w = cfg().system.bannedWords || [], t = String(text || '').toLowerCase(); return w.filter(function (x) { return x && t.indexOf(String(x).toLowerCase()) >= 0; })[0] || null; }
  /* Ảnh banner chỉ nhận: ảnh nhúng (data:image), https://, hoặc tệp ảnh trong thư mục assets/ – chặn javascript:, ký tự phá CSS/HTML */
  var IMG_MAX = 5;
  function safeImg(u) {
    u = String(u == null ? '' : u).trim(); if (!u || u.length > 4000000) return false;
    return /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u) || /^https:\/\/[^\s"'()<>\\]+$/i.test(u) || /^assets\/[\w\-.\/]+\.(jpe?g|png|webp|gif|avif)$/i.test(u);
  }
  function loginBanners() { var l = cfg().site.loginBanners; return (Array.isArray(l) ? l : []).filter(safeImg).slice(0, IMG_MAX); }
  function setCfg(path, value, why) { // path: 'site.brand'
    need(path.indexOf('system') === 0 ? 'system' : 'appearance'); var parts = path.split('.'), o = db().cfg, i;
    for (i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = value; log('cfg.update', path, why || ''); save(); applySite(); applyLimits();
  }
  function applyLimits() { if (root.DISCI.media && root.DISCI.media.LIMITS) root.DISCI.media.LIMITS.maxBytes = Math.max(1, +cfg().system.maxVideoMB || 50) * 1048576; }

  /* ---------- danh mục (bài tập · món ăn · sản phẩm) có thể chỉnh từ Admin ---------- */
  var CATKEY = { ex: 'EXERCISES', meal: 'MEALS', prod: 'PRODUCTS' };
  function applyCatalog() {
    var o = D.__orig = D.__orig || { ex: D.EXERCISES.slice(), meal: D.MEALS.slice(), prod: D.PRODUCTS.slice() };
    D.HIDDEN = D.HIDDEN || { ex: [], meal: [], prod: [] };
    Object.keys(CATKEY).forEach(function (k) {
      var c = db().catalog[k], arr = D[CATKEY[k]], out = [], hid = [];
      o[k].concat(c.add).forEach(function (it) {
        var x = c.patch[it.id] ? Object.assign({}, it, c.patch[it.id]) : it;
        if (k === 'prod' && c.add.indexOf(it) >= 0) x = Object.assign({}, x, { custom: true });
        (c.hide.indexOf(it.id) >= 0 ? hid : out).push(x);
      });
      arr.length = 0; out.forEach(function (x) { arr.push(x); }); D.HIDDEN[k] = hid;
    });
    if (!D.__exWrapped) { D.__exWrapped = 1; var f0 = D.exById, f1 = D.productById; D.exById = function (id) { return f0(id) || D.HIDDEN.ex.filter(function (e) { return e.id === id; })[0] || null; }; D.productById = function (id) { return f1(id) || D.HIDDEN.prod.filter(function (e) { return e.id === id; })[0] || null; }; }
  }
  /* ---------- đánh giá sản phẩm ---------- */
  function reviewsOf(pid) { return (db().reviews || []).filter(function (r) { return r.pid === pid; }).sort(function (a, b) { return b.at - a.at; }); }
  function reviewStats(pid) { var l = reviewsOf(pid), d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, s = 0; l.forEach(function (r) { d[r.stars]++; s += r.stars; }); return { n: l.length, avg: l.length ? s / l.length : 0, dist: d }; }
  function addReview(pid, u, stars, text, bought) {
    if (!u) throw new Error('Hãy đăng nhập để đánh giá.'); stars = Math.round(+stars); text = String(text || '').trim();
    if (!(stars >= 1 && stars <= 5)) throw new Error('Hãy chọn số sao từ 1 đến 5.');
    if (text.length < 10) throw new Error('Nội dung đánh giá cần ít nhất 10 ký tự.');
    var bad = bannedHit(text); if (bad) throw new Error('Nội dung chứa từ bị cấm: "' + bad + '".');
    var d = db(); d.reviews = d.reviews || []; var old = d.reviews.filter(function (r) { return r.pid === pid && r.uid === u.id; })[0];
    if (old) { old.stars = stars; old.text = text.slice(0, 500); old.at = now(); old.edited = true; old.bought = !!bought; save(); return old; }
    var r = { id: uid('rv'), pid: pid, uid: u.id, name: u.name, stars: stars, text: text.slice(0, 500), at: now(), bought: !!bought, demo: !!(u.demo) };
    d.reviews.push(r); save(); return r;
  }
  function delReview(id, u) {
    var d = db(), r = (d.reviews || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (!(u && r.uid === u.id) && !can('content', u)) throw new Error('Bạn không có quyền xóa đánh giá này.');
    d.reviews = d.reviews.filter(function (x) { return x.id !== id; }); if (!(u && r.uid === u.id)) log('review.delete', r.pid, (r.name || '') + ': ' + r.text.slice(0, 40)); save();
  }
  function catalogAll(k) { return D.__orig[k].concat(db().catalog[k].add).map(function (it) { var c = db().catalog[k]; return { item: c.patch[it.id] ? Object.assign({}, it, c.patch[it.id]) : it, custom: c.add.some(function (a) { return a.id === it.id; }), hidden: c.hide.indexOf(it.id) >= 0, patched: !!c.patch[it.id] }; }); }
  function catalogSave(k, item) {
    need('catalog'); var c = db().catalog[k], isAdd = c.add.some(function (a) { return a.id === item.id; }), isBase = D.__orig[k].some(function (a) { return a.id === item.id; });
    if (isAdd) c.add = c.add.map(function (a) { return a.id === item.id ? item : a; }); else if (isBase) c.patch[item.id] = item; else { c.add.push(item); }
    log('catalog.save', k + ':' + item.id, item.name); save(); applyCatalog();
  }
  function catalogHide(k, id, hide) { need('catalog'); var c = db().catalog[k], i = c.hide.indexOf(id); if (hide && i < 0) c.hide.push(id); if (!hide && i >= 0) c.hide.splice(i, 1); log(hide ? 'catalog.hide' : 'catalog.show', k + ':' + id); save(); applyCatalog(); }
  function catalogDelete(k, id) { need('catalog'); var c = db().catalog[k]; if (!c.add.some(function (a) { return a.id === id; })) throw new Error('Mục gốc của hệ thống chỉ có thể ẩn, không xóa.'); c.add = c.add.filter(function (a) { return a.id !== id; }); delete c.patch[id]; log('catalog.delete', k + ':' + id); save(); applyCatalog(); }
  function catalogRevert(k, id) { need('catalog'); delete db().catalog[k].patch[id]; log('catalog.revert', k + ':' + id); save(); applyCatalog(); }

  /* ---------- hình ảnh minh họa tạo bằng mã (avatar, ảnh bìa, ảnh bài đăng demo) – không cần tệp ngoài ---------- */
  function svgUri(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function avatarUrl(a, size) {
    if (a && a.avatar) return a.avatar;
    var h = a && a.hue != null ? a.hue : hash(a && a.id) % 360, ini = esc(initials(a && a.name));
    return svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h + ',80%,52%)"/><stop offset="1" stop-color="hsl(' + ((h + 55) % 360) + ',70%,22%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="62" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="#fff">' + ini + '</text></svg>');
  }
  function coverUrl(a) {
    if (a && a.cover) return a.cover; var h = a && a.hue != null ? a.hue : hash(a && a.id) % 360, k = hash((a && a.id) + 'c');
    var shapes = ''; for (var i = 0; i < 6; i++) shapes += '<circle cx="' + ((k >> i) % 100 * 8) + '" cy="' + ((k >> (i + 3)) % 100 * 2.2) + '" r="' + (30 + (k >> i) % 70) + '" fill="hsl(' + ((h + i * 24) % 360) + ',85%,60%)" opacity=".13"/>';
    return svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 220" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h + ',70%,30%)"/><stop offset="1" stop-color="hsl(' + ((h + 70) % 360) + ',65%,10%)"/></linearGradient></defs><rect width="800" height="220" fill="url(#g)"/>' + shapes + '<path d="M0 170 Q200 120 400 170 T800 150 V220 H0Z" fill="#000" opacity=".25"/></svg>');
  }
  function artUrl(art) { // art: { h, label, sub, kind }
    var h = art.h != null ? art.h : 120, label = esc(art.label || ''), sub = esc(art.sub || ''), k = hash(label + sub), bars = '';
    for (var i = 0; i < 9; i++) bars += '<rect x="' + (40 + i * 62) + '" y="' + (420 - (20 + (k >> i) % 90)) + '" width="38" height="' + (20 + (k >> i) % 90) + '" rx="8" fill="#fff" opacity="' + (0.08 + (i % 3) * 0.05) + '"/>';
    return svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h + ',75%,40%)"/><stop offset="1" stop-color="hsl(' + ((h + 60) % 360) + ',70%,12%)"/></linearGradient></defs><rect width="600" height="450" fill="url(#g)"/><circle cx="470" cy="110" r="150" fill="#c6ff2e" opacity=".14"/><circle cx="520" cy="60" r="70" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>' + bars +
      '<text x="40" y="120" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="58" fill="#fff">' + label + '</text><text x="42" y="168" font-family="Arial,sans-serif" font-size="26" fill="#fff" opacity=".85">' + sub + '</text></svg>');
  }

  /* ---------- người dùng/tác nhân (thật + demo + chính thức) ---------- */
  function realList() { return memo.ru || (memo.ru = ST.users()); }
  function actor(id) {
    if (memo['a' + id]) return memo['a' + id]; var r;
    if (id === 'official') r = { id: id, name: brand() + ' Official', official: true, verified: true, bio: 'Tài khoản chính thức của ' + brand() + '.', avatar: cfg().site.logoImg || '', hue: 80 };
    else {
      var d = db().users.filter(function (u) { return u.id === id; })[0];
      if (d) r = Object.assign({}, d, { demo: true });
      else {
        var u = realList().filter(function (x) { return x.id === id; })[0];
        if (!u) r = { id: id, name: 'Người dùng đã xóa', gone: true };
        else { var ud = (ST.user && ST.user.id === id) ? ST.S : ST.udataOf(id), pr = (ud && ud.profile) || {}; r = { id: id, name: u.name, avatar: pr.avatar || '', cover: pr.cover || '', bio: pr.bio || '', city: pr.city || '', goal: pr.goal, real: true, demo: !!u.demo, role: u.role || 'user', locked: !!u.locked, createdAt: u.createdAt, lastLogin: u.lastLogin }; }
      }
    }
    return (memo['a' + id] = r);
  }
  function statsOf(id) {
    var a = actor(id);
    if (a.demo && a.stats) {
      if (!a.live) return a.stats;
      var cd = (ST.user && ST.user.id === id) ? ST.S : ST.udataOf(id); if (!cd) return a.stats;
      var cs = (cd.sessions || []).filter(function (s) { return s.status === 'done'; }), cst = E.streakOf(cd.sessions || [], ST.today());
      return { streak: Math.max(a.stats.streak, cst.current), sessions: a.stats.sessions + cs.length, minutes: a.stats.minutes + cs.reduce(function (t, x) { return t + x.minutes; }, 0), points: a.stats.points + cs.length * 20 };
    }
    var ud = (ST.user && ST.user.id === id) ? ST.S : ST.udataOf(id); if (!ud) return { streak: 0, sessions: 0, minutes: 0, points: 0 };
    var ss = (ud.sessions || []).filter(function (s) { return s.status === 'done'; }), st = E.streakOf(ud.sessions || [], ST.today());
    var mins = ss.reduce(function (t, x) { return t + x.minutes; }, 0);
    return { streak: st.current, sessions: ss.length, minutes: mins, points: ss.length * 20 + st.current * 10 };
  }
  function badgesOf(s) {
    return D.BADGES.filter(function (b) { var m = b.test.match(/^(\w+)>=(\d+)$/); if (m) return (s[m[1]] || 0) >= +m[2]; return false; });
  }

  /* ---------- bài đăng: gom bài thật + bài demo/chính thức ---------- */
  function realPosts() {
    var out = [];
    realList().forEach(function (u) {
      var ud = (ST.user && ST.user.id === u.id) ? ST.S : ST.udataOf(u.id); if (!ud || !ud.posts) return;
      ud.posts.forEach(function (x) { out.push(Object.assign({}, x, { by: u.id, real: true, demo: !!u.demo })); });
    });
    db().users.forEach(function (c) { /* clone đã được admin dùng */
      if (!c.live) return; var cd = (ST.user && ST.user.id === c.id) ? ST.S : ST.udataOf(c.id); if (!cd || !cd.posts) return;
      cd.posts.forEach(function (x) { out.push(Object.assign({}, x, { by: c.id, real: true, demo: true })); });
    });
    return out;
  }
  function allPosts() { return realPosts().concat(db().posts.map(function (x) { return Object.assign({ real: false }, x); })); }
  function postById(id) { return allPosts().filter(function (x) { return x.id === id; })[0] || null; }
  function modOf(id) { return db().mod[id] || null; }
  function follows(a) { return db().follows[a] || []; }
  function isFollowing(a, b) { return follows(a).indexOf(b) >= 0; }
  function followersOf(b) { var o = db().follows; return Object.keys(o).filter(function (k) { return o[k].indexOf(b) >= 0; }); }
  function visiblePosts(me) {
    var showDemo = cfg().system.showDemo !== false, hidden = (ST.S && ST.S.hidden) || [];
    return allPosts().filter(function (x) {
      if (modOf(x.id)) return false; if (x.demo && !showDemo && x.by !== me) return false; if (hidden.indexOf(x.id) >= 0) return false;
      if (x.vis === 'private') return x.by === me; if (x.vis === 'followers') return x.by === me || isFollowing(me, x.by);
      return true;
    }).sort(function (a, b) { return b.at - a.at; });
  }
  function containsBanned(text) { return bannedHit(text); }

  /* ---------- tương tác ---------- */
  function likesOf(id) { return db().likes[id] || []; }
  function liked(id, a) { return likesOf(id).indexOf(a) >= 0; }
  function commentsOf(id) { return (db().comments[id] || []).filter(function (c) { return !c.hidden; }); }
  function sharesOf(id) { return db().shares[id] || 0; }
  function pushNotif(o) {
    var to = o.to; if (!to || to === o.from || to === 'official') return null; var ta = actor(to); if ((ta.demo && !ta.live) || ta.gone) return null;
    var n = db().notifs; if (o.type === 'like' && n.some(function (x) { return x.to === to && x.from === o.from && x.type === 'like' && x.postId === o.postId; })) return null;
    var it = { id: uid('n'), to: to, from: o.from, type: o.type, postId: o.postId || '', text: o.text || '', at: now(), sim: !!o.sim, read: false };
    n.unshift(it); if (n.length > 600) n.length = 600; return it;
  }
  function toggleLike(id, a, opt) {
    var l = db().likes[id] = db().likes[id] || [], i = l.indexOf(a), p;
    if (i >= 0) { l.splice(i, 1); save(); return false; }
    l.push(a); p = postById(id); if (p) pushNotif({ to: p.by, from: a, type: 'like', postId: id, sim: opt && opt.sim }); if (opt && opt.sim) db().sim.undo.push({ t: 'like', p: id, a: a }); save(); return true;
  }
  function addComment(id, a, text, opt) {
    text = String(text || '').trim(); if (!text) throw new Error('Hãy nhập nội dung bình luận.');
    var bad = bannedHit(text); if (bad && !(opt && opt.sim)) throw new Error('Nội dung chứa từ bị cấm: "' + bad + '".');
    var c = { id: uid('c'), by: a, text: text.slice(0, 500), at: now(), demo: !!actor(a).demo, sim: !!(opt && opt.sim) };
    (db().comments[id] = db().comments[id] || []).push(c); var p = postById(id); if (p) pushNotif({ to: p.by, from: a, type: 'comment', postId: id, text: c.text, sim: c.sim }); save(); return c;
  }
  function share(id, a) { db().shares[id] = (db().shares[id] || 0) + 1; var p = postById(id); if (p) pushNotif({ to: p.by, from: a, type: 'share', postId: id }); save(); }
  function toggleFollow(a, b, opt) {
    var f = db().follows[a] = db().follows[a] || [], i = f.indexOf(b);
    if (i >= 0) { f.splice(i, 1); save(); return false; }
    f.push(b); pushNotif({ to: b, from: a, type: 'follow', sim: opt && opt.sim }); if (opt && opt.sim) db().sim.undo.push({ t: 'follow', a: a, b: b }); save(); return true;
  }
  function reportPost(id, by, reason) { db().reports.unshift({ id: uid('r'), postId: id, by: by, reason: reason, at: now(), st: 'open' }); save(); }

  /* ---------- kiểm duyệt & quản lý nội dung ---------- */
  function modPost(id, st, reason) {
    need('content'); var p = postById(id); if (!p) throw new Error('Không tìm thấy bài viết.');
    if (st === 'ok') delete db().mod[id]; else db().mod[id] = { st: st, by: ST.user.id, reason: reason || '', at: now() };
    if (st === 'removed' && p.real) pushNotif({ to: p.by, from: 'official', type: 'mod', postId: id, text: 'Bài viết của bạn đã bị gỡ: ' + (reason || 'vi phạm nội quy cộng đồng') });
    log('post.' + st, id, (reason || '') + ' · tác giả: ' + actor(p.by).name); save();
  }
  function deleteDemoOrOfficialPost(id) {
    need('content'); var i = db().posts.findIndex ? db().posts.findIndex(function (x) { return x.id === id; }) : -1; if (i < 0) throw new Error('Chỉ xóa hẳn được bài DEMO/chính thức. Với bài của người dùng thật, hãy dùng "Gỡ bài" (có thể hoàn tác).');
    var p = db().posts[i]; if (p.videoId && root.DISCI.media) root.DISCI.media.del(p.videoId); db().posts.splice(i, 1); delete db().likes[id]; delete db().comments[id]; delete db().shares[id]; delete db().mod[id]; log('post.delete', id); save();
  }
  function modComment(postId, cid, hidden) {
    need('content'); var c = (db().comments[postId] || []).filter(function (x) { return x.id === cid; })[0]; if (!c) return; c.hidden = !!hidden; log(hidden ? 'comment.hide' : 'comment.show', cid, postId); save();
  }
  function deleteComment(postId, cid) { need('content'); db().comments[postId] = (db().comments[postId] || []).filter(function (x) { return x.id !== cid; }); log('comment.delete', cid, postId); save(); }
  function officialPost(o) {
    need('content'); var p = { id: uid('o'), by: 'official', topic: o.topic || 'Thông báo', text: o.text || '', img: o.img || '', videoId: o.videoId || '', vname: o.vname || '', vsize: o.vsize || 0, vposter: o.vposter || '', vis: 'public', at: now(), demo: false, official: true };
    db().posts.unshift(p); log('post.official', p.id, p.text.slice(0, 60)); save(); return p;
  }
  function resolveReport(id, st) { need('reports'); var r = db().reports.filter(function (x) { return x.id === id; })[0]; if (!r) return; r.st = st; r.by2 = ST.user.id; r.at2 = now(); log('report.' + st, id, r.postId); save(); }

  /* ---------- stories ---------- */
  function storyList(me) {
    var showDemo = cfg().system.showDemo !== false, t = now();
    return db().stories.filter(function (s) { return !modOf(s.id) && (s.demo ? showDemo : (t - s.at) < 864e5); }).sort(function (a, b) { return b.at - a.at; });
  }
  function addStory(o) { var s = { id: uid('s'), by: o.by, text: String(o.text || '').slice(0, 200), img: o.img || '', hue: o.hue != null ? o.hue : Math.floor(Math.random() * 360), at: now(), demo: !!o.demo, sim: !!o.sim }; db().stories.unshift(s); if (db().stories.length > 300) db().stories.length = 300; if (o.sim) db().sim.undo.push({ t: 'story', id: s.id }); save(); return s; }
  function deleteStory(id) { need('content'); db().stories = db().stories.filter(function (s) { return s.id !== id; }); log('story.delete', id); save(); }

  /* ---------- nhóm & thử thách ---------- */
  function groups() { return db().groups; }
  function groupById(id) { return db().groups.filter(function (g) { return g.id === id; })[0] || null; }
  function joinGroup(id, a, opt) { var g = groupById(id); if (!g) return false; g.members = g.members || []; var i = g.members.indexOf(a); if (i >= 0) { g.members.splice(i, 1); save(); return false; } g.members.push(a); if (opt && opt.sim) db().sim.undo.push({ t: 'group', id: id, a: a }); save(); return true; }
  function createGroup(o) { var g = { id: uid('g'), name: String(o.name || '').trim().slice(0, 60), desc: String(o.desc || '').slice(0, 300), hue: o.hue != null ? o.hue : Math.floor(Math.random() * 360), owner: o.owner, members: [o.owner], demo: !!o.demo, at: now() }; if (!g.name) throw new Error('Hãy nhập tên nhóm.'); db().groups.unshift(g); save(); return g; }
  function saveGroup(g) { need('community'); var i = db().groups.findIndex(function (x) { return x.id === g.id; }); if (i >= 0) db().groups[i] = g; else db().groups.unshift(g); log('group.save', g.id, g.name); save(); }
  function deleteGroup(id) { need('community'); db().groups = db().groups.filter(function (g) { return g.id !== id; }); log('group.delete', id); save(); }
  function challenges() {
    var base = D.CHALLENGES.map(function (c) { var o = db().chOver[c.id] || {}; return Object.assign({}, c, o, { base: true }); }), cu = db().challenges.map(function (c) { return Object.assign({ custom: true }, c); });
    return base.concat(cu).filter(function (c) { return !c.hidden; });
  }
  function challengesAll() { var base = D.CHALLENGES.map(function (c) { return Object.assign({}, c, db().chOver[c.id] || {}, { base: true }); }); return base.concat(db().challenges.map(function (c) { return Object.assign({ custom: true }, c); })); }
  function participants(id) { return db().chPart[id] || []; }
  function joinChallenge(id, a, opt) { var l = db().chPart[id] = db().chPart[id] || []; if (l.indexOf(a) < 0) { l.push(a); if (opt && opt.sim) db().sim.undo.push({ t: 'chj', id: id, a: a }); save(); } }
  function leaveChallenge(id, a) { var l = db().chPart[id] || [], i = l.indexOf(a); if (i >= 0) l.splice(i, 1); save(); }
  function saveChallenge(c) {
    need('community'); var cu = db().challenges, i = cu.findIndex(function (x) { return x.id === c.id; });
    if (D.CHALLENGES.some(function (x) { return x.id === c.id; })) db().chOver[c.id] = { name: c.name, desc: c.desc, reward: c.reward, days: c.days, goal: c.goal, hidden: !!c.hidden };
    else if (i >= 0) cu[i] = c; else cu.unshift(c);
    log('challenge.save', c.id, c.name); save();
  }
  function deleteChallenge(id) { need('community'); if (D.CHALLENGES.some(function (x) { return x.id === id; })) { db().chOver[id] = Object.assign(db().chOver[id] || {}, { hidden: true }); } else db().challenges = db().challenges.filter(function (c) { return c.id !== id; }); log('challenge.delete', id); save(); }

  /* ---------- thông báo hệ thống & đẩy về hộp thư từng người dùng ---------- */
  function addAnnouncement(o) {
    need('notify'); var a = { id: uid('an'), title: String(o.title || '').trim(), text: String(o.text || '').trim(), audience: o.audience || 'all', kind: o.kind || 'info', go: o.go || '', at: now(), until: o.until || 0, by: ST.user.id };
    if (!a.title) throw new Error('Hãy nhập tiêu đề thông báo.'); db().ann.unshift(a); log('announce.create', a.id, a.title + ' → ' + a.audience); save(); return a;
  }
  function deleteAnnouncement(id) { need('notify'); db().ann = db().ann.filter(function (a) { return a.id !== id; }); log('announce.delete', id); save(); }
  function audienceMatch(a, u) { if (a.audience === 'all') return true; if (a.audience.indexOf('role:') === 0) return role(u) === a.audience.slice(5); if (a.audience.indexOf('user:') === 0) return u.id === a.audience.slice(5); return false; }
  function activeBanner() { var u = ST.user; if (!u) return null; var t = now(); return db().ann.filter(function (a) { return a.kind === 'banner' && (!a.until || a.until > t) && audienceMatch(a, u); })[0] || null; }
  /* chạy mỗi lần mở trang: kéo thông báo tương tác + thông báo hệ thống vào chuông của người dùng hiện tại */
  function pullNotifs() {
    var S = ST.S, u = ST.user; if (!S || !u) return; S.platSeen = S.platSeen || {}; var changed = false, ICON = { like: 'favorite', comment: 'chat_bubble', share: 'share', follow: 'person_add', mod: 'gavel' }, TXT = { like: 'đã thích bài viết của bạn', comment: 'đã bình luận bài viết của bạn', share: 'đã chia sẻ bài viết của bạn', follow: 'đã bắt đầu theo dõi bạn', mod: '' };
    db().notifs.filter(function (n) { return n.to === u.id && !S.platSeen[n.id]; }).reverse().forEach(function (n) {
      S.platSeen[n.id] = 1; changed = true; var who = actor(n.from).name;
      S.notifications.unshift({ id: 'pn_' + n.id, icon: ICON[n.type] || 'notifications', t: n.type === 'mod' ? 'Thông báo từ quản trị' : who + ' ' + TXT[n.type] + (n.sim ? ' (mô phỏng)' : ''), d: n.type === 'comment' ? '“' + n.text.slice(0, 80) + '”' : (n.type === 'mod' ? n.text : ''), go: 'community.html#n', at: n.at, unread: true });
    });
    db().ann.filter(function (a) { return a.kind !== 'banner' && !S.platSeen[a.id] && audienceMatch(a, u) && (!a.until || a.until > now()); }).reverse().forEach(function (a) {
      S.platSeen[a.id] = 1; changed = true; S.notifications.unshift({ id: 'an_' + a.id, icon: 'campaign', t: a.title, d: a.text, go: a.go || '', at: a.at, unread: true });
    });
    if (changed) { S.notifications = S.notifications.slice(0, 60); ST.save(); }
  }

  /* ---------- tài khoản (Admin) ---------- */
  function actorId() { var a = ST.realUser || ST.user; return a ? a.id : null; }
  function adminCount() { return ST.users().filter(function (u) { return u.role === 'admin' && !u.locked; }).length; }
  function updateUser(id, patch, why) {
    need('users.manage'); var all = ST.users(), u = all.filter(function (x) { return x.id === id; })[0]; if (!u) throw new Error('Không tìm thấy tài khoản.');
    if (patch.role && !ROLES[patch.role]) throw new Error('Vai trò không hợp lệ.');
    var losing = (u.role === 'admin' && !u.locked) && ((patch.role && patch.role !== 'admin') || patch.locked === true);
    if (losing && adminCount() <= 1) throw new Error('Không thể hạ quyền/khóa quản trị viên cuối cùng.');
    if (id === ST.user.id && (patch.locked === true || (patch.role && patch.role !== u.role))) throw new Error('Bạn không thể tự khóa hoặc tự đổi vai trò của mình.');
    if (u.src === 'config' && (('role' in patch && patch.role !== u.role) || patch.locked === true)) throw new Error('Tài khoản quản trị gốc được khai báo trong site-config.js, không đổi vai trò/khóa tại đây.');
    if (patch.role && ST.isStaffRole(patch.role) && role(ST.realUser || ST.user) !== 'admin') throw new Error('Chỉ quản trị viên mới được cấp quyền quản trị.');
    Object.keys(patch).forEach(function (k) { u[k] = patch[k]; });
    if (patch.role) { if (ST.isStaffRole(patch.role)) u.grantedBy = actorId(); else delete u.grantedBy; }
    ST.saveUsers(all); log('user.update', id, JSON.stringify(patch) + (why ? ' · ' + why : '')); fresh();
  }
  function deleteUser(id) {
    need('users.manage'); var all = ST.users(), u = all.filter(function (x) { return x.id === id; })[0]; if (!u) return; if (id === ST.user.id) throw new Error('Bạn không thể xóa chính mình tại đây.');
    if (u.role === 'admin' && adminCount() <= 1) throw new Error('Không thể xóa quản trị viên cuối cùng.');
    if (root.DISCI.media) root.DISCI.media.clearUser(id); ST.saveUsers(all.filter(function (x) { return x.id !== id; })); try { localStorage.removeItem('disci:u:' + id); } catch (e) {}
    var d = db(); delete d.follows[id]; Object.keys(d.follows).forEach(function (k) { d.follows[k] = d.follows[k].filter(function (x) { return x !== id; }); });
    Object.keys(d.likes).forEach(function (k) { d.likes[k] = d.likes[k].filter(function (x) { return x !== id; }); }); Object.keys(d.comments).forEach(function (k) { d.comments[k] = d.comments[k].filter(function (c) { return c.by !== id; }); });
    d.groups.forEach(function (g) { g.members = (g.members || []).filter(function (x) { return x !== id; }); }); d.notifs = d.notifs.filter(function (n) { return n.to !== id && n.from !== id; }); d.stories = d.stories.filter(function (s) { return s.by !== id; });
    log('user.delete', id, u.email); save();
  }
  function tempPassword() { var a = new Uint8Array(10), cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; try { root.crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); } return 'Dc' + Array.prototype.map.call(a, function (b) { return cs.charAt(b % cs.length); }).join('') + '7'; }
  function resetUserPassword(id) {
    need('users.manage'); var u = ST.users().filter(function (x) { return x.id === id; })[0]; if (!u) throw new Error('Không tìm thấy tài khoản.'); var pw = tempPassword();
    if (u.src === 'config') throw new Error('Tài khoản quản trị gốc: đổi mật khẩu bằng tools/make-staff.py rồi cập nhật site-config.js.');
    if (ST.isStaffRole(u.role) && role(ST.realUser || ST.user) !== 'admin') throw new Error('Chỉ quản trị viên mới được đặt lại mật khẩu của nhân sự quản trị.');
    return ST.resetPasswordLocal(u.email, pw, { byAdmin: true }).then(function (r) { if (!r.ok) throw new Error(r.message); var all = ST.users(); all.forEach(function (x) { if (x.id === id) x.mustChangePw = true; }); ST.saveUsers(all); log('user.resetpw', id, u.email); save(); return pw; });
  }

  /* ---------- sao lưu / khôi phục / dung lượng ---------- */
  function exportAll() { need('system'); log('system.export', '', ''); save(); return JSON.stringify({ app: 'DISCI', kind: 'platform-backup', at: new Date().toISOString(), plat: db() }, null, 1); }
  function importAll(text) {
    need('system'); var o; try { o = JSON.parse(text); } catch (e) { throw new Error('Tệp không phải JSON hợp lệ.'); } if (!o || o.kind !== 'platform-backup' || !o.plat) throw new Error('Tệp không phải bản sao lưu nền tảng DISCI.');
    P = mergeDeep(o.plat, defaults()); log('system.import', '', 'khôi phục từ bản sao lưu'); save(); applyCatalog(); applySite();
  }
  function usage() { var total = 0, mine = 0, k; try { for (k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) { var n = (localStorage[k] || '').length * 2; total += n; if (k === KEY) mine = n; } } catch (e) {} return { total: total, plat: mine, limit: 5 * 1048576 }; }

  /* ---------- trình phát clip minh họa (canvas, không cần tệp video) ---------- */
  var JOINTS = ['head', 'neck', 'hip', 'kneeL', 'footL', 'kneeR', 'footR', 'elbowL', 'handL', 'elbowR', 'handR'];
  function P_(a) { var o = {}; JOINTS.forEach(function (j, i) { o[j] = [a[i * 2], a[i * 2 + 1]]; }); return o; }
  function swapLR(p) { var o = {}; JOINTS.forEach(function (j) { var k = j.replace(/L$/, '#').replace(/R$/, 'L').replace(/#$/, 'R'); o[j] = p[k] || p[j]; }); return o; }
  var STAND = P_([50, 22, 50, 32, 50, 64, 51, 86, 53, 108, 49, 86, 47, 108, 52, 48, 56, 62, 48, 48, 44, 62]);
  var CLIPS = {
    squat: { name: 'Squat', sub: 'Chân rộng bằng vai · lưng thẳng', seq: [STAND, P_([60, 44, 56, 54, 40, 82, 62, 86, 52, 108, 58, 86, 44, 108, 66, 56, 76, 54, 62, 56, 72, 52])], met: 5 },
    pushup: { name: 'Hít đất', sub: 'Thân thẳng · hạ ngực sát sàn', seq: [P_([80, 56, 70, 60, 40, 80, 25, 91, 10, 102, 25, 91, 10, 102, 70, 84, 72, 106, 70, 84, 72, 106]), P_([80, 88, 70, 92, 40, 96, 25, 100, 10, 104, 25, 100, 10, 104, 58, 100, 72, 106, 58, 100, 72, 106])], met: 4 },
    plank: { name: 'Plank', sub: 'Siết bụng · giữ thân thẳng', seq: [P_([76, 74, 66, 78, 38, 88, 24, 96, 10, 104, 24, 96, 10, 104, 66, 104, 76, 106, 66, 104, 76, 106]), P_([76, 73, 66, 77, 38, 86, 24, 95, 10, 104, 24, 95, 10, 104, 66, 104, 76, 106, 66, 104, 76, 106])], met: 3.5 },
    jack: { name: 'Jumping jack', sub: 'Khởi động toàn thân', seq: [P_([50, 18, 50, 30, 50, 62, 46, 84, 45, 106, 54, 84, 55, 106, 42, 44, 40, 62, 58, 44, 60, 62]), P_([50, 14, 50, 26, 50, 58, 34, 82, 26, 106, 66, 82, 74, 106, 34, 22, 28, 6, 66, 22, 72, 6])], met: 7 },
    lunge: { name: 'Lunge', sub: 'Gối trước không vượt mũi chân', seq: [STAND, P_([52, 42, 52, 52, 50, 82, 70, 84, 72, 108, 36, 100, 22, 106, 55, 66, 56, 78, 49, 66, 50, 78])], met: 4.5 },
    knees: { name: 'Nâng gối cao', sub: 'Nhịp đều · tay đánh nhẹ', seq: [STAND, P_([50, 22, 50, 32, 50, 64, 66, 66, 62, 84, 49, 86, 47, 108, 58, 52, 66, 46, 44, 50, 36, 58]), STAND, swapLR(P_([50, 22, 50, 32, 50, 64, 66, 66, 62, 84, 49, 86, 47, 108, 58, 52, 66, 46, 44, 50, 36, 58]))], met: 8 }
  };
  var CLIP_KEYS = Object.keys(CLIPS);
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function poseAt(seq, t) { var n = seq.length, x = (t % 1) * n, i = Math.floor(x), f = ease(x - i), A = seq[i % n], B = seq[(i + 1) % n], o = {}; JOINTS.forEach(function (j) { o[j] = [A[j][0] + (B[j][0] - A[j][0]) * f, A[j][1] + (B[j][1] - A[j][1]) * f]; }); return o; }
  function mountClip(canvas, key, opt) {
    opt = opt || {}; var c = CLIPS[key] || CLIPS.squat, ctx = canvas.getContext && canvas.getContext('2d'), raf = 0, playing = false, t0 = 0, acc = (opt.start || 0), last = 0, DUR = opt.dur || 30, period = c.seq.length * 0.8, ac = cfg().site.accent;
    var W = canvas.width = opt.w || 480, H = canvas.height = opt.h || 600, k = W / 100;
    function draw(sec) {
      if (!ctx) return; var ph = (sec / period), p = poseAt(c.seq, ph), reps = Math.floor(sec / period) + 1;
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#16161c'); g.addColorStop(1, '#09090b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var rg = ctx.createRadialGradient(W * .8, H * .1, 10, W * .8, H * .1, W * .9); rg.addColorStop(0, ac + '55'); rg.addColorStop(1, 'transparent'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(0, H * .08); ctx.scale(k, k * .98);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(4, 109); ctx.lineTo(96, 109); ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      function bone(a, b, alpha) { ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(p[a][0], p[a][1]); ctx.lineTo(p[b][0], p[b][1]); ctx.stroke(); }
      ctx.shadowColor = ac; ctx.shadowBlur = 10; ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; bone('neck', 'elbowR', .55); bone('elbowR', 'handR', .55); bone('hip', 'kneeR', .55); bone('kneeR', 'footR', .55);
      ctx.strokeStyle = ac; bone('neck', 'hip', 1); bone('hip', 'kneeL', 1); bone('kneeL', 'footL', 1); bone('neck', 'elbowL', 1); bone('elbowL', 'handL', 1);
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.head[0], p.head[1], 6, 0, 6.2832); ctx.fillStyle = '#09090b'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(W * .085) + 'px Arial Black,Arial,sans-serif'; ctx.fillText(c.name.toUpperCase(), W * .07, H * .1);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = Math.round(W * .038) + 'px Arial,sans-serif'; ctx.fillText(c.sub, W * .07, H * .1 + W * .06);
      ctx.fillStyle = ac; ctx.font = '800 ' + Math.round(W * .1) + 'px Arial,sans-serif'; ctx.fillText(String(reps), W * .07, H * .93); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = Math.round(W * .035) + 'px Arial,sans-serif'; ctx.fillText('lần · clip minh họa tạo bằng mã', W * .07 + W * .1 + String(reps).length * W * .04, H * .93);
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = ac; ctx.fillRect(0, H - 6, W * ((sec % DUR) / DUR), 6);
    }
    function frame(ts) { if (!playing) return; if (!t0) t0 = ts; var dt = (ts - t0) / 1000; t0 = ts; acc += dt; last = acc; draw(acc); raf = requestAnimationFrame(frame); }
    var api = {
      play: function () { if (playing) return; playing = true; t0 = 0; raf = requestAnimationFrame(frame); canvas.dataset.playing = '1'; if (opt.onState) opt.onState(true); },
      pause: function () { playing = false; cancelAnimationFrame(raf); canvas.dataset.playing = '0'; if (opt.onState) opt.onState(false); },
      toggle: function () { playing ? api.pause() : api.play(); }, isPlaying: function () { return playing; }, draw: function () { draw(last || acc); }, name: c.name
    };
    draw(acc); return api;
  }
  /* gắn trình phát vào mọi canvas[data-clip] trong vùng root; tự phát khi hiện ra, tự dừng khi ra khỏi màn hình */
  function hydrateClips(rootEl, autoplay) {
    var list = Array.prototype.slice.call(rootEl.querySelectorAll('canvas[data-clip]')); var reduce = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.forEach(function (cv) {
      if (cv.__clip) return; var w = cv.closest('.clipbox'), ico = w && w.querySelector('.clip-ic'); var api = cv.__clip = mountClip(cv, cv.dataset.clip, { w: +cv.dataset.w || 480, h: +cv.dataset.h || 600, start: hash(cv.dataset.clip + (cv.id || '')) % 8, onState: function (on) { if (ico) ico.textContent = on ? 'pause' : 'play_arrow'; if (w) w.classList.toggle('paused', !on); } });
      if (w) w.addEventListener('click', function () { api.toggle(); });
      if (!('IntersectionObserver' in root) || reduce) { if (!reduce && autoplay !== false) api.play(); return; }
      new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting && autoplay !== false) api.play(); else api.pause(); }); }, { threshold: .5 }).observe(cv);
    });
  }
  function clipHtml(key, id) { var c = CLIPS[key] || CLIPS.squat; return '<div class="clipbox paused" role="button" tabindex="0" aria-label="Clip minh họa ' + esc(c.name) + ' – bấm để phát/dừng"><canvas data-clip="' + esc(key) + '" id="' + esc(id || '') + '" data-w="480" data-h="600"></canvas><span class="material-symbols-outlined clip-ic" aria-hidden="true">play_arrow</span><span class="clip-tag">CLIP MINH HỌA</span></div>'; }

  /* ---------- nhập vai tài khoản clone (chỉ admin) ---------- */
  function actAs(id) {
    if (!can('actas')) { var e = new Error('Chỉ tài khoản quản trị mới được dùng tài khoản clone.'); e.code = 'forbidden'; throw e; }
    var d = db().users.filter(function (u) { return u.id === id; })[0]; if (!d) throw new Error('Không tìm thấy tài khoản clone này.');
    ST.startActAs(id); d.live = true; log('demo.actas.start', id, d.name); save(); memo = {}; return d;
  }
  function stopActAs() { var c = ST.actingAs(); if (!c) return; log('demo.actas.end', c.id, c.name); save(); ST.stopActAs(); memo = {}; }

  /* ---------- CỘNG ĐỒNG: kết nối máy chủ (bản ASP.NET Core MVC) ----------
     Dữ liệu dùng chung (bài viết của mọi người, thích, bình luận, theo dõi, nhóm, thử thách, thông báo) nằm trong SQL Server.
     Trình duyệt nhận "ảnh chụp" qua /api/community/snapshot (máy chủ đã lọc theo quyền xem), thao tác tức thì ở máy rồi gửi hành động lên máy chủ.
     Máy chủ là nguồn sự thật: hành động bị từ chối thì khôi phục lại bằng ảnh chụp mới. Phần quản trị (kiểm duyệt, cấu hình, mô phỏng, nội dung DEMO) vẫn ở dữ liệu cục bộ cho tới Lượt 4. */
  var AD = { loaded: false, loading: null, users: [], byId: {}, posts: [], serverPosts: {}, backups: [] };
  var CM = { loaded: false, loading: null, users: [], byId: {}, stats: {}, posts: [], notifsAt: 0 };
  function cmMe() { return ST.user && ST.user.id; }
  function cmReq(method, url, body) {
    var init = { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': root.DISCI_CSRF || '' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return root.fetch(url, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.__status = r.status; return j; }); });
  }
  function cmToast(m) { try { if (root.DISCI.toast) root.DISCI.toast(m, 'err'); } catch (e) {} }
  function cmIsRealUser(id) { return !!CM.byId[id]; }
  function cmServerPost(id) { var me = cmMe(); return CM.posts.some(function (p) { return p.id === id; }) || !!(ST.S && ST.S.posts && ST.S.posts.some(function (p) { return p.id === id; }) && me); }

function cmStories(arr) { return (arr || []).map(function (s) { return { id: s.id, by: s.by, text: s.text || '', img: s.img || '', hue: s.hue || 0, at: s.at, demo: false, sim: false }; }); }
  function cmKeepLocalStories() { return (db().stories || []).filter(function (s) { return s.demo || s.sim; }); }
  function cmAnn(j) { if (j.announcements && !AD.loaded) db().ann = j.announcements.map(function (a) { return { id: a.id, title: a.title, text: a.text || '', audience: a.audience, kind: a.kind, go: a.go || '', at: a.at, until: a.until || 0, by: '' }; }); }
  function applySnapshot(j) {
    var d = db(), me = cmMe();
    CM.users = j.users || []; CM.byId = {}; CM.users.forEach(function (u) { CM.byId[u.id] = u; }); CM.stats = j.stats || {}; CM.posts = j.posts || [];
    (CM.posts).forEach(function (p) { var id = p.id; d.likes[id] = (j.likes || {})[id] || []; d.comments[id] = (j.comments || {})[id] || []; d.shares[id] = (j.shares || {})[id] || 0; });
    var sf = j.follows || {}, keepMine = (d.follows[me] || []).filter(function (x) { return !CM.byId[x]; });
    Object.keys(CM.byId).forEach(function (uid) { d.follows[uid] = (sf[uid] || []).slice(); });
    if (me) d.follows[me] = (d.follows[me] || []).concat(keepMine.filter(function (x) { return (d.follows[me] || []).indexOf(x) < 0; }));
    var gids = {}; (j.groups || []).forEach(function (g) { gids[g.id] = 1; });
    d.groups = (j.groups || []).concat((d.groups || []).filter(function (g) { return g.demo && !gids[g.id]; }));
    Object.keys(j.chPart || {}).forEach(function (c) { d.chPart[c] = j.chPart[c]; });
    d.notifs = (j.notifs || []).concat((d.notifs || []).filter(function (n) { return n.sim && n.to === me; }));
    cmAnn(j); if (j.stories) d.stories = cmStories(j.stories).concat(cmKeepLocalStories());
    memo = {}; CM.loaded = true;
  }
  /* Tải (hoặc làm mới) ảnh chụp cộng đồng. Trả Promise luôn thành công (lỗi mạng → giữ dữ liệu cũ). */
  function syncCommunity(force) {
    if (!cmMe()) return Promise.resolve(false);
    if (CM.loading) return CM.loading;
    if (CM.loaded && !force) return Promise.resolve(true);
    CM.loading = cmReq('GET', '/api/community/snapshot').then(function (j) { CM.loading = null; if (j.ok) { applySnapshot(j); return true; } if (j.__status === 401) root.location.href = 'index.html'; return false; }, function () { CM.loading = null; return false; });
    return CM.loading;
  }
  /* gửi hành động; nếu máy chủ từ chối thì báo lỗi và đồng bộ lại để giao diện phản ánh đúng sự thật */
  function cmFire(method, url, body, onOk) {
    cmReq(method, url, body).then(function (j) {
      if (j.ok) { if (onOk) onOk(j); return; }
      if (j.__status === 404) return;                       /* mục chỉ có ở dữ liệu cục bộ (DEMO/mô phỏng) hoặc chưa kịp lưu */
      cmToast(j.message || 'Không thực hiện được thao tác. Đang tải lại dữ liệu.'); syncCommunity(true).then(function () { try { if (root.DISCI.ui && root.DISCI.ui.refreshBadges) root.DISCI.ui.refreshBadges(); } catch (e) {} });
    }, function () { cmToast('Không kết nối được máy chủ.'); });
  }
  var enc = encodeURIComponent;

  /* --- dữ liệu người dùng công khai (thay cho đọc localStorage của người khác) --- */
  ST.users = function () { return AD.loaded ? AD.users : CM.loaded ? CM.users : (ST.user ? [{ id: ST.user.id, name: ST.user.name, role: ST.user.role, createdAt: ST.user.createdAt }] : []); };
  ST.udataOf = function (id) {
    if (ST.user && ST.user.id === id) return ST.S;
    var u = CM.byId[id] || AD.byId[id]; if (!u) return null;
    return { profile: u.profile || {}, posts: [], sessions: [], settings: { privacy: u.privacy || {} } };
  };
  var _statsOf = statsOf;
  statsOf = function (id) {
    if (ST.user && ST.user.id === id) return _statsOf(id);
    if (AD.byId[id] && AD.byId[id].stats) return AD.byId[id].stats;
    var a = actor(id); if (a.demo && a.stats && !CM.stats[id]) return _statsOf(id);
    return CM.stats[id] || { streak: 0, sessions: 0, minutes: 0, points: 0 };
  };
  realPosts = function () {
    var me = cmMe(), out = [];
    (AD.loaded ? AD.posts : CM.posts).forEach(function (x) { if (x.by !== me) { var u = CM.byId[x.by]; out.push(Object.assign({}, x, { real: true, demo: !!(u && u.demo) })); } });
    if (me && ST.S && ST.S.posts) ST.S.posts.forEach(function (x) { out.push(Object.assign({}, x, { by: me, real: true, demo: false })); });
    return out;
  };

  /* --- hành động: thao tác tức thì ở máy (giữ nguyên hành vi cũ) rồi đồng bộ lên máy chủ --- */
  var _toggleLike = toggleLike;
  toggleLike = function (id, a, opt) { var r = _toggleLike(id, a, opt); if (!(opt && opt.sim) && a === cmMe() && cmServerPost(id)) cmFire('POST', '/api/community/posts/' + enc(id) + '/like'); return r; };
  var _addComment = addComment;
  addComment = function (id, a, text, opt) {
    var c = _addComment(id, a, text, opt);
    if (!(opt && opt.sim) && a === cmMe() && cmServerPost(id)) cmFire('POST', '/api/community/posts/' + enc(id) + '/comments', { id: c.id, text: c.text });
    return c;
  };
  var _share = share;
  share = function (id, a) { _share(id, a); if (a === cmMe() && cmServerPost(id)) cmFire('POST', '/api/community/posts/' + enc(id) + '/share'); };
  var _toggleFollow = toggleFollow;
  toggleFollow = function (a, b, opt) { var r = _toggleFollow(a, b, opt); if (!(opt && opt.sim) && a === cmMe() && cmIsRealUser(b)) cmFire('POST', '/api/community/follow/' + enc(b)); return r; };
  var _reportPost = reportPost;
  reportPost = function (id, by, reason) { _reportPost(id, by, reason); if (by === cmMe() && cmServerPost(id)) cmFire('POST', '/api/community/posts/' + enc(id) + '/report', { reason: reason }); };
  var _joinGroup = joinGroup;
  joinGroup = function (id, a, opt) { var r = _joinGroup(id, a, opt); var g = groupById(id); if (!(opt && opt.sim) && a === cmMe() && g && !g.demo) cmFire('POST', '/api/community/groups/' + enc(id) + '/join'); return r; };
  var _createGroup = createGroup;
  createGroup = function (o) { var g = _createGroup(o); if (!g.demo && o.owner === cmMe()) cmFire('POST', '/api/community/groups', { id: g.id, name: g.name, desc: g.desc, hue: g.hue }); return g; };
  var _saveGroup = saveGroup;
  saveGroup = function (g) { _saveGroup(g); if (!g.demo && cmMe()) cmFire('PUT', '/api/community/groups/' + enc(g.id), { name: g.name, desc: g.desc, hue: g.hue }); };
  var _deleteGroup = deleteGroup;
  deleteGroup = function (id) { var g = groupById(id); _deleteGroup(id); if (g && !g.demo && cmMe()) cmFire('DELETE', '/api/community/groups/' + enc(id)); };
  var _joinChallenge = joinChallenge;
  joinChallenge = function (id, a, opt) { _joinChallenge(id, a, opt); if (!(opt && opt.sim) && a === cmMe()) cmFire('POST', '/api/community/challenges/' + enc(id) + '/join'); };
  var _leaveChallenge = leaveChallenge;
  leaveChallenge = function (id, a) { _leaveChallenge(id, a); if (a === cmMe()) cmFire('POST', '/api/community/challenges/' + enc(id) + '/leave'); };

  /* Stories 24 giờ: lưu ở máy chủ, mọi người dùng thấy; story DEMO/mô phỏng vẫn chỉ ở máy. */
  var _addStory = addStory;
  addStory = function (o) { var s = _addStory(o); if (!o.sim && !o.demo && o.by === cmMe()) cmFire('POST', '/api/community/stories', { id: s.id, text: s.text, img: s.img, hue: s.hue }); return s; };
  var _deleteStory = deleteStory;
  deleteStory = function (id) {
    var s = (db().stories || []).filter(function (x) { return x.id === id; })[0]; _deleteStory(id);
    if (s && !s.demo && !s.sim && cmIsRealUser(s.by)) cmFire('DELETE', (s.by === cmMe() ? '/api/community/stories/' : '/api/admin/stories/') + enc(id));
  };

  /* Tin nhắn nhóm / tin nhắn riêng thật (khóa: "g:<mãNhóm>" hoặc "u:<mãNgườiDùng>"). Nhóm/người dùng DEMO vẫn dùng chế độ cục bộ cũ. */
  function chatReal(key) {
    var id = key.slice(2);
    if (key.slice(0, 2) === 'g:') { var g = groupById(id); return !!(g && !g.demo && (g.members || []).indexOf(cmMe()) >= 0); }
    return !!(CM.byId[id] && !CM.byId[id].demo && id !== cmMe());
  }
  function chatUrl(key) { return '/api/community/chat/' + (key.slice(0, 2) === 'g:' ? 'g' : 'u') + '/' + enc(key.slice(2)); }
  function chatList(key, after) { return cmReq('GET', chatUrl(key) + (after ? '?after=' + after : '')); }
  function chatSend(key, text) { return cmReq('POST', chatUrl(key), { text: text }); }
  function cmMarkRead() { if (cmMe()) cmFire('POST', '/api/community/notifications/read', {}); }

  /* thông báo ở mọi trang: lấy thông báo mới từ máy chủ (tối đa 20 giây/lần) rồi chạy logic hiển thị cũ */
  var _pullNotifs = pullNotifs;
  pullNotifs = function () {
    _pullNotifs();
    if (!cmMe() || Date.now() - CM.notifsAt < 20000) return; CM.notifsAt = Date.now();
    cmReq('GET', '/api/community/notifications').then(function (j) {
      if (!j.ok) return; var me = cmMe(), d = db();
      d.notifs = (j.notifs || []).concat((d.notifs || []).filter(function (n) { return n.sim && n.to === me; })); cmAnn(j); memo = {};
      _pullNotifs(); try { if (root.DISCI.ui && root.DISCI.ui.refreshBadges) root.DISCI.ui.refreshBadges(); } catch (e) {}
    }, function () {});
  };

  /* ---------- QUẢN TRỊ: kết nối máy chủ (DISCI ADMIN thật) ----------
     Dành cho Admin/Editor/Moderator: tải ảnh chụp quản trị (/api/admin/snapshot) rồi thao tác tức thì ở máy và gửi hành động lên máy chủ.
     Máy chủ KIỂM TRA LẠI quyền cho từng thao tác (ma trận quyền ở giao diện chỉ để ẩn/hiện nút). Hành động bị từ chối → báo lỗi và tải lại đúng dữ liệu.
     Chưa chuyển lên máy chủ (vẫn cục bộ): giao diện/thương hiệu/luồng, danh mục (bài tập/sản phẩm/món ăn), thử thách, Demo Data Center. */
  var ROLE_SRV = { admin: 'Admin', editor: 'Editor', moderator: 'Moderator', user: 'User' };
  function adStaff() { return !!(ST.user && ST.isStaffRole && ST.isStaffRole(ST.user.role)); }
  function adRefresh() { try { root.document.dispatchEvent(new root.CustomEvent('disci:admin-refresh')); } catch (e) {} }

  function adApply(j) {
    var d = db(); AD.users = (j.users || []).map(function (u) { return Object.assign({ src: 'server' }, u); });
    AD.byId = {}; AD.users.forEach(function (u) { AD.byId[u.id] = u; });
    AD.posts = j.posts || []; AD.serverPosts = {}; AD.posts.forEach(function (p) { AD.serverPosts[p.id] = p; });
    AD.backups = j.backups || [];
    AD.posts.forEach(function (p) {
      var id = p.id; d.comments[id] = (j.comments || {})[id] || []; d.likes[id] = (j.likes || {})[id] || [];
      if (p.hidden) { var cur = d.mod[id]; d.mod[id] = { st: cur && cur.st === 'removed' ? 'removed' : 'hidden', by: 'server', reason: cur ? cur.reason || '' : '', at: p.at || 0, server: true }; }
      else if (d.mod[id] && d.mod[id].server) delete d.mod[id];
    });
    d.reports = (j.reports || []).concat((d.reports || []).filter(function (r) { return r.sim || r.demo; }));
    d.ann = (j.announcements || []).map(function (a) { return { id: a.id, title: a.title, text: a.text || '', audience: a.audience, kind: a.kind, go: a.go || '', at: a.at, until: a.until || 0, by: '' }; });
    if (j.audit) d.audit = j.audit;
    CM.stats = CM.stats || {}; AD.users.forEach(function (u) { if (u.stats) CM.stats[u.id] = u.stats; });
    if (j.catalog) catFromServer(j.catalog);
    if (j.stories) d.stories = cmStories(j.stories).concat(cmKeepLocalStories());
    memo = {}; AD.loaded = true;
  }
  function syncAdmin(force) {
    if (!adStaff()) return Promise.resolve(false);
    if (AD.loading) return AD.loading; if (AD.loaded && !force) return Promise.resolve(true);
    AD.loading = cmReq('GET', '/api/admin/snapshot').then(function (j) { AD.loading = null; if (j.__status === 200 && j.ok) { adApply(j); return true; } if (j.__status === 401) root.location.href = 'index.html'; return false; }, function () { AD.loading = null; return false; });
    return AD.loading;
  }
  function adFire(method, url, body, onOk) {
    return cmReq(method, url, body).then(function (j) {
      if (j.__status < 300) { if (onOk) onOk(j); return j; }
      cmToast(j.message || 'Máy chủ từ chối thao tác này. Đang tải lại dữ liệu.'); syncAdmin(true).then(adRefresh); return j;
    }, function () { cmToast('Không kết nối được máy chủ.'); });
  }
  function adAdminCount() { return AD.users.filter(function (u) { return u.role === 'admin' && !u.locked; }).length; }
  function adUser(id) { var u = AD.byId[id]; if (!u) throw new Error('Không tìm thấy tài khoản.'); return u; }

  function createUserOnServer(o) {
    need('users.manage');
    return cmReq('POST', '/api/admin/users', { name: o.name, email: o.email, password: o.password, role: ROLE_SRV[o.role] || 'User' }).then(function (j) {
      if (j.__status >= 300) return { ok: false, message: j.message || 'Không tạo được tài khoản.' };
      var u = { id: j.id, name: o.name, email: o.email, role: o.role, locked: false, demo: false, createdAt: Date.now(), lastLogin: 0, mustChangePw: true, src: 'server', stats: { streak: 0, sessions: 0, minutes: 0, points: 0 } };
      AD.users.unshift(u); AD.byId[u.id] = u; memo = {}; return { ok: true, id: u.id };
    }, function () { return { ok: false, message: 'Không kết nối được máy chủ.' }; });
  }

  var _updateUser = updateUser;
  updateUser = function (id, patch, why) {
    if (!AD.loaded) return _updateUser(id, patch, why);
    need('users.manage'); var u = adUser(id);
    if (patch.role && !ROLES[patch.role]) throw new Error('Vai trò không hợp lệ.');
    var losing = (u.role === 'admin' && !u.locked) && ((patch.role && patch.role !== 'admin') || patch.locked === true);
    if (losing && adAdminCount() <= 1) throw new Error('Không thể hạ quyền/khóa quản trị viên cuối cùng.');
    if (id === ST.user.id && (patch.locked === true || (patch.role && patch.role !== u.role))) throw new Error('Bạn không thể tự khóa hoặc tự đổi vai trò của mình.');
    if (patch.role && ST.isStaffRole(patch.role) && role(ST.realUser || ST.user) !== 'admin') throw new Error('Chỉ quản trị viên mới được cấp quyền quản trị.');
    if ('role' in patch && patch.role !== u.role) { u.role = patch.role; adFire('PUT', '/api/admin/users/' + enc(id) + '/role', { role: ROLE_SRV[patch.role] }); }
    if ('locked' in patch && !!patch.locked !== !!u.locked) { u.locked = !!patch.locked; adFire('PUT', '/api/admin/users/' + enc(id) + '/active', { active: !patch.locked }); }
    memo = {};
  };
  var _deleteUser = deleteUser;
  deleteUser = function (id) {
    if (!AD.loaded) return _deleteUser(id);
    need('users.manage'); var u = adUser(id); if (id === ST.user.id) throw new Error('Bạn không thể xóa chính mình tại đây.');
    if (u.role === 'admin' && adAdminCount() <= 1) throw new Error('Không thể xóa quản trị viên cuối cùng.');
    AD.users = AD.users.filter(function (x) { return x.id !== id; }); delete AD.byId[id]; memo = {}; adFire('DELETE', '/api/admin/users/' + enc(id));
  };
  var _resetUserPassword = resetUserPassword;
  resetUserPassword = function (id) {
    if (!AD.loaded) return _resetUserPassword(id);
    need('users.manage'); var u = adUser(id);
    if (ST.isStaffRole(u.role) && role(ST.realUser || ST.user) !== 'admin') throw new Error('Chỉ quản trị viên mới được đặt lại mật khẩu của nhân sự quản trị.');
    return cmReq('POST', '/api/admin/users/' + enc(id) + '/reset-password').then(function (j) { if (j.__status >= 300) throw new Error(j.message || 'Không đặt lại được mật khẩu.'); u.mustChangePw = true; return j.tempPassword; });
  };

  var _modPost = modPost;
  modPost = function (id, st, reason) {
    if (!AD.serverPosts[id]) return _modPost(id, st, reason);
    need('content'); var d = db(), p = AD.serverPosts[id];
    if (st === 'ok') { delete d.mod[id]; p.hidden = false; adFire('POST', '/api/admin/posts/' + enc(id) + '/unhide'); }
    else { d.mod[id] = { st: st, by: ST.user.id, reason: reason || '', at: now(), server: true }; p.hidden = true; adFire('POST', '/api/admin/posts/' + enc(id) + '/hide', { reason: reason || '' }); }
    memo = {};
  };
  var _modComment = modComment;
  modComment = function (postId, cid, hidden) {
    if (!AD.serverPosts[postId]) return _modComment(postId, cid, hidden);
    need('content'); var c = (db().comments[postId] || []).filter(function (x) { return x.id === cid; })[0]; if (!c) return; c.hidden = !!hidden;
    adFire('POST', '/api/admin/comments/' + enc(cid) + (hidden ? '/hide' : '/unhide'));
  };
  var _deleteComment = deleteComment;
  deleteComment = function (postId, cid) {
    if (!AD.serverPosts[postId]) return _deleteComment(postId, cid);
    need('content'); var d = db(); d.comments[postId] = (d.comments[postId] || []).filter(function (x) { return x.id !== cid; }); adFire('DELETE', '/api/admin/comments/' + enc(cid));
  };
  var _resolveReport = resolveReport;
  resolveReport = function (id, st) {
    var r = (db().reports || []).filter(function (x) { return x.id === id; })[0];
    if (!r || !AD.loaded || r.sim || r.demo) return _resolveReport(id, st);
    need('reports'); r.st = st; adFire('POST', '/api/admin/reports/' + enc(id) + '/resolve', { action: st === 'dismissed' ? 'dismiss' : 'resolve' });
  };
  var _deleteDemoOrOfficialPost = deleteDemoOrOfficialPost;
  deleteDemoOrOfficialPost = function (id) {
    if (!AD.serverPosts[id]) return _deleteDemoOrOfficialPost(id);
    need('content'); AD.posts = AD.posts.filter(function (p) { return p.id !== id; }); delete AD.serverPosts[id]; memo = {}; adFire('DELETE', '/api/admin/posts/' + enc(id));
  };
  var _addAnnouncement = addAnnouncement;
  addAnnouncement = function (o) {
    if (!AD.loaded) return _addAnnouncement(o);
    need('notify'); var a = { id: uid('an'), title: String(o.title || '').trim(), text: String(o.text || '').trim(), audience: o.audience || 'all', kind: o.kind || 'info', go: o.go || '', at: now(), until: o.until || 0, by: ST.user.id };
    if (!a.title) throw new Error('Hãy nhập tiêu đề thông báo.'); db().ann.unshift(a);
    adFire('POST', '/api/admin/announcements', { id: a.id, title: a.title, body: a.text, audience: a.audience, kind: a.kind, link: a.go, expiresAt: a.until ? new Date(a.until).toISOString() : null }); return a;
  };
  var _deleteAnnouncement = deleteAnnouncement;
  deleteAnnouncement = function (id) {
    if (!AD.loaded) return _deleteAnnouncement(id);
    need('notify'); var d = db(); d.ann = d.ann.filter(function (a) { return a.id !== id; }); adFire('DELETE', '/api/admin/announcements/' + enc(id));
  };

  /* sao lưu / khôi phục trên máy chủ (cấu hình & nội dung quản trị, không gồm tài khoản/dữ liệu cá nhân) */
  function adBackups() { return AD.backups; }
  function adBackupCreate(note) { return cmReq('POST', '/api/admin/backups', { note: note || '' }).then(function (j) { if (j.__status >= 300) throw new Error(j.message || 'Không tạo được bản sao lưu.'); return syncAdmin(true).then(function () { return j; }); }); }
  function adBackupDatabase(note) { return cmReq('POST', '/api/admin/backups/database', { note: note || '' }).then(function (j) { if (j.__status >= 300) throw new Error(j.message || 'Không sao lưu được cơ sở dữ liệu.'); return syncAdmin(true).then(function () { return j; }); }); }
  function adBackupRestore(id) { return cmReq('POST', '/api/admin/backups/' + enc(id) + '/restore').then(function (j) { if (j.__status >= 300) throw new Error(j.message || 'Không khôi phục được.'); return syncAdmin(true).then(function () { return j; }); }); }
  function adBackupDelete(id) { return cmReq('DELETE', '/api/admin/backups/' + enc(id)).then(function (j) { if (j.__status >= 300) throw new Error(j.message || 'Không xóa được.'); return syncAdmin(true).then(function () { return j; }); }); }
  function adBackupUpload(file) {
    var fd = new root.FormData(); fd.append('file', file, file.name || 'backup.json');
    return root.fetch('/api/admin/backups/upload', { method: 'POST', credentials: 'same-origin', headers: { 'RequestVerificationToken': root.DISCI_CSRF || '' }, body: fd })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'Tệp sao lưu không hợp lệ.'); return j; }); });
  }

  /* ---------- DANH MỤC & CẤU HÌNH TỪ MÁY CHỦ ----------
     Danh mục (bài tập, món ăn, sản phẩm, thử thách) và cấu hình giao diện/hệ thống nằm trong SQL Server. Máy chủ nhúng chúng vào mọi trang đã đăng nhập
     (window.DISCI_CATALOG, window.DISCI_SITE) nên mọi người dùng thấy cùng một dữ liệu và engine tạo lịch dùng đúng danh mục hiện hành.
     Ở đây dịch dữ liệu máy chủ sang cấu trúc cũ (db().catalog: add/patch/hide; chOver; challenges) để giao diện không phải đổi. */
  var KIND = { ex: 'exercise', meal: 'food', prod: 'product' };
  var SRV_ONLY = { active: 1, custom: 1, image: 1, video: 1, supplement: 1 };
  function jn(v) { return v === null || v === undefined ? '' : v; }
  function catEmpty(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length); }
  function catClient(x) {
    var it = {}; Object.keys(x).forEach(function (k) { if (!SRV_ONLY[k]) it[k] = x[k]; });
    ['muscles', 'warn', 'desc', 'how', 'forWho', 'note'].forEach(function (k) { if (k in it && it[k] === null) it[k] = ''; });
    return it;
  }
  function catDiffers(base, it) {
    return Object.keys(it).some(function (k) { return k in base ? JSON.stringify(jn(base[k])) !== JSON.stringify(jn(it[k])) : !catEmpty(it[k]); });
  }
  function catFromServer(src) {
    if (!src || typeof src !== 'object') return;
    var d = db(); D.__orig = D.__orig || { ex: D.EXERCISES.slice(), meal: D.MEALS.slice(), prod: D.PRODUCTS.slice() };
    Object.keys(KIND).forEach(function (k) {
      var list = src[KIND[k]]; if (!Array.isArray(list)) return;
      var c = d.catalog[k], base = {}, seen = {}; c.add = []; c.patch = {}; c.hide = [];
      D.__orig[k].forEach(function (it) { base[it.id] = it; });
      list.forEach(function (x) {
        var it = catClient(x); seen[x.id] = 1;
        if (base[x.id]) { if (catDiffers(base[x.id], it)) c.patch[x.id] = it; } else c.add.push(it);
        if (x.active === false) c.hide.push(x.id);
      });
      D.__orig[k].forEach(function (it) { if (!seen[it.id]) c.hide.push(it.id); });       /* mục gốc không còn trên máy chủ → ẩn */
    });
    var ch = src.challenge; if (Array.isArray(ch)) {
      var baseIds = {}, seenC = {}; D.CHALLENGES.forEach(function (c) { baseIds[c.id] = 1; }); d.chOver = {}; d.challenges = [];
      ch.forEach(function (x) {
        seenC[x.id] = 1; var hidden = x.active === false;
        if (baseIds[x.id]) d.chOver[x.id] = { name: x.name, desc: jn(x.desc), reward: jn(x.reward), days: x.days, goal: x.goal, hidden: hidden };
        else { var it = catClient(x); it.hidden = hidden; d.challenges.push(it); }
      });
      Object.keys(baseIds).forEach(function (id) { if (!seenC[id]) d.chOver[id] = { hidden: true }; });
    }
    memo = {}; applyCatalog();
  }
  function catToServer(k, item) { var c = db().catalog[k], o = JSON.parse(JSON.stringify(item)); o.active = c.hide.indexOf(item.id) < 0; return o; }
  function catErr(j) { return j && j.message; }

  var _catalogSave = catalogSave;
  catalogSave = function (k, item) { _catalogSave(k, item); if (AD.loaded) adFire('PUT', '/api/admin/catalog/' + KIND[k], catToServer(k, item)); };
  var _catalogHide = catalogHide;
  catalogHide = function (k, id, hide) { _catalogHide(k, id, hide); if (AD.loaded) adFire('POST', '/api/admin/catalog/' + KIND[k] + '/' + enc(id) + '/active', { active: !hide }); };
  var _catalogRevert = catalogRevert;
  catalogRevert = function (k, id) {
    _catalogRevert(k, id);
    if (AD.loaded) { var o = D.__orig[k].filter(function (x) { return x.id === id; })[0]; if (o) adFire('PUT', '/api/admin/catalog/' + KIND[k], catToServer(k, o)); }
  };
  var _catalogDelete = catalogDelete;
  catalogDelete = function (k, id) { _catalogDelete(k, id); if (AD.loaded) adFire('DELETE', '/api/admin/catalog/' + KIND[k] + '/' + enc(id)); };
  var _saveChallenge = saveChallenge;
  saveChallenge = function (c) {
    _saveChallenge(c);
    if (AD.loaded) { var o = JSON.parse(JSON.stringify(c)); o.active = !c.hidden; delete o.hidden; delete o.base; delete o.custom; if (!o.metric) o.metric = 'manual'; adFire('PUT', '/api/admin/catalog/challenge', o); }
  };
  var _deleteChallenge = deleteChallenge;
  deleteChallenge = function (id) {
    var isBase = D.CHALLENGES.some(function (x) { return x.id === id; });
    _deleteChallenge(id);
    if (AD.loaded) { if (isBase) adFire('POST', '/api/admin/catalog/challenge/' + enc(id) + '/active', { active: false }); else adFire('DELETE', '/api/admin/catalog/challenge/' + enc(id)); }
  };

  /* --- cấu hình giao diện/hệ thống: đồng bộ lên máy chủ khi nhân sự quản trị thay đổi --- */
  var CFG_SYNCED = null, cfgTimer = null;
  function cfgFromServer(sc) {
    if (!sc || typeof sc !== 'object') return;
    P.cfg = mergeDeep(JSON.parse(JSON.stringify(sc)), defaults().cfg);
  }
  function cfgPush() {
    var c = db().cfg, js = JSON.stringify(c); if (!adStaff() || js === CFG_SYNCED) return;
    var body = { 'site.config': c };
    if (role(ST.realUser || ST.user) === 'admin') {            /* các khóa máy chủ dùng để ÁP DỤNG (chặn bảo trì, đóng đăng ký) chỉ Admin được ghi */
      var s = c.system || {}; body['system.maintenance'] = !!s.maintenance; body['system.maintenanceMsg'] = String(s.maintenanceMsg || ''); body['site.registration.open'] = s.allowRegister !== false;
    }
    cmReq('PUT', '/api/admin/settings', body).then(function (j) {
      CFG_SYNCED = js;                                          /* kể cả khi lỗi: không thử lại vô hạn */
      if (j.__status >= 300) cmToast(j.message || 'Không lưu được cấu hình lên máy chủ – thay đổi chỉ có hiệu lực trên thiết bị này.');
    }, function () { cmToast('Không kết nối được máy chủ – cấu hình chưa được lưu.'); });
  }
  var _save = save;
  save = function () { var r = _save.apply(this, arguments); if (CFG_SYNCED !== null && adStaff() && JSON.stringify(db().cfg) !== CFG_SYNCED) { clearTimeout(cfgTimer); cfgTimer = setTimeout(cfgPush, 700); } return r; };

  /* ---------- khởi động ---------- */
  load();
  try { if (root.DISCI_SITE && root.DISCI_SITE['site.config']) cfgFromServer(root.DISCI_SITE['site.config']); } catch (e) { console.error(e); }
  try { if (root.DISCI_CATALOG) catFromServer(root.DISCI_CATALOG); } catch (e) { console.error(e); }
  CFG_SYNCED = JSON.stringify(P.cfg);
  try { applySite(); applyCatalog(); applyLimits(); } catch (e) { console.error(e); }
  root.DISCI.plat = {
    db: db, save: save, load: load, fresh: fresh, uid: uid, esc: esc, hash: hash, cfg: cfg, setCfg: setCfg, safeImg: safeImg, loginBanners: loginBanners, IMG_MAX: IMG_MAX, applySite: applySite, brand: brand, logoHtml: logoHtml, markSvg: markSvg, markInner: markInner, markDefs: markDefs, maintenance: maintenance, bannedHit: bannedHit, containsBanned: containsBanned,
    ROLES: ROLES, PERMS: PERMS, PERM_LABEL: PERM_LABEL, role: role, can: can, need: need, isStaff: isStaff, log: log,
    applyCatalog: applyCatalog, catalogAll: catalogAll, reviewsOf: reviewsOf, reviewStats: reviewStats, addReview: addReview, delReview: delReview, catalogSave: catalogSave, catalogHide: catalogHide, catalogDelete: catalogDelete, catalogRevert: catalogRevert,
    avatarUrl: avatarUrl, coverUrl: coverUrl, artUrl: artUrl, svgUri: svgUri, actor: actor, statsOf: statsOf, badgesOf: badgesOf,
    allPosts: allPosts, realPosts: realPosts, postById: postById, visiblePosts: visiblePosts, modOf: modOf, follows: follows, isFollowing: isFollowing, followersOf: followersOf,
    likesOf: likesOf, liked: liked, commentsOf: commentsOf, sharesOf: sharesOf, toggleLike: toggleLike, addComment: addComment, share: share, toggleFollow: toggleFollow, reportPost: reportPost, pushNotif: pushNotif,
    modPost: modPost, deleteDemoOrOfficialPost: deleteDemoOrOfficialPost, modComment: modComment, deleteComment: deleteComment, officialPost: officialPost, resolveReport: resolveReport,
    storyList: storyList, addStory: addStory, deleteStory: deleteStory, groups: groups, groupById: groupById, joinGroup: joinGroup, createGroup: createGroup, saveGroup: saveGroup, deleteGroup: deleteGroup,
    challenges: challenges, challengesAll: challengesAll, participants: participants, joinChallenge: joinChallenge, leaveChallenge: leaveChallenge, saveChallenge: saveChallenge, deleteChallenge: deleteChallenge,
    addAnnouncement: addAnnouncement, deleteAnnouncement: deleteAnnouncement, activeBanner: activeBanner, pullNotifs: pullNotifs,
    syncCommunity: syncCommunity, chatReal: chatReal, chatList: chatList, chatSend: chatSend, syncAdmin: syncAdmin, createUserOnServer: createUserOnServer, adBackups: adBackups, adBackupCreate: adBackupCreate, adBackupDatabase: adBackupDatabase, adBackupRestore: adBackupRestore, adBackupDelete: adBackupDelete, adBackupUpload: adBackupUpload, cmMarkRead: cmMarkRead, actAs: actAs, stopActAs: stopActAs, updateUser: updateUser, deleteUser: deleteUser, resetUserPassword: resetUserPassword, adminCount: adminCount, exportAll: exportAll, importAll: importAll, usage: usage,
    CLIPS: CLIPS, CLIP_KEYS: CLIP_KEYS, mountClip: mountClip, hydrateClips: hydrateClips, clipHtml: clipHtml
  };
  /* ghi nhật ký đăng nhập (bọc ST.login, không đổi hành vi) */
  var _login = ST.login; ST.login = function (email, pw, rem, who) { return _login(email, pw, rem, who).then(function (r) { try { log(r.ok ? 'auth.login' : 'auth.fail', String(email || '').toLowerCase(), r.ok ? '' : (r.code || '')); save(); } catch (e) {} return r; }); };
})(window);
