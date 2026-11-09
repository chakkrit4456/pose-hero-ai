// ชุดทดสอบอัตโนมัติของโปรเจกต์ (Node ล้วน ไม่ต้องติดตั้งอะไร)   รัน:  node tests/run-tests.js   หรือ  npm test
// ครอบคลุม: ระบบเกม 2.x · แจ้งเตือน 6.x · สรุปผล 7.x · ระบบ AI (จำลองคนทำท่า) · ท่าตัวอย่างของท่าออฟฟิศ
// หมายเหตุ: ไม่ได้ทดสอบกล้องจริง/MediaPipe — ส่วนนั้นต้องลองบนเครื่องจริง
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const R = (...p) => require(path.join(root, ...p));

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; failures.push([name, e]); console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n')[0]); }
}
const group = (t) => console.log('\n' + t);

// ---------------------------------------------------------------- โมดูลเกม 2.x
const G = R('3.Game Control System', '2.1 Start Game.js');
const S = R('3.Game Control System', '2.2 Exercise Selection.js');
const P = R('3.Game Control System', '2.3 Game Sequence Control.js');
const E = R('3.Game Control System', '2.4 Pause and End Game.js');

function playedState(opts = {}) {
  const st = G.createGameState({ countdownSec: 1, restSec: 1, ...opts });
  S.selectExercise(st, 'basic_01', { reps: 4, durationSec: 30 });
  S.selectExercise(st, 'basic_04', { reps: 4, durationSec: 30 });
  return st;
}

group('ระบบเกม 2.1-2.4');
test('เริ่มเกมโดยไม่เลือกท่า ต้อง error', () => {
  assert.throws(() => G.startGame(G.createGameState()), /อย่างน้อย 1 ท่า/);
});
test('เดินครบ: นับถอยหลัง -> เล่น -> พัก -> จบเกม', () => {
  const st = playedState();
  G.startGame(st); P.tick(st, 1100);
  assert.strictEqual(st.status, 'playing');
  P.registerRep(st, 4);
  assert.ok(st.current.resting, 'ควรพักหลังท่าแรก');
  P.tick(st, 1100); P.registerRep(st, 4);
  assert.strictEqual(st.status, 'finished');
  assert.strictEqual(st.results.length, 2);
  assert.ok(st.results.every((r) => r.completed));
});
test('หยุดชั่วคราวแล้วเวลาไม่เดิน', () => {
  const st = playedState(); G.startGame(st); P.tick(st, 1100);
  const t = st.totalElapsedMs; E.pauseGame(st); P.tick(st, 5000);
  assert.strictEqual(st.totalElapsedMs, t); E.resumeGame(st); P.tick(st, 1000);
  assert.strictEqual(st.totalElapsedMs, t + 1000);
});
test('หมดเวลาแล้วไปท่าถัดไป (reason = timeout)', () => {
  const st = playedState(); G.startGame(st); P.tick(st, 1100); P.tick(st, 30000);
  assert.strictEqual(st.results[0].reason, 'timeout');
});
test('ออกจากเกมกลางคัน บันทึกท่าที่ค้างไว้', () => {
  const st = playedState(); G.startGame(st); P.tick(st, 1100); P.registerRep(st, 2); E.endGame(st);
  assert.strictEqual(st.results[0].repsDone, 2); assert.strictEqual(st.results[0].reason, 'quit');
});
test('คัดแคตตาล็อกท่าที่ผู้เล่นสร้าง (syncCustomExercises) แทนที่ชุดเดิมทุกครั้ง', () => {
  S.syncCustomExercises([{ id: 'pose:x', name: 'ท่า X', target: 't', reps: 5, durationSec: 20 }]);
  assert.ok(S.getCatalog().some((c) => c.id === 'pose:x'));
  S.syncCustomExercises([]);
  assert.ok(!S.getCatalog().some((c) => c.custom));
});
test('แคตตาล็อกมีท่า AI พื้นฐานครบ 10 ท่า (basic_01..basic_10)', () => {
  const ids = S.getCatalog().map((c) => c.id);
  for (let i = 1; i <= 10; i++) assert.ok(ids.includes('basic_' + String(i).padStart(2, '0')));
});

// ---------------------------------------------------------------- แจ้งเตือน 6.x
const N1 = R('4.Notifications and Guidance System', '6.1 Incorrect Pose Alert.js');
const N2 = R('4.Notifications and Guidance System', '6.2 Posture Correction Guidance.js');
const N3 = R('4.Notifications and Guidance System', '6.3 Time and Rep Count Alerts.js');
const N4 = R('4.Notifications and Guidance System', '6.4 Exercise Status Notification.js');

group('แจ้งเตือน 6.1-6.4');
test('6.1 ไม่เตือนจนกว่าจะผิดต่อเนื่องเกิน holdMs', () => {
  const a = N1.createPoseAlert({ holdMs: 1000, cooldownMs: 4000 });
  assert.strictEqual(a.update(['x'], 0), null);
  assert.strictEqual(a.update(['x'], 900), null);
  assert.ok(a.update(['x'], 1100));
});
test('6.1 เตือนเรื่องเดิมซ้ำเฉพาะหลัง cooldown และท่าถูกแล้วต้องรีเซ็ต', () => {
  const a = N1.createPoseAlert({ holdMs: 100, cooldownMs: 4000 });
  a.update(['x'], 0); assert.ok(a.update(['x'], 200));
  assert.strictEqual(a.update(['x'], 1000), null);
  assert.ok(a.update(['x'], 4300));
  a.update([], 4400); assert.strictEqual(a.update(['x'], 4500), null);
});
test('6.2 ผิดซ้ำ คำแนะนำเจาะจงขึ้น', () => {
  const m = 'เหยียดศอกซ้ายให้ตรง';
  assert.ok(N2.guide({ message: m, count: 1, level: 'warn' }).text.includes('ยืดข้อต่อ'));
  assert.ok(N2.guide({ message: m, count: 2, level: 'warn' }).text.includes('ทำช้าลง'));
  assert.ok(N2.guide({ message: m, count: 5, level: 'warn' }).text.includes('ดูท่าตัวอย่าง'));
});
test('6.3 แจ้งแต่ละจุดครั้งเดียวต่อท่า', () => {
  const c = N3.createCountAlerts(); const ex = { name: 'ท่า', reps: 10 };
  const pr = (repsDone, timeLeftSec = 60) => ({ index: 0, exercise: ex, resting: false, repsDone, timeLeftSec, restLeftSec: 0 });
  assert.strictEqual(c.check(pr(5)).length, 1);
  assert.strictEqual(c.check(pr(5)).length, 0);
  assert.strictEqual(c.check(pr(7)).length, 1);
  assert.strictEqual(c.check(pr(9)).length, 1);
  assert.strictEqual(c.check(pr(9, 10)).length, 1);
  assert.strictEqual(c.check({ ...pr(0), index: 1 }).length, 0);
});
test('6.4 แจ้งสถานะครบทั้งเกม', () => {
  const st = playedState(); const out = [];
  N4.attachStatusNotifier(st, (m) => out.push(m));
  G.startGame(st); P.tick(st, 1100); P.registerRep(st, 4); P.tick(st, 1100); E.togglePause(st); E.togglePause(st); P.registerRep(st, 4);
  const all = out.join('|');
  for (const w of ['เริ่มเกม', 'ท่าแรก', 'พัก', 'หยุดชั่วคราว', 'เล่นต่อ', 'จบเกม']) assert.ok(all.includes(w), 'ขาด: ' + w);
});

// ---------------------------------------------------------------- สรุปผล 7.x
const S1 = R('5.Game Results Summary', '7.1 Score Calculation.js');
const S2m = R('5.Game Results Summary', '7.2 Gameplay Assessment.js');
const S3 = R('5.Game Results Summary', '7.3 Total Score Display.js');
const S4 = R('5.Game Results Summary', '7.4 Gameplay Summary.js');
const S5 = R('5.Game Results Summary', '7.5 Play History.js');
const S6 = R('5.Game Results Summary', '7.6 Share Card.js');
const S7 = R('5.Game Results Summary', '7.7 Stats View.js');
const D1 = R('6.Dance Game', '8.1 Dance Chart.js');
const D2 = R('6.Dance Game', '8.2 Dance Judge.js');
const D3 = R('6.Dance Game', '8.3 Dance Result.js');

const res = (o) => ({ id: 'a', name: 'ท่า', targetReps: 10, repsDone: 10, targetDurationSec: 60, elapsedMs: 60000, completed: true, reason: 'timeout', ...o });

group('สรุปผล 7.1-7.5');
test('7.1 ทำครบ ไม่มีคะแนนท่าทาง = 100', () => assert.strictEqual(S1.scoreExercise(res()).score, 100));
test('7.1 ทำครึ่งเดียว = 50', () => assert.strictEqual(S1.scoreExercise(res({ repsDone: 5, completed: false })).score, 50));
test('7.1 ผสมคะแนนท่าทาง 60/40', () => assert.strictEqual(S1.scoreExercise(res({ repsDone: 5, completed: false, formScore: 100 })).score, 70));
test('7.1 โบนัสเร็วเฉพาะเมื่อครบด้วยจำนวนครั้ง และไม่เกิน 100', () => {
  assert.strictEqual(S1.scoreExercise(res({ reason: 'reps', elapsedMs: 0 })).score, 100);
  assert.ok(S1.timeBonus(res({ reason: 'reps', elapsedMs: 30000 })) === 5);
  assert.strictEqual(S1.timeBonus(res({ reason: 'timeout' })), 0);
});
test('7.1 ท่าที่ไม่ได้เล่นนับเป็น 0 และตัวคูณความยากไม่เกิน 100', () => {
  assert.strictEqual(S1.calculateScores([res()], { totalQueue: 2 }).totalScore, 50);
  assert.strictEqual(S1.calculateScores([res()], { difficulty: 'hard' }).totalScore, 100);
  assert.strictEqual(S1.calculateScores([res()], { difficulty: 'easy' }).totalScore, 90);
});
test('7.1 ไม่มีผลเลย = 0 ไม่ล้ม', () => assert.strictEqual(S1.calculateScores([], {}).totalScore, 0));
test('7.2 เกณฑ์เกรด 85/70/50', () => {
  assert.strictEqual(S2m.gradeFor(85).letter, 'A'); assert.strictEqual(S2m.gradeFor(84).letter, 'B');
  assert.strictEqual(S2m.gradeFor(70).letter, 'B'); assert.strictEqual(S2m.gradeFor(69).letter, 'C');
  assert.strictEqual(S2m.gradeFor(50).letter, 'C'); assert.strictEqual(S2m.gradeFor(49).letter, 'D');
});
test('7.2 ออกกลางคันไม่ให้เกรด D โหด', () => {
  const a = S2m.assessGameplay(S1.calculateScores([], { totalQueue: 2 }), { quit: true });
  assert.strictEqual(a.grade, 'เล่นยังไม่จบ'); assert.ok(a.advice[0].includes('ไม่เป็นไร'));
});
test('7.2 คะแนนตกช่วงท้าย = เตือนว่าล้า', () => {
  const sc = S1.calculateScores([res({ repScores: [95, 95, 92, 70, 65, 60] })], {});
  assert.ok(S2m.assessGameplay(sc).improvements.some((x) => x.includes('ช่วงท้าย')));
});
test('7.3 HTML escape ชื่อท่า และมีกราฟรายครั้ง', () => {
  const sc = S1.calculateScores([res({ name: '<b>x</b>', repScores: [90, 80, 70] })], {});
  const html = S3.renderTotalScoreHtml(sc, S2m.assessGameplay(sc));
  assert.ok(!html.includes('<b>x</b>')); assert.ok(html.includes('&lt;b&gt;')); assert.ok(html.includes('rep-chart'));
});
test('7.4 สรุปครบ + ท่าที่ควรฝึกซ้ำ (weakIds) รวมท่าที่ไม่ได้เล่น', () => {
  const st = playedState(); st.status = 'finished';
  st.results = [res({ id: 'basic_01', repsDone: 1, completed: false, reason: 'quit' })];
  const r = S4.summarizeGame(st, { formScores: { basic_01: 50 }, exerciseAdvice: { basic_01: ['เหยียดศอกให้ตรง'] }, repScores: { basic_01: [50] } });
  assert.deepStrictEqual(r.weakIds.sort(), ['basic_01', 'basic_04']);
  assert.ok(r.stats.quit); assert.ok(r.text.includes('วิธีแก้รายท่า'));
});
test('7.4 state ว่างไม่ล้ม', () => assert.ok(S4.summarizeGame(G.createGameState()).text.length > 0));


function stubCtx() {
  const texts = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k === 'texts' ? texts : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'fillText' ? (s) => texts.push(String(s)) : k in o ? o[k] : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return ctx;
}
const doneSummary = (over = {}) => {
  const st = playedState(); st.status = 'finished'; st.totalElapsedMs = 125000; st.playerName = 'เจ';
  st.results = [res({ id: 'basic_01', name: 'ยกแขนด้านข้าง', repsDone: 4, targetReps: 4, reason: 'reps', elapsedMs: 20000 }), res({ id: 'basic_04', name: 'ย่อเข่า', repsDone: 4, targetReps: 4, reason: 'reps', elapsedMs: 20000 })];
  return S4.summarizeGame({ ...st, ...over }, { formScores: { basic_01: 95, basic_04: 90 }, repScores: { basic_01: [95, 95], basic_04: [90, 90] } });
};
test('7.6 สร้างการ์ดแชร์: ข้อมูลและข้อความครบ', () => {
  const c = S6.buildShareCard(doneSummary(), { isNewBest: true, streakDays: 3, delta: 7 }, { now: Date.UTC(2026, 10, 9, 5) });
  assert.strictEqual(c.name, 'เจ'); assert.ok(c.score > 0); assert.strictEqual(c.tiles.length, 3);
  assert.ok(c.badges.length === 3 && c.badges[0].includes('คะแนนสูงสุด'));
  assert.ok(c.date.includes('2569')); assert.ok(c.text.includes('#MoveAndRelieve') && c.text.includes(`${c.score}/100`));
});
test('7.6 ชื่อว่าง = ไม่แสดงชื่อ, ชื่อยาวถูกตัด 24 ตัวอักษร', () => {
  assert.strictEqual(S6.buildShareCard(doneSummary(), null, { name: '' }).name, '');
  assert.ok(!S6.buildShareCard(doneSummary(), null, { name: '' }).text.startsWith(':'));
  assert.strictEqual(S6.buildShareCard(doneSummary(), null, { name: 'x'.repeat(60) }).name.length, 24);
});
test('7.6 ออกกลางคัน: ไม่โชว์เกรดโหด', () => {
  const st = playedState(); st.status = 'finished'; st.results = [res({ id: 'basic_01', repsDone: 1, reason: 'quit', completed: false })];
  const c = S6.buildShareCard(S4.summarizeGame(st), null);
  assert.ok(c.quit); assert.ok(!c.text.includes('เกรด'));
});
test('7.6 วาดการ์ดลง canvas ได้ไม่ล้ม และมีคะแนน/ชื่อแอป/สถิติ', () => {
  const ctx = stubCtx(); const c = S6.buildShareCard(doneSummary(), { streakDays: 2 });
  S6.drawShareCard(ctx, c, 1080, 1350);
  ['MOVE & RELIEVE', String(c.score), c.tiles[0].value].forEach((x) => assert.ok(ctx.texts.includes(x), 'ไม่พบข้อความ ' + x));
  const q = stubCtx(); S6.drawShareCard(q, S6.buildShareCard(S4.summarizeGame(G.createGameState()), null));
});

const hist = (n, f) => Array.from({ length: n }, (_, i) => f(i));
test('7.7 สถิติ: ตัวเลขรวม แนวโน้ม และแยกผู้เล่น', () => {
  const t0 = Date.UTC(2026, 0, 1, 12), day = 86400000;
  const list = hist(10, (i) => ({ at: t0 + i * day, player: i % 5 === 4 ? 'บี' : 'เอ', totalScore: 50 + i * 4, grade: 'ดี', totalReps: 10, totalTimeSec: 60, completed: 1, total: 1 }));
  const all = S7.summarize(list);
  assert.strictEqual(all.plays, 10); assert.strictEqual(all.best, 86); assert.strictEqual(all.totalReps, 100); assert.strictEqual(all.totalTimeSec, 600);
  assert.ok(all.trend > 0); assert.strictEqual(all.series.length, 10);
  assert.strictEqual(S7.summarize(list, 'บี').plays, 2);
  assert.deepStrictEqual(S7.players(list).sort(), ['บี', 'เอ']);
});
test('7.7 ไม่มีประวัติ = empty และข้อความแนะนำ', () => {
  const e = S7.summarize([]); assert.ok(e.empty); assert.ok(S7.headline(e).includes('ยังไม่มีประวัติ'));
});
test('7.7 ปฏิทิน 28 วัน เริ่มตรงวันจันทร์ (pad) และนับรอบ/คะแนนสูงสุดต่อวัน', () => {
  const now = Date.UTC(2026, 0, 28, 12), day = 86400000;
  const list = [{ at: now, player: 'เอ', totalScore: 70 }, { at: now + 1000, player: 'เอ', totalScore: 90 }, { at: now - day, player: 'เอ', totalScore: 40 }];
  const c = S7.calendar(list, 'เอ', now, 28);
  assert.strictEqual(c.cells.length, 28); assert.ok(c.pad >= 0 && c.pad <= 6);
  const today = c.cells[27]; assert.strictEqual(today.plays, 2); assert.strictEqual(today.best, 90);
  assert.strictEqual(c.cells[26].plays, 1); assert.strictEqual(c.cells[0].plays, 0);
});
test('7.5 ล้างประวัติ', () => {
  const m = { d: { [S5.KEY]: '[1]' }, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; }, removeItem(k) { delete this.d[k]; } };
  assert.ok(S5.clear(m)); assert.strictEqual(S5.load(m).length, 0);
  assert.strictEqual(S5.clear({ removeItem() { throw new Error('x'); } }), false);
});

group('โหมดแผ่นเต้น 8.1-8.3');
test('8.1 สร้างลำดับแผ่น: จำนวนก้าว เวลา และผลซ้ำได้เมื่อ seed เดียวกัน', () => {
  for (const k of Object.keys(D1.LEVELS)) {
    const c = D1.makeChart(k, 7), again = D1.makeChart(k, 7);
    assert.deepStrictEqual(c.notes, again.notes);
    assert.strictEqual(c.steps, D1.LEVELS[k].steps);
    assert.strictEqual(c.notes[0].t, D1.START_DELAY_MS);
    assert.ok(c.notes.every((n) => D1.PANELS.includes(n.id)));
    assert.ok(c.notes.every((n, i) => i === 0 || n.t >= c.notes[i - 1].t));
  }
  assert.throws(() => D1.makeChart('ไม่มี'), /ไม่มีระดับ/);
});
test('8.1 ไม่เหยียบแผ่นเดิมซ้ำติดกัน, ระดับง่ายไม่มีก้าวคู่, ระดับยากมีก้าวคู่, ก้าวคู่เป็นแผ่นต่างกัน', () => {
  const noRepeat = (c) => { const by = {}; c.notes.forEach((n) => (by[n.step] = by[n.step] || []).push(n.id)); const s = Object.keys(by).map(Number).sort((a, b) => a - b); return s.every((k, i) => i === 0 || !by[k].some((id) => by[s[i - 1]].includes(id))) && s.every((k) => new Set(by[k]).size === by[k].length); };
  let multiHard = 0;
  for (let seed = 1; seed <= 40; seed++) {
    assert.ok(noRepeat(D1.makeChart('easy', seed)) && noRepeat(D1.makeChart('hard', seed)));
    const e = D1.makeChart('easy', seed); assert.strictEqual(e.notes.length, e.steps);
    const h = D1.makeChart('hard', seed); multiHard += h.notes.length - h.steps;
  }
  assert.ok(multiHard > 0);
});
const mkNotes = () => [{ id: 'u', t: 1000, step: 0 }, { id: 'd', t: 2000, step: 1 }, { id: 'l', t: 3000, step: 2 }];
test('8.2 ตัดสินตามหน้าต่างเวลา PERFECT/GREAT/GOOD', () => {
  const g = new D2.DanceGame(mkNotes());
  assert.strictEqual(g.press('u', 1100).result, 'perfect');
  assert.strictEqual(g.press('d', 2200).result, 'great');
  assert.strictEqual(g.press('l', 3300).result, 'good');
  assert.deepStrictEqual(g.counts, { perfect: 1, great: 1, good: 1, miss: 0 });
});
test('8.2 เหยียบมั่ว: แผ่นผิด / เร็วเกิน ไม่ตัดสินทิ้งโน้ต (ให้เหยียบใหม่ได้) แต่นับ stray', () => {
  const g = new D2.DanceGame(mkNotes());
  assert.strictEqual(g.press('r', 1000), null);
  assert.strictEqual(g.press('u', 1000 - 400), null);
  assert.strictEqual(g.press('u', 1000 - 900), null);
  assert.strictEqual(g.stray, 3); assert.strictEqual(g.notes[0].done, false);
  assert.strictEqual(g.press('u', 1010).result, 'perfect');
});
test('8.2 tick: โน้ตที่เลยเวลาเป็น MISS ตัดคอมโบ, เหยียบซ้ำโน้ตเดิมไม่ได้คะแนนซ้ำ', () => {
  const g = new D2.DanceGame(mkNotes());
  g.press('u', 1000);
  assert.strictEqual(g.press('u', 1010), null);
  assert.strictEqual(g.combo, 1);
  assert.strictEqual(g.tick(2000).length, 0);
  assert.strictEqual(g.tick(2400).length, 1);
  assert.strictEqual(g.combo, 0); assert.strictEqual(g.counts.miss, 1);
  assert.strictEqual(g.tick(2400).length, 0);
});
test('8.2 คอมโบคูณคะแนน (สูงสุด x2) และความแม่นยำ', () => {
  assert.strictEqual(D2.comboMultiplier(0), 1); assert.strictEqual(D2.comboMultiplier(10), 1.1); assert.strictEqual(D2.comboMultiplier(999), 2);
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: 'u', t: 1000 + i * 1000, step: i }));
  const g = new D2.DanceGame(notes);
  notes.forEach((n) => g.press('u', n.t));
  const s = g.summary();
  assert.strictEqual(s.accuracy, 100); assert.strictEqual(s.maxCombo, 20);
  assert.ok(s.points > 20 * 100); assert.strictEqual(s.avgAbsMs, 0);
});
test('8.2 จบเกมเมื่อโน้ตตัดสินครบ หรือเลยเวลาโน้ตสุดท้าย', () => {
  const g = new D2.DanceGame(mkNotes());
  assert.strictEqual(g.finished(0), false);
  assert.strictEqual(g.finished(99999), true);
  const g2 = new D2.DanceGame(mkNotes()); g2.press('u', 1000); g2.press('d', 2000); g2.press('l', 3000);
  assert.strictEqual(g2.finished(3000), true);
  assert.strictEqual(new D2.DanceGame([]).accuracy(), 0);
});
test('8.2 เหยียบเร็ว/ช้าเฉลี่ย (bias) บอกทิศทางถูก', () => {
  const g = new D2.DanceGame(mkNotes()); g.press('u', 900); g.press('d', 1900); g.press('l', 2900);
  assert.ok(g.summary().biasMs <= -90);
  assert.ok(D3.advice(D3.buildResult('easy', g.summary())).some((x) => x.includes('เร็วกว่าจังหวะ')));
});
test('8.3 เกรดตามเกณฑ์เดียวกับโหมดท่า (85/70/50) และสรุปผล', () => {
  assert.strictEqual(D3.gradeOf(85).letter, 'A'); assert.strictEqual(D3.gradeOf(70).letter, 'B'); assert.strictEqual(D3.gradeOf(50).letter, 'C'); assert.strictEqual(D3.gradeOf(49).letter, 'D');
  const g = new D2.DanceGame(mkNotes()); g.press('u', 1000); g.press('d', 2000);
  const r = D3.buildResult('normal', g.summary());
  assert.strictEqual(r.levelTh, 'ปานกลาง'); assert.strictEqual(r.score, Math.round(r.accuracy));
});
test('8.3 การ์ดแชร์ของโหมดแผ่นเต้นวาดด้วย drawShareCard ของ 7.6 ได้', () => {
  const g = new D2.DanceGame(mkNotes()); mkNotes().forEach((n) => g.press(n.id, n.t));
  const r = D3.buildResult('hard', g.summary());
  const card = D3.buildDanceCard(r, { name: '  เจ  ', isBest: true, now: Date.UTC(2026, 10, 9, 5) });
  assert.strictEqual(card.name, 'เจ'); assert.ok(card.badges[0].includes('คะแนนสูงสุด'));
  assert.ok(card.text.includes('#MoveAndRelieve') && card.text.includes('ระดับยาก'));
  const ctx = stubCtx(); S6.drawShareCard(ctx, card, 1080, 1350);
  assert.ok(ctx.texts.includes('โหมดแผ่นเต้น') && ctx.texts.includes(String(r.score)));
  assert.strictEqual(D3.buildDanceCard(r, { name: '' }).name, '');
});
test('8.3 คะแนนสูงสุดต่อระดับ: รอบแรกไม่นับสถิติใหม่ รอบต่อไปที่สูงกว่านับ', () => {
  const m = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  assert.strictEqual(D3.recordBest(m, 'easy', 60).isBest, false);
  assert.strictEqual(D3.recordBest(m, 'easy', 50).isBest, false);
  const r = D3.recordBest(m, 'easy', 75); assert.ok(r.isBest); assert.strictEqual(r.best, 75);
  assert.strictEqual(D3.loadBest(m).easy, 75); assert.strictEqual(D3.loadBest(m).hard, undefined);
  assert.doesNotThrow(() => D3.recordBest({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, 'easy', 10));
});

const mem = () => ({ d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } });
const sum = (score, player = 'เจ') => ({ stats: { playerName: player, difficulty: 'normal', totalReps: 5, totalTimeSec: 10, completedExercises: 1, totalExercises: 1 },
  scores: { perExercise: [1], totalScore: score }, assessment: { grade: 'ดี' } });
test('7.5 เทียบรอบก่อน คะแนนสูงสุด และไม่ปนผู้เล่นคนอื่น', () => {
  const m = mem(); const day = 86400000, t0 = Date.UTC(2026, 0, 10, 12);
  S5.recordSession(m, sum(60), t0);
  S5.recordSession(m, sum(90, 'คนอื่น'), t0 + 1);
  const a = S5.recordSession(m, sum(75), t0 + day);
  assert.strictEqual(a.previousScore, 60); assert.strictEqual(a.delta, 15); assert.ok(a.isNewBest); assert.strictEqual(a.bestScore, 75);
});
test('7.5 นับวันติดต่อกัน', () => {
  const m = mem(); const day = 86400000, t0 = Date.UTC(2026, 0, 10, 12);
  [0, 1, 2].forEach((i) => S5.recordSession(m, sum(70), t0 + i * day));
  assert.strictEqual(S5.analyze(S5.load(m)).streakDays, 3);
  S5.recordSession(m, sum(70), t0 + 5 * day);
  assert.strictEqual(S5.analyze(S5.load(m)).streakDays, 1);
});
test('7.5 เก็บสูงสุด 50 รอบ และ storage พังก็ไม่ล้ม', () => {
  const m = mem(); for (let i = 0; i < 60; i++) S5.recordSession(m, sum(50), 1e12 + i);
  assert.strictEqual(S5.load(m).length, 50);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.doesNotThrow(() => S5.recordSession(bad, sum(50)));
});

// ---------------------------------------------------------------- ระบบ AI (ไม่ใช้กล้อง: คนจำลองขยับตามท่า)
group('ระบบ AI 1.2-1.5 (คนจำลอง)');
global.window = global;
const webDir = path.join(root, 'Web Testing System');
let tests = null, data = null;
try {
  require(path.join(webDir, 'data', 'exercises-data.js'));
  data = global.MR_EXERCISES_DATA;
  tests = require(path.join(webDir, 'js', 'tests.js'));
} catch (e) { test('โหลดระบบ AI', () => { throw e; }); }
if (tests && data) {
  tests.runAll(data).forEach(([ok, name, detail]) => test(name + (detail ? ' — ' + detail : ''), () => assert.ok(ok)));
  const MR = require(path.join(webDir, 'js', 'core.js'));
  data.exercises.forEach((ex) => test(`ท่า ${ex.id} "${ex.name}": คนจำลองทำท่าถูก นับครบตามเป้า`, () => {
    const reps = ex.counter.mode === 'hold' ? 1 : 3;
    const r = tests.playWithRunner(ex, reps, {});
    assert.ok(r.st.finished, 'ไม่จบภายในกรอบเวลา');
    assert.strictEqual(r.runner.analysis.reps, reps);
  }));
  test('ไฟล์ ai/ ในหน้าเกมตรงกับต้นฉบับใน Web Testing System', () => {
    for (const [from, to] of [['js/core.js', 'core.js'], ['js/camera.js', 'camera.js'], ['js/sys2core.js', 'sys2core.js'], ['js/sys2ui.js', 'sys2ui.js'], ['data/exercises-data.js', 'data/exercises-data.js'], ['data/poses-data.js', 'data/poses-data.js']]) {
      const a = fs.readFileSync(path.join(webDir, from)), b = fs.readFileSync(path.join(root, '3.Game Control System', 'ai', to));
      assert.ok(a.equals(b), `ai/${to} ไม่ตรงกับต้นฉบับ — รัน node build.js`);
    }
  });
test('ฝั่ง Python: exercises_full.json ตรงกับชุดท่าฝั่งเว็บ และ exercises.json เดิมไม่ถูกแก้ (5 ท่า)', () => {
    const py = path.join(root, '1.AI Posture Detection and Analysis (Additional)');
    const full = JSON.parse(fs.readFileSync(path.join(py, 'exercises_full.json'), 'utf8'));
    assert.deepStrictEqual(full.exercises.map((e) => e.id), data.exercises.map((e) => e.id));
    const orig = JSON.parse(fs.readFileSync(path.join(py, 'exercises.json'), 'utf8'));
    assert.strictEqual((orig.exercises || orig).length, 5);
  });
  void MR;
}

// ---------------------------------------------------------------- หน้าเกมที่ build แล้ว
group('หน้าเกม (Game Start.html)');
const html = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.html'), 'utf8');
test('สคริปต์ในหน้าเกมไม่มี syntax error', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2);
  scripts.forEach((m) => new Function(m[1]));
});
test('ฝังโมดูล 6.x และ 7.x ครบ', () => {
  for (const k of ['6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '8.1', '8.2', '8.3']) assert.ok(html.includes(`__src['${k}']`), 'ขาด ' + k);
});
test('โหมดแผ่นเต้น: dancepad.js มีแผ่นครบ 8 id ตรงกับ 8.1 และไฟล์ dance/ ซิงก์จาก "ส่วน ระบบ" แล้ว', () => {
  const src = path.join(root, 'ส่วน ระบบ', 'dancepad.js');
  if (!fs.existsSync(src)) return;
  const copy = path.join(root, '3.Game Control System', 'dance', 'dancepad.js');
  assert.ok(fs.existsSync(copy), 'ไม่พบ dance/dancepad.js — รัน build');
  assert.ok(fs.readFileSync(src).equals(fs.readFileSync(copy)), 'dance/dancepad.js ไม่ตรงกับต้นฉบับ — รัน build');
  const code = fs.readFileSync(src, 'utf8');
  const ids = [...code.matchAll(/\{ id: '(\w+)',\s+name:[^}]*pos: (\d)/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(ids, [...D1.PANELS].sort());
  const imgs = fs.readFileSync(path.join(root, '3.Game Control System', 'dance', 'images-data.js'), 'utf8');
  ['ซ้ายบน.jpg', 'ซ้าย.jpg', 'ขวาบน.jpg', 'ลง.jpg', 'ขึ้น.jpg', 'ซ้ายล่าง.jpg', 'ขวา.jpg', 'ขวาล่าง.jpg'].forEach((f) => assert.ok(imgs.includes('"' + f + '"'), 'ไม่มีรูป ' + f));
});
test('ไม่มีฟังก์ชัน speak ซ้ำ (ตัวหลังจะทับตัวแรก)', () => {
  assert.strictEqual((html.match(/function speak\(/g) || []).length, 1);
});
test('ท่าที่ AI ตรวจได้ครบ: ท่าในแคตตาล็อกที่มี AI ต้องมีข้อมูลใน exercises-data', () => {
  const dataIds = new Set(data.exercises.map((e) => e.id));
  const ai = ['basic_01','basic_02','basic_03','basic_04','basic_05','basic_06','basic_07','basic_08','basic_09','basic_10','neck-tilt','shoulder-roll','arm-stretch','seated-twist','upper-trap','wrist-stretch','wrist-circle'];
  ai.forEach((id) => { assert.ok(dataIds.has(id), 'ไม่มีข้อมูล AI: ' + id); assert.ok(S.getCatalog().some((c) => c.id === id), 'ไม่อยู่ในแคตตาล็อก: ' + id); });
});
test('ทุกท่าในแคตตาล็อกตรวจด้วย AI ได้ (หรือเป็นท่าของฉัน) — ท่าที่ AI ตรวจไม่ได้ถูกเอาออกแล้ว', () => {
  const dataIds = new Set(data.exercises.map((e) => e.id));
  const noAi = S.getCatalog().filter((c) => !c.custom && !dataIds.has(c.id)).map((c) => c.id);
  assert.deepStrictEqual(noAi, []);
});

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) { console.log('\nรายการที่ไม่ผ่าน:'); failures.forEach(([n, e]) => console.log(' - ' + n + '\n   ' + (e.stack || e).split('\n').slice(0, 3).join('\n   '))); process.exit(1); }
