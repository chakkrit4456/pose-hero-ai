// 6.1 ระบบแจ้งเตือนท่าผิด — ดูข้อความติเตียนสดจาก AI (1.5 live_feedback) แล้วเตือนเมื่อผิดต่อเนื่อง
// กันการเตือนถี่/กะพริบ: ต้องผิดเรื่องเดิมนานเกิน holdMs และเตือนเรื่องเดิมซ้ำได้หลัง cooldownMs
'use strict';

function createPoseAlert({ holdMs = 1200, cooldownMs = 5000 } = {}) {
  let current = null;
  let since = 0;
  const lastShown = new Map(); // ข้อความ -> เวลาที่เตือนล่าสุด
  const counts = new Map();    // ข้อความ -> จำนวนครั้งที่เตือนไปแล้ว

  return {
    // feedback = รายการข้อความติเตียนของเฟรมนี้ (ว่าง = ท่าถูก) คืน alert หรือ null
    update(feedback, nowMs) {
      const top = feedback && feedback.length ? feedback[0] : null;
      if (!top) { current = null; return null; }
      if (top !== current) { current = top; since = nowMs; return null; }
      if (nowMs - since < holdMs) return null;
      if (nowMs - (lastShown.get(top) ?? -Infinity) < cooldownMs) return null;
      lastShown.set(top, nowMs);
      counts.set(top, (counts.get(top) || 0) + 1);
      return { type: 'pose', level: 'warn', message: top, count: counts.get(top) };
    },
    reset() { current = null; since = 0; lastShown.clear(); counts.clear(); },
  };
}

module.exports = { createPoseAlert };
