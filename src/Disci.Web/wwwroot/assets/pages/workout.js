/* Màn hình thực hiện buổi tập: hướng dẫn · đồng hồ · đếm lần · nghỉ giữa hiệp · chuyển bài · hoàn thành & ghi nhận */
(function () {
  var E = DISCI_ENGINE, D = DISCI_DATA, ST = DISCI.store, ui = DISCI.ui, esc = ui.esc, $ = ui.$;
  ui.boot({ page: 'workout', title: 'Buổi tập', render: function (v) {
    var S = ST.S, date = new URLSearchParams(location.search).get('date') || ST.today(), day = ST.dayFor(date);
    if (!day || day.type !== 'workout' || !day.exs.length) { v.innerHTML = ui.empty('event_busy', 'Không có buổi tập cho ngày này', 'Hãy chọn một ngày có buổi tập trong Lịch tập.', '<a class="btn btn-pri" style="margin-top:12px" href="schedule.html">Về Lịch tập</a>'); return; }
    var r = ST.risk();
    var st = { i: 0, set: 1, phase: 'ready', left: 0, elapsed: 0, paused: false, reps: 0, log: day.exs.map(function (e) { return { id: e.id, sets: 0, reps: 0, secs: 0 }; }), started: false, finished: false }, timer = null;
    function cur() { return day.exs[st.i]; }
    function beep() { try { var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); setTimeout(function () { o.stop(); c.close(); }, 180); if (navigator.vibrate) navigator.vibrate(150); } catch (e) {} }
    function mmss(s) { s = Math.max(0, Math.round(s)); return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
    function begin() { st.started = true; startWork(); timer = setInterval(tick, 1000); window.onbeforeunload = function () { return st.finished ? null : 'Buổi tập chưa lưu. Rời trang?'; }; }
    function startWork() { st.phase = 'work'; st.reps = 0; var e = cur(); st.left = e.kind === 'time' ? e.amt : 0; draw(); }
    function startRest() { st.phase = 'rest'; st.left = cur().rest; draw(); }
    function completeSet() {
      var e = cur(), lg = st.log[st.i]; lg.sets++; if (e.kind === 'time') lg.secs += e.amt; else lg.reps += st.reps || e.amt;
      if (st.set < e.sets) { st.set++; startRest(); } else nextEx(true);
    }
    function nextEx(auto) { if (st.i < day.exs.length - 1) { st.i++; st.set = 1; if (auto && cur().rest > 0) { startWork(); } else startWork(); } else finish(); }
    function prevEx() { if (st.i > 0) { st.i--; st.set = 1; startWork(); } }
    function tick() {
      if (st.paused || st.finished) return; st.elapsed++;
      if (st.phase === 'rest') { st.left--; if (st.left <= 0) { beep(); st.phase = 'work'; st.reps = 0; var e = cur(); st.left = e.kind === 'time' ? e.amt : 0; draw(); return; } }
      else if (st.phase === 'work' && cur().kind === 'time') { st.left--; if (st.left <= 0) { beep(); completeSet(); return; } }
      var a = $('#t-el'), b = $('#t-left'); if (a) a.textContent = mmss(st.elapsed); if (b) b.textContent = mmss(st.left);
    }
    function draw() { draw0(); ui.exVideoMount(v); }
    function draw0() {
      var e = cur(), ex = D.exById(e.id), total = day.exs.length, pct = Math.round(st.log.reduce(function (s, l, i) { return s + (l.sets / day.exs[i].sets); }, 0) / total * 100);
      if (!st.started) {
        v.innerHTML = '<section class="card" style="max-width:720px;margin:0 auto"><a href="schedule.html" style="font-size:13px;font-weight:700;text-decoration:none;color:rgb(var(--primary))">← Lịch tập</a><h2 style="font-size:26px;font-weight:800;margin:6px 0">' + esc(day.title) + '</h2><p class="sub" style="color:rgb(var(--on-surface-variant))">' + day.exs.length + ' bài · ~' + day.minutes + ' phút · ' + ui.riskBadge(r.level) + '</p>' +
          (r.level >= 2 ? ui.riskPanel(r) + '<div style="height:10px"></div>' : '') + ui.alertBox('info', 'Trước khi bắt đầu', 'Khởi động 5 phút (xoay khớp, đi bộ tại chỗ). Dừng ngay nếu đau nhói, chóng mặt, tức ngực hoặc khó thở.') +
          '<ol style="margin:14px 0 0 18px;list-style:decimal;font-size:15px;line-height:26px">' + day.exs.map(function (x) { return '<li>' + esc(D.exById(x.id).name) + ' – ' + ui.exLabel(x) + '</li>'; }).join('') + '</ol><div style="margin-top:16px"><button class="btn btn-pri btn-lg" id="go-start"><span class="material-symbols-outlined">play_arrow</span>Bắt đầu</button></div></section>';
        $('#go-start').addEventListener('click', begin); return;
      }
      var work = st.phase === 'work', next = day.exs[st.i + 1] ? D.exById(day.exs[st.i + 1].id).name : null;
      v.innerHTML = '<div style="max-width:760px;margin:0 auto;display:grid;gap:14px">' +
        '<div class="card" style="padding:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div style="flex:1;min-width:180px"><div style="font-size:12px;color:rgb(var(--on-surface-variant));font-weight:700">Bài ' + (st.i + 1) + '/' + total + ' · Tổng thời gian <span id="t-el">' + mmss(st.elapsed) + '</span></div><div class="bar" style="margin-top:6px"><i style="width:' + pct + '%"></i></div></div><button class="btn btn-sm" id="b-pause"><span class="material-symbols-outlined" style="font-size:18px">' + (st.paused ? 'play_arrow' : 'pause') + '</span>' + (st.paused ? 'Tiếp tục' : 'Tạm dừng') + '</button><button class="btn btn-sm btn-danger" id="b-quit">Kết thúc sớm</button></div>' +
        '<section class="card" style="text-align:center">' + (work ? '' : '<div class="badge b-info" style="margin-bottom:8px">NGHỈ GIỮA HIỆP</div>') + '<div style="display:flex;justify-content:center">' + (ui.hasExVideo(ex) ? '<div style="width:100%;max-width:520px">' + ui.exVideoHtml(ex, { auto: 1, muted: 1, loop: 1 }) + '</div>' : ui.exTile(ex, 96)) + '</div><h2 style="font-size:26px;font-weight:800;margin:10px 0 2px">' + esc(ex.name) + '</h2><div style="font-size:14px;color:rgb(var(--on-surface-variant))">' + D.CATS[ex.cat] + ' · ' + esc(ex.muscles) + ' · ' + D.LEVELS[ex.level] + ' · ' + ex.equip.map(function (q) { return D.EQUIP[q]; }).join(', ') + '</div>' +
          '<div style="margin:14px 0"><div style="font-size:13px;font-weight:700">Hiệp ' + st.set + '/' + e.sets + '</div>' +
          (work ? (e.kind === 'time' ? '<div id="t-left" style="font-size:64px;font-weight:800;letter-spacing:-.04em;line-height:1.1">' + mmss(st.left) + '</div><div style="font-size:13px">giây còn lại</div>' : '<div style="font-size:15px;margin:6px 0">Mục tiêu <b>' + e.amt + '</b> lần</div><div style="display:flex;justify-content:center;align-items:center;gap:18px"><button class="icon-btn" id="rp-" aria-label="Giảm" style="background:rgb(var(--surface-container));width:52px;height:52px"><span class="material-symbols-outlined">remove</span></button><div style="font-size:60px;font-weight:800;min-width:90px" aria-live="polite">' + st.reps + '</div><button class="icon-btn" id="rp+" aria-label="Tăng" style="background:rgb(var(--primary));color:rgb(var(--on-primary));width:52px;height:52px"><span class="material-symbols-outlined">add</span></button></div>')
            : '<div id="t-left" style="font-size:64px;font-weight:800;letter-spacing:-.04em;line-height:1.1">' + mmss(st.left) + '</div><div style="font-size:13px">Hít thở sâu, uống nước. Tiếp theo: hiệp ' + st.set + '</div>') + '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="b-prev"' + (st.i === 0 ? ' disabled' : '') + '><span class="material-symbols-outlined">skip_previous</span>Bài trước</button>' + (work ? '<button class="btn btn-pri btn-lg" id="b-set"><span class="material-symbols-outlined">check</span>Hoàn thành hiệp</button>' : '<button class="btn btn-pri btn-lg" id="b-skiprest">Bỏ qua nghỉ</button>') + '<button class="btn" id="b-next">' + (st.i === total - 1 ? 'Kết thúc' : 'Bài tiếp theo') + '<span class="material-symbols-outlined">skip_next</span></button></div>' + (next ? '<div style="font-size:12px;margin-top:10px;color:rgb(var(--on-surface-variant))">Tiếp theo: ' + esc(next) + '</div>' : '') + '</section>' +
        '<section class="card"><h4 style="font-weight:800;margin:0 0 6px">Hướng dẫn tư thế</h4><ol style="margin-left:18px;list-style:decimal;font-size:14px;line-height:22px">' + ex.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol><h4 style="font-weight:800;margin:12px 0 6px">Lỗi thường gặp</h4><ul style="margin-left:18px;list-style:disc;font-size:14px">' + ex.mistakes.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' + (ex.warn ? '<div class="alert alert-2" style="margin-top:10px"><span class="material-symbols-outlined">warning</span><div>' + esc(ex.warn) + '</div></div>' : '') + '<p style="font-size:12px;color:rgb(var(--on-surface-variant));margin-top:8px">Đau nhói? Hãy dừng bài và chuyển sang bài nhẹ hơn. Hình/video minh họa thật chưa có – đang dùng biểu tượng.</p></section></div>';
      var g = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      g('b-pause', function () { st.paused = !st.paused; draw(); }); g('b-set', completeSet); g('b-skiprest', function () { st.phase = 'work'; st.reps = 0; st.left = cur().kind === 'time' ? cur().amt : 0; draw(); });
      g('rp+', function () { st.reps++; draw(); }); g('rp-', function () { st.reps = Math.max(0, st.reps - 1); draw(); }); g('b-prev', prevEx); g('b-next', function () { nextEx(false); });
      g('b-quit', function () { ui.confirm({ title: 'Kết thúc buổi tập sớm?', text: 'Phần đã tập vẫn được ghi nhận nếu bạn hoàn thành ít nhất một hiệp.', ok: 'Kết thúc và lưu', danger: true }).then(function (y) { if (y) finish(); }); });
    }
    function finish() {
      clearInterval(timer); st.finished = true; window.onbeforeunload = null;
      var did = st.log.filter(function (l) { return l.sets > 0; }), mins = Math.max(1, Math.round(st.elapsed / 60));
      if (!did.length) { v.innerHTML = '<section class="card" style="max-width:560px;margin:0 auto">' + ui.empty('sentiment_neutral', 'Chưa hoàn thành hiệp nào', 'Buổi tập chưa được ghi nhận.', '<a class="btn" style="margin-top:12px" href="schedule.html">Về Lịch tập</a>') + '</section>'; return; }
      var m = ui.modal('<h3>Hoàn thành buổi tập!</h3><p class="sub">' + did.length + '/' + day.exs.length + ' bài · ' + mins + ' phút. Bạn cảm thấy mức nỗ lực thế nào? (RPE 1–10)</p><input class="field" id="rpe" type="range" min="1" max="10" value="6" aria-label="RPE"><div style="text-align:center;font-weight:800;font-size:24px" id="rpe-v">6</div><div class="row"><button class="btn btn-pri" id="save-s">Lưu buổi tập</button></div>', { sticky: true });
      $('#rpe', m).addEventListener('input', function () { $('#rpe-v', m).textContent = this.value; });
      $('#save-s', m).addEventListener('click', function () {
        var before = E.evalBadges(ST.stats()).filter(function (b) { return b.earned; }).length;
        var s = ST.logSession({ date: date, title: day.title, minutes: mins, rpe: +$('#rpe', m).value, exs: did.map(function (l) { return { id: l.id, sets: l.sets, reps: l.reps, secs: l.secs }; }) });
        var after = E.evalBadges(ST.stats()).filter(function (b) { return b.earned; }).length; if (after > before) ST.notify('military_tech', 'Bạn nhận huy hiệu mới!', 'Xem trong Tiến độ.', 'progress.html');
        m.close(); v.innerHTML = '<section class="card" style="max-width:560px;margin:0 auto;text-align:center"><span class="material-symbols-outlined fill" style="font-size:64px;color:rgb(var(--success))">celebration</span><h2 style="font-size:26px;font-weight:800;margin:6px 0">Tuyệt vời!</h2><p>' + mins + ' phút · ~' + s.calories + ' kcal (ước tính) · chuỗi ' + ST.stats().streak + ' ngày' + (after > before ? '<br><span class="badge b-ok">Huy hiệu mới</span>' : '') + '</p><div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap"><a class="btn btn-pri" href="progress.html">Xem tiến độ</a><a class="btn" href="dashboard.html">Về Trang chủ</a></div></section>';
      });
    }
    draw();
  } });
})();
