// Kiểm thử bộ chuyển đổi phía trình duyệt (store.js) với máy chủ giả lập. Chạy: node tests/js/store-adapter.test.js
const path = require('path'), assert = require('assert');
const assets = path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets');
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const session = mem(), local = mem();
const calls = [];
let server = { users: { 'a@b.vn': { pw: 'Abcdef12', user: { id: 'u1', name: 'An', email: 'a@b.vn', role: 'user' }, state: { profile: { name: 'An', email: 'a@b.vn' }, notifications: [] } } }, version: 1 };

globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.location = { href: '' };
globalThis.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push({ url, method: init.method, body, keepalive: !!init.keepalive, csrf: init.headers.RequestVerificationToken });
  const res = (status, j) => ({ status, json: async () => j });
  if (url === '/Account/LoginApi' || url === '/Admin/LoginApi') {
    const u = server.users[body.email]; if (!u || u.pw !== body.password) return res(200, { ok: false, code: 'auth', message: 'Email hoặc mật khẩu không chính xác.' });
    return res(200, { ok: true, user: u.user, state: u.state, version: server.version, csrf: 'NEWTOKEN' });
  }
  if (url === '/Account/RegisterApi') return res(200, { ok: false, errors: { email: 'Email này đã được đăng ký.' } });
  if (url === '/api/state' && init.method === 'PUT') { server.version++; Object.assign(server.users['a@b.vn'].state, body.keys); return res(200, { ok: true, version: server.version }); }
  if (url === '/Account/LogoutApi') return res(200, { ok: true });
  return res(404, {});
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fresh(boot) {
  Object.keys(require.cache).filter(k => k.startsWith(assets)).forEach(k => delete require.cache[k]);
  globalThis.DISCI_BOOT = boot; globalThis.DISCI_CSRF = 'TOKEN0'; delete globalThis.DISCI; delete globalThis.DISCI_ENGINE; delete globalThis.DISCI_DATA;
  globalThis.DISCI_DATA = require(path.join(assets, 'data.js')); globalThis.DISCI_ENGINE = require(path.join(assets, 'engine.js')); require(path.join(assets, 'store.js'));
  return globalThis.DISCI.store;
}

(async () => {
  // 1) chưa đăng nhập
  let ST = fresh(null); assert.strictEqual(ST.loadUser(), false);

  // 2) đăng nhập sai / đúng
  let r = await ST.login('a@b.vn', 'sai', false); assert.strictEqual(r.ok, false); assert.ok(/không chính xác/.test(r.message));
  r = await ST.login('khong-phai-email', 'x', false); assert.strictEqual(r.code, 'validation');
  r = await ST.login('a@b.vn', 'Abcdef12', true); assert.strictEqual(r.ok, true);
  assert.strictEqual(ST.user.email, 'a@b.vn'); assert.strictEqual(ST.S.profile.name, 'An');
  assert.strictEqual(ST.S.settings.theme, 'dark', 'migrate() phải điền giá trị mặc định');
  const lg = calls.filter(c => c.url === '/Account/LoginApi').pop(); assert.strictEqual(lg.body.password, 'Abcdef12'); assert.strictEqual(lg.csrf, 'TOKEN0');
  // đăng nhập quản trị đi qua endpoint riêng
  await ST.login('a@b.vn', 'Abcdef12', false, 'staff'); assert.ok(calls.some(c => c.url === '/Admin/LoginApi'));

  // 3) save() chỉ gửi KHÓA THAY ĐỔI, và dùng token CSRF mới sau đăng nhập
  calls.length = 0; ST.S.profile.age = 30; ST.save(); await sleep(450);
  let put = calls.filter(c => c.url === '/api/state'); assert.strictEqual(put.length, 1);
  assert.deepStrictEqual(Object.keys(put[0].body.keys), ['profile']); assert.strictEqual(put[0].body.keys.profile.age, 30); assert.strictEqual(put[0].csrf, 'NEWTOKEN');
  assert.strictEqual(server.users['a@b.vn'].state.profile.age, 30);
  // không thay đổi → không gửi
  calls.length = 0; ST.save(); await sleep(450); assert.strictEqual(calls.length, 0);

  // 4) log buổi tập (logic cũ vẫn chạy) → chỉ khóa sessions được gửi
  ST.S.profile.height = 170; ST.S.profile.weight = 65; await ST.flush(); calls.length = 0;
  const s = ST.logSession({ title: 'Test', minutes: 30, exs: [] }); await sleep(450);
  put = calls.filter(c => c.url === '/api/state'); assert.deepStrictEqual(Object.keys(put[0].body.keys), ['sessions']); assert.strictEqual(put[0].body.keys.sessions[0].id, s.id);

  // 5) chuyển trang ngay sau khi lưu: thay đổi lưu tạm trong sessionStorage rồi áp lại ở trang sau
  ST.S.nutritionPrefs.seed = 7; ST.save();               // chưa kịp debounce
  assert.ok(session.getItem('disci:pend:u1'), 'phải có bản lưu tạm');
  const stale = JSON.parse(JSON.stringify({ user: ST.user, state: { profile: ST.S.profile, nutritionPrefs: { seed: 0 } }, version: 1 }));
  calls.length = 0; ST = fresh(stale); assert.strictEqual(ST.loadUser(), true);
  assert.strictEqual(ST.S.nutritionPrefs.seed, 7, 'trạng thái chưa ghi phải được áp lại trên trang mới');
  await sleep(450); assert.ok(calls.some(c => c.url === '/api/state' && c.body.keys.nutritionPrefs), 'và được ghi tiếp lên máy chủ');
  await sleep(50); assert.strictEqual(session.getItem('disci:pend:u1'), null, 'xóa bản lưu tạm sau khi ghi thành công');

  // 6) đăng xuất gửi kèm khóa chưa lưu
  ST.S.nutritionPrefs.seed = 9; calls.length = 0; ST.logout();
  const lo = calls.find(c => c.url === '/Account/LogoutApi'); assert.deepStrictEqual(lo.body.keys, { nutritionPrefs: { seed: 9 } }); assert.strictEqual(lo.keepalive, true);
  assert.strictEqual(ST.user, null);

  // 7) đăng ký: lỗi từ máy chủ được chuyển nguyên cho giao diện
  r = await ST.register('An', 'a@b.vn', 'Abcdef12'); assert.strictEqual(r.ok, false); assert.strictEqual(r.errors.email, 'Email này đã được đăng ký.');
  r = await ST.register('A', 'bad', '123'); assert.ok(r.errors.name && r.errors.email && r.errors.pw);

  // 8) không còn dữ liệu nghiệp vụ trong localStorage
  assert.ok(!Object.keys(local._m).some(k => /^disci:u:/.test(k)), 'không được ghi disci:u:* vào localStorage');
  console.log('store.js adapter: TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.message); process.exit(1); });
