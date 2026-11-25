/* DISCI FX – lớp hiệu ứng "Alive" (v4). Thuần JS, không phụ thuộc. Tự tắt khi người dùng bật "giảm chuyển động". */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* 1. Thanh tiến độ cuộn trang */
  function scrollBar() {
    var b = document.createElement('div'); b.className = 'fx-scroll'; document.body.appendChild(b);
    var tick = false;
    function upd() { var h = document.documentElement.scrollHeight - innerHeight; b.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; tick = false; }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true }); upd();
  }

  /* 2. Số đếm chạy (count-up): giữ nguyên đơn vị/chữ đi kèm, vd "72 kg", "5 ngày", "1.250 kcal", "42%" */
  function countUp(el) {
    if (el.__cu) return; var raw = el.textContent, m = raw.match(/^(\s*)(-?\d[\d.,]*)(.*)$/);
    if (!m) return; el.__cu = 1;
    var numStr = m[2], thousands = /^\d{1,3}([.,]\d{3})+$/.test(numStr), decM = !thousands && numStr.match(/[.,](\d{1,2})$/), decN = decM ? decM[1].length : 0, sep = decM ? numStr.charAt(numStr.length - decN - 1) : '.';
    var target = parseFloat(thousands ? numStr.replace(/[.,]/g, '') : numStr.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!isFinite(target) || target === 0) return;
    var dur = 900 + Math.min(900, Math.abs(target) * 2), t0 = null;
    function f(ts) {
      if (t0 == null) t0 = ts; var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 4), v = target * e;
      el.textContent = m[1] + (p === 1 ? numStr : (decN ? v.toFixed(decN).replace('.', sep) : Math.round(v).toLocaleString('vi-VN'))) + m[3];
      if (p < 1) requestAnimationFrame(f);
    }
    el.textContent = m[1] + '0' + m[3]; requestAnimationFrame(f);
  }
  function observeCounts(root) {
    var els = $$('.nk-stat .v,.glass b,[data-count]', root).filter(function (e) { return !e.__seen; });
    if (!els.length) return;
    if (reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { countUp(x.target); io.unobserve(x.target); } }); }, { threshold: .4 });
    els.forEach(function (e) { e.__seen = 1; io.observe(e); });
  }

  /* 3. Thanh tiến trình: chạy từ 0 đến giá trị khi xuất hiện */
  function animateBars(root) {
    if (reduce || !('IntersectionObserver' in window)) return;
    var bars = $$('.bar>i', root).filter(function (e) { return !e.__b && !e.parentNode.classList.contains('indet') && e.style.width; });
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { var i = x.target; i.style.width = i.__w; io.unobserve(i); } }); }, { threshold: .3 });
    bars.forEach(function (i) { i.__b = 1; i.__w = i.style.width; i.style.transition = 'width 1.1s cubic-bezier(.2,.8,.2,1)'; i.style.width = '0%'; io.observe(i); });
  }

  /* 4. Đèn rọi theo con trỏ + nghiêng 3D (chỉ khi có chuột) */
  function pointerFx() {
    if (!fine || reduce) return;
    var spot = '.card,.nk-stat,.nk-pcard .nk-pimg,.ob-opt,.nk-day,.nk-feat,.nk-sport';
    var tilt = '.nk-feat,.nk-sport,.nk-day,.nk-stat';
    document.addEventListener('pointermove', function (e) {
      var t = e.target.closest && e.target.closest(spot); if (!t) return;
      var r = t.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      t.style.setProperty('--mx', x + 'px'); t.style.setProperty('--my', y + 'px'); t.classList.add('fx-spot');
      var tl = e.target.closest(tilt);
      if (tl && tl === t) { var px = x / r.width - .5, py = y / r.height - .5; tl.style.transform = 'perspective(800px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-6px)'; tl.classList.add('fx-tilt'); }
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var tl = e.target.closest && e.target.closest(tilt); if (tl && tl.classList.contains('fx-tilt') && !tl.contains(e.relatedTarget)) { tl.style.transform = ''; tl.classList.remove('fx-tilt'); }
    });
  }

  /* 5. Gợn sóng khi bấm nút + pháo giấy khi hoàn thành */
  function ripple() {
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('.btn,.chip,.icon-btn,.app-bottom a'); if (!b || b.disabled) return;
      var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, d = document.createElement('span');
      d.className = 'fx-rip'; d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; b.style.overflow = 'hidden'; b.appendChild(d); setTimeout(function () { d.remove(); }, 650);
    }, { passive: true });
  }
  var COLORS = ['#c6ff2e', '#00e5c8', '#ffffff', '#ffb02e', '#ff705c', '#7be495'];
  function confetti(x, y) {
    if (reduce) return; var c = document.createElement('canvas'); c.className = 'fx-confetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    var g = c.getContext('2d'); if (!g) { c.remove(); return; }
    var P = [], i; x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight * .4 : y;
    for (i = 0; i < 90; i++) { var a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9; P.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: COLORS[i % COLORS.length], l: 1 }); }
    function f() {
      g.clearRect(0, 0, c.width, c.height); var alive = 0;
      P.forEach(function (p) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.l -= .008; if (p.l > 0 && p.y < c.height + 20) { alive++; g.save(); g.globalAlpha = Math.max(0, p.l); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); } });
      if (alive) requestAnimationFrame(f); else c.remove();
    }
    f();
  }
  window.DISCI_FX = { confetti: confetti, countUp: countUp };
  function watchToasts() {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1 && n.classList.contains('toast') && !n.classList.contains('err') && /hoàn thành|chúc mừng|huy hiệu|đạt|thành công|mở khóa/i.test(n.textContent)) { var r = n.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); }
      }); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* 6. Hero: hạt sáng bay lên + hiệu ứng thị sai theo chuột */
  function hero(root) {
    $$('.nk-hero', root).forEach(function (h) {
      if (h.__fx) return; h.__fx = 1; var box = document.createElement('div'); box.className = 'fx-parts'; box.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 22; i++) { var s = document.createElement('i'); s.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;--s:' + (3 + Math.random() * 7).toFixed(1) + 'px;--t:' + (8 + Math.random() * 10).toFixed(1) + 's;--dl:-' + (Math.random() * 14).toFixed(1) + 's;--dx:' + ((Math.random() - .5) * 120).toFixed(0) + 'px'; box.appendChild(s); }
      h.insertBefore(box, h.firstChild);
      if (fine && !reduce) { var bolt = h.querySelector('.bolt'); h.addEventListener('pointermove', function (e) { var r = h.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5; h.style.setProperty('--px', (px * 40).toFixed(1) + 'px'); h.style.setProperty('--py', (py * 30).toFixed(1) + 'px'); }, { passive: true }); }
    });
  }

  /* 7. Dải chữ chạy ngang dưới hero */
  function marquee(root) {
    $$('.nk-hero', root).forEach(function (h) {
      if (h.__mq) return; h.__mq = 1; var words = ['TẬP ĐỀU', 'ĂN ĐỦ', 'NGỦ ĐỦ', 'KHÔNG BỎ CUỘC', 'TIẾN BỘ MỖI NGÀY', 'CHI PHÍ THẤP', 'AN TOÀN'];
      var line = words.map(function (w) { return '<span>' + w + '</span><b>⚡</b>'; }).join('');
      var m = document.createElement('div'); m.className = 'fx-marquee'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = '<div class="fx-track">' + line + line + '</div>';
      h.parentNode.insertBefore(m, h.nextSibling);
    });
  }

  /* 8. Thanh điều hướng dưới (mobile): nảy nhẹ khi chọn */
  function pass(root) { try { hero(root); marquee(root); observeCounts(root); animateBars(root); } catch (e) {} }

  function init() {
    try { scrollBar(); pointerFx(); ripple(); watchToasts(); } catch (e) {}
    var view = document.getElementById('view') || document.body; pass(document);
    var busy = false;
    new MutationObserver(function () { if (busy) return; busy = true; setTimeout(function () { busy = false; pass(document); }, 120); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
