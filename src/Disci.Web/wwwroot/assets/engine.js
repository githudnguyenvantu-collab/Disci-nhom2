/* =====================================================================
   DISCI ENGINE – các module độc lập, không phụ thuộc DOM (kiểm thử bằng Node)
   BMI · TDEE · Cảnh báo 3 mức · Tạo lịch tuần · Thay bài · Bỏ buổi · Tiến độ · Gợi ý sản phẩm · Thực đơn
   LƯU Ý: các ngưỡng sức khỏe là THAM SỐ THAM KHẢO BAN ĐẦU, cần chuyên gia y tế kiểm chứng trước khi dùng thực tế.
   Kết quả KHÔNG dùng để chẩn đoán bệnh. Khuyến cáo của bác sĩ luôn được ưu tiên.
   ===================================================================== */
(function (root) {
  'use strict';
  var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.DISCI_DATA;
  var TZ = 'Asia/Ho_Chi_Minh';

  /* ---------- Ngày giờ (múi giờ Asia/Ho_Chi_Minh) ---------- */
  function todayStr(now) { return new Date(now == null ? Date.now() : now).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10); }
  function pd(s) { return new Date(s + 'T00:00:00Z'); }
  function fmt(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = pd(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
  function dow(s) { return (pd(s).getUTCDay() + 6) % 7; }            // 0 = Thứ 2 … 6 = CN
  function weekStart(s) { return addDays(s, -dow(s)); }
  function diffDays(a, b) { return Math.round((pd(a) - pd(b)) / 864e5); }
  var DOW_LABEL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
  function greeting(now) { var h = +new Date(now == null ? Date.now() : now).toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; }
  function money(n) { return Math.round(n).toLocaleString('vi-VN') + ' đ'; }
  function round1(x) { return Math.round(x * 10) / 10; }

  /* ---------- 1. BMI Calculator ---------- */
  function bmi(w, h) { w = +w; h = +h; if (!(w > 0) || !(h > 0)) return null; return round1(w / Math.pow(h / 100, 2)); }
  /* Ngưỡng WHO khu vực châu Á – Thái Bình Dương (tham khảo). BMI không đủ để kết luận một người khỏe mạnh hay không. */
  function bmiCategory(b) {
    if (b == null) return { key: 'na', label: 'Chưa đủ dữ liệu' };
    if (b < 18.5) return { key: 'low', label: 'Thiếu cân (tham khảo)' };
    if (b < 23) return { key: 'normal', label: 'Trong khoảng tham khảo' };
    if (b < 25) return { key: 'over', label: 'Thừa cân nhẹ (tham khảo)' };
    if (b < 30) return { key: 'pre', label: 'Thừa cân (tham khảo)' };
    return { key: 'obese', label: 'Béo phì (tham khảo)' };
  }

  /* ---------- 2. TDEE Estimator (Mifflin-St Jeor) ---------- */
  var ACT_F = { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725 };
  function bmr(sex, w, h, age) { if (!(w > 0 && h > 0 && age > 0)) return null; return Math.round(10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161)); }
  function tdee(sex, w, h, age, activity) { var b = bmr(sex, w, h, age); return b == null ? null : Math.round(b * (ACT_F[activity] || 1.375)); }
  function targetCalories(td, goal, sex) {
    if (td == null) return null;
    var adj = goal === 'fatloss' ? 0.85 : goal === 'muscle' ? 1.08 : 1;
    return Math.max(sex === 'male' ? 1500 : 1200, Math.round(td * adj / 10) * 10);
  }
  function proteinTarget(w, goal) { return Math.round((goal === 'muscle' ? 1.6 : goal === 'fatloss' ? 1.4 : 1.2) * w); }

  /* ---------- 3. Hệ thống cảnh báo 3 mức ---------- */
  function parseBP(s) { var m = String(s || '').match(/(\d{2,3})\s*[\/\\-]\s*(\d{2,3})/); return m ? { sbp: +m[1], dbp: +m[2] } : null; }
  var RESTRICT_MAP = {
    knee: { label: 'Đau/hạn chế khớp gối', tags: ['knee', 'impact'] },
    back: { label: 'Đau/hạn chế lưng – cột sống', tags: ['spine'] },
    shoulder: { label: 'Đau/hạn chế khớp vai', tags: ['shoulder', 'overhead'] },
    wrist: { label: 'Đau/hạn chế cổ tay', tags: ['wrist'] },
    heart: { label: 'Khuyến cáo hạn chế cường độ tim mạch', tags: ['intense', 'impact'] },
    impact: { label: 'Tránh bài có va đập mạnh', tags: ['impact'] },
    stop: { label: 'Bác sĩ khuyến cáo tạm ngưng vận động', tags: [] }
  };
  /* input: {age,bmi,sbp,dbp,rhr,symptoms:{chest,dizzy,breath,pain,fatigue}, restrictions:[keys], consent:{bp,rhr,notes}} */
  function assessRisk(inp) {
    inp = inp || {}; var s = inp.symptoms || {}; var r3 = [], r2 = [], tags = {};
    var rs = inp.restrictions || [];
    rs.forEach(function (k) { if (RESTRICT_MAP[k]) RESTRICT_MAP[k].tags.forEach(function (t) { tags[t] = 1; }); });
    if (rs.indexOf('stop') >= 0) r3.push('Bác sĩ đã khuyến cáo tạm ngưng vận động – khuyến cáo của bác sĩ luôn được ưu tiên.');
    else rs.forEach(function (k) { if (RESTRICT_MAP[k]) r2.push(RESTRICT_MAP[k].label + ' (theo khuyến cáo bạn nhập).'); });
    if (s.chest || s.dizzy || s.breath) r3.push('Bạn báo có đau ngực, chóng mặt hoặc khó thở – hãy dừng tập và tham khảo bác sĩ.');
    if (inp.sbp != null && inp.dbp != null) {
      if (inp.sbp >= 160 || inp.dbp >= 100) r3.push('Huyết áp ' + inp.sbp + '/' + inp.dbp + ' mmHg cao hơn ngưỡng tham khảo (≥160/100).');
      else if (inp.sbp >= 140 || inp.dbp >= 90) r2.push('Huyết áp ' + inp.sbp + '/' + inp.dbp + ' mmHg ở mức cần lưu ý (≥140/90).');
      else if (inp.sbp < 90 || inp.dbp < 60) r2.push('Huyết áp ' + inp.sbp + '/' + inp.dbp + ' mmHg thấp hơn thông thường.');
    }
    if (inp.rhr != null) {
      if (inp.rhr > 110 || inp.rhr < 40) r3.push('Nhịp tim nghỉ ' + inp.rhr + ' bpm nằm ngoài khoảng tham khảo (40–110).');
      else if (inp.rhr > 100) r2.push('Nhịp tim nghỉ ' + inp.rhr + ' bpm hơi cao (>100).');
    }
    if (inp.bmi != null) {
      if (inp.bmi >= 35 || inp.bmi < 16) r3.push('BMI ' + inp.bmi + ' nằm ngoài khoảng tham khảo an toàn để tự tập cường độ cao.');
      else if (inp.bmi >= 30 || inp.bmi < 17) r2.push('BMI ' + inp.bmi + ' – nên ưu tiên bài ít va đập.');
    }
    if (inp.age != null && inp.age >= 60) r2.push('Từ 60 tuổi nên ưu tiên cường độ nhẹ – vừa.');
    if (s.pain) r2.push('Bạn báo đang đau cơ/khớp – giảm cường độ, tránh bài gây đau.');
    if (s.fatigue) r2.push('Bạn báo mệt nhiều – hạ tải để phục hồi.');
    var level = r3.length ? 3 : r2.length ? 2 : 1;
    if (level >= 2 && (s.pain || s.fatigue)) { tags.impact = 1; tags.intense = 1; }
    if (level === 2) { tags.impact = 1; tags.intense = 1; }
    if (level === 3) { ['impact', 'intense', 'overhead', 'spine', 'shoulder', 'knee', 'wrist'].forEach(function (t) { tags[t] = 1; }); }   // chỉ còn bài nhẹ, ít tải
    var titles = { 1: 'Mức 1 – Tiến bộ tốt', 2: 'Mức 2 – Mức lưu ý', 3: 'Mức 3 – Cảnh báo cao' };
    var advice = {
      1: 'Duy trì lịch hiện tại và có thể tăng tải từ từ nếu bạn thấy ổn. Tiếp tục theo dõi tiến độ.',
      2: 'Hệ thống giảm cường độ và thay các bài tải trọng/va đập cao bằng bài phù hợp hơn. Hãy lắng nghe cơ thể.',
      3: 'DISCI không gợi ý bài tập nặng. Hãy tạm dừng hoạt động không phù hợp và tham khảo bác sĩ trước khi tập tiếp. Không đề xuất thực phẩm bổ sung trong tình huống này.'
    };
    return { level: level, title: titles[level], reasons: level === 3 ? r3.concat(r2) : level === 2 ? r2 : ['Chưa có dấu hiệu cần lưu ý theo các tham số tham khảo.'], advice: advice[level], tags: Object.keys(tags),
      disclaimer: 'Chỉ mang tính tham khảo, không phải chẩn đoán y tế. Khuyến cáo của bác sĩ luôn được ưu tiên.' };
  }

  /* ---------- 4. Chọn bài & thay bài ---------- */
  function ctxFrom(profile, risk) {
    var eq = {}; (profile.equip || []).forEach(function (k) { eq[k] = 1; }); eq.none = 1; eq.mat = 1;
    var ul = profile.level || (profile.activity >= 3 ? 2 : 1); if (risk.level >= 2) ul = Math.min(ul, 2); if (risk.level >= 3) ul = 1;
    return { equip: eq, tags: risk.tags || [], quiet: !!profile.quiet || profile.place === 'dorm', maxLevel: ul, riskLevel: risk.level };
  }
  function allowed(ex, ctx) {
    if (ex.level > ctx.maxLevel) return false;
    for (var i = 0; i < ex.equip.length; i++) if (!ctx.equip[ex.equip[i]]) return false;
    for (var j = 0; j < ex.tags.length; j++) if (ctx.tags.indexOf(ex.tags[j]) >= 0) return false;
    if (ctx.quiet && !ex.quiet) return false;
    return true;
  }
  function replacement(ex, ctx) {
    var cur = ex, guard = 0;
    while (cur.rep && guard++ < 4) { cur = D.exById(cur.rep); if (cur && allowed(cur, ctx)) return cur; if (!cur) break; }
    var alts = D.EXERCISES.filter(function (e) { return e.cat === ex.cat && e.id !== ex.id && allowed(e, ctx); }).sort(function (a, b) { return a.level - b.level; });
    if (alts.length) return alts[0];
    if (ex.cat !== 'gian') { var g = D.EXERCISES.filter(function (e) { return e.cat === 'gian' && allowed(e, ctx); }); if (g.length) return g[0]; }
    return null;
  }
  function exMinutes(e) { return e.kind === 'time' ? e.sets * (e.amt + e.rest) / 60 : e.sets * (e.amt * 3 + e.rest) / 60; }
  function dayMinutes(exs) { return Math.round(8 + exs.reduce(function (s, e) { return s + exMinutes(e); }, 0)); }   // 5' khởi động + 3' giãn
  function mkEntry(ex, goal, riskLevel) {
    var sets = ex.sets, amt = ex.amt, rest = ex.rest;
    if (ex.kind === 'reps') {
      if (goal === 'fatloss') { amt += 3; rest = Math.max(30, rest - 15); }
      else if (goal === 'endurance') { amt += 5; rest = Math.max(30, rest - 15); }
      else if (goal === 'muscle') { amt = Math.min(amt, 12); }
    } else if (ex.cat === 'cardio' && (goal === 'fatloss' || goal === 'endurance')) { amt = Math.round(amt * 1.3); }
    if (riskLevel === 2) { sets = Math.max(2, sets - 1); rest += 15; }
    return { id: ex.id, sets: sets, amt: amt, rest: rest, kind: ex.kind };
  }

  /* ---------- 5. Weekly Schedule Generator ---------- */
  var DAY_SLOTS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  var FOCUS_SEQ = {
    fatloss:   { 2: ['full', 'cardio'], 3: ['full', 'cardio', 'full'], 4: ['upper', 'cardio', 'lower', 'cardio'], 5: ['upper', 'cardio', 'lower', 'full', 'cardio'], 6: ['upper', 'cardio', 'lower', 'cardio', 'full', 'mobility'] },
    muscle:    { 2: ['full', 'full'], 3: ['full', 'full', 'core'], 4: ['upper', 'lower', 'upper', 'lower'], 5: ['upper', 'lower', 'cardio', 'upper', 'lower'], 6: ['upper', 'lower', 'core', 'upper', 'lower', 'mobility'] },
    endurance: { 2: ['cardio', 'full'], 3: ['cardio', 'full', 'cardio'], 4: ['cardio', 'full', 'cardio', 'core'], 5: ['cardio', 'full', 'cardio', 'lower', 'cardio'], 6: ['cardio', 'full', 'cardio', 'lower', 'cardio', 'mobility'] },
    health:    { 2: ['full', 'cardio'], 3: ['full', 'cardio', 'core'], 4: ['full', 'cardio', 'core', 'full'], 5: ['full', 'cardio', 'core', 'full', 'mobility'], 6: ['full', 'cardio', 'core', 'full', 'cardio', 'mobility'] }
  };
  var FOCUS_CATS = {
    upper: ['nguc', 'lung', 'vai', 'tay', 'bung'], lower: ['chan', 'chan', 'chan', 'bung', 'gian'], full: ['chan', 'nguc', 'lung', 'chan', 'bung', 'vai'],
    cardio: ['cardio', 'cardio', 'bung', 'gian'], core: ['bung', 'bung', 'bung', 'gian', 'gian'], mobility: ['gian', 'gian', 'gian', 'gian', 'gian'],
    light: ['cardio', 'gian', 'gian', 'gian']
  };
  var FOCUS_TITLE = { upper: 'Thân trên', lower: 'Thân dưới', full: 'Toàn thân', cardio: 'Cardio nhẹ – vừa', core: 'Cơ lõi & giãn cơ', mobility: 'Giãn cơ & phục hồi', light: 'Vận động nhẹ & giãn cơ' };
  var FOCUS_GOALTXT = { upper: 'Ngực, lưng, vai, tay', lower: 'Đùi, mông, bắp chân', full: 'Toàn thân', cardio: 'Tim phổi', core: 'Bụng, lưng dưới', mobility: 'Linh hoạt, phục hồi', light: 'Vận động nhẹ' };

  function pickForFocus(focus, ctx, goal, riskLevel, seed, minutes) {
    var cats = FOCUS_CATS[focus], used = {}, out = [], budget = Math.max(15, minutes - 8), spent = 0;
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var pool = D.EXERCISES.filter(function (e) { return e.cat === cat && !used[e.id] && allowed(e, ctx); }).sort(function (a, b) { return b.level - a.level || (a.id < b.id ? -1 : 1); });
      if (!pool.length) continue;
      var pref = pool.filter(function (e) { return e.level <= ctx.maxLevel; });
      var ex = pref[(seed + i) % pref.length];
      var ent = mkEntry(ex, goal, riskLevel), m = exMinutes(ent);
      if (spent + m > budget && out.length >= 2) continue;
      out.push(ent); used[ex.id] = 1; spent += m;
    }
    // lượt 2: bổ sung bài (khác bài đã chọn) cho đến khi gần đủ thời lượng người dùng chọn
    for (var pass = 0; pass < 3 && spent < budget - 4 && focus !== 'mobility'; pass++) {
      for (var j = 0; j < cats.length && spent < budget - 4; j++) {
        var c2 = cats[j] === 'gian' ? null : cats[j]; if (!c2) continue;
        var pool2 = D.EXERCISES.filter(function (e) { return e.cat === c2 && !used[e.id] && allowed(e, ctx); });
        if (!pool2.length) continue;
        var ex2 = pool2[(seed + j + pass) % pool2.length], ent2 = mkEntry(ex2, goal, riskLevel), m2 = exMinutes(ent2);
        if (spent + m2 > budget + 3) continue;
        out.splice(Math.max(0, out.length - (cats.indexOf('gian') >= 0 ? 1 : 0)), 0, ent2); used[ex2.id] = 1; spent += m2;
      }
    }
    if (out.length < 2) { // đảm bảo tối thiểu 2 bài
      var any = D.EXERCISES.filter(function (e) { return allowed(e, ctx) && !used[e.id]; }).slice(0, 3);
      any.forEach(function (e) { if (out.length < 3) out.push(mkEntry(e, goal, riskLevel)); });
    }
    return out;
  }

  function generatePlan(profile, risk, now) {
    profile = profile || {}; risk = risk || { level: 1, tags: [], reasons: [] };
    var goal = profile.goal || 'health';
    var days = Math.min(6, Math.max(2, +profile.daysPerWeek || 3));
    var minutes = Math.min(90, Math.max(15, +profile.minutes || 40));
    var ctx = ctxFrom(profile, risk), reasons = [], seq, slots;
    if (risk.level === 3) { days = Math.min(days, 4); seq = []; for (var k = 0; k < days; k++) seq.push(k % 2 ? 'mobility' : 'light'); minutes = Math.min(minutes, 30); }
    else seq = FOCUS_SEQ[goal][days];
    slots = DAY_SLOTS[days];
    var plan = { id: 'p' + (now || Date.now()), createdAt: now || Date.now(), version: 1, level: risk.level, goal: goal, daysPerWeek: days, minutes: minutes, quiet: ctx.quiet, days: [] };
    for (var d = 0; d < 7; d++) {
      var idx = slots.indexOf(d);
      if (idx < 0) { plan.days.push({ dow: d, type: 'rest', title: 'Ngày nghỉ', focus: 'rest', exs: [], minutes: 0 }); continue; }
      var f = seq[idx], exs = pickForFocus(f, ctx, goal, risk.level, idx + d, minutes);
      plan.days.push({ dow: d, type: 'workout', title: FOCUS_TITLE[f], focus: f, target: FOCUS_GOALTXT[f], exs: exs, minutes: dayMinutes(exs) });
    }
    reasons.push('Mục tiêu "' + D.GOALS[goal] + '": ' + (goal === 'fatloss' ? 'tăng số lần lặp, nghỉ ngắn hơn và thêm cardio.' : goal === 'muscle' ? 'ưu tiên bài sức mạnh 8–12 lần lặp, nghỉ đủ để cơ phục hồi.' : goal === 'endurance' ? 'nhiều cardio và lặp cao, nghỉ ngắn.' : 'cân bằng sức mạnh, tim phổi và giãn cơ.'));
    reasons.push(days + ' buổi/tuần, mỗi buổi khoảng ' + minutes + ' phút; các buổi cách nhau để cơ có thời gian phục hồi.');
    if (ctx.quiet) reasons.push('Chế độ phòng nhỏ/ít ồn: chỉ chọn bài êm, không nhảy, không dậm mạnh.');
    var eqNames = Object.keys(ctx.equip).filter(function (k) { return k !== 'none' && k !== 'mat'; }).map(function (k) { return D.EQUIP[k]; });
    reasons.push(eqNames.length ? 'Dụng cụ hiện có: ' + eqNames.join(', ') + '.' : 'Bạn chưa có dụng cụ nên lịch dùng bài tập thân người.');
    if (risk.level === 2) reasons.push('Mức lưu ý: giảm 1 hiệp, tăng nghỉ 15 giây, loại bài va đập/tải trọng cao.');
    if (risk.level === 3) reasons.push('Cảnh báo cao: chỉ vận động nhẹ và giãn cơ. Hãy tham khảo bác sĩ trước khi tập nặng hơn.');
    plan.reasons = reasons; return plan;
  }

  /* ---------- 6. Exercise Replacement (thích ứng khi cập nhật thể trạng) ---------- */
  function adaptPlan(plan, profile, risk, now) {
    var ctx = ctxFrom(profile, risk), changes = [];
    if (risk.level === 3 && plan.level !== 3) {
      var np3 = generatePlan(profile, risk, now);
      changes.push({ from: 'Lịch cũ (' + plan.daysPerWeek + ' buổi/tuần)', to: 'Lịch nhẹ ' + np3.daysPerWeek + ' buổi/tuần', why: 'Cảnh báo mức 3: chỉ vận động nhẹ, giãn cơ và tham khảo bác sĩ.', benefit: 'Giảm rủi ro khi chỉ số/khuyến cáo chưa an toàn.' });
      return { plan: np3, changes: changes };
    }
    var np = JSON.parse(JSON.stringify(plan)); np.id = 'p' + (now || Date.now()); np.createdAt = now || Date.now(); np.version = (plan.version || 1) + 1; np.level = risk.level; np.quiet = ctx.quiet;
    np.days.forEach(function (day) {
      var kept = [];
      day.exs.forEach(function (e) {
        var ex = D.exById(e.id);
        if (!ex) return;
        if (!allowed(ex, ctx)) {
          var rep = replacement(ex, ctx);
          if (rep) {
            var ne = mkEntry(rep, np.goal, risk.level);
            changes.push({ day: DOW_LABEL[day.dow], from: ex.name, to: rep.name, why: whyReplace(ex, ctx), benefit: rep.warn || 'Ít tải lên các khớp/hệ tim mạch hơn, vẫn tác động nhóm cơ tương tự.' });
            kept.push(ne);
          } else changes.push({ day: DOW_LABEL[day.dow], from: ex.name, to: '(bỏ bài)', why: whyReplace(ex, ctx), benefit: 'Không có bài thay thế an toàn trong dụng cụ hiện có.' });
        } else if (risk.level === 2 && plan.level !== 2 && e.sets > 2) {
          kept.push(Object.assign({}, e, { sets: e.sets - 1, rest: e.rest + 15 }));
          changes.push({ day: DOW_LABEL[day.dow], from: ex.name + ' ' + e.sets + ' hiệp', to: ex.name + ' ' + (e.sets - 1) + ' hiệp', why: 'Mức lưu ý: giảm cường độ.', benefit: 'Phục hồi tốt hơn.' });
        } else kept.push(e);
      });
      // loại trùng lặp do thay thế
      var seen = {}; day.exs = kept.filter(function (e) { if (seen[e.id]) return false; seen[e.id] = 1; return true; });
      if (day.type === 'workout') day.minutes = dayMinutes(day.exs);
    });
    return { plan: np, changes: changes };
  }
  function whyReplace(ex, ctx) {
    if (ex.tags.indexOf('knee') >= 0 && ctx.tags.indexOf('knee') >= 0) return 'Giảm tải cho khớp gối.';
    if (ex.tags.indexOf('impact') >= 0 && ctx.tags.indexOf('impact') >= 0) return 'Giảm va đập mạnh theo mức cảnh báo/khuyến cáo.';
    if (ex.tags.indexOf('spine') >= 0 && ctx.tags.indexOf('spine') >= 0) return 'Giảm tải cho cột sống.';
    if ((ex.tags.indexOf('shoulder') >= 0 || ex.tags.indexOf('overhead') >= 0) && (ctx.tags.indexOf('shoulder') >= 0 || ctx.tags.indexOf('overhead') >= 0)) return 'Giảm tải cho khớp vai.';
    if (ex.tags.indexOf('wrist') >= 0 && ctx.tags.indexOf('wrist') >= 0) return 'Giảm tải cho cổ tay.';
    if (ex.tags.indexOf('intense') >= 0 && ctx.tags.indexOf('intense') >= 0) return 'Giảm cường độ tim mạch.';
    if (ctx.quiet && !ex.quiet) return 'Chế độ phòng nhỏ/ít ồn.';
    if (ex.level > ctx.maxLevel) return 'Bài vượt mức độ phù hợp hiện tại.';
    return 'Bạn không có dụng cụ cần thiết.';
  }

  /* ---------- Phiên tập & calo ---------- */
  function sessionCalories(weight, exEntries, minutes) {
    var mets = (exEntries || []).map(function (e) { var x = D.exById(e.id || e); return x ? x.met : 4; });
    var avg = mets.length ? mets.reduce(function (a, b) { return a + b; }, 0) / mets.length : 4;
    return Math.round(avg * (weight || 60) * (minutes || 0) / 60);
  }
  function streakOf(sessions, today) {
    var set = {}; sessions.forEach(function (s) { if (s.status === 'done') set[s.date] = 1; });
    var cur = 0, d = set[today] ? today : addDays(today, -1);
    while (set[d]) { cur++; d = addDays(d, -1); }
    var dates = Object.keys(set).sort(), best = 0, run = 0, prev = null;
    dates.forEach(function (x) { run = (prev && diffDays(x, prev) === 1) ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    return { current: cur, best: best };
  }

  /* ---------- Xử lý khi bỏ buổi tập ---------- */
  var CONFLICT = { upper: ['upper', 'full'], lower: ['lower', 'full'], full: ['upper', 'lower', 'full'], cardio: [], core: ['core'], mobility: [], light: [] };
  function handleMissed(plan, missedDate, today) {
    var wd = dow(missedDate), day = plan.days[wd];
    if (!day || day.type !== 'workout') return null;
    var ws = weekStart(missedDate), opts = [], bad = CONFLICT[day.focus] || [];
    for (var i = 1; i < 7; i++) {
      var t = addDays(missedDate, i);
      if (weekStart(t) !== ws || t < today) continue;
      var td = plan.days[dow(t)];
      if (!td || td.type !== 'rest') continue;
      var prev = plan.days[dow(t) - 1], next = plan.days[dow(t) + 1];
      var clash = [prev, next].some(function (n) { return n && n.type === 'workout' && bad.indexOf(n.focus) >= 0; });
      if (!clash) { opts.push({ type: 'move', toDate: t, why: 'Chuyển sang ' + DOW_LABEL[dow(t)] + ' (ngày nghỉ), không sát buổi tập cùng nhóm cơ nên vẫn đủ thời gian phục hồi.' }); break; }
    }
    opts.push({ type: 'skip', why: 'Bỏ qua buổi này và tiếp tục lịch từ buổi kế tiếp. DISCI không dồn bài tập vào ngày liền sau để tránh quá tải.' });
    return { date: missedDate, title: day.title, options: opts, recommended: opts[0].type };
  }

  /* ---------- 7. Progress Analyzer ---------- */
  function analyzeProgress(o) {
    var sessions = (o.sessions || []).filter(function (s) { return s.status === 'done'; }), today = o.today, metrics = (o.metrics || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var total = sessions.length, minutes = sessions.reduce(function (s, x) { return s + (x.minutes || 0); }, 0), cal = sessions.reduce(function (s, x) { return s + (x.calories || 0); }, 0);
    var st = streakOf(o.sessions || [], today), weeks = [], w0 = weekStart(today);
    for (var i = 7; i >= 0; i--) {
      var ws = addDays(w0, -7 * i), we = addDays(ws, 6), ss = sessions.filter(function (s) { return s.date >= ws && s.date <= we; });
      weeks.push({ start: ws, sessions: ss.length, minutes: ss.reduce(function (a, b) { return a + (b.minutes || 0); }, 0), planned: o.plan ? o.plan.daysPerWeek : 0, rpe: avg(ss.map(function (s) { return s.rpe; })) });
    }
    var cur = weeks[7], rate = cur.planned ? Math.min(100, Math.round(cur.sessions / cur.planned * 100)) : 0;
    var last = metrics.length ? metrics[metrics.length - 1] : null, first = metrics.length ? metrics[0] : null, slope = null;
    var recent = metrics.filter(function (m) { return m.weight && diffDays(today, m.date) <= 28; });
    if (recent.length >= 2) { var a = recent[0], b = recent[recent.length - 1], dd = diffDays(b.date, a.date); if (dd > 0) slope = round1((b.weight - a.weight) / dd * 7); }
    var goalW = o.goalWeight || null, gap = (goalW && last && last.weight) ? round1(last.weight - goalW) : null;
    var plannedSoFar = o.plan ? o.plan.days.filter(function (d) { return d.type === 'workout' && addDays(w0, d.dow) < today; }).length : 0;
    var doneSoFar = sessions.filter(function (s) { return s.date >= w0 && s.date < today; }).length;
    var tips = [], status = 'good', level = o.riskLevel || 1;
    if (level === 3) { status = 'high'; tips.push('Đang ở mức cảnh báo cao – ưu tiên nghỉ ngơi và tham khảo bác sĩ trước khi tăng tải.'); }
    else if (level === 2) { status = 'watch'; tips.push('Đang ở mức lưu ý – giữ cường độ nhẹ cho đến khi các chỉ số ổn.'); }
    else if (plannedSoFar > 0 && doneSoFar < plannedSoFar) { status = 'watch'; tips.push('Tuần này bạn đã bỏ ' + (plannedSoFar - doneSoFar) + ' buổi. Hãy xem đề xuất điều chỉnh, không dồn bài.'); }
    else if (rate >= 80 && total >= 6) tips.push('Bạn duy trì lịch rất tốt. Có thể tăng tải nhẹ (thêm 1–2 lần lặp hoặc 1 hiệp) nếu cơ thể thấy ổn.');
    else if (total === 0) tips.push('Hãy hoàn thành buổi đầu tiên để bắt đầu theo dõi tiến độ.');
    else tips.push('Tiếp tục đều đặn; tiến bộ đến từ sự ổn định chứ không phải một buổi thật nặng.');
    if (slope != null && o.goal === 'fatloss' && slope < -1) tips.push('Cân nặng giảm nhanh hơn 1 kg/tuần. Hãy cân nhắc ăn đủ năng lượng và nghỉ ngơi.');
    var avgRpe = avg(sessions.slice(-6).map(function (s) { return s.rpe; })); if (avgRpe && avgRpe >= 9) tips.push('Mức nỗ lực gần đây rất cao (RPE ≥ 9). Nên giảm tải một buổi để phục hồi.');
    return { total: total, minutes: minutes, calories: cal, streak: st.current, bestStreak: st.best, weeks: weeks, completionRate: rate, weightFirst: first && first.weight, weightLast: last && last.weight, weightDelta: first && last && first.weight && last.weight ? round1(last.weight - first.weight) : null,
      slopePerWeek: slope, goalGap: gap, status: status, tips: tips };
  }
  function avg(a) { a = a.filter(function (x) { return x != null && !isNaN(x); }); return a.length ? round1(a.reduce(function (s, x) { return s + x; }, 0) / a.length) : null; }
  function evalBadges(st) {
    return D.BADGES.map(function (b) {
      var m = b.test.match(/(\w+)(>=)?(\d+)?/), v = st[m[1]], ok = m[2] ? (v || 0) >= +m[3] : !!v;
      return { id: b.id, name: b.name, icon: b.icon, earned: ok };
    });
  }

  /* ---------- 8. Product Recommendation ---------- */
  var SP = { small: 1, medium: 2, large: 3 };
  function recommendProducts(c) {
    c = c || {}; var owned = {}; (c.equip || []).forEach(function (k) { owned[k] = 1; });
    var budget = c.budget || 1000000, ctx = ctxFrom({ equip: c.equip, level: c.level, activity: c.activity, quiet: c.quiet, place: c.place }, { level: c.riskLevel || 1, tags: c.tags || [] });
    var out = [];
    D.PRODUCTS.forEach(function (p) {
      if (p.custom) return; /* sản phẩm do quản trị thêm chỉ nằm ở mục Sản phẩm chung, không đưa vào gợi ý cá nhân */
      if (p.unlocks && owned[p.unlocks]) return;
      if (p.cat === 'supp' && (c.riskLevel || 1) >= 3) return;
      if (p.price > budget) return;
      var cnt = 0;
      if (p.unlocks) { var ctx2 = JSON.parse(JSON.stringify(ctx)); ctx2.equip[p.unlocks] = 1; ctx2.equip.none = 1; cnt = D.EXERCISES.filter(function (e) { return e.equip.indexOf(p.unlocks) >= 0 && allowed(e, ctx2); }).length; if (!cnt && p.unlocks !== 'mat') return; }
      var sc = (p.goals.indexOf(c.goal) >= 0 ? 3 : 0) + (p.prio === 'essential' ? 3 : p.prio === 'consider' ? 1.5 : 0) + Math.min(cnt, 8) / 2;
      var spacePen = (SP[p.space] || 1) > (SP[c.space || 'small'] || 1) ? 5 : 0;
      sc = sc - spacePen - p.price / budget * 3;
      if (p.cat === 'supp') sc -= 1;
      var why = [];
      if (p.unlocks && cnt) why.push('mở khóa ' + cnt + ' bài tập phù hợp với hồ sơ của bạn');
      if (p.goals.indexOf(c.goal) >= 0) why.push('hỗ trợ mục tiêu "' + D.GOALS[c.goal] + '"');
      if ((SP[p.space] || 1) <= (SP[c.space || 'small'] || 1)) why.push(p.space === 'small' ? 'gọn, phù hợp không gian nhỏ' : 'vừa với không gian của bạn');
      why.push('giá ' + money(p.price) + (p.price <= budget * 0.3 ? ' – thấp so với ngân sách ' + money(budget) : ' trong ngân sách ' + money(budget)));
      out.push({ product: p, score: round1(sc), reason: capital(why.join('; ')) + '.' });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function buildStarterKit(recs, budget) {
    var kit = [], sum = 0;
    recs.filter(function (r) { return r.product.cat !== 'supp'; }).forEach(function (r) { if (sum + r.product.price <= budget && kit.length < 4 && r.score > 0) { kit.push(r.product); sum += r.product.price; } });
    return { items: kit, total: sum };
  }
  function costVsGym(homeCost, months, gymMonthly) { gymMonthly = gymMonthly || 350000; var gym = gymMonthly * months; return { home: homeCost, gym: gym, saving: gym - homeCost, breakEvenMonths: gymMonthly ? Math.ceil(homeCost / gymMonthly * 10) / 10 : null }; }

  /* ---------- 9. Nutrition ---------- */
  function planMenu(targetKcal, seed) {
    var split = { sang: 0.25, trua: 0.35, toi: 0.30 }, picks = [], total = { kcal: 0, protein: 0, cost: 0 };
    ['sang', 'trua', 'toi'].forEach(function (slot, i) {
      var tk = targetKcal * split[slot], pool = D.MEALS.filter(function (m) { return m.slot === slot; }).sort(function (a, b) { return Math.abs(a.kcal - tk) - Math.abs(b.kcal - tk); }).slice(0, 3);
      var m = pool[((seed || 0) + i) % pool.length]; picks.push(m);
    });
    var rem = targetKcal - picks.reduce(function (s, m) { return s + m.kcal; }, 0), snacks = D.MEALS.filter(function (m) { return m.slot === 'phu'; }).sort(function (a, b) { return b.protein / b.kcal - a.protein / a.kcal; });
    var k = 0; while (rem > 80 && k < 2) { var s = snacks[(seed || 0) % snacks.length + k] || snacks[k]; if (!s || s.kcal > rem + 60) break; picks.push(s); rem -= s.kcal; k++; }
    picks.forEach(function (m) { total.kcal += m.kcal; total.protein += m.protein; total.cost += m.cost; });
    return { meals: picks, total: total };
  }
  function nutritionAdvice(p, risk) {
    if (risk.level >= 3) return { blocked: true, reason: 'Đang ở mức cảnh báo cao – DISCI không gợi ý chế độ ăn. Hãy tham khảo bác sĩ/chuyên gia dinh dưỡng.' };
    if (!(p.weight > 0 && p.height > 0 && p.age > 0)) return { blocked: true, reason: 'Chưa đủ thông tin (cân nặng, chiều cao, tuổi) để ước tính năng lượng an toàn.' };
    var td = tdee(p.sex, p.weight, p.height, p.age, p.activity), kc = targetCalories(td, p.goal, p.sex);
    return { blocked: false, bmr: bmr(p.sex, p.weight, p.height, p.age), tdee: td, kcal: kc, protein: proteinTarget(p.weight, p.goal) };
  }

  var E = { todayStr: todayStr, addDays: addDays, dow: dow, weekStart: weekStart, diffDays: diffDays, DOW_LABEL: DOW_LABEL, greeting: greeting, money: money, round1: round1,
    bmi: bmi, bmiCategory: bmiCategory, bmr: bmr, tdee: tdee, targetCalories: targetCalories, proteinTarget: proteinTarget,
    parseBP: parseBP, assessRisk: assessRisk, RESTRICT_MAP: RESTRICT_MAP, allowed: allowed, ctxFrom: ctxFrom, replacement: replacement,
    generatePlan: generatePlan, adaptPlan: adaptPlan, dayMinutes: dayMinutes, mkEntry: mkEntry, exMinutes: exMinutes, sessionCalories: sessionCalories, streakOf: streakOf, handleMissed: handleMissed,
    analyzeProgress: analyzeProgress, evalBadges: evalBadges, recommendProducts: recommendProducts, buildStarterKit: buildStarterKit, costVsGym: costVsGym, planMenu: planMenu, nutritionAdvice: nutritionAdvice };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.DISCI_ENGINE = E;
})(typeof window !== 'undefined' ? window : globalThis);
