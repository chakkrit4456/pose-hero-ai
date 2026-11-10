// 9.5 เตือนให้พักเป็นระยะ — ตรรกะล้วน (ไม่แตะ DOM/Notification): บอกว่า "ตอนนี้ถึงเวลาเตือนหรือยัง"
// ข้อจำกัด: ทำงานได้เฉพาะตอนเปิดหน้าเกมค้างไว้ (เบราว์เซอร์ไม่ให้หน้าเว็บทำงานตอนปิดโดยไม่มีเซิร์ฟเวอร์ส่งแจ้งเตือน)
'use strict';

const KEY = 'move-relieve-remind';
const INTERVALS = Object.freeze([30, 45, 60, 90]); // นาที
const DEFAULTS = Object.freeze({ enabled: false, intervalMin: 60, startHour: 9, endHour: 18 });
const SNOOZE_MIN = 10;

const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function normalize(o) {
  const x = { ...DEFAULTS, ...(o || {}) };
  x.enabled = !!x.enabled;
  if (!INTERVALS.includes(x.intervalMin)) x.intervalMin = DEFAULTS.intervalMin;
  x.startHour = Number.isInteger(x.startHour) && x.startHour >= 0 && x.startHour <= 23 ? x.startHour : DEFAULTS.startHour;
  x.endHour = Number.isInteger(x.endHour) && x.endHour >= 1 && x.endHour <= 24 ? x.endHour : DEFAULTS.endHour;
  return x;
}

// อยู่ในช่วงเวลาทำงาน [startHour, endHour) ของวันหรือไม่ (ถ้า end <= start ถือว่าข้ามเที่ยงคืน)
function inWorkHours(now, startHour, endHour) {
  const h = new Date(now).getHours();
  return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

// state = { lastAt, snoozedUntil, dismissedDay } — lastAt = เวลาล่าสุดที่เล่นเสร็จ หรือเวลาเปิดหน้าเกม
function createReminder(settings, state, now = Date.now()) {
  const cfg = normalize(settings);
  const st = { lastAt: now, snoozedUntil: 0, dismissedDay: null, ...(state || {}) };
  if (!(st.lastAt <= now)) st.lastAt = now; // เวลาในอนาคต (เครื่องปรับนาฬิกา) ถือว่าเริ่มนับใหม่
  return {
    cfg, state: st,
    due(t = Date.now()) {
      if (!cfg.enabled) return false;
      if (st.dismissedDay === dayKey(t)) return false;
      if (t < st.snoozedUntil) return false;
      if (!inWorkHours(t, cfg.startHour, cfg.endHour)) return false;
      return t - st.lastAt >= cfg.intervalMin * 60000;
    },
    minutesLeft(t = Date.now()) { return Math.max(0, Math.ceil((cfg.intervalMin * 60000 - (t - st.lastAt)) / 60000)); },
    markActive(t = Date.now()) { st.lastAt = t; st.snoozedUntil = 0; },          // เล่นเสร็จแล้ว เริ่มนับรอบใหม่
    snooze(t = Date.now(), min = SNOOZE_MIN) { st.snoozedUntil = t + min * 60000; },
    dismissToday(t = Date.now()) { st.dismissedDay = dayKey(t); },
  };
}

function loadState(storage) { try { const o = JSON.parse(storage.getItem(KEY) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
function saveState(storage, state) { try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }

module.exports = { KEY, INTERVALS, DEFAULTS, SNOOZE_MIN, normalize, inWorkHours, createReminder, loadState, saveState };
