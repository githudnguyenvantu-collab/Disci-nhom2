// Kiểm thử bộ chuyển đổi quản trị (platform.js) với máy chủ giả lập. Chạy: node tests/js/admin-adapter.test.js
const path = require('path'), assert = require('assert');
const assets = path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets');
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const local = mem(), session = mem(); const calls = [];
globalThis.window = globalThis; globalThis.localStorage = local; globalThis.sessionStorage = session; globalThis.location = { href: '', hash: '' }; globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} }, dataset: {} }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} };
globalThis.DISCI_CSRF = 'ADM'; globalThis.DISCI_SITE = {};

const SNAP = {
  ok: true, me: 'adm',
  users: [
    { id: 'adm', name: 'Quản trị', email: 'ad@x.vn', role: 'admin', locked: false, demo: false, createdAt: 1, lastLogin: 5, mustChangePw: false, stats: { streak: 0, sessions: 0, minutes: 0, points: 0 } },
    { id: 'u2', name: 'Lan', email: 'lan@x.vn', role: 'user', locked: false, demo: false, createdAt: 2, lastLogin: 0, mustChangePw: false, stats: { streak: 3, sessions: 9, minutes: 300, points: 210 } },
    { id: 'mod', name: 'Mod', email: 'mo@x.vn', role: 'moderator', locked: false, demo: false, createdAt: 3, lastLogin: 0, mustChangePw: false, stats: { streak: 0, sessions: 0, minutes: 0, points: 0 } }
  ],
  posts: [{ id: 'pOk', by: 'u2', text: 'ổn', at: 10, hidden: false }, { id: 'pHid', by: 'u2', text: 'vi phạm', at: 11, hidden: true }],
  comments: { pOk: [{ id: 'cA', by: 'u2', text: 'hay', at: 12, hidden: false }] }, likes: { pOk: ['mod'] },
  reports: [{ id: 'rA', postId: 'pOk', by: 'mod', reason: 'spam', at: 13, st: 'open' }],
  announcements: [{ id: 'anOld', title: 'Cũ', text: 'x', audience: 'all', kind: 'info', go: '', at: 1, until: 0 }],
  audit: [{ id: 'a1', at: 20, by: 'adm', name: 'ad@x.vn', role: '', action: 'auth.login', target: 'adm', detail: '' }], backups: [{ id: 7, file: 'backup-1.json', size: 100, at: '2026-01-01T00:00:00Z', note: '' }]
};
let fail = null, failStatus = 403;
globalThis.fetch = async (url, init) => {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const body = init.body && !isForm ? JSON.parse(init.body) : null; calls.push({ url, method: init.method, body, form: isForm, csrf: init.headers.RequestVerificationToken });
  const R = (status, j) => ({ status, ok: status < 300, json: async () => j });
  if (fail && url.includes(fail)) { fail = null; return R(failStatus, { ok: false, message: 'Máy chủ từ chối.' }); }
  if (url === '/api/admin/snapshot') return R(200, JSON.parse(JSON.stringify(SNAP)));
  if (url === '/api/admin/users' && init.method === 'POST') return body.email === 'trung@x.vn' ? R(409, { ok: false, message: 'Email này đã được đăng ký.' }) : R(200, { ok: true, id: 'newid', role: body.role });
  if (url.endsWith('/reset-password')) return R(200, { ok: true, tempPassword: 'Tam12345abc' });
  if (url === '/api/admin/backups/upload') return R(200, { ok: true, id: 9 });
  return R(200, { ok: true });
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.keys(require.cache).forEach(k => delete require.cache[k]);
globalThis.DISCI_BOOT = { user: { id: 'adm', name: 'Quản trị', email: 'ad@x.vn', role: 'admin', createdAt: 1 }, state: { profile: { name: 'Quản trị', email: 'ad@x.vn' } }, version: 1 };
globalThis.DISCI_DATA = require(path.join(assets, 'data.js')); globalThis.DISCI_ENGINE = require(path.join(assets, 'engine.js'));
require(path.join(assets, 'store.js')); const ST = globalThis.DISCI.store; assert.ok(ST.loadUser());
require(path.join(assets, 'platform.js')); const PL = globalThis.DISCI.plat;
const last = () => calls[calls.length - 1];

(async () => {
  assert.strictEqual(await PL.syncAdmin(true), true); assert.strictEqual(calls[0].csrf, 'ADM');
  // dữ liệu thật thay cho localStorage
  assert.deepStrictEqual(ST.users().map(u => u.email).sort(), ['ad@x.vn', 'lan@x.vn', 'mo@x.vn']);
  assert.deepStrictEqual(PL.statsOf('u2'), { streak: 3, sessions: 9, minutes: 300, points: 210 });
  assert.ok(PL.realPosts().some(p => p.id === 'pHid'), 'bài bị ẩn vẫn thấy được trong trang quản trị'); assert.strictEqual(PL.modOf('pHid').st, 'hidden'); assert.ok(!PL.modOf('pOk') || PL.modOf('pOk').st === 'ok');
  assert.strictEqual(PL.commentsOf('pOk').length, 1); assert.strictEqual(PL.db().reports[0].id, 'rA'); assert.strictEqual(PL.db().ann[0].id, 'anOld'); assert.strictEqual(PL.db().audit[0].action, 'auth.login'); assert.strictEqual(PL.adBackups()[0].id, 7);

  // tài khoản
  calls.length = 0; PL.updateUser('u2', { locked: true }); await sleep(10);
  assert.deepStrictEqual([last().method, last().url, last().body], ['PUT', '/api/admin/users/u2/active', { active: false }]); assert.strictEqual(ST.users().find(u => u.id === 'u2').locked, true);
  calls.length = 0; PL.updateUser('u2', { role: 'editor' }); await sleep(10); assert.deepStrictEqual([last().url, last().body], ['/api/admin/users/u2/role', { role: 'Editor' }]);
  assert.throws(() => PL.updateUser('adm', { locked: true }), /tự khóa|cuối cùng/);                      // không tự khóa mình
  assert.throws(() => PL.updateUser('adm', { role: 'user' }), /tự khóa|cuối cùng/);              // không hạ quyền admin cuối cùng
  assert.throws(() => PL.deleteUser('adm'), /chính mình/); assert.throws(() => PL.updateUser('khong-co', { locked: true }), /Không tìm thấy/);
  calls.length = 0; assert.strictEqual(await PL.resetUserPassword('u2'), 'Tam12345abc'); assert.strictEqual(last().url, '/api/admin/users/u2/reset-password'); assert.strictEqual(ST.users().find(u => u.id === 'u2').mustChangePw, true);
  calls.length = 0; PL.deleteUser('mod'); await sleep(10); assert.deepStrictEqual([last().method, last().url], ['DELETE', '/api/admin/users/mod']); assert.ok(!ST.users().some(u => u.id === 'mod'));
  const ok = await PL.createUserOnServer({ name: 'Mới', email: 'moi@x.vn', password: 'Abcdef12', role: 'editor' }); assert.deepStrictEqual([ok.ok, ok.id], [true, 'newid']);
  assert.deepStrictEqual(last().body, { name: 'Mới', email: 'moi@x.vn', password: 'Abcdef12', role: 'Editor' }); assert.strictEqual(ST.users()[0].id, 'newid');
  const dup = await PL.createUserOnServer({ name: 'Trùng', email: 'trung@x.vn', password: 'Abcdef12', role: 'user' }); assert.strictEqual(dup.ok, false); assert.match(dup.message, /đã được đăng ký/);

  // kiểm duyệt
  calls.length = 0; PL.modPost('pOk', 'hidden', 'Vi phạm'); await sleep(10); assert.deepStrictEqual([last().url, last().body], ['/api/admin/posts/pOk/hide', { reason: 'Vi phạm' }]); assert.strictEqual(PL.modOf('pOk').st, 'hidden');
  calls.length = 0; PL.modPost('pOk', 'ok'); await sleep(10); assert.strictEqual(last().url, '/api/admin/posts/pOk/unhide');
  calls.length = 0; PL.modComment('pOk', 'cA', true); await sleep(10); assert.strictEqual(last().url, '/api/admin/comments/cA/hide'); assert.strictEqual(PL.db().comments.pOk[0].hidden, true);
  calls.length = 0; PL.deleteComment('pOk', 'cA'); await sleep(10); assert.deepStrictEqual([last().method, last().url], ['DELETE', '/api/admin/comments/cA']); assert.strictEqual(PL.db().comments.pOk.length, 0);
  calls.length = 0; PL.resolveReport('rA', 'resolved'); await sleep(10); assert.deepStrictEqual([last().url, last().body], ['/api/admin/reports/rA/resolve', { action: 'resolve' }]);
  PL.resolveReport('rA', 'dismissed'); await sleep(10); assert.deepStrictEqual(last().body, { action: 'dismiss' });
  calls.length = 0; PL.deleteDemoOrOfficialPost('pHid'); await sleep(10); assert.deepStrictEqual([last().method, last().url], ['DELETE', '/api/admin/posts/pHid']); assert.ok(!PL.realPosts().some(p => p.id === 'pHid'));

  // thông báo hệ thống
  calls.length = 0; const a = PL.addAnnouncement({ title: ' Bảo trì ', text: 'tối nay', go: 'community.html', audience: 'role:user', kind: 'banner', until: Date.UTC(2030, 0, 1) }); await sleep(10);
  assert.strictEqual(PL.db().ann[0].id, a.id); assert.deepStrictEqual(calls[0].body, { id: a.id, title: 'Bảo trì', body: 'tối nay', audience: 'role:user', kind: 'banner', link: 'community.html', expiresAt: '2030-01-01T00:00:00.000Z' });
  assert.throws(() => PL.addAnnouncement({ title: '   ' }), /tiêu đề/);
  calls.length = 0; PL.deleteAnnouncement(a.id); await sleep(10); assert.deepStrictEqual([last().method, last().url], ['DELETE', '/api/admin/announcements/' + a.id]); assert.ok(!PL.db().ann.some(x => x.id === a.id));

  // máy chủ từ chối → báo lỗi và tải lại đúng dữ liệu
  calls.length = 0; fail = '/unhide'; failStatus = 403; assert.throws(() => PL.modPost('pHid2', 'ok'), /Không tìm thấy/); /* bài không thuộc máy chủ: chạy logic cục bộ (như bản gốc), không gọi API */ await sleep(10); assert.ok(!calls.some(c => c.url.includes('/api/admin/posts')));
  calls.length = 0; await PL.syncAdmin(true); fail = '/hide'; PL.modComment('pOk', 'cA', true); await sleep(10); /* cA đã xóa ở máy: không có gì để gửi */
  calls.length = 0; fail = '/active'; ST.users().find(u => u.id === 'u2').locked = false; PL.updateUser('u2', { locked: true }); await sleep(40);
  assert.ok(calls.some(c => c.url === '/api/admin/snapshot'), 'phải tải lại ảnh chụp quản trị sau khi bị từ chối'); assert.strictEqual(ST.users().find(u => u.id === 'u2').locked, false, 'trạng thái khôi phục theo máy chủ');

  // sao lưu
  calls.length = 0; await PL.adBackupCreate('thử'); assert.deepStrictEqual([calls[0].method, calls[0].url, calls[0].body], ['POST', '/api/admin/backups', { note: 'thử' }]); assert.ok(calls.some(c => c.url === '/api/admin/snapshot'));
  calls.length = 0; await PL.adBackupRestore(7); assert.strictEqual(calls[0].url, '/api/admin/backups/7/restore'); await PL.adBackupDelete(7); assert.deepStrictEqual([calls[2].method, calls[2].url], ['DELETE', '/api/admin/backups/7']);
  calls.length = 0; const up = await PL.adBackupUpload(new Blob(['{}'], { type: 'application/json' })); assert.strictEqual(up.id, 9); assert.strictEqual(calls[0].form, true); assert.strictEqual(calls[0].csrf, 'ADM');
  console.log('admin adapter: TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.stack || e.message); process.exit(1); });
