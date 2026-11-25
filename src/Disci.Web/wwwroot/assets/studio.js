/* DISCI Studio – công cụ chỉnh giao diện ngay trên trang (chỉ tài khoản có quyền "appearance" mới thấy công cụ).
   · Sửa chữ: bấm vào bất kỳ dòng chữ nào để đổi (lưu theo nội dung gốc, áp dụng cho mọi trang có đúng dòng chữ đó)
   · Khối: sắp xếp lên/xuống, ẩn/hiện, thêm khối mới (văn bản · banner · liên kết · ảnh) ở MỌI trang
   · Kiểu: phông chữ, bo góc, kiểu thẻ, kiểu nút, màu nhấn
   Mọi thay đổi được lưu vào cấu hình site (Admin › Giao diện website) và có thể xuất thành site-config.js. */
(function (root) {
  'use strict';
  var D = function () { return root.DISCI; }, PL = function () { return D().plat; }, UI = function () { return D().ui; };
  var ORIG = new WeakMap(), timer = 0, mo = null, curPage = '', mode = '';
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, NOSCRIPT: 1, OPTION: 1, CODE: 1 };
  function cfg() { return PL().cfg().site; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function canEdit() { try { return PL().can('appearance'); } catch (e) { return false; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 1. Ghi đè chữ ---------- */
  function walk(el, fn) {
    var w = document.createTreeWalker(el, 4, { acceptNode: function (n) { var p = n.parentNode; if (!p || !n.nodeValue.trim() || SKIP[p.tagName]) return 2; if (p.closest && p.closest('[data-studio],.material-symbols-outlined')) return 2; return 1; } }), n;
    while ((n = w.nextNode())) fn(n);
  }
  function origOf(n) { return ORIG.has(n) ? ORIG.get(n) : n.nodeValue; }
  function applyTexts() {
    var map = cfg().texts || {}, has = Object.keys(map).length;
    walk(document.body, function (n) {
      var raw = origOf(n), key = raw.trim(), val = has ? map[key] : undefined;
      if (val != null && val !== '') { if (!ORIG.has(n)) ORIG.set(n, raw); var nv = raw.replace(key, val); if (n.nodeValue !== nv) n.nodeValue = nv; }
      else if (ORIG.has(n)) { n.nodeValue = ORIG.get(n); ORIG.delete(n); }
    });
  }
  function origText(el) { var t = ''; walk(el, function (n) { t += origOf(n); }); return t.replace(/\s+/g, ' ').trim(); }

  /* ---------- 2. Khối trên mọi trang ---------- */
  function blockCfg(page) { var b = (cfg().blocks || {})[page] || {}; return { order: b.order || [], hidden: b.hidden || [], custom: b.custom || [] }; }
  function groups(view) {
    var kids = [].slice.call(view.children).filter(function (k) { return !(k.dataset && k.dataset.studio !== undefined); }), gs = [], cur = null, seen = {};
    function uniq(k) { var base = k, i = 2; while (seen[k]) k = base + ' #' + (i++); seen[k] = 1; return k; }
    kids.forEach(function (k, i) {
      if (k.dataset && k.dataset.stCustom) { gs.push({ key: 'custom:' + k.dataset.stCustom, label: 'Khối tự thêm', nodes: [k], custom: true }); cur = null; return; }
      var h = k.classList.contains('nk-sect') && k.querySelector('h3');
      if (h) { var t = origText(h); cur = { key: uniq(t), label: t, nodes: [k] }; gs.push(cur); }
      else if (cur && k.tagName !== 'P') cur.nodes.push(k);
      else { cur = null; var hd = k.querySelector && k.querySelector('h1,h2,h3,h4'), lbl = k.classList && k.classList.contains('nk-hero') ? 'Banner đầu trang' : hd ? origText(hd).slice(0, 40) : 'Khối ' + (i + 1); gs.push({ key: uniq(lbl), label: lbl, nodes: [k] }); }
    });
    return gs;
  }
  function safeUrl(u) { u = String(u || ''); return /^data:image\//.test(u) || /^https:\/\//.test(u) ? u : ''; }
  function linkOf(h) { return UI().safeHref(h); }
  function renderCustom(c) {
    var el = document.createElement('section'), t = c.title ? esc(c.title) : '', x = c.text ? esc(c.text).replace(/\n/g, '<br>') : '', img = safeUrl(c.img), btn = c.linkLabel && linkOf(c.link) ? '<a class="btn btn-volt" href="' + esc(linkOf(c.link)) + '">' + esc(c.linkLabel) + '</a>' : '';
    el.className = 'st-blk st-' + esc(c.type || 'text');
    if (c.type === 'banner') { el.className += ' st-banner'; el.innerHTML = '<div class="in">' + (t ? '<h2>' + t + '</h2>' : '') + (x ? '<p>' + x + '</p>' : '') + btn + '</div>'; if (img) el.style.backgroundImage = 'linear-gradient(90deg,rgb(9 9 11/.75),rgb(9 9 11/.25)),url("' + img + '")'; }
    else if (c.type === 'image') { el.innerHTML = (img ? '<img src="' + img + '" alt="' + t + '">' : '') + (t || x ? '<p class="cap"><b>' + t + '</b> ' + x + '</p>' : ''); }
    else if (c.type === 'links') { el.className += ' card'; el.innerHTML = (t ? '<h3>' + t + '</h3>' : '') + (x ? '<p class="sub">' + x + '</p>' : '') + '<div class="st-links">' + String(c.links || '').split('\n').map(function (l) { var p = l.split('|'), h = linkOf((p[1] || '').trim()); return p[0].trim() && h ? '<a class="btn btn-sm" href="' + esc(h) + '">' + esc(p[0].trim()) + '</a>' : ''; }).join('') + '</div>'; }
    else { el.className += ' card'; el.innerHTML = (t ? '<h3>' + t + '</h3>' : '') + (x ? '<p>' + x + '</p>' : '') + btn; }
    return el;
  }
  function applyBlocks() {
    var view = document.getElementById('view'); if (!view || !curPage) return;
    var b = blockCfg(curPage), ids = {}, i;
    (b.custom || []).forEach(function (c) {
      ids[c.id] = 1; var sig = JSON.stringify(c), ex = [].slice.call(view.children).filter(function (k) { return k.dataset && k.dataset.stCustom === c.id; })[0];
      if (ex && ex.dataset.stSig === sig) return; var el = renderCustom(c); el.dataset.stCustom = c.id; el.dataset.stSig = sig; if (ex) view.replaceChild(el, ex); else view.appendChild(el);
    });
    [].slice.call(view.children).forEach(function (k) { if (k.dataset && k.dataset.stCustom && !ids[k.dataset.stCustom]) k.remove(); });
    [].slice.call(document.querySelectorAll('.st-tb')).forEach(function (n) { n.remove(); });
    var gs = groups(view), order = b.order.length ? b.order : (curPage === 'dashboard' ? (cfg().layoutOrder || []) : []), hidden = b.hidden.concat(curPage === 'dashboard' ? (cfg().layoutHidden || []) : []);
    var any = order.length || hidden.length || b.custom.length || mode === 'blocks';
    gs.forEach(function (g) { g.nodes.forEach(function (n) { n.style.order = ''; n.classList.remove('st-hidden', 'st-ghost'); if (n.dataset.stD !== undefined) { n.style.display = n.dataset.stD; delete n.dataset.stD; } }); });
    if (!any) return;
    if (root.getComputedStyle(view).display === 'block' || view.dataset.stFlex) { view.style.display = 'flex'; view.style.flexDirection = 'column'; view.dataset.stFlex = '1'; }
    var firstListed = 1e9; gs.forEach(function (g, j) { if (order.indexOf(g.key) >= 0 && j < firstListed) firstListed = j; });
    gs.forEach(function (g, j) { var oi = order.indexOf(g.key); g.ord = oi >= 0 ? oi : (j < firstListed ? j - 1000 : 500 + j); g.nodes.forEach(function (n) { n.style.order = g.ord; }); if (hidden.indexOf(g.key) >= 0) g.nodes.forEach(function (n) { n.classList.add(mode === 'blocks' ? 'st-ghost' : 'st-hidden'); if (mode !== 'blocks') { n.dataset.stD = n.style.display || ''; n.style.display = 'none'; } }); });
    if (mode === 'blocks') {
      var seq = gs.slice().sort(function (a, c) { return a.ord - c.ord; }), keys = seq.map(function (g) { return g.key; });
      gs.forEach(function (g) {
        var n = g.nodes[0]; if (root.getComputedStyle(n).position === 'static') n.style.position = 'relative';
        var tb = document.createElement('div'); tb.className = 'st-tb'; tb.setAttribute('data-studio', '');
        tb.innerHTML = '<span title="' + esc(g.label) + '">' + esc(g.label.slice(0, 22)) + '</span><button type="button" data-st="up" aria-label="Lên">▲</button><button type="button" data-st="dn" aria-label="Xuống">▼</button><button type="button" data-st="eye" aria-label="Ẩn hoặc hiện">' + (hidden.indexOf(g.key) >= 0 ? 'Hiện' : 'Ẩn') + '</button>' + (g.custom ? '<button type="button" data-st="ed">Sửa</button><button type="button" data-st="rm">Xóa</button>' : '');
        tb._g = g; tb._keys = keys; n.appendChild(tb);
      });
    }
  }
  function saveBlock(page, fn) {
    var all = clone(cfg().blocks || {}), b = all[page] = all[page] || { order: [], hidden: [], custom: [] }; b.order = b.order || []; b.hidden = b.hidden || []; b.custom = b.custom || [];
    if (page === 'dashboard' && !b.migrated) { b.migrated = 1; if (!b.order.length) b.order = (cfg().layoutOrder || []).slice(); b.hidden = b.hidden.concat((cfg().layoutHidden || []).filter(function (k) { return b.hidden.indexOf(k) < 0; })); if (cfg().layoutOrder.length) PL().setCfg('site.layoutOrder', [], 'chuyển bố cục'); if (cfg().layoutHidden.length) PL().setCfg('site.layoutHidden', [], 'chuyển bố cục'); }
    fn(b); PL().setCfg('site.blocks', all, 'bố cục ' + page); apply();
  }
  function onToolbar(e) {
    var btn = e.target.closest && e.target.closest('[data-st]'); if (!btn) return; var tb = btn.closest('.st-tb'); if (!tb) return; e.preventDefault(); e.stopPropagation();
    var g = tb._g, keys = tb._keys.slice(), i = keys.indexOf(g.key), a = btn.dataset.st;
    try {
      if (a === 'up' || a === 'dn') { var j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= keys.length) return; var t = keys[i]; keys[i] = keys[j]; keys[j] = t; saveBlock(curPage, function (b) { b.order = keys; }); }
      else if (a === 'eye') saveBlock(curPage, function (b) { var k = b.hidden.indexOf(g.key); if (k >= 0) b.hidden.splice(k, 1); else b.hidden.push(g.key); });
      else if (a === 'rm') UI().confirm({ title: 'Xóa khối này?', text: 'Khối tự thêm sẽ bị xóa khỏi trang.', ok: 'Xóa', danger: true }).then(function (y) { if (y) saveBlock(curPage, function (b) { var id = g.key.slice(7); b.custom = b.custom.filter(function (c) { return c.id !== id; }); b.order = b.order.filter(function (k) { return k !== g.key; }); b.hidden = b.hidden.filter(function (k) { return k !== g.key; }); }); });
      else if (a === 'ed') { var id = g.key.slice(7), c = blockCfg(curPage).custom.filter(function (x) { return x.id === id; })[0]; if (c) customEditor(c); }
    } catch (err) { UI().toast(err.message || String(err), 'err'); }
  }
  function customEditor(c) {
    var isNew = !c; c = c || { id: 'b' + Date.now().toString(36), type: 'text', title: '', text: '', img: '', link: '', linkLabel: '', links: '' };
    var U = UI(), img = c.img || '', f = function (id, l, v, max) { return '<label class="lbl" for="' + id + '">' + l + '</label><input class="field" id="' + id + '" maxlength="' + max + '" value="' + esc(v) + '">'; };
    var m = U.modal('<h3>' + (isNew ? 'Thêm khối mới' : 'Sửa khối') + '</h3><label class="lbl" for="cb_t">Loại khối</label><select class="field" id="cb_t">' + [['text', 'Văn bản (thẻ)'], ['banner', 'Banner (ảnh nền + nút)'], ['links', 'Dải liên kết nhanh'], ['image', 'Ảnh lớn + chú thích']].map(function (o) { return '<option value="' + o[0] + '"' + (c.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      f('cb_title', 'Tiêu đề', c.title, 80) + '<label class="lbl" for="cb_text">Nội dung</label><textarea class="field" id="cb_text" rows="3" maxlength="600">' + esc(c.text) + '</textarea>' + f('cb_ll', 'Chữ trên nút (tùy chọn)', c.linkLabel, 30) + f('cb_link', 'Liên kết của nút (vd: store.html)', c.link, 160) +
      '<label class="lbl" for="cb_links">Dải liên kết (mỗi dòng: Nhãn | đường dẫn)</label><textarea class="field" id="cb_links" rows="3" placeholder="Cửa hàng | store.html">' + esc(c.links) + '</textarea>' +
      '<div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn" type="button" id="cb-up">Tải ảnh</button><button class="btn" type="button" id="cb-rm">Gỡ ảnh</button></div><div class="sub" id="cb-pv">' + (img ? 'Đã có ảnh.' : 'Chưa có ảnh.') + '</div>' +
      (isNew ? '<label class="lbl" for="cb_pos">Vị trí</label><select class="field" id="cb_pos"><option value="end">Cuối trang</option><option value="start">Đầu trang</option></select>' : '') +
      '<div class="row"><button class="btn" data-close type="button">Hủy</button><button class="btn btn-pri" type="button" id="cb-save">Lưu khối</button></div>', { wide: true });
    var q = function (s) { return m.querySelector(s); };
    q('#cb-up').addEventListener('click', function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { if (i.files[0]) U.fileToImage(i.files[0], 1400, function (d) { img = d; q('#cb-pv').textContent = 'Đã chọn ảnh mới.'; }, 'banner'); }; i.click(); });
    q('#cb-rm').addEventListener('click', function () { img = ''; q('#cb-pv').textContent = 'Sẽ gỡ ảnh khi lưu.'; });
    q('#cb-save').addEventListener('click', function () {
      try {
        var o = { id: c.id, type: q('#cb_t').value, title: q('#cb_title').value.trim(), text: q('#cb_text').value.trim(), img: img, link: linkOf(q('#cb_link').value.trim()), linkLabel: q('#cb_ll').value.trim(), links: q('#cb_links').value };
        if (!o.title && !o.text && !o.img && !o.links.trim()) throw new Error('Hãy nhập ít nhất tiêu đề, nội dung, ảnh hoặc liên kết.');
        var pos = isNew ? q('#cb_pos').value : null;
        saveBlock(curPage, function (b) {
          if (isNew) { var cur = groups(document.getElementById('view')).sort(function (a, z) { return a.ord - z.ord; }).map(function (g) { return g.key; }).filter(function (k) { return k !== 'custom:' + o.id; }); b.custom.push(o); b.order = pos === 'start' ? ['custom:' + o.id].concat(cur) : cur.concat(['custom:' + o.id]); }
          else b.custom = b.custom.map(function (x) { return x.id === o.id ? o : x; });
        });
        m.close(); U.toast('Đã lưu khối');
      } catch (e) { U.toast(e.message || String(e), 'err'); }
    });
  }

  /* ---------- 3. Chế độ sửa chữ ---------- */
  function textNodeAt(e) {
    var r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY), n = r && r.startContainer;
    if (n && n.nodeType === 3 && n.nodeValue.trim() && !(n.parentNode.closest && n.parentNode.closest('[data-studio],.modal,.material-symbols-outlined'))) return n;
    var found = null; walk(e.target, function (x) { if (!found) found = x; }); return found;
  }
  function onTextClick(e) {
    if (mode !== 'text' || !canEdit()) return; var t = e.target; if (t.closest && t.closest('[data-studio],.modal')) return;
    e.preventDefault(); e.stopPropagation(); var n = textNodeAt(e); if (!n) return; textEditor(n);
  }
  function textEditor(n) {
    var U = UI(), raw = origOf(n), key = raw.trim(), map = cfg().texts || {}, cur = map[key] != null ? map[key] : key;
    var m = U.modal('<h3>Sửa chữ</h3><p class="sub">Chữ gốc: <b>' + esc(key) + '</b><br>Áp dụng cho mọi nơi có đúng dòng chữ này.</p><textarea class="field" id="tx-v" rows="3" maxlength="300">' + esc(cur) + '</textarea><div class="row"><button class="btn" type="button" id="tx-rs">Khôi phục gốc</button><button class="btn" data-close type="button">Hủy</button><button class="btn btn-pri" type="button" id="tx-ok">Lưu</button></div>');
    function put(v) { try { var all = clone(cfg().texts || {}); if (v == null || v === key || v === '') delete all[key]; else all[key] = v; PL().setCfg('site.texts', all, 'sửa chữ'); m.close(); apply(); U.toast('Đã cập nhật chữ'); } catch (err) { U.toast(err.message || String(err), 'err'); } }
    m.querySelector('#tx-ok').addEventListener('click', function () { put(m.querySelector('#tx-v').value.trim()); });
    m.querySelector('#tx-rs').addEventListener('click', function () { put(null); });
  }

  /* ---------- 4. Kiểu giao diện ---------- */
  var STYLE_OPTS = {
    font: ['Phông chữ', [['inter', 'Inter (mặc định)'], ['system', 'Hệ thống'], ['serif', 'Có chân (serif)'], ['rounded', 'Bo tròn'], ['mono', 'Đơn cách (mono)']]],
    radius: ['Bo góc thẻ & ô nhập', [['sharp', 'Vuông vắn'], ['normal', 'Mặc định'], ['round', 'Bo tròn'], ['pill', 'Rất tròn']]],
    cardStyle: ['Kiểu thẻ', [['default', 'Mặc định'], ['flat', 'Phẳng'], ['outline', 'Viền màu nhấn'], ['elevated', 'Nổi (đổ bóng)'], ['glass', 'Kính mờ']]],
    btnStyle: ['Kiểu nút', [['default', 'Mặc định'], ['pill', 'Viên thuốc'], ['round', 'Bo vừa'], ['square', 'Vuông']]]
  };
  function styleFields(s) { return Object.keys(STYLE_OPTS).map(function (k) { var o = STYLE_OPTS[k]; return '<label class="lbl" for="sy_' + k + '">' + o[0] + '</label><select class="field" id="sy_' + k + '" data-sy="' + k + '">' + o[1].map(function (x) { return '<option value="' + x[0] + '"' + (s[k] === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>'; }).join(''); }
  function styleModal() {
    var U = UI(), s = cfg(), draft = {};
    var m = U.modal('<h3>Kiểu giao diện</h3><p class="sub">Xem trước ngay trên trang; bấm Lưu để áp dụng cho mọi người dùng.</p>' + styleFields(s) + '<label class="lbl" for="sy_a">Màu nhấn chính</label><input type="color" class="adm-color" id="sy_a" value="' + esc(s.accent) + '"><div class="row"><button class="btn" data-close type="button">Hủy</button><button class="btn btn-pri" type="button" id="sy-ok">Lưu</button></div>', { onClose: function () { PL().applySite(); } });
    m.addEventListener('input', function (e) { var k = e.target.dataset.sy || (e.target.id === 'sy_a' ? 'accent' : ''); if (!k) return; draft[k] = e.target.value; PL().applySite(draft); });
    m.querySelector('#sy-ok').addEventListener('click', function () { try { Object.keys(draft).forEach(function (k) { PL().setCfg('site.' + k, draft[k], 'kiểu giao diện'); }); draft = {}; m.close(); U.toast('Đã lưu kiểu giao diện'); } catch (e) { U.toast(e.message || String(e), 'err'); } });
  }

  /* ---------- Thanh chế độ & menu ---------- */
  function bar(text) {
    var old = document.getElementById('st-bar'); if (old) old.remove(); if (!text) return;
    var b = document.createElement('div'); b.id = 'st-bar'; b.className = 'st-bar no-print'; b.setAttribute('data-studio', ''); b.innerHTML = '<span>' + esc(text) + '</span><button type="button" class="btn btn-sm btn-pri" id="st-done">Xong</button>'; document.body.appendChild(b);
    b.querySelector('#st-done').addEventListener('click', function () { setMode(''); });
  }
  function setMode(m) {
    mode = m; document.body.classList.toggle('st-text', m === 'text'); bar(m === 'text' ? 'Đang sửa chữ: bấm vào dòng chữ bất kỳ để đổi' : m === 'blocks' ? 'Đang sắp xếp khối: dùng ▲ ▼ Ẩn trên mỗi khối' : '');
    apply();
  }
  function menu(page, hooks) {
    var U = UI(); hooks = hooks || {};
    var items = [['banner', 'image', 'Banner & thông báo của trang này'], ['text', 'edit_note', 'Sửa chữ trên trang'], ['blocks', 'view_agenda', 'Sắp xếp / ẩn khối'], ['add', 'add_box', 'Thêm khối mới'], ['style', 'palette', 'Kiểu giao diện (phông, bo góc, thẻ, nút)']];
    var m = U.modal('<h3>Chỉnh giao diện</h3><p class="sub">Công cụ dành cho quản trị – người dùng thường không thấy.</p><div style="display:grid;gap:8px">' + items.map(function (i) { return '<button class="btn" type="button" data-sm="' + i[0] + '" style="justify-content:flex-start"><span class="material-symbols-outlined">' + i[1] + '</span>' + i[2] + '</button>'; }).join('') + '<a class="btn" href="admin.html#appearance" style="justify-content:flex-start"><span class="material-symbols-outlined">admin_panel_settings</span>Mở trang quản trị đầy đủ</a></div><div class="row"><button class="btn" data-close type="button">Đóng</button></div>');
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sm]'); if (!b) return; var k = b.dataset.sm; m.close();
      if (k === 'banner' && hooks.banner) hooks.banner(); else if (k === 'text') setMode('text'); else if (k === 'blocks') setMode('blocks'); else if (k === 'add') customEditor(null); else if (k === 'style') styleModal();
    });
  }

  /* ---------- Vòng đời ---------- */
  function apply() {
    if (mo) mo.disconnect();
    try { applyTexts(); applyBlocks(); } catch (e) { console.error(e); }
    observe();
  }
  function observe() { if (!mo) mo = new MutationObserver(function () { if (timer) return; timer = setTimeout(function () { timer = 0; apply(); }, 60); }); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  function run(page) {
    curPage = page; mode = ''; if (!document.body.dataset.stInit) { document.body.dataset.stInit = '1'; document.addEventListener('click', onToolbar, true); document.addEventListener('click', onTextClick, true); }
    apply(); setTimeout(apply, 350);
  }
  root.DISCI = root.DISCI || {};
  root.DISCI.studio = { run: run, apply: apply, menu: menu, styleModal: styleModal, customEditor: customEditor, setMode: setMode, styleFields: styleFields, STYLE_OPTS: STYLE_OPTS, applyTexts: applyTexts };
})(window);
