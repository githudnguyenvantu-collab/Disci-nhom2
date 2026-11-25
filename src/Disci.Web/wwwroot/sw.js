/* DISCI service worker – chỉ lưu cache TÀI NGUYÊN TĨNH (css/js/ảnh/font) để mở nhanh hơn.
   KHÔNG lưu trang HTML và các API (/api, /Account, /Admin): trang chứa dữ liệu riêng của người dùng đang đăng nhập,
   lưu cache sẽ làm lộ dữ liệu giữa các tài khoản dùng chung trình duyệt. */
const V = 'disci-v18-mvc';
self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const staticAsset = url.pathname.startsWith('/assets/') && /\.(css|js|svg|webp|png|jpg|jpeg|woff2?)$/i.test(url.pathname);
    if (!staticAsset) return;                                // mọi thứ khác đi thẳng tới mạng, không cache
    e.respondWith(fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {            // font/CDN: ưu tiên cache
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
