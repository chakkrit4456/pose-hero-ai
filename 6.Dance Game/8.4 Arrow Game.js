// 8.4 มินิเกมลูกศร — เหยียบแผ่น ← ↓ ↑ → ตามลูกศรที่วิ่งขึ้นมา ระหว่างทำท่าออกกำลังกาย
// นาฬิกาของเกมเดินเฉพาะตอนที่หน้าเกมเรียก advance() (หยุดตอนพัก/ดูตัวอย่าง/ท่าที่ใช้ขา) ตัดสินด้วย DanceGame ของ 8.2
'use strict';

const { rng } = require('./8.1 Dance Chart.js');
const { DanceGame } = require('./8.2 Dance Judge.js');

const LANES = Object.freeze(['l', 'd', 'u', 'r']); // id ตรงกับแผ่นใน dancepad.js
const INTERVAL_MS = Object.freeze({ easy: 1600, normal: 1200, hard: 900 }); // ช้ากว่าโหมดแผ่นเต้น เพราะต้องทำท่าไปด้วย
const START_DELAY_MS = 2000;
const LEAD_MS = 1800; // ลูกศรปรากฏก่อนถึงเวลาเหยียบเท่านี้
// บล็อก: เหยียบตอนลูกศรอยู่ในช่วงนี้นับว่าโดนเสมอ (อย่างน้อย GOOD) ยิ่งใกล้จังหวะยิ่งได้คะแนนสูง
const BLOCK_EARLY_MS = 550;
const BLOCK_LATE_MS = 250;

// ท่าที่ขาหรือสะโพกต้องอยู่กับที่ หรือทรงตัวไม่มั่นคง: ห้ามเหยียบแผ่นไปด้วย (เสียทรงและเสี่ยงล้ม)
const LEG_BUSY = /knee|legs|torso_bend|torso_twist/;
function usesLegs(exercise) {
  return !!(exercise && exercise.angles && Object.keys(exercise.angles).some((n) => LEG_BUSY.test(n)));
}

// ลูกศรครอบคลุมเวลาทำท่า totalMs: ไม่ซ้ำช่องเดิมติดกัน คืน notes [{id, t, step}] ตามรูปแบบของ 8.2
function makeChart(totalMs, difficulty, seed = Date.now()) {
  const interval = INTERVAL_MS[difficulty];
  if (!interval) throw new Error('ไม่มีระดับ: ' + difficulty);
  const rand = rng(seed), notes = [];
  let prev = null;
  for (let t = START_DELAY_MS, step = 0; t <= totalMs; t += interval, step++) {
    const pool = LANES.filter((id) => id !== prev);
    const id = pool[Math.floor(rand() * pool.length)];
    notes.push({ id, t, step });
    prev = id;
  }
  return notes;
}

class ArrowGame {
  constructor(notes) { this.judge = new DanceGame(notes, { hitEarly: BLOCK_EARLY_MS, hitLate: BLOCK_LATE_MS }); this.t = 0; }
  get notes() { return this.judge.notes; }
  get combo() { return this.judge.combo; }
  get score() { return this.judge.score; }
  // เดินเวลา ms คืนรายการลูกศรที่เพิ่งพลาด
  advance(ms) { if (ms > 0) this.t += ms; return this.judge.tick(this.t); }
  // เหยียบแผ่น id: แผ่นที่ไม่ใช่ ← ↓ ↑ → ไม่นับ คืน { result, delta, note } หรือ null
  // offsetMs = เท้าแตะแผ่นก่อน(ลบ)/หลัง(บวก) t ปัจจุบันเท่าไร นาฬิกาเดินตามเฟรม จึงชดเชยเวลาจริงของการเหยียบ
  press(id, offsetMs = 0) { return LANES.includes(id) ? this.judge.press(id, this.t + offsetMs) : null; }
  // เท้าวางค้างอยู่บนแผ่นตอนลูกศรถึงจังหวะ: นับเป็น GOOD ไม่ต้องยกเท้าแล้วเหยียบใหม่ คืนรายการที่เพิ่งโดน
  holdHits(isDown) {
    const hits = [];
    for (const n of this.notes) {
      if (n.done || n.t > this.t || !isDown(n.id)) continue;
      this.judge._apply(n, 'good', this.t - n.t);
      hits.push(n);
    }
    return hits;
  }
  // ลูกศรบนจอ พร้อมตำแหน่ง 0 (ถึงจุดเหยียบ) ถึง 1 (เพิ่งปรากฏ) และ inBlock = ตอนนี้เหยียบแล้วนับว่าโดน
  visible() {
    const out = [];
    for (const n of this.notes) {
      if (n.done) continue;
      const left = n.t - this.t, pos = left / LEAD_MS;
      if (pos <= 1) out.push({ id: n.id, pos, inBlock: left <= BLOCK_EARLY_MS && left >= -BLOCK_LATE_MS });
    }
    return out;
  }
  // ท่าอาจจบก่อนเวลา ลูกศรจึงเล่นไม่หมดทุกตัว ความแม่นยำคิดจากลูกศรที่ตัดสินแล้วเท่านั้น
  summary() {
    const s = this.judge.summary(), c = s.counts, judged = c.perfect + c.great + c.good + c.miss;
    const accuracy = judged ? Math.round(((c.perfect + c.great * 0.7 + c.good * 0.4) / judged) * 1000) / 10 : 0;
    return { ...s, judged, accuracy };
  }
}

module.exports = { LANES, INTERVAL_MS, START_DELAY_MS, LEAD_MS, BLOCK_EARLY_MS, BLOCK_LATE_MS, usesLegs, makeChart, ArrowGame };
