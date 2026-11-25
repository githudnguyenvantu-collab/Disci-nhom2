/* Khảo sát đầu tiên: mục tiêu → kinh nghiệm & thời gian → dụng cụ → chỉ số cơ thể → kết quả khám (tùy chọn, xin phép riêng) → tự tạo lịch + giải thích.
   Dữ liệu sức khỏe chỉ được dùng sau khi người dùng đồng ý riêng từng loại. Không chẩn đoán bệnh. */
(function () {
  var E = DISCI_ENGINE, D = DISCI_DATA, ST = DISCI.store, ui = DISCI.ui, esc = ui.esc, $ = ui.$;
  var SPACE = { home: 'medium', dorm: 'small', outdoor: 'large', gym: 'large' };
  var GOALS = [['fatloss', 'local_fire_department', 'Giảm mỡ', 'Đốt năng lượng, săn chắc cơ thể'], ['muscle', 'fitness_center', 'Tăng cơ', 'Xây dựng sức mạnh và cơ bắp'], ['endurance', 'directions_run', 'Tăng sức bền', 'Đi, chạy, vận động lâu mà không hụt hơi'], ['health', 'favorite', 'Nâng cao sức khỏe chung', 'Khỏe, dẻo dai, ngủ ngon, ít ngồi lâu']];
  var EXP = [[1, 'sentiment_neutral', 'Mới bắt đầu', 'Ít hoặc chưa tập luyện gần đây', 3, 1], [2, 'directions_walk', 'Đã có nền tảng', 'Tập đều khoảng 1–3 buổi mỗi tuần', 4, 2], [3, 'bolt', 'Tập thường xuyên', 'Tập từ 4 buổi mỗi tuần trở lên', 5, 3]];
  var RESTR = [['knee', 'Hạn chế khớp gối'], ['back', 'Hạn chế lưng/cột sống'], ['shoulder', 'Hạn chế khớp vai'], ['wrist', 'Hạn chế cổ tay'], ['heart', 'Hạn chế cường độ tim mạch'], ['impact', 'Tránh bài va đập mạnh'], ['stop', 'Bác sĩ khuyến cáo tạm ngưng vận động']];
  var STEPS = ['goal', 'exp', 'equip', 'body', 'health', 'result'];

  ui.boot({ page: 'onboarding', title: 'Khảo sát', bare: true, render: function (v) {
    var S = ST.S, p = S.profile, t = ST.today(), saved = null, DK = 'disci:onb:' + ST.user.id;
    try { saved = JSON.parse(sessionStorage.getItem(DK)); } catch (e) {}
    var a = (saved && saved.a) || { goal: p.goal && S.onboarded ? p.goal : null, exp: p.level || null, days: p.daysPerWeek || 3, minutes: p.minutes || 40, place: p.place || 'home', quiet: !!p.quiet, equip: (p.equip || []).slice(), budget: p.budget || 500000,
      sex: p.sex || 'female', age: p.age || '', height: p.height || '', weight: p.weight || '', waist: '', hip: '', goalWeight: p.goalWeight || '', hasHealth: null, c: {}, bp: '', rhr: '', rs: [], notes: '', sym: {} };
    var step = saved ? Math.min(saved.step || 0, 4) : 0, result = null;
    function persist() { if (STEPS[step] === 'result') return; try { sessionStorage.setItem(DK, JSON.stringify({ a: a, step: step })); } catch (e) {} }
    function opt(on, icon, title, desc, attr) { return '<button type="button" class="ob-opt ' + (on ? 'on' : '') + '" ' + attr + ' aria-pressed="' + on + '"><span class="ck"><span class="material-symbols-outlined" style="font-size:16px">check</span></span><span class="ic"><span class="material-symbols-outlined">' + icon + '</span></span><b>' + esc(title) + '</b><span class="d">' + esc(desc) + '</span></button>'; }
    function err(id, m) { var e = $('#e-' + id); if (e) e.innerHTML = m ? '<div class="err-txt">' + esc(m) + '</div>' : ''; var i = $('#' + id); if (i) i.classList.toggle('bad', !!m); return !m; }
    function fld(id, label, input) { return '<div><label class="lbl" for="' + id + '">' + label + '</label>' + input + '<div id="e-' + id + '"></div></div>'; }

    /* ---------- Khung & điều hướng ---------- */
    function frame(inner, last) {
      var n = STEPS.length - 1, pct = Math.round(step / n * 100);
      v.innerHTML = '<div class="ob-top"><div><a href="dashboard.html" class="nk-logo" style="text-decoration:none;color:inherit">' + DISCI.plat.logoHtml(30) + '<b>' + esc(DISCI.plat.brand()) + '</b></a><div class="bar" style="flex:1" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Tiến độ khảo sát"><i style="width:' + (step === n ? 100 : Math.max(6, pct)) + '%"></i></div><span style="font-size:13px;font-weight:600;white-space:nowrap">' + (step === n ? 'Hoàn tất' : 'Bước ' + (step + 1) + '/' + n) + '</span>' + (step < n ? '<button class="btn btn-sm" id="ob-skip">Bỏ qua</button>' : '') + '</div></div>' +
        '<div class="ob-wrap">' + inner + '</div>' + (last ? '' : '<div class="ob-foot"><div><button class="btn" id="ob-back"' + (step === 0 ? ' disabled' : '') + '><span class="material-symbols-outlined">arrow_back</span>Quay lại</button><button class="btn btn-volt btn-lg" id="ob-next">' + (step === 4 ? 'Tạo lịch tập của tôi' : 'Tiếp tục') + '<span class="material-symbols-outlined">arrow_forward</span></button></div></div>');
      window.scrollTo(0, 0);
    }
    function head(q, sub) { return '<p class="nk-eyebrow" style="background:rgb(var(--surface-container));color:rgb(var(--on-surface));border-color:rgb(var(--outline-variant))">' + esc(STEPS[step] === 'result' ? 'Kết quả' : 'Câu hỏi ' + (step + 1)) + '</p><h1 class="ob-q">' + q + '</h1><p style="font-size:16px;line-height:24px;color:rgb(var(--on-surface-variant));margin:0;max-width:620px">' + sub + '</p>'; }

    /* ---------- Các bước ---------- */
    function stepGoal() { frame(head('Mục tiêu của bạn là <span class="vl">gì?</span>', 'Chọn mục tiêu chính. DISCI sẽ dựa vào đây để chọn kiểu bài tập, số lần lặp và thời gian nghỉ.') + '<div class="ob-opts">' + GOALS.map(function (g) { return opt(a.goal === g[0], g[1], g[2], g[3], 'data-goal="' + g[0] + '"'); }).join('') + '</div><div id="e-goal" style="margin-top:10px"></div>'); }
    function stepExp() {
      frame(head('Bạn tập <span class="vl">thế nào?</span>', 'Giúp DISCI chọn độ khó và khối lượng ban đầu phù hợp, tránh quá sức.') + '<div class="ob-opts">' + EXP.map(function (e) { return opt(a.exp === e[0], e[1], e[2], e[3], 'data-exp="' + e[0] + '"'); }).join('') + '</div><div id="e-exp" style="margin-top:10px"></div>' +
        '<div class="card" style="margin-top:20px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px">' +
        fld('o-days', 'Bạn muốn tập mấy buổi mỗi tuần?', '<select class="field" id="o-days">' + [2, 3, 4, 5, 6].map(function (n) { return '<option value="' + n + '"' + (+a.days === n ? ' selected' : '') + '>' + n + ' buổi</option>'; }).join('') + '</select>') +
        fld('o-min', 'Mỗi buổi tập được bao lâu?', '<select class="field" id="o-min">' + [20, 30, 40, 45, 60, 75, 90].map(function (n) { return '<option value="' + n + '"' + (+a.minutes === n ? ' selected' : '') + '>' + n + ' phút</option>'; }).join('') + '</select>') +
        fld('o-place', 'Bạn thường tập ở đâu?', '<select class="field" id="o-place">' + Object.keys(D.PLACES).map(function (k) { return '<option value="' + k + '"' + (a.place === k ? ' selected' : '') + '>' + D.PLACES[k] + '</option>'; }).join('') + '</select>') + '</div>' +
        '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-size:14px;cursor:pointer"><input type="checkbox" id="o-quiet"' + (a.quiet || a.place === 'dorm' ? ' checked' : '') + '> <span><b>Cần tập ít ồn / ít chỗ</b> (ký túc xá, căn hộ): không nhảy, không dậm mạnh.</span></label></div>');
    }
    function stepEquip() {
      frame(head('Bạn có <span class="vl">dụng cụ</span> nào?', 'Không có cũng không sao – bài tập thân người luôn dùng được. Dụng cụ bạn chọn sẽ được dùng trong lịch.') + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">' + ['band', 'dumbbell', 'pullup', 'rope', 'treadmill'].map(function (k) { return '<button type="button" class="chip ' + (a.equip.indexOf(k) >= 0 ? 'on' : '') + '" data-eq="' + k + '" aria-pressed="' + (a.equip.indexOf(k) >= 0) + '" style="padding:12px 20px;font-size:15px">' + D.EQUIP[k] + '</button>'; }).join('') + '</div>' +
        '<div class="card" style="margin-top:22px;max-width:420px">' + fld('o-budget', 'Ngân sách bạn sẵn lòng chi cho dụng cụ (VNĐ)', '<input class="field" id="o-budget" type="number" min="0" step="10000" value="' + (a.budget || 0) + '">') + '<p style="font-size:12px;color:rgb(var(--on-surface-variant));margin:8px 0 0">DISCI ưu tiên gợi ý món rẻ và thật sự cần thiết. Để 0 nếu không muốn mua gì.</p></div>');
    }
    function liveHtml() {
      var w = +a.weight, h = +a.height, ag = +a.age, b = E.bmi(w, h); if (!b || !(ag > 0)) return '<p style="font-size:13px;color:rgb(var(--on-surface-variant));margin-top:16px">Nhập chiều cao, cân nặng và tuổi để xem BMI và TDEE ước tính.</p>';
      var td = E.tdee(a.sex, w, h, ag, a.exp === 3 ? 3 : a.exp === 2 ? 2 : 1), k = E.targetCalories(td, a.goal, a.sex);
      return '<div class="ob-live"><div class="nk-stat"><div class="k">BMI ước tính</div><div class="v">' + b + '</div><div class="s">' + E.bmiCategory(b).label + '</div></div><div class="nk-stat"><div class="k">TDEE ước tính</div><div class="v">' + td + '</div><div class="s">kcal/ngày (tham khảo)</div></div><div class="nk-stat"><div class="k">Mục tiêu năng lượng</div><div class="v">' + k + '</div><div class="s">kcal/ngày</div></div></div><p style="font-size:12px;color:rgb(var(--on-surface-variant));margin:8px 0 0">BMI chỉ là ước tính tham khảo, không đủ để kết luận bạn khỏe mạnh hay không.</p>';
    }
    function stepBody() {
      frame(head('Chỉ số <span class="vl">cơ thể</span>', 'Dùng để tính BMI, TDEE và chọn lịch tập an toàn. Bạn có thể cập nhật bất cứ lúc nào.') +
        '<div style="margin-top:20px"><label class="lbl">Giới tính</label><div class="ob-seg" role="radiogroup" aria-label="Giới tính"><button type="button" data-sex="female" class="' + (a.sex === 'female' ? 'on' : '') + '" role="radio" aria-checked="' + (a.sex === 'female') + '">Nữ</button><button type="button" data-sex="male" class="' + (a.sex === 'male' ? 'on' : '') + '" role="radio" aria-checked="' + (a.sex === 'male') + '">Nam</button></div></div>' +
        '<div class="card" style="margin-top:14px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 14px">' +
        fld('o-age', 'Tuổi *', '<input class="field" id="o-age" type="number" inputmode="numeric" value="' + a.age + '">') + fld('o-height', 'Chiều cao (cm) *', '<input class="field" id="o-height" type="number" inputmode="decimal" step="0.1" value="' + a.height + '">') + fld('o-weight', 'Cân nặng (kg) *', '<input class="field" id="o-weight" type="number" inputmode="decimal" step="0.1" value="' + a.weight + '">') +
        (a.goal === 'fatloss' || a.goal === 'muscle' ? fld('o-gw', 'Cân nặng mục tiêu (kg)', '<input class="field" id="o-gw" type="number" step="0.1" value="' + a.goalWeight + '">') : '') + fld('o-waist', 'Vòng eo (cm) – tùy chọn', '<input class="field" id="o-waist" type="number" step="0.1" value="' + a.waist + '">') + fld('o-hip', 'Vòng hông (cm) – tùy chọn', '<input class="field" id="o-hip" type="number" step="0.1" value="' + a.hip + '">') +
        '</div><div id="age-note"></div></div><div id="live">' + liveHtml() + '</div>');
    }
    function conBlock(key, title, desc, inner) {
      var on = !!a.c[key];
      return '<div class="card-flat" style="margin-top:12px"><label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-con="' + key + '"' + (on ? ' checked' : '') + ' style="margin-top:4px;width:18px;height:18px"><span><b>Tôi đồng ý cho DISCI dùng ' + title + '</b><br><span style="font-size:13px;color:rgb(var(--on-surface-variant))">' + desc + '</span></span></label><div style="margin-top:10px;' + (on ? '' : 'opacity:.45;pointer-events:none') + '">' + inner + '</div></div>';
    }
    function stepHealth() {
      var yes = a.hasHealth === true;
      frame(head('Bạn có <span class="vl">kết quả khám</span> sức khỏe?', 'Không bắt buộc. Nếu có, DISCI sẽ tự điều chỉnh bài tập cho an toàn. Mỗi loại dữ liệu cần sự đồng ý riêng; bạn có thể rút lại và xóa bất cứ lúc nào. Không bao giờ công khai.') +
        '<div class="ob-opts" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' + opt(a.hasHealth === true, 'clinical_notes', 'Có, tôi muốn nhập', 'Huyết áp, nhịp tim nghỉ hoặc khuyến cáo của bác sĩ', 'data-hh="1"') + opt(a.hasHealth === false, 'skip_next', 'Chưa có / để sau', 'Bạn có thể bổ sung ở Cá nhân › Quản lý sức khỏe, lịch sẽ tự cập nhật', 'data-hh="0"') + '</div><div id="e-hh" style="margin-top:8px"></div>' +
        (yes ? conBlock('bp', 'huyết áp nghỉ', 'Dùng để đánh giá mức cảnh báo và cường độ.', '<label class="lbl" for="o-bp">Huyết áp (tâm thu/tâm trương)</label><input class="field" id="o-bp" placeholder="120/80" value="' + esc(a.bp) + '">' + '<div id="e-o-bp"></div>') +
          conBlock('rhr', 'nhịp tim nghỉ', 'Dùng để đánh giá mức cảnh báo.', '<label class="lbl" for="o-rhr">Nhịp tim nghỉ (lần/phút)</label><input class="field" id="o-rhr" type="number" value="' + esc(a.rhr) + '"><div id="e-o-rhr"></div>') +
          conBlock('checkup', 'khuyến cáo / kết quả khám của bác sĩ', 'Khuyến cáo của bác sĩ luôn được ưu tiên hơn gợi ý của ứng dụng.', '<div style="display:grid;gap:6px">' + RESTR.map(function (r) { return '<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-rs="' + r[0] + '"' + (a.rs.indexOf(r[0]) >= 0 ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '</div><label class="lbl" for="o-notes">Ghi chú từ bác sĩ (tùy chọn)</label><textarea class="field" id="o-notes" rows="2" style="border-radius:12px">' + esc(a.notes) + '</textarea>') : '') +
        '<div class="card" style="margin-top:18px"><b>Hôm nay bạn đang gặp điều gì?</b> <span class="badge b-mute">Tùy chọn</span><p style="font-size:13px;color:rgb(var(--on-surface-variant));margin:4px 0 8px">Nếu có đau ngực, chóng mặt hoặc khó thở, hãy dừng tập và hỏi bác sĩ.</p>' + [['pain', 'Đang đau cơ/khớp'], ['fatigue', 'Mệt nhiều / ngủ không đủ'], ['chest', 'Đau tức ngực'], ['dizzy', 'Chóng mặt'], ['breath', 'Khó thở bất thường']].map(function (x) { return '<label style="display:flex;gap:10px;align-items:center;padding:5px 0;font-size:14px;cursor:pointer"><input type="checkbox" data-sym="' + x[0] + '"' + (a.sym[x[0]] ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') + '</div>');
    }
    function stepResult() {
      var r = result, d = r.derive, risk = d.risk, plan = S.plan, first = plan.days.filter(function (x) { return x.type === 'workout'; })[0];
      var menu = !d.nutBlocked && d.kcal ? E.planMenu(d.kcal, 0) : null;
      frame(head('Xong! Lịch của bạn <span class="vl">đã sẵn sàng</span>', 'DISCI đã tạo lịch tuần dựa trên mục tiêu, thời gian, dụng cụ và chỉ số của bạn' + (r.usedHealth ? ', cùng dữ liệu sức khỏe bạn cho phép' : '') + '.') +
        '<div class="ob-live" style="margin-top:22px"><div class="nk-stat"><div class="k">BMI ước tính</div><div class="v">' + d.bmi + '</div><div class="s">' + esc(d.bmiCat.label) + '</div></div><div class="nk-stat"><div class="k">TDEE ước tính</div><div class="v">' + (d.tdee || '—') + '</div><div class="s">kcal/ngày</div></div><div class="nk-stat"><div class="k">Lịch tập</div><div class="v">' + plan.daysPerWeek + '</div><div class="s">buổi/tuần · ~' + plan.minutes + ' phút</div></div><div class="nk-stat"><div class="k">Mục tiêu</div><div class="v" style="font-size:24px">' + esc(D.GOALS[a.goal]) + '</div><div class="s">&nbsp;</div></div></div>' +
        '<div style="margin-top:16px">' + ui.riskPanel(risk) + '</div>' +
        (r.changes.length ? '<section class="card" style="margin-top:16px"><h3 style="font-weight:800;font-size:18px;margin:0 0 4px">DISCI đã điều chỉnh theo kết quả của bạn</h3><p style="font-size:13px;color:rgb(var(--on-surface-variant));margin:0 0 10px">So với lịch chuẩn cho người cùng mục tiêu, các bài sau được thay để phù hợp hơn:</p>' + ui.changeList(r.changes) + '</section>' : (r.usedHealth ? '<div class="alert alert-1" style="margin-top:16px"><span class="material-symbols-outlined fill">check_circle</span><div><b>Không cần thay bài nào.</b> Kết quả bạn nhập nằm trong khoảng tham khảo nên lịch giữ nguyên độ khó phù hợp mục tiêu.</div></div>' : '')) +
        '<section class="card" style="margin-top:16px"><h3 style="font-weight:800;font-size:18px;margin:0 0 10px">Lịch tuần của bạn</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px">' + plan.days.map(function (x) { return '<div class="card-flat" style="padding:12px;' + (x.type === 'workout' ? '' : 'opacity:.6') + '"><div style="font-size:12px;font-weight:700;color:rgb(var(--on-surface-variant))">' + E.DOW_LABEL[x.dow] + '</div><div style="font-weight:700;font-size:14px;margin:2px 0">' + esc(x.title) + '</div><div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + (x.type === 'workout' ? x.exs.length + ' bài · ' + x.minutes + 'p' : 'Nghỉ') + '</div></div>'; }).join('') + '</div></section>' +
        (first ? '<section class="card" style="margin-top:16px"><h3 style="font-weight:800;font-size:18px;margin:0 0 4px">Buổi đầu tiên: ' + esc(first.title) + '</h3><p style="font-size:13px;color:rgb(var(--on-surface-variant));margin:0 0 10px">Bấm vào bài để xem hướng dẫn tư thế.</p>' + first.exs.map(function (e) { var x = D.exById(e.id); return '<button class="card-flat" data-ex="' + x.id + '" style="display:flex;gap:12px;align-items:center;width:100%;border:0;text-align:left;cursor:pointer;margin-bottom:6px">' + ui.exTile(x, 40) + '<b style="flex:1;font-size:14px">' + esc(x.name) + '</b><span style="font-size:13px">' + ui.exLabel(e) + '</span></button>'; }).join('') + '</section>' : '') +
        (menu ? '<p style="font-size:13px;color:rgb(var(--on-surface-variant));margin:14px 0 0">🍽 Mục tiêu khoảng ' + d.kcal + ' kcal và ' + d.protein + ' g đạm/ngày. Xem thực đơn món Việt ở mục Dinh dưỡng.</p>' : '') +
        '<div class="alert alert-info" style="margin-top:16px"><span class="material-symbols-outlined">autorenew</span><div>Sau này khi bạn <b>cập nhật chỉ số hoặc nhập kết quả khám mới</b>, DISCI sẽ tự điều chỉnh lịch và giải thích lý do. Lịch cũ luôn được lưu lại.</div></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px"><a class="btn btn-volt btn-lg" href="dashboard.html">Vào Trang chủ<span class="material-symbols-outlined">arrow_forward</span></a><a class="btn btn-lg" href="schedule.html">Xem lịch tập</a></div><p style="font-size:12px;color:rgb(var(--on-surface-variant));margin-top:16px">DISCI chỉ hỗ trợ luyện tập, không chẩn đoán bệnh. Ngưỡng cảnh báo là tham số tham khảo.</p>', true);
    }
    function draw() { persist(); ({ goal: stepGoal, exp: stepExp, equip: stepEquip, body: stepBody, health: stepHealth, result: stepResult })[STEPS[step]](); }

    /* ---------- Đọc & kiểm tra từng bước ---------- */
    function collectAndValidate() {
      var s = STEPS[step];
      if (s === 'goal') { if (!a.goal) { $('#e-goal').innerHTML = '<div class="err-txt">Hãy chọn một mục tiêu để tiếp tục.</div>'; return false; } return true; }
      if (s === 'exp') {
        if (!a.exp) { $('#e-exp').innerHTML = '<div class="err-txt">Hãy chọn mức kinh nghiệm của bạn.</div>'; return false; }
        a.days = +$('#o-days').value; a.minutes = +$('#o-min').value; a.place = $('#o-place').value; a.quiet = $('#o-quiet').checked || a.place === 'dorm'; return true;
      }
      if (s === 'equip') { var b = +$('#o-budget').value; if ($('#o-budget').value === '' || !(b >= 0 && b <= 100000000)) return err('o-budget', 'Ngân sách hợp lệ từ 0 đến 100.000.000 VNĐ.'); a.budget = b; return err('o-budget', ''); }
      if (s === 'body') {
        ['o-age', 'o-height', 'o-weight', 'o-gw', 'o-waist', 'o-hip'].forEach(function (k) { err(k, ''); }); var ok = true;
        var ag = +$('#o-age').value, h = +$('#o-height').value, w = +$('#o-weight').value, gw = $('#o-gw') ? $('#o-gw').value : '', wa = $('#o-waist').value, hp = $('#o-hip').value;
        if (!(h >= 100 && h <= 250)) { err('o-height', 'Chiều cao hợp lệ từ 100 đến 250 cm.'); ok = false; }
        if (!(w >= 25 && w <= 300)) { err('o-weight', 'Cân nặng hợp lệ từ 25 đến 300 kg.'); ok = false; }
        if (gw && !(+gw >= 25 && +gw <= 300)) { err('o-gw', 'Cân nặng mục tiêu hợp lệ từ 25 đến 300 kg.'); ok = false; }
        if (wa && !(+wa >= 40 && +wa <= 200)) { err('o-waist', 'Vòng eo hợp lệ từ 40 đến 200 cm.'); ok = false; }
        if (hp && !(+hp >= 50 && +hp <= 200)) { err('o-hip', 'Vòng hông hợp lệ từ 50 đến 200 cm.'); ok = false; }
        if (!(ag >= 13 && ag <= 100)) { err('o-age', 'Tuổi hợp lệ từ 13 đến 100.'); ok = false; }
        if (!ok) { var f = v.querySelector('.field.bad'); if (f) f.focus(); return false; }
        a.age = ag; a.height = h; a.weight = w; a.goalWeight = gw ? +gw : ''; a.waist = wa; a.hip = hp; return true;
      }
      if (s === 'health') {
        if (a.hasHealth === null) { $('#e-hh').innerHTML = '<div class="err-txt">Hãy chọn "Có" hoặc "Chưa có / để sau".</div>'; return false; }
        a.sym = {}; v.querySelectorAll('[data-sym]').forEach(function (c) { if (c.checked) a.sym[c.dataset.sym] = true; });
        if (a.hasHealth) {
          ['o-bp', 'o-rhr'].forEach(function (k) { err(k, ''); }); var ok2 = true;
          if (a.c.bp) { a.bp = $('#o-bp').value.trim(); if (a.bp) { var q = E.parseBP(a.bp); if (!q || q.sbp < 60 || q.sbp > 260 || q.dbp < 30 || q.dbp > 160 || q.dbp >= q.sbp) { err('o-bp', 'Nhập dạng 120/80 (tâm thu lớn hơn tâm trương).'); ok2 = false; } } }
          if (a.c.rhr) { a.rhr = $('#o-rhr').value; if (a.rhr && !(+a.rhr >= 30 && +a.rhr <= 200)) { err('o-rhr', 'Nhịp tim hợp lệ từ 30 đến 200.'); ok2 = false; } }
          if (a.c.checkup) { a.rs = Array.prototype.map.call(v.querySelectorAll('[data-rs]:checked'), function (c) { return c.dataset.rs; }); a.notes = $('#o-notes').value.trim(); }
          if (!ok2) return false;
        }
        return true;
      }
      return true;
    }

    /* ---------- Hoàn tất: lưu, tạo lịch, so sánh với lịch chuẩn để giải thích ---------- */
    function commit() {
      var now = Date.now();
      Object.assign(p, { goal: a.goal, level: a.exp, activity: a.exp === 3 ? 3 : a.exp === 2 ? 2 : 1, daysPerWeek: a.days, minutes: a.minutes, place: a.place, space: SPACE[a.place], quiet: a.quiet, equip: a.equip.slice(), budget: a.budget, sex: a.sex, age: a.age, height: a.height, weight: a.weight, goalWeight: a.goalWeight || null });
      S.metrics = S.metrics.filter(function (m) { return m.date !== t || m.demo; });
      S.metrics.push({ id: ST.uid(), date: t, weight: a.weight, height: a.height, waist: a.waist ? +a.waist : null, hip: a.hip ? +a.hip : null, note: 'Khảo sát đầu tiên', at: now });
      var used = false;
      if (a.hasHealth) {
        ['bp', 'rhr', 'checkup'].forEach(function (k) { if (a.c[k]) S.health.consents[k] = { granted: true, at: now }; });
        if (a.c.bp && a.bp) { S.health.records.push({ id: ST.uid(), date: t, type: 'bp', value: a.bp }); used = true; }
        if (a.c.rhr && a.rhr) { S.health.records.push({ id: ST.uid(), date: t, type: 'rhr', value: String(a.rhr) }); used = true; }
        if (a.c.checkup) { S.health.restrictions = a.rs.slice(); S.health.notes = a.notes; used = used || a.rs.length > 0 || !!a.notes; }
      }
      if (Object.keys(a.sym).length) { var ck = Object.assign({ date: t, at: now }, a.sym); S.checkins = S.checkins.filter(function (x) { return x.date !== t; }); S.checkins.push(ck); used = true; }
      S.onboarded = true; ST.save();
      var prof = ST.profileForPlan(), d = ST.derive(), risk = d.risk;
      var baseRisk = E.assessRisk({ age: a.age, bmi: E.bmi(a.weight, a.height), restrictions: [], symptoms: {} }), base = E.generatePlan(prof, baseRisk, now), changes = E.adaptPlan(base, prof, risk, now).changes;
      var res = ST.createPlan('Tạo lịch lần đầu qua khảo sát'); ST.notify('auto_awesome', 'Lịch tập của bạn đã sẵn sàng', 'Xem lịch tuần và buổi đầu tiên.', 'schedule.html');
      try { sessionStorage.removeItem(DK); } catch (e) {}
      return { derive: ST.derive(), changes: changes, usedHealth: used, ok: res.ok };
    }

    /* ---------- Sự kiện ---------- */
    ui.on(v, 'click', '[data-goal]', function (b) { a.goal = b.dataset.goal; draw(); });
    ui.on(v, 'click', '[data-exp]', function (b) { a.exp = +b.dataset.exp; var e = EXP.filter(function (x) { return x[0] === a.exp; })[0]; a.days = e[4]; draw(); });
    ui.on(v, 'click', '[data-eq]', function (b) { var k = b.dataset.eq, i = a.equip.indexOf(k); if (i >= 0) a.equip.splice(i, 1); else a.equip.push(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', i < 0); persist(); });
    ui.on(v, 'click', '[data-sex]', function (b) { a.sex = b.dataset.sex; v.querySelectorAll('[data-sex]').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); $('#live').innerHTML = liveHtml(); persist(); });
    ui.on(v, 'click', '[data-hh]', function (b) { a.hasHealth = b.dataset.hh === '1'; draw(); });
    v.addEventListener('change', function (e) {
      var t0 = e.target;
      if (t0.dataset && t0.dataset.con) { a.c[t0.dataset.con] = t0.checked; if (a.c.bp) a.bp = $('#o-bp') ? $('#o-bp').value : a.bp; draw(); }
      if (t0.id === 'o-place' && t0.value === 'dorm' && $('#o-quiet')) $('#o-quiet').checked = true;
    });
    v.addEventListener('input', function (e) {
      var id = e.target.id; if (['o-age', 'o-height', 'o-weight'].indexOf(id) < 0) return;
      a.age = $('#o-age').value; a.height = $('#o-height').value; a.weight = $('#o-weight').value; $('#live').innerHTML = liveHtml();
      $('#age-note').innerHTML = (+a.age > 0 && +a.age < 18) ? '<div class="alert alert-2" style="margin-top:10px"><span class="material-symbols-outlined">info</span><div>Dưới 18 tuổi nên tập dưới sự hướng dẫn và đồng ý của phụ huynh/người giám hộ.</div></div>' : '';
    });
    ui.on(v, 'click', '[data-ex]', function (b) { ui.exerciseModal(b.dataset.ex); });
    function skipOff(k) { try { var off = DISCI.plat.cfg().site.flow.onbOff || []; return (k === 'exp' || k === 'equip') && off.indexOf(k) >= 0; } catch (e) { return false; } }
    ui.on(v, 'click', '#ob-back', function () { if (step > 0) { collectSoft(); step--; while (step > 0 && skipOff(STEPS[step])) step--; draw(); } });
    ui.on(v, 'click', '#ob-skip', function () { ui.confirm({ title: 'Bỏ qua khảo sát?', text: 'Bạn sẽ không có lịch tập cá nhân hóa cho tới khi nhập chỉ số cơ thể ở Trang chủ. Có thể làm lại bất cứ lúc nào.', ok: 'Bỏ qua' }).then(function (y) { if (y) { S.onboarded = true; ST.save(); try { sessionStorage.removeItem(DK); } catch (e) {} location.href = 'dashboard.html'; } }); });
    function collectSoft() { try { if (STEPS[step] === 'exp' && $('#o-days')) { a.days = +$('#o-days').value; a.minutes = +$('#o-min').value; a.place = $('#o-place').value; a.quiet = $('#o-quiet').checked; } if (STEPS[step] === 'body' && $('#o-age')) { a.age = $('#o-age').value; a.height = $('#o-height').value; a.weight = $('#o-weight').value; a.waist = $('#o-waist').value; a.hip = $('#o-hip').value; if ($('#o-gw')) a.goalWeight = $('#o-gw').value; } if (STEPS[step] === 'equip' && $('#o-budget')) a.budget = +$('#o-budget').value || 0; } catch (e) {} }
    ui.on(v, 'click', '#ob-next', function () {
      if (!collectAndValidate()) return;
      if (STEPS[step] === 'health') {
        step = STEPS.indexOf('result'); v.innerHTML = '<div class="ob-load"><div class="ob-spin" role="status" aria-label="Đang tạo lịch"></div><h2 class="ob-q" style="font-size:clamp(28px,5vw,44px)">Đang tạo lịch <span class="vl">cá nhân hóa</span></h2><p style="color:rgb(var(--on-surface-variant))">Kiểm tra chỉ số, áp dụng quy tắc an toàn, chọn bài phù hợp…</p></div>';
        setTimeout(function () { try { result = commit(); if (!result.ok) throw new Error('Không tạo được lịch'); draw(); } catch (e) { console.error(e); step = 4; draw(); ui.toast('Không thể tạo lịch: ' + (e.message || e), 'err'); } }, 900);
        return;
      }
      step++; while (skipOff(STEPS[step])) step++; draw();
    });
    while (skipOff(STEPS[step])) step++;
    draw();
  } });
})();
