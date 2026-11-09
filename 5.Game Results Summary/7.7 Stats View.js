// 7.7 สถิติของฉัน — สรุปประวัติการเล่น (จาก 7.5) เป็นตัวเลข กราฟแนวโน้ม ปฏิทินวันที่เล่น และรายการรอบล่าสุด
// ฟังก์ชันล้วน ไม่แตะ DOM (ส่วนวาดอยู่ในหน้าเกม) ใช้ทดสอบใน Node ได้
'use strict';

const { streakDays } = require('./7.5 Play History.js');

const DAY = 86400000;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// รายชื่อผู้เล่นที่มีประวัติ (เรียงตามรอบล่าสุดก่อน)
function players(list) {
  const seen = new Map();
  list.forEach((e) => seen.set(e.player, e.at));
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

// สรุปตัวเลข player = ชื่อผู้เล่น (ว่าง/undefined = ทุกคน)
function summarize(list, player) {
  const mine = player ? list.filter((e) => e.player === player) : list.slice();
  if (!mine.length) return { plays: 0, empty: true, series: [], recent: [] };
  const scores = mine.map((e) => e.totalScore);
  const last5 = scores.slice(-5), prev5 = scores.slice(-10, -5);
  return {
    plays: mine.length,
    best: Math.max(...scores),
    average: Math.round(avg(scores)),
    last: scores[scores.length - 1],
    totalReps: mine.reduce((s, e) => s + (e.totalReps || 0), 0),
    totalTimeSec: mine.reduce((s, e) => s + (e.totalTimeSec || 0), 0),
    activeDays: new Set(mine.map((e) => dayKey(e.at))).size,
    streak: streakDays(mine),
    // แนวโน้ม: ค่าเฉลี่ย 5 รอบล่าสุดเทียบ 5 รอบก่อนหน้า (ต้องมีอย่างน้อย 6 รอบ)
    trend: prev5.length ? Math.round(avg(last5) - avg(prev5)) : null,
    series: mine.slice(-20).map((e) => ({ at: e.at, score: e.totalScore, grade: e.grade })),
    recent: mine.slice(-8).reverse(),
  };
}

// ปฏิทินย้อนหลัง `days` วัน (เก่า -> ใหม่) แต่ละช่อง { key, at, plays, best }  pad = จำนวนช่องว่างนำหน้าให้เริ่มตรงวันจันทร์
function calendar(list, player, now = Date.now(), days = 28) {
  const mine = player ? list.filter((e) => e.player === player) : list;
  const by = new Map();
  mine.forEach((e) => {
    const k = dayKey(e.at), cur = by.get(k) || { plays: 0, best: 0 };
    cur.plays++; cur.best = Math.max(cur.best, e.totalScore); by.set(k, cur);
  });
  const base = new Date(now); base.setHours(12, 0, 0, 0);
  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = base.getTime() - i * DAY, k = dayKey(t), v = by.get(k);
    cells.push({ key: k, at: t, plays: v ? v.plays : 0, best: v ? v.best : 0 });
  }
  const dow = new Date(cells[0].at).getDay(); // 0 = อาทิตย์
  return { cells, pad: (dow + 6) % 7 };
}

// ข้อความให้กำลังใจจากตัวเลข
function headline(s) {
  if (s.empty) return 'ยังไม่มีประวัติ — เล่นเกมจบ 1 รอบแล้วสถิติจะมาอยู่ที่นี่';
  if (s.streak >= 3) return `เล่นติดต่อกัน ${s.streak} วันแล้ว สุดยอด!`;
  if (s.trend != null && s.trend > 0) return `คะแนนเฉลี่ยดีขึ้น +${s.trend} จากช่วงก่อนหน้า`;
  if (s.trend != null && s.trend < 0) return 'ช่วงนี้คะแนนลดลงเล็กน้อย พักผ่อนให้พอแล้วลองใหม่';
  return `เล่นมาแล้ว ${s.plays} รอบ คะแนนสูงสุด ${s.best}`;
}

module.exports = { players, summarize, calendar, headline, dayKey };
