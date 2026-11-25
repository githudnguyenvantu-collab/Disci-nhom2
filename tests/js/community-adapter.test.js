// Kiểm thử bộ chuyển đổi cộng đồng (platform.js) với máy chủ giả lập. Chạy: node tests/js/community-adapter.test.js
const path = require('path'), assert = require('assert');
const assets = path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets');
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const local = mem(), session = mem(); const calls = [];
globalThis.window = globalThis; globalThis.localStorage = local; globalThis.sessionStorage = session; globalThis.location = { href: '', hash: '' };
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { documentElement: { classList: { add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} }, dataset: {} }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} };
globalThis.DISCI_CSRF = 'TOK'; globalThis.DISCI_SITE = {};

const ME = { id: 'me', name: 'Tôi', email: 'me@x.vn', role: 'user', createdAt: 1 };
const snapshot = {
  ok: true, at: 1,
  users: [
    { id: 'me', name: 'Tôi', role: 'user', demo: false, locked: false, createdAt: 1, profile: { avatar: '', bio: '' }, privacy: { showStats: true, showBoard: true } },
    { id: 'u2', name: 'Lan', role: 'user', demo: false, locked: false, createdAt: 2, profile: { avatar: '/media/a.jpg', bio: 'xin chào', city: 'HN' }, privacy: { showStats: true, showBoard: true } },
    { id: 'u3', name: 'Hùng', role: 'user', demo: true, locked: false, createdAt: 3, profile: {}, privacy: { showStats: false, showBoard: false } }
  ],
  stats: { u2: { streak: 4, sessions: 12, minutes: 480, points: 280 } },
  posts: [{ id: 'p_lan', by: 'u2', text: 'Chào mọi người', at: 100, vis: 'public' }, { id: 'p_hung', by: 'u3', text: 'DEMO', at: 90 }],
  likes: { p_lan: ['u3'] }, comments: { p_lan: [{ id: 'c1', by: 'u3', text: 'Hay!', at: 101 }] }, shares: { p_lan: 2 },
  follows: { u2: ['u3'], me: ['u2'] }, groups: [{ id: 'gSrv', name: 'Chạy bộ', desc: '', hue: 120, owner: 'u2', members: ['u2', 'me'], at: 5 }],
  chPart: { ch7: ['u2'] }, notifs: [{ id: 'n1', to: 'me', from: 'u2', type: 'follow', postId: '', text: '', at: 50, read: false }]
};
let failNext = null, nextStatus = 200;
globalThis.fetch = async (url, init) => {
  const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, method: init.method, body, csrf: init.headers.RequestVerificationToken });
  const R = (status, j) => ({ status, json: async () => j });
  if (failNext && url.includes(failNext)) { failNext = null; return R(nextStatus, { ok: false, message: 'Bị từ chối bởi máy chủ.' }); }
  if (url === '/api/community/snapshot') return R(200, JSON.parse(JSON.stringify(snapshot)));   // bản sao mới mỗi lần, như JSON thật từ mạng
  if (url === '/api/community/notifications') return R(200, JSON.parse(JSON.stringify({ ok: true, notifs: snapshot.notifs })));
  return R(200, { ok: true });
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
Object.keys(require.cache).forEach(k => delete require.cache[k]);
globalThis.DISCI_BOOT = { user: ME, state: { profile: { name: 'Tôi', email: 'me@x.vn' }, posts: [{ id: 'p_me', text: 'bài của tôi', at: 200 }] }, version: 1 };
globalThis.DISCI_DATA = require(path.join(assets, 'data.js')); globalThis.DISCI_ENGINE = require(path.join(assets, 'engine.js'));
require(path.join(assets, 'store.js'));
const ST = globalThis.DISCI.store; assert.ok(ST.loadUser());
require(path.join(assets, 'platform.js'));
const PL = globalThis.DISCI.plat;

(async () => {
  // trước khi đồng bộ: chỉ thấy chính mình
  assert.deepStrictEqual(ST.users().map(u => u.id), ['me']);
  assert.strictEqual(await PL.syncCommunity(true), true);
  assert.strictEqual(calls[0].csrf, 'TOK');

  // người dùng công khai, không có email
  assert.deepStrictEqual(ST.users().map(u => u.id).sort(), ['me', 'u2', 'u3']); assert.ok(ST.users().every(u => !('email' in u)));
  assert.strictEqual(ST.udataOf('u2').profile.bio, 'xin chào'); assert.strictEqual(ST.udataOf('u3').settings.privacy.showStats, false); assert.strictEqual(ST.udataOf('me'), ST.S);
  assert.strictEqual(PL.actor('u2').name, 'Lan'); assert.strictEqual(PL.actor('u2').avatar, '/media/a.jpg');
  assert.deepStrictEqual(PL.statsOf('u2'), { streak: 4, sessions: 12, minutes: 480, points: 280 });
  assert.strictEqual(PL.statsOf('u3').points, 0, 'không có số liệu công khai khi người dùng ẩn');

  // bài viết: của người khác từ máy chủ + bài của mình từ S.posts (chưa cần đã lưu)
  const ids = PL.realPosts().map(p => p.id).sort(); assert.deepStrictEqual(ids, ['p_hung', 'p_lan', 'p_me']);
  assert.strictEqual(PL.realPosts().find(p => p.id === 'p_me').by, 'me'); assert.strictEqual(PL.realPosts().find(p => p.id === 'p_hung').demo, true);
  assert.strictEqual(PL.likesOf('p_lan').length, 1); assert.strictEqual(PL.commentsOf('p_lan')[0].text, 'Hay!'); assert.strictEqual(PL.sharesOf('p_lan'), 2);
  assert.ok(PL.isFollowing('me', 'u2')); assert.deepStrictEqual(PL.followersOf('u3'), ['u2']);
  assert.strictEqual(PL.groupById('gSrv').members.length, 2); assert.deepStrictEqual(PL.participants('ch7'), ['u2']);
  assert.strictEqual(PL.db().notifs.filter(n => n.to === 'me').length, 1);

  // thích: cập nhật tức thì + gọi máy chủ đúng địa chỉ
  calls.length = 0; assert.strictEqual(PL.toggleLike('p_lan', 'me'), true); assert.strictEqual(PL.likesOf('p_lan').length, 2);
  await sleep(10); assert.deepStrictEqual([calls[0].method, calls[0].url], ['POST', '/api/community/posts/p_lan/like']);
  // thích thay người khác: KHÔNG gửi lên máy chủ
  calls.length = 0; PL.toggleLike('p_lan', 'u2'); await sleep(10); assert.strictEqual(calls.length, 0);

  // bình luận: gửi kèm id cục bộ để hai bên khớp nhau
  calls.length = 0; const c = PL.addComment('p_lan', 'me', '  Tuyệt  '); await sleep(10);
  assert.strictEqual(calls[0].url, '/api/community/posts/p_lan/comments'); assert.strictEqual(calls[0].body.id, c.id); assert.strictEqual(calls[0].body.text, 'Tuyệt');

  // theo dõi: chỉ gọi máy chủ với người dùng thật; bài/tài khoản DEMO cục bộ thì không
  calls.length = 0; PL.toggleFollow('me', 'u3'); await sleep(10); assert.strictEqual(calls[0].url, '/api/community/follow/u3');
  calls.length = 0; PL.toggleFollow('me', 'demo_local_x'); await sleep(10); assert.strictEqual(calls.length, 0);

  // nhóm: id cục bộ được gửi để khớp với máy chủ
  calls.length = 0; const g = PL.createGroup({ name: '  Yoga sáng ', desc: 'd', owner: 'me' }); await sleep(10);
  assert.strictEqual(calls[0].url, '/api/community/groups'); assert.strictEqual(calls[0].body.id, g.id); assert.strictEqual(calls[0].body.name, 'Yoga sáng');
  calls.length = 0; PL.joinGroup('gSrv', 'me'); await sleep(10); assert.strictEqual(calls[0].url, '/api/community/groups/gSrv/join');
  calls.length = 0; PL.joinChallenge('ch7', 'me'); await sleep(10); assert.strictEqual(calls[0].url, '/api/community/challenges/ch7/join');

  // máy chủ từ chối → báo lỗi và đồng bộ lại để khôi phục sự thật
  calls.length = 0; failNext = '/like'; nextStatus = 403; PL.toggleLike('p_lan', 'me'); await sleep(30);
  assert.ok(calls.some(x => x.url === '/api/community/snapshot'), 'phải tải lại ảnh chụp sau khi bị từ chối');
  assert.strictEqual(PL.likesOf('p_lan').length, 1, 'trạng thái thích khôi phục theo máy chủ');
  // 404 (mục chỉ có cục bộ) thì im lặng, không tải lại
  calls.length = 0; failNext = '/share'; nextStatus = 404; PL.share('p_lan', 'me'); await sleep(30); assert.ok(!calls.some(x => x.url === '/api/community/snapshot'));

  // thông báo thật của người dùng không bị ghi vào localStorage dùng chung
  PL.save(); const saved = JSON.parse(local.getItem(Object.keys(local._m).find(k => /plat/.test(k)))); assert.ok(!saved.notifs.some(n => !n.sim), 'không lưu thông báo thật vào localStorage');
  console.log('community adapter: TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.stack || e.message); process.exit(1); });
