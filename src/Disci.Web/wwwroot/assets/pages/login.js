/* v15: banner nền do Admin tải lên (chuyển cảnh + Ken Burns), hiệu ứng động (hạt sáng, cực quang, parallax, viền xoay), xem trước ?preview=1.
   Đăng nhập / đăng ký / quên mật khẩu (v6): tách "Thành viên" và "Quản trị", vào nhanh một chạm, chuyển trang theo vai trò,
   quay lại đúng trang đang mở dở (?next=), chống dò mật khẩu cơ bản. Mật khẩu vẫn được băm và kiểm tra thật – không có đường tắt bỏ qua xác thực. */
(function () {
  var ST = DISCI.store, PL = DISCI.plat, ui = DISCI.ui || null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var params = new URLSearchParams(location.search), next = params.get('next') || '';
  function safeNext() { return /^[a-z0-9\-]+\.html(\?[^#]*)?(#[\w\-]*)?$/i.test(next) ? next : ''; }   // chỉ nhận trang nội bộ, chặn open-redirect
  var who = (params.get('mode') === 'admin' || /^admin\.html/i.test(safeNext())) ? 'staff' : 'member';
  var preview = params.get('preview') === '1', slideIdx = 0, slideTimer = null;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), noFx = document.documentElement.classList.contains('no-fx');
  function site() { try { return PL.cfg().site; } catch (e) { return {}; } }
  function banners() { try { return PL.loginBanners(); } catch (e) { return []; } }
  function fxMode() { var m = site().loginFx; return (m === 'lite' || m === 'off') ? m : 'full'; }
  var prevWho = '', mode = (params.get('tab') === 'register' ? 'register' : 'login'), switchCard = false, DEMO = { email: 'demo@disci.vn', pw: 'Demo@1234' };
  var LG = { n: 0, until: 0 }; try { LG = Object.assign(LG, JSON.parse(sessionStorage.getItem('disci:lg') || '{}')); } catch (e) {}
  function saveLG() { try { sessionStorage.setItem('disci:lg', JSON.stringify(LG)); } catch (e) {} }
  function lastEmail() { try { return localStorage.getItem('disci:lastEmail') || ''; } catch (e) { return ''; } }
  function roleName(u) { return (PL && PL.ROLES[u.role || 'user']) || 'Người dùng'; }
  function isStaff(u) { return !!u && ['admin', 'editor', 'moderator'].indexOf(u.role) >= 0; }
  function flowPage(k) { try { var v = PL.cfg().site.flow[k]; return /^[\w\-]+\.html(#[\w\-]+)?$/.test(v) ? v : ''; } catch (e) { return ''; } }
  function landing() { try { var r = PL.role(ST.user), v = PL.cfg().site.flow.landing[r]; if (/^[\w\-]+\.html(#[\w\-]+)?$/.test(v) && (v !== 'admin.html' || PL.can('admin.view'))) return v; } catch (e) {} return who === 'staff' ? 'admin.html' : 'dashboard.html'; }
  var demoDest = '';   /* nút demo quản trị: luôn vào trang quản trị */
  function dest() { return demoDest || safeNext() || landing(); }
  function destName() { var d = dest(); return /^admin\.html/.test(d) ? 'trang quản trị' : 'trang chủ'; }

  /* đã đăng nhập sẵn */
  if (ST.loadUser()) {
    var canPreview = false; try { canPreview = preview && PL.can('appearance'); } catch (e) {}   /* admin/biên tập xem trước trang đăng nhập mà không bị đẩy đi */
    if (canPreview) { /* ở lại trang */ }
    else if (who === 'staff' && !isStaff(ST.user)) switchCard = true;      // cần quyền quản trị nhưng đang là người dùng thường
    else { location.replace(dest()); return; }
  }

  function wordmark() { var b = String((PL && PL.brand()) || 'Disci'); return b.charAt(0).toUpperCase() + b.slice(1).toLowerCase(); }
  var I = function (n, c) { return '<span class="material-symbols-outlined' + (c ? ' ' + c : '') + '" aria-hidden="true">' + n + '</span>'; };
  /* biểu tượng thương hiệu: chữ d + vạch tốc độ (dùng lại cho logo và hình mờ nền) */
  var MARK = '<defs>' + PL.markDefs('lgG') + '</defs><symbol id="lgMark" viewBox="0 0 76 56">' + PL.markInner('lgG') + '</symbol>';
  function logo() { return '<a class="lg-logo" href="index.html" aria-label="' + esc(wordmark()) + '"><svg class="dmark" viewBox="0 0 76 56" width="54" height="40" aria-hidden="true"><use href="#lgMark"/></svg><b>' + esc(wordmark()) + '</b></a>'; }
  function particles() {
    if (fxMode() !== 'full' || reduce || noFx) return '';
    var out = '', i, n = window.innerWidth < 700 ? 12 : 26;
    for (i = 0; i < n; i++) out += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;--s:' + (2 + Math.random() * 5).toFixed(1) + 'px;--d:' + (9 + Math.random() * 14).toFixed(1) + 's;--dl:-' + (Math.random() * 20).toFixed(1) + 's;--dx:' + Math.round(Math.random() * 120 - 60) + 'px"></i>';
    return '<div class="lg-fx">' + out + '</div>';
  }
  function bg() {
    var bn = banners(), custom = bn.length > 0, ov = Math.max(0, Math.min(90, +site().loginOverlay || 0)) / 100;
    var slides = custom ? '<div class="lg-slides">' + bn.map(function (u, i) { return '<i class="lg-slide' + (i === slideIdx % bn.length ? ' on' : '') + '" data-i="' + i + '"></i>'; }).join('') + '</div><div class="lg-scrim" style="--lg-ov:' + ov + '"></div>' : '';
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + MARK + '</svg><div class="lg-bg" aria-hidden="true">' + slides + '<i class="lg-aur a"></i><i class="lg-aur b"></i><i class="lg-aur c"></i><i class="lg-band a"></i><i class="lg-band b"></i><i class="lg-arc"></i><i class="lg-dots"></i><svg class="lg-ghost" viewBox="0 0 76 56"><use href="#lgMark"/></svg>' + particles() + '</div>' +
      (custom ? '' : '<img class="lg-runner" src="assets/login-runner.webp" alt="" width="532" height="791" onerror="this.remove()">') +
      (bn.length > 1 ? '<div class="lg-sdots" role="tablist" aria-label="Chọn banner">' + bn.map(function (u, i) { return '<button type="button" role="tab" data-slide="' + i + '" aria-label="Banner ' + (i + 1) + '" class="' + (i === slideIdx % bn.length ? 'on' : '') + '"></button>'; }).join('') + '</div>' : '');
  }
  function brand() {
    var staff = who === 'staff';
    var pts = staff
      ? [['group', 'Quản lý người dùng, phân quyền và nhật ký'], ['gavel', 'Kiểm duyệt bài viết, bình luận, media'], ['tune', 'Tùy chỉnh giao diện, bài tập, dinh dưỡng, sản phẩm']]
      : [['monitoring', 'Theo dõi tiến độ chính xác'], ['groups', 'Kết nối cộng đồng thể thao'], ['emoji_events', 'Thử thách bản thân mỗi ngày']];
    var st = site(), l1 = staff ? 'Vận hành gọn gàng' : (st.loginL1 || 'Kết nối đam mê'), l2 = staff ? 'Kiểm soát an toàn' : (st.loginL2 || 'Thể thao vươn xa');
    var intro = staff ? 'Khu vực dành cho đội ngũ vận hành ' + wordmark() + '. Mọi thay đổi đều có nhật ký để truy vết.' : (st.loginIntro || 'Nền tảng luyện tập cá nhân hóa giúp bạn tập an toàn, tiết kiệm và đều đặn ngay tại nhà.');
    return '<section class="brand"><h1><span class="w">' + esc(wordmark()) + '</span><span class="l1">' + esc(l1) + '</span><span class="l2">' + esc(l2) + '</span></h1><p>' + esc(intro) + '</p>' +
      '<ul class="lg-pts">' + pts.map(function (t) { return '<li><span class="lg-pi">' + I(t[0], 'fill') + '</span><span>' + t[1] + '</span></li>'; }).join('') + '</ul></section>';
  }
  /* Không còn tab Thành viên/Quản trị trên form chính: đăng nhập quản trị mở bằng nút tròn Shield ở góc trên bên trái (xem shieldBtn). */
  function seg() { return ''; }
  function shieldBtn() {
    var staff = who === 'staff';
    return '<button type="button" class="lg-shield' + (staff ? ' on' : '') + '" data-who="' + (staff ? 'member' : 'staff') + '" aria-label="' + (staff ? 'Quay lại đăng nhập thành viên' : 'Đăng nhập quản trị') + '" title="' + (staff ? 'Quay lại đăng nhập thành viên' : 'Đăng nhập quản trị') + '">' + I(staff ? 'arrow_back' : 'shield', staff ? '' : 'fill') + '</button>';
  }
  function render() {
    var inner;
    if (switchCard) inner = switchCardHtml(); else inner = seg() + (mode === 'login' ? loginForm() : registerForm());
    var bn = banners();
    $('#root').innerHTML = '<div class="fb fb-login lgx fx-' + fxMode() + (bn.length ? ' has-ban' : '') + '">' + (preview ? '<div class="lg-prev"><span class="material-symbols-outlined">visibility</span>Chế độ xem trước · <a href="admin.html#appearance">Quay lại quản trị</a></div>' : '') + shieldBtn() + bg() + logo() + brand() + '<section class="lg-side"><div class="box lg-card ' + (who === 'staff' ? 'staff' : '') + '">' + inner + '</div><p class="lg-legal">' + esc(wordmark()) + ' chỉ hỗ trợ luyện tập, không thay thế tư vấn y tế.</p></section></div>';
    var sg = $('.lg-seg'); if (sg && sg.dataset.pos !== who) requestAnimationFrame(function () { requestAnimationFrame(function () { sg.dataset.pos = who; }); }); prevWho = who;
    document.querySelectorAll('.lg-slide').forEach(function (el, i) { if (bn[i]) el.style.backgroundImage = 'url(' + JSON.stringify(bn[i]) + ')'; });   /* gán bằng JS (đã kiểm tra PL.safeImg) để không chèn URL vào HTML */
    startSlides(); parallax();
    wire(); var f = $('#email'); if (f && !f.value) f.focus();
  }
  function showSlide(i) {
    var els = document.querySelectorAll('.lg-slide'), dots = document.querySelectorAll('.lg-sdots button'); if (!els.length) return;
    slideIdx = (i + els.length) % els.length;
    els.forEach(function (e, k) { e.classList.toggle('on', k === slideIdx); }); dots.forEach(function (e, k) { e.classList.toggle('on', k === slideIdx); });
  }
  function startSlides() {
    clearInterval(slideTimer); slideTimer = null;
    document.querySelectorAll('[data-slide]').forEach(function (b) { b.addEventListener('click', function () { showSlide(+b.dataset.slide); startSlides(); }); });
    var n = banners().length; if (n < 2 || reduce || noFx || fxMode() === 'off') return;
    var sec = Math.max(3, Math.min(20, +site().loginSlideSec || 6));
    slideTimer = setInterval(function () { if (!document.hidden) showSlide(slideIdx + 1); }, sec * 1000);
  }
  function parallax() {
    var el = $('.lgx'); if (!el || reduce || noFx || fxMode() !== 'full' || !window.matchMedia || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    var raf = 0, px = 0, py = 0;
    el.addEventListener('pointermove', function (e) { px = (e.clientX / window.innerWidth - .5) * 2; py = (e.clientY / window.innerHeight - .5) * 2; if (!raf) raf = requestAnimationFrame(function () { raf = 0; el.style.setProperty('--px', px.toFixed(3)); el.style.setProperty('--py', py.toFixed(3)); }); });
  }
  function switchCardHtml() {
    return '<div class="lg-head"><span class="badge b-info">Khu vực quản trị</span><h2>Cần tài khoản quản trị</h2><p>Bạn đang đăng nhập là <b>' + esc(ST.user.name) + '</b> (' + esc(roleName(ST.user)) + '). Tài khoản này không có quyền vào trang quản trị.</p></div><button class="go" id="sw-login">Đăng nhập tài khoản quản trị</button><a class="lnk" href="dashboard.html" style="text-align:center">Về trang chủ</a>';
  }
  /* Hai nút đăng nhập nhanh (chỉ hiện khi máy chủ chạy ở Development): người dùng demo và quản trị demo. */
  function quickList() {
    if (!(window.DISCI_FLAGS && window.DISCI_FLAGS.demoLogin)) return '';
    var out = [];
    if (who !== 'staff') out.push({ k: 'user', ic: 'science', t: 'Demo · Giao diện người dùng', s: 'Vào ngay bằng tài khoản demo, không cần nhập gì' });
    out.push({ k: 'admin', ic: 'shield', t: 'Demo · Giao diện quản trị', s: 'Vào ngay trang quản trị bằng tài khoản admin demo' });
    return '<div class="lg-quick">' + out.map(function (q) { return '<button type="button" class="lg-q" data-quick="' + q.k + '"><span class="lg-qi">' + I(q.ic) + '</span><span class="lg-qt"><b>' + q.t + '</b><small>' + q.s + '</small></span>' + I('arrow_forward', 'lg-go') + '</button>'; }).join('') + '</div>';
  }
  var SOC = {
    google: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.300 3-7.300z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.500l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.400 13.900a6 6 0 0 1 0-3.800V7.500H3.100a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.800-2.800A10 10 0 0 0 3.100 7.500l3.300 2.600C7.200 7.700 9.400 5.900 12 5.900z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1877F2"/><path fill="#fff" d="M13.300 22v-7.700h2.600l.4-3h-3V9.400c0-.9.300-1.500 1.500-1.500h1.600V5.200c-.3 0-1.200-.1-2.300-.1-2.300 0-3.900 1.400-3.900 4v2.200H7.600v3h2.600V22z"/></svg>',
    apple: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.400 12.700c0-2.300 1.900-3.400 2-3.500-1.100-1.600-2.800-1.800-3.400-1.800-1.400-.1-2.800.9-3.500.9-.7 0-1.800-.8-3-.8-1.500 0-3 .9-3.800 2.300-1.600 2.800-.4 7 1.200 9.300.8 1.100 1.700 2.400 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.200.9-1.300 1.300-2.500 1.300-2.600-.1 0-2.500-1-2.500-3.900zM14.200 5.900c.6-.8 1.100-1.800 1-2.900-.9 0-2 .6-2.700 1.400-.6.700-1.100 1.800-1 2.800 1 .1 2-.5 2.700-1.300z"/></svg>'
  };
  function loginForm() {
    var le = lastEmail(), staff = who === 'staff', lbl = staff ? 'Đăng nhập quản trị' : 'Đăng nhập';
    return '<div class="lg-head">' + (staff ? '<span class="badge b-info">Khu vực quản trị</span>' : '') + '<h2>' + lbl + '</h2><p>' + (staff ? 'Dành cho quản trị viên, biên tập viên và kiểm duyệt viên. Tài khoản do quản trị viên cấp.' : 'Chào mừng bạn quay lại ' + esc(wordmark()) + '!') + '</p></div>' +
      '<div id="form-msg" role="alert" aria-live="polite"></div><form id="f-login" novalidate><div class="lgf">' + I('mail', 'lgi') + '<input class="field" id="email" type="email" placeholder="Email" aria-label="Email" autocomplete="username" value="' + esc(le) + '"></div><div id="e-email" class="lg-err"></div>' + pwField('password', 'Mật khẩu', 'Mật khẩu', 'current-password') + '<div id="caps" class="lg-caps" hidden>Caps Lock đang bật</div><div id="e-password" class="lg-err"></div>' +
      '<button class="go" id="submit">' + lbl + '</button><div class="lg-row"><label><input type="checkbox" id="remember"' + (le ? ' checked' : '') + '> Ghi nhớ đăng nhập</label><button type="button" class="lnk" id="forgot">Quên mật khẩu?</button></div></form>' +
      (staff ? '' : '<div class="lg-or"><span>Hoặc đăng nhập với</span></div><div class="lg-soc">' + ['google', 'facebook', 'apple'].map(function (k) { return '<button type="button" class="lg-s" data-soc="' + k + '" aria-label="Đăng nhập bằng ' + k.charAt(0).toUpperCase() + k.slice(1) + '">' + SOC[k] + '</button>'; }).join('') + '</div>') + quickList() +
      (staff && !ST.hasStaff() ? '<div class="lg-note">Chưa có tài khoản quản trị nào được cấu hình. Chủ hệ thống tạo bằng <b>tools/make-staff.py</b> rồi dán vào <b>assets/site-config.js</b>.</div>' : '') + (staff ? '<div class="lg-note">Chưa có quyền quản trị? Hãy nhờ quản trị viên cấp quyền, hoặc <button type="button" class="lnk" data-who="member">đăng nhập tab Thành viên</button>.</div>' : '<p class="lg-signup">Chưa có tài khoản? <button class="mk" type="button" data-mode="register">Đăng ký ngay ' + I('arrow_forward') + '</button></p>');
  }
  function pwField(id, label, ph, ac) {
    return '<div class="lgf">' + I('lock', 'lgi') + '<input class="field" id="' + id + '" type="password" placeholder="' + ph + '" aria-label="' + label + '" autocomplete="' + ac + '"><button type="button" class="icon-btn lg-eye" data-eye="' + id + '" aria-label="Hiện/ẩn mật khẩu"><span class="material-symbols-outlined">visibility</span></button></div>';
  }
  function registerForm() {
    function tf(id, type, ac, ic, ph) { return '<div class="lgf">' + I(ic, 'lgi') + '<input class="field" id="' + id + '" type="' + type + '" autocomplete="' + ac + '" placeholder="' + ph + '" aria-label="' + ph + '"></div>'; }
    return '<div class="lg-head"><h2>Đăng ký</h2><p>Mất chưa tới một phút. Dữ liệu được lưu trên thiết bị này.</p></div><div id="form-msg" role="alert"></div><form id="f-reg" novalidate>' +
      tf('r-name', 'text', 'name', 'person', 'Họ và tên') + '<div id="e-name" class="lg-err"></div>' + tf('r-email', 'email', 'email', 'mail', 'Email') + '<div id="e-email" class="lg-err"></div>' +
      pwField('r-pw', 'Mật khẩu mới', 'Mật khẩu mới (từ 8 ký tự, có chữ và số)', 'new-password') + '<div id="e-pw" class="lg-err"></div>' + pwField('r-pw2', 'Nhập lại mật khẩu', 'Nhập lại mật khẩu', 'new-password') + '<div id="e-pw2" class="lg-err"></div>' +
      '<label class="lg-agree"><input type="checkbox" id="r-agree"><span>Tôi hiểu ' + esc(wordmark()) + ' chỉ hỗ trợ luyện tập, không thay thế tư vấn y tế, và đồng ý lưu dữ liệu trên thiết bị này.</span></label><div id="e-agree" class="lg-err"></div>' +
      '<button class="go" id="submit">Tạo tài khoản</button></form><p class="lg-signup">Bạn đã có tài khoản? <button class="lnk" type="button" data-mode="login">Đăng nhập ' + I('arrow_forward') + '</button></p>';
  }
  function setErr(id, msg) { var el = $('#e-' + id); if (el) el.innerHTML = msg ? '<div class="err-txt">' + esc(msg) + '</div>' : ''; var inp = $('#' + ({ name: 'r-name', pw: 'r-pw', pw2: 'r-pw2' }[id] || (mode === 'register' && id === 'email' ? 'r-email' : id))); if (inp) inp.classList.toggle('bad', !!msg); }
  function msg(type, text) { $('#form-msg').innerHTML = text ? '<div class="alert alert-' + type + '" style="margin-bottom:14px"><span class="material-symbols-outlined fill">' + (type === 3 ? 'error' : type === 1 ? 'check_circle' : 'info') + '</span><div>' + esc(text) + '</div></div>' : ''; }
  function busy(on, label) { var b = $('#submit'); b.disabled = on; b.innerHTML = on ? '<span class="material-symbols-outlined" style="animation:sk 1s linear infinite">progress_activity</span> Đang xử lý…' : label; }
  function done() { location.href = dest(); }
  function cooldown() {
    var b = $('#submit'); if (!b) return; var left = Math.ceil((LG.until - Date.now()) / 1000);
    if (left <= 0) { b.disabled = false; b.textContent = who === 'staff' ? 'Đăng nhập quản trị' : 'Đăng nhập'; document.querySelectorAll('[data-quick]').forEach(function (q) { q.disabled = false; }); return; }
    b.disabled = true; b.textContent = 'Thử lại sau ' + left + ' giây'; document.querySelectorAll('[data-quick]').forEach(function (q) { q.disabled = true; }); setTimeout(cooldown, 500);
  }
  function fail(r) {
    if (r.code === 'locked') { msg(3, r.message); return; }
    LG.n++; if (LG.n >= 5) { LG.until = Date.now() + 30000; LG.n = 0; msg(3, 'Bạn đã nhập sai nhiều lần. Vui lòng chờ 30 giây rồi thử lại.'); } else msg(3, r.message + ' Nếu quên mật khẩu, hãy dùng "Quên mật khẩu?".' + (LG.n >= 3 ? ' (Còn ' + (5 - LG.n) + ' lần thử.)' : ''));
    saveLG(); cooldown();
  }
  function doLogin(email, pw, remember, label, quickBtn, demoRole) {
    if (Date.now() < LG.until) return; busy(true, label); document.querySelectorAll('[data-quick]').forEach(function (q) { q.disabled = true; });
    var req = demoRole ? ST.demoLogin(demoRole) : ST.login(email, pw, remember, who === 'staff' ? 'staff' : 'member');
    req.then(function (r) {
      document.querySelectorAll('[data-quick]').forEach(function (q) { q.disabled = false; });
      if (!r.ok) { busy(false, label); if (quickBtn) msg(3, r.message); else fail(r); return; }
      ST.loadUser(); var u = ST.user;
      if (who === 'staff' && !isStaff(u)) { ST.logout(); busy(false, label); msg(3, 'Tài khoản này chưa có quyền quản trị. Hãy nhờ quản trị viên cấp quyền, hoặc đăng nhập ở tab Thành viên.'); return; }
      if (demoRole === 'admin') demoDest = 'admin.html';
      LG = { n: 0, until: 0 }; saveLG(); if (!demoRole) { try { if (remember) localStorage.setItem('disci:lastEmail', String(email).trim().toLowerCase()); else localStorage.removeItem('disci:lastEmail'); } catch (e) {} }
      msg(1, 'Xin chào ' + u.name + ' (' + roleName(u) + '). Đang chuyển tới ' + destName() + '…'); setTimeout(done, 350);
    });
  }
  function setQuery() { var q = new URLSearchParams(); if (who === 'staff') q.set('mode', 'admin'); if (next) q.set('next', next); try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) {} }

  function wire() {
    document.querySelectorAll('[data-who]').forEach(function (b) { b.addEventListener('click', function () { prevWho = who; who = b.dataset.who; mode = 'login'; setQuery(); render(); }); });
    var sw = $('#sw-login'); if (sw) sw.addEventListener('click', function () { ST.logout(); switchCard = false; render(); });
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.mode; render(); }); });
    document.querySelectorAll('[data-eye]').forEach(function (b) { b.addEventListener('click', function () { var i = $('#' + b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.firstChild.textContent = i.type === 'password' ? 'visibility' : 'visibility_off'; i.focus(); }); });
    if (switchCard) return;
    if (mode === 'login') {
      document.querySelectorAll('[data-soc]').forEach(function (b) { b.addEventListener('click', function () { msg('info', 'Đăng nhập bằng ' + b.dataset.soc.charAt(0).toUpperCase() + b.dataset.soc.slice(1) + ' chưa được hỗ trợ (cần backend OAuth). Hãy dùng email hoặc tài khoản demo.'); }); });
      var pw = $('#password'); pw.addEventListener('keyup', function (e) { var on = e.getModifierState && e.getModifierState('CapsLock'); $('#caps').hidden = !on; }); pw.addEventListener('blur', function () { $('#caps').hidden = true; });
      document.querySelectorAll('[data-quick]').forEach(function (q) { q.addEventListener('click', function () { msg(0, ''); doLogin('', '', false, who === 'staff' ? 'Đăng nhập quản trị' : 'Đăng nhập', true, q.dataset.quick === 'admin' ? 'admin' : 'user'); }); });
      $('#forgot').addEventListener('click', forgot);
      $('#f-login').addEventListener('submit', function (e) {
        e.preventDefault(); msg(0, ''); setErr('email', ''); setErr('password', '');
        var email = $('#email').value, pw2 = $('#password').value, bad = false;
        if (!ST.validEmail(email)) { setErr('email', 'Email chưa đúng định dạng.'); bad = true; }
        if (!pw2) { setErr('password', 'Vui lòng nhập mật khẩu.'); bad = true; }
        if (bad) return; doLogin(email, pw2, $('#remember').checked, who === 'staff' ? 'Đăng nhập quản trị' : 'Đăng nhập');
      });
      cooldown();
    } else {
      $('#f-reg').addEventListener('submit', function (e) {
        e.preventDefault(); msg(0, ''); ['name', 'email', 'pw', 'pw2', 'agree'].forEach(function (k) { setErr(k, ''); });
        var n = $('#r-name').value, em = $('#r-email').value, p1 = $('#r-pw').value, p2 = $('#r-pw2').value, bad = false;
        if (p1 !== p2) { setErr('pw2', 'Mật khẩu nhập lại không khớp.'); bad = true; }
        if (!$('#r-agree').checked) { setErr('agree', 'Vui lòng xác nhận để tiếp tục.'); bad = true; }
        if (bad) return;
        busy(true); ST.register(n, em, p1).then(function (r) {
          if (r.ok) { msg(1, 'Tạo tài khoản thành công!'); setTimeout(function () { location.href = flowPage('afterRegister') || 'onboarding.html'; }, 500); }
          else { busy(false, 'Tạo tài khoản'); Object.keys(r.errors).forEach(function (k) { setErr(k, r.errors[k]); }); }
        });
      });
    }
  }
  function forgot() {
    if (who === 'staff') { msg(3, 'Tài khoản quản trị không đặt lại mật khẩu qua trang này. Hãy liên hệ quản trị viên hệ thống.'); return; }
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box"><h3>Đặt lại mật khẩu</h3><p class="sub">Nhập email đã đăng ký. DISCI sẽ gửi một liên kết đặt lại mật khẩu tới hộp thư của bạn.</p><div id="fm"></div><label class="lbl" for="fp-email">Email tài khoản</label><input class="field" id="fp-email" type="email" autocomplete="email"><div class="row"><button class="btn" id="fp-x">Hủy</button><button class="btn btn-pri" id="fp-ok">Gửi liên kết</button></div></div>';
    document.body.appendChild(m); $('#fp-x', m).onclick = function () { m.remove(); }; m.addEventListener('mousedown', function (e) { if (e.target === m) m.remove(); });
    $('#fp-ok', m).onclick = function () {
      var b = $('#fp-ok', m); b.disabled = true;
      ST.forgotPassword($('#fp-email', m).value).then(function (r) {
        b.disabled = false;
        if (r.ok) { m.remove(); msg(1, r.message); } else $('#fm', m).innerHTML = '<div class="alert alert-3" style="margin-bottom:8px">' + esc(r.message) + '</div>';
      });
    };
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(function (n) { n.remove(); }); });
  ST.ensureDemoAccount().then(function () { return ST.ensureAdminAccount(); }).then(render);
})();
