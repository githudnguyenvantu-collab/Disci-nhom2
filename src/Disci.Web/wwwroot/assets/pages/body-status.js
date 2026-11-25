/* Cập nhật thể trạng: chỉ số cơ thể · mục tiêu · dữ liệu sức khỏe (đồng ý riêng từng loại) · đánh giá · điều chỉnh lịch */
(function () {
  var E = DISCI_ENGINE, D = DISCI_DATA, ST = DISCI.store, ui = DISCI.ui, esc = ui.esc, $ = ui.$;
  var RESTR = [['knee', 'Hạn chế khớp gối'], ['back', 'Hạn chế lưng/cột sống'], ['shoulder', 'Hạn chế khớp vai'], ['wrist', 'Hạn chế cổ tay'], ['heart', 'Hạn chế cường độ tim mạch'], ['impact', 'Tránh bài va đập mạnh'], ['stop', 'Bác sĩ khuyến cáo tạm ngưng vận động']];
  var SPACE = { home: 'medium', dorm: 'small', outdoor: 'large', gym: 'large' };

  function build(v) {
    var S = ST.S, p = S.profile, lm = ST.latestMetric() || {}, onboard = /onboard=1/.test(location.search), t = ST.today();
    var bp = ST.latestRecord('bp'), rhr = ST.latestRecord('rhr'), con = S.health.consents;
    function consentBlock(key, title, desc, inner) {
      var on = ST.consentOn(key);
      return '<div class="card-flat" style="margin-top:12px" data-consent="' + key + '"><div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between"><div><b>' + title + '</b><div style="font-size:13px;color:rgb(var(--on-surface-variant))">' + desc + '</div></div><button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="Đồng ý dùng ' + title + '" data-sw="' + key + '"></button></div><div class="' + (on ? '' : 'opacity-50') + '" style="margin-top:8px" data-inner="' + key + '">' + inner + '</div>' + (on && con[key] ? '<div style="font-size:11px;color:rgb(var(--outline));margin-top:6px">Đồng ý lúc ' + ui.fmtDate(E.todayStr(con[key].at)) + ' · có thể rút lại bất cứ lúc nào.</div>' : '') + '</div>';
    }
    v.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:16px"><div><a href="dashboard.html" style="font-size:13px;text-decoration:none;color:rgb(var(--primary));font-weight:700">← Quay lại Trang chủ</a><h2 style="font-size:28px;font-weight:800;margin:4px 0 0;letter-spacing:-.02em">Cập nhật chỉ số cơ thể</h2><p style="color:rgb(var(--on-surface-variant));font-size:14px;margin:2px 0 0">Chỉ nhập những gì bạn muốn chia sẻ. Dữ liệu sức khỏe chỉ được dùng sau khi bạn đồng ý riêng từng loại.</p></div></div>' +
      (onboard ? ui.alertBox('info', 'Chào mừng bạn!', 'Hoàn thiện chiều cao, cân nặng, tuổi và mục tiêu để DISCI tạo lịch tập cá nhân hóa đầu tiên.') + '<div style="height:12px"></div>' : '') +
      '<form id="bf" novalidate style="display:grid;gap:16px">' +
      '<section class="card"><h3 style="font-weight:800;font-size:18px;margin:0 0 4px">Thông tin chỉ số cơ thể</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 14px">' +
        fld('f-date', 'Ngày đo', '<input class="field" id="f-date" type="date" max="' + t + '" value="' + t + '">') +
        fld('f-height', 'Chiều cao (cm) *', '<input class="field" id="f-height" type="number" inputmode="decimal" step="0.1" value="' + (p.height || '') + '">') +
        fld('f-weight', 'Cân nặng (kg) *', '<input class="field" id="f-weight" type="number" inputmode="decimal" step="0.1" value="' + (lm.weight || p.weight || '') + '">') +
        fld('f-age', 'Tuổi *', '<input class="field" id="f-age" type="number" inputmode="numeric" value="' + (p.age || '') + '">') +
        fld('f-sex', 'Giới tính', '<select class="field" id="f-sex"><option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>Nữ</option><option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>Nam</option></select>') +
        fld('f-waist', 'Vòng eo (cm)', '<input class="field" id="f-waist" type="number" step="0.1" value="' + (lm.waist || '') + '">') +
        fld('f-hip', 'Vòng hông (cm)', '<input class="field" id="f-hip" type="number" step="0.1" value="' + (lm.hip || '') + '">') +
      '</div><div id="age-note"></div></section>' +

      '<section class="card"><h3 style="font-weight:800;font-size:18px;margin:0 0 8px">Mục tiêu & điều kiện tập luyện</h3><div style="display:flex;gap:8px;flex-wrap:wrap" id="goal-pills" role="radiogroup" aria-label="Mục tiêu">' +
        Object.keys(D.GOALS).map(function (g) { return '<button type="button" class="chip ' + (p.goal === g ? 'on' : '') + '" data-goal="' + g + '" role="radio" aria-checked="' + (p.goal === g) + '">' + D.GOALS[g] + '</button>'; }).join('') + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 14px">' +
        fld('f-gw', 'Cân nặng mục tiêu (kg)', '<input class="field" id="f-gw" type="number" step="0.1" value="' + (p.goalWeight || '') + '">') +
        fld('f-days', 'Số buổi tập mỗi tuần', '<select class="field" id="f-days">' + [2, 3, 4, 5, 6].map(function (n) { return '<option value="' + n + '"' + (+p.daysPerWeek === n ? ' selected' : '') + '>' + n + ' buổi</option>'; }).join('') + '</select>') +
        fld('f-min', 'Thời lượng mỗi buổi (phút)', '<select class="field" id="f-min">' + [20, 30, 40, 45, 60, 75, 90].map(function (n) { return '<option value="' + n + '"' + (+p.minutes === n ? ' selected' : '') + '>' + n + ' phút</option>'; }).join('') + '</select>') +
        fld('f-act', 'Mức độ vận động hiện tại', '<select class="field" id="f-act">' + Object.keys(D.ACTIVITY).map(function (k) { return '<option value="' + k + '"' + (+p.activity === +k ? ' selected' : '') + '>' + D.ACTIVITY[k] + '</option>'; }).join('') + '</select>') +
        fld('f-place', 'Địa điểm / không gian tập', '<select class="field" id="f-place">' + Object.keys(D.PLACES).map(function (k) { return '<option value="' + k + '"' + (p.place === k ? ' selected' : '') + '>' + D.PLACES[k] + '</option>'; }).join('') + '</select>') +
        fld('f-budget', 'Ngân sách mua dụng cụ (VNĐ)', '<input class="field" id="f-budget" type="number" step="10000" min="0" value="' + (p.budget || '') + '">') +
      '</div><label class="lbl">Dụng cụ đang có (bài tập thân người luôn khả dụng)</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="equip">' +
        ['band', 'dumbbell', 'pullup', 'rope', 'treadmill'].map(function (k) { return '<button type="button" class="chip ' + (p.equip.indexOf(k) >= 0 ? 'on' : '') + '" data-eq="' + k + '" aria-pressed="' + (p.equip.indexOf(k) >= 0) + '">' + D.EQUIP[k] + '</button>'; }).join('') + '</div>' +
        '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-size:14px;cursor:pointer"><input type="checkbox" id="f-quiet"' + (p.quiet ? ' checked' : '') + '> <span><b>Chế độ ít ồn / ít chỗ</b> (ký túc xá, căn hộ): chỉ chọn bài êm, không nhảy.</span></label></section>' +

      '<section class="card"><h3 style="font-weight:800;font-size:18px;margin:0 0 4px">Kết quả khám sức khỏe <span class="badge b-mute">Tùy chọn</span></h3><p style="font-size:13px;color:rgb(var(--on-surface-variant));margin:0">DISCI xin phép riêng cho từng loại dữ liệu. Bạn không bắt buộc nhập, và có thể rút lại hay xóa bất cứ lúc nào. Không công khai và không tự chia sẻ lên cộng đồng.</p>' +
        consentBlock('bp', 'Huyết áp nghỉ', 'Dùng để đánh giá mức cảnh báo và điều chỉnh cường độ.', '<label class="lbl" for="f-bp">Huyết áp (tâm thu/tâm trương, ví dụ 120/80)</label><input class="field" id="f-bp" placeholder="120/80" value="' + esc(bp ? bp.value : '') + '"' + (ST.consentOn('bp') ? '' : ' disabled') + '>') +
        consentBlock('rhr', 'Nhịp tim nghỉ', 'Dùng để đánh giá mức cảnh báo.', '<label class="lbl" for="f-rhr">Nhịp tim nghỉ (lần/phút)</label><input class="field" id="f-rhr" type="number" value="' + (rhr ? esc(rhr.value) : '') + '"' + (ST.consentOn('rhr') ? '' : ' disabled') + '>') +
        consentBlock('checkup', 'Khuyến cáo của bác sĩ / kết quả khám', 'Khuyến cáo của bác sĩ luôn được ưu tiên hơn gợi ý của ứng dụng.', '<div style="display:grid;gap:6px;margin-bottom:8px">' + RESTR.map(function (r) { return '<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-rs="' + r[0] + '"' + (S.health.restrictions.indexOf(r[0]) >= 0 ? ' checked' : '') + (ST.consentOn('checkup') ? '' : ' disabled') + '> ' + r[1] + '</label>'; }).join('') + '</div><label class="lbl" for="f-notes">Ghi chú từ bác sĩ / chuyên gia y tế</label><textarea class="field" id="f-notes" rows="2"' + (ST.consentOn('checkup') ? '' : ' disabled') + '>' + esc(S.health.notes || '') + '</textarea>') +
      '</section>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-pri btn-lg" id="btn-eval"><span class="material-symbols-outlined">auto_awesome</span>Lưu và đánh giá thể trạng</button><a class="btn btn-lg" href="dashboard.html">Hủy / giữ nguyên</a></div></form>' +
      '<div id="result" style="margin-top:20px"></div>';

    function fld(id, label, input) { return '<div><label class="lbl" for="' + id + '">' + label + '</label>' + input + '<div id="e-' + id + '"></div></div>'; }
    function err(id, m) { var e = $('#e-' + id); if (e) e.innerHTML = m ? '<div class="err-txt">' + esc(m) + '</div>' : ''; var i = $('#' + id); if (i) i.classList.toggle('bad', !!m); }
    var goal = p.goal, equip = p.equip.slice();

    ui.on(v, 'click', '[data-goal]', function (b) { goal = b.dataset.goal; v.querySelectorAll('[data-goal]').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); });
    ui.on(v, 'click', '[data-eq]', function (b) { var k = b.dataset.eq, i = equip.indexOf(k); if (i >= 0) equip.splice(i, 1); else equip.push(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', i < 0); });
    $('#f-place').addEventListener('change', function () { if (this.value === 'dorm') $('#f-quiet').checked = true; });
    $('#f-age').addEventListener('input', function () { $('#age-note').innerHTML = (+this.value > 0 && +this.value < 18) ? '<div class="alert alert-2" style="margin-top:10px"><span class="material-symbols-outlined">info</span><div>Dưới 18 tuổi nên tập dưới sự hướng dẫn và đồng ý của phụ huynh/người giám hộ.</div></div>' : ''; });

    /* Đồng ý riêng từng loại dữ liệu */
    ui.on(v, 'click', '[data-sw]', function (b) {
      var key = b.dataset.sw, was = ST.consentOn(key), names = { bp: 'huyết áp', rhr: 'nhịp tim nghỉ', checkup: 'khuyến cáo/kết quả khám' };
      if (!was) {
        ui.confirm({ title: 'Cho phép dùng dữ liệu ' + names[key] + '?', text: 'DISCI chỉ dùng dữ liệu này để đánh giá mức cảnh báo và điều chỉnh lịch tập trên thiết bị của bạn. Không công khai, không chia sẻ lên cộng đồng. Bạn có thể rút lại bất cứ lúc nào.', ok: 'Tôi đồng ý' }).then(function (yes) {
          if (!yes) return; S.health.consents[key] = { granted: true, at: Date.now() }; ST.save(); keepAndRerender();
        });
      } else {
        ui.confirm({ title: 'Rút lại đồng ý?', text: 'DISCI sẽ ngừng dùng dữ liệu ' + names[key] + ' và xóa dữ liệu đã lưu thuộc loại này.', ok: 'Rút lại và xóa', danger: true }).then(function (yes) {
          if (!yes) return; S.health.consents[key] = { granted: false, at: Date.now() };
          if (key === 'bp') S.health.records = S.health.records.filter(function (r) { return r.type !== 'bp'; });
          if (key === 'rhr') S.health.records = S.health.records.filter(function (r) { return r.type !== 'rhr'; });
          if (key === 'checkup') { S.health.restrictions = []; S.health.notes = ''; }
          ST.save(); var res = ST.recompute('Bạn rút lại đồng ý dữ liệu ' + names[key]); ui.toast('Đã rút lại đồng ý và xóa dữ liệu ' + names[key]); keepAndRerender(res);
        });
      }
    });
    function keepAndRerender() {   // dựng lại biểu mẫu KHÔNG tải lại trang, giữ nguyên dữ liệu đang gõ
      var ids = ['f-date', 'f-height', 'f-weight', 'f-age', 'f-sex', 'f-waist', 'f-hip', 'f-gw', 'f-days', 'f-min', 'f-act', 'f-place', 'f-budget', 'f-bp', 'f-rhr', 'f-notes'], keep = {};
      ids.forEach(function (k) { var el = $('#' + k); if (el && !el.disabled) keep[k] = el.value; });
      var quiet = $('#f-quiet') ? $('#f-quiet').checked : p.quiet, rs = Array.prototype.map.call(v.querySelectorAll('[data-rs]:checked'), function (c) { return c.dataset.rs; }), scroll = window.scrollY;
      Object.assign(p, collect().profile); ST.save(); build(v);
      Object.keys(keep).forEach(function (k) { var el = $('#' + k); if (el && !el.disabled) el.value = keep[k]; });
      if ($('#f-quiet')) $('#f-quiet').checked = quiet; v.querySelectorAll('[data-rs]').forEach(function (c) { if (!c.disabled && rs.indexOf(c.dataset.rs) >= 0) c.checked = true; });
      window.scrollTo(0, scroll);
    }
    function collect() {
      return { profile: { height: +$('#f-height').value || null, age: +$('#f-age').value || null, sex: $('#f-sex').value, goal: goal, goalWeight: +$('#f-gw').value || null, daysPerWeek: +$('#f-days').value, minutes: +$('#f-min').value, activity: +$('#f-act').value, place: $('#f-place').value, space: SPACE[$('#f-place').value], budget: +$('#f-budget').value || 0, equip: equip.slice(), quiet: $('#f-quiet').checked } };
    }

    $('#bf').addEventListener('submit', function (e) {
      e.preventDefault(); ['f-date', 'f-height', 'f-weight', 'f-age', 'f-waist', 'f-hip', 'f-bp', 'f-rhr'].forEach(function (k) { err(k, ''); });
      var h = +$('#f-height').value, w = +$('#f-weight').value, a = +$('#f-age').value, bad = false, waist = $('#f-waist').value, hip = $('#f-hip').value, date = $('#f-date').value;
      if (!date || date > t) { err('f-date', 'Ngày đo không hợp lệ (không chọn ngày tương lai).'); bad = true; }
      if (!(h >= 100 && h <= 250)) { err('f-height', 'Chiều cao hợp lệ từ 100 đến 250 cm.'); bad = true; }
      if (!(w >= 25 && w <= 300)) { err('f-weight', 'Cân nặng hợp lệ từ 25 đến 300 kg.'); bad = true; }
      if (!(a >= 13 && a <= 100)) { err('f-age', 'Tuổi hợp lệ từ 13 đến 100.'); bad = true; }
      if (waist && !(+waist >= 40 && +waist <= 200)) { err('f-waist', 'Vòng eo hợp lệ từ 40 đến 200 cm.'); bad = true; }
      if (hip && !(+hip >= 50 && +hip <= 200)) { err('f-hip', 'Vòng hông hợp lệ từ 50 đến 200 cm.'); bad = true; }
      var bpv = $('#f-bp') && !$('#f-bp').disabled ? $('#f-bp').value.trim() : '', rhv = $('#f-rhr') && !$('#f-rhr').disabled ? $('#f-rhr').value : '';
      if (bpv) { var pb = E.parseBP(bpv); if (!pb || pb.sbp < 60 || pb.sbp > 260 || pb.dbp < 30 || pb.dbp > 160 || pb.dbp >= pb.sbp) { err('f-bp', 'Nhập dạng 120/80 (tâm thu lớn hơn tâm trương).'); bad = true; } }
      if (rhv && !(+rhv >= 30 && +rhv <= 200)) { err('f-rhr', 'Nhịp tim hợp lệ từ 30 đến 200.'); bad = true; }
      if (bad) { ui.toast('Vui lòng kiểm tra lại các ô báo lỗi', 'err'); var f = v.querySelector('.field.bad'); if (f) f.focus(); return; }

      Object.assign(p, collect().profile); p.weight = w;
      var ex = S.metrics.filter(function (m) { return m.date === date && !m.demo; })[0];
      var rec = { id: ex ? ex.id : ST.uid(), date: date, weight: w, height: h, waist: waist ? +waist : null, hip: hip ? +hip : null, note: ex ? ex.note : '', at: Date.now() };
      if (ex) S.metrics[S.metrics.indexOf(ex)] = rec; else S.metrics.push(rec);
      function addRec(type, val) { if (!val) return; var d = S.health.records.filter(function (r) { return r.type === type && r.date === date; })[0]; if (d) d.value = val; else S.health.records.push({ id: ST.uid(), date: date, type: type, value: val }); }
      if (ST.consentOn('bp')) addRec('bp', bpv);
      if (ST.consentOn('rhr')) addRec('rhr', rhv);
      if (ST.consentOn('checkup')) { S.health.restrictions = Array.prototype.map.call(v.querySelectorAll('[data-rs]:checked'), function (c) { return c.dataset.rs; }); S.health.notes = $('#f-notes').value.trim(); }
      S.onboarded = true; ST.save();
      var hadPlan = !!S.plan, equipOrGoalChanged = true;
      var res = ST.recompute('Cập nhật thể trạng ngày ' + ui.fmtDate(date));
      if (!hadPlan && !res.created) res = { risk: ST.risk(), changes: [], created: false };
      showResult(res, hadPlan); ui.toast('Đã lưu chỉ số và đánh giá thể trạng'); $('#result').scrollIntoView({ behavior: 'smooth' });
    });

    function showResult(res, hadPlan) {
      var d = ST.derive(), r = d.risk, menu = (!d.nutBlocked && d.kcal) ? E.planMenu(d.kcal, S.nutritionPrefs.seed) : null;
      var today = ST.dayFor(ST.today()), exs = (today && today.exs.length ? today.exs : (S.plan ? (S.plan.days.filter(function (x) { return x.type === 'workout'; })[0] || { exs: [] }).exs : [])).slice(0, 3);
      var recs = E.recommendProducts({ goal: S.profile.goal, equip: S.profile.equip, space: S.profile.space, budget: S.profile.budget || 500000, riskLevel: r.level, tags: r.tags, level: S.profile.level, activity: S.profile.activity, quiet: S.profile.quiet, place: S.profile.place }).slice(0, 3);
      $('#result').innerHTML =
        '<section class="card" id="print-area"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h3 style="font-weight:800;font-size:20px;margin:0">Kết quả đánh giá thể trạng</h3><button class="btn btn-sm no-print" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:18px">picture_as_pdf</span>Xuất hồ sơ PDF</button></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:14px 0">' +
          stat('BMI ước tính', d.bmi != null ? d.bmi : '—', d.bmiCat.label) + stat('TDEE ước tính', d.tdee ? d.tdee + ' kcal' : '—', 'Năng lượng tiêu hao/ngày (tham khảo)') + stat('Mục tiêu năng lượng', d.kcal ? d.kcal + ' kcal' : '—', d.kcal ? 'Theo mục tiêu "' + D.GOALS[S.profile.goal] + '"' : 'Chưa gợi ý') + stat('Đạm khuyến nghị', d.protein ? d.protein + ' g' : '—', 'Tham khảo, theo cân nặng') + '</div>' +
        ui.riskPanel(r) + '<p style="font-size:12px;color:rgb(var(--on-surface-variant));margin-top:8px">BMI không đủ để kết luận bạn khỏe mạnh hay không. Ngưỡng cảnh báo là tham số tham khảo ban đầu, chưa được chuyên gia y tế kiểm chứng.</p></section>' +
        '<section class="card" style="margin-top:16px"><h3 style="font-weight:800;font-size:18px;margin:0 0 8px">Lịch tập của bạn</h3>' + (res.created ? ui.alertBox('info', 'Đã tạo lịch tập cá nhân hóa', S.plan.reasons.map(esc).join('<br>')) :
          res.changes.length ? ui.alertBox(2, 'Lịch tập đã được điều chỉnh', 'Lịch cũ không bị ghi đè – bạn có thể xem lại trong Lịch tập › Lịch sử thay đổi.') + '<div style="margin-top:10px">' + ui.changeList(res.changes) + '</div>' : '<p class="sub" style="color:rgb(var(--on-surface-variant))">Không cần thay đổi bài tập so với lịch hiện tại.</p>') +
        '<div style="margin-top:12px"><a class="btn btn-pri" href="schedule.html">Xem lịch tập</a></div></section>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px">' +
        '<section class="card"><h3 style="font-weight:800;font-size:16px;margin:0 0 8px">Bài tập đề xuất</h3>' + (exs.length ? exs.map(function (e) { var x = D.exById(e.id); return '<button class="btn" data-ex="' + x.id + '" style="width:100%;justify-content:flex-start;margin-bottom:6px;text-align:left;white-space:normal">' + x.name + ' <span style="margin-left:auto;font-weight:500;font-size:12px">' + ui.exLabel(e) + '</span></button>'; }).join('') : '<p class="sub">Chưa có lịch.</p>') + '</section>' +
        '<section class="card"><h3 style="font-weight:800;font-size:16px;margin:0 0 8px">Thực đơn gợi ý</h3>' + (menu ? menu.meals.map(function (m) { return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;padding:4px 0"><span>' + esc(m.name) + '</span><b>' + m.kcal + ' kcal</b></div>'; }).join('') + '<a class="btn btn-sm" style="margin-top:8px" href="nutrition.html">Xem dinh dưỡng chi tiết</a>' : '<p class="sub" style="color:rgb(var(--on-surface-variant))">' + esc(d.nutReason || 'Chưa đủ thông tin.') + '</p>') + '</section>' +
        '<section class="card"><h3 style="font-weight:800;font-size:16px;margin:0 0 8px">Sản phẩm phù hợp</h3>' + (recs.length ? recs.map(function (x) { return '<div style="padding:6px 0;font-size:14px"><b>' + esc(x.product.name) + '</b> – ' + E.money(x.product.price) + '<div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + esc(x.reason) + '</div></div>'; }).join('') + '<a class="btn btn-sm" style="margin-top:8px" href="store.html">Xem cửa hàng</a>' : '<p class="sub" style="color:rgb(var(--on-surface-variant))">Không có gợi ý trong ngân sách hiện tại hoặc ở mức cảnh báo cao.</p>') + '</section></div>';
      ui.on($('#result'), 'click', '[data-ex]', function (b) { ui.exerciseModal(b.dataset.ex); });
    }
    function stat(l, val, sub) { return '<div class="card-flat"><div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + l + '</div><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">' + val + '</div><div style="font-size:12px;color:rgb(var(--on-surface-variant))">' + esc(sub) + '</div></div>'; }
    if (S.plan && S.onboarded && !onboard && p.height) { /* hiển thị kết quả hiện tại ngay khi mở trang */ showResult({ created: false, changes: [] }, true); }
  }
  ui.boot({ page: 'body-status', title: 'Cập nhật thể trạng', render: build });
})();
