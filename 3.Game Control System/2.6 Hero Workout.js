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

// ยืดเหยียดก่อนเล่น (โปสเตอร์ข้อ 1, 2, 3, 4, 7)
const WARMUP = ['neck-tilt', 'shoulder-roll', 'upper-trap', 'basic_10', 'wrist-circle'];

// ท่าคอมโบ: ท่าช่วงบนที่กล้องตรวจ + รูปแบบก้าวบนแผ่นที่ร่างกายทำพร้อมกันได้จริง (ท่าแอโรบิกมาตรฐาน)
// steps = ลำดับแผ่นที่ต้องเหยียบ วนซ้ำ 1 ก้าวต่อ 1 จังหวะท่า (u=บน d=ล่าง l=ซ้าย r=ขวา)
// ท่าคอมโบแต่ละระดับ: ท่าช่วงบนที่กล้องตรวจ + ก้าวบนแผ่นที่ร่างกายทำพร้อมกันได้จริง (u=บน d=ล่าง l=ซ้าย r=ขวา)
// ทุกระดับใช้เวลาเท่ากัน (10 ท่า x 60 วินาที) ต่างกันที่ท่า ความเร็ว และความหนัก
const LEVELS = {
  easy: {
    label: 'ง่าย', speed: 0.8, desc: 'แรงกระแทกต่ำ ท่าช้า เท้าก้าวข้างเบา ๆ เหมาะกับผู้เริ่มต้น',
    combos: [
      { id: 'basic_01', title: 'สเต็ปทัชกางแขน', steps: ['l', 'r'], cue: 'ก้าวเท้าออกด้านข้างช้า ๆ พร้อมกางแขนขึ้นระดับไหล่' },
      { id: 'shoulder-roll', title: 'ย่ำเท้าหมุนไหล่', steps: ['l', 'r'], cue: 'หมุนไหล่ไปด้านหลังช้า ๆ ทุกรอบย่ำเท้าซ้าย/ขวาเบา ๆ' },
      { id: 'basic_07', title: 'ก้าวหน้า-หลังยกไหล่', steps: ['u', 'd'], cue: 'ก้าวหน้า-ถอยหลังเป็นจังหวะ ยกไหล่ขึ้นทุกครั้งที่ก้าว' },
      { id: 'basic_02', title: 'ก้าวหน้าเหยียดแขนขึ้น', steps: ['u', 'd'], cue: 'ก้าวไปข้างหน้าพร้อมเหยียดแขนขึ้นเหนือศีรษะ แล้วถอยกลับพร้อมลดแขน' },
      { id: 'seated-twist', title: 'ก้าวข้างบิดลำตัว', steps: ['l', 'r'], cue: 'บิดลำตัวเบา ๆ ไปทางเดียวกับเท้าที่ก้าว' },
    ],
  },
  normal: {
    label: 'ปานกลาง', speed: 1, desc: 'จังหวะปกติ มียกเข่า ออกแรงทั้งตัว',
    combos: [
      { id: 'basic_01', title: 'สเต็ปทัชกางแขน', steps: ['l', 'r'], cue: 'ก้าวเท้าออกด้านข้าง พร้อมกางแขนขึ้นระดับไหล่ แล้วลดแขนลงตอนชิดเท้า' },
      { id: 'basic_06', title: 'ย่ำเท้ายกเข่า', steps: ['l', 'r'], cue: 'ยกเข่าขึ้นสลับข้าง แล้ววางเท้าลงบนแผ่นซ้าย/ขวาตามลูกศร' },
      { id: 'basic_02', title: 'ก้าวหน้าเหยียดแขนขึ้น', steps: ['u', 'd'], cue: 'ก้าวเท้าไปข้างหน้าพร้อมเหยียดแขนขึ้นเหนือศีรษะ แล้วถอยกลับพร้อมลดแขน' },
      // หมุนไหล่เป็นท่าที่แหล่งแนะนำออฟฟิศซินโดรมแนะนำมากที่สุด (PPTV, Post Today) — ย่ำเท้าเบา ๆ ไปพร้อมกัน
      { id: 'shoulder-roll', title: 'ย่ำเท้าหมุนไหล่', steps: ['l', 'r'], cue: 'หมุนไหล่ไปด้านหลังเป็นวงกว้าง ทุกรอบที่หมุนให้ย่ำเท้าลงแผ่นซ้าย/ขวาสลับกัน' },
      { id: 'seated-twist', title: 'ก้าวข้างบิดลำตัว', steps: ['l', 'r'], cue: 'ยืนตรง บิดลำตัวไปทางซ้ายพร้อมก้าวเท้าซ้าย แล้วบิดไปขวาพร้อมก้าวเท้าขวา' },
    ],
  },
  hard: {
    label: 'ยาก', speed: 1.25, desc: 'จังหวะเร็ว ยกเข่า ย่อเข่า ก้าว 4 ทิศ ออกแรงมากขึ้น',
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

// ยืดเหยียดปิดท้าย
const COOLDOWN = ['basic_10', 'upper-trap', 'neck-tilt', 'shoulder-roll', 'scapular-squeeze'];

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
  const item = (id, phase, extra, first) => {
    const c = byId(id);
    return Object.assign({
      id: c.id, name: c.name, target: c.target,
      reps: Math.max(1, Math.round((c.reps || 10) * BLOCK_SEC / Math.max(BLOCK_SEC, c.durationSec || BLOCK_SEC))),
      durationSec: BLOCK_SEC, timeBoxed: true, hero: true, phase, phaseLabel: PHASES[phase], steps: null, speed: L.speed, level,
      restBeforeSec: first ? PHASE_GAP_SEC : 0,
    }, extra || {});
  };
  const q = [];
  WARMUP.forEach((id, i) => q.push(item(id, 'warmup', null, false)));
  for (let r = 0; r < COMBO_ROUNDS; r++) {
    L.combos.forEach((m, i) => q.push(item(m.id, 'combo', { name: m.title + ' (' + byId(m.id).name + ')', steps: m.steps.slice(), stepCue: m.cue }, r === 0 && i === 0)));
  }
  COOLDOWN.forEach((id, i) => q.push(item(id, 'cooldown', null, i === 0)));
  return q;
}

/** ตัดสินการเหยียบ: คิวก้าวทุก T วินาที ตามจังหวะเดียวกับมาสคอตสาธิต */
function createStepJudge({ windowSec = 0.6 } = {}) {
  let hits = 0, misses = 0, lastJudged = -1, steps = null, T = 2;
  return {
    setMove(stepList, periodSec) { steps = stepList; T = Math.max(0.8, periodSec || 2); lastJudged = -1; },
    clear() { steps = null; },
    /** ช่องที่ต้องเหยียบตอนนี้ และเวลาที่เหลือถึงจังหวะ (วินาที) */
    cue(t) {
      if (!steps) return null;
      const k = Math.floor(t / T + 0.5);
      return { pad: steps[((k % steps.length) + steps.length) % steps.length], index: k, inSec: k * T - t };
    },
    /** เรียกทุกเฟรม: นับพลาดเมื่อจังหวะผ่านไปแล้วไม่ได้เหยียบ */
    tick(t) {
      if (!steps) return;
      const k = Math.floor((t - windowSec) / T);
      if (lastJudged < 0) { lastJudged = k; return; }
      while (lastJudged < k) { lastJudged++; misses++; }
    },
    /** เรียกเมื่อเหยียบแผ่น คืน 'hit' | 'miss' | null */
    press(pad, t) {
      if (!steps) return null;
      const k = Math.round(t / T);
      if (k <= lastJudged) return null; // จังหวะนี้ตัดสินไปแล้ว
      if (Math.abs(t - k * T) > windowSec) return null; // ยังไม่ถึงจังหวะ — ไม่นับ
      const want = steps[((k % steps.length) + steps.length) % steps.length];
      lastJudged = k;
      if (pad === want) { hits++; return 'hit'; }
      misses++; return 'miss';
    },
    stats() { const n = hits + misses; return { hits, misses, accuracy: n ? Math.round((hits / n) * 100) : 0 }; },
    reset() { hits = 0; misses = 0; lastJudged = -1; steps = null; },
  };
}

module.exports = { BLOCK_SEC, PHASES, LEVELS, WARMUP, COMBOS, COOLDOWN, buildQueue, createStepJudge };
