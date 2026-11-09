// 6.4 ระบบแจ้งสถานะการออกกำลังกาย — ฟังเหตุการณ์ของเกม (2.1-2.4) แล้วแจ้งว่าเริ่ม/พัก/จบท่า/หยุด/จบเกม
// ไม่ต้อง require โมดูล 2.x: ผูกกับ state.listeners ที่ on() ของ 2.1 ใช้อยู่โดยตรง
'use strict';

const REASON_TEXT = { reps: 'ครบจำนวนครั้ง', timeout: 'หมดเวลา', skip: 'ข้ามท่า', quit: 'ออกจากเกม' };

// แปลงเหตุการณ์เป็นข้อความ (คืน null ถ้าไม่ต้องแจ้ง)
function describeEvent(event, payload, state) {
  switch (event) {
    case 'start': return { message: 'เริ่มเกมแล้ว เตรียมตัวให้พร้อม', level: 'info' };
    case 'go': {
      const first = state.queue[0];
      return { message: first ? `เริ่ม! ท่าแรก: ${first.name}` : 'เริ่ม!', level: 'good' };
    }
    case 'rest':
      return { message: `พัก ${Math.round(payload.seconds)} วินาที ท่าถัดไป: ${payload.next.name}`, level: 'info' };
    case 'rest-end':
      return { message: `เริ่มท่า ${payload.exercise.name}`, level: 'good' };
    case 'exercise-end': {
      const why = REASON_TEXT[payload.reason] || payload.reason;
      return {
        message: `${payload.name}: ${payload.repsDone}/${payload.targetReps} ครั้ง (${why})`,
        level: payload.completed ? 'good' : 'warn',
      };
    }
    case 'pause': return { message: 'หยุดชั่วคราว', level: 'info' };
    case 'resume': return { message: 'เล่นต่อ', level: 'info' };
    case 'finish': return { message: payload.reason === 'quit' ? 'ออกจากเกมแล้ว' : 'จบเกม เก่งมาก!', level: 'good' };
    default: return null;
  }
}

const EVENTS = ['start', 'go', 'rest', 'rest-end', 'exercise-end', 'pause', 'resume', 'finish'];

// ผูกตัวแจ้งเตือนกับ state: notify(message, level) — คืนฟังก์ชันถอดออก
function attachStatusNotifier(state, notify) {
  const handlers = EVENTS.map((ev) => {
    const h = (payload) => {
      const d = describeEvent(ev, payload || {}, state);
      if (d) notify(d.message, d.level);
    };
    (state.listeners[ev] ||= []).push(h);
    return [ev, h];
  });
  return () => handlers.forEach(([ev, h]) => {
    state.listeners[ev] = (state.listeners[ev] || []).filter((x) => x !== h);
  });
}

module.exports = { describeEvent, attachStatusNotifier };
