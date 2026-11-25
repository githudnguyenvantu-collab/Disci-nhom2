/* =====================================================================
   DISCI STORE – tài khoản, phiên, dữ liệu người dùng (localStorage), đồng ý dữ liệu sức khỏe, lịch sử thay đổi lịch.
   BẢN ASP.NET CORE MVC: tài khoản/phiên/phân quyền do máy chủ (Identity) quản lý; dữ liệu người dùng lưu trong SQL Server qua /api/state.
   Giữ nguyên API đồng bộ (S, save, derive, createPlan...) để toàn bộ giao diện cũ hoạt động như trước.
   ===================================================================== */
(function (root) {
  'use strict';
  var E = root.DISCI_ENGINE, D = root.DISCI_DATA;
  var K = { users: 'disci:users', session: 'disci:session', as: 'disci:as', theme: 'disci:theme', udata: function (id) { return 'disci:u:' + id; } };
  var S = null, USER = null, REAL = null; /* REAL: quản trị viên thật khi đang nhập vai tài khoản clone */

  function ls(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lw(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { if (root.DISCI && root.DISCI.toast) root.DISCI.toast('Bộ nhớ trình duyệt đã đầy – không thể lưu. Hãy xóa bớt ảnh/dữ liệu.', 'err'); return false; } }
  function sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

  /* ---------- Băm mật khẩu ---------- */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha256js(str) { // dự phòng khi môi trường không có SubtleCrypto
    function r(n, x) { return (x >>> n) | (x << (32 - n)); }
    var m = Math.pow, mx = m(2, 32), i, j, res = '', w = [], H = sha256js.h = sha256js.h || [], k = sha256js.k = sha256js.k || [], pc = k.length, ic = {};
    for (var c = 2; pc < 64; c++) if (!ic[c]) { for (i = 0; i < 313; i += c) ic[i] = c; H[pc] = (m(c, .5) * mx) | 0; k[pc++] = (m(c, 1 / 3) * mx) | 0; }
    var s = unescape(encodeURIComponent(str)) + '\x80', l = s.length; while (s.length % 64 - 56) s += '\x00';
    for (i = 0; i < s.length; i++) { j = s.charCodeAt(i); w[i >> 2] |= j << ((3 - i) % 4) * 8; }
    w[w.length] = ((l - 1) / mx) | 0; w[w.length] = (l - 1) * 8;
    var h = H.slice(0, 8);
    for (j = 0; j < w.length;) {
      var ww = w.slice(j, j += 16), old = h; h = h.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = ww[i - 15], w2 = ww[i - 2], a = h[0], e = h[4];
        var t1 = h[7] + (r(6, e) ^ r(11, e) ^ r(25, e)) + ((e & h[5]) ^ (~e & h[6])) + k[i] + (ww[i] = (i < 16) ? ww[i] : (ww[i - 16] + (r(7, w15) ^ r(18, w15) ^ (w15 >>> 3)) + ww[i - 7] + (r(17, w2) ^ r(19, w2) ^ (w2 >>> 10))) | 0);
        var t2 = (r(2, a) ^ r(13, a) ^ r(22, a)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(t1 + t2) | 0].concat(h); h[4] = (h[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) h[i] = (h[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (h[i] >> (j * 8)) & 255; res += ((b < 16) ? 0 : '') + b.toString(16); }
    return res;
  }
  function hashPw(pw, salt) {
    var c = root.crypto;
    if (c && c.subtle && c.subtle.importKey) {
      var enc = new TextEncoder();
      return c.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (key) {
        return c.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
      }).then(function (b) { return 'p2:' + hex(b); });
    }
    var h = salt + pw; for (var i = 0; i < 3000; i++) h = sha256js(h + salt); return Promise.resolve('sj:' + h);
  }
  function newSalt() { var a = new Uint8Array(16); (root.crypto && root.crypto.getRandomValues) ? root.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return hex(a); }
  function strongPw(p) { return typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim()); }

  /* ---------- Dữ liệu mặc định của một người dùng ---------- */
  function blank(name, email) {
    return {
      v: 2, onboarded: false,
      profile: { name: name, email: email, sex: 'female', age: null, height: null, weight: null, goal: 'health', goalWeight: null, daysPerWeek: 3, minutes: 40, place: 'home', equip: [], budget: 500000, space: 'small', activity: 2, level: null, quiet: false, bio: '', phone: '', area: '', avatar: '', birth: '' },
      metrics: [], health: { records: [], restrictions: [], notes: '', consents: {} }, checkins: [],
      plan: null, planHistory: [], sessions: [], moves: {}, restDays: {}, custom: [],
      cart: [], orders: [], address: { name: '', phone: '', line: '' },
      nutritionLog: {}, nutritionPrefs: { seed: 0 },
      posts: [], likes: {}, comments: {}, follows: {}, friends: {}, reports: [], hidden: [], saved: [], challenges: { joined: {}, manual: {} }, groups: [], messages: {},
      notifications: [], reminderFired: {},
      settings: { theme: 'dark', lang: 'vi', remind: true, remindTime: '18:00', notifyPush: false, privacy: { showProfile: true, showStats: true, showBoard: true } },
      productSaved: [], gymMonthly: 350000, demoLoaded: false
    };
  }
  function migrate(d) { var b = blank(d.profile && d.profile.name, d.profile && d.profile.email); Object.keys(b).forEach(function (k) { if (d[k] === undefined) d[k] = b[k]; }); Object.keys(b.profile).forEach(function (k) { if (d.profile[k] === undefined) d.profile[k] = b.profile[k]; }); Object.keys(b.settings).forEach(function (k) { if (d.settings[k] === undefined) d.settings[k] = b.settings[k]; }); return d; }

  /* ---------- Phiên & tài khoản ---------- */
  function users() { return ls(K.users, []); }
/* ---------- TÀI KHOẢN & LƯU TRỮ: kết nối ASP.NET Core ----------
   Từ phiên bản MVC: tài khoản, phiên đăng nhập, băm mật khẩu và phân quyền do máy chủ (ASP.NET Core Identity) đảm nhiệm.
   Dữ liệu người dùng được máy chủ nhúng vào trang (window.DISCI_BOOT) và ghi ngược lên SQL Server qua /api/state (chỉ gửi khóa thay đổi).
   localStorage chỉ còn dùng cho chủ đề giao diện và thiết lập UI. Vai trò/quyền thật được kiểm tra ở backend, không phải ở đây. */
  var STAFF_ROLES = ['admin', 'editor', 'moderator'];
  function isStaffRole(r) { return STAFF_ROLES.indexOf(r) >= 0; }
  function hasStaff() { return true; }                 /* tài khoản quản trị do máy chủ quản lý */
  function seedStaff() { return Promise.resolve(); }
  var BOOT = root.DISCI_BOOT || null, CSRF = root.DISCI_CSRF || '', VER = 0, SYNCED = {}, pushTimer = null, pushing = null, retryMs = 0, offlineToasted = false;

  function api(method, url, body, opt) {
    var init = { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': CSRF } };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (opt && opt.keepalive) init.keepalive = true;
    return root.fetch(url, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.__status = r.status; return j; }); });
  }
  function toastErr(m) { try { if (root.DISCI && root.DISCI.toast) root.DISCI.toast(m, 'err'); } catch (e) {} }
  function pendKey() { return 'disci:pend:' + (USER ? USER.id : ''); }
  function snapshot() { var o = {}; Object.keys(S).forEach(function (k) { o[k] = JSON.stringify(S[k]); }); return o; }
  function changedKeys() { var ch = null; Object.keys(S).forEach(function (k) { var j = JSON.stringify(S[k]); if (j !== undefined && SYNCED[k] !== j) { (ch = ch || {})[k] = j; } }); return ch; }
  function bodyOf(ch) { return '{"keys":{' + Object.keys(ch).map(function (k) { return JSON.stringify(k) + ':' + ch[k]; }).join(',') + '}}'; }

  function loadUser() {
    REAL = null; if (!BOOT || !BOOT.user) return false;
    USER = BOOT.user; VER = BOOT.version || 0;
    S = migrate(JSON.parse(JSON.stringify(BOOT.state || blank(USER.name, USER.email))));
    S.profile.name = S.profile.name || USER.name; S.profile.email = USER.email;
    SYNCED = snapshot();
    /* Thay đổi chưa kịp ghi lên máy chủ trước khi chuyển trang (lưu tạm trong sessionStorage của tab này) được áp lại rồi ghi tiếp. */
    try {
      var pend = JSON.parse(sessionStorage.getItem(pendKey()) || 'null');
      if (pend) { Object.keys(pend).forEach(function (k) { try { S[k] = JSON.parse(pend[k]); } catch (e) {} }); schedule(); }
    } catch (e) {}
    return true;
  }

  function schedule() { clearTimeout(pushTimer); pushTimer = setTimeout(function () { flush(); }, 300); }
  function save() {
    if (!USER || !S) return false; if (REAL) return true;
    var ch = changedKeys();
    if (ch) { try { sessionStorage.setItem(pendKey(), JSON.stringify(ch)); } catch (e) {} schedule(); }
    return true;
  }
  function retry() {
    retryMs = Math.min(30000, (retryMs || 2000) * 2);
    if (!offlineToasted) { offlineToasted = true; toastErr('Không kết nối được máy chủ – DISCI sẽ tự thử lưu lại.'); }
    setTimeout(function () { flush(); }, retryMs); return false;
  }
  function flush(opt) {
    clearTimeout(pushTimer);
    if (!USER || !S || REAL) return Promise.resolve(true);
    if (pushing) return pushing.then(function () { return flush(opt); });
    var ch = changedKeys(); if (!ch) { try { sessionStorage.removeItem(pendKey()); } catch (e) {} return Promise.resolve(true); }
    var body = bodyOf(ch), pk = pendKey();
    pushing = api('PUT', '/api/state', body, (opt && opt.unload && body.length < 60000) ? { keepalive: true } : undefined).then(function (j) {
      pushing = null;
      if (j.ok) {
        Object.keys(ch).forEach(function (k) { SYNCED[k] = ch[k]; }); VER = j.version || VER; retryMs = 0; offlineToasted = false;
        try { if (changedKeys()) sessionStorage.setItem(pk, JSON.stringify(changedKeys())); else sessionStorage.removeItem(pk); } catch (e) {}
        if (changedKeys()) schedule(); return true;
      }
      if (j.__status === 401) { root.location.href = 'index.html'; return false; }
      if (j.__status === 422 || j.__status === 400) {   /* máy chủ từ chối dữ liệu: báo lỗi, không thử lại vô hạn */
        toastErr(j.message || 'Dữ liệu không hợp lệ nên chưa được lưu lên máy chủ.');
        Object.keys(ch).forEach(function (k) { SYNCED[k] = ch[k]; }); try { sessionStorage.removeItem(pk); } catch (e) {} return false;
      }
      return retry();
    }, function () { pushing = null; return retry(); });
    return pushing;
  }
  if (root.addEventListener) root.addEventListener('pagehide', function () { clearTimeout(pushTimer); flush({ unload: true }); });
  if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'hidden') flush({ unload: true }); });

  function adopt(r) { BOOT = { user: r.user, state: r.state, version: r.version }; if (r.csrf) { CSRF = r.csrf; root.DISCI_CSRF = r.csrf; } loadUser(); }
  var NETERR = 'Không kết nối được máy chủ. Vui lòng thử lại.', STALE = 'Phiên làm việc đã hết hạn. Hãy tải lại trang rồi thử lại.';

  function register(name, email, pw) {
    name = (name || '').trim(); email = (email || '').trim().toLowerCase();
    var errs = {};
    if (name.length < 2) errs.name = 'Họ tên cần ít nhất 2 ký tự.';
    if (!validEmail(email)) errs.email = 'Email chưa đúng định dạng.';
    if (!strongPw(pw)) errs.pw = 'Mật khẩu cần ≥ 8 ký tự, gồm chữ và số.';
    if (Object.keys(errs).length) return Promise.resolve({ ok: false, errors: errs });
    return api('POST', '/Account/RegisterApi', { name: name, email: email, password: pw }).then(function (r) {
      if (r.ok) { adopt(r); return { ok: true }; }
      return { ok: false, errors: r.errors || { email: r.__status === 400 ? STALE : NETERR } };
    }, function () { return { ok: false, errors: { email: NETERR } }; });
  }
  /* who: 'staff' → đăng nhập quản trị (/Admin/LoginApi); mặc định → thành viên. Máy chủ luôn kiểm tra vai trò thật. */
  function login(email, pw, remember, who) {
    email = (email || '').trim().toLowerCase();
    if (!validEmail(email) || !pw) return Promise.resolve({ ok: false, code: 'validation', message: 'Vui lòng nhập email hợp lệ và mật khẩu.' });
    return api('POST', who === 'staff' ? '/Admin/LoginApi' : '/Account/LoginApi', { email: email, password: pw, remember: !!remember }).then(function (r) {
      if (r.ok) { adopt(r); return { ok: true }; }
      return { ok: false, code: r.code || 'auth', message: r.message || (r.__status === 400 ? STALE : NETERR) };
    }, function () { return { ok: false, code: 'network', message: NETERR }; });
  }
  /* Nút "Đăng nhập demo" (chỉ môi trường Development): máy chủ tự đăng nhập tài khoản người dùng demo ('user') hoặc quản trị demo ('admin'). */
  function demoLogin(role) {
    return api('POST', '/Account/DemoLoginApi', { role: role === 'admin' ? 'admin' : 'user' }).then(function (r) {
      if (r.ok) { adopt(r); return { ok: true }; }
      return { ok: false, code: r.code || 'auth', message: r.message || (r.__status === 404 ? 'Đăng nhập demo chỉ có ở môi trường Development.' : NETERR) };
    }, function () { return { ok: false, code: 'network', message: NETERR }; });
  }
  function logout() {
    var ch = (USER && S && !REAL) ? changedKeys() : null, body = ch ? bodyOf(ch) : '{}';
    try { api('POST', '/Account/LogoutApi', body, { keepalive: body.length < 60000 }).catch(function () {}); } catch (e) {}
    try { sessionStorage.removeItem(K.as); if (USER) sessionStorage.removeItem(pendKey()); } catch (e) {}
    clearTimeout(pushTimer); S = null; USER = null; REAL = null; BOOT = null; SYNCED = {};
  }
  function changePassword(oldPw, newPw) {
    if (!strongPw(newPw)) return Promise.resolve({ ok: false, message: 'Mật khẩu mới cần ≥ 8 ký tự, gồm chữ và số.' });
    return api('POST', '/Account/ChangePasswordApi', { current: oldPw, next: newPw }).then(function (r) { return r.ok ? { ok: true } : { ok: false, message: r.message || (r.__status === 400 ? STALE : NETERR) }; }, function () { return { ok: false, message: NETERR }; });
  }
  /* Quên mật khẩu: máy chủ gửi liên kết đặt lại qua email (luôn trả cùng một thông điệp, không tiết lộ email có tồn tại hay không). */
  function forgotPassword(email) {
    email = (email || '').trim().toLowerCase();
    if (!validEmail(email)) return Promise.resolve({ ok: false, message: 'Email chưa đúng định dạng.' });
    return api('POST', '/Account/ForgotPasswordApi', { email: email }).then(function (r) { return r.ok ? { ok: true, message: r.message } : { ok: false, message: STALE }; }, function () { return { ok: false, message: NETERR }; });
  }
  function resetPasswordLocal(email) { return forgotPassword(email); }
  function deleteAccount() {
    if (REAL) { purgeCloneData(USER.id); stopActAs(); return; }
    var id = USER.id; try { if (root.DISCI.media) root.DISCI.media.clearUser(id); } catch (e) {}
    try { api('POST', '/Account/DeleteApi', '{}', { keepalive: true }).catch(function () {}); } catch (e) {}
    try { sessionStorage.removeItem(pendKey()); } catch (e) {}
    clearTimeout(pushTimer); S = null; USER = null; REAL = null; BOOT = null; SYNCED = {};
  }

  function wipeData() { if (root.DISCI.media) root.DISCI.media.clearUser(USER.id); var p = S.profile; S = blank(p.name, p.email); S.profile.email = p.email; save(); }
  function exportData() { return JSON.stringify({ exportedAt: new Date().toISOString(), app: 'DISCI', note: 'Video đã đăng được lưu riêng trong IndexedDB của trình duyệt và không nằm trong tệp này.', account: { name: USER.name, email: USER.email }, data: S }, null, 2); }

  /* ---------- Thông báo ---------- */
  function mkNotif(icon, t, d, go) { return { id: uid(), icon: icon, t: t, d: d, go: go || '', at: Date.now(), unread: true }; }
  function notify(icon, t, d, go) { S.notifications.unshift(mkNotif(icon, t, d, go)); S.notifications = S.notifications.slice(0, 40); save(); }

  /* ---------- Chỉ số & đánh giá ---------- */
  function latestMetric() { var m = S.metrics.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.at - b.at; }); return m[m.length - 1] || null; }
  function today() { return E.todayStr(); }
  function recentCheckin() { var t = today(); return S.checkins.filter(function (c) { return c.date === t; }).pop() || null; }
  function consentOn(k) { return !!(S.health.consents[k] && S.health.consents[k].granted); }
  function latestRecord(type) { var r = S.health.records.filter(function (x) { return x.type === type; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); return r[r.length - 1] || null; }
  function riskInput() {
    var p = S.profile, lm = latestMetric(), w = (lm && lm.weight) || p.weight, h = p.height, inp = { age: p.age || null, bmi: E.bmi(w, h) }, bp = consentOn('bp') ? latestRecord('bp') : null, rhr = consentOn('rhr') ? latestRecord('rhr') : null;
    if (bp) { var pb = E.parseBP(bp.value); if (pb) { inp.sbp = pb.sbp; inp.dbp = pb.dbp; } }
    if (rhr && +rhr.value > 0) inp.rhr = +rhr.value;
    inp.restrictions = consentOn('checkup') ? (S.health.restrictions || []).slice() : [];
    var c = recentCheckin(); inp.symptoms = c ? { pain: !!c.pain, fatigue: !!c.fatigue, chest: !!c.chest, dizzy: !!c.dizzy, breath: !!c.breath } : {};
    return inp;
  }
  function risk() { return E.assessRisk(riskInput()); }
  function derive() {
    var p = S.profile, lm = latestMetric(), w = (lm && lm.weight) || p.weight || null, h = p.height || null, b = E.bmi(w, h), r = risk();
    var nut = E.nutritionAdvice({ weight: w, height: h, age: p.age, sex: p.sex, activity: p.activity, goal: p.goal }, r);
    return { weight: w, height: h, age: p.age, bmi: b, bmiCat: E.bmiCategory(b), tdee: nut.blocked ? (w && h && p.age ? E.tdee(p.sex, w, h, p.age, p.activity) : null) : nut.tdee, kcal: nut.blocked ? null : nut.kcal, protein: nut.blocked ? null : nut.protein, nutBlocked: nut.blocked, nutReason: nut.reason,
      risk: r, hasProfile: !!(w && h && p.age), rhr: consentOn('rhr') && latestRecord('rhr') ? +latestRecord('rhr').value : null, bp: consentOn('bp') && latestRecord('bp') ? latestRecord('bp').value : null };
  }
  function profileForPlan() { var p = S.profile; return { goal: p.goal, daysPerWeek: p.daysPerWeek, minutes: p.minutes, equip: p.equip, activity: p.activity, level: p.level, quiet: p.quiet, place: p.place }; }

  /* ---------- Lịch tập: tạo / thích ứng / lưu lịch sử (không ghi đè lịch cũ) ---------- */
  function pushHistory(reason, oldPlan, changes) {
    S.planHistory.unshift({ id: uid(), at: Date.now(), reason: reason, changes: changes || [], plan: oldPlan });
    S.planHistory = S.planHistory.slice(0, 20);
  }
  function createPlan(reason) {
    var d = derive(); if (!d.hasProfile) return { ok: false, message: 'Hãy nhập chiều cao, cân nặng và tuổi trước khi tạo lịch.' };
    var np = E.generatePlan(profileForPlan(), d.risk, Date.now());
    if (S.plan) pushHistory(reason || 'Tạo lại lịch tập', S.plan, [{ from: 'Lịch phiên bản ' + S.plan.version, to: 'Lịch mới ' + np.daysPerWeek + ' buổi/tuần', why: reason || 'Bạn yêu cầu tạo lại lịch.', benefit: 'Phù hợp với hồ sơ hiện tại.' }]);
    np.version = S.plan ? S.plan.version + 1 : 1; S.plan = np; save(); return { ok: true, plan: np, risk: d.risk };
  }
  /* Gọi sau khi thể trạng/khuyến cáo/check-in/dụng cụ thay đổi. Trả về mô tả thay đổi để hiển thị. */
  function recompute(reason) {
    var d = derive(); if (!d.hasProfile) return { risk: d.risk, changes: [], created: false };
    if (!S.plan) { var r0 = createPlan('Tạo lịch lần đầu'); return { risk: d.risk, changes: [], created: true }; }
    if (S.plan.level > d.risk.level) { // mức cảnh báo GIẢM → không giữ lịch "nhẹ" cũ, tạo lại lịch phù hợp mức mới (lịch cũ vào lịch sử)
      var before = S.plan.level, rg = createPlan('Mức cảnh báo giảm từ ' + before + ' xuống ' + d.risk.level + ': tạo lại lịch phù hợp');
      if (rg.ok) { var ch = (S.planHistory[0] && S.planHistory[0].changes) || []; ch.forEach(function (c) { c.why = 'Mức cảnh báo giảm từ ' + before + ' xuống ' + d.risk.level + ' (' + (reason || 'cập nhật dữ liệu') + ').'; c.benefit = 'Lịch tập trở lại phù hợp với mức an toàn mới; lịch nhẹ cũ vẫn được lưu trong lịch sử.'; }); notify('autorenew', 'Lịch tập đã được cập nhật', 'Mức cảnh báo giảm – lịch được tạo lại phù hợp.', 'schedule.html'); save(); return { risk: d.risk, changes: ch, created: false }; }
    }
    var res = E.adaptPlan(S.plan, profileForPlan(), d.risk, Date.now());
    if (res.changes.length || S.plan.level !== d.risk.level) {
      pushHistory(reason || 'Cập nhật thể trạng', S.plan, res.changes);
      var nextVersion = S.plan.version + 1; res.plan.version = nextVersion; S.plan = res.plan;
      if (res.changes.length) notify('autorenew', 'Lịch tập đã được điều chỉnh', res.changes.length + ' thay đổi – xem lý do trong Lịch tập › Lịch sử thay đổi.', 'schedule.html');
      save(); return { risk: d.risk, changes: res.changes, created: false };
    }
    save(); return { risk: d.risk, changes: [], created: false };
  }
  function dayFor(date) {
    if (!S.plan) return null; var wd = E.dow(date), base = S.plan.days[wd], out = JSON.parse(JSON.stringify(base)); out.date = date;
    if (S.moves[date]) { out.type = 'rest'; out.title = 'Ngày nghỉ (đã đổi lịch)'; out.exs = []; out.minutes = 0; out.movedTo = S.moves[date]; }
    var from = Object.keys(S.moves).filter(function (f) { return S.moves[f] === date; })[0];
    if (from) { var fb = JSON.parse(JSON.stringify(S.plan.days[E.dow(from)])); fb.date = date; fb.movedFrom = from; out = fb; }
    if (S.restDays[date]) { out.type = 'rest'; out.title = 'Ngày nghỉ (bạn đã đánh dấu)'; out.exs = []; out.minutes = 0; out.markedRest = true; }
    var cus = S.custom.filter(function (c) { return c.date === date; });
    out.custom = cus;
    var sess = S.sessions.filter(function (s) { return s.date === date && s.status === 'done'; });
    out.sessions = sess; out.status = sess.length ? 'done' : out.type === 'rest' && !cus.length ? 'rest' : (date < today() ? 'missed' : 'upcoming');
    return out;
  }
  function missedDays() { // các buổi theo lịch đã qua mà chưa tập & chưa xử lý
    if (!S.plan) return []; var t = today(), ws = E.weekStart(t), out = [], i;
    for (i = 0; i < 7; i++) { var d = E.addDays(ws, i); if (d >= t) break; var x = dayFor(d); if (x && x.type === 'workout' && x.status === 'missed' && !S.restDays[d] && !(S.skippedHandled || {})[d]) out.push(d); }
    return out;
  }
  function logSession(o) {
    var d = derive(), cal = E.sessionCalories(d.weight || 60, o.exs || [], o.minutes);
    var s = { id: uid(), date: o.date || today(), title: o.title, minutes: Math.max(1, Math.round(o.minutes)), calories: cal, rpe: o.rpe || null, exs: o.exs || [], status: 'done', at: Date.now(), demo: !!o.demo };
    S.sessions.push(s); save(); return s;
  }
  function stats() {
    var m = S.metrics.length, ss = S.sessions.filter(function (s) { return s.status === 'done'; }), st = E.streakOf(S.sessions, today());
    var lm = latestMetric(), gw = S.profile.goalWeight;
    return { sessions: ss.length, streak: st.current, minutes: ss.reduce(function (a, b) { return a + b.minutes; }, 0), metrics: m, goalReached: !!(gw && lm && lm.weight && ((S.profile.goal === 'fatloss' && lm.weight <= gw) || (S.profile.goal !== 'fatloss' && Math.abs(lm.weight - gw) <= 0.3))) };
  }

  /* ---------- Số liệu demo (được gắn nhãn rõ) ---------- */
  function loadDemo() {
    var t = today(), i; if (!S.profile.height) { S.profile.height = 165; S.profile.age = 22; S.profile.weight = 65; S.profile.goalWeight = 60; S.profile.goal = 'fatloss'; S.profile.equip = ['band', 'dumbbell']; S.profile.daysPerWeek = 4; S.profile.minutes = 40; }
    S.metrics = S.metrics.filter(function (m) { return !m.demo; });
    for (i = 8; i >= 0; i--) S.metrics.push({ id: uid(), date: E.addDays(t, -i * 7), weight: Math.round((66.8 - (8 - i) * 0.25) * 10) / 10, waist: 74 - (8 - i) * 0.4, hip: 96, note: '', at: Date.now(), demo: true });
    S.sessions = S.sessions.filter(function (s) { return !s.demo; });
    var offs = [20, 18, 16, 13, 11, 9, 6, 4, 2, 1];
    offs.forEach(function (o, k) { S.sessions.push({ id: uid(), date: E.addDays(t, -o), title: ['Thân trên', 'Thân dưới', 'Cardio nhẹ – vừa', 'Toàn thân'][k % 4], minutes: 30 + (k % 3) * 8, calories: 140 + k * 12, rpe: 6 + (k % 3), exs: [], status: 'done', at: Date.now(), demo: true }); });
    S.demoLoaded = true; if (!S.plan) createPlan('Tạo lịch từ dữ liệu demo'); save();
  }
  function clearDemo() { S.metrics = S.metrics.filter(function (m) { return !m.demo; }); S.sessions = S.sessions.filter(function (s) { return !s.demo; }); S.demoLoaded = false; save(); }
  function ensureDemoAccount() { return Promise.resolve(); } /* tài khoản demo (nếu bật) do máy chủ seed ở môi trường Development */

  /* Tài khoản quản trị gốc (chỉ tạo nếu chưa có). Mật khẩu mặc định chỉ để chạy thử – giao diện Admin buộc đổi ở lần đầu. */
  function ensureAdminAccount() { return seedStaff(); } /* giữ tên cũ cho trang đăng nhập; KHÔNG còn tạo tài khoản mặc định */
    function saveUsers(list) { return lw(K.users, list); }
  function udataOf(id) { var raw = ls(K.udata(id), null); return raw ? migrate(raw) : null; }
  function writeUdata(id, d) { return lw(K.udata(id), d); }

  /* ---------- Tài khoản CLONE (DEMO) do admin tạo: chỉ admin được nhập vai ---------- */
  function isAdminUser(u) { return !!u && u.role === 'admin' && !u.locked; }
  function cloneRecord(id) { var p = ls('disci:plat', null); return (p && Array.isArray(p.users) && p.users.filter(function (x) { return x && x.id === id && x.demo; })[0]) || null; }
  function cloneAccount(d) { return { id: d.id, name: d.name, email: d.email, role: 'user', demo: true, clone: true, createdAt: Date.now() - (d.joinedAgo || 0) * 864e5 }; }
  function cloneSeed(d) {
    var b = blank(d.name, d.email), p = b.profile, w = d.hist && d.hist.weights && d.hist.weights[d.hist.weights.length - 1];
    p.sex = d.sex || p.sex; p.age = d.age || p.age; p.goal = d.goal || p.goal; p.goalWeight = d.goalWeight || p.goalWeight; p.bio = d.bio || ''; p.avatar = d.avatar || ''; p.cover = d.cover || ''; p.city = d.city || ''; p.area = d.city || '';
    if (w) p.weight = w[1]; b.onboarded = true; return b;
  }
  function forbidden(msg) { var e = new Error(msg || 'Chỉ tài khoản quản trị mới được dùng tài khoản clone.'); e.code = 'forbidden'; return e; }
  function startActAs(demoId) {
    var cur = REAL || USER; if (!isAdminUser(cur)) throw forbidden();
    var real = users().filter(function (x) { return x.id === cur.id; })[0]; if (!isAdminUser(real)) throw forbidden();
    if (!cloneRecord(demoId)) throw new Error('Không tìm thấy tài khoản clone này.');
    sessionStorage.setItem(K.as, JSON.stringify({ demoId: demoId, by: real.id, at: Date.now() })); loadUser(); return true;
  }
  function stopActAs() { try { sessionStorage.removeItem(K.as); } catch (e) {} if (REAL) loadUser(); }
  function actingAs() { return REAL ? { id: USER.id, name: USER.name } : null; }
  /* xóa dữ liệu cá nhân của clone (chỉ khi id đó KHÔNG phải tài khoản thật) */
  function purgeCloneData(id) {
    if (!id || users().some(function (u) { return u.id === id; })) return false;
    try { localStorage.removeItem(K.udata(id)); } catch (e) {}
    try { if (root.DISCI && root.DISCI.media && root.DISCI.media.clearUser) root.DISCI.media.clearUser(id); } catch (e) {}
    return true;
  }

  root.DISCI = root.DISCI || {};
  root.DISCI.store = { get realUser() { return REAL; }, startActAs: startActAs, stopActAs: stopActAs, actingAs: actingAs, purgeCloneData: purgeCloneData, get S() { return S; }, get user() { return USER; }, save: save, flush: flush, forgotPassword: forgotPassword, uid: uid, loadUser: loadUser, register: register, login: login, demoLogin: demoLogin, logout: logout, changePassword: changePassword, resetPasswordLocal: resetPasswordLocal, deleteAccount: deleteAccount, wipeData: wipeData, exportData: exportData,
    validEmail: validEmail, strongPw: strongPw, notify: notify, today: today, latestMetric: latestMetric, latestRecord: latestRecord, consentOn: consentOn, recentCheckin: recentCheckin, risk: risk, riskInput: riskInput, derive: derive, profileForPlan: profileForPlan,
    createPlan: createPlan, recompute: recompute, pushHistory: pushHistory, dayFor: dayFor, missedDays: missedDays, logSession: logSession, stats: stats, loadDemo: loadDemo, clearDemo: clearDemo, ensureDemoAccount: ensureDemoAccount, ensureAdminAccount: ensureAdminAccount, seedStaff: seedStaff, hasStaff: hasStaff, isStaffRole: isStaffRole, users: users, saveUsers: saveUsers, udataOf: udataOf, writeUdata: writeUdata, newSalt: newSalt, hashPw: hashPw, blank: blank, THEME_KEY: K.theme };
})(typeof window !== 'undefined' ? window : globalThis);
