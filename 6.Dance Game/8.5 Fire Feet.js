// 8.5 โหมดนักเต้นเท้าไฟ — โหมดเฉพาะแผ่นเต้น: เหยียบครบ 8 แผ่นตามจังหวะกลอง สะสมเกจความร้อนจนเข้าช่วง "ไฟลุก" คะแนน x2
// เวลาทั้งหมดเป็น ms นับจากเริ่มรอบ — ฟังก์ชันรับเวลาเข้ามา ไม่อ่านนาฬิกาเอง ทดสอบได้
'use strict';

const { rng } = require('./8.1 Dance Chart.js');
const { DanceGame, POINTS, comboMultiplier } = require('./8.2 Dance Judge.js');
const { gradeOf, buildDanceCard, thaiDate } = require('./8.3 Dance Result.js');

// โซนของเท้า: ก้าวสลับซ้าย-ขวาโดยไม่ต้องไขว้ขา แผ่นบน/ล่างเหยียบได้ทั้งสองเท้า
const LEFT = ['x', 'l', 'tri'];
const RIGHT = ['o', 'r', 'sq'];
const MIDDLE = ['u', 'd'];
const ARROWS = ['l', 'd', 'u', 'r'];
const ALL_PANELS = [...LEFT, ...MIDDLE, ...RIGHT];
// เหยียบพร้อมกันได้โดยไม่ไขว้ขา ไม่ใช้ ←+→ หรือ ↑+↓ เพราะแผ่นบางรุ่นส่งคู่นี้ทางแกนเดียวกัน ซึ่งส่งค่าได้ทีละทิศ เหยียบถูกก็ไม่ติด
const PAIRS = [['x', 'o'], ['tri', 'sq'], ['x', 'sq'], ['o', 'tri']];

// bpm = จังหวะกลอง · every = ก้าวทุกกี่จังหวะ · lead = ไอคอนออกจากจุดกลางก่อนถึงเวลาเหยียบ (ms) · doubles = โอกาสเหยียบ 2 แผ่นพร้อมกัน
const LEVELS = Object.freeze({
  warm:  { label: 'อุ่นเครื่อง', music: 'slow', bpm: 90,  every: 2, lead: 1500, doubles: 0,    panels: ARROWS,     note: 'ลูกศร 4 แผ่น ช้า ๆ' },
  hot:   { label: 'ร้อนแรง',   music: 'mid', bpm: 120, every: 2, lead: 1300, doubles: 0.1,  panels: ALL_PANELS, note: 'ครบ 8 แผ่น มีเหยียบคู่บ้าง' },
  blaze: { label: 'ลุกเป็นไฟ', music: 'fast', bpm: 150, every: 2, lead: 1100, doubles: 0.22, panels: ALL_PANELS, note: 'เร็ว ครบ 8 แผ่น เหยียบคู่บ่อย' },
});
const ROUND_MS = 180000;    // เล่นรอบละ 3 นาที จบตามเวลา
const COUNT_IN_BEATS = 4;   // กลองนำก่อนก้าวแรก
const BLOCK_EARLY_MS = 450; // เหยียบตอนไอคอนอยู่ในช่วงนี้นับว่าโดนเสมอ
const BLOCK_LATE_MS = 200;
const FIRE_MS = 8000;       // ความยาวช่วงไฟลุก
const HEAT_GAIN = Object.freeze({ perfect: 9, great: 6, good: 3 });
const HEAT_LOSS = 15;

// คืน { level, beatMs, intervalMs, lead, steps, notes:[{id, t, step}] }
// กติกา: ก้าวตรงจังหวะกลอง · สลับเท้าซ้าย-ขวา · ไม่ซ้ำแผ่นของ 2 ก้าวล่าสุด (เท้าไม่ต้องย่ำที่เดิม)
function makeChart(level, seed = Date.now()) {
  const lv = LEVELS[level];
  if (!lv) throw new Error('ไม่มีระดับ: ' + level);
  const rand = rng(seed), notes = [], beatMs = 60000 / lv.bpm, recent = [];
  let steps = 0;
  for (let step = 0; ; step++) {
    const t = Math.round((COUNT_IN_BEATS + step * lv.every) * beatMs);
    if (t + BLOCK_LATE_MS >= ROUND_MS) break; // ก้าวสุดท้ายต้องตัดสินทันก่อนหมดเวลา
    steps = step + 1;
    const used = new Set(recent.flat());
    const pairs = lv.doubles > 0 ? PAIRS.filter((p) => !p.some((id) => used.has(id))) : [];
    let picked;
    if (pairs.length && rand() < lv.doubles) picked = pairs[Math.floor(rand() * pairs.length)];
    else {
      const zone = (step % 2 === 0 ? LEFT : RIGHT).concat(MIDDLE).filter((id) => lv.panels.includes(id));
      const pool = zone.filter((id) => !used.has(id));
      const from = pool.length ? pool : zone;
      picked = [from[Math.floor(rand() * from.length)]];
    }
    picked.forEach((id) => notes.push({ id, t, step }));
    recent.push(picked);
    if (recent.length > 2) recent.shift();
  }
  return { level, beatMs, intervalMs: lv.every * beatMs, lead: lv.lead, steps, notes };
}

class FireFeetGame {
  constructor(chart) {
    this.chart = chart;
    this.judge = new DanceGame(chart.notes, { hitEarly: BLOCK_EARLY_MS, hitLate: BLOCK_LATE_MS });
    this.heat = 0; this.fireUntil = -1; this.fireCount = 0; this.fireBonus = 0;
  }
  get notes() { return this.judge.notes; }
  get combo() { return this.judge.combo; }
  get score() { return this.judge.score + this.fireBonus; }
  onFire(now) { return now < this.fireUntil; }

  _scored(note, result, now) {
    if (this.onFire(now)) this.fireBonus += Math.round(POINTS[result] * comboMultiplier(this.judge.combo));
    else {
      this.heat = Math.min(100, this.heat + HEAT_GAIN[result]);
      if (this.heat >= 100) { this.fireUntil = now + FIRE_MS; this.fireCount++; this.heat = 0; }
    }
  }
  // offset ของ now เป็นเวลาที่เท้าแตะแผ่นจริง คืน { result, delta, note } หรือ null
  press(id, now) {
    const r = this.judge.press(id, now);
    if (r) this._scored(r.note, r.result, now);
    return r;
  }
  // เท้าวางค้างบนแผ่นตอนไอคอนถึงจังหวะ: นับเป็น GOOD ไม่ต้องยกเท้าแล้วเหยียบใหม่
  holdHits(isDown, now) {
    const hits = [];
    for (const n of this.notes) {
      if (n.done || n.t > now || !isDown(n.id)) continue;
      this.judge._apply(n, 'good', now - n.t);
      this._scored(n, 'good', now);
      hits.push(n);
    }
    return hits;
  }
  // เรียกทุกเฟรม คืนรายการที่เพิ่งพลาด พลาดแล้วเกจลด (ช่วงไฟลุกไม่ดับเพราะพลาด)
  tick(now) {
    const missed = this.judge.tick(now);
    if (missed.length && !this.onFire(now)) this.heat = Math.max(0, this.heat - HEAT_LOSS * missed.length);
    return missed;
  }
  finished(now) { return now >= ROUND_MS; }
  timeLeft(now) { return Math.max(0, ROUND_MS - Math.max(0, now)); }
  // ไอคอนบนกระดาน: pos 1 = เพิ่งออกจากจุดกลาง, 0 = ถึงแผ่นพอดี, inBlock = เหยียบแล้วนับว่าโดน
  visible(now) {
    const lead = this.chart.lead, out = [];
    for (const n of this.notes) {
      if (n.done) continue;
      const left = n.t - now, pos = left / lead;
      if (pos <= 1) out.push({ id: n.id, pos, inBlock: left <= BLOCK_EARLY_MS && left >= -BLOCK_LATE_MS });
    }
    return out;
  }
  summary() { return { ...this.judge.summary(), points: this.score, fireCount: this.fireCount }; }
}

// ---------------------------------------------------------------- เปลวไฟตามคอมโบ
const FLAME_START = 3;  // คอมโบเท่านี้ไฟเริ่มติด
const FLAME_FULL = 30;  // คอมโบเท่านี้ไฟลุกเต็มที่
const FLAME_TIERS = Object.freeze([
  { combo: 5, name: 'ไฟเริ่มติด' },
  { combo: 15, name: 'ไฟแรงขึ้น' },
  { combo: FLAME_FULL, name: 'ลุกโชน!' },
]);
// ความแรงของไฟ 0-1 ตามคอมโบ ช่วงไฟลุกแรงอย่างน้อย 0.75
function flameLevel(combo, onFire = false) {
  const lv = Math.max(0, Math.min(1, (combo - FLAME_START + 1) / (FLAME_FULL - FLAME_START + 1)));
  return onFire ? Math.max(0.75, lv) : lv;
}
function flameTier(combo) {
  let tier = -1;
  FLAME_TIERS.forEach((t, i) => { if (combo >= t.combo) tier = i; });
  return tier;
}
// ระบบอนุภาคเปลวไฟ: สร้างจากขอบล่าง ขอบข้าง และรอบจุดกลาง ลอยขึ้นพร้อมส่ายเหมือนเปลวไฟ ไม่อ่านนาฬิกาเอง ทดสอบได้
class FlameField {
  constructor(w, h, opts = {}) {
    this.w = w; this.h = h; this.rand = opts.rand || Math.random; this.max = opts.max || 260;
    this.ring = opts.ring || null; // { x, y, r } วงจุดยืนกลาง
    this.parts = []; this.debt = 0;
  }
  clear() { this.parts = []; this.debt = 0; }
  _add(x, y, level, kind) {
    if (this.parts.length >= this.max) return;
    const r = this.rand, spark = kind === 'spark';
    this.parts.push({
      x, y, kind, seed: r() * 6.28,
      vx: (r() - 0.5) * (spark ? 150 : 40),
      vy: -(spark ? 200 + r() * 340 : 110 + r() * 110 + 330 * level),
      age: 0,
      life: spark ? 0.6 + r() * 0.8 : 0.42 + r() * 0.3 + 0.55 * level,
      size: spark ? 3 + r() * 3 : 36 + r() * 30 + 46 * level,
    });
  }
  // ไฟพุ่งเมื่อเหยียบโดนตอนมีคอมโบ
  burst(x, y, level, count = 14) {
    for (let i = 0; i < count; i++) this._add(x + (this.rand() - 0.5) * 110, y + (this.rand() - 0.5) * 70, level, i % 3 ? 'flame' : 'spark');
  }
  update(dt, level) {
    const r = this.rand;
    this.debt += level > 0 ? dt * (30 + 230 * level) : 0;
    while (this.debt >= 1) {
      this.debt -= 1;
      const pick = r();
      if (this.ring && level > 0.35 && pick > 0.86) { // รอบจุดกลาง เมื่อไฟแรงพอ
        const a = r() * 6.28;
        this._add(this.ring.x + Math.cos(a) * this.ring.r, this.ring.y + Math.sin(a) * this.ring.r, level * 0.45, 'flame');
      } else if (level > 0.3 && pick > 0.7) { // ไต่ขอบข้าง
        this._add(r() < 0.5 ? r() * 40 : this.w - r() * 40, this.h - r() * this.h * 0.55 * level, level * 0.6, 'flame');
      } else this._add(r() * this.w, this.h + 12, level, r() < 0.07 ? 'spark' : 'flame'); // กำแพงไฟด้านล่าง
    }
    for (const p of this.parts) {
      p.age += dt;
      p.vy *= 1 + 0.25 * dt;
      p.x += (p.vx + Math.sin(p.age * 8 + p.seed) * 42) * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    return this.parts;
  }
}

// เลือกเพลงของรอบนี้จากตัวเลือกในเมนู: 'auto' ตามโฟลเดอร์ของระดับ · 'all' สุ่มทุกเพลง · 'off' ไม่เปิด · อื่น ๆ = เพลงที่เลือก
// tracks = [{u, g}] คืนค่าที่จะบังคับให้ระบบเพลง หรือ null = ใช้กลองในเกม (เพลงที่เลือกไว้ถูกลบไปแล้ว จะกลับไปอัตโนมัติ)
function resolveSong(choice, level, tracks) {
  if (!tracks.length || choice === 'off') return null;
  if (choice === 'all') return 'all';
  if (choice !== 'auto' && tracks.some((t) => t.u === choice)) return choice;
  const group = LEVELS[level].music;
  return tracks.some((t) => t.g === group || !t.g) ? group : null;
}

// เวลาบนนาฬิกา เช่น 180000 -> 3:00 (ปัดขึ้น จึงเห็น 0:01 จนกว่าจะหมดเวลาจริง)
function formatClock(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ฉายาตามความแม่นยำ
function rankOf(accuracy) {
  return accuracy >= 95 ? 'เทพเท้าไฟ' : accuracy >= 85 ? 'นักเต้นเท้าไฟ' : accuracy >= 70 ? 'เท้าร้อน' : accuracy >= 50 ? 'เท้าอุ่น' : 'ฝึกก้าวต่ออีกนิด';
}
function buildResult(level, summary) {
  const score = Math.round(summary.accuracy);
  return { level, levelTh: LEVELS[level].label, score, ...gradeOf(score), rank: rankOf(summary.accuracy), ...summary };
}
function buildCard(r, opts = {}) {
  const card = buildDanceCard({ ...r, levelTh: r.levelTh }, { ...opts, isBest: opts.isBest });
  const who = card.name ? `${card.name}: ` : '';
  card.tagline = 'โหมดนักเต้นเท้าไฟ';
  card.tiles[0] = { label: 'คะแนนรวม', value: String(r.points) };
  card.highlight = `${r.rank} · ระดับ${r.levelTh} · ไฟลุก ${r.fireCount} ครั้ง`;
  card.date = thaiDate(new Date(opts.now || Date.now()));
  card.text = `${who}ฉันได้ฉายา "${r.rank}" ในโหมดนักเต้นเท้าไฟของ Move & Relieve ระดับ${r.levelTh} ${r.points} คะแนน แม่นยำ ${r.accuracy}% คอมโบสูงสุด ${r.maxCombo} #MoveAndRelieve`;
  return card;
}

// ---------------------------------------------------------------- คะแนนสูงสุดต่อระดับ (localStorage)
const BEST_KEY = 'move-relieve-firefeet-best';
function loadBest(storage) {
  try { const o = JSON.parse(storage.getItem(BEST_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function recordBest(storage, level, points) {
  const all = loadBest(storage), prev = all[level];
  const isBest = typeof prev === 'number' && points > prev;
  if (typeof prev !== 'number' || points > prev) {
    all[level] = points;
    try { storage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* เก็บไม่ได้ ข้ามไป */ }
  }
  return { isBest, best: Math.max(prev || 0, points) };
}

module.exports = { ROUND_MS, formatClock, resolveSong, FLAME_START, FLAME_FULL, FLAME_TIERS, flameLevel, flameTier, FlameField, LEFT, RIGHT, MIDDLE, ARROWS, PAIRS, LEVELS, COUNT_IN_BEATS, BLOCK_EARLY_MS, BLOCK_LATE_MS, FIRE_MS, HEAT_GAIN, HEAT_LOSS, BEST_KEY, makeChart, FireFeetGame, rankOf, buildResult, buildCard, loadBest, recordBest };
