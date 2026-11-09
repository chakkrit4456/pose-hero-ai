// 2.2 ระบบเลือกท่าบริหาร — เลือก/ยกเลิก/จัดลำดับท่า และกำหนดจำนวนครั้ง/เวลาต่อท่า
'use strict';

const { GAME_STATUS, DIFFICULTY, emit } = require('./2.1 Start Game.js');

// ท่าสำหรับผู้ที่เป็นออฟฟิศซินโดรม (ทำได้ที่โต๊ะทำงาน)
const EXERCISE_CATALOG = [
  { id: 'neck-tilt',      name: 'เอียงคอซ้าย-ขวา',        target: 'คอ / บ่า',          reps: 8,  durationSec: 30 },
  { id: 'chin-tuck',      name: 'เก็บคางแก้คอยื่น',       target: 'คอ',               reps: 10, durationSec: 30 },
  { id: 'shoulder-roll',  name: 'หมุนไหล่',               target: 'ไหล่ / บ่า',        reps: 10, durationSec: 30 },
  { id: 'upper-trap',     name: 'ยืดกล้ามเนื้อบ่า',       target: 'บ่า',              reps: 6,  durationSec: 40 },
  { id: 'chest-opener',   name: 'ประสานมือเหยียดอกไปหลัง', target: 'อก / หลังส่วนบน',   reps: 8,  durationSec: 30 },
  { id: 'arm-stretch',    name: 'ยืดแขนเหนือศีรษะ',       target: 'แขน / สะบัก',       reps: 8,  durationSec: 30 },
  { id: 'seated-twist',   name: 'นั่งบิดลำตัว',           target: 'หลังส่วนล่าง',       reps: 10, durationSec: 40 },
  { id: 'wrist-stretch',  name: 'ยืดข้อมือและนิ้วมือ',    target: 'ข้อมือ (นิ้วล็อก)',  reps: 10, durationSec: 30 },
  { id: 'wrist-circle',   name: 'หมุนข้อมือ',             target: 'ข้อมือ',            reps: 12, durationSec: 20 },
];

// เปลี่ยนระดับความยาก: ปรับท่าที่เลือกไว้ทั้งหมดใหม่ตามระดับ
function setDifficulty(state, key) {
  assertEditable(state);
  if (!DIFFICULTY[key]) throw new Error(`ไม่มีระดับความยาก: ${key}`);
  const ids = state.queue.map((q) => q.id);
  state.difficulty = key;
  state.queue = [];
  ids.forEach((id) => selectExercise(state, id));
  return state;
}

function getCatalog() {
  return EXERCISE_CATALOG.map((e) => ({ ...e }));
}

function assertEditable(state) {
  if (state.status !== GAME_STATUS.IDLE && state.status !== GAME_STATUS.FINISHED) {
    throw new Error('เปลี่ยนท่าบริหารไม่ได้ขณะเกมกำลังดำเนินอยู่');
  }
}

function findInCatalog(id) {
  const ex = EXERCISE_CATALOG.find((e) => e.id === id);
  if (!ex) throw new Error(`ไม่พบท่าบริหาร: ${id}`);
  return ex;
}

function validateTarget({ reps, durationSec }) {
  if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
    throw new Error('จำนวนครั้งต้องเป็นจำนวนเต็ม 1-100');
  }
  if (!Number.isFinite(durationSec) || durationSec < 5 || durationSec > 600) {
    throw new Error('เวลาต่อท่าต้องอยู่ระหว่าง 5-600 วินาที');
  }
}

function selectExercise(state, id, overrides = {}) {
  assertEditable(state);
  if (state.queue.some((q) => q.id === id)) return state; // เลือกซ้ำ ไม่ทำอะไร
  const base = findInCatalog(id);
  const level = DIFFICULTY[state.difficulty];
  const item = {
    id: base.id,
    name: base.name,
    target: base.target,
    reps: overrides.reps ?? Math.max(1, Math.round(base.reps * level.repsMul)),
    durationSec: overrides.durationSec ?? Math.round(base.durationSec * level.timeMul),
  };
  validateTarget(item);
  state.queue.push(item);
  emit(state, 'select', item);
  return state;
}

function deselectExercise(state, id) {
  assertEditable(state);
  const before = state.queue.length;
  state.queue = state.queue.filter((q) => q.id !== id);
  if (state.queue.length !== before) emit(state, 'deselect', { id });
  return state;
}

function toggleExercise(state, id) {
  return state.queue.some((q) => q.id === id)
    ? deselectExercise(state, id)
    : selectExercise(state, id);
}

function setExerciseTarget(state, id, { reps, durationSec }) {
  assertEditable(state);
  const item = state.queue.find((q) => q.id === id);
  if (!item) throw new Error(`ยังไม่ได้เลือกท่า: ${id}`);
  const next = { reps: reps ?? item.reps, durationSec: durationSec ?? item.durationSec };
  validateTarget(next);
  Object.assign(item, next);
  return state;
}

function moveExercise(state, id, newIndex) {
  assertEditable(state);
  const from = state.queue.findIndex((q) => q.id === id);
  if (from < 0) throw new Error(`ยังไม่ได้เลือกท่า: ${id}`);
  const to = Math.max(0, Math.min(state.queue.length - 1, newIndex));
  const [item] = state.queue.splice(from, 1);
  state.queue.splice(to, 0, item);
  return state;
}

function selectAll(state) {
  EXERCISE_CATALOG.forEach((e) => selectExercise(state, e.id));
  return state;
}

function clearSelection(state) {
  assertEditable(state);
  state.queue = [];
  return state;
}

module.exports = {
  setDifficulty,  getCatalog, selectExercise, deselectExercise, toggleExercise,
  setExerciseTarget, moveExercise, selectAll, clearSelection,
};
