// 9.2 ชุดท่าสำเร็จรูป — กดเดียวเลือกท่าให้ครบตามเป้าหมาย (แก้ปวดคอ ก่อนประชุม ฯลฯ)
// id ของท่าต้องมีในแคตตาล็อกของ 2.2 (มีเทสต์ตรวจ) ถ้าท่าใดหายไป resolve จะข้ามท่านั้นให้เอง
'use strict';

const ROUTINES = Object.freeze([
  { id: 'neck',    name: 'แก้ปวดคอ-บ่า',        desc: 'เอียงคอ ยืดบ่า หมุนไหล่ ยกไหล่ — เหมาะเวลาก้มหน้าจอนาน ๆ',
    ids: ['neck-tilt', 'upper-trap', 'shoulder-roll', 'basic_07'] },
  { id: 'meeting', name: 'ก่อนประชุม (สั้น ๆ)',    desc: 'ปลุกไหล่และคอให้ตื่นก่อนเข้าห้องประชุม ใช้เวลาไม่นาน',
    ids: ['basic_02', 'neck-tilt', 'shoulder-roll'], reps: { basic_02: 5, 'neck-tilt': 4, 'shoulder-roll': 5 } },
  { id: 'wrist',   name: 'พักข้อมือ-แขน',       desc: 'หมุนและยืดข้อมือ งอศอก ยืดแขน — หลังพิมพ์งานนาน ๆ',
    ids: ['wrist-circle', 'wrist-stretch', 'basic_03', 'arm-stretch'] },
  { id: 'back',    name: 'ยืดหลัง-เอว',          desc: 'เอียงและบิดลำตัว ก้มตัว — คลายหลังที่นั่งติดเก้าอี้',
    ids: ['basic_05', 'seated-twist', 'basic_09', 'basic_08'] },
  { id: 'legs',    name: 'ปลุกขา-สะโพก',         desc: 'ย่อเข่า ยกเข่าสลับ — กระตุ้นเลือดลมหลังนั่งนาน',
    ids: ['basic_04', 'basic_06'] },
  { id: 'full',    name: 'ยืดทั้งตัว',    desc: 'ครบทั้งคอ ไหล่ แขน หลัง และขา — ทำสบาย ๆ วันละครั้ง',
    ids: ['basic_10', 'neck-tilt', 'arm-stretch', 'basic_05', 'seated-twist', 'basic_08', 'basic_04'] },
]);

const SEC_PER_REP = 4;     // ประมาณเวลาต่อ 1 ครั้ง (วินาที)
const HOLD_EXTRA_SEC = 8;  // ท่าค้าง: เผื่อเวลาค้างต่อครั้ง

// เลือกเฉพาะท่าที่มีจริงในแคตตาล็อก คืนรายการ { id, reps? }
function resolve(routine, catalogIds) {
  const have = new Set(catalogIds);
  return routine.ids.filter((id) => have.has(id)).map((id) => ({ id, reps: routine.reps && routine.reps[id] }));
}

// ประมาณจำนวนนาทีจากรายการท่า (items = [{ reps, hold? }]) + เวลาพักระหว่างท่า — ใช้บอกผู้เล่นคร่าว ๆ
function estimateMinutes(items, restSec = 5) {
  if (!items.length) return 0;
  const sec = items.reduce((s, it) => s + it.reps * (SEC_PER_REP + (it.hold ? HOLD_EXTRA_SEC : 0)), 0) + (items.length - 1) * restSec + items.length * 6;
  return Math.max(1, Math.round(sec / 60));
}

module.exports = { ROUTINES, resolve, estimateMinutes };
