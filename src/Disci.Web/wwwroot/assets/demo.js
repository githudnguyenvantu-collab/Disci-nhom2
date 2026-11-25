/* =====================================================================
   DISCI DEMO – 50 tài khoản DEMO + dữ liệu mẫu + Demo Data Center + Mô phỏng theo kịch bản
   • Mọi bản ghi tạo ở đây có demo:true (mô phỏng có thêm sim:true) và KHÔNG bao giờ ghi vào dữ liệu người dùng thật.
   • Xóa/làm mới/đặt lại chỉ tác động bản ghi có cờ demo/sim.
   ===================================================================== */
(function (root) {
  'use strict';
  var D = root.DISCI_DATA, E = root.DISCI_ENGINE, ST = root.DISCI.store, PL = root.DISCI.plat;
  var TOPICS = ['Hành trình', 'Kỹ thuật', 'Dinh dưỡng', 'Thành tích', 'Thảo luận'];

  /* ---------- PRNG có hạt giống (tạo lại được cùng một bộ dữ liệu) ---------- */
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mk(seed) {
    var r = rng(seed);
    var o = { r: r, int: function (a, b) { return a + Math.floor(r() * (b - a + 1)); }, pick: function (arr) { return arr[Math.floor(r() * arr.length)]; }, chance: function (p) { return r() < p; },
      shuffle: function (arr) { var a = arr.slice(), i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; } };
    return o;
  }
  function slug(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); }
  function fill(t, R) { return t.replace(/\{(\w)\}/g, function (_, k) { return ({ n: R.int(2, 12), k: R.int(1, 6), m: R.int(20, 45), c: R.int(30, 55), s: R.int(45, 120), w: R.int(48, 72) })[k]; }); }

  var HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
  var DEM_M = ['Văn', 'Quốc', 'Minh', 'Hữu', 'Đức', 'Gia', 'Anh', 'Tuấn'], DEM_F = ['Thị', 'Thu', 'Ngọc', 'Khánh', 'Bảo', 'Mai', 'Phương', 'Hà'];
  var TEN_M = ['Khang', 'Bảo', 'Đức', 'Long', 'Nam', 'Huy', 'Phúc', 'Sơn', 'Tùng', 'Hiếu', 'Dũng', 'Kiên', 'Quân', 'Thịnh', 'Tài', 'Vinh', 'Hải', 'Trung', 'Lâm', 'Khoa', 'Việt', 'Phong'];
  var TEN_F = ['Linh', 'Hà', 'Yến', 'Trang', 'Hương', 'Thảo', 'Nhi', 'My', 'Vy', 'Anh', 'Châu', 'Ngân', 'Quỳnh', 'Trâm', 'Uyên', 'Hạnh', 'Mai', 'Lan', 'Chi', 'Nga', 'Thùy', 'Phương'];
  var CITY = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế', 'Vinh', 'Nha Trang', 'Đà Lạt', 'Biên Hòa', 'Thanh Hóa', 'Quy Nhơn'];
  var JOB = ['Sinh viên', 'Nhân viên văn phòng', 'Lập trình viên', 'Giáo viên', 'Kế toán', 'Freelancer', 'Thiết kế đồ họa', 'Điều dưỡng', 'Nhân viên bán hàng', 'Sinh viên năm cuối'];
  var BIO = {
    fatloss: ['Đang giảm mỡ bền vững, không ăn kiêng cực đoan.', 'Mục tiêu: nhẹ người, khỏe hơn mỗi tuần.', 'Ăn đủ – tập đều – ngủ sớm.'],
    muscle: ['Tập tạ tại nhà, theo đuổi tăng cơ từ từ.', 'Thích bài tập thân dưới và core.', 'Tăng cơ cho người gầy – kiên nhẫn là chìa khóa.'],
    endurance: ['Mê chạy bộ buổi sáng và đạp xe cuối tuần.', 'Đang tăng sức bền cho giải 5K đầu tiên.', 'Cardio nhẹ mỗi ngày, vui là chính.'],
    health: ['Tập để khỏe và tỉnh táo khi ngồi làm việc cả ngày.', 'Giãn cơ, yoga nhẹ và đi bộ mỗi tối.', 'Giữ thói quen vận động 30 phút mỗi ngày.']
  };
  var POSTS = {
    'Hành trình': ['Tuần thứ {n} tập tại nhà với dây kháng lực. Người nhẹ hơn {k}kg, quan trọng hơn là ngủ ngon và bớt mệt!', 'Hôm nay là buổi thứ {n} của mình. Chưa bao giờ nghĩ mình duy trì được đến lúc này 😅', 'Dậy sớm 5h30 tập {m} phút trước giờ đi làm. Khó ở phút đầu, xong là cả ngày nhẹ người.', 'Mới bắt đầu {n} tuần, mỗi ngày chỉ {m} phút thôi nhưng đều. Ai cũng từng là người mới mà!', 'Ký túc xá chật nên mình tập các bài êm, không nhảy. Tuần này đủ {n} buổi rồi nè.', 'Lỡ bỏ 2 buổi vì đi công tác, hôm nay quay lại tập nhẹ. Không dồn bài, không tự trách mình.'],
    'Kỹ thuật': ['Mọi người hay bị võng lưng khi plank không? Mình siết bụng và hơi nhíu mông là đỡ hẳn.', 'Mẹo squat: dồn trọng tâm vào gót chân, gối thẳng hướng mũi chân, hạ chậm 3 giây.', 'Hít đất quỳ gối có phải “ăn gian” không? Mình nghĩ là không, miễn đúng form và đủ số lần.', 'Khởi động 5 phút xoay khớp vai/hông/gối giúp mình hết đau gối sau buổi tập chân.', 'Hỏi: nghỉ bao lâu giữa các hiệp khi tập với tạ 5kg? Mình đang nghỉ 60 giây.', 'Lunge mà gối trước vượt mũi chân thì mình thấy đau, giờ bước dài hơn là ổn.'],
    'Dinh dưỡng': ['Meal prep món Việt cho 3 ngày: ức gà áp chảo, rau muống, cơm gạo lứt. Khoảng {c}k/bữa.', 'Phở gà bỏ bớt bánh, thêm rau và 1 quả trứng — đủ đạm mà no lâu.', 'Thử thay trà sữa bằng trà chanh không đường, tháng này tiết kiệm được {c}k mà người nhẹ hơn.', 'Sinh viên ăn gì để đủ đạm mà rẻ? Mình hay dùng đậu hũ, trứng và cá hộp.', 'Bữa sáng bánh mì trứng + dưa leo ~420 kcal, quen thuộc và rẻ.', 'Uống đủ 2 lít nước mỗi ngày giúp mình bớt thèm ăn vặt thấy rõ.'],
    'Thành tích': ['Hoàn thành chuỗi {n} ngày liên tiếp! Cảm ơn mọi người đã động viên 💪', 'Cân nặng chạm {w}kg — mục tiêu tháng này xong rồi!', 'Lần đầu plank được {s} giây liền, tháng trước chỉ 20 giây thôi.', 'Mở khóa huy hiệu “Chuỗi 7 ngày” 🔥', 'Vừa chạy xong {k}km đầu tiên không nghỉ!', 'Đủ {n} buổi tập trong tháng này. Nhỏ thôi nhưng là của mình.'],
    'Thảo luận': ['Mọi người tập buổi sáng hay buổi tối? Mình thấy tập tối thì khó ngủ hơn.', 'Hôm trước còn đau cơ thì có nên tập tiếp? Mình thường tập nhẹ + giãn cơ.', 'Gợi ý playlist tập ở nhà với? Mình chán nhạc cũ rồi.', 'Ai đang tập một mình ở nhà giống mình không? Lập nhóm nhắc nhau nhé.', 'Dụng cụ đầu tiên nên mua: dây kháng lực hay tạ tay? Ngân sách khoảng 200k.']
  };
  var ART = { 'Hành trình': [['TUẦN {n}', 'Hành trình tại nhà'], ['BUỔI #{n}', 'Giữ nhịp mỗi ngày']], 'Kỹ thuật': [['FORM ĐÚNG', 'Siết bụng · lưng thẳng'], ['SQUAT 5×10', 'Gối thẳng hướng mũi chân']], 'Dinh dưỡng': [['MEAL PREP', 'Món Việt ~{c}k/bữa'], ['ĂN LÀNH', 'Đủ đạm · nhiều rau']], 'Thành tích': [['CHUỖI {n} NGÀY', 'Không bỏ cuộc'], ['PLANK {s}s', 'Kỷ lục mới'], ['{k}KM ĐẦU TIÊN', 'Chạy không nghỉ']], 'Thảo luận': [['CÙNG TẬP', 'Rủ nhau giữ nhịp']] };
  var CMT = ['Quá tuyệt, cố lên bạn!', 'Cảm ơn bạn đã chia sẻ, mình sẽ thử.', 'Mình cũng bị y hệt, sau đó chỉnh lại form thì đỡ nhiều.', 'Đỉnh quá 👏', 'Cho mình xin thực đơn với bạn ơi.', 'Giữ nhịp này nhé, tuần sau lại khoe tiếp!', 'Mình tập cùng được không?', 'Có video hướng dẫn chi tiết không bạn?', 'Động lực của mình hôm nay đây rồi 🔥', 'Thử đặt dây loop quanh gối để nhắc cơ mông hoạt động nhé.', 'Nhớ khởi động kỹ và uống đủ nước nha.', 'Mình mới bắt đầu, bài này nhẹ nhàng dễ theo quá.', 'Chúc mừng bạn! Bền bỉ thật sự.', 'Mình thấy buổi sáng hiệu quả hơn, bạn thử xem.', 'Hay quá, lưu lại để tập theo.'];
  var STORY_TXT = ['Buổi sáng đầu tuần ✨', 'Xong buổi tập! 💪', 'Hôm nay ăn lành 🥗', 'Đi bộ 6.000 bước rồi', 'Giãn cơ trước khi ngủ', 'Ngày thứ {n} liên tiếp!', 'Cố lên mọi người ơi', 'Nước đủ 2 lít ✅', 'Plank {s} giây 😤', 'Chạy bộ ven sông 🌅'];
  var GROUP_DEF = [['g1', 'Tập tại nhà cho người mới', 'Bắt đầu nhẹ nhàng, không cần dụng cụ đắt tiền.'], ['g2', 'Sinh viên ký túc xá tập êm', 'Bài tập êm, ít tiếng ồn, hợp phòng nhỏ.'], ['g3', 'Ăn lành món Việt', 'Chia sẻ thực đơn món Việt đủ đạm, chi phí thấp.'], ['g4', 'Chạy bộ buổi sáng', 'Rủ nhau chạy 3–5km mỗi sáng.'], ['g5', 'Yoga & giãn cơ', 'Giãn cơ, thở và phục hồi sau buổi tập.'], ['g6', 'Tăng cơ tại nhà', 'Tăng cơ với tạ tay và dây kháng lực.'], ['g7', 'Thử thách 30 ngày', 'Cùng nhau giữ nhịp trong 30 ngày.'], ['g8', 'Dân văn phòng vận động', 'Mẹo vận động giữa giờ làm việc.']];
  var SESS_TITLES = ['Thân trên', 'Thân dưới', 'Cardio nhẹ – vừa', 'Toàn thân', 'Core & giãn cơ'];

  /* ---------- sinh người dùng ---------- */
  function genUsers(R, n) {
    var out = [], used = {}, i;
    D.DEMO_USERS.forEach(function (u, k) { used[u.name] = 1; });
    function build(id, name, base) {
      var named = !!(base && base.name), sex = base && base.sex || (R.chance(.5) ? 'male' : 'female'), goal = R.pick(['fatloss', 'muscle', 'endurance', 'health']), lv = R.pick([1, 1, 2, 2, 3]);
      var sessions = named ? base.sessions : R.int(3, 18) * lv + R.int(0, 8), streak = named ? base.streak : Math.min(sessions, R.int(0, 6 + lv * 5)), minutes = sessions * R.int(28, 45);
      var w0 = sex === 'male' ? R.int(62, 84) : R.int(46, 66), dw = goal === 'fatloss' ? -R.int(1, 5) : goal === 'muscle' ? R.int(1, 3) : -R.int(0, 2), age = R.int(18, 38), hue = R.int(0, 359);
      var weights = [], j; for (j = 7; j >= 0; j--) weights.push([j * 7, Math.round((w0 + dw * (7 - j) / 7 + (R.r() - .5) * .6) * 10) / 10]);
      var hist = [], d; for (d = 0; d < 30; d++) if (R.chance(.45)) hist.push([d, R.int(20, 55), R.int(120, 380), R.pick(SESS_TITLES)]);
      var u = { id: id, demo: true, name: name, handle: slug(name).replace(/\./g, '_'), email: slug(name) + '@demo.disci.vn', role: 'user', sex: sex, age: age, city: R.pick(CITY), job: R.pick(JOB), goal: goal, level: lv, hue: hue, avatar: '', cover: '', bio: R.pick(JOB) + ' · ' + R.pick(BIO[goal]),
        joinedAgo: R.int(10, 240), lastActiveAgo: R.int(1, 36) * 36e5, stats: { streak: streak, sessions: sessions, minutes: minutes, points: sessions * 20 + streak * 10 }, goalWeight: Math.round(w0 + dw * 1.6), hist: { sessions: hist, weights: weights }, privacy: { showProfile: true } };
      if (named) { u.stats.points = base.points; u.bio = base.name.split(' ').pop() + ' · ' + R.pick(BIO[goal]); }
      return u;
    }
    D.DEMO_USERS.forEach(function (b, k) { out.push(build(b.id, b.name, Object.assign({ sex: ['male', 'female', 'male', 'female', 'male', 'female'][k] }, b))); });
    var guard = 0; while (out.length < n && guard++ < 400) {
      var male = R.chance(.5), name = R.pick(HO) + ' ' + R.pick(male ? DEM_M : DEM_F) + ' ' + R.pick(male ? TEN_M : TEN_F);
      if (used[name]) continue; used[name] = 1; var u = build('u' + (out.length + 1), name, { sex: male ? 'male' : 'female', sessions: null }); out.push(u);
    }
    return out.slice(0, n);
  }
  function makePost(R, id, by, at, topicOverride) {
    var topic = topicOverride || R.pick(TOPICS), kind = R.r(), p = { id: id, by: by, topic: topic, text: fill(R.pick(POSTS[topic]), R), at: at, vis: 'public', demo: true };
    if (kind < .3) { var a = R.pick(ART[topic]); p.art = { h: R.int(0, 359), label: fill(a[0], R), sub: fill(a[1], R) }; }
    else if (kind < .5) { p.clip = R.pick(PL.CLIP_KEYS); p.topic = R.pick(['Hướng dẫn', 'Quá trình tập', 'Kinh nghiệm', 'Thành tích']); p.text = R.pick(['Buổi tập hôm nay – xem form giúp mình với nhé!', 'Quay lại bài cơ bản để sửa tư thế.', 'Chia sẻ bài khởi động mình hay dùng.', 'Một vòng nhỏ cho ngày bận rộn.', 'Mình tập theo nhịp này, rất dễ theo.']); }
    return p;
  }

  /* ---------- tạo toàn bộ hệ sinh thái DEMO ---------- */
  function seed(opt) {
    PL.need('demo'); opt = opt || {}; var n = Math.max(6, Math.min(50, +opt.count || 50)), seedN = opt.seed || (Date.now() % 100000), R = mk(seedN), d = PL.db(), t = Date.now(), i;
    wipeInternal('all'); var users = genUsers(R, n); d.users = users; var ids = users.map(function (u) { return u.id; });
    /* nhóm */
    GROUP_DEF.forEach(function (g, k) { d.groups.push({ id: g[0], name: g[1], desc: g[2], hue: (k * 47 + 20) % 360, owner: R.pick(ids), members: R.shuffle(ids).slice(0, R.int(Math.min(8, n), Math.min(30, n))), demo: true, at: t - R.int(5, 90) * 864e5 }); });
    /* bài viết: 4 bài gốc của DISCI cũ + bài sinh mới */
    D.DEMO_POSTS.forEach(function (x) { d.posts.push({ id: x.id, by: x.by, topic: x.topic, text: x.text, at: t - x.ago, vis: 'public', demo: true }); });
    var total = Math.round(n * 2.8), k;
    for (k = 0; k < total; k++) { var p = makePost(R, 'dp' + (5 + k), R.pick(ids), t - R.int(10, 14 * 24 * 60) * 6e4); if (R.chance(.22)) p.group = R.pick(d.groups).id; d.posts.push(p); }
    /* thích / bình luận / chia sẻ */
    d.posts.forEach(function (p) {
      var likers = R.shuffle(ids).slice(0, R.int(2, Math.min(26, n))).filter(function (x) { return x !== p.by; }); if (likers.length) d.likes[p.id] = likers; if (R.chance(.35)) d.shares[p.id] = R.int(1, 8);
      var nc = R.int(0, 4), cs = [], j; for (j = 0; j < nc; j++) cs.push({ id: PL.uid('c'), by: R.pick(ids.filter(function (x) { return x !== p.by; })), text: R.pick(CMT), at: Math.min(t, p.at + R.int(3, 600) * 6e4), demo: true });
      if (cs.length) d.comments[p.id] = cs;
    });
    /* giữ bình luận gốc */
    Object.keys(D.DEMO_COMMENTS).forEach(function (pid) { d.comments[pid] = (d.comments[pid] || []).concat(D.DEMO_COMMENTS[pid].map(function (c) { return { id: PL.uid('c'), by: c.by, text: c.text, at: t - c.ago, demo: true }; })); });
    /* quan hệ theo dõi */
    ids.forEach(function (a) { var f = R.shuffle(ids).filter(function (x) { return x !== a; }).slice(0, R.int(5, Math.min(14, n - 1))); d.follows[a] = f; });
    /* thử thách: người tham gia + tiến độ */
    PL.challengesAll().forEach(function (c) { var part = R.shuffle(ids).slice(0, R.int(Math.min(8, n), Math.min(30, n))); d.chPart[c.id] = (d.chPart[c.id] || []).concat(part); d.chProg[c.id] = d.chProg[c.id] || {}; part.forEach(function (a) { d.chProg[c.id][a] = R.int(0, c.goal); }); });
    /* thử thách tùy chỉnh mẫu (chỉ tạo nếu chưa có) */
    [{ id: 'dc_plank', name: 'Plank 30 ngày', days: 30, goal: 20, metric: 'manual', desc: 'Mỗi ngày giữ plank một lần và đánh dấu. Tăng dần thời gian giữ.', reward: '', demoMembers: 0, demo: true }, { id: 'dc_water', name: 'Uống đủ nước 2 lít', days: 14, goal: 14, metric: 'manual', desc: 'Đánh dấu mỗi ngày bạn uống đủ nước.', reward: '', demoMembers: 0, demo: true }].forEach(function (c) {
      if (!d.challenges.some(function (x) { return x.id === c.id; })) { d.challenges.push(c); var part = R.shuffle(ids).slice(0, R.int(6, Math.min(22, n))); d.chPart[c.id] = part; d.chProg[c.id] = {}; part.forEach(function (a) { d.chProg[c.id][a] = R.int(0, c.goal); }); }
    });
    /* stories */
    R.shuffle(ids).slice(0, Math.min(18, n)).forEach(function (a) { d.stories.push({ id: PL.uid('s'), by: a, text: fill(R.pick(STORY_TXT), R), img: '', hue: R.int(0, 359), at: t - R.int(5, 20 * 60) * 6e4, demo: true }); });
    d.demo = { seeded: t, seed: seedN, count: n, optOut: false }; PL.log('demo.seed', '', n + ' tài khoản · ' + d.posts.length + ' bài'); PL.save(); return summary();
  }

  /* ---------- xóa (chỉ bản ghi demo) ---------- */
  function wipeInternal(scope) {
    var d = PL.db(), demoIds = {}, gone = {};
    d.users.forEach(function (u) { demoIds[u.id] = 1; });
    var isDemoActor = function (id) { return !!demoIds[id]; };
    if (scope === 'sim') { undoSim(); return; }
    if (scope !== 'content') d.users.forEach(function (u) { ST.purgeCloneData(u.id); }); /* xóa dữ liệu cá nhân của clone đã được dùng */
    /* nội dung demo */
    d.posts = d.posts.filter(function (p) { if (p.demo) { gone[p.id] = 1; if (p.videoId && root.DISCI.media) root.DISCI.media.del(p.videoId); return false; } return true; });
    Object.keys(gone).forEach(function (id) { delete d.likes[id]; delete d.comments[id]; delete d.shares[id]; delete d.mod[id]; });
    Object.keys(d.likes).forEach(function (k) { d.likes[k] = d.likes[k].filter(function (a) { return !isDemoActor(a); }); });
    Object.keys(d.comments).forEach(function (k) { d.comments[k] = d.comments[k].filter(function (c) { return !c.demo && !isDemoActor(c.by); }); });
    d.stories = d.stories.filter(function (s) { return !s.demo && !isDemoActor(s.by); });
    d.notifs = d.notifs.filter(function (n) { return !isDemoActor(n.from) && !n.sim; });
    d.reports = d.reports.filter(function (r) { return !gone[r.postId]; });
    if (scope === 'content') { d.sim.undo = d.sim.undo.filter(function () { return false; }); d.sim.steps = 0; d.sim.log = []; PL.save(); return; }
    /* quan hệ, nhóm, người dùng */
    d.groups = d.groups.filter(function (g) { return !g.demo; });
    d.groups.forEach(function (g) { g.members = (g.members || []).filter(function (a) { return !isDemoActor(a); }); });
    d.challenges = d.challenges.filter(function (c) { return !c.demo; });
    Object.keys(d.chPart).forEach(function (k) { d.chPart[k] = d.chPart[k].filter(function (a) { return !isDemoActor(a); }); if (!d.chPart[k].length && !PL.challengesAll().some(function (c) { return c.id === k; })) delete d.chPart[k]; });
    Object.keys(d.chProg).forEach(function (k) { Object.keys(d.chProg[k]).forEach(function (a) { if (isDemoActor(a)) delete d.chProg[k][a]; }); });
    Object.keys(d.follows).forEach(function (a) { if (isDemoActor(a)) delete d.follows[a]; else d.follows[a] = d.follows[a].filter(function (b) { return !isDemoActor(b); }); });
    d.users = []; d.sim.undo = []; d.sim.steps = 0; d.sim.log = []; d.demo = { seeded: 0, seed: 0, count: 0 };
  }
  function wipe(scope) {
    PL.need('demo'); var before = summary(); wipeInternal(scope || 'all'); if (!scope || scope === 'all') PL.db().demo.optOut = true; PL.log('demo.wipe', scope || 'all', 'đã xóa riêng dữ liệu DEMO – dữ liệu người dùng thật không bị ảnh hưởng'); PL.save(); return before;
  }
  /* xóa riêng MỘT tài khoản DEMO (kéo theo bài/bình luận/thích/theo dõi của chính tài khoản đó) */
  function removeUser(id) {
    PL.need('demo'); var d = PL.db(), u = d.users.filter(function (x) { return x.id === id; })[0]; if (!u) throw new Error('Không tìm thấy tài khoản DEMO.');
    ST.purgeCloneData(id);
    var gone = {}; d.posts = d.posts.filter(function (p) { if (p.by === id) { gone[p.id] = 1; return false; } return true; });
    Object.keys(gone).forEach(function (k) { delete d.likes[k]; delete d.comments[k]; delete d.shares[k]; });
    Object.keys(d.likes).forEach(function (k) { d.likes[k] = d.likes[k].filter(function (a) { return a !== id; }); });
    Object.keys(d.comments).forEach(function (k) { d.comments[k] = d.comments[k].filter(function (c) { return c.by !== id; }); });
    delete d.follows[id]; Object.keys(d.follows).forEach(function (a) { d.follows[a] = d.follows[a].filter(function (b) { return b !== id; }); });
    d.groups.forEach(function (g) { g.members = (g.members || []).filter(function (a) { return a !== id; }); }); Object.keys(d.chPart).forEach(function (k) { d.chPart[k] = d.chPart[k].filter(function (a) { return a !== id; }); });
    d.stories = d.stories.filter(function (s) { return s.by !== id; }); d.notifs = d.notifs.filter(function (n) { return n.from !== id; }); d.users = d.users.filter(function (x) { return x.id !== id; }); d.demo.count = d.users.length;
    PL.log('demo.user.delete', id, u.name); PL.save();
  }
  function refresh() {
    PL.need('demo'); var d = PL.db(); if (!d.users.length) throw new Error('Chưa có dữ liệu DEMO để làm mới. Hãy tạo trước.'); var t = Date.now(), R = mk((Date.now() % 99999) + 7), ids = d.users.map(function (u) { return u.id; });
    var demoPosts = d.posts.filter(function (p) { return p.demo && !p.sim; }), mx = Math.max.apply(null, demoPosts.map(function (p) { return p.at; }).concat([0])), shift = t - mx - R.int(5, 40) * 6e4;
    d.posts.forEach(function (p) { if (p.demo) p.at += shift; });
    Object.keys(d.comments).forEach(function (k) { d.comments[k].forEach(function (c) { if (c.demo) c.at = Math.min(t, c.at + shift); }); });
    d.stories = d.stories.filter(function (s) { return !s.demo; });
    R.shuffle(ids).slice(0, Math.min(16, ids.length)).forEach(function (a) { d.stories.push({ id: PL.uid('s'), by: a, text: fill(R.pick(STORY_TXT), R), img: '', hue: R.int(0, 359), at: t - R.int(5, 18 * 60) * 6e4, demo: true }); });
    d.users.forEach(function (u) { u.lastActiveAgo = R.int(1, 30) * 36e5; if (R.chance(.5)) { u.stats.sessions += R.int(1, 2); u.stats.minutes += R.int(25, 60); u.stats.streak += 1; u.stats.points = u.stats.sessions * 20 + u.stats.streak * 10; } });
    for (var k = 0; k < Math.round(ids.length * .5); k++) { var p = makePost(R, PL.uid('dp'), R.pick(ids), t - R.int(10, 24 * 60) * 6e4); d.posts.push(p); d.likes[p.id] = R.shuffle(ids).slice(0, R.int(2, 15)).filter(function (x) { return x !== p.by; }); }
    PL.log('demo.refresh', '', 'làm mới thời gian, story, hoạt động'); PL.save(); return summary();
  }
  function summary() {
    var d = PL.db(); var dp = d.posts.filter(function (p) { return p.demo; }), sp = d.posts.filter(function (p) { return p.sim; });
    return { users: d.users.length, posts: dp.length, clips: dp.filter(function (p) { return p.clip; }).length, images: dp.filter(function (p) { return p.art; }).length, comments: Object.keys(d.comments).reduce(function (t, k) { return t + d.comments[k].filter(function (c) { return c.demo; }).length; }, 0),
      likes: Object.keys(d.likes).reduce(function (t, k) { return t + d.likes[k].length; }, 0), follows: Object.keys(d.follows).reduce(function (t, k) { return t + d.follows[k].length; }, 0), groups: d.groups.filter(function (g) { return g.demo; }).length, stories: d.stories.filter(function (s) { return s.demo; }).length, sim: sp.length, seeded: d.demo.seeded, count: d.demo.count };
  }
  /* tự tạo lần đầu (chỉ khi người dùng bật hiển thị demo và chưa từng tạo) – dùng khi mở Cộng đồng lần đầu */
  function ensureSeeded() {
    var d = PL.db(); if (d.demo.seeded || d.demo.optOut) return false; if (PL.cfg().system.showDemo === false) return false;
    if (d.users.length) return false; var u = ST.user; if (u && u.role === 'admin') { /* admin tạo thủ công có chủ đích */ }
    var R = mk(20260101), saveRole = u && u.role; // tạo bằng quyền hệ thống (không phải thao tác người dùng): bỏ qua need()
    var old = PL.need; PL.need = function () {}; try { seed({ count: 50, seed: 20260101 }); } finally { PL.need = old; } return true;
  }

  /* ---------- MÔ PHỎNG theo kịch bản ---------- */
  var SCRIPTS = {
    daily: { name: 'Một ngày sôi động', icon: 'wb_sunny', desc: 'Thành viên DEMO đăng bài, thích, bình luận, theo dõi và hoàn thành buổi tập xen kẽ như một ngày bình thường.', every: 6000, w: { like: 38, comment: 18, follow: 8, post: 10, story: 6, join: 6, session: 10, share: 4 } },
    challenge: { name: 'Đua thử thách', icon: 'emoji_events', desc: 'Nhiều thành viên tham gia thử thách, cập nhật tiến độ và đăng thành tích.', every: 5000, w: { join: 30, session: 32, post: 14, like: 14, comment: 10 } },
    viral: { name: 'Video lan truyền', icon: 'local_fire_department', desc: 'Các clip/video mới nhận rất nhiều lượt thích, chia sẻ và bình luận.', every: 3500, w: { like: 52, share: 20, comment: 20, follow: 8 }, focus: 'video' },
    welcome: { name: 'Chào đón người dùng thật', icon: 'waving_hand', desc: 'Tài khoản DEMO theo dõi, thích và bình luận bài của người dùng thật (thông báo gắn nhãn “mô phỏng”).', every: 5000, w: { follow: 36, like: 38, comment: 26 }, focus: 'real' }
  };
  var timer = null, listeners = [], ACTIONS = ['like', 'comment', 'follow', 'post', 'story', 'join', 'session', 'share'];
  function S_() { return PL.db().sim; }
  function simLog(icon, text) { var l = S_().log; l.unshift({ at: Date.now(), icon: icon, text: text }); if (l.length > 80) l.length = 80; }
  function demoIds() { return PL.db().users.map(function (u) { return u.id; }); }
  function weighted(w, R) { var keys = Object.keys(w), tot = keys.reduce(function (s, k) { return s + w[k]; }, 0), x = R.r() * tot, i; for (i = 0; i < keys.length; i++) { x -= w[keys[i]]; if (x <= 0) return keys[i]; } return keys[0]; }
  function pickTarget(R, sc, me) {
    var vis = PL.visiblePosts(me || '#'); if (!vis.length) return null;
    if (sc.focus === 'video') { var v = vis.filter(function (p) { return p.clip || p.videoId || p.video; }).slice(0, 6); if (v.length) return R.pick(v); }
    if (sc.focus === 'real') { var r = vis.filter(function (p) { return p.real && !p.demo; }).slice(0, 6); if (r.length) return R.pick(r); }
    return R.pick(vis.slice(0, 30));
  }
  function step(R) {
    var d = PL.db(), sim = d.sim, sc = SCRIPTS[sim.script] || SCRIPTS.daily, ids = demoIds(); if (ids.length < 2) return null; R = R || mk(Date.now() % 1e9);
    var a = R.pick(ids), act = weighted(sc.w, R), A = PL.actor(a), tg, t = Date.now(), ok = false;
    if (act === 'like') { tg = pickTarget(R, sc); if (tg && tg.by !== a && !PL.liked(tg.id, a)) { PL.toggleLike(tg.id, a, { sim: true }); simLog('favorite', A.name + ' đã thích bài của ' + PL.actor(tg.by).name); ok = true; } }
    else if (act === 'comment') { tg = pickTarget(R, sc); if (tg && tg.by !== a) { PL.addComment(tg.id, a, R.pick(CMT), { sim: true }); simLog('chat_bubble', A.name + ' đã bình luận bài của ' + PL.actor(tg.by).name); ok = true; } }
    else if (act === 'follow') {
      var pool = sc.focus === 'real' ? PL.db().users.length && PL.realPosts().filter(function (p) { return !p.demo; }).map(function (p) { return p.by; }) : null, tgt = pool && pool.length ? R.pick(pool) : R.pick(ids); if (!tgt || tgt === a || PL.isFollowing(a, tgt)) tgt = R.pick(ids);
      if (tgt !== a && !PL.isFollowing(a, tgt)) { PL.toggleFollow(a, tgt, { sim: true }); simLog('person_add', A.name + ' bắt đầu theo dõi ' + PL.actor(tgt).name); ok = true; }
    }
    else if (act === 'post') {
      var p = makePost(R, PL.uid('sp'), a, t, null); p.sim = true; if (sim.script === 'challenge') { p.topic = 'Thành tích'; p.text = fill(R.pick(POSTS['Thành tích']), R); } d.posts.unshift(p); sim.undo.push({ t: 'post', id: p.id }); PL.save(); simLog('edit_note', A.name + ' đăng bài mới' + (p.clip ? ' (clip)' : p.art ? ' (ảnh)' : '')); ok = true;
    }
    else if (act === 'story') { PL.addStory({ by: a, text: fill(R.pick(STORY_TXT), R), demo: true, sim: true }); simLog('auto_awesome', A.name + ' đăng một story'); ok = true; }
    else if (act === 'join') {
      if (R.chance(.5)) { var g = R.pick(PL.groups()); if (g && (g.members || []).indexOf(a) < 0) { PL.joinGroup(g.id, a, { sim: true }); simLog('groups', A.name + ' tham gia nhóm “' + g.name + '”'); ok = true; } }
      else { var cs = PL.challenges(), c = cs.length && R.pick(cs); if (c && PL.participants(c.id).indexOf(a) < 0) { PL.joinChallenge(c.id, a, { sim: true }); simLog('emoji_events', A.name + ' tham gia thử thách “' + c.name + '”'); ok = true; } }
    }
    else if (act === 'session') {
      var u = d.users.filter(function (x) { return x.id === a; })[0], m = R.int(20, 50), before = PL.badgesOf(u.stats).length; u.stats.sessions++; u.stats.minutes += m; u.stats.points += 20; sim.undo.push({ t: 'stat', a: a, m: m });
      var title = R.pick(SESS_TITLES); u.hist.sessions.unshift([0, m, Math.round(m * 6.5), title]); PL.save(); simLog('fitness_center', A.name + ' hoàn thành buổi “' + title + '” ' + m + ' phút'); ok = true;
      if (PL.badgesOf(u.stats).length > before) { var bp = { id: PL.uid('sp'), by: a, topic: 'Thành tích', text: 'Vừa mở khóa huy hiệu mới 🎉', at: t, vis: 'public', demo: true, sim: true, art: { h: R.int(0, 359), label: 'HUY HIỆU MỚI', sub: A.name } }; d.posts.unshift(bp); sim.undo.push({ t: 'post', id: bp.id }); simLog('military_tech', A.name + ' mở khóa huy hiệu mới'); }
    }
    else if (act === 'share') { tg = pickTarget(R, sc); if (tg) { d.shares[tg.id] = (d.shares[tg.id] || 0) + 1; sim.undo.push({ t: 'share', id: tg.id }); PL.save(); simLog('share', A.name + ' chia sẻ bài của ' + PL.actor(tg.by).name); ok = true; } }
    if (ok) { sim.steps++; sim.last = t; PL.save(); listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
    return ok;
  }
  function runSteps(n) { var i, c = 0, R = mk(Date.now() % 1e9), tries = 0; for (i = 0; i < n && tries < n * 4; tries++) { if (step(R)) { c++; i++; } } PL.fresh(); return c; }
  function undoSim() {
    var d = PL.db(), u = d.sim.undo.slice().reverse(), rm = {};
    u.forEach(function (o) {
      if (o.t === 'like') { d.likes[o.p] = (d.likes[o.p] || []).filter(function (x) { return x !== o.a; }); }
      else if (o.t === 'follow') { d.follows[o.a] = (d.follows[o.a] || []).filter(function (x) { return x !== o.b; }); }
      else if (o.t === 'story') { d.stories = d.stories.filter(function (s) { return s.id !== o.id; }); }
      else if (o.t === 'post') { rm[o.id] = 1; }
      else if (o.t === 'group') { var g = PL.groupById(o.id); if (g) g.members = (g.members || []).filter(function (x) { return x !== o.a; }); }
      else if (o.t === 'chj') { d.chPart[o.id] = (d.chPart[o.id] || []).filter(function (x) { return x !== o.a; }); }
      else if (o.t === 'stat') { var us = d.users.filter(function (x) { return x.id === o.a; })[0]; if (us) { us.stats.sessions = Math.max(0, us.stats.sessions - 1); us.stats.minutes = Math.max(0, us.stats.minutes - o.m); us.stats.points = Math.max(0, us.stats.points - 20); var i = us.hist.sessions.findIndex(function (h) { return h[0] === 0 && h[1] === o.m; }); if (i >= 0) us.hist.sessions.splice(i, 1); } }
      else if (o.t === 'share') { d.shares[o.id] = Math.max(0, (d.shares[o.id] || 1) - 1); }
    });
    d.posts = d.posts.filter(function (p) { if (rm[p.id] || p.sim) { delete d.likes[p.id]; delete d.comments[p.id]; delete d.shares[p.id]; return false; } return true; });
    Object.keys(d.comments).forEach(function (k) { d.comments[k] = d.comments[k].filter(function (c) { return !c.sim; }); });
    d.stories = d.stories.filter(function (s) { return !s.sim; }); d.notifs = d.notifs.filter(function (n) { return !n.sim; });
    d.sim.undo = []; d.sim.steps = 0; d.sim.log = []; d.sim.last = 0;
  }
  function simSet(on) { PL.need('sim'); S_().on = !!on; if (on) S_().last = Date.now(); PL.log('sim.' + (on ? 'on' : 'off'), S_().script, ''); PL.save(); if (on) start(); else stop(); }
  function simScript(k) { PL.need('sim'); if (!SCRIPTS[k]) return; S_().script = k; PL.log('sim.script', k, ''); PL.save(); restart(); }
  function simReset() { PL.need('sim'); undoSim(); PL.log('sim.reset', '', 'đã xóa hoạt động mô phỏng'); PL.save(); listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function start() {
    stop(); var sim = S_(); if (!sim.on) return; var sc = SCRIPTS[sim.script] || SCRIPTS.daily, gap = Date.now() - (sim.last || 0), n = Math.min(10, Math.floor(gap / sc.every));
    if (n > 0 && sim.last) runSteps(n);
    timer = setInterval(function () { if (document.hidden) return; step(); PL.fresh(); }, sc.every);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() { if (S_().on) start(); }
  function onChange(f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; }

  root.DISCI.demo = { removeUser: removeUser, seed: seed, wipe: wipe, refresh: refresh, summary: summary, ensureSeeded: ensureSeeded, TOPICS: TOPICS };
  var BASE_KEYS = Object.keys(SCRIPTS);
  var ACTS = { like: 'Thích bài', comment: 'Bình luận', follow: 'Theo dõi', post: 'Đăng bài', story: 'Đăng story', join: 'Tham gia nhóm', session: 'Hoàn thành buổi tập', share: 'Chia sẻ' };
  function refreshScripts() {
    Object.keys(SCRIPTS).forEach(function (k) { if (BASE_KEYS.indexOf(k) < 0) delete SCRIPTS[k]; });
    var cu = {}; try { cu = PL.cfg().site.flow.scripts || {}; } catch (e) {}
    Object.keys(cu).forEach(function (id) {
      var c = cu[id], w = {}, tot = 0; if (!c || !c.name) return;
      Object.keys(ACTS).forEach(function (a) { var n = Math.max(0, Math.min(100, +(c.w || {})[a] || 0)); if (n) { w[a] = n; tot += n; } });
      if (!tot) return; SCRIPTS['c_' + id] = { name: String(c.name).slice(0, 40), icon: 'tune', desc: String(c.desc || 'Kịch bản tùy chỉnh').slice(0, 200), every: Math.max(1000, Math.min(60000, +c.every || 6000)), w: w, custom: true };
    });
    return SCRIPTS;
  }
  refreshScripts();
  root.DISCI.sim = { ACTS: ACTS, refreshScripts: refreshScripts, SCRIPTS: SCRIPTS, state: S_, set: simSet, script: simScript, reset: simReset, step: function (n) { PL.need('sim'); return runSteps(n || 1); }, start: start, stop: stop, onChange: onChange };
})(window);
