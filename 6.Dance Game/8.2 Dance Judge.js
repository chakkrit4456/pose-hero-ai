// 8.2 โหมดแผ่นเต้น — ตัดสินการเหยียบ (PERFECT/GREAT/GOOD/MISS) คอมโบ และคะแนน
// เวลาทั้งหมดเป็น ms ในฐานเวลาเดียวกับ chart (t ของโน้ต) — ฟังก์ชันรับเวลาเข้ามา ไม่อ่านนาฬิกาเอง ทดสอบได้
'use strict';

const WINDOWS = Object.freeze({ perfect: 120, great: 220, good: 350 }); // ± ms จากเวลาที่ควรเหยียบ
const EARLY_LIMIT = 450;   // เหยียบก่อนเวลาเกินนี้ = ยังไม่นับ (ถือว่าเหยียบมั่ว)
const MISS_AFTER = 350;    // เลยเวลาเกินนี้แล้วยังไม่เหยียบ = MISS
const POINTS = Object.freeze({ perfect: 100, great: 70, good: 40, miss: 0 });
const WEIGHT = Object.freeze({ perfect: 1, great: 0.7, good: 0.4, miss: 0 }); // ใช้คิดความแม่นยำ

const comboMultiplier = (combo) => Math.min(2, 1 + Math.floor(combo / 10) * 0.1);

class DanceGame {
  // opts.hitEarly / opts.hitLate = ช่วงเวลา (ms) ก่อน/หลังจังหวะที่ยังนับว่าโดน (ค่าเริ่มต้น = หน้าต่าง GOOD)
  constructor(notes, opts = {}) {
    this.hitEarly = opts.hitEarly == null ? WINDOWS.good : opts.hitEarly;
    this.hitLate = opts.hitLate == null ? MISS_AFTER : opts.hitLate;
    this.notes = notes.map((n) => ({ ...n, done: false, result: null, delta: null }));
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.stray = 0;       // เหยียบแผ่นที่ไม่มีโน้ต (ไม่หักคะแนน แต่นับไว้)
    this.deltas = [];     // ความต่างของเวลาของโน้ตที่โดน (ลบ = เร็ว)
  }

  _apply(note, result, delta) {
    note.done = true; note.result = result; note.delta = delta;
    this.counts[result]++;
    if (result === 'miss') { this.combo = 0; return; }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += Math.round(POINTS[result] * comboMultiplier(this.combo));
    this.deltas.push(delta);
  }

  // เหยียบแผ่น id ที่เวลา now: คืน { result, delta, note } หรือ null ถ้าไม่มีโน้ตให้ตัดสิน
  press(id, now) {
    let best = null;
    for (const n of this.notes) {
      if (n.done || n.id !== id) continue;
      const d = now - n.t;
      if (d < -Math.max(EARLY_LIMIT, this.hitEarly) || d > this.hitLate) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { n, d };
    }
    if (!best) { this.stray++; return null; }
    const a = Math.abs(best.d);
    // เหยียบเร็วเกินช่วงที่นับว่าโดน (แต่ยังไม่เกิน EARLY_LIMIT): ไม่ตัดสินทิ้งโน้ต ให้เหยียบใหม่ได้ นับเป็นเหยียบมั่ว
    if (best.d < -this.hitEarly) { this.stray++; return null; }
    const result = a <= WINDOWS.perfect ? 'perfect' : a <= WINDOWS.great ? 'great' : 'good';
    this._apply(best.n, result, best.d);
    return { result, delta: best.d, note: best.n };
  }

  // เรียกทุกเฟรม: ตัดโน้ตที่เลยเวลาไปแล้วให้เป็น MISS คืนรายการโน้ตที่เพิ่งพลาด
  tick(now) {
    const missed = [];
    for (const n of this.notes) {
      if (!n.done && now > n.t + this.hitLate) { this._apply(n, 'miss', null); missed.push(n); }
    }
    return missed;
  }

  finished(now) { return this.notes.every((n) => n.done) || (this.notes.length > 0 && now > this.notes[this.notes.length - 1].t + MISS_AFTER + 400); }

  get judged() { return this.notes.filter((n) => n.done).length; }

  // ความแม่นยำ 0-100 (PERFECT = 1, GREAT = 0.7, GOOD = 0.4) ของโน้ตทั้งหมด (ที่ยังไม่ตัดสินนับเป็น MISS)
  accuracy() {
    const total = this.notes.length;
    if (!total) return 0;
    const sum = this.counts.perfect * WEIGHT.perfect + this.counts.great * WEIGHT.great + this.counts.good * WEIGHT.good;
    return Math.round((sum / total) * 1000) / 10;
  }

  summary() {
    const hits = this.deltas.length;
    const avgAbs = hits ? Math.round(this.deltas.reduce((s, d) => s + Math.abs(d), 0) / hits) : null;
    const bias = hits ? Math.round(this.deltas.reduce((s, d) => s + d, 0) / hits) : 0; // ลบ = เหยียบเร็วกว่าจังหวะ
    return {
      total: this.notes.length,
      counts: { ...this.counts },
      points: this.score,
      accuracy: this.accuracy(),
      maxCombo: this.maxCombo,
      avgAbsMs: avgAbs,
      biasMs: bias,
      stray: this.stray,
    };
  }
}

module.exports = { WINDOWS, EARLY_LIMIT, MISS_AFTER, POINTS, comboMultiplier, DanceGame };
