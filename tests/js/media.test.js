// Kiểm thử media.js bản máy chủ với fetch/FormData giả lập. Chạy: node tests/js/media.test.js
const path = require('path'), assert = require('assert');
const M = require(path.resolve(__dirname, '../../src/Disci.Web/wwwroot/assets/media.js'));
const calls = [];
globalThis.DISCI_CSRF = 'TOK';
globalThis.fetch = async (url, init) => {
  const fd = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : { name: v.name, size: v.size, type: v.type }])) : null;
  calls.push({ url, method: init.method, csrf: init.headers.RequestVerificationToken, fd });
  const R = (status, j, blob) => ({ ok: status < 300, status, json: async () => j, blob: async () => blob });
  if (url === '/api/media' && init.method === 'POST') {
    if (fd.purpose === 'banner') return R(403, { ok: false, message: 'Không có quyền.' });
    if (fd.file.size > 1000) return R(422, { ok: false, message: 'Tệp quá lớn (tối đa 5 MB).' });
    return R(200, { ok: true, url: '/media/abc123.jpg', kind: 'image' });
  }
  if (url.startsWith('/media/k/')) return url.endsWith('missing') ? R(404, {}) : R(200, {}, new Blob(['v'], { type: 'video/mp4' }));
  if (url === '/api/media/mine' && init.method === 'DELETE') return R(200, { ok: true });
  if (url.startsWith('/api/media')) return R(200, [{ key: 'k', size: 1 }]);
  return R(404, {});
};
(async () => {
  const img = new Blob(['x'.repeat(10)], { type: 'image/jpeg' });
  assert.strictEqual(await M.uploadImage(img, 'avatar'), '/media/abc123.jpg');
  let c = calls.pop(); assert.strictEqual(c.fd.purpose, 'avatar'); assert.strictEqual(c.csrf, 'TOK'); assert.ok(/\.jpg$/.test(c.fd.file.name), 'tên gửi lên là tên an toàn, không phải đường dẫn người dùng');

  await assert.rejects(() => M.uploadImage(new Blob(['y'.repeat(5000)], { type: 'image/jpeg' }), 'post'), /quá lớn/);
  await assert.rejects(() => M.uploadImage(img, 'banner'), /quyền/);

  const vid = new Blob(['v'], { type: 'video/mp4' });
  assert.deepStrictEqual(await M.put('exv_ex1', vid, 'admin'), { persistent: true });
  c = calls.pop(); assert.strictEqual(c.fd.purpose, 'exercise-video'); assert.strictEqual(c.fd.key, 'exv_ex1');
  await M.put('vid_1', vid, 'u'); c = calls.pop(); assert.strictEqual(c.fd.purpose, 'video');
  await assert.rejects(() => M.put('big', { size: 60 * 1024 * 1024, name: 'x.mp4' }, 'u'), /50 MB/);

  assert.ok((await M.get('vid_1')) instanceof Blob); assert.strictEqual(await M.get('missing'), null);
  c = calls.filter(x => x.url.startsWith('/media/k/')).pop(); assert.strictEqual(c.method, 'GET');
  await M.del('a b/c'); assert.strictEqual(calls.pop().url, '/api/media/k/a%20b%2Fc');
  await M.clearUser('whoever'); assert.strictEqual(calls.pop().url, '/api/media/mine');
  assert.strictEqual(await M.isPersistent(), true); assert.strictEqual((await M.list()).length, 1);
  console.log('media.js (máy chủ): TẤT CẢ KIỂM THỬ ĐẠT');
})().catch(e => { console.error('THẤT BẠI:', e.message); process.exit(1); });
