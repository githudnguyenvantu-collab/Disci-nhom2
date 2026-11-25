// Sinh dữ liệu đối chiếu từ engine.js gốc để kiểm tra bản port C#.
// Chạy: node tools/gen-golden.js <đường-dẫn-tới-thư-mục-assets-của-DISCI-cũ>
const path = require('path'), fs = require('fs');
const assets = path.resolve(process.argv[2] || '../disci/assets');
const E = require(path.join(assets, 'engine.js'));
const NOW = 1700000000000;
const out = { products: [], bmi: [], tdee: [], risk: [], plans: [], adapt: [], missed: [], streak: [], progress: [], nutrition: [], menu: [] };

[[60,170],[45,170],[70,165],[100,160],[0,170]].forEach(([w,h]) => out.bmi.push({ w, h, bmi: E.bmi(w,h), cat: E.bmiCategory(E.bmi(w,h)).key }));
[['male',70,175,25,3,'fatloss'],['female',55,160,30,2,'muscle'],['male',90,180,45,1,'health'],['female',48,155,22,4,'endurance']].forEach(([sex,w,h,age,act,goal]) => {
  const td = E.tdee(sex,w,h,age,act);
  out.tdee.push({ sex,w,h,age,act,goal, bmr: E.bmr(sex,w,h,age), tdee: td, kcal: E.targetCalories(td,goal,sex), protein: E.proteinTarget(w,goal) });
});

const riskIn = [
  {},
  { bmi: 22, age: 25 },
  { sbp: 145, dbp: 92, bmi: 26, age: 40, consent: {} },
  { sbp: 165, dbp: 95 },
  { rhr: 105 }, { rhr: 120 },
  { bmi: 31, age: 62, symptoms: { pain: true } },
  { symptoms: { chest: true } },
  { restrictions: ['knee', 'back'] },
  { restrictions: ['stop'] },
  { bmi: 36, symptoms: { fatigue: true }, restrictions: ['heart'] }
];
riskIn.forEach(i => out.risk.push({ input: i, result: E.assessRisk(i) }));

const profiles = [
  { goal: 'fatloss', daysPerWeek: 3, minutes: 40, equip: [], activity: 2, place: 'home' },
  { goal: 'muscle', daysPerWeek: 4, minutes: 50, equip: ['dumbbell', 'band'], activity: 3, place: 'home' },
  { goal: 'endurance', daysPerWeek: 5, minutes: 45, equip: ['rope'], activity: 3, place: 'outdoor' },
  { goal: 'health', daysPerWeek: 2, minutes: 30, equip: [], activity: 1, place: 'dorm' },
  { goal: 'muscle', daysPerWeek: 6, minutes: 60, equip: ['dumbbell', 'pullup', 'band'], activity: 4, place: 'gym', level: 3 },
  { goal: 'fatloss', daysPerWeek: 4, minutes: 40, equip: ['band'], activity: 2, place: 'home', quiet: true }
];
const risks = [riskIn[0], riskIn[2], riskIn[7], riskIn[8]];
profiles.forEach((p, i) => risks.forEach((r, j) => {
  const risk = E.assessRisk(r);
  out.plans.push({ profile: p, riskInput: r, plan: E.generatePlan(p, risk, NOW) });
}));

// adaptPlan: từ lịch mức 1 → mức 2 / mức 3
profiles.slice(0, 4).forEach(p => {
  const r1 = E.assessRisk({});
  const plan = E.generatePlan(p, r1, NOW);
  [riskIn[2], riskIn[8], riskIn[7]].forEach(ri => {
    const r = E.assessRisk(ri);
    const res = E.adaptPlan(plan, p, r, NOW + 1);
    out.adapt.push({ profile: p, riskInput: ri, plan, result: res });
  });
});

// handleMissed
const p0 = profiles[1], plan0 = E.generatePlan(p0, E.assessRisk({}), NOW);
['2026-11-16','2026-11-17','2026-11-18','2026-11-20','2026-11-21'].forEach(d =>
  out.missed.push({ plan: plan0, missedDate: d, today: '2026-11-22', result: E.handleMissed(plan0, d, '2026-11-22') }));

// streak
const ss = [ '2026-11-10','2026-11-11','2026-11-12','2026-11-15','2026-11-19','2026-11-20','2026-11-21' ].map(d => ({ date: d, status: 'done' }));
ss.push({ date: '2026-11-18', status: 'skipped' });
out.streak.push({ sessions: ss, today: '2026-11-21', result: E.streakOf(ss, '2026-11-21') });
out.streak.push({ sessions: ss, today: '2026-11-22', result: E.streakOf(ss, '2026-11-22') });
out.streak.push({ sessions: ss, today: '2026-11-25', result: E.streakOf(ss, '2026-11-25') });

// progress
const sess = [
  { date: '2026-11-03', status: 'done', minutes: 40, calories: 250, rpe: 6 },
  { date: '2026-11-05', status: 'done', minutes: 35, calories: 210, rpe: 7 },
  { date: '2026-11-17', status: 'done', minutes: 45, calories: 300, rpe: 9 },
  { date: '2026-11-19', status: 'done', minutes: 50, calories: 320, rpe: 9 },
  { date: '2026-11-20', status: 'skipped', minutes: 0, calories: 0 }
];
const metrics = [ { date: '2026-10-25', weight: 72 }, { date: '2026-11-05', weight: 71.2 }, { date: '2026-11-19', weight: 70.1 } ];
[1, 2, 3].forEach(level => {
  const o = { sessions: sess, metrics, today: '2026-11-21', plan: plan0, goalWeight: 66, goal: 'fatloss', riskLevel: level };
  out.progress.push({ input: o, result: E.analyzeProgress(o) });
});
out.progress.push({ input: { sessions: [], metrics: [], today: '2026-11-21', plan: null, riskLevel: 1 }, result: E.analyzeProgress({ sessions: [], metrics: [], today: '2026-11-21', plan: null, riskLevel: 1 }) });

// nutrition
[
  [{ sex: 'male', weight: 70, height: 175, age: 25, activity: 3, goal: 'fatloss' }, E.assessRisk({})],
  [{ sex: 'female', weight: 55, height: 160, age: 30, activity: 2, goal: 'muscle' }, E.assessRisk({})],
  [{ sex: 'male', weight: 70, height: 175, age: 25, activity: 3, goal: 'fatloss' }, E.assessRisk({ symptoms: { chest: true } })],
  [{ sex: 'male', weight: 0, height: 175, age: 25, activity: 3, goal: 'fatloss' }, E.assessRisk({})]
].forEach(([p, r]) => out.nutrition.push({ profile: p, risk: { level: r.level }, result: E.nutritionAdvice(p, r) }));
[1500, 1800, 2200, 2600].forEach(k => [0, 1, 2].forEach(s => { const m = E.planMenu(k, s); out.menu.push({ kcal: k, seed: s, ids: m.meals.map(x => x.id), total: m.total }); }));


// gợi ý sản phẩm
[
  { equip: [], goal: 'fatloss', budget: 500000, level: 1, activity: 2, place: 'home', space: 'small' },
  { equip: ['band'], goal: 'muscle', budget: 1500000, level: 2, activity: 3, place: 'home', space: 'medium' },
  { equip: ['dumbbell','mat'], goal: 'endurance', budget: 800000, activity: 3, place: 'dorm', quiet: true, space: 'small' },
  { equip: [], goal: 'health', budget: 300000, riskLevel: 3, tags: ['impact','intense'], space: 'large' },
  { equip: [], goal: 'health', riskLevel: 2, tags: ['knee','impact'] }
].forEach(q => {
  const recs = E.recommendProducts(q);
  out.products.push({ query: q, recs: recs.map(r => ({ id: r.product.id, score: r.score, reason: r.reason })), kit: (function(){ const k = E.buildStarterKit(recs, q.budget || 1000000); return { ids: k.items.map(i => i.id), total: k.total }; })() });
});
out.gym = [ E.costVsGym(500000, 6), E.costVsGym(1200000, 12, 400000) ];

fs.writeFileSync(path.join(__dirname, '../tests/Disci.Tests/Golden/golden.json'), JSON.stringify(out, null, 1));
console.log('plans', out.plans.length, 'adapt', out.adapt.length, 'missed', out.missed.length, 'progress', out.progress.length, 'menu', out.menu.length);
