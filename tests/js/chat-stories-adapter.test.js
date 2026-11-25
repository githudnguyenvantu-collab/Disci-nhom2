// Kiểm thử Stories và tin nhắn thật (platform.js). Chạy: node tests/js/chat-stories-adapter.test.js
const path = require('path'), assert = require('assert');
const assets = path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets');
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const calls = [];
globalThis.window = globalThis; globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.location = { href: '', hash: '' }; globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} }, dataset: {} }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} };
globalThis.DISCI_CSRF = 'T'; globalThis.DISCI_SITE = {};
const SNAP = {
  ok: true, at: 1,
  users: [{ id: 'me', name: 'Tôi', role: 'user', demo: false, createdAt: 1, profile: {}, privacy: {} }, { id: 'u2', name: 'Lan', role: 'user', demo: false, createdAt: 2, profile: {}, privacy: {} }, { id: 'ud', name: 'Demo', role: 'user', demo: true, createdAt: 3, profile: {}, privacy: {} }],
  stats: {}, posts: [], likes: {}, comments: {}, shares: {}, follows: {}, chPart: {}, notifs: [],
  groups: [{ id: 'gReal', name: 'Chạy bộ', desc: '', hue: 1, owner: 'u2', members: ['u2', 'me'], at: 1 }, { id: 'gOut', name: 'Nhóm lạ', desc: '', hue: 1, owner: 'u2', members: ['u2'], at: 1 }],
  stories: [{ id: 's_srv', by: 'u2', text: 'Chạy 5km', img: '/media/0123456789abcdef0123456789abcdef.jpg', hue: 120, at: Date.now() }]
};
globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null }); const j = url === '/api/community/snapshot' ? JSON.parse(JSON.stringify(SNAP)) : url.includes('/chat/') && init.method === 'POST' ? { ok: true, message: { id: 9, by: 'me', text: JSON.parse(init.body).text, at: 5 } } : { ok: true, messages: [{ id: 1, by: 'u2', text: 'chào', at: 3 }] }; return { status: 200, ok: true, json: async () => j }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.keys(require.cache).forEach(k => delete require.cache[k]);
globalThis.DISCI_BOOT = { user: { id: 'me', name: 'Tôi', email: 'm@x.vn', role: 'user', createdAt: 1 }, state: { profile: { name: 'Tôi', email: 'm@x.vn' } }, version: 1 };
globalThis.DISCI_DATA = require(path.join(assets, 'data.js')); globalThis.DISCI_ENGINE = require(path.join(assets, 'engine.js'));
require(path.join(assets, 'store.js')); globalThis.DISCI.store.loadUser(); require(path.join(assets, 'platform.js')); const PL = globalThis.DISCI.plat;

(async () => {
  await PL.syncCommunity(true);
  // Stories từ máy chủ hiển thị cho mọi người; story DEMO/mô phỏng cục bộ được giữ
  assert.ok(PL.db().stories.some(s => s.id === 's_srv' && s.by === 'u2' && s.hue === 120 && !s.demo));
  PL.addStory({ by: 'ud', text: 'demo', demo: true }); calls.length = 0; await PL.syncCommunity(true);
  assert.ok(PL.db().stories.some(s => s.demo), 'story DEMO cục bộ không bị xóa khi đồng bộ'); assert.ok(PL.db().stories.some(s => s.id === 's_srv'));

  // đăng story thật → gửi lên máy chủ (kèm id cục bộ); story DEMO/mô phỏng thì không
  calls.length = 0; const s = PL.addStory({ by: 'me', text: 'Hôm nay tập chân', img: '/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', hue: 40 }); await sleep(10);
  assert.deepStrictEqual([calls[0].method, calls[0].url], ['POST', '/api/community/stories']); assert.deepStrictEqual(calls[0].body, { id: s.id, text: 'Hôm nay tập chân', img: '/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', hue: 40 });
  calls.length = 0; PL.addStory({ by: 'me', text: 'mô phỏng', sim: true }); PL.addStory({ by: 'ud', text: 'demo', demo: true }); await sleep(10); assert.strictEqual(calls.length, 0);

  // xóa story của mình → endpoint cộng đồng; của người khác (nhân sự) → endpoint quản trị
  calls.length = 0; PL.db().stories.push({ id: 's_other', by: 'u2', text: 'x', at: 1 }); globalThis.DISCI.store.user.role = 'admin';
  PL.deleteStory(s.id); await sleep(10); assert.deepStrictEqual([calls[0].method, calls[0].url], ['DELETE', '/api/community/stories/' + s.id]);
  calls.length = 0; PL.deleteStory('s_other'); await sleep(10); assert.deepStrictEqual([calls[0].method, calls[0].url], ['DELETE', '/api/admin/stories/s_other']);

  // tin nhắn: chỉ nhóm thật mà mình là thành viên và người dùng thật (không DEMO, không phải mình) mới dùng máy chủ
  assert.strictEqual(PL.chatReal('g:gReal'), true); assert.strictEqual(PL.chatReal('g:gOut'), false, 'chưa là thành viên'); assert.strictEqual(PL.chatReal('g:khong-co'), false);
  assert.strictEqual(PL.chatReal('u:u2'), true); assert.strictEqual(PL.chatReal('u:ud'), false, 'tài khoản DEMO'); assert.strictEqual(PL.chatReal('u:me'), false);
  calls.length = 0; let r = await PL.chatList('g:gReal', 0); assert.strictEqual(calls[0].url, '/api/community/chat/g/gReal'); assert.strictEqual(r.messages[0].text, 'chào');
  r = await PL.chatList('u:u2', 1234); assert.strictEqual(calls[1].url, '/api/community/chat/u/u2?after=1234');
  r = await PL.chatSend('g:gReal', 'Chào cả nhóm'); assert.deepStrictEqual([calls[2].method, calls[2].url, calls[2].body], ['POST', '/api/community/chat/g/gReal', { text: 'Chào cả nhóm' }]); assert.strictEqual(r.message.text, 'Chào cả nhóm');
  r = await PL.chatSend('u:u2/../x', 'x'); assert.ok(calls[3].url.includes(encodeURIComponent('u2/../x')), 'mã được mã hóa URL, không thể thoát đường dẫn');
  console.log('chat/stories adapter: TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.stack || e.message); process.exit(1); });
