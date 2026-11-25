// Kiểm thử danh mục & cấu hình từ máy chủ (platform.js). Chạy: node tests/js/catalog-config-adapter.test.js
const path = require('path'), assert = require('assert');
const assets = path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets');
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const calls = [];
globalThis.window = globalThis; globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.location = { href: '', hash: '' }; globalThis.matchMedia = () => ({ matches: false });
const styleEls = {};
globalThis.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} }, dataset: {} }, getElementById: id => styleEls[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, set id(v) { this._id = v; styleEls[v] = this; } }), head: { appendChild() {} }, addEventListener() {} };
globalThis.DISCI_CSRF = 'T';
globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null }); return { status: 200, ok: true, json: async () => ({ ok: true }) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(role, catalog, site) {
  Object.keys(require.cache).forEach(k => delete require.cache[k]); localStorage.removeItem('disci:plat'); Object.keys(localStorage._m).forEach(k => delete localStorage._m[k]);
  globalThis.DISCI_BOOT = { user: { id: 'u1', name: 'X', email: 'x@x.vn', role, createdAt: 1 }, state: { profile: { name: 'X', email: 'x@x.vn' } }, version: 1 };
  globalThis.DISCI_CATALOG = catalog; globalThis.DISCI_SITE = site || {};
  delete globalThis.DISCI;
  globalThis.DISCI_DATA = require(path.join(assets, 'data.js')); globalThis.DISCI_ENGINE = require(path.join(assets, 'engine.js'));
  require(path.join(assets, 'store.js')); globalThis.DISCI.store.loadUser(); require(path.join(assets, 'platform.js'));
  return { PL: globalThis.DISCI.plat, D: globalThis.DISCI_DATA, ST: globalThis.DISCI.store };
}
const srv = (arr, extra) => JSON.parse(JSON.stringify(arr)).map(x => Object.assign(x, { active: true, custom: false, image: null, video: null }, extra && extra(x)));
function catalogFor(D) {
  const ex = srv(D.EXERCISES), meal = srv(D.MEALS), prod = srv(D.PRODUCTS), ch = JSON.parse(JSON.stringify(D.CHALLENGES)).map(c => Object.assign(c, { active: true }));
  return { exercise: ex, food: meal, product: prod, challenge: ch };
}

(async () => {
  // ----- Dữ liệu gốc không đổi: máy chủ trả đúng bản seed → không có patch/ẩn/thêm giả
  let { PL, D } = boot('user', null); const pristine = catalogFor(D);
  ({ PL, D } = boot('user', catalogFor(globalThis.DISCI_DATA ? require(path.join(assets, 'data.js')) : D)));
  const c0 = PL.db().catalog; assert.deepStrictEqual([c0.ex.add.length, Object.keys(c0.ex.patch).length, c0.ex.hide.length], [0, 0, 0], 'bài tập giống seed → không phải bản vá'); assert.deepStrictEqual([c0.prod.add.length, Object.keys(c0.prod.patch).length, c0.prod.hide.length], [0, 0, 0]); assert.deepStrictEqual([c0.meal.add.length, Object.keys(c0.meal.patch).length, c0.meal.hide.length], [0, 0, 0]);

  // ----- Máy chủ chỉnh sửa: sửa tên, ẩn, thêm mới (kèm trường mở rộng), thử thách
  ({ PL, D } = boot('user', null)); const base = catalogFor(D); const e0 = base.exercise[0], e1 = base.exercise[1], p0 = base.product[0], m0 = base.food[0];
  e0.name = 'Tên đã sửa'; e1.active = false; m0.active = false; p0.price = p0.price + 1000;
  base.exercise.push({ id: 'x_moi_abc', name: 'Bài mới', cat: e0.cat, muscles: '', level: 1, equip: ['none'], kind: 'reps', sets: 3, amt: 10, rest: 45, tags: [], quiet: true, steps: ['a'], mistakes: [], rep: null, warn: '', met: 4, active: true, custom: true, image: null, video: null, videoKey: 'exv_x_moi_abc' });
  base.product.push({ id: 'x_sp_moi', name: 'SP mới', cat: p0.cat, price: 99000, desc: '', unlocks: null, goals: ['health'], space: 'small', prio: 'consider', icon: 'inventory_2', specs: [], how: '', forWho: '', note: '', active: true, custom: true, supplement: false, images: ['/media/0123456789abcdef0123456789abcdef.jpg'], brand: 'DISCI', stock: 5 });
  base.challenge = base.challenge.filter(c => c.id !== 'c10' && c.id !== 'cstand'); base.challenge[0].name = 'Tên TT mới'; base.challenge[1].active = false;
  base.challenge.push({ id: 'ch_moi', name: 'TT tự tạo', days: 14, goal: 10, metric: 'manual', desc: 'mô tả', reward: '', active: true, demoMembers: 3 });
  ({ PL, D } = boot('user', base));
  assert.strictEqual(D.exById(e0.id).name, 'Tên đã sửa'); assert.ok(!D.EXERCISES.some(e => e.id === e1.id), 'bài bị ẩn không còn trong danh sách'); assert.ok(D.exById(e1.id), 'nhưng vẫn tra được theo id (lịch cũ vẫn mở được)');
  assert.ok(D.EXERCISES.some(e => e.id === 'x_moi_abc')); assert.strictEqual(D.exById('x_moi_abc').videoKey, 'exv_x_moi_abc');
  assert.strictEqual(D.productById(p0.id).price, p0.price); assert.ok(!D.MEALS.some(m => m.id === m0.id));
  const sp = D.productById('x_sp_moi'); assert.strictEqual(sp.brand, 'DISCI'); assert.deepStrictEqual(sp.images, ['/media/0123456789abcdef0123456789abcdef.jpg']); assert.strictEqual(sp.custom, true); assert.ok(!('active' in sp), 'cờ riêng của máy chủ không lọt vào dữ liệu giao diện');
  const all = PL.catalogAll('ex'); assert.deepStrictEqual([all.find(x => x.item.id === e0.id).patched, all.find(x => x.item.id === e1.id).hidden, all.find(x => x.item.id === 'x_moi_abc').custom, all.find(x => x.item.id === D.EXERCISES[5].id).patched], [true, true, true, false]);
  const chs = PL.challengesAll(); assert.strictEqual(chs.find(c => c.id === 'c7').name, 'Tên TT mới'); assert.strictEqual(chs.find(c => c.id === 'c30').hidden, true); assert.strictEqual(chs.find(c => c.id === 'c10').hidden, true); assert.strictEqual(chs.find(c => c.id === 'ch_moi').demoMembers, 3);

  // ----- Cấu hình giao diện từ máy chủ, phần còn lại giữ mặc định
  ({ PL } = boot('user', null, { 'site.config': { site: { brand: 'Lab Fitness' } } }));
  assert.strictEqual(PL.cfg().site.brand, 'Lab Fitness'); assert.strictEqual(PL.cfg().system.allowRegister, true);
  ({ PL } = boot('user', null, {})); const defBrand = PL.cfg().site.brand; assert.ok(defBrand);

  // ----- Quản trị: thao tác danh mục gửi lên máy chủ (đã có ảnh chụp quản trị)
  const adminSnap = { ok: true, me: 'u1', users: [], posts: [], comments: {}, likes: {}, reports: [], announcements: [], audit: [], backups: [], catalog: catalogFor(globalThis.DISCI_DATA) };
  globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null }); const j = url === '/api/admin/snapshot' ? JSON.parse(JSON.stringify(adminSnap)) : { ok: true }; return { status: 200, ok: true, json: async () => j }; };
  ({ PL, D } = boot('admin', null)); adminSnap.catalog = catalogFor(D); await PL.syncAdmin(true);
  const id0 = D.EXERCISES[0].id; calls.length = 0;
  PL.catalogSave('ex', Object.assign({}, D.exById(id0), { name: 'Sửa bởi admin' })); await sleep(10);
  assert.deepStrictEqual([calls[0].method, calls[0].url], ['PUT', '/api/admin/catalog/exercise']); assert.strictEqual(calls[0].body.name, 'Sửa bởi admin'); assert.strictEqual(calls[0].body.active, true); assert.strictEqual(D.exById(id0).name, 'Sửa bởi admin');
  calls.length = 0; PL.catalogHide('ex', id0, true); await sleep(10); assert.deepStrictEqual([calls[0].url, calls[0].body], ['/api/admin/catalog/exercise/' + encodeURIComponent(id0) + '/active', { active: false }]);
  calls.length = 0; PL.catalogRevert('ex', id0); await sleep(10); assert.strictEqual(calls[0].body.name, D.__orig.ex[0].name); assert.strictEqual(calls[0].body.active, false, 'giữ trạng thái ẩn khi khôi phục bản gốc');
  PL.catalogSave('meal', { id: 'x_mon_abc', name: 'Món mới', slot: 'trua', kcal: 300, protein: 20, cost: 30000, ing: [], icon: 'restaurant' }); await sleep(10);
  calls.length = 0; PL.catalogDelete('meal', 'x_mon_abc'); await sleep(10); assert.deepStrictEqual([calls[0].method, calls[0].url], ['DELETE', '/api/admin/catalog/food/x_mon_abc']);
  assert.throws(() => PL.catalogDelete('ex', id0), /gốc/);
  calls.length = 0; PL.saveChallenge({ id: 'c7', name: 'Đổi tên', desc: 'd', reward: 'r', days: 7, goal: 7, metric: 'streak', hidden: false }); await sleep(10); assert.deepStrictEqual([calls[0].url, calls[0].body.name, calls[0].body.active], ['/api/admin/catalog/challenge', 'Đổi tên', true]);
  calls.length = 0; PL.deleteChallenge('c7'); await sleep(10); assert.deepStrictEqual([calls[0].url, calls[0].body], ['/api/admin/catalog/challenge/c7/active', { active: false }]);
  calls.length = 0; PL.saveChallenge({ id: 'ch_t', name: 'Tự tạo', desc: '', reward: '', days: 5, goal: 5, metric: 'manual' }); PL.deleteChallenge('ch_t'); await sleep(10); assert.strictEqual(calls[1].method, 'DELETE');

  // ----- Cấu hình: Admin gửi cả khóa máy chủ dùng để áp dụng; Editor chỉ gửi site.config; người thường không gửi gì
  calls.length = 0; PL.setCfg('site.brand', 'Thương hiệu mới'); PL.setCfg('system.maintenance', true); await sleep(900);
  const put = calls.filter(c => c.url === '/api/admin/settings'); assert.strictEqual(put.length, 1, 'gộp nhiều thay đổi liên tiếp thành một lần gửi');
  assert.strictEqual(put[0].body['site.config'].site.brand, 'Thương hiệu mới'); assert.strictEqual(put[0].body['system.maintenance'], true); assert.strictEqual(put[0].body['site.registration.open'], true); assert.ok('system.maintenanceMsg' in put[0].body);
  ({ PL } = boot('editor', null)); await PL.syncAdmin(true); calls.length = 0; PL.setCfg('site.brand', 'Do Editor'); await sleep(900);
  const pe = calls.filter(c => c.url === '/api/admin/settings')[0]; assert.deepStrictEqual(Object.keys(pe.body), ['site.config']);
  ({ PL } = boot('user', null)); calls.length = 0; PL.db().cfg.site.brand = 'x'; PL.save(); await sleep(900); assert.ok(!calls.some(c => c.url === '/api/admin/settings'), 'người dùng thường không đồng bộ cấu hình');
  console.log('catalog/config adapter: TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.stack || e.message); process.exit(1); });
