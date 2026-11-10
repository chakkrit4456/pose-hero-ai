// 8.6 บันไดความยากของโหมดเหยียบ — ตอนจบท่าบริหารแล้วสลับไปเหยียบต่อ เกมเลือกระดับให้ "เริ่มจากง่ายไปยาก" และปรับตามผลการเล่น
// ขั้นบันได: แผ่นเต้น ง่าย -> ปานกลาง -> ยาก -> เท้าไฟ อุ่นเครื่อง -> ร้อนแรง -> ลุกเป็นไฟ
// ได้คะแนน >= PASS ขึ้นขั้นถัดไป · ต่ำกว่า DROP ลงหนึ่งขั้น · ระหว่างนั้นอยู่ขั้นเดิม  (ฟังก์ชันล้วน เก็บขั้นใน storage)
'use strict';

const STAGES = Object.freeze([
  { id: 'dance-easy',   mode: 'dance', level: 'easy',   label: 'แผ่นเต้น · ง่าย' },
  { id: 'dance-normal', mode: 'dance', level: 'normal', label: 'แผ่นเต้น · ปานกลาง' },
  { id: 'dance-hard',   mode: 'dance', level: 'hard',   label: 'แผ่นเต้น · ยาก' },
  { id: 'fire-warm',    mode: 'fire',  level: 'warm',   label: 'นักเต้นเท้าไฟ · อุ่นเครื่อง' },
  { id: 'fire-hot',     mode: 'fire',  level: 'hot',    label: 'นักเต้นเท้าไฟ · ร้อนแรง' },
  { id: 'fire-blaze',   mode: 'fire',  level: 'blaze',  label: 'นักเต้นเท้าไฟ · ลุกเป็นไฟ' },
]);
const KEY = 'move-relieve-ladder';
const PASS = 70;
const DROP = 40;

const clampIndex = (i) => Math.max(0, Math.min(STAGES.length - 1, Number.isInteger(i) ? i : 0));

function load(storage) {
  try {
    const o = JSON.parse(storage.getItem(KEY) || 'null');
    return { index: clampIndex(o && o.index), last: (o && o.last) || null };
  } catch (e) {
    return { index: 0, last: null };
  }
}
function save(storage, state) { try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }

// ขั้นถัดไปจากผลคะแนน (0-100) ของขั้นที่เพิ่งเล่น
function advance(index, score) {
  const i = clampIndex(index);
  if (score >= PASS) return clampIndex(i + 1);
  if (score < DROP) return clampIndex(i - 1);
  return i;
}

// ขั้นแผ่นเต้นที่ยากที่สุด (ใช้เป็นทางเลือกสำรองเมื่อไม่มีแผ่นเต้นจริงสำหรับโหมดเท้าไฟ)
const lastDanceIndex = () => STAGES.map((s) => s.mode).lastIndexOf('dance');

// บันทึกผลของขั้น playedIndex แล้วคืน { from, to, moved }  (to = ขั้นที่จะเล่นรอบหน้า)
function record(storage, playedIndex, score, now = Date.now()) {
  const from = clampIndex(playedIndex), to = advance(from, score);
  save(storage, { index: to, last: { stage: STAGES[from].id, score, at: now } });
  return { from, to, moved: to - from };
}

function message(r) {
  const to = STAGES[r.to].label;
  if (r.moved > 0) return `ผ่านแล้ว! ครั้งหน้าเลื่อนขึ้นไปเล่น "${to}"`;
  if (r.moved < 0) return `ครั้งหน้าลดมาเล่น "${to}" ก่อน ค่อย ๆ ขยับขึ้นไปทีละขั้น`;
  return r.to === STAGES.length - 1 ? `ยอดเยี่ยม! อยู่ขั้นสูงสุดแล้ว (${to})` : `ครั้งหน้าเล่น "${to}" อีกครั้งให้คล่องก่อนขึ้นขั้น (ต้องได้ ${PASS}+ คะแนน)`;
}

module.exports = { STAGES, KEY, PASS, DROP, load, save, advance, record, lastDanceIndex, message };
