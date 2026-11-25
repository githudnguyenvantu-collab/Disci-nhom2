/* DISCI COMMUNITY (v5) – mạng xã hội Fitness: bảng tin · stories · video feed · thành viên · hồ sơ · nhóm · thử thách · xếp hạng · thông báo.
   Dữ liệu dùng chung nằm ở DISCI.plat; bài đăng thật của bạn vẫn lưu trong dữ liệu cá nhân (S.posts) như trước.
   Nội dung DEMO có nhãn "DEMO", hoạt động từ Mô phỏng có nhãn "MÔ PHỎNG" – luôn tách bạch với hoạt động thật. */
(function () {
  var E = DISCI_ENGINE, D = DISCI_DATA, ST = DISCI.store, ui = DISCI.ui, esc = ui.esc, $ = ui.$, PL = DISCI.plat, DM = DISCI.demo, SM = DISCI.sim;
  var TOPICS = ['Hành trình', 'Kỹ thuật', 'Dinh dưỡng', 'Thành tích', 'Thảo luận'], VIS = { public: '🌐 Công khai', followers: '👥 Người theo dõi', private: '🔒 Riêng tư' };
  ui.boot({ page: 'community', title: 'Cộng đồng', render: function (v) {
    if (!PL.isStaff() && PL.cfg().system.communityOpen === false) { v.innerHTML = '<div class="card" style="text-align:center;max-width:520px;margin:40px auto">' + ui.empty('lock_clock', 'Cộng đồng đang tạm đóng', 'Quản trị viên đã tạm đóng Cộng đồng. Bạn vẫn dùng được các tính năng khác của DISCI.') + '</div>'; return; }
    try { DM.ensureSeeded(); } catch (e) { console.error(e); }
    var S = ST.S, p = S.profile, me = ST.user.id, tab = 'feed', prevTab = 'feed', topic = 'all', draftImg = '', draftText = S.draft || '', editing = null, openCom = {}, lbKey = 'streak', vcat = 'all', vurls = {}, VCATS = ['Hướng dẫn', 'Kinh nghiệm', 'Quá trình tập', 'Thành tích'], MED = DISCI.media;
    var viewId = null, gid = null, msq = '', mfil = 'all', mgoal = 'all', feedSub = 'all', lim = 12, t = ST.today(), vmode = 'reels', lastSim = 0;
    var A = function (id) { return PL.actor(id); };
    /* ---- di chuyển dữ liệu cũ (thích/bình luận/theo dõi/nhóm) sang kho dùng chung – chỉ chạy một lần, không mất dữ liệu ---- */
    (function migrate() {
      if (S.platMig) return; var d = PL.db();
      Object.keys(S.likes || {}).forEach(function (id) { if (S.likes[id] && !PL.liked(id, me)) (d.likes[id] = d.likes[id] || []).push(me); });
      Object.keys(S.comments || {}).forEach(function (id) { (S.comments[id] || []).forEach(function (c) { (d.comments[id] = d.comments[id] || []).push({ id: ST.uid(), by: me, text: c.text, at: c.at }); }); });
      Object.keys(S.follows || {}).forEach(function (id) { if (S.follows[id]) { d.follows[me] = d.follows[me] || []; if (d.follows[me].indexOf(id) < 0) d.follows[me].push(id); } });
      (S.groups || []).forEach(function (g) { if (!PL.groupById(g.id)) d.groups.push({ id: g.id, name: g.name, desc: '', hue: PL.hash(g.id) % 360, owner: me, members: [me], demo: false, at: Date.now() }); });
      Object.keys(S.joinedGroups || {}).forEach(function (g) { var gr = PL.groupById(g); if (gr && (gr.members || []).indexOf(me) < 0) { gr.members = gr.members || []; gr.members.push(me); } });
      Object.keys(S.challenges.joined || {}).forEach(function (c) { PL.joinChallenge(c, me); });
      S.platMig = 1; PL.save(); ST.save();
    })();
    function fmtDur(s) { if (s == null) return ''; s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    function fmtMB(b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }
    function videoEl(x) { return '<div class="vid"><video data-vid="' + esc(x.videoId) + '"' + (x.vposter ? ' poster="' + x.vposter + '"' : '') + ' controls playsinline preload="none" aria-label="Video: ' + esc(x.vname || 'video') + '"></video><div class="meta">🎬 ' + esc(x.vname || 'video') + (x.vsize ? ' · ' + fmtMB(x.vsize) : '') + (x.vdur ? ' · ' + fmtDur(x.vdur) : '') + '</div></div>'; }
    function hydrate() {
      ui.$$('video[data-vid]', v).forEach(function (el) {
        var key = el.dataset.vid; if (vurls[key]) { el.src = vurls[key]; return; }
        MED.get(key).then(function (b) { if (!b) { el.parentNode.innerHTML = '<div class="alert alert-2"><span class="material-symbols-outlined">warning</span><div>Video không còn trên thiết bị này (có thể đã bị xóa dữ liệu trình duyệt).</div></div>'; return; } vurls[key] = URL.createObjectURL(b); el.src = vurls[key]; }).catch(function () { el.parentNode.innerHTML = '<div class="alert alert-3">Không đọc được video.</div>'; });
      });
    }
    function probe(url) {
      var MS = window.DISCI_MEDIA_PROBE_MS || 6000;
      return new Promise(function (res) {
        var el = document.createElement('video'), settled = false, to;
        function fin(o) { if (settled) return; settled = true; clearTimeout(to); try { el.removeAttribute('src'); el.load(); } catch (e) {} res(o); }
        el.preload = 'metadata'; el.muted = true; el.playsInline = true;
        el.onerror = function () { fin({ error: true }); };
        el.onloadedmetadata = function () { var d = el.duration; if (!isFinite(d) || d <= 0) return fin({ dur: null, poster: '' }); try { el.currentTime = Math.min(0.5, d / 2); } catch (e) { fin({ dur: d, poster: '' }); } };
        el.onseeked = function () { var poster = ''; try { var k = Math.min(1, 480 / (Math.max(el.videoWidth, el.videoHeight) || 480)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(el.videoWidth * k)); c.height = Math.max(1, Math.round(el.videoHeight * k)); c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); poster = c.toDataURL('image/jpeg', 0.72); } catch (e) {} fin({ dur: el.duration, poster: poster }); };
        to = setTimeout(function () { fin({ dur: null, poster: '', timeout: true }); }, MS);
        el.src = url;
      });
    }
    function uploadModal() {
      var L = MED.LIMITS, file = null, url = '', meta = { dur: null, poster: '' }, busy = false, used = S.posts.reduce(function (a, x) { return a + (x.vsize || 0); }, 0);
      var m = ui.modal('<h3>Đăng video</h3><p class="sub">MP4, WebM hoặc MOV · tối đa ' + fmtMB(L.maxBytes) + ' · tối đa ' + (L.maxSeconds / 60) + ' phút. Video được lưu trên thiết bị này (đã dùng ' + fmtMB(used) + ' / ' + fmtMB(L.userBytes) + ').</p>' +
        '<label class="vz" id="vz" for="vf" tabindex="0"><span class="material-symbols-outlined">video_call</span><b>Chọn video hoặc kéo thả vào đây</b><span style="font-size:13px;color:rgb(var(--on-surface-variant))">Hướng dẫn · kinh nghiệm · quá trình tập · thành tích</span></label><input type="file" id="vf" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden>' +
        '<div id="vprev" style="margin-top:12px"></div><div id="verr" role="alert"></div>' +
        '<div id="vkind" class="sub" style="margin:8px 0 0">Video dưới ' + SHORT_MAX + ' giây vào mục <b>Video ngắn</b>, dài hơn vào mục <b>Video dài</b>.</div><label class="lbl" for="vtt">Tiêu đề (hiện ở Video dài)</label><input class="field" id="vtt" maxlength="100" placeholder="Ví dụ: Bài tập vai tại nhà 20 phút"><label class="lbl" for="vt">Mô tả (tùy chọn)</label><textarea class="field" id="vt" rows="2" maxlength="500" placeholder="Chia sẻ điều bạn muốn nói về video này…" style="border-radius:12px"></textarea>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px"><div><label class="lbl" for="vc">Loại video</label><select class="field" id="vc">' + VCATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div><div><label class="lbl" for="vv">Ai xem được</label><select class="field" id="vv">' + Object.keys(VIS).map(function (k) { return '<option value="' + k + '">' + VIS[k] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="bar indet" id="vbar" style="margin-top:12px" hidden><i></i></div><p style="font-size:12px;color:rgb(var(--on-surface-variant));margin:10px 0 0">Video chỉ nằm trên thiết bị này, chưa được tải lên máy chủ nên người khác chưa xem được. Đừng đăng nội dung nhạy cảm hoặc vi phạm nội quy.</p>' +
        '<div class="row"><button class="btn" data-close id="vcancel">Hủy</button><button class="btn btn-pri" id="vok" disabled>Đăng video</button></div>', { wide: true, sticky: true, onClose: function () { if (url) URL.revokeObjectURL(url); } });
      function err(msg, warn) { ui.$('#verr', m).innerHTML = msg ? '<div class="alert alert-' + (warn ? 2 : 3) + '" style="margin-top:10px"><span class="material-symbols-outlined">' + (warn ? 'warning' : 'error') + '</span><div>' + esc(msg) + '</div></div>' : ''; }
      function reset() { file = null; if (url) URL.revokeObjectURL(url); url = ''; ui.$('#vprev', m).innerHTML = ''; ui.$('#vok', m).disabled = true; }
      function pick(f) {
        err(''); reset(); if (!f) return;
        var okType = L.types.indexOf(f.type) >= 0 || (!f.type && /\.(mp4|webm|mov|m4v)$/i.test(f.name));
        if (!okType) return err('Định dạng "' + (f.type || f.name.split('.').pop()) + '" chưa được hỗ trợ. Hãy chọn video MP4, WebM hoặc MOV.');
        if (!f.size) return err('Tệp video trống.');
        if (f.size > L.maxBytes) return err('Video nặng ' + fmtMB(f.size) + ', tối đa ' + fmtMB(L.maxBytes) + '. Hãy nén hoặc cắt ngắn video.');
        if (used + f.size > L.userBytes) return err('Không đủ chỗ: đã dùng ' + fmtMB(used) + ' / ' + fmtMB(L.userBytes) + '. Hãy xóa bớt video cũ.');
        file = f; url = URL.createObjectURL(f);
        ui.$('#vprev', m).innerHTML = '<div class="vid"><video src="' + url + '" controls playsinline muted preload="metadata"></video><div class="meta" id="vmeta">🎬 ' + esc(f.name) + ' · ' + fmtMB(f.size) + ' · đang đọc thông tin…</div></div>';
        probe(url).then(function (info) {
          if (file !== f) return;
          if (info.error) { reset(); return err('Trình duyệt không phát được video này (định dạng/codec không được hỗ trợ). Hãy thử video MP4 (H.264).'); }
          if (info.dur && info.dur > L.maxSeconds + 0.5) { reset(); return err('Video dài ' + fmtDur(info.dur) + ', tối đa ' + fmtDur(L.maxSeconds) + '. Hãy cắt ngắn rồi thử lại.'); }
          meta = info; var mt = ui.$('#vmeta', m); if (mt) mt.textContent = '🎬 ' + f.name + ' · ' + fmtMB(f.size) + (info.dur ? ' · ' + fmtDur(info.dur) : ''); var kd = ui.$('#vkind', m); if (kd && info.dur) kd.innerHTML = info.dur > SHORT_MAX ? '→ Đây là <b>Video dài</b> (' + fmtDur(info.dur) + '), sẽ hiện ở mục Video dài.' : '→ Đây là <b>Video ngắn</b> (' + fmtDur(info.dur) + '), sẽ hiện ở mục Video ngắn.';
          if (info.timeout || !info.dur) err('Không đọc được thời lượng video, bạn vẫn có thể đăng.', true);
          ui.$('#vok', m).disabled = false;
        });
      }
      ui.$('#vf', m).addEventListener('change', function () { pick(this.files[0]); });
      var vz = ui.$('#vz', m);
      ['dragenter', 'dragover'].forEach(function (ev) { vz.addEventListener(ev, function (e) { e.preventDefault(); vz.classList.add('drag'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { vz.addEventListener(ev, function (e) { e.preventDefault(); vz.classList.remove('drag'); }); });
      vz.addEventListener('drop', function (e) { pick(e.dataTransfer && e.dataTransfer.files[0]); });
      vz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.$('#vf', m).click(); } });
      ui.$('#vok', m).addEventListener('click', function () {
        if (!file || busy) return; busy = true; err('');
        var btn = ui.$('#vok', m), id = ST.uid(), key = ST.user.id + ':' + id, cat = ui.$('#vc', m).value;
        btn.disabled = true; btn.textContent = 'Đang lưu…'; ui.$('#vcancel', m).disabled = true; ui.$('#vbar', m).hidden = false;
        function fail(msg) { busy = false; btn.disabled = false; btn.textContent = 'Đăng video'; ui.$('#vcancel', m).disabled = false; ui.$('#vbar', m).hidden = true; err(msg); }
        MED.put(key, file, ST.user.id).then(function (r) {
          S.posts.push({ id: id, vtitle: ui.$('#vtt', m).value.trim().slice(0, 100), text: ui.$('#vt', m).value.trim(), topic: cat, vcat: cat, vis: ui.$('#vv', m).value, videoId: key, vposter: meta.poster || '', vdur: meta.dur || null, vsize: file.size, vname: file.name, vtype: file.type, at: Date.now() });
          if (!ST.save()) { S.posts.pop(); MED.del(key); return fail('Bộ nhớ trình duyệt đã đầy nên không thể lưu bài đăng. Hãy xóa bớt dữ liệu.'); }
          m.close(); tab = (tab === 'reels' || tab === 'watch') ? ((meta.dur || 0) > SHORT_MAX ? 'watch' : 'reels') : 'feed'; ui.toast(r.persistent ? 'Đã đăng video' : 'Đã đăng video (chỉ giữ tạm: trình duyệt không cho lưu bền vững)'); render();
        }).catch(function (e) { fail('Không thể lưu video: ' + ((e && e.message) || 'không đủ dung lượng trình duyệt') + '.'); });
      });
    }
    /* ================= thành phần dùng chung ================= */
    function tagsOf(a, x) { return (a.verified ? '<span class="material-symbols-outlined fill cm-ver" title="Tài khoản chính thức">verified</span>' : '') + (x && x.sim ? ' <span class="demo-tag">MÔ PHỎNG</span>' : (a.demo || (x && x.demo)) ? ' <span class="demo-tag">DEMO</span>' : ''); }
    function av(a, sz, cls) { return '<img class="cm-av ' + (cls || '') + '" data-prof="' + esc(a.id) + '" style="width:' + sz + 'px;height:' + sz + 'px" src="' + PL.avatarUrl(a) + '" alt="' + esc(a.name) + '" loading="lazy">'; }
    function firstN(n) { return ui.firstName(n); }
    function topN(arr, n) { return arr.slice(0, n); }
    function canSeeDemo() { return PL.cfg().system.showDemo !== false; }
    function pool() { // mọi thành viên có thể theo dõi (trừ bản thân)
      var out = [A('official')]; ST.users().forEach(function (u) { if (u.id !== me && !u.locked && !(u.demo && !canSeeDemo())) out.push(A(u.id)); }); if (canSeeDemo()) PL.db().users.forEach(function (u) { out.push(A(u.id)); }); return out;
    }
    function goalOf(a) { return D.GOALS[a.goal] || ''; }
    function followBtn(a, cls) { if (a.id === me || a.gone) return ''; var f = PL.isFollowing(me, a.id); return '<button class="btn btn-sm ' + (f ? '' : 'btn-pri') + ' ' + (cls || '') + '" data-fol="' + esc(a.id) + '" aria-pressed="' + f + '">' + (f ? 'Đang theo dõi' : 'Theo dõi') + '</button>'; }
    function mediaHtml(x) {
      if (x.clip) return PL.clipHtml(x.clip, 'cl_' + x.id);
      if (x.art) return '<img class="cm-img" src="' + PL.artUrl(x.art) + '" alt="Ảnh minh họa (DEMO)" loading="lazy">';
      if (x.img) return '<img class="cm-img" src="' + x.img + '" alt="Ảnh bài viết" loading="lazy">';
      if (x.videoId) return videoEl(x);
      if (x.video) return '<div class="vid"><video src="' + esc(x.video) + '" controls playsinline preload="none"></video></div>';
      return '';
    }
    function likerLine(id) {
      var l = PL.likesOf(id), names = l.filter(function (a) { return a !== me; }).slice(0, 2).map(function (a) { return firstN(A(a).name); }); if (PL.liked(id, me)) names.unshift('Bạn');
      return !l.length ? '' : '<span>❤ ' + esc(names.join(', ')) + (l.length > names.length ? ' và ' + (l.length - names.length) + ' người khác' : '') + '</span>';
    }
    function commentsHtml(x) {
      var cs = PL.commentsOf(x.id);
      return '<div class="cm-comments">' + cs.map(function (c) { var a = A(c.by); return '<div class="cm-c">' + av(a, 30) + '<div class="fb-bubble"><b>' + esc(a.name) + '</b>' + tagsOf(a, c) + '<div style="white-space:pre-wrap">' + esc(c.text) + '</div><small>' + ui.ago(c.at) + (c.by === me ? ' · <button class="lnk" data-cdel="' + x.id + '|' + c.id + '">Xóa</button>' : '') + '</small></div></div>'; }).join('') +
        '<div class="cm-c">' + av({ id: me, name: p.name, avatar: p.avatar }, 30) + '<div style="flex:1;display:flex;gap:6px"><input class="field" data-ci="' + x.id + '" maxlength="500" placeholder="Viết bình luận…" aria-label="Viết bình luận"><button class="btn btn-sm btn-pri" data-cs="' + x.id + '">Gửi</button></div></div></div>';
    }
    function postHtml(x) {
      var a = A(x.by), mine = x.by === me, liked = PL.liked(x.id, me), n = PL.likesOf(x.id).length, cs = PL.commentsOf(x.id), sh = PL.sharesOf(x.id), sv = S.saved.indexOf(x.id) >= 0, g = x.group && PL.groupById(x.group);
      return '<article class="card cm-post" data-post="' + x.id + '"><div class="cm-ph">' + av(a, 42) + '<div style="flex:1;min-width:0"><b class="cm-name" data-prof="' + esc(a.id) + '">' + esc(a.name) + '</b>' + tagsOf(a, x) + '<div class="cm-sub">' + ui.ago(x.at) + ' · ' + (VIS[x.vis] || VIS.public) + ' · ' + esc(x.topic) + (g ? ' · <button class="lnk" data-gopen="' + g.id + '">👥 ' + esc(g.name) + '</button>' : '') + (x.edited ? ' · đã sửa' : '') + '</div></div>' +
        (mine ? '<button class="btn btn-sm" data-edit="' + x.id + '">Sửa</button><button class="btn btn-sm btn-danger" data-del="' + x.id + '">Xóa</button>' : followBtn(a) + '<button class="btn btn-sm" data-rep="' + x.id + '" aria-label="Báo cáo bài viết"><span class="material-symbols-outlined" style="font-size:18px">flag</span></button>') + '</div>' +
        (x.text ? '<p class="cm-tx">' + esc(x.text) + '</p>' : '<div style="height:10px"></div>') + mediaHtml(x) +
        '<div class="cm-counts"><span data-likes="' + x.id + '">' + likerLine(x.id) + '</span><span>' + (cs.length ? cs.length + ' bình luận' : '') + (sh ? (cs.length ? ' · ' : '') + sh + ' chia sẻ' : '') + '</span></div>' +
        '<div class="fb-react"><button data-like="' + x.id + '" aria-pressed="' + liked + '"><span class="material-symbols-outlined ' + (liked ? 'fill' : '') + '">favorite</span>Thích</button><button data-com="' + x.id + '"><span class="material-symbols-outlined">chat_bubble</span>Bình luận</button><button data-share="' + x.id + '"><span class="material-symbols-outlined">share</span>Chia sẻ</button><button data-sav="' + x.id + '" aria-pressed="' + sv + '"><span class="material-symbols-outlined ' + (sv ? 'fill' : '') + '">bookmark</span>' + (sv ? 'Đã lưu' : 'Lưu') + '</button></div>' + (openCom[x.id] ? commentsHtml(x) : '') + '</article>';
    }
    function posts() {
      var list = PL.visiblePosts(me);
      if (tab === 'mine') list = list.filter(function (x) { return x.by === me; }); else if (tab === 'saved') list = list.filter(function (x) { return S.saved.indexOf(x.id) >= 0; });
      else if (tab === 'group') list = list.filter(function (x) { return x.group === gid; }); else if (tab === 'profile') list = list.filter(function (x) { return x.by === viewId; });
      else if (feedSub === 'following') list = list.filter(function (x) { return x.by === me || PL.isFollowing(me, x.by); });
      if (topic !== 'all' && tab !== 'video') list = list.filter(function (x) { return x.topic === topic; }); return list;
    }

    /* ================= stories ================= */
    function storyBar() {
      var list = PL.storyList(me), by = {}; list.forEach(function (s) { (by[s.by] = by[s.by] || []).push(s); }); S.storySeen = S.storySeen || {};
      var ids = Object.keys(by).sort(function (a, b) { var ua = by[a].every(function (s) { return S.storySeen[s.id]; }), ub = by[b].every(function (s) { return S.storySeen[s.id]; }); return ua === ub ? by[b][0].at - by[a][0].at : ua ? 1 : -1; });
      return '<section class="card cm-stories" aria-label="Stories"><div class="nk-rail" style="gap:12px"><button class="cm-story add" data-addstory aria-label="Tạo story"><span class="cm-sring"><span class="material-symbols-outlined">add</span></span><span>Tạo story</span></button>' +
        ids.map(function (id) { var a = A(id), ss = by[id], seen = ss.every(function (s) { return S.storySeen[s.id]; }); return '<button class="cm-story ' + (seen ? 'seen' : '') + '" data-story="' + esc(id) + '" aria-label="Xem story của ' + esc(a.name) + '"><span class="cm-sring">' + av(a, 54).replace('data-prof', 'data-x') + '</span><span>' + esc(id === me ? 'Của bạn' : firstN(a.name)) + '</span></button>'; }).join('') + '</div></section>';
    }
    function storyViewer(authorId) {
      var ss = PL.storyList(me).filter(function (s) { return s.by === authorId; }).reverse(); if (!ss.length) return; var i = 0, tm, m = document.createElement('div'); m.className = 'cm-sv'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Xem story'); document.body.appendChild(m);
      function close() { clearTimeout(tm); document.removeEventListener('keydown', key); m.remove(); render(); } function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); }
      function next() { if (i >= ss.length - 1) close(); else { i++; show(); } } function prev() { if (i > 0) { i--; show(); } }
      function show() {
        var s = ss[i], a = A(s.by); S.storySeen[s.id] = 1; ST.save(); clearTimeout(tm); tm = setTimeout(next, 4800);
        m.innerHTML = '<div class="cm-sv-box" style="--h:' + s.hue + '"><div class="cm-sv-bars">' + ss.map(function (x, k) { return '<i class="' + (k < i ? 'done' : k === i ? 'run' : '') + '"></i>'; }).join('') + '</div><div class="cm-sv-top">' + av(a, 38).replace('data-prof', 'data-x') + '<div><b>' + esc(a.name) + '</b>' + tagsOf(a, s) + '<small>' + ui.ago(s.at) + '</small></div><button class="icon-btn" data-sv="x" aria-label="Đóng"><span class="material-symbols-outlined">close</span></button></div><div class="cm-sv-body">' + (s.img ? '<img src="' + s.img + '" alt="">' : '') + (s.text ? '<p>' + esc(s.text) + '</p>' : '') + '</div><button class="cm-sv-nav l" data-sv="p" aria-label="Trước"></button><button class="cm-sv-nav r" data-sv="n" aria-label="Sau"></button></div>';
      }
      m.addEventListener('click', function (e) { var b = e.target.closest('[data-sv]'); if (b) { var k = b.dataset.sv; if (k === 'x') close(); else if (k === 'n') next(); else prev(); } else if (e.target === m) close(); }); document.addEventListener('keydown', key); show();
    }
    function storyModal() {
      var hue = 140, img = '', m = ui.modal('<h3>Tạo story</h3><p class="sub">Story hiển thị 24 giờ với mọi người trong Cộng đồng.</p><div class="cm-sprev" id="sp" style="--h:140"><p id="spt">Nội dung story của bạn…</p></div><label class="lbl" for="st-t">Nội dung (tối đa 200 ký tự)</label><textarea class="field" id="st-t" rows="2" maxlength="200"></textarea><div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap">' + [140, 20, 200, 280, 330, 60].map(function (h) { return '<button class="cm-sw" data-h="' + h + '" style="--h:' + h + '" aria-label="Màu ' + h + '"></button>'; }).join('') + '<button class="btn btn-sm" id="st-i"><span class="material-symbols-outlined" style="font-size:18px">image</span>Thêm ảnh</button><input type="file" id="st-f" accept="image/*" hidden></div><div id="fe"></div><div class="row"><button class="btn" data-close>Hủy</button><button class="btn btn-pri" id="st-ok">Đăng story</button></div>');
      $('#st-t', m).addEventListener('input', function () { $('#spt', m).textContent = this.value || 'Nội dung story của bạn…'; });
      m.addEventListener('click', function (e) { var b = e.target.closest('.cm-sw'); if (b) { hue = +b.dataset.h; $('#sp', m).style.setProperty('--h', hue); } });
      $('#st-i', m).onclick = function () { $('#st-f', m).click(); }; $('#st-f', m).onchange = function () { var f = this.files[0]; if (!f || !/^image\//.test(f.type)) return ui.toast('Chỉ hỗ trợ tệp ảnh', 'err'); ui.fileToImage(f, 720, function (d) { img = d; $('#sp', m).style.backgroundImage = 'url(' + d + ')'; }, 'story'); };
      $('#st-ok', m).onclick = function () { var tx = $('#st-t', m).value.trim(); if (!tx && !img) { $('#fe', m).innerHTML = '<div class="err-txt">Hãy nhập nội dung hoặc chọn ảnh.</div>'; return; } var bad = PL.containsBanned(tx); if (bad) { $('#fe', m).innerHTML = '<div class="err-txt">Nội dung chứa từ bị cấm: ' + esc(bad) + '</div>'; return; } PL.addStory({ by: me, text: tx, img: img, hue: hue }); m.close(); ui.toast('Đã đăng story'); render(); };
    }

    /* ================= đăng bài ================= */
    function composer() {
      var e = editing && S.posts.filter(function (x) { return x.id === editing; })[0], myG = PL.groups().filter(function (g) { return (g.members || []).indexOf(me) >= 0; });
      return '<section class="card" id="composer"><div class="cm-ph">' + av({ id: me, name: p.name, avatar: p.avatar }, 42) + '<b style="font-size:13px;color:rgb(var(--on-surface-variant))">' + (e ? 'Chỉnh sửa bài viết' : 'Tạo bài viết') + '</b></div><textarea class="field" id="pt" rows="3" maxlength="1500" placeholder="' + esc(firstN(p.name)) + ' ơi, bạn đang nghĩ gì về buổi tập hôm nay?" style="margin-top:8px;border-radius:14px">' + esc(e ? e.text : draftText) + '</textarea><div id="pe"></div>' +
        '<div class="cm-tools"><select class="field" id="ptp" aria-label="Chủ đề">' + TOPICS.map(function (x) { return '<option' + (e && e.topic === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select><select class="field" id="pv" aria-label="Quyền riêng tư">' + Object.keys(VIS).map(function (k) { return '<option value="' + k + '"' + (e && e.vis === k ? ' selected' : '') + '>' + VIS[k] + '</option>'; }).join('') + '</select>' + (myG.length ? '<select class="field" id="pg" aria-label="Đăng vào nhóm"><option value="">Không đăng vào nhóm</option>' + myG.map(function (g) { return '<option value="' + g.id + '"' + ((e && e.group === g.id) || (!e && tab === 'group' && gid === g.id) ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>' : '') +
        '<label class="btn btn-sm" style="cursor:pointer"><span class="material-symbols-outlined" style="font-size:18px">image</span>Ảnh<input type="file" id="pi" accept="image/*" hidden></label><button type="button" class="btn btn-sm" id="pv-up"><span class="material-symbols-outlined" style="font-size:18px">videocam</span>Video</button><input class="field" id="pvid" placeholder="hoặc dán liên kết video .mp4" value="' + esc(e && e.video || '') + '" aria-label="Liên kết video"></div>' +
        (draftImg || (e && e.img) ? '<div style="margin-top:8px"><img src="' + (draftImg || e.img) + '" alt="Ảnh xem trước" style="max-height:120px;border-radius:10px"> <button class="btn btn-sm" id="pi-x">Bỏ ảnh</button></div>' : '') +
        (e && e.videoId ? '<div class="card-flat" style="margin-top:8px;display:flex;gap:8px;align-items:center;font-size:13px">🎬 Bài này có video đính kèm (' + esc(e.vname || 'video') + ') <button type="button" class="btn btn-sm btn-danger" id="pv-rm" style="margin-left:auto">Gỡ video</button></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:10px">' + (e ? '<button class="btn" id="pc">Hủy sửa</button>' : '<button class="btn" id="pd">Lưu nháp</button>') + '<button class="btn btn-pri" id="pp">' + (e ? 'Lưu thay đổi' : 'Đăng bài') + '</button></div><p class="cm-note">Đừng đăng dữ liệu sức khỏe nhạy cảm (kết quả khám, huyết áp). Bài đăng của bạn hiển thị với các thành viên trên thiết bị này.</p></section>';
    }
    function publish() {
      var tx = $('#pt').value.trim(), er = $('#pe'); er.innerHTML = ''; var vid = $('#pvid').value.trim(), e0 = editing && S.posts.filter(function (x) { return x.id === editing; })[0];
      if (!tx && !draftImg && !(e0 && (e0.img || e0.videoId)) && !vid) { er.innerHTML = '<div class="err-txt">Hãy viết nội dung hoặc thêm ảnh/video trước khi đăng.</div>'; $('#pt').focus(); return; }
      var bad = PL.containsBanned(tx); if (bad) { er.innerHTML = '<div class="err-txt">Nội dung chứa từ bị cấm: “' + esc(bad) + '”. Hãy chỉnh lại.</div>'; return; }
      if (vid && !/^https?:\/\/\S+$/i.test(vid)) { er.innerHTML = '<div class="err-txt">Liên kết video cần bắt đầu bằng http:// hoặc https://</div>'; return; }
      var o = { text: tx, topic: $('#ptp').value, vis: $('#pv').value, video: vid || '', group: ($('#pg') && $('#pg').value) || '' };
      if (editing) { Object.assign(e0, o); if (draftImg) e0.img = draftImg; e0.edited = true; editing = null; ui.toast('Đã cập nhật bài viết'); }
      else { o.id = ST.uid(); o.img = draftImg; o.at = Date.now(); S.posts.push(o); S.draft = ''; ui.toast('Đã đăng bài viết'); }
      draftImg = ''; draftText = ''; ST.save(); PL.fresh(); render();
    }

    /* ================= video feed ================= */
    function reelHtml(x) {
      var a = A(x.by), liked = PL.liked(x.id, me), n = PL.likesOf(x.id).length, sv = S.saved.indexOf(x.id) >= 0, media = x.clip ? PL.clipHtml(x.clip, 'rl_' + x.id) : x.videoId ? '<video data-vid="' + esc(x.videoId) + '"' + (x.vposter ? ' poster="' + x.vposter + '"' : '') + ' loop muted playsinline preload="none"></video>' : '<video src="' + esc(x.video) + '" loop muted playsinline preload="none"></video>';
      return '<article class="reel" data-post="' + x.id + '"><div class="reel-m">' + media + '</div><div class="reel-ui"><div class="reel-info">' + av(a, 38) + '<b data-prof="' + esc(a.id) + '">' + esc(a.name) + '</b>' + tagsOf(a, x) + ' ' + followBtn(a, 'reel-f') + '<p>' + esc(x.text || '') + '</p><small>' + esc(x.topic) + ' · ' + ui.ago(x.at) + '</small></div><div class="reel-side"><button data-like="' + x.id + '" aria-pressed="' + liked + '" aria-label="Thích"><span class="material-symbols-outlined ' + (liked ? 'fill' : '') + '">favorite</span><em data-lc="' + x.id + '">' + n + '</em></button><button data-rcom="' + x.id + '" aria-label="Bình luận"><span class="material-symbols-outlined">chat_bubble</span><em>' + PL.commentsOf(x.id).length + '</em></button><button data-share="' + x.id + '" aria-label="Chia sẻ"><span class="material-symbols-outlined">share</span><em>' + PL.sharesOf(x.id) + '</em></button><button data-sav="' + x.id + '" aria-pressed="' + sv + '" aria-label="Lưu"><span class="material-symbols-outlined ' + (sv ? 'fill' : '') + '">bookmark</span></button><button data-mute aria-label="Bật/tắt tiếng"><span class="material-symbols-outlined">volume_off</span></button></div></div></article>';
    }

    /* ================= Video ngắn (Reels) & Video dài (Watch) – phân tách rõ như Facebook ================= */
    var SHORT_MAX = 90;
    function isVideoPost(x) { return !!(x.clip || x.videoId || x.video); }
    function isShort(x) { if (x.vdur) return x.vdur <= SHORT_MAX; if (x.clip) return !(x.topic === 'Hướng dẫn' || x.vcat === 'Hướng dẫn'); return true; }
    function vtitle(x) { return String(x.vtitle || String(x.text || '').split('\n')[0] || 'Video không tên').slice(0, 90); }
    function vchips() { return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button class="chip ' + (vcat === 'all' ? 'on' : '') + '" data-vc="all">Tất cả</button>' + VCATS.map(function (c) { return '<button class="chip ' + (vcat === c ? 'on' : '') + '" data-vc="' + c + '">' + c + '</button>'; }).join('') + '</div>'; }
    function reelsTab() {
      var vp = posts().filter(function (x) { return isVideoPost(x) && isShort(x) && (vcat === 'all' || x.topic === vcat); }), nv = S.posts.filter(function (x) { return x.videoId && isShort(x); }).length;
      var head = '<div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b style="font-size:17px;display:flex;gap:6px;align-items:center"><span class="material-symbols-outlined">slow_motion_video</span>Video ngắn</b><p style="font-size:14px;color:rgb(var(--on-surface-variant));margin:4px 0 0">Clip dưới ' + SHORT_MAX + ' giây, vuốt để xem tiếp – mẹo tập nhanh, khoảnh khắc và thành tích. Bạn có ' + nv + ' video ngắn trên thiết bị này.</p></div><div class="cm-seg" role="group" aria-label="Kiểu xem"><button class="' + (vmode === 'reels' ? 'on' : '') + '" data-vmode="reels">Lướt</button><button class="' + (vmode === 'grid' ? 'on' : '') + '" data-vmode="grid">Lưới</button></div><button class="btn btn-pri" data-upload><span class="material-symbols-outlined">video_call</span>Đăng video</button></div>' + vchips() + '</div>';
      if (!vp.length) return head + '<div class="card">' + ui.empty('slow_motion_video', 'Chưa có video ngắn' + (vcat === 'all' ? '' : ' loại “' + vcat + '”'), 'Video dưới ' + SHORT_MAX + ' giây sẽ xuất hiện ở đây. Hãy đăng video đầu tiên của bạn.', '<button class="btn btn-pri" style="margin-top:12px" data-upload>Đăng video</button>') + '</div>';
      if (vmode === 'grid') return head + '<div class="vgrid">' + vp.map(postHtml).join('') + '</div>';
      return head + '<div class="reels" id="reels" tabindex="0" aria-label="Video ngắn">' + vp.slice(0, 20).map(reelHtml).join('') + '</div><p class="cm-note" style="text-align:center">Bấm vào clip để phát/dừng · Clip minh họa được tạo bằng mã, không phải video quay thật.</p>';
    }
    function wcard(x, big) {
      var a = A(x.by), dur = x.vdur ? fmtDur(x.vdur) : 'Clip minh họa', n = PL.likesOf(x.id).length, cm = PL.commentsOf(x.id).length;
      return '<article class="wc' + (big ? ' wc-big' : '') + '" data-watch="' + x.id + '" tabindex="0" role="button" aria-label="Xem video: ' + esc(vtitle(x)) + '"><div class="wc-th">' + (x.vposter ? '<img src="' + x.vposter + '" alt="" loading="lazy">' : '<div class="wc-ph"><span class="material-symbols-outlined">smart_display</span></div>') + '<span class="wc-play"><span class="material-symbols-outlined fill">play_arrow</span></span><span class="wc-dur">' + dur + '</span></div><div class="wc-info">' + av(a, 36) + '<div style="min-width:0"><b class="wc-t">' + esc(vtitle(x)) + '</b><div class="wc-m">' + esc(a.name) + tagsOf(a, x) + '</div><div class="wc-m">' + esc(x.topic || '') + ' · ' + ui.ago(x.at) + ' · ' + n + ' thích' + (cm ? ' · ' + cm + ' bình luận' : '') + '</div></div></div></article>';
    }
    function watchTab() {
      var vp = posts().filter(function (x) { return isVideoPost(x) && !isShort(x) && (vcat === 'all' || x.topic === vcat); }), guides = (vcat === 'all' || vcat === 'Hướng dẫn') ? D.EXERCISES.filter(function (e) { return ui.hasExVideo(e); }) : [];
      var head = '<div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b style="font-size:17px;display:flex;gap:6px;align-items:center"><span class="material-symbols-outlined">smart_display</span>Video dài</b><p style="font-size:14px;color:rgb(var(--on-surface-variant));margin:4px 0 0">Video trên ' + SHORT_MAX + ' giây: bài hướng dẫn đầy đủ, buổi tập hoàn chỉnh, chia sẻ kinh nghiệm. Bấm vào video để xem toàn màn hình, bình luận và chia sẻ.</p></div><button class="btn btn-pri" data-upload><span class="material-symbols-outlined">video_call</span>Đăng video</button></div>' + vchips() + '</div>';
      var out = head;
      if (vp.length) out += '<section class="wc-feat">' + wcard(vp[0], true) + '</section>' + (vp.length > 1 ? '<h3 class="wc-h">Tất cả video dài</h3><div class="wc-grid">' + vp.slice(1).map(function (x) { return wcard(x); }).join('') + '</div>' : '');
      else out += '<div class="card">' + ui.empty('smart_display', 'Chưa có video dài' + (vcat === 'all' ? '' : ' loại “' + vcat + '”'), 'Video trên ' + SHORT_MAX + ' giây sẽ xuất hiện ở đây. Bạn cũng có thể xem video hướng dẫn bài tập do quản trị viên cập nhật.', '<button class="btn btn-pri" style="margin-top:12px" data-upload>Đăng video</button>') + '</div>';
      if (guides.length) out += '<h3 class="wc-h">Hướng dẫn bài tập (video mô phỏng)</h3><div class="wc-grid">' + guides.map(function (e) { return '<article class="wc" data-exg="' + e.id + '" tabindex="0" role="button" aria-label="Xem video bài tập ' + esc(e.name) + '"><div class="wc-th"><div class="wc-ph"><span class="material-symbols-outlined">' + esc(e.icon || 'fitness_center') + '</span></div><span class="wc-play"><span class="material-symbols-outlined fill">play_arrow</span></span><span class="wc-dur">' + (e.videoDur ? fmtDur(e.videoDur) : 'Video') + '</span></div><div class="wc-info"><div style="min-width:0"><b class="wc-t">' + esc(e.name) + '</b><div class="wc-m">' + esc(D.CATS[e.cat] || '') + ' · ' + esc(D.LEVELS[e.level] || '') + '</div><div class="wc-m"><span class="badge b-info">Hướng dẫn chính thức</span></div></div></div></article>'; }).join('') + '</div>';
      return out;
    }
    function watchModal(id) {
      var x = posts().filter(function (p) { return p.id === id; })[0]; if (!x) return; var a = A(x.by);
      var player = x.clip ? PL.clipHtml(x.clip, 'wm_' + x.id) : x.videoId ? '<video id="wm-v" controls autoplay playsinline' + (x.vposter ? ' poster="' + x.vposter + '"' : '') + ' style="width:100%;max-height:60vh;background:#000;border-radius:12px"></video>' : '<video id="wm-v" controls autoplay playsinline src="' + esc(x.video) + '" style="width:100%;max-height:60vh;background:#000;border-radius:12px"></video>';
      var m = ui.modal('<div class="wm">' + player + '<h3 style="margin:12px 0 4px">' + esc(vtitle(x)) + '</h3><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + av(a, 40) + '<div><b>' + esc(a.name) + '</b>' + tagsOf(a, x) + '<div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + esc(x.topic || '') + ' · ' + ui.ago(x.at) + (x.vdur ? ' · ' + fmtDur(x.vdur) : '') + '</div></div></div>' + (x.text ? '<p style="margin:10px 0;font-size:14px;line-height:22px;white-space:pre-line">' + esc(x.text) + '</p>' : '') +
        '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="btn" id="wm-like" aria-pressed="' + PL.liked(x.id, me) + '"><span class="material-symbols-outlined ' + (PL.liked(x.id, me) ? 'fill' : '') + '">favorite</span><span id="wm-ln">' + PL.likesOf(x.id).length + '</span> Thích</button><button class="btn" id="wm-cm"><span class="material-symbols-outlined">chat_bubble</span>' + PL.commentsOf(x.id).length + ' Bình luận</button><button class="btn" id="wm-sh"><span class="material-symbols-outlined">share</span>Chia sẻ</button><span style="flex:1"></span><button class="btn btn-pri" data-close>Đóng</button></div></div>', { wide: true, onClose: function () { var e = document.getElementById('wm-v'); if (e) { try { e.pause(); } catch (er) {} } render(); } });
      var vv = ui.$('#wm-v', m);
      if (x.clip) PL.hydrateClips(m, true);
      else if (x.videoId && vv) { if (vurls[x.videoId]) vv.src = vurls[x.videoId]; else MED.get(x.videoId).then(function (b) { if (b) { vurls[x.videoId] = URL.createObjectURL(b); vv.src = vurls[x.videoId]; var pr = vv.play(); if (pr && pr.catch) pr.catch(function () {}); } }); }
      ui.$('#wm-like', m).addEventListener('click', function () { PL.toggleLike(x.id, me); var l = PL.liked(x.id, me); this.setAttribute('aria-pressed', l); this.querySelector('.material-symbols-outlined').classList.toggle('fill', l); ui.$('#wm-ln', m).textContent = PL.likesOf(x.id).length; });
      ui.$('#wm-cm', m).addEventListener('click', function () { m.close(); commentsModal(x.id); });
      ui.$('#wm-sh', m).addEventListener('click', function () { try { PL.share(x.id, me); ui.toast('Đã chia sẻ'); } catch (er) { ui.toast(er.message, 'err'); } });
    }
    function videoTab() {
      var vp = posts().filter(function (x) { return (x.clip || x.videoId || x.video) && (vcat === 'all' || x.topic === vcat); }), nv = S.posts.filter(function (x) { return x.videoId; }).length;
      var head = '<div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b style="font-size:17px">Video Feed</b><p style="font-size:14px;color:rgb(var(--on-surface-variant));margin:4px 0 0">Vuốt xem video hướng dẫn, kinh nghiệm và thành tích. Bạn có ' + nv + ' video trên thiết bị này.</p></div><div class="cm-seg" role="group" aria-label="Kiểu xem"><button class="' + (vmode === 'reels' ? 'on' : '') + '" data-vmode="reels">Lướt</button><button class="' + (vmode === 'grid' ? 'on' : '') + '" data-vmode="grid">Lưới</button></div><button class="btn btn-pri" data-upload><span class="material-symbols-outlined">video_call</span>Đăng video</button></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px"><button class="chip ' + (vcat === 'all' ? 'on' : '') + '" data-vc="all">Tất cả</button>' + VCATS.map(function (c) { return '<button class="chip ' + (vcat === c ? 'on' : '') + '" data-vc="' + c + '">' + c + '</button>'; }).join('') + '</div></div>';
      if (!vp.length) return head + '<div class="card">' + ui.empty('smart_display', 'Chưa có video' + (vcat === 'all' ? ' nào' : ' loại “' + vcat + '”'), 'Hãy đăng video đầu tiên của bạn hoặc nhờ quản trị viên tạo dữ liệu DEMO.', '<button class="btn btn-pri" style="margin-top:12px" data-upload>Đăng video</button>') + '</div>';
      if (vmode === 'grid') return head + '<div class="vgrid">' + vp.map(postHtml).join('') + '</div>';
      return head + '<div class="reels" id="reels" tabindex="0" aria-label="Video feed">' + vp.slice(0, 20).map(reelHtml).join('') + '</div><p class="cm-note" style="text-align:center">Bấm vào clip để phát/dừng · Clip minh họa được tạo bằng mã, không phải video quay thật.</p>';
    }
    function wireReels() {
      var box = $('#reels'); if (!box) return;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function setup(el) { var vv = el.querySelector('video'); if (!vv || vv.__o) return; vv.__o = 1; if (!('IntersectionObserver' in window)) return; new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting && !reduce) { var pr = vv.play(); if (pr && pr.catch) pr.catch(function () {}); } else vv.pause(); }); }, { threshold: .6 }).observe(el); }
      Array.prototype.forEach.call(box.querySelectorAll('.reel'), setup);
    }
    function commentsModal(id) {
      var x = PL.postById(id); if (!x) return; var m = ui.modal('<h3>Bình luận</h3><div id="cm-box"></div><div class="row"><button class="btn btn-pri" data-close>Đóng</button></div>', { onClose: render });
      function draw() { $('#cm-box', m).innerHTML = commentsHtml(x); } draw();
      m.addEventListener('click', function (e) { var b = e.target.closest('[data-cs]'); if (!b) return; var i = $('[data-ci]', m), tx = i.value.trim(); if (!tx) return ui.toast('Hãy nhập bình luận', 'err'); try { PL.addComment(id, me, tx); PL.fresh(); draw(); } catch (er) { ui.toast(er.message, 'err'); } });
    }

    /* ================= thành viên & hồ sơ ================= */
    function memberCard(a) {
      var st = PL.statsOf(a.id), fol = PL.followersOf(a.id).length;
      return '<article class="card cm-mem"><div class="cm-cover" style="background-image:url(\'' + PL.coverUrl(a) + '\')"></div><div class="cm-mbody">' + av(a, 64, 'cm-mav') + '<b class="cm-name" data-prof="' + esc(a.id) + '">' + esc(a.name) + '</b>' + tagsOf(a) + '<div class="cm-sub">' + esc([goalOf(a), a.city].filter(Boolean).join(' · ') || (a.official ? 'Tài khoản chính thức' : 'Thành viên DISCI')) + '</div><div class="cm-sub">🔥 ' + st.streak + ' ngày · 💪 ' + st.sessions + ' buổi · ' + fol + ' người theo dõi</div><div class="cm-mact">' + followBtn(a) + '<button class="btn btn-sm" data-prof="' + esc(a.id) + '">Xem hồ sơ</button></div></div></article>';
    }
    function memberGrid() {
      var q = msq.trim().toLowerCase(), list = pool().filter(function (a) {
        if (q && (a.name + ' ' + (a.city || '') + ' ' + goalOf(a) + ' ' + (a.handle || '')).toLowerCase().indexOf(q) < 0) return false; if (mgoal !== 'all' && a.goal !== mgoal) return false;
        if (mfil === 'following') return PL.isFollowing(me, a.id); if (mfil === 'followers') return PL.isFollowing(a.id, me); if (mfil === 'suggest') return !PL.isFollowing(me, a.id) && !a.official; return true;
      });
      return list.length ? '<div class="cm-mgrid">' + list.slice(0, 48).map(memberCard).join('') + '</div>' + (list.length > 48 ? '<p class="cm-note" style="text-align:center">Hiển thị 48/' + list.length + ' – hãy tìm kiếm để thu hẹp.</p>' : '') : '<div class="card">' + ui.empty('person_search', 'Không tìm thấy thành viên', 'Thử từ khóa hoặc bộ lọc khác.') + '</div>';
    }
    function membersTab() {
      return '<div class="card"><b style="font-size:17px">Thành viên</b><p class="cm-note" style="margin:4px 0 10px">Tìm và theo dõi những người cùng mục tiêu. ' + (canSeeDemo() ? 'Hồ sơ có nhãn DEMO là tài khoản mẫu.' : '') + '</p><input class="field" id="msq" value="' + esc(msq) + '" placeholder="Tìm theo tên, thành phố, mục tiêu…" aria-label="Tìm thành viên"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">' + [['all', 'Tất cả'], ['following', 'Đang theo dõi'], ['followers', 'Theo dõi tôi'], ['suggest', 'Gợi ý']].map(function (x) { return '<button class="chip ' + (mfil === x[0] ? 'on' : '') + '" data-mfil="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '<select class="field" id="mgoal" style="max-width:190px" aria-label="Lọc mục tiêu"><option value="all">Mọi mục tiêu</option>' + Object.keys(D.GOALS).map(function (g) { return '<option value="' + g + '"' + (mgoal === g ? ' selected' : '') + '>' + D.GOALS[g] + '</option>'; }).join('') + '</select></div></div><div id="mgrid">' + memberGrid() + '</div>';
    }
    function profileTab() {
      var id = viewId || me, a = id === me ? { id: me, name: p.name, avatar: p.avatar, cover: p.cover, bio: p.bio, city: p.city, goal: p.goal, createdAt: ST.user.createdAt, real: true } : A(id), isMe = id === me;
      if (a.gone) return '<div class="card">' + ui.empty('person_off', 'Tài khoản không còn tồn tại', '') + '</div>';
      var st = PL.statsOf(id), bd = PL.badgesOf(st), fol = PL.followersOf(id).length, ing = PL.follows(id).length, np = PL.visiblePosts(me).filter(function (x) { return x.by === id; }).length;
      var gs = PL.groups().filter(function (g) { return (g.members || []).indexOf(id) >= 0; }), wpts = [];
      if (a.hist) wpts = a.hist.weights.slice().reverse().map(function (w) { return { y: w[1], label: w[0] + ' ngày trước' }; }); else if (isMe) wpts = S.metrics.filter(function (m) { return m.weight; }).sort(function (x, y) { return x.date < y.date ? -1 : 1; }).slice(-8).map(function (m) { return { y: m.weight, label: ui.fmtDM(m.date) }; });
      var showStats = isMe || a.demo || a.official || (ST.udataOf(id) && ST.udataOf(id).settings.privacy.showStats !== false);
      return '<section class="card cm-prof"><div class="cm-pcover" style="background-image:url(\'' + PL.coverUrl(a) + '\')">' + (tab === 'profile' && prevTab !== 'profile' ? '<button class="btn btn-sm cm-back" data-back><span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>Quay lại</button>' : '') + '</div><div class="cm-pbody">' + av(a, 96, 'cm-pav') + '<div style="flex:1;min-width:200px"><h2 style="margin:0;font-size:24px;font-weight:800">' + esc(a.name) + tagsOf(a) + '</h2><div class="cm-sub">' + esc([a.handle ? '@' + a.handle : '', goalOf(a), a.city, a.job].filter(Boolean).join(' · ')) + '</div><p style="margin:8px 0">' + esc(a.bio || (isMe ? 'Hãy thêm giới thiệu ngắn về bản thân.' : 'Chưa có giới thiệu.')) + '</p></div><div class="cm-pact">' + (isMe ? '<button class="btn btn-pri" data-editprof><span class="material-symbols-outlined" style="font-size:18px">edit</span>Sửa hồ sơ</button>' : followBtn(a) + (a.official ? '' : '<button class="btn" data-chat="u:' + esc(id) + '"><span class="material-symbols-outlined" style="font-size:18px">chat</span>Nhắn tin</button>')) + '</div></div>' +
        '<div class="cm-pstats"><div><b>' + np + '</b><span>Bài viết</span></div><div><b>' + fol + '</b><span>Người theo dõi</span></div><div><b>' + ing + '</b><span>Đang theo dõi</span></div>' + (showStats ? '<div><b>🔥 ' + st.streak + '</b><span>Chuỗi ngày</span></div><div><b>' + st.sessions + '</b><span>Buổi tập</span></div><div><b>' + st.points + '</b><span>Điểm</span></div>' : '') + '</div>' +
        (showStats && bd.length ? '<div class="cm-badges">' + bd.map(function (b) { return '<span class="badge b-ok" title="' + esc(b.name) + '"><span class="material-symbols-outlined" style="font-size:16px">' + b.icon + '</span> ' + esc(b.name) + '</span>'; }).join('') + '</div>' : '') +
        (showStats && wpts.length > 1 ? '<h4 style="margin:14px 0 6px">Tiến độ cân nặng</h4>' + ui.lineChart({ points: wpts, label: 'Cân nặng', height: 150 }) : '') + (gs.length ? '<h4 style="margin:14px 0 6px">Nhóm đã tham gia</h4><div style="display:flex;gap:6px;flex-wrap:wrap">' + gs.map(function (g) { return '<button class="chip" data-gopen="' + g.id + '">' + esc(g.name) + '</button>'; }).join('') + '</div>' : '') + (a.demo ? '<p class="cm-note">Đây là hồ sơ DEMO dùng để trình diễn – không phải người dùng thật.</p>' : '') + '</section><h3 style="margin:6px 0 0;font-size:16px;font-weight:800">Bài viết của ' + esc(isMe ? 'bạn' : firstN(a.name)) + '</h3>';
    }
    function profileModal() {
      var av2 = p.avatar || '', cv = p.cover || ''; var m = ui.modal('<h3>Sửa hồ sơ cộng đồng</h3><label class="lbl" for="pb">Giới thiệu (tối đa 160 ký tự)</label><textarea class="field" id="pb" rows="3" maxlength="160">' + esc(p.bio || '') + '</textarea><label class="lbl" for="pc2">Thành phố</label><input class="field" id="pc2" maxlength="40" value="' + esc(p.city || '') + '"><div class="row" style="justify-content:flex-start;margin-top:12px"><button class="btn" id="ea">Tải ảnh đại diện</button><button class="btn" id="ec">Tải ảnh bìa</button></div><p class="cm-note">Ảnh được nén và chỉ lưu trên thiết bị này.</p><div class="row"><button class="btn" data-close>Hủy</button><button class="btn btn-pri" id="eok">Lưu</button></div>');
      $('#ea', m).onclick = function () { pick(256, function (d) { av2 = d; ui.toast('Đã chọn ảnh đại diện – bấm Lưu'); }); }; $('#ec', m).onclick = function () { pick(1100, function (d) { cv = d; ui.toast('Đã chọn ảnh bìa – bấm Lưu'); }); };
      $('#eok', m).onclick = function () { p.bio = $('#pb', m).value.trim(); p.city = $('#pc2', m).value.trim(); p.avatar = av2; p.cover = cv; ST.save(); PL.fresh(); m.close(); ui.toast('Đã lưu hồ sơ'); render(); };
      function pick(max, cb) { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { var f = i.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return ui.toast('Chỉ hỗ trợ tệp ảnh', 'err'); ui.fileToImage(f, max, cb, 'cover'); }; i.click(); }
    }

    /* ================= thử thách & xếp hạng ================= */
    function chProgress(c) {
      var j = S.challenges.joined[c.id]; if (!j) return null; var st = ST.stats(), ss = S.sessions.filter(function (s) { return s.status === 'done' && s.date >= j; });
      if (c.metric === 'streak') return Math.min(c.goal, Math.min(st.streak, E.diffDays(t, j) + 1)); if (c.metric === 'manual') return Math.min(c.goal, (S.challenges.manual[c.id] || []).length); return Math.min(c.goal, ss.length);
    }
    function chRank(c) { var d = PL.db(), prog = d.chProg[c.id] || {}, rows = PL.participants(c.id).filter(function (a) { return a !== me && (prog[a] != null) && !(A(a).demo && !canSeeDemo()); }).map(function (a) { return { a: A(a), v: prog[a] }; }); var mp = chProgress(c); if (mp != null) rows.push({ a: { id: me, name: p.name, avatar: p.avatar }, v: mp, me: true }); return rows.sort(function (x, y) { return y.v - x.v; }); }
    function challenges() {
      return '<div class="cm-chgrid">' + PL.challenges().map(function (c) {
        var pr = chProgress(c), joined = pr != null, tk = (S.challenges.manual[c.id] || []).indexOf(t) >= 0, parts = PL.participants(c.id).filter(function (a) { return a === me || !(A(a).demo && !canSeeDemo()); }), rank = chRank(c).slice(0, 3), anyDemo = parts.some(function (a) { return A(a).demo; });
        return '<article class="card cm-ch"><b style="font-size:17px">' + esc(c.name) + '</b>' + (c.custom ? ' <span class="badge b-info">Mới</span>' : '') + '<p class="cm-note" style="margin:4px 0 8px">' + esc(c.desc) + '</p><div style="font-size:13px">⏱ ' + c.days + ' ngày · 🎯 ' + c.goal + ' ' + ({ streak: 'ngày liên tiếp', manual: 'lần đánh dấu' }[c.metric] || 'buổi') + (c.reward ? '<br>🏅 ' + esc(c.reward) + ' (huy hiệu trong ứng dụng)' : '') + '</div><div class="cm-stack">' + parts.slice(0, 6).map(function (a) { return av(A(a), 28); }).join('') + '<span>' + parts.length + ' người tham gia' + (anyDemo ? ' <span class="demo-tag">gồm DEMO</span>' : '') + '</span></div>' +
          (joined ? '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>Tiến độ của bạn</span><b>' + pr + '/' + c.goal + '</b></div><div class="bar"><i style="width:' + Math.round(pr / c.goal * 100) + '%"></i></div></div>' + (c.metric === 'manual' ? '<button class="btn btn-sm btn-pri" data-tick="' + c.id + '"' + (tk ? ' disabled' : '') + '>' + (tk ? 'Hôm nay đã đánh dấu' : 'Đánh dấu hôm nay') + '</button> ' : '') + '<button class="btn btn-sm" data-leave="' + c.id + '">Rời thử thách</button>' + (pr >= c.goal ? ' <span class="badge b-ok">Hoàn thành!</span>' : '') : '<button class="btn btn-pri" style="margin-top:10px" data-join="' + c.id + '">Tham gia</button>') +
          (rank.length ? '<div class="cm-rank"><small>Dẫn đầu</small>' + rank.map(function (r, i) { return '<div>' + (i + 1) + '. ' + esc(r.me ? 'Bạn' : firstN(r.a.name)) + (r.a.demo ? ' <span class="demo-tag">DEMO</span>' : '') + ' <b>' + r.v + '/' + c.goal + '</b></div>'; }).join('') + '</div>' : '') + '</article>'; }).join('') + '</div>';
    }
    function boardRows() {
      var st = ST.stats(), rows = []; if (S.settings.privacy.showBoard) rows.push({ id: me, name: p.name, avatar: p.avatar, streak: st.streak, sessions: st.sessions, points: st.sessions * 20 + st.streak * 10, me: true });
      ST.users().forEach(function (u) { if (u.id === me || u.locked || (u.demo && !canSeeDemo())) return; var ud = ST.udataOf(u.id); if (ud && ud.settings && ud.settings.privacy.showBoard === false) return; var s = PL.statsOf(u.id), a = A(u.id); rows.push({ id: u.id, name: u.name, avatar: a.avatar, streak: s.streak, sessions: s.sessions, points: s.points, demo: !!u.demo }); });
      if (canSeeDemo()) PL.db().users.forEach(function (u) { rows.push({ id: u.id, name: u.name, avatar: u.avatar, hue: u.hue, streak: u.stats.streak, sessions: u.stats.sessions, points: u.stats.points, demo: true }); });
      return rows.sort(function (a, b) { return b[lbKey] - a[lbKey]; });
    }
    function board() {
      var rows = boardRows(), lab = { streak: 'Chuỗi ngày', sessions: 'Số buổi', points: 'Điểm' }[lbKey], top = rows.slice(0, 3), pod = [top[1], top[0], top[2]].filter(Boolean);
      return '<section class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 style="font-weight:800;font-size:18px;margin:0">Bảng xếp hạng</h3><div style="display:flex;gap:6px">' + [['streak', 'Chuỗi ngày'], ['sessions', 'Số buổi'], ['points', 'Điểm']].map(function (x) { return '<button class="chip ' + (lbKey === x[0] ? 'on' : '') + '" data-lb="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        (top.length >= 3 ? '<div class="cm-pod">' + pod.map(function (r) { var rank = top.indexOf(r) + 1; return '<div class="pd r' + rank + '" data-prof="' + esc(r.id) + '">' + av(r, rank === 1 ? 72 : 56) + '<b>' + esc(firstN(r.name)) + '</b><span>' + r[lbKey] + '</span><i>' + rank + '</i></div>'; }).join('') + '</div>' : '') +
        '<div class="adm-tbl" style="margin-top:12px"><table><thead><tr><th>#</th><th>Thành viên</th><th>' + lab + '</th></tr></thead><tbody>' + rows.slice(0, 30).map(function (r, i) { return '<tr' + (r.me ? ' style="background:rgb(var(--accent)/.12);font-weight:700"' : '') + '><td>' + (i + 1) + '</td><td><span class="cm-rowm" data-prof="' + esc(r.id) + '">' + av(r, 30) + ' ' + esc(r.me ? r.name + ' (bạn)' : r.name) + (r.demo ? ' <span class="demo-tag">DEMO</span>' : '') + '</span></td><td>' + r[lbKey] + '</td></tr>'; }).join('') + '</tbody></table></div><p class="cm-note">Điểm = 20 × số buổi + 10 × chuỗi ngày. Bạn có thể ẩn mình khỏi bảng xếp hạng trong Cài đặt › Quyền riêng tư.</p></section>';
    }

    /* ================= nhóm ================= */
    function groupCard(g) {
      var joined = (g.members || []).indexOf(me) >= 0, mem = (g.members || []).filter(function (a) { return !(A(a).demo && !canSeeDemo()); });
      return '<article class="card cm-g"><div class="cm-gcover" style="--h:' + g.hue + '"><span class="material-symbols-outlined fill">groups</span></div><div style="padding:12px"><b>' + esc(g.name) + '</b>' + (g.demo ? ' <span class="demo-tag">DEMO</span>' : '') + '<p class="cm-note" style="margin:4px 0 8px">' + esc(g.desc || '') + '</p><div class="cm-stack">' + mem.slice(0, 5).map(function (a) { return av(A(a), 26); }).join('') + '<span>' + mem.length + ' thành viên</span></div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-sm" data-gopen="' + g.id + '">Mở nhóm</button><button class="btn btn-sm ' + (joined ? '' : 'btn-pri') + '" data-gjoin="' + g.id + '">' + (joined ? 'Rời nhóm' : 'Tham gia') + '</button></div></div></article>';
    }
    function groupsTab() {
      return '<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1"><b style="font-size:17px">Nhóm cộng đồng</b><p class="cm-note" style="margin:4px 0 0">Tham gia nhóm để trao đổi cùng người có chung mục tiêu.</p></div><button class="btn btn-pri" data-gnew><span class="material-symbols-outlined">group_add</span>Tạo nhóm</button></div><div class="cm-ggrid">' + PL.groups().filter(function (g) { return !(g.demo && !canSeeDemo()); }).map(groupCard).join('') + '</div>';
    }
    function groupDetail() {
      var g = PL.groupById(gid); if (!g) return '<div class="card">' + ui.empty('group_off', 'Nhóm không còn tồn tại', '') + '</div>'; var joined = (g.members || []).indexOf(me) >= 0, mem = (g.members || []).filter(function (a) { return !(A(a).demo && !canSeeDemo()); });
      return '<section class="card cm-prof"><div class="cm-pcover" style="background:linear-gradient(135deg,hsl(' + g.hue + ' 75% 38%),hsl(' + ((g.hue + 60) % 360) + ' 70% 10%))"><button class="btn btn-sm cm-back" data-tab="groups"><span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>Tất cả nhóm</button></div><div class="cm-pbody"><div style="flex:1;min-width:200px"><h2 style="margin:0;font-size:22px;font-weight:800">' + esc(g.name) + (g.demo ? ' <span class="demo-tag">DEMO</span>' : '') + '</h2><p style="margin:6px 0">' + esc(g.desc || '') + '</p><div class="cm-stack">' + mem.slice(0, 8).map(function (a) { return av(A(a), 30); }).join('') + '<span>' + mem.length + ' thành viên · chủ nhóm: ' + esc(A(g.owner).name) + '</span></div></div><div class="cm-pact"><button class="btn ' + (joined ? '' : 'btn-pri') + '" data-gjoin="' + g.id + '">' + (joined ? 'Rời nhóm' : 'Tham gia nhóm') + '</button>' + (joined ? '<button class="btn" data-chat="g:' + g.id + '"><span class="material-symbols-outlined" style="font-size:18px">chat</span>Tin nhắn nhóm</button>' : '') + '</div></div></section>' + (joined ? composer() : '<div class="alert alert-info"><span class="material-symbols-outlined">info</span><div>Hãy tham gia nhóm để đăng bài vào nhóm.</div></div>');
    }
    function chatModal(key) {
      var isG = key.slice(0, 2) === 'g:', tid = key.slice(2), real = !!(PL.chatReal && PL.chatReal(key));
      var title = isG ? (PL.groupById(tid) || { name: 'Nhóm' }).name : A(tid).name;
      var note = real ? 'Tin nhắn được lưu trên máy chủ DISCI. Chỉ ' + (isG ? 'thành viên nhóm' : 'bạn và người nhận') + ' đọc được.' : 'Đây là nhóm/tài khoản <b>DEMO</b>: tin nhắn chỉ lưu trên thiết bị này và <b>chưa được gửi tới ai</b>.';
      var m = ui.modal('<h3>' + esc(title) + '</h3><div class="alert alert-info" style="margin-bottom:8px"><span class="material-symbols-outlined">info</span><div style="font-size:13px">' + note + '</div></div><div id="cmsgs" style="min-height:140px;max-height:300px;overflow:auto;margin:8px 0"></div><div style="display:flex;gap:6px"><input class="field" id="mi" maxlength="500" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn"><button class="btn btn-pri" id="ms">Gửi</button></div><div class="row"><button class="btn btn-pri" data-close>Đóng</button></div>');
      var list = [], lastAt = 0, seen = {};
      function bubble(x) {
        var mine = x.by === me;
        return '<div style="text-align:' + (mine ? 'right' : 'left') + ';margin:6px 0">' + (!mine && isG ? '<div class="cm-note" style="margin:0 0 2px"><b>' + esc(A(x.by).name) + '</b></div>' : '') + '<span class="fb-bubble" style="display:inline-block;background:rgb(var(--accent)/' + (mine ? '.2' : '.08') + ');text-align:left">' + esc(x.text) + '</span><div class="cm-note" style="margin:2px 0">' + ui.ago(x.at) + (real ? '' : ' · lưu cục bộ') + '</div></div>';
      }
      function draw() { var el = $('#cmsgs', m); if (!el) return; el.innerHTML = list.length ? list.map(bubble).join('') : '<p class="cm-note" style="text-align:center">Chưa có tin nhắn.</p>'; el.scrollTop = 1e6; }
      function add(arr) { var ch = false; (arr || []).forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; list.push(x); if (x.at > lastAt) lastAt = x.at; ch = true; } }); if (ch) draw(); }
      if (real) {
        draw();
        var load = function () { if (!document.body.contains(m)) { clearInterval(timer); return; } PL.chatList(key, lastAt).then(function (j) { if (j.__status < 300) add(j.messages); else if (j.__status === 404) { clearInterval(timer); } }, function () {}); };
        var timer = setInterval(load, 4000); load();
        $('#ms', m).onclick = function () {
          var i = $('#mi', m), tx = i.value.trim(); if (!tx) return; var btn = $('#ms', m); btn.disabled = true;
          PL.chatSend(key, tx).then(function (j) { btn.disabled = false; if (j.__status < 300 && j.message) { i.value = ''; add([j.message]); } else ui.toast(j.message || 'Không gửi được tin nhắn', 'err'); }, function () { btn.disabled = false; ui.toast('Không kết nối được máy chủ', 'err'); });
        };
        $('#mi', m).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#ms', m).click(); } });
      } else {
        list = (S.messages[key] || []).map(function (x, n) { return { id: 'l' + n, by: me, text: x.text, at: x.at }; }); draw();
        $('#ms', m).onclick = function () { var i = $('#mi', m), tx = i.value.trim(); if (!tx) return; (S.messages[key] = S.messages[key] || []).push({ text: tx, at: Date.now() }); ST.save(); i.value = ''; list.push({ id: 'l' + list.length, by: me, text: tx, at: Date.now() }); draw(); };
      }
    }
    function groupModal() {
      var m = ui.modal('<h3>Tạo nhóm</h3><label class="lbl" for="gn">Tên nhóm *</label><input class="field" id="gn" maxlength="60"><label class="lbl" for="gd">Mô tả</label><textarea class="field" id="gd" rows="3" maxlength="300"></textarea><div id="ge"></div><div class="row"><button class="btn" data-close>Hủy</button><button class="btn btn-pri" id="gok">Tạo nhóm</button></div>');
      $('#gok', m).onclick = function () { var n = $('#gn', m).value.trim(); if (n.length < 3) { $('#ge', m).innerHTML = '<div class="err-txt">Tên nhóm cần ít nhất 3 ký tự.</div>'; return; } var bad = PL.containsBanned(n + ' ' + $('#gd', m).value); if (bad) { $('#ge', m).innerHTML = '<div class="err-txt">Nội dung chứa từ bị cấm: ' + esc(bad) + '</div>'; return; } var g = PL.createGroup({ name: n, desc: $('#gd', m).value.trim(), owner: me }); m.close(); ui.toast('Đã tạo nhóm'); gid = g.id; prevTab = tab; tab = 'group'; render(); };
    }

    /* ================= thông báo ================= */
    function myNotifs() { return PL.db().notifs.filter(function (n) { return n.to === me; }); }
    function unreadN() { return myNotifs().filter(function (n) { return !n.read; }).length; }
    function notifs() {
      var list = myNotifs().slice(0, 60), ICON = { like: 'favorite', comment: 'chat_bubble', share: 'share', follow: 'person_add', mod: 'gavel' }, TXT = { like: 'đã thích bài viết của bạn', comment: 'đã bình luận bài viết của bạn', share: 'đã chia sẻ bài viết của bạn', follow: 'đã bắt đầu theo dõi bạn', mod: '' };
      return '<div class="card" style="display:flex;align-items:center;gap:10px"><b style="font-size:17px;flex:1">Thông báo tương tác</b><button class="btn btn-sm" data-readall>Đánh dấu đã đọc</button></div>' + (list.length ? '<div class="card" style="padding:6px">' + list.map(function (n) { var a = A(n.from), post = n.postId && PL.postById(n.postId); return '<button class="cm-n ' + (n.read ? '' : 'un') + '" ' + (post ? 'data-npost="' + n.postId + '"' : n.type === 'follow' ? 'data-prof="' + esc(n.from) + '"' : '') + '>' + av(a, 40).replace('data-prof', 'data-x') + '<span class="material-symbols-outlined fill cm-nic">' + ICON[n.type] + '</span><span style="flex:1;text-align:left"><b>' + esc(n.type === 'mod' ? 'Quản trị viên' : a.name) + '</b> ' + esc(TXT[n.type] || n.text) + (n.sim ? ' <span class="demo-tag">MÔ PHỎNG</span>' : '') + (n.type === 'comment' ? '<div class="cm-sub">“' + esc(n.text.slice(0, 90)) + '”</div>' : '') + '<div class="cm-sub">' + ui.ago(n.at) + '</div></span></button>'; }).join('') + '</div>' : '<div class="card">' + ui.empty('notifications', 'Chưa có thông báo', 'Khi ai đó thích, bình luận, chia sẻ hoặc theo dõi bạn, bạn sẽ thấy ở đây.') + '</div>') + '<p class="cm-note">Hoạt động từ tài khoản DEMO/mô phỏng luôn có nhãn riêng; chỉ thông báo của người dùng thật không có nhãn.</p>';
    }
    function markRead() { var ch = false; myNotifs().forEach(function (n) { if (!n.read) { n.read = true; ch = true; } }); S.notifications.forEach(function (n) { if (n.unread && n.go === 'community.html#n') { n.unread = false; ch = true; } }); if (ch) { PL.save(); ST.save(); if (PL.cmMarkRead) PL.cmMarkRead(); ui.refreshBadges(); } }

    /* ================= khung chính ================= */
    function activity() {
      var items = [], cmAll = PL.db().comments; Object.keys(cmAll).forEach(function (id) { cmAll[id].forEach(function (c) { if (!c.hidden && !(A(c.by).demo && !canSeeDemo())) items.push({ at: c.at, by: c.by, t: 'bình luận “' + c.text.slice(0, 36) + (c.text.length > 36 ? '…' : '') + '”', sim: c.sim }); }); });
      PL.visiblePosts(me).slice(0, 8).forEach(function (x) { items.push({ at: x.at, by: x.by, t: x.clip || x.videoId ? 'đăng một video' : x.art || x.img ? 'đăng một ảnh' : 'đăng bài mới', sim: x.sim }); });
      return items.sort(function (a, b) { return b.at - a.at; }).slice(0, 6).map(function (i) { var a = A(i.by); return '<div class="cm-act">' + av(a, 28) + '<div><b data-prof="' + esc(a.id) + '">' + esc(firstN(a.name)) + '</b> ' + esc(i.t) + (i.sim ? ' <span class="demo-tag">MÔ PHỎNG</span>' : '') + '<small>' + ui.ago(i.at) + '</small></div></div>'; }).join('') || '<p class="cm-note">Chưa có hoạt động.</p>';
    }
    function simBanner() {
      var s = SM.state(); if (!s.on) return ''; var sc = SM.SCRIPTS[s.script] || {};
      return '<div class="cm-sim"><span class="material-symbols-outlined">theater_comedy</span><div><b>Chế độ mô phỏng đang bật – kịch bản “' + esc(sc.name || s.script) + '”</b><div class="cm-note" style="margin:2px 0 0">Một số hoạt động bên dưới do tài khoản DEMO tự tạo và có nhãn <span class="demo-tag">MÔ PHỎNG</span>. Đó không phải hoạt động của người dùng thật.</div></div>' + (PL.can('sim') ? '<button class="btn btn-sm" data-simoff>Tắt</button>' : '') + '</div>';
    }
    function render() {
      PL.fresh(); var body = '', st0 = ST.stats(), nun = unreadN(), isFeed = tab === 'feed' || tab === 'mine' || tab === 'saved';
      if (isFeed || tab === 'group' || tab === 'profile') {
        var ps = posts(), shown = ps.slice(0, lim);
        body = (tab === 'feed' ? storyBar() + composer() + '<div class="cm-subtabs"><button class="chip ' + (feedSub === 'all' ? 'on' : '') + '" data-fsub="all">Dành cho bạn</button><button class="chip ' + (feedSub === 'following' ? 'on' : '') + '" data-fsub="following">Đang theo dõi</button></div>' : '') + (tab === 'group' ? groupDetail() : '') + (tab === 'profile' ? profileTab() : '') +
          (tab !== 'profile' && tab !== 'group' ? '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="chip ' + (topic === 'all' ? 'on' : '') + '" data-tp="all">Tất cả chủ đề</button>' + TOPICS.map(function (x) { return '<button class="chip ' + (topic === x ? 'on' : '') + '" data-tp="' + x + '">' + x + '</button>'; }).join('') + '</div>' : '') +
          (shown.length ? shown.map(postHtml).join('') + (ps.length > shown.length ? '<div style="text-align:center"><button class="btn" data-more>Xem thêm (' + (ps.length - shown.length) + ')</button></div>' : '') : '<div class="card">' + ui.empty('dynamic_feed', tab === 'saved' ? 'Chưa lưu bài viết nào' : tab === 'mine' ? 'Bạn chưa đăng bài nào' : feedSub === 'following' && tab === 'feed' ? 'Chưa có bài từ người bạn theo dõi' : 'Chưa có bài viết', tab === 'feed' && feedSub === 'following' ? 'Hãy theo dõi thêm thành viên ở mục Thành viên.' : 'Hãy là người đầu tiên chia sẻ hành trình của mình.') + '</div>');
      } else if (tab === 'reels') body = reelsTab(); else if (tab === 'watch') body = watchTab(); else if (tab === 'members') body = membersTab(); else if (tab === 'challenge') body = challenges(); else if (tab === 'board') body = board(); else if (tab === 'notifs') body = notifs(); else body = groupsTab();
      var tabs = [['feed', 'Bảng tin', 'dynamic_feed'], ['reels', 'Video ngắn', 'slow_motion_video'], ['watch', 'Video dài', 'smart_display'], ['members', 'Thành viên', 'diversity_3'], ['challenge', 'Thử thách', 'emoji_events'], ['board', 'Xếp hạng', 'leaderboard'], ['groups', 'Nhóm', 'groups'], ['notifs', 'Thông báo', 'notifications'], ['mine', 'Bài của tôi', 'person'], ['saved', 'Đã lưu', 'bookmark']];
      var cur = tab === 'group' ? 'groups' : tab === 'profile' ? (viewId === me ? 'me' : 'members') : tab;
      var left = '<aside class="fb-left card" style="padding:8px;position:sticky;top:76px;align-self:start"><button data-me class="' + (cur === 'me' ? 'on' : '') + '" style="margin-bottom:4px">' + av({ id: me, name: p.name, avatar: p.avatar }, 40).replace('data-prof', 'data-x') + '<b>' + esc(p.name) + '</b></button>' + tabs.map(function (x) { return '<button class="' + (cur === x[0] ? 'on' : '') + '" data-tab="' + x[0] + '" role="tab" aria-selected="' + (cur === x[0]) + '"><span class="fb-ic"><span class="material-symbols-outlined" style="font-size:22px">' + x[2] + '</span></span>' + x[1] + (x[0] === 'notifs' && nun ? ' <span class="badge b-err" style="margin-left:auto">' + nun + '</span>' : '') + '</button>'; }).join('') + '<button id="b-rules"><span class="fb-ic"><span class="material-symbols-outlined" style="font-size:22px">info</span></span>Nội quy cộng đồng</button></aside>';
      var sug = pool().filter(function (a) { return !PL.isFollowing(me, a.id) && !a.official; }).slice(0, 4), act = PL.challenges().slice(0, 2);
      var right = '<aside class="fb-right" style="position:sticky;top:76px;align-self:start;display:grid;gap:12px"><section class="card"><b style="font-size:15px">Thành tích của bạn</b><div style="font-size:14px;margin-top:8px;line-height:24px">🔥 Chuỗi: <b>' + st0.streak + ' ngày</b><br>💪 Buổi tập: <b>' + st0.sessions + '</b><br>⏱ Phút vận động: <b>' + st0.minutes + '</b></div></section>' +
        '<section class="card"><b style="font-size:15px">Gợi ý theo dõi</b>' + (sug.length ? sug.map(function (a) { return '<div class="cm-sug">' + av(a, 36) + '<div style="flex:1;min-width:0"><b data-prof="' + esc(a.id) + '">' + esc(a.name) + '</b>' + tagsOf(a) + '<small>' + esc(goalOf(a) || 'Thành viên DISCI') + '</small></div>' + followBtn(a) + '</div>'; }).join('') : '<p class="cm-note">Bạn đã theo dõi hết các gợi ý.</p>') + '<button class="lnk" data-tab="members" style="margin-top:8px">Xem tất cả thành viên →</button></section>' +
        '<section class="card"><b style="font-size:15px">Hoạt động thành viên</b><div style="margin-top:6px">' + activity() + '</div></section>' + (act.length ? '<section class="card"><b style="font-size:15px">Thử thách đang diễn ra</b>' + act.map(function (c) { return '<button class="cm-chl" data-tab="challenge"><span class="material-symbols-outlined fill">emoji_events</span><span style="flex:1;text-align:left">' + esc(c.name.replace('Thử thách ', '')) + '<small>' + PL.participants(c.id).length + ' người tham gia</small></span></button>'; }).join('') + '</section>' : '') + '</aside>';
      var mtabs = '<div class="fb-mtabs nk-rail" style="gap:6px;margin-bottom:8px">' + tabs.map(function (x) { return '<button class="chip ' + (cur === x[0] ? 'on' : '') + '" data-tab="' + x[0] + '">' + x[1] + (x[0] === 'notifs' && nun ? ' (' + nun + ')' : '') + '</button>'; }).join('') + '</div>';
      v.innerHTML = '<div class="fb-wrap fb"><div class="fb-cols">' + left + '<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-content:start;min-width:0">' + mtabs + simBanner() + body + '<div class="alert alert-info" style="border-radius:12px"><span class="material-symbols-outlined">info</span><div style="font-size:13px">Một số thành viên, bài viết và số liệu là <b>dữ liệu DEMO</b> (nhãn <span class="demo-tag">DEMO</span>), hoạt động từ mô phỏng có nhãn <span class="demo-tag">MÔ PHỎNG</span>. Chưa có backend thời gian thực – bài đăng của bạn lưu trên thiết bị này.</div></div></div>' + right + '</div></div>';
      wire(); hydrate(); PL.hydrateClips(v, true); if (tab === 'reels' && vmode === 'reels') { wireReels(); setTimeout(wireReels, 400); } if (tab === 'notifs') markRead(); ui.refreshBadges();
    }
    function inPlaceLike(id) {
      var liked = PL.liked(id, me), n = PL.likesOf(id).length; Array.prototype.forEach.call(v.querySelectorAll('[data-like="' + id + '"]'), function (b) { b.setAttribute('aria-pressed', liked); var ic = b.querySelector('.material-symbols-outlined'); if (ic) ic.classList.toggle('fill', liked); }); Array.prototype.forEach.call(v.querySelectorAll('[data-lc="' + id + '"]'), function (e) { e.textContent = n; });
      var l = v.querySelector('[data-likes="' + id + '"]'); if (l) l.innerHTML = likerLine(id);
    }
    function wire() {
      var g = function (id, fn, ev) { var el = document.getElementById(id); if (el) el.addEventListener(ev || 'click', fn); }, go = function (t2, extra) { prevTab = tab; tab = t2; lim = 12; if (extra) extra(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      ui.on(v, 'click', '[data-tab]', function (b) { go(b.dataset.tab); }); ui.on(v, 'click', '[data-me]', function () { go('profile', function () { viewId = me; }); });
      ui.on(v, 'click', '[data-tp]', function (b) { topic = b.dataset.tp; lim = 12; render(); }); ui.on(v, 'click', '[data-fsub]', function (b) { feedSub = b.dataset.fsub; lim = 12; render(); }); ui.on(v, 'click', '[data-more]', function () { lim += 12; render(); });
      ui.on(v, 'click', '[data-prof]', function (b, e) { if (e.target.closest('button[data-fol]')) return; var id = b.dataset.prof; if (!id || A(id).gone) return; go('profile', function () { viewId = id; }); });
      ui.on(v, 'click', '[data-back]', function () { tab = prevTab === 'profile' ? 'feed' : prevTab; render(); });
      ui.on(v, 'click', '[data-editprof]', profileModal);
      ui.on(v, 'click', '[data-fol]', function (b, e) { e.stopPropagation(); var id = b.dataset.fol, on = PL.toggleFollow(me, id); ui.toast(on ? 'Đã theo dõi ' + A(id).name : 'Đã bỏ theo dõi'); render(); });
      g('b-rules', function () { ui.modal('<h3>Nội quy cộng đồng</h3><ul style="margin-left:18px;list-style:disc;font-size:14px;line-height:24px"><li>Tôn trọng mọi người, không công kích hay phân biệt đối xử.</li><li>Không đăng dữ liệu sức khỏe nhạy cảm của bạn hoặc người khác.</li><li>Không quảng cáo thuốc hay hứa hẹn hiệu quả điều trị.</li><li>Không khuyến khích ăn kiêng cực đoan hoặc tập quá sức.</li><li>Dùng nút "Báo cáo" nếu thấy nội dung vi phạm – quản trị viên sẽ xem xét.</li></ul><div class="row"><button class="btn btn-pri" data-close>Đã hiểu</button></div>'); });
      /* đăng bài */
      var ta = document.getElementById('pt'); if (ta) ta.addEventListener('input', function () { draftText = ta.value; });
      g('pv-up', uploadModal); ui.on(v, 'click', '[data-upload]', function () { uploadModal(); }); ui.on(v, 'click', '[data-watch]', function (b) { watchModal(b.dataset.watch); }); ui.on(v, 'keydown', '[data-watch],[data-exg]', function (b, e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } }); ui.on(v, 'click', '[data-exg]', function (b) { ui.exerciseModal(b.dataset.exg); });
      ui.on(v, 'click', '[data-vc]', function (b) { vcat = b.dataset.vc; render(); }); ui.on(v, 'click', '[data-vmode]', function (b) { vmode = b.dataset.vmode; render(); });
      g('pv-rm', function () { var e = S.posts.filter(function (x) { return x.id === editing; })[0]; if (!e) return; MED.del(e.videoId); delete vurls[e.videoId]; ['videoId', 'vposter', 'vdur', 'vsize', 'vname', 'vtype'].forEach(function (k) { delete e[k]; }); ST.save(); render(); });
      g('pp', publish); g('pd', function () { S.draft = $('#pt').value; ST.save(); ui.toast('Đã lưu bản nháp'); }); g('pc', function () { editing = null; draftImg = ''; render(); }); g('pi-x', function () { draftImg = ''; var e = S.posts.filter(function (x) { return x.id === editing; })[0]; if (e) delete e.img; render(); });
      g('pi', function () { var f = this.files[0]; if (!f) return; if (!/^image\//.test(f.type)) { ui.toast('Chỉ hỗ trợ tệp ảnh', 'err'); return; } var txt = $('#pt').value; ui.fileToImage(f, 900, function (d) { draftImg = d; draftText = txt; render(); $('#pt').value = txt; }, 'post'); }, 'change');
      /* tương tác */
      ui.on(v, 'click', '[data-like]', function (b) { PL.toggleLike(b.dataset.like, me); inPlaceLike(b.dataset.like); });
      ui.on(v, 'click', '[data-com]', function (b) { openCom[b.dataset.com] = !openCom[b.dataset.com]; render(); }); ui.on(v, 'click', '[data-rcom]', function (b) { commentsModal(b.dataset.rcom); });
      ui.on(v, 'click', '[data-cs]', function (b) { var id = b.dataset.cs, i = $('[data-ci="' + id + '"]'), tx = i.value.trim(); if (!tx) { ui.toast('Hãy nhập bình luận', 'err'); return; } try { PL.addComment(id, me, tx); openCom[id] = true; render(); } catch (e) { ui.toast(e.message, 'err'); } });
      ui.on(v, 'keydown', '[data-ci]', function (el, e) { if (e.key === 'Enter') { var b = $('[data-cs="' + el.dataset.ci + '"]'); if (b) b.click(); } });
      ui.on(v, 'click', '[data-cdel]', function (b) { var a = b.dataset.cdel.split('|'); PL.db().comments[a[0]] = (PL.db().comments[a[0]] || []).filter(function (c) { return !(c.id === a[1] && c.by === me); }); PL.save(); render(); });
      ui.on(v, 'click', '[data-share]', function (b) { var id = b.dataset.share, url = location.href.split('#')[0] + '#' + id; PL.share(id, me); if (navigator.share) navigator.share({ title: PL.brand(), url: url }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { ui.toast('Đã sao chép liên kết bài viết'); }, function () { ui.toast('Đã ghi nhận chia sẻ'); }); else ui.toast('Đã ghi nhận chia sẻ'); });
      ui.on(v, 'click', '[data-sav]', function (b) { var id = b.dataset.sav, i = S.saved.indexOf(id); if (i >= 0) S.saved.splice(i, 1); else S.saved.push(id); ST.save(); if (tab === 'saved') render(); else { var on = i < 0; Array.prototype.forEach.call(v.querySelectorAll('[data-sav="' + id + '"]'), function (x) { x.setAttribute('aria-pressed', on); var ic = x.querySelector('.material-symbols-outlined'); ic.classList.toggle('fill', on); if (!x.closest('.reel-side')) x.lastChild.textContent = on ? 'Đã lưu' : 'Lưu'; }); } });
      ui.on(v, 'click', '[data-mute]', function (b) { var r = b.closest('.reel'), vv = r && r.querySelector('video'); if (!vv) return ui.toast('Clip minh họa không có âm thanh'); vv.muted = !vv.muted; b.querySelector('.material-symbols-outlined').textContent = vv.muted ? 'volume_off' : 'volume_up'; });
      ui.on(v, 'click', '[data-edit]', function (b) { editing = b.dataset.edit; tab = 'feed'; render(); $('#composer').scrollIntoView({ behavior: 'smooth' }); });
      ui.on(v, 'click', '[data-del]', function (b) { ui.confirm({ title: 'Xóa bài viết?', text: 'Không thể hoàn tác. Video đính kèm (nếu có) cũng bị xóa khỏi thiết bị.', ok: 'Xóa', danger: true }).then(function (y) { if (y) { var did = b.dataset.del, dp = S.posts.filter(function (x) { return x.id === did; })[0]; if (dp && dp.videoId) { MED.del(dp.videoId); delete vurls[dp.videoId]; } S.posts = S.posts.filter(function (x) { return x.id !== did; }); delete S.likes[did]; delete S.comments[did]; delete PL.db().likes[did]; delete PL.db().comments[did]; S.saved = S.saved.filter(function (x) { return x !== did; }); ST.save(); PL.save(); render(); ui.toast('Đã xóa bài viết'); } }); });
      ui.on(v, 'click', '[data-rep]', function (b) { var id = b.dataset.rep, m = ui.modal('<h3>Báo cáo nội dung</h3><p class="sub">Chọn lý do. Bài viết sẽ được ẩn khỏi bảng tin của bạn và gửi tới quản trị viên xem xét.</p>' + ['Spam / quảng cáo', 'Ngôn từ xúc phạm', 'Thông tin y tế sai lệch / nguy hiểm', 'Lộ thông tin cá nhân', 'Khác'].map(function (r, i) { return '<label style="display:flex;gap:8px;padding:6px 0;cursor:pointer"><input type="radio" name="rr" value="' + r + '"' + (i === 0 ? ' checked' : '') + '> ' + r + '</label>'; }).join('') + '<div class="row"><button class="btn" data-close>Hủy</button><button class="btn btn-pri" id="rp-ok">Gửi báo cáo</button></div>'); $('#rp-ok', m).addEventListener('click', function () { var r = $('input[name=rr]:checked', m).value; S.reports.push({ id: id, reason: r, at: Date.now() }); S.hidden.push(id); ST.save(); PL.reportPost(id, me, r); m.close(); ui.toast('Đã gửi báo cáo tới quản trị viên và ẩn bài viết'); render(); }); });
      /* stories */
      ui.on(v, 'click', '[data-story]', function (b) { storyViewer(b.dataset.story); }); ui.on(v, 'click', '[data-addstory]', storyModal);
      /* thành viên */
      var sq = document.getElementById('msq'); if (sq) sq.addEventListener('input', function () { msq = sq.value; document.getElementById('mgrid').innerHTML = memberGrid(); });
      ui.on(v, 'click', '[data-mfil]', function (b) { mfil = b.dataset.mfil; render(); }); var mg = document.getElementById('mgoal'); if (mg) mg.addEventListener('change', function () { mgoal = mg.value; render(); });
      /* thử thách & xếp hạng */
      ui.on(v, 'click', '[data-join]', function (b) { S.challenges.joined[b.dataset.join] = t; PL.joinChallenge(b.dataset.join, me); ST.save(); ui.toast('Đã tham gia thử thách'); render(); });
      ui.on(v, 'click', '[data-leave]', function (b) { delete S.challenges.joined[b.dataset.leave]; PL.leaveChallenge(b.dataset.leave, me); ST.save(); render(); });
      ui.on(v, 'click', '[data-tick]', function (b) { var id = b.dataset.tick; (S.challenges.manual[id] = S.challenges.manual[id] || []).push(t); ST.save(); render(); }); ui.on(v, 'click', '[data-lb]', function (b) { lbKey = b.dataset.lb; render(); });
      /* nhóm & tin nhắn */
      ui.on(v, 'click', '[data-gopen]', function (b, e) { e.stopPropagation(); go('group', function () { gid = b.dataset.gopen; }); });
      ui.on(v, 'click', '[data-gjoin]', function (b) { var on = PL.joinGroup(b.dataset.gjoin, me); ui.toast(on ? 'Đã tham gia nhóm' : 'Đã rời nhóm'); render(); }); ui.on(v, 'click', '[data-gnew]', groupModal); ui.on(v, 'click', '[data-chat]', function (b) { chatModal(b.dataset.chat); });
      /* thông báo */
      ui.on(v, 'click', '[data-readall]', function () { markRead(); render(); });
      ui.on(v, 'click', '[data-npost]', function (b) { var id = b.dataset.npost; tab = 'feed'; feedSub = 'all'; topic = 'all'; openCom[id] = true; render(); var el = v.querySelector('[data-post="' + id + '"]'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('cm-flash'); } else ui.toast('Bài viết không còn hiển thị', 'err'); });
      ui.on(v, 'click', '[data-simoff]', function () { try { SM.set(false); ui.toast('Đã tắt mô phỏng'); render(); } catch (e) { ui.toast(e.message, 'err'); } });
    }
    /* mô phỏng chạy nền: cập nhật nhẹ khi người dùng không đang nhập liệu */
    SM.onChange(function () {
      var now = Date.now(); if (now - lastSim < 7000 || document.hidden || tab === 'reels' || tab === 'watch' || tab === 'profile' || document.querySelector('.modal,.cm-sv')) return; var ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; lastSim = now; render();
    }); SM.start();
    var h = location.hash.slice(1); if (h === 'n') tab = 'notifs';
    function first() {
      render();
      if (h && h !== 'n') { var el0 = v.querySelector('[data-post="' + h + '"]'); if (el0) { el0.scrollIntoView({ block: 'center' }); el0.classList.add('cm-flash'); } }
      /* làm mới nhẹ mỗi 45 giây để thấy bài/bình luận/thông báo mới của người khác */
      setInterval(function () { if (document.hidden || document.querySelector('.modal,.cm-sv')) return; var ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; PL.syncCommunity(true).then(function () { if (!document.querySelector('.modal,.cm-sv')) render(); }); }, 45000);
    }
    v.innerHTML = '<div class="card" style="text-align:center;padding:28px"><span class="material-symbols-outlined" aria-hidden="true">groups</span><p>Đang tải cộng đồng…</p></div>';
    (PL.syncCommunity ? PL.syncCommunity(true) : Promise.resolve()).then(first, first);
  } });
})();
