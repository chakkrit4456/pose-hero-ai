// 6.3 ระบบแจ้งเตือนเวลาและจำนวนครั้ง — ดูจาก getProgress (2.3) แล้วแจ้งจุดสำคัญ (แต่ละจุดแจ้งครั้งเดียวต่อท่า)
//   จำนวนครั้ง: ครึ่งทาง / เหลือ 3 / ครั้งสุดท้าย   เวลา: เหลือ 10 และ 5 วินาที   พัก: เหลือ 3 วินาที
'use strict';

function createCountAlerts() {
  let fired = new Set();
  let idx = null;

  return {
    // progress = ผลของ getProgress(state) คืนรายการ { key, message, level } ที่ควรแจ้งตอนนี้
    check(progress) {
      if (!progress || !progress.exercise) return [];
      if (progress.index !== idx) { idx = progress.index; fired = new Set(); }
      const out = [];
      const fire = (key, message, level = 'info') => {
        if (fired.has(key)) return;
        fired.add(key);
        out.push({ key, message, level });
      };
      const ex = progress.exercise;

      if (progress.resting) {
        if (progress.restLeftSec === 3) fire('rest3', `เตรียมตัว ท่าถัดไป: ${ex.name}`);
        return out;
      }

      const target = ex.reps, done = progress.repsDone, left = target - done;
      if (target >= 4 && done > 0) {
        if (done === Math.ceil(target / 2) && left > 3) fire('half', 'ครึ่งทางแล้ว สู้ ๆ!', 'good');
        if (left === 3) fire('left3', 'อีก 3 ครั้ง');
        if (left === 1) fire('last', 'ครั้งสุดท้าย!', 'good');
      }
      if (left > 0) {
        if (progress.timeLeftSec === 10) fire('t10', 'เหลือเวลา 10 วินาที', 'warn');
        if (progress.timeLeftSec === 5) fire('t5', 'เหลือเวลา 5 วินาที', 'warn');
      }
      return out;
    },
    reset() { fired = new Set(); idx = null; },
  };
}

module.exports = { createCountAlerts };
