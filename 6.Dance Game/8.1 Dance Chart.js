// 8.1 โหมดแผ่นเต้น — สร้างลำดับแผ่นที่ต้องเหยียบ (chart) ตามระดับความยาก
// id ของแผ่นตรงกับ dancepad.js: x u o / l r / tri d sq (ตาราง 3x3 กลางว่าง)
'use strict';

const PANELS = ['x', 'u', 'o', 'l', 'r', 'tri', 'd', 'sq'];

// intervalMs = เวลาระหว่างก้าว · steps = จำนวนก้าว · multiChance = โอกาสที่ก้าวนั้นต้องเหยียบ 2 แผ่นพร้อมกัน
const LEVELS = Object.freeze({
  easy:   { label: 'ง่าย',     music: 'slow', intervalMs: 1500, steps: 24, multiChance: 0,    note: 'ช้า เหยียบทีละแผ่น' },
  normal: { label: 'ปานกลาง', music: 'mid', intervalMs: 1000, steps: 36, multiChance: 0.15, note: 'จังหวะกลาง มีบางก้าวพร้อมกัน 2 แผ่น' },
  hard:   { label: 'ยาก',      music: 'fast', intervalMs: 750,  steps: 48, multiChance: 0.3,  note: 'เร็ว มีเหยียบพร้อมกัน 2 แผ่นบ่อย' },
});

const START_DELAY_MS = 1500; // ก้าวแรกเริ่มหลังนับถอยหลังจบ

// ตัวสุ่มแบบกำหนด seed ได้ (ทดสอบให้ผลซ้ำได้)
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// คืน { level, intervalMs, notes:[{id, t, step}] }  t = เวลาที่ควรเหยียบ (ms นับจากเริ่มเกมจริง)
// กติกา: ไม่ซ้ำแผ่นเดิมติดกัน · ก้าวคู่เลือก 2 แผ่นที่ต่างกัน และไม่ซ้ำกับแผ่นของก้าวก่อนหน้า
function makeChart(levelKey, seed = Date.now()) {
  const lv = LEVELS[levelKey];
  if (!lv) throw new Error('ไม่มีระดับ: ' + levelKey);
  const rand = rng(seed), notes = [];
  let prev = [];
  for (let i = 0; i < lv.steps; i++) {
    const n = rand() < lv.multiChance ? 2 : 1;
    const pool = PANELS.filter((p) => !prev.includes(p));
    const picked = [];
    while (picked.length < n) {
      const c = pool.filter((p) => !picked.includes(p));
      picked.push(c[Math.floor(rand() * c.length)]);
    }
    const t = START_DELAY_MS + i * lv.intervalMs;
    picked.forEach((id) => notes.push({ id, t, step: i }));
    prev = picked;
  }
  return { level: levelKey, intervalMs: lv.intervalMs, steps: lv.steps, notes };
}

module.exports = { PANELS, LEVELS, START_DELAY_MS, rng, makeChart };
