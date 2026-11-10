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
const W1 = R('7.Wellness System', '9.1 Health Notice.js');
const W2 = R('7.Wellness System', '9.2 Routines.js');
const W3 = R('7.Wellness System', '9.3 Data Backup.js');
const W4 = R('7.Wellness System', '9.4 Pain Log.js');
const W5 = R('7.Wellness System', '9.5 Break Reminder.js');
const W6 = R('7.Wellness System', '9.6 Camera Check.js');
const D1 = R('6.Dance Game', '8.1 Dance Chart.js');
const D6 = R('6.Dance Game', '8.6 Step Ladder.js');
const D2 = R('6.Dance Game', '8.2 Dance Judge.js');
const D3 = R('6.Dance Game', '8.3 Dance Result.js');
const D5 = R('6.Dance Game', '8.5 Fire Feet.js');

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

group('ระบบสุขภาพ 9.1-9.6');
const memS = () => ({ d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } });
test('9.1 ข้อความเตือนสุขภาพ: ถามจนกว่าจะยอมรับ และถามใหม่เมื่อเนื้อหาเปลี่ยนรุ่น', () => {
  const m = memS();
  assert.strictEqual(W1.needsNotice(m), true);
  assert.ok(W1.accept(m)); assert.strictEqual(W1.needsNotice(m), false);
  m.setItem(W1.KEY, JSON.stringify({ version: W1.VERSION - 1, accepted: true }));
  assert.strictEqual(W1.needsNotice(m), true);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.strictEqual(W1.needsNotice(bad), true); assert.strictEqual(W1.accept(bad), false);
  assert.ok(W1.NOTICE.points.length >= 4 && W1.NOTICE.privacy.includes('ไม่ส่ง'));
});
test('9.2 ชุดท่าสำเร็จรูป: ทุกท่ามีในแคตตาล็อก, ไม่ซ้ำในชุดเดียวกัน, ประมาณเวลาสมเหตุสมผล', () => {
  const ids = S.getCatalog().map((c) => c.id);
  assert.ok(W2.ROUTINES.length >= 5);
  W2.ROUTINES.forEach((r) => {
    assert.strictEqual(W2.resolve(r, ids).length, r.ids.length, 'ท่าหายในชุด ' + r.id);
    assert.strictEqual(new Set(r.ids).size, r.ids.length);
    const items = W2.resolve(r, ids).map((x) => { const c = S.getCatalog().find((q) => q.id === x.id); return { reps: x.reps || c.reps }; });
    const mins = W2.estimateMinutes(items);
    assert.ok(mins >= 1 && mins <= 8, `${r.id}: ${mins} นาที`);
  });
  assert.strictEqual(W2.resolve({ ids: ['neck-tilt', 'ไม่มีท่านี้'] }, ids).length, 1);
  assert.strictEqual(W2.estimateMinutes([]), 0);
});
test('9.3 สำรอง/นำเข้า: ส่งออกแล้วนำเข้ากลับได้เหมือนเดิมทุกตัวอักษร และไม่แตะคีย์อื่น', () => {
  const a = memS();
  a.setItem('move-relieve-settings', '{"playerName":"เจ","demoSec":8}'); a.setItem('move-relieve-history', '[{"totalScore":90}]'); a.setItem('other-site-key', 'x');
  const text = W3.exportData(a, 123);
  assert.ok(!text.includes('other-site-key'));
  const b = memS(); b.setItem('other-site-key', 'keep'); b.setItem('move-relieve-pain', '[1]');
  const r = W3.importData(b, text);
  assert.ok(r.ok); assert.deepStrictEqual(r.restored.sort(), ['move-relieve-history', 'move-relieve-settings']);
  assert.strictEqual(b.getItem('move-relieve-settings'), '{"playerName":"เจ","demoSec":8}');
  assert.strictEqual(b.getItem('other-site-key'), 'keep'); assert.strictEqual(b.getItem('move-relieve-pain'), '[1]');
});
test('9.3 ไฟล์สำรองที่ผิด: ไม่ใช่ JSON / คนละรูปแบบ / เวอร์ชันใหม่กว่า / คีย์แปลก / ค่าเสียหาย ถูกปฏิเสธหรือข้ามอย่างปลอดภัย', () => {
  assert.strictEqual(W3.parseBackup('ไม่ใช่ json').ok, false);
  assert.strictEqual(W3.parseBackup('{"format":"x"}').ok, false);
  assert.ok(/ใหม่กว่า/.test(W3.parseBackup(JSON.stringify({ format: W3.FORMAT, version: 99, data: {} })).error));
  const mix = W3.parseBackup(JSON.stringify({ format: W3.FORMAT, version: 1, data: { 'move-relieve-history': '[]', evil: '1', 'move-relieve-pain': '{ไม่ใช่ json', 'move-relieve-settings': 5 } }));
  assert.ok(mix.ok); assert.deepStrictEqual(Object.keys(mix.data), ['move-relieve-history']); assert.strictEqual(mix.skipped.length, 3);
  assert.strictEqual(W3.parseBackup(JSON.stringify({ format: W3.FORMAT, version: 1, data: {} })).ok, false);
  const m = memS(); const w = W3.importData({ getItem() { return null; }, setItem() { throw new Error('เต็ม'); } }, W3.exportData(Object.assign(m, {})));
  assert.strictEqual(w.ok, false);
});
test('9.4 บันทึกอาการปวด: ตรวจช่วง 0-10, สรุปค่าเฉลี่ยที่ลดลง, ข้อความสรุป', () => {
  const m = memS();
  assert.strictEqual(W4.record(m, { player: 'เจ', before: 11, after: 2 }).ok, false);
  assert.strictEqual(W4.record(m, { player: 'เจ' }).ok, false);
  assert.strictEqual(W4.record(m, { player: 'เจ', before: 1.5 }).ok, false);
  assert.ok(W4.record(m, { player: 'เจ', before: 7, after: 4 }).ok); assert.ok(W4.record(m, { player: 'เจ', before: 5, after: 4 }).ok);
  assert.ok(W4.record(m, { player: 'เจ', before: 6 }).ok); assert.ok(W4.record(m, { player: 'คนอื่น', before: 3, after: 5 }).ok);
  const s = W4.summarize(W4.load(m), 'เจ');
  assert.strictEqual(s.count, 3); assert.strictEqual(s.pairs, 2); assert.strictEqual(s.avgDrop, 2); assert.strictEqual(s.improved, 2);
  assert.ok(W4.headline(s).includes('ลดลงเฉลี่ย 2'));
  assert.ok(W4.headline(W4.summarize(W4.load(m), 'คนอื่น')).includes('เพิ่มขึ้น'));
  assert.strictEqual(W4.headline(W4.summarize([], '')), '');
  for (let i = 0; i < 250; i++) W4.record(m, { player: 'x', after: 3 });
  assert.strictEqual(W4.load(m).length, 200);
});
test('9.5 เตือนให้พัก: ครบรอบเวลา/ช่วงเวลาทำงาน/เลื่อน/ปิดวันนี้/เริ่มรอบใหม่หลังเล่น', () => {
  const at = (h, mi = 0) => new Date(2026, 0, 5, h, mi).getTime();
  const r = W5.createReminder({ enabled: true, intervalMin: 60, startHour: 9, endHour: 18 }, null, at(10, 0));
  assert.strictEqual(r.due(at(10, 59)), false); assert.strictEqual(r.minutesLeft(at(10, 30)), 30);
  assert.strictEqual(r.due(at(11, 0)), true);
  r.snooze(at(11, 0), 10); assert.strictEqual(r.due(at(11, 5)), false); assert.strictEqual(r.due(at(11, 11)), true);
  r.markActive(at(11, 20)); assert.strictEqual(r.due(at(12, 0)), false); assert.strictEqual(r.due(at(12, 20)), true);
  r.dismissToday(at(12, 20)); assert.strictEqual(r.due(at(14, 0)), false);
  const next = new Date(2026, 0, 6, 10).getTime(); assert.strictEqual(r.due(next), true);
  const late = W5.createReminder({ enabled: true, intervalMin: 30 }, { lastAt: at(16, 0) }, at(17, 0)); assert.strictEqual(late.due(at(18, 30)), false);
  assert.strictEqual(W5.createReminder({ enabled: false }, { lastAt: 0 }, at(10)).due(at(15)), false);
  assert.strictEqual(W5.createReminder({ enabled: true }, { lastAt: at(23) }, at(10)).state.lastAt, at(10)); // เวลาในอนาคต = เริ่มนับใหม่
});
test('9.5 ช่วงเวลาทำงาน (รวมข้ามเที่ยงคืน) และค่าตั้งผิดปกติถูกปรับเป็นค่าเริ่มต้น', () => {
  const at = (h) => new Date(2026, 0, 5, h, 30).getTime();
  assert.ok(W5.inWorkHours(at(9), 9, 18) && !W5.inWorkHours(at(18), 9, 18) && !W5.inWorkHours(at(8), 9, 18));
  assert.ok(W5.inWorkHours(at(23), 22, 6) && W5.inWorkHours(at(3), 22, 6) && !W5.inWorkHours(at(12), 22, 6));
  const n = W5.normalize({ enabled: 1, intervalMin: 7, startHour: 99, endHour: 'x' });
  assert.deepStrictEqual(n, { enabled: true, intervalMin: 60, startHour: 9, endHour: 18 });
  const m = memS(); assert.ok(W5.saveState(m, { lastAt: 5 })); assert.strictEqual(W5.loadState(m).lastAt, 5); assert.strictEqual(W5.loadState(memS()), null);
});
const mkLm = (o = {}) => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (i, x, y, v = 0.99) => { lm[i] = { x, y, visibility: v }; };
  set(0, 0.5, 0.15); set(11, o.lx ?? 0.42, 0.3); set(12, o.rx ?? 0.58, 0.3);
  set(23, 0.45, 0.62, o.hips === false ? 0.1 : 0.99); set(24, 0.55, 0.62, o.hips === false ? 0.1 : 0.99);
  set(27, 0.45, 0.93, o.feet === false ? 0.1 : 0.99); set(28, 0.55, 0.93, o.feet === false ? 0.1 : 0.99);
  return lm;
};
test('9.6 ตัวช่วยตั้งกล้อง: ตำแหน่งดีผ่านครบ, ไกล/ใกล้/ชิดซ้าย/ไม่เห็นสะโพก บอกวิธีแก้ถูกทาง', () => {
  const ok = W6.evaluate(mkLm()); assert.strictEqual(ok.ready, true); assert.ok(ok.checks.every((c) => c.ok)); assert.strictEqual(W6.summary(ok), 'พร้อมเล่นแล้ว ✓');
  const far = W6.evaluate(mkLm({ lx: 0.47, rx: 0.53 })); assert.strictEqual(far.ready, false); assert.ok(far.checks.find((c) => c.id === 'distance').text.includes('เข้าใกล้'));
  const near = W6.evaluate(mkLm({ lx: 0.2, rx: 0.8 })); assert.ok(near.checks.find((c) => c.id === 'distance').text.includes('ถอย'));
  const left = W6.evaluate(mkLm({ lx: 0.1, rx: 0.3 })); assert.ok(left.checks.find((c) => c.id === 'center').text.includes('ขวา'));
  const nohip = W6.evaluate(mkLm({ hips: false })); assert.strictEqual(nohip.ready, false); assert.ok(W6.summary(nohip).includes('สะโพก'));
  const nofeet = W6.evaluate(mkLm({ feet: false })); assert.strictEqual(nofeet.ready, true); assert.strictEqual(nofeet.checks.find((c) => c.id === 'feet').ok, false);
  const none = W6.evaluate(null); assert.strictEqual(none.ready, false); assert.ok(none.checks[0].text.includes('ยังไม่พบ'));
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
group('บันไดความยากโหมดเหยียบ 8.6');
test('8.6 ขั้นบันได: เริ่มง่ายไปยาก ครบ 6 ขั้น ตรงกับระดับที่มีจริงของแผ่นเต้นและเท้าไฟ', () => {
  const D5l = R('6.Dance Game', '8.5 Fire Feet.js').LEVELS;
  assert.strictEqual(D6.STAGES.length, 6);
  assert.deepStrictEqual(D6.STAGES.map((s) => s.mode), ['dance', 'dance', 'dance', 'fire', 'fire', 'fire']);
  D6.STAGES.forEach((s) => assert.ok(s.mode === 'dance' ? D1.LEVELS[s.level] : D5l[s.level], 'ไม่มีระดับ ' + s.id));
  assert.strictEqual(D6.lastDanceIndex(), 2);
});
test('8.6 ผ่านขึ้นขั้น / ต่ำมากลงขั้น / กลางๆ อยู่ที่เดิม และไม่หลุดขอบ', () => {
  assert.strictEqual(D6.advance(0, 70), 1); assert.strictEqual(D6.advance(0, 69), 0); assert.strictEqual(D6.advance(3, 40), 3);
  assert.strictEqual(D6.advance(3, 39), 2); assert.strictEqual(D6.advance(0, 10), 0); assert.strictEqual(D6.advance(5, 100), 5);
  assert.strictEqual(D6.advance(99, 100), 5); assert.strictEqual(D6.advance('x', 100), 1);
});
test('8.6 บันทึก/โหลดขั้น และข้อความผลลัพธ์ storage พังก็ไม่ล้ม', () => {
  const m = memS();
  assert.strictEqual(D6.load(m).index, 0);
  const r = D6.record(m, 0, 85, 111); assert.deepStrictEqual([r.from, r.to, r.moved], [0, 1, 1]);
  assert.strictEqual(D6.load(m).index, 1); assert.strictEqual(D6.load(m).last.stage, 'dance-easy');
  assert.ok(D6.message(r).includes('เลื่อนขึ้น') && D6.message(r).includes('ปานกลาง'));
  const dn = D6.record(m, 1, 20); assert.ok(D6.message(dn).includes('ลดมาเล่น')); assert.strictEqual(D6.load(m).index, 0);
  assert.ok(D6.message(D6.record(m, 0, 55)).includes('อีกครั้ง'));
  m.setItem(D6.KEY, '{พัง'); assert.strictEqual(D6.load(m).index, 0);
  m.setItem(D6.KEY, JSON.stringify({ index: 99 })); assert.strictEqual(D6.load(m).index, 5);
  assert.ok(D6.message(D6.record(m, 5, 90)).includes('ขั้นสูงสุด'));
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.strictEqual(D6.load(bad).index, 0); assert.doesNotThrow(() => D6.record(bad, 0, 90));
});

group('โหมดนักเต้นเท้าไฟ 8.5');
const bySteps = (c) => { const o = {}; c.notes.forEach((n) => (o[n.step] = o[n.step] || []).push(n)); return Object.keys(o).map(Number).sort((a, b) => a - b).map((k) => o[k]); };
test('8.5 กราฟตรงจังหวะกลอง จำนวนก้าวครบ seed เดิมได้ผลเดิม และระดับแรกใช้เฉพาะลูกศร', () => {
  for (const k of Object.keys(D5.LEVELS)) {
    const c = D5.makeChart(k, 11), lv = D5.LEVELS[k];
    assert.deepStrictEqual(c, D5.makeChart(k, 11));
    const s = bySteps(c);
    assert.strictEqual(s.length, c.steps);
    s.forEach((g, i) => assert.strictEqual(g[0].t, Math.round((D5.COUNT_IN_BEATS + i * lv.every) * (60000 / lv.bpm))));
    assert.ok(c.notes.every((n) => lv.panels.includes(n.id)));
  }
  assert.ok(D5.makeChart('warm', 3).notes.every((n) => D5.ARROWS.includes(n.id)));
  assert.throws(() => D5.makeChart('nope'));
});
test('8.5 ก้าวได้จริง: สลับเท้าไม่ไขว้ขา ไม่ซ้ำแผ่น 2 ก้าวล่าสุด และเหยียบคู่เฉพาะคู่ที่ไม่ไขว้', () => {
  for (const k of Object.keys(D5.LEVELS)) for (let seed = 1; seed <= 25; seed++) {
    const s = bySteps(D5.makeChart(k, seed));
    s.forEach((g, i) => {
      if (g.length === 1) {
        const other = i % 2 === 0 ? D5.RIGHT : D5.LEFT;
        assert.ok(!other.includes(g[0].id), k + ': ก้าว ' + i + ' ไขว้ขา');
      } else {
        assert.strictEqual(g.length, 2);
        assert.ok(D5.PAIRS.some((p) => p.includes(g[0].id) && p.includes(g[1].id)), k + ': คู่ไขว้ขา');
      }
      [s[i - 1], s[i - 2]].filter(Boolean).forEach((prev) => g.forEach((n) => {
        if (k !== 'warm') assert.ok(!prev.some((q) => q.id === n.id), k + ': ซ้ำแผ่น ' + n.id);
      }));
    });
    assert.ok(k === 'warm' || s.some((g) => g.length === 2) || s.length < 50);
  }
});
test('8.5 ไม่มีเหยียบคู่บนแกนเดียวกัน (←+→, ↑+↓) เพราะแผ่นส่งได้ทีละทิศ', () => {
  for (const k of Object.keys(D5.LEVELS)) for (let seed = 1; seed <= 25; seed++) bySteps(D5.makeChart(k, seed)).forEach((g) => {
    const ids = g.map((n) => n.id);
    assert.ok(!(ids.includes('l') && ids.includes('r')) && !(ids.includes('u') && ids.includes('d')));
  });
});
test('8.5 รูปแผ่นบนกระดาน: หมุนเฉพาะแผ่นที่ต้องหมุน ไม่สับสนกับ hue-rotate (ลูกศรต้องชี้ถูกทิศ)', () => {
  const page = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.template.html'), 'utf8');
  assert.ok(page.includes('transform:rotate\\((-?\\d+)deg\\)'), 'ต้องอ่านเฉพาะ transform:rotate');
  assert.ok(!page.includes('rot=/rotate'), 'ห้ามจับ hue-rotate');
});
test('8.5 ไฟตามคอมโบ: ไม่มีคอมโบไม่มีไฟ แรงขึ้นตามคอมโบ เต็มที่ตามขีด และช่วงไฟลุกแรงเสมอ', () => {
  assert.strictEqual(D5.flameLevel(0), 0);
  assert.strictEqual(D5.flameLevel(D5.FLAME_START - 1), 0);
  assert.ok(D5.flameLevel(D5.FLAME_START) > 0);
  for (let c = D5.FLAME_START; c < D5.FLAME_FULL; c++) assert.ok(D5.flameLevel(c + 1) > D5.flameLevel(c));
  assert.strictEqual(D5.flameLevel(D5.FLAME_FULL), 1);
  assert.strictEqual(D5.flameLevel(999), 1);
  assert.strictEqual(D5.flameLevel(0, true), 0.75);
  assert.strictEqual(D5.flameTier(0), -1);
  assert.strictEqual(D5.FLAME_TIERS[D5.flameTier(D5.FLAME_FULL)].name, 'ลุกโชน!');
});
test('8.5 เปลวไฟ: ยิ่งคอมโบสูงไฟยิ่งเยอะและสูง ลอยขึ้น ไม่เกินเพดานอนุภาค และมอดเมื่อคอมโบขาด', () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const run = (lv) => { const f = new D5.FlameField(900, 900, { rand }); let top = 900; for (let i = 0; i < 180; i++) { f.update(1 / 60, lv); f.parts.forEach((p) => { top = Math.min(top, p.y); }); } return { n: f.parts.length, top, f }; };
  assert.strictEqual(run(0).n, 0, 'ไม่มีคอมโบต้องไม่มีไฟ');
  const low = run(0.15), high = run(1);
  assert.ok(high.n > low.n * 2, 'ไฟแรงต้องมีอนุภาคมากกว่า');
  assert.ok(high.top < low.top, 'ไฟแรงต้องลุกสูงกว่า');
  assert.ok(high.top < 450, 'ไฟเต็มที่ต้องลุกเกินครึ่งกระดาน');
  assert.ok(high.n <= 260, 'ไม่เกินเพดาน');
  const p = { ...high.f.parts[0] }; high.f.update(1 / 60, 1);
  const same = high.f.parts.find((q) => q.seed === p.seed);
  if (same) assert.ok(same.y < p.y, 'เปลวไฟต้องลอยขึ้น');
  for (let i = 0; i < 180; i++) high.f.update(1 / 60, 0);
  assert.strictEqual(high.f.parts.length, 0, 'คอมโบขาดแล้วไฟมอดหมด');
  const b = new D5.FlameField(900, 900, { rand }); b.burst(450, 450, 1);
  assert.ok(b.parts.length > 0);
  b.clear(); assert.strictEqual(b.parts.length, 0);
});
test('เพลงตามระดับ: ง่าย = slow · ปานกลาง = mid · ยาก = fast ทุกโหมด', () => {
  const D = R('3.Game Control System', '2.1 Start Game.js').DIFFICULTY;
  assert.deepStrictEqual([D.easy.music, D.normal.music, D.hard.music], ['slow', 'mid', 'fast']);
  const L = D5.LEVELS;
  assert.deepStrictEqual([L.warm.music, L.hot.music, L.blaze.music], ['slow', 'mid', 'fast']);
  const C = D1.LEVELS;
  assert.deepStrictEqual([C.easy.music, C.normal.music, C.hard.music], ['slow', 'mid', 'fast']);
  const page = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.template.html'), 'utf8');
  assert.ok(!page.includes("==='การยืดเหยียดร่างกาย')return 'slow'"), 'ท่ายืดเหยียดต้องไม่บังคับเพลงช้า');
});
test('เลือกเพลงโหมดเท้าไฟ: อัตโนมัติตามระดับ สุ่มทุกเพลง เลือกเพลงเดียว ปิดเพลง และเพลงที่ถูกลบกลับไปอัตโนมัติ', () => {
  const tracks = [{ u: 'a', g: 'slow' }, { u: 'b', g: 'mid' }];
  assert.strictEqual(D5.resolveSong('auto', 'warm', tracks), 'slow');
  assert.strictEqual(D5.resolveSong('auto', 'blaze', tracks), null, 'ระดับนี้ไม่มีเพลง ใช้กลองในเกม');
  assert.strictEqual(D5.resolveSong('auto', 'blaze', [...tracks, { u: 'c', g: '' }]), 'fast', 'เพลงในโฟลเดอร์หลักใช้แทนได้');
  assert.strictEqual(D5.resolveSong('all', 'blaze', tracks), 'all');
  assert.strictEqual(D5.resolveSong('b', 'warm', tracks), 'b', 'เลือกเพลงไหนได้เพลงนั้น แม้คนละระดับ');
  assert.strictEqual(D5.resolveSong('off', 'warm', tracks), null);
  assert.strictEqual(D5.resolveSong('gone', 'warm', tracks), 'slow', 'เพลงที่เคยเลือกถูกลบแล้ว');
  assert.strictEqual(D5.resolveSong('auto', 'warm', []), null);
});
test('เพลงขึ้น GitHub และเว็บได้: git ไม่ตัดไฟล์เพลง และ Pages สร้างเว็บรวมเพลง', () => {
  assert.ok(!/Music\/\*\*\/\*\.mp3/.test(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')));
  assert.ok(fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8').includes('--with-music'));
});
test('8.5 เล่นรอบละ 3 นาที: ก้าวเต็มเวลาทุกระดับ ก้าวสุดท้ายตัดสินทัน และจบตรงเวลา', () => {
  assert.strictEqual(D5.ROUND_MS, 180000);
  for (const k of Object.keys(D5.LEVELS)) {
    const c = D5.makeChart(k, 4), last = c.notes[c.notes.length - 1].t;
    assert.ok(last + D5.BLOCK_LATE_MS < D5.ROUND_MS, k + ': ก้าวสุดท้ายต้องตัดสินทันก่อนหมดเวลา');
    assert.ok(D5.ROUND_MS - last <= c.intervalMs + D5.BLOCK_LATE_MS, k + ': ต้องมีก้าวจนเกือบหมดเวลา');
    const g = new D5.FireFeetGame(c);
    assert.strictEqual(g.finished(D5.ROUND_MS - 1), false);
    assert.strictEqual(g.finished(D5.ROUND_MS), true);
    g.tick(D5.ROUND_MS);
    assert.ok(g.notes.every((n) => n.done), k + ': หมดเวลาแล้วต้องตัดสินครบทุกก้าว');
  }
});
test('8.5 นาฬิกา: แสดงเป็นนาที:วินาที เริ่ม 3:00 จบ 0:00', () => {
  assert.strictEqual(D5.formatClock(180000), '3:00');
  assert.strictEqual(D5.formatClock(179001), '3:00');
  assert.strictEqual(D5.formatClock(179000), '2:59');
  assert.strictEqual(D5.formatClock(60000), '1:00');
  assert.strictEqual(D5.formatClock(9000), '0:09');
  assert.strictEqual(D5.formatClock(1), '0:01');
  assert.strictEqual(D5.formatClock(0), '0:00');
  assert.strictEqual(D5.formatClock(-5), '0:00');
  const g = new D5.FireFeetGame(D5.makeChart('warm', 1));
  assert.strictEqual(g.timeLeft(-3000), D5.ROUND_MS, 'ระหว่างนับถอยหลังเวลายังไม่เดิน');
  assert.strictEqual(g.timeLeft(D5.ROUND_MS + 50), 0);
});
test('มาสคอตหน้าเมนู: ใช้วิดีโอพื้นโปร่งใส ไฟล์ครบ ไม่เหลือกบเดิม และขึ้นเว็บเฉพาะไฟล์ที่ใช้', () => {
  const dir = path.join(root, '3.Game Control System');
  const page = fs.readFileSync(path.join(dir, 'Game Start.template.html'), 'utf8');
  assert.ok(page.includes('src="vid/mascot.webm"') && page.includes('poster="vid/mascot.png"'));
  assert.ok(!page.includes('เท้ากบ') && !page.includes('มาสคอตกบ'), 'ต้องไม่เหลือกบเดิม');
  const webm = fs.readFileSync(path.join(dir, 'vid', 'mascot.webm')), png = fs.readFileSync(path.join(dir, 'vid', 'mascot.png'));
  assert.strictEqual(webm.readUInt32BE(0), 0x1a45dfa3, 'ต้องเป็นไฟล์ WebM');
  assert.ok(webm.length < 4 * 1048576, 'วิดีโอใหญ่เกินไปสำหรับหน้าเมนู');
  assert.strictEqual(png[25], 6, 'รูปนิ่งต้องมีช่องโปร่งใส');
  assert.ok(fs.readFileSync(path.join(dir, 'build-web.js'), 'utf8').includes("'mascot.webm', 'mascot.png'"));
});
test('Design System: มี token ครบทั้งสองธีม รองรับลดการเคลื่อนไหว และหน้าแรกเป็น Bento โดยไม่ซ่อนปุ่มเดิม', () => {
  const page = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.template.html'), 'utf8');
  const a = page.indexOf('<style id="mr-design-system">'), css = page.slice(a, page.indexOf('</style>', a));
  assert.ok(a > 0, 'ต้องมีชั้น Design System');
  for (const v of ['--background', '--surface', '--primary', '--text-primary', '--text-secondary', '--border']) assert.ok(css.includes(v + ':'), 'ขาด ' + v);
  assert.ok(css.includes('[data-theme=dark]') && css.includes('prefers-color-scheme:dark'), 'ต้องรองรับธีมมืด');
  assert.ok(css.includes('prefers-reduced-motion:reduce'), 'ต้องเคารพการลดการเคลื่อนไหว');
  assert.ok(css.includes('repeat(12,minmax(0,1fr))'), 'หน้าแรกต้องเป็น Bento 12 คอลัมน์');
  for (const id of ['m-start', 'm-level', 'm-dance', 'm-fire', 'm-stats', 'm-manage', 'm-set']) assert.ok(page.includes('id="' + id + '"'), 'ขาดปุ่ม ' + id);
  assert.ok(!/#m-[a-z]+\{[^}]*display:none/.test(css), 'ห้ามซ่อนปุ่มเมนู');
});
test('8.5 ระดับสูงใช้ครบ 8 แผ่น', () => {
  const ids = new Set(D5.makeChart('blaze', 5).notes.map((n) => n.id));
  assert.strictEqual(ids.size, 8);
});
test('8.5 บล็อก: เหยียบในช่วงนับว่าโดน นอกช่วงไม่นับ พ้นช่วงเป็น MISS', () => {
  const note = (t) => ({ level: 'warm', lead: 1500, beatMs: 500, notes: [{ id: 'l', t, step: 0 }] });
  assert.strictEqual(new D5.FireFeetGame(note(1000)).press('l', 1000 - D5.BLOCK_EARLY_MS).result, 'good');
  assert.strictEqual(new D5.FireFeetGame(note(1000)).press('l', 1000 + D5.BLOCK_LATE_MS).result, 'great');
  assert.strictEqual(new D5.FireFeetGame(note(1000)).press('l', 1000 - D5.BLOCK_EARLY_MS - 10), null);
  const g = new D5.FireFeetGame(note(1000));
  assert.strictEqual(g.tick(1000 + D5.BLOCK_LATE_MS).length, 0);
  assert.strictEqual(g.tick(1000 + D5.BLOCK_LATE_MS + 1).length, 1);
});
test('8.5 เกจความร้อน: เหยียบแม่นเต็มแล้วไฟลุก คะแนน x2 พลาดเกจลด และไฟลุกดับตามเวลา', () => {
  const notes = Array.from({ length: 30 }, (_, i) => ({ id: i % 2 ? 'l' : 'r', t: 1000 + i * 1000, step: i }));
  const g = new D5.FireFeetGame({ level: 'warm', lead: 1500, beatMs: 500, notes });
  const need = Math.ceil(100 / D5.HEAT_GAIN.perfect);
  for (let i = 0; i < need - 1; i++) g.press(notes[i].id, notes[i].t);
  assert.ok(g.heat > 80 && !g.onFire(notes[need - 2].t));
  const before = g.heat, miss = notes[need - 1];
  assert.strictEqual(g.tick(miss.t + D5.BLOCK_LATE_MS + 1).length, 1);
  assert.strictEqual(g.heat, before - D5.HEAT_LOSS);
  let i = need;
  while (!g.fireCount) { g.press(notes[i].id, notes[i].t); i++; }
  const start = notes[i - 1].t;
  assert.ok(g.onFire(start + 1));
  assert.ok(!g.onFire(start + D5.FIRE_MS), 'ดับเมื่อครบเวลา');
  const scoreBefore = g.score, plain = g.judge.score;
  g.press(notes[i].id, notes[i].t);
  assert.strictEqual(g.score - scoreBefore, (g.judge.score - plain) * 2, 'ช่วงไฟลุกคะแนนเป็นสองเท่า');
  const miss2 = notes[i + 1], heat = g.heat;
  g.tick(miss2.t + D5.BLOCK_LATE_MS + 1);
  assert.strictEqual(g.heat, heat, 'พลาดตอนไฟลุก เกจไม่ลด');
  assert.ok(g.onFire(miss2.t + D5.BLOCK_LATE_MS + 1) || notes[i].t + D5.FIRE_MS <= miss2.t);
});
test('8.5 เท้าวางค้างนับ GOOD เมื่อถึงจังหวะ เล่นจบแล้วสรุปผล ฉายา การ์ด และสถิติสูงสุด', () => {
  const c = D5.makeChart('warm', 9), g = new D5.FireFeetGame(c);
  c.notes.forEach((n) => {
    const hits = g.holdHits((id) => id === n.id, n.t);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].result, 'good');
  });
  assert.ok(g.notes.every((n) => n.done));
  assert.strictEqual(g.finished(c.notes[c.notes.length - 1].t), false, 'ก้าวหมดแล้วก็ยังไม่จบจนครบเวลา');
  const r = D5.buildResult('warm', g.summary());
  assert.strictEqual(r.accuracy, 40);
  assert.strictEqual(r.rank, D5.rankOf(40));
  const card = D5.buildCard(r, { name: 'เอ', now: Date.UTC(2026, 0, 2) });
  assert.strictEqual(card.tagline, 'โหมดนักเต้นเท้าไฟ');
  assert.ok(card.text.includes('เอ:') && card.text.includes('นักเต้นเท้าไฟ'));
  const m = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = v; } };
  assert.deepStrictEqual(D5.recordBest(m, 'warm', 100), { isBest: false, best: 100 });
  assert.deepStrictEqual(D5.recordBest(m, 'warm', 50), { isBest: false, best: 100 });
  assert.deepStrictEqual(D5.recordBest(m, 'warm', 200), { isBest: true, best: 200 });
  assert.strictEqual(D5.loadBest(m).warm, 200);
  assert.ok(fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.html'), 'utf8').includes("__src['8.5']"), 'รัน node build.js');
});

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
  // ตัวละครสอนต้องเป็นท่าที่ AI สแกนได้จริง: ป้อนท่าของตัวละครเข้าตัวตรวจเดียวกับตอนเล่นจริง
  data.exercises.forEach((ex) => test(`ตัวละครสอนท่า ${ex.id} "${ex.name}": ทำตามแล้ว AI นับได้ คะแนนผ่าน`, () => {
    const hold = ex.counter.mode === 'hold', want = hold ? 1 : 2;
    const runner = new MR.WorkoutRunner(ex, { reps: want });
    const secs = 3 + MR.demoTiming(ex).T * (want + 1.5);
    let last = null;
    for (let i = 0; i < secs * MR.SIM_FPS; i++) {
      const t = i / MR.SIM_FPS;
      last = runner.step(MR.teachPose(ex, t), 1000 + t, MR.SIM_W, MR.SIM_H);
      if (last.finished) break;
    }
    assert.ok(runner.analysis.reps >= want, `นับได้ ${runner.analysis.reps} ครั้ง ต้องได้ ${want}`);
    if (last.summary && last.summary.average != null) assert.ok(last.summary.average >= 70, `คะแนน ${last.summary.average}`);
  }));
  // ท่าปกติของคนจริงไม่ตรงเป๊ะ: เยื้องจากท่าเริ่มต้นเข้าหาเป้าหมาย แล้วทำท่าเต็มช่วง
  const playFrom = (ex, baseAdd, moveTo, secs = 40) => {
    const c = ex.counter, cn = [].concat(c.angle), dir = Math.sign(c.target_angle - c.start_angle), span = Math.abs(c.target_angle - c.start_angle);
    const base = c.start_angle + dir * span * baseAdd, r = new MR.WorkoutRunner(ex, { reps: 3, readySec: 1 });
    let out = null;
    for (let i = 0; i < 30 * secs; i++) {
      const u = i / 30, k = u % 3, phi = k < 0.5 ? 0 : k < 1.3 ? (k - 0.5) / 0.8 : k < 1.8 ? 1 : k < 2.6 ? 1 - (k - 1.8) / 0.8 : 0;
      const a = MR.teachAngles(ex, 0); cn.forEach((n) => { a[n] = base + dir * span * moveTo * (i / 30 >= 1 ? phi : 0); });
      out = r.step(MR.poseFromAngles(a, []), 1000 + u, MR.SIM_W, MR.SIM_H);
      if (out.finished) break;
    }
    return r.analysis.reps;
  };
  const ANGLE_OK = (ex) => ex.counter.mode !== 'hold';
  test('ท่าปกติของผู้เล่นเยื้องเล็กน้อย: เอียงคอยังนับได้ (เดิมเยื้อง 8 องศาก็นับไม่ได้เลย)', () => {
    const ex = data.exercises.find((e) => e.id === 'neck-tilt');
    for (const off of [0, 0.25, 0.4, 0.5, 0.7]) assert.strictEqual(playFrom(ex, off, 1), 3, 'เยื้อง ' + off);
  });
  test('นับจากท่าปกติแล้วยังไม่หลวมเกินไป: ทุกท่ายืนนิ่งไม่ถูกนับ ขยับนิดเดียวไม่ถูกนับ', () => {
    data.exercises.filter(ANGLE_OK).forEach((ex) => {
      for (const off of [0, 0.3, 0.6]) {
        assert.strictEqual(playFrom(ex, off, 0, 15), 0, ex.id + ': ยืนนิ่งเยื้อง ' + off + ' ต้องไม่นับ');
        assert.strictEqual(playFrom(ex, off, 0.3, 15), 0, ex.id + ': ขยับ 30% ของช่วงท่า ต้องไม่นับ');
      }
    });
  });
  // เอียงจริงทั้งสองทิศจากท่าปกติที่เยื้อง: buildPose รับองศาติดลบได้ (เอียงอีกข้าง)
  const tiltFrom = (ex, base, swing, param) => {
    const r = new MR.WorkoutRunner(ex, { reps: 3, readySec: 1 });
    for (let i = 0; i < 30 * 40; i++) {
      const u = i / 30, k = u % 3, phi = u < 1 ? 0 : k < 0.5 ? 0 : k < 1.3 ? (k - 0.5) / 0.8 : k < 1.8 ? 1 : k < 2.6 ? 1 - (k - 1.8) / 0.8 : 0;
      if (r.step(MR.buildPose({ [param]: base + swing * phi }), 1000 + u, MR.SIM_W, MR.SIM_H).finished) break;
    }
    return r.analysis.reps;
  };
  test('เอียงคอ: ท่าปกติเยื้องข้างไหนก็ตาม เอียงซ้ายหรือขวาก็นับ (ไม่หลงเพราะมุมวิ่งผ่านแนวตรง)', () => {
    const ex = data.exercises.find((e) => e.id === 'neck-tilt');
    for (const base of [-12, -6, 0, 6, 12]) for (const swing of [-20, 20]) assert.strictEqual(tiltFrom(ex, base, swing, 'headTilt'), 3, 'ท่าปกติ ' + base + ' เอียง ' + swing);
    for (const base of [-12, 0, 12]) for (const swing of [-5, 5]) assert.strictEqual(tiltFrom(ex, base, swing, 'headTilt'), 0, 'เอียงนิดเดียวต้องไม่นับ');
  });
  test('เอียงลำตัว: นับได้ทั้งสองข้างจากท่าปกติที่เยื้อง และยืนนิ่งไม่นับ', () => {
    const ex = data.exercises.find((e) => e.id === 'basic_05');
    for (const base of [-5, 0, 5]) { for (const swing of [-20, 20]) assert.strictEqual(tiltFrom(ex, base, swing, 'tilt'), 3, 'ท่าปกติ ' + base + ' เอียง ' + swing); assert.strictEqual(tiltFrom(ex, base, 0, 'tilt'), 0); }
  });
  test('ตอนวัดท่าปกติผู้เล่นอยู่กลางท่า แล้วกลับสู่ท่าเริ่มต้น: ปรับตาม ไม่ต้องขยับไกลเกินจริง', () => {
    const ex = data.exercises.find((e) => e.id === 'basic_07'), r = new MR.WorkoutRunner(ex, { reps: 3, readySec: 1 });
    const pose = (v) => { const a = MR.teachAngles(ex, 0); a.left_shrug = a.right_shrug = v; return MR.poseFromAngles(a, []); };
    const mid = ex.counter.start_angle + (ex.counter.target_angle - ex.counter.start_angle) * 0.4;
    for (let i = 0; i < 45; i++) r.step(pose(mid), 1000 + i / 30, MR.SIM_W, MR.SIM_H);
    assert.notStrictEqual(r.analyzer.start, r.analyzer.start0, 'วัดได้ท่ากลางทางตอนแรก');
    for (let i = 45; i < 90; i++) r.step(pose(ex.counter.start_angle + 2), 1000 + i / 30, MR.SIM_W, MR.SIM_H);
    assert.ok(Math.abs(r.analyzer.start - r.analyzer.start0) < 2, 'กลับสู่ท่าเริ่มต้นแล้วใช้ค่าเดิม (คลาดเคลื่อนเล็กน้อยจากการกรองสัญญาณ)');
    assert.ok(Math.abs(r.analyzer.target - r.analyzer.target0) < 2);
  });
  test('ท่าปกติไม่ทำให้ท่าช่วงกว้างยากขึ้น: ยกแขนยังใช้เป้าหมายเดิม', () => {
    const ex = data.exercises.find((e) => e.id === 'basic_01'), a = new MR.PoseAnalyzer(ex);
    a.setRest(30);
    assert.strictEqual(a.target, ex.counter.target_angle);
    assert.strictEqual(a.start, 30);
    a.setRest(5);
    assert.strictEqual(a.start, a.start0, 'ตรงกว่าท่าเริ่มต้น ใช้ค่าเดิม');
  });
  test('ตัวละครสอนยืนตัวตรงตอนเริ่ม และเท้าติดพื้นตลอดทุกท่า', () => {
    const at = (lm, n) => lm[MR.LANDMARK_NAMES.indexOf(n)];
    const floor = at(MR.buildPose({}), 'left_ankle').y;
    data.exercises.forEach((ex) => {
      const T = MR.demoTiming(ex).T;
      for (let t = 0; t < T * 2; t += 0.1) {
        const lm = MR.teachPose(ex, t), low = Math.max(at(lm, 'left_ankle').y, at(lm, 'right_ankle').y);
        assert.ok(Math.abs(low - floor) < 1e-9, `${ex.id}: เท้าไม่ติดพื้นที่ t=${t}`);
      }
      const rest = MR.teachPose(ex, 0), midSh = (at(rest, 'left_shoulder').x + at(rest, 'right_shoulder').x) / 2;
      assert.ok(Math.abs(midSh - 0.5) < 0.002, `${ex.id}: ลำตัวเอียงตอนเริ่ม`);
    });
  });
  test('ตัวละครสอนขยับต่อเนื่อง ไม่กระโดดระหว่างเฟรม (รวมตอนสลับข้าง)', () => {
    data.exercises.forEach((ex) => {
      const T = MR.demoTiming(ex).T;
      let prev = null;
      for (let t = 0; t < T * 2.5; t += 1 / 60) {
        const lm = MR.teachPose(ex, t);
        if (prev) lm.forEach((q, i) => {
          const d = Math.hypot((q.x - prev[i].x) * MR.SIM_W, (q.y - prev[i].y) * MR.SIM_H);
          assert.ok(d < 14, `${ex.id}: จุด ${MR.LANDMARK_NAMES[i]} กระโดด ${d.toFixed(1)}px ที่ t=${t.toFixed(2)}`);
        });
        prev = lm;
      }
    });
  });
  test('หุ่น 3D: โมเดลมีกระดูกครบ ไฟล์ไม่ใหญ่เกิน และฝังตรงกับ models/teacher.glb', () => {
    const glb = fs.readFileSync(path.join(webDir, 'models', 'teacher.glb'));
    assert.strictEqual(glb.toString('ascii', 0, 4), 'glTF');
    assert.ok(glb.length < 12 * 1048576, 'โมเดลใหญ่เกินไปสำหรับหน้าเว็บ');
    const j = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
    assert.strictEqual(j.skins.length, 1);
    const names = j.skins[0].joints.map((n) => j.nodes[n].name);
    ['hips', 'spine', 'chest', 'neck', 'head'].concat(...['L', 'R'].map((s) => ['clavicle', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'].map((b) => b + s))).forEach((n) => assert.ok(names.includes(n), 'ขาดกระดูก ' + n));
    const s = fs.readFileSync(path.join(webDir, 'vendor', 'teacher-data.js'), 'utf8');
    assert.ok(Buffer.from(s.slice(s.indexOf('"') + 1, s.lastIndexOf('"')), 'base64').equals(glb), 'รัน node build.js');
  });
  test('หุ่น 3D: ผิวไม่ฉีก — จุดที่อยู่ติดกันมีน้ำหนักกระดูกใกล้กัน และหัวแข็งทั้งชิ้น', () => {
    const glb = fs.readFileSync(path.join(webDir, 'models', 'teacher.glb')), jl = glb.readUInt32LE(12), j = JSON.parse(glb.toString('utf8', 20, 20 + jl)), bin = 28 + jl;
    const prim = j.meshes[0].primitives[0], names = j.skins[0].joints.map((n) => j.nodes[n].name);
    const read = (idx, size) => { const a = j.accessors[idx], v = j.bufferViews[a.bufferView], o = bin + (v.byteOffset || 0) + (a.byteOffset || 0), st = v.byteStride || size; return { a, get: (i, k, fn) => glb[fn](o + i * st + k * (fn === 'readFloatLE' ? 4 : fn === 'readUInt16LE' ? 2 : 1)) }; };
    const P = read(prim.attributes.POSITION, 12), W = read(prim.attributes.WEIGHTS_0, 16), J = j.accessors[prim.attributes.JOINTS_0], Jr = read(prim.attributes.JOINTS_0, J.componentType === 5123 ? 8 : 4), fn = J.componentType === 5123 ? 'readUInt16LE' : 'readUInt8';
    const n = P.a.count, bones = (i) => { const o = {}; for (let k = 0; k < 4; k++) { const w = W.get(i, k, 'readFloatLE'); if (w > 0) o[Jr.get(i, k, fn)] = w; } return o; };
    const cell = 0.006, grid = new Map(); for (let i = 0; i < n; i += 3) { const key = [0, 1, 2].map((c) => Math.floor(P.get(i, c, 'readFloatLE') / cell)).join(); (grid.get(key) || grid.set(key, []).get(key)).push(i); }
    const diffs = []; grid.forEach((l) => { for (let a = 0; a + 1 < l.length; a += 2) { const A = bones(l[a]), B = bones(l[a + 1]); let d = 0; new Set([...Object.keys(A), ...Object.keys(B)]).forEach((k) => { d += Math.abs((A[k] || 0) - (B[k] || 0)); }); diffs.push(d); } });
    diffs.sort((a, b) => a - b);
    assert.ok(diffs.length > 1000, 'ตัวอย่างน้อยเกินไป');
    const p99 = diffs[Math.floor(diffs.length * 0.99)];
    assert.ok(p99 < 0.45, 'จุดติดกันน้ำหนักต่างกันมาก เสี่ยงผิวฉีก: ' + p99.toFixed(2));
    const head = names.indexOf('head'); let checked = 0;
    for (let i = 0; i < n; i += 5) if (P.get(i, 1, 'readFloatLE') > 0.2) { checked++; assert.ok((bones(i)[head] || 0) > 0.99, 'หัวต้องแข็งทั้งชิ้น'); }
    assert.ok(checked > 100);
  });
  test('หุ่น 3D: ทิศกระดูกตรงกับท่าที่ AI ตรวจทุกท่า ความยาวเป็นหนึ่ง และยกไหล่ไม่ทำให้หัวก้ม', () => {
    const T = require(path.join(webDir, 'js', 'teacher3d.js'));
    const at = (lm, n) => lm[MR.LANDMARK_NAMES.indexOf(n)];
    data.exercises.forEach((ex) => {
      const tm = MR.demoTiming(ex);
      for (const t of [0, tm.L + tm.U + tm.hold / 2]) {
        const lm = MR.teachPose(ex, t), { dirs, yaw } = T.teacherBoneDirs(lm, MR.LANDMARK_NAMES);
        assert.ok(yaw >= 0 && yaw < Math.PI / 2 + 0.01, ex.id + ': การบิดตัวผิดช่วง');
        for (const n in dirs) {
          assert.ok(Math.abs(Math.hypot(...dirs[n]) - 1) < 1e-6, ex.id + ' ' + n + ' ต้องเป็นทิศความยาว 1');
          assert.ok(dirs[n].every(Number.isFinite), ex.id + ' ' + n);
        }
        assert.strictEqual(dirs.head[2], 0, ex.id + ': หัวต้องไม่ก้มเข้าหากล้องเอง');
        // แขนบนจอต้องชี้ทางเดียวกับจุดของ AI (x บนจอไปทางเดียวกัน, y กลับด้านเพราะจอ y ลง)
        ['L', 'R'].forEach((s) => {
          const n = s === 'L' ? 'left' : 'right', S = at(lm, n + '_shoulder'), E = at(lm, n + '_elbow'), d = dirs['upperarm' + s];
          const ex2 = (E.x - S.x) * 1280, ey2 = -(E.y - S.y) * 720, len = Math.hypot(ex2, ey2) || 1;
          assert.ok(Math.abs(d[0] - ex2 / 90) < 0.02 && Math.abs(d[1] - ey2 / 90) < 0.02 || len >= 90, ex.id + ': แขนไม่ตรงกับท่า');
        });
      }
    });
    const up = T.teacherBoneDirs(MR.buildPose({}), MR.LANDMARK_NAMES).dirs.spine;
    assert.ok(up[1] > 0.99, 'ท่ายืนตรง ลำตัวต้องชี้ขึ้น');
  });
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
  for (const k of ['6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '8.1', '8.2', '8.3', '8.6', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6']) assert.ok(html.includes(`__src['${k}']`), 'ขาด ' + k);
});
// จำลองแผ่นเต้น: ควบคุมเวลาและสัญญาณเอง เพื่อทดสอบลูปอ่านแผ่นโดยไม่ต้องมีฮาร์ดแวร์
function fakePad(map) {
  const vm = require('vm');
  const env = { now: 0, buttons: [], axes: [0, 0, 0, 0], intervals: new Map(), nextId: 1, timers: [], store: { 'dancepad-map-v6': JSON.stringify(map) } };
  const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, postMessage() {} };
  const sandbox = {
    window, console, CustomEvent: class {},
    performance: { now: () => env.now },
    navigator: { getGamepads: () => [{ connected: true, id: 'fake', mapping: '', axes: env.axes, buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: env.buttons.includes(i), value: env.buttons.includes(i) ? 1 : 0 })) }] },
    localStorage: { getItem: (k) => (k in env.store ? env.store[k] : null), setItem: (k, v) => { env.store[k] = v; }, removeItem: (k) => { delete env.store[k]; } },
    setInterval: (fn, ms) => { const id = env.nextId++; env.intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => env.intervals.delete(id),
    setTimeout: (fn) => { env.timers.push(fn); return 0; }, requestAnimationFrame: () => { throw new Error('ต้องไม่ผูกกับเฟรมภาพ'); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'ส่วน ระบบ', 'dancepad.js'), 'utf8'), sandbox);
  const pad = window.DancePad.create({ single: true, bridge: false });
  env.run = (ms) => { for (let t = 0; t < ms; t += 8) { env.now += 8; env.intervals.forEach((x) => x.fn()); } };
  return { pad, env };
}
test('แผ่นเต้น: อ่านแผ่นด้วยตัวจับเวลาเดียว เริ่มซ้ำไม่เปิดลูปซ้อน หยุดแล้วปิดลูป', () => {
  const { pad, env } = fakePad({ l: 'b0' });
  pad.start(); pad.start();
  assert.strictEqual(env.intervals.size, 1);
  pad.stop();
  assert.strictEqual(env.intervals.size, 0);
  pad.start();
  assert.strictEqual(env.intervals.size, 1);
});
test('แผ่นเต้น: สัญญาณกระตุกแว็บเดียวไม่นับ เหยียบจริงนับครั้งเดียว และบอกเวลาที่เท้าแตะแผ่น', () => {
  const { pad, env } = fakePad({ l: 'b0' });
  const got = []; pad.on('press', (e) => got.push(e));
  pad.start(); env.run(16);
  env.buttons = [0]; env.run(8); env.buttons = []; env.run(40);
  assert.strictEqual(got.length, 0, 'กระตุก 1 รอบอ่าน ไม่นับ');
  const touch = env.now + 8;
  env.buttons = [0]; env.run(100);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].t, touch, 'เวลาเหยียบคือตอนสัญญาณเริ่มติด ไม่ใช่ตอนยืนยัน');
  assert.strictEqual(pad.isDown('l'), true);
});
test('แผ่นเต้น: สัญญาณสั่นตอนเหยียบค้างไม่นับซ้ำ ปล่อยแล้วเหยียบใหม่นับเพิ่ม และหยุดแล้วไม่ค้างสถานะ', () => {
  const { pad, env } = fakePad({ l: 'b0' });
  const got = []; pad.on('press', (e) => got.push(e));
  pad.start(); env.buttons = [0]; env.run(40);
  env.buttons = []; env.run(24); env.buttons = [0]; env.run(40);
  assert.strictEqual(got.length, 1, 'สั่นสั้นกว่าช่วงหน่วงปล่อย');
  env.buttons = []; env.run(200);
  assert.strictEqual(pad.isDown('l'), false);
  env.buttons = [0]; env.run(40);
  assert.strictEqual(got.length, 2);
  pad.stop();
  assert.strictEqual(pad.isDown('l'), false);
});
test('แผ่นเต้น: แผ่นที่ส่งทางแกนหรือปุ่มเลข 8 ขึ้นไปเหยียบติด (เกมต้องไม่จำกัดสัญญาณ)', () => {
  const { pad, env } = fakePad({ u: 'a1-', d: 'a1+', l: 'b9' });
  const got = []; pad.on('press', (e) => got.push(e.id));
  pad.start();
  env.axes[1] = -1; env.run(40); env.axes[1] = 0; env.run(200);
  env.axes[1] = 1; env.run(40); env.axes[1] = 0; env.run(200);
  env.buttons = [9]; env.run(40);
  assert.deepStrictEqual(got, ['u', 'd', 'l']);
  const page = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.template.html'), 'utf8');
  assert.ok(page.includes('DancePad.create({single:true})'), 'หน้าเกมต้องอ่านทุกปุ่มและแกน');
  assert.ok(fs.readFileSync(path.join(root, 'ส่วน ระบบ', 'index.html'), 'utf8').includes('DancePad.create({single:true})'), 'หน้าตั้งค่าต้องอ่านเหมือนหน้าเกม');
});
test('แผ่นเต้น: ตั้งค่าแผ่นผูกแกนได้ ไม่ผูกสัญญาณกระตุก และแผ่นที่ส่งหลายปุ่มซ้ำแผ่นอื่นใช้ลายเซ็นหลายปุ่ม', () => {
  const { pad, env } = fakePad({ x: 'b0', u: 'b1' });
  pad.start();
  pad.bindOne('l'); env.run(16);
  env.buttons = [7]; env.run(40); env.buttons = []; env.axes[0] = -1; env.run(400); env.axes[0] = 0; env.run(100);
  assert.strictEqual(pad.map.l, 'a0-', 'ปุ่มแว็บ b7 ต้องไม่ถูกผูก');
  pad.bindOne('o'); env.run(16);
  env.buttons = [0, 1, 2]; env.run(400); env.buttons = []; env.run(100);
  assert.strictEqual(pad.map.o, 'b0&b1&b2');
  const got = []; pad.on('press', (e) => got.push(e.id));
  env.buttons = [0, 1, 2]; env.run(40);
  assert.deepStrictEqual(got, ['o'], 'เหยียบแผ่นที่ส่งหลายปุ่ม ไม่ติดแผ่นข้างเคียง');
});
test('แผ่นเต้น: กดตั้งค่าแผ่นแล้วออกหรือยกเลิกกลางคัน ค่าเดิมต้องไม่หาย ตั้งครบแล้วจึงเปลี่ยน', () => {
  const old = { x: 'b0', u: 'b1' };
  const { pad, env } = fakePad(old);
  const saved = () => JSON.parse(env.store['dancepad-map-v6']);
  pad.start();
  pad.bindAll();
  while (env.timers.length) env.timers.shift()();
  assert.strictEqual(pad.mode, 'map');
  assert.deepStrictEqual(saved(), old, 'ออกจากหน้าตอนนี้ ค่าเดิมยังอยู่');
  env.run(16); env.buttons = [5]; env.run(400); env.buttons = []; env.run(100);
  assert.deepStrictEqual(saved(), old, 'ผูกไปบางแผ่นแล้วก็ยังไม่ทับค่าเดิม');
  pad.cancel();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pad.map)), old, 'ยกเลิกแล้วกลับไปใช้ค่าเดิม');
  pad.bindAll();
  while (env.timers.length) env.timers.shift()();
  env.run(16);
  for (let i = 0; i < 8; i++) { env.buttons = [i]; env.run(400); env.buttons = []; env.run(100); }
  assert.strictEqual(pad.mode, 'free');
  assert.strictEqual(saved().sq, 'b7', 'ผูกครบแล้วบันทึกค่าใหม่');
});
test('AI Worker: ช่วงที่ยังไม่นับครั้งยังแสดงโครงกระดูก และ Worker ใช้ไม่ได้ต้องกลับไปรันบนหน้าเว็บ', () => {
  const page = fs.readFileSync(path.join(root, '3.Game Control System', 'Game Start.template.html'), 'utf8');
  assert.ok(page.includes('runnerIdx=-2;}aiPreview();}'), 'ช่วงดูท่าตัวอย่างต้องแสดงโครงกระดูก');
  assert.ok(page.includes("$('mfill').style.width='0';aiPreview();"), 'ช่วงนับถอยหลังและพักต้องแสดงโครงกระดูก');
  const cam = fs.readFileSync(path.join(root, 'Web Testing System', 'js', 'camera.js'), 'utf8');
  assert.ok(cam.includes('++this.fails >= 5) this.dropWorker()'), 'ตรวจพลาดติดกันต้องเปลี่ยนวิธี');
  assert.ok(cam.includes('this.busyAt > 5000) { this.dropWorker()'), 'ผลไม่กลับมาต้องเปลี่ยนวิธี');
  assert.ok(cam.includes('new ImageData(256, 256)'), 'ต้องอุ่นเครื่อง AI ตอนโหลด');
});
test('AI Worker: vision-b64.js ตรงกับ vision.js', () => {
  const vendor = path.join(root, 'Web Testing System', 'vendor');
  const s = fs.readFileSync(path.join(vendor, 'vision-b64.js'), 'utf8');
  const b64 = s.slice(s.indexOf('"') + 1, s.lastIndexOf('"'));
  assert.ok(Buffer.from(b64, 'base64').equals(fs.readFileSync(path.join(vendor, 'vision.js'))), 'รัน node build.js');
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

test('เริ่มโดยนับถอยหลัง 0 วินาทีต้องเปิดท่าแรกและนับจนจบได้', () => {
  const state = G.createGameState({ countdownSec: 0 });
  S.selectExercise(state, S.getCatalog()[0].id, { reps: 1, durationSec: 60 });
  G.startGame(state);
  assert.strictEqual(state.status, 'playing');
  P.tick(state, 16);
  assert.strictEqual(state.currentIndex, 0);
  assert.ok(state.current);
  P.registerRep(state);
  assert.strictEqual(state.status, 'finished');
  assert.strictEqual(state.results[0].repsDone, 1);
});

test('สำรองและนำเข้าคะแนนเท้าไฟกับระดับเล่นต่อเนื่องได้', () => {
  const values = { 'move-relieve-firefeet-best': '{"easy":1200}', 'move-relieve-ladder': '{"index":2}' };
  const text = W3.exportData({ getItem: key => values[key] ?? null });
  const restored = {};
  const result = W3.importData({ setItem: (key, value) => { restored[key] = value; } }, text);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(restored, values);
});

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail) { console.log('\nรายการที่ไม่ผ่าน:'); failures.forEach(([n, e]) => console.log(' - ' + n + '\n   ' + (e.stack || e).split('\n').slice(0, 3).join('\n   '))); process.exit(1); }
