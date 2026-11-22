// 2.6 โหมดหลัก "ฮีโร่เวิร์กเอาต์ 20 นาที" — ยืดเหยียด 5 นาที → ท่าบริหารช่วงบน (กล้อง) พร้อมเหยียบแผ่นเต้น 10 นาที → ยืดเหยียด 5 นาที
// ท่ามาจากโปสเตอร์ "ท่าออกกำลังกายในเกม ลดอาการออฟฟิศซินโดรม" (ไม่รวมท่าที่ถูกตัดออก: นั่งบิดลำตัว, ยืดข้อมือและนิ้วมือ, ก้มตัวแตะปลายเท้า) + ท่าเดิมในเกม
'use strict';

const BLOCK_SEC = 60;      // ทุกท่า 1 นาที
const PHASE_GAP_SEC = 5;   // พักเปลี่ยนช่วง

const PHASES = {
  warmup: 'ยืดเหยียดวอร์มอัพ',
  combo: 'ออกกำลังกาย + แผ่นเต้น',
  cooldown: 'ยืดเหยียดคูลดาวน์',
};

// ทุกท่าในโหมดหลัก = ท่าช่วงบนที่กล้องนับได้ + ก้าวบนแผ่นเต้นที่ร่างกายทำพร้อมกันได้จริง (ผู้เล่นคนเดียวทำทั้งสองอย่าง)
// steps = ลำดับแผ่นที่ต้องเหยียบ 1 ก้าวต่อ 1 จังหวะท่า (u=บน d=ล่าง l=ซ้าย r=ขวา)
// ตัดออก: ท่าข้อมือ (กล้องระยะเต็มตัวนับยาก) และท่าซ้ำ: ยืดบ่า (ตัวนับเดียวกับเอียงคอ), ยักไหล่ (ตัวนับเดียวกับหมุนไหล่)
// เวลาต่อ 1 ก้าว (วินาที): มาสคอต การนับท่า และแผ่นเต้นใช้จังหวะเดียวกัน
const STRETCH_STEP = { easy: 2.0, normal: 1.6, hard: 1.2 }; // ช่วงยืดเหยียด: ช้ากว่าช่วงออกกำลังกาย แต่ยังต่างกันตามระดับ

// ยืดเหยียดวอร์มอัพ
const WARMUP = [
  { id: 'neck-tilt', title: 'เอียงคอ + ก้าวข้าง', steps: ['l', 'r'], cue: 'เอียงศีรษะไปทางเดียวกับเท้าที่ก้าวออกด้านข้าง ช้า ๆ' },
  { id: 'shoulder-roll', title: 'หมุนไหล่ + ย่ำเท้า', steps: ['l', 'r'], cue: 'หมุนไหล่ไปด้านหลังเป็นวง ทุกรอบย่ำเท้าซ้าย/ขวาเบา ๆ' },
  { id: 'basic_05', title: 'เอียงลำตัว + ก้าวข้าง', steps: ['l', 'r'], cue: 'ก้าวเท้าออกข้างหนึ่ง แล้วเอียงลำตัวไปทางเดียวกัน' },
  { id: 'seated-twist', title: 'บิดลำตัว + ก้าวข้าง', steps: ['l', 'r'], cue: 'บิดลำตัวไปทางเดียวกับเท้าที่ก้าว สะโพกนิ่ง' },
  { id: 'basic_10', title: 'ยืดแขนเหนือศีรษะ + ก้าวแตะ', steps: ['l', 'r'], cue: 'ประสานมือเหยียดแขนขึ้นค้างไว้ เท้าก้าวแตะซ้าย-ขวาช้า ๆ' },
];

// ท่าคอมโบแต่ละระดับ: ทุกระดับ 10 ท่า x 60 วินาที ต่างกันที่ท่า ความเร็ว และความหนัก
const LEVELS = {
  easy: {
    label: 'ง่าย', stepSec: 1.33, desc: 'แรงกระแทกต่ำ ท่าช้า เท้าก้าวข้างเบา ๆ เหมาะกับผู้เริ่มต้น',
    combos: [
      { id: 'basic_01', title: 'สเต็ปทัชกางแขน', steps: ['l', 'r'], cue: 'ก้าวเท้าออกด้านข้างช้า ๆ พร้อมกางแขนขึ้นระดับไหล่' },
      { id: 'basic_03', title: 'ย่ำเท้างอศอก', steps: ['l', 'r'], cue: 'งอศอกยกมือแตะไหล่ ทุกครั้งที่ย่ำเท้าซ้าย/ขวา' },
      { id: 'basic_02', title: 'ก้าวหน้าเหยียดแขนขึ้น', steps: ['u', 'd'], cue: 'ก้าวไปข้างหน้าพร้อมเหยียดแขนขึ้นเหนือศีรษะ แล้วถอยกลับพร้อมลดแขน' },
      { id: 'shoulder-roll', title: 'ย่ำเท้าหมุนไหล่', steps: ['l', 'r'], cue: 'หมุนไหล่ไปด้านหลังช้า ๆ ทุกรอบย่ำเท้าซ้าย/ขวาเบา ๆ' },
      { id: 'seated-twist', title: 'ก้าวข้างบิดลำตัว', steps: ['l', 'r'], cue: 'บิดลำตัวเบา ๆ ไปทางเดียวกับเท้าที่ก้าว' },
    ],
  },
  normal: {
    label: 'ปานกลาง', stepSec: 1.0, desc: 'จังหวะปกติ มียกเข่า ออกแรงทั้งตัว',
    combos: [
      { id: 'basic_01', title: 'สเต็ปทัชกางแขน', steps: ['l', 'r'], cue: 'ก้าวเท้าออกด้านข้าง พร้อมกางแขนขึ้นระดับไหล่ แล้วลดแขนลงตอนชิดเท้า' },
      { id: 'basic_06', title: 'ย่ำเท้ายกเข่า', steps: ['l', 'r'], cue: 'ยกเข่าขึ้นสลับข้าง แล้ววางเท้าลงบนแผ่นซ้าย/ขวาตามลูกศร' },
      { id: 'basic_02', title: 'ก้าวหน้าเหยียดแขนขึ้น', steps: ['u', 'd'], cue: 'ก้าวเท้าไปข้างหน้าพร้อมเหยียดแขนขึ้นเหนือศีรษะ แล้วถอยกลับพร้อมลดแขน' },
      { id: 'basic_03', title: 'ย่ำเท้างอศอก', steps: ['l', 'r'], cue: 'งอศอกยกมือแตะไหล่ ทุกครั้งที่ย่ำเท้าซ้าย/ขวา' },
      { id: 'seated-twist', title: 'ก้าวข้างบิดลำตัว', steps: ['l', 'r'], cue: 'บิดลำตัวไปทางซ้ายพร้อมก้าวเท้าซ้าย แล้วบิดไปขวาพร้อมก้าวเท้าขวา' },
    ],
  },
  hard: {
    label: 'ยาก', stepSec: 0.8, desc: 'จังหวะเร็ว ยกเข่า ย่อเข่า ก้าว 4 ทิศ ออกแรงมากขึ้น',
    combos: [
      { id: 'basic_06', title: 'วิ่งยกเข่าเร็ว', steps: ['l', 'r'], cue: 'ยกเข่าสูงสลับข้างเร็ว ๆ วางเท้าลงแผ่นซ้าย/ขวาตามจังหวะ' },
      { id: 'basic_04', title: 'ก้าวกว้างย่อเข่า', steps: ['l', 'r'], cue: 'ก้าวเท้าออกด้านข้างกว้าง แล้วย่อเข่าลงหลังตรง ดันตัวขึ้นแล้วก้าวอีกข้าง' },
      { id: 'basic_01', title: 'สเต็ป 4 ทิศกางแขน', steps: ['l', 'u', 'r', 'd'], cue: 'ก้าวซ้าย-หน้า-ขวา-หลัง กางแขนขึ้นระดับไหล่ทุกก้าว' },
      { id: 'basic_02', title: 'ก้าวหน้าชูแขนเร็ว', steps: ['u', 'd'], cue: 'ก้าวหน้าพร้อมชูแขนสุด ถอยกลับพร้อมลดแขน เร็วตามจังหวะ' },
      { id: 'seated-twist', title: 'ก้าวข้างบิดลำตัวเร็ว', steps: ['l', 'r'], cue: 'บิดลำตัวไปทางเท้าที่ก้าว ให้ไหล่หมุนตามสุด ๆ' },
    ],
  },
};
const COMBOS = LEVELS.normal.combos;
const COMBO_ROUNDS = 2;

// ยืดเหยียดคูลดาวน์ (ช้าลง หายใจลึก)
const COOLDOWN = [
  { id: 'basic_10', title: 'ยืดแขนเหนือศีรษะ + ก้าวแตะ', steps: ['l', 'r'], cue: 'เหยียดแขนขึ้นค้างไว้ หายใจลึก เท้าก้าวแตะซ้าย-ขวาช้า ๆ' },
  { id: 'basic_05', title: 'เอียงลำตัว + ก้าวข้าง', steps: ['l', 'r'], cue: 'ก้าวเท้าออกข้างหนึ่ง แล้วเอียงลำตัวไปทางเดียวกันช้า ๆ' },
  { id: 'seated-twist', title: 'บิดลำตัว + ก้าวข้าง', steps: ['l', 'r'], cue: 'บิดลำตัวช้า ๆ ไปทางเท้าที่ก้าว' },
  { id: 'shoulder-roll', title: 'หมุนไหล่ + ย่ำเท้า', steps: ['l', 'r'], cue: 'หมุนไหล่ช้า ๆ ย่ำเท้าเบา ๆ ผ่อนคลาย' },
  { id: 'neck-tilt', title: 'เอียงคอ + ก้าวข้าง', steps: ['l', 'r'], cue: 'เอียงศีรษะช้า ๆ ไปทางเท้าที่ก้าว ผ่อนคลายบ่า' },
];

/**
 * สร้างคิว 20 ท่า (ท่าละ 60 วินาที) จากแคตตาล็อกท่าของเกม
 * @param {Array} catalog รายการจาก getCatalog() — ใช้ชื่อ/จำนวนครั้งเดิมของท่า
 */
function buildQueue(catalog, level = 'normal') {
  const L = LEVELS[level] || LEVELS.normal;
  const byId = (id) => {
    const c = catalog.find((x) => x.id === id);
    if (!c) throw new Error('ไม่พบท่า ' + id);
    return c;
  };
  const item = (m, phase, stepSec, first) => {
    const c = byId(m.id);
    return {
      id: c.id, name: m.title + (/ค้าง/.test(c.name) ? ' · ค้าง 15 วิ' : ''), target: c.target,
      reps: Math.max(1, Math.round((c.reps || 10) * BLOCK_SEC / Math.max(BLOCK_SEC, c.durationSec || BLOCK_SEC))),
      durationSec: BLOCK_SEC, timeBoxed: true, hero: true, phase, phaseLabel: PHASES[phase],
      steps: m.steps.slice(), stepCue: m.cue, stepSec, level,
      restBeforeSec: first ? PHASE_GAP_SEC : 0,
    };
  };
  const q = [];
  const stretch = STRETCH_STEP[level] || STRETCH_STEP.normal;
  WARMUP.forEach((m) => q.push(item(m, 'warmup', stretch, false)));
  for (let r = 0; r < COMBO_ROUNDS; r++) L.combos.forEach((m, i) => q.push(item(m, 'combo', L.stepSec, r === 0 && i === 0)));
  COOLDOWN.forEach((m, i) => q.push(item(m, 'cooldown', stretch, i === 0)));
  return q;
}

/** ตัดสินการเหยียบแบบเกมจังหวะ: PERFECT / GREAT / GOOD / MISS + คอมโบ + คะแนน (คิวก้าวทุก T วินาที ตามจังหวะมาสคอต) */
const GRADE_POINTS = { perfect: 300, great: 200, good: 100, miss: 0 };
function createStepJudge({ windowSec = 0.6 } = {}) {
  let steps = null, T = 2, win = windowSec, lastJudged = -1;
  let combo = 0, maxCombo = 0, score = 0;
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  const grade = (dt) => (dt <= Math.min(0.09, win * 0.3) ? 'perfect' : dt <= Math.min(0.18, win * 0.6) ? 'great' : 'good');
  const add = (g) => {
    counts[g]++;
    if (g === 'miss') combo = 0; else { combo++; maxCombo = Math.max(maxCombo, combo); }
    score += Math.round(GRADE_POINTS[g] * (1 + Math.min(combo, 50) / 50)); // คอมโบยิ่งยาว คะแนนต่อก้าวยิ่งมาก (สูงสุด x2)
  };
  return {
    setMove(stepList, periodSec) { steps = stepList; T = Math.max(0.5, periodSec || 2); win = Math.min(windowSec, T * 0.45); lastJudged = -1; },
    clear() { steps = null; },
    get period() { return T; },
    /** ช่องที่ต้องเหยียบตอนนี้ และเวลาที่เหลือถึงจังหวะ (วินาที) */
    cue(t) {
      if (!steps) return null;
      const k = Math.floor(t / T + 0.5);
      return { pad: steps[((k % steps.length) + steps.length) % steps.length], index: k, inSec: k * T - t };
    },
    /** ทุกเฟรม: จังหวะที่ผ่านไปโดยไม่เหยียบ = MISS — คืนจำนวน MISS ใหม่ */
    tick(t) {
      if (!steps) return 0;
      const k = Math.floor((t - win) / T);
      if (lastJudged < 0) { lastJudged = k; return 0; }
      let n = 0;
      while (lastJudged < k) { lastJudged++; add('miss'); n++; }
      return n;
    },
    /** เหยียบแผ่น: คืน { grade, early } หรือ null ถ้ายังไม่ถึงจังหวะ */
    press(pad, t) {
      if (!steps) return null;
      const k = Math.round(t / T);
      if (k <= lastJudged) return null;
      const dt = t - k * T;
      if (Math.abs(dt) > win) return null;
      const want = steps[((k % steps.length) + steps.length) % steps.length];
      lastJudged = k;
      const g = pad === want ? grade(Math.abs(dt)) : 'miss';
      add(g);
      return { grade: g, early: dt < 0, combo };
    },
    stats() {
      const hits = counts.perfect + counts.great + counts.good, n = hits + counts.miss;
      return { hits, misses: counts.miss, accuracy: n ? Math.round(((counts.perfect + counts.great * 0.8 + counts.good * 0.5) / n) * 100) : 0,
        combo, maxCombo, score, counts: Object.assign({}, counts) };
    },
    reset() { steps = null; lastJudged = -1; combo = 0; maxCombo = 0; score = 0; Object.keys(counts).forEach((k) => (counts[k] = 0)); },
  };
}

module.exports = { BLOCK_SEC, PHASES, LEVELS, WARMUP, COMBOS, COOLDOWN, buildQueue, createStepJudge };
