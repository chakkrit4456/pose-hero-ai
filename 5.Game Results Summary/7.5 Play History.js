// 7.5 ระบบประวัติการเล่น — เก็บผลแต่ละรอบ, เทียบกับรอบก่อน, คะแนนสูงสุด, เล่นติดต่อกันกี่วัน
// storage = อ็อบเจกต์แบบ localStorage (getItem/setItem) — ใช้ไม่ได้/เต็มก็ไม่ทำให้เกมพัง
'use strict';

const KEY = 'move-relieve-history';
const MAX_ENTRIES = 50;

function load(storage) {
  try {
    const list = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// จำนวนวันติดต่อกันที่เล่น นับถึงวันของรอบล่าสุด
function streakDays(list) {
  if (!list.length) return 0;
  const days = new Set(list.map((e) => dayKey(e.at)));
  let streak = 0;
  const d = new Date(list[list.length - 1].at);
  d.setHours(12, 0, 0, 0);
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// เทียบรอบล่าสุดกับประวัติ (เฉพาะผู้เล่นคนเดียวกัน)
function analyze(list) {
  const latest = list[list.length - 1];
  if (!latest) return null;
  const mine = list.filter((e) => e.player === latest.player);
  const before = mine.slice(0, -1);
  const prev = before[before.length - 1] || null;
  const bestBefore = before.reduce((m, e) => Math.max(m, e.totalScore), -1);
  return {
    plays: mine.length,
    previousScore: prev ? prev.totalScore : null,
    delta: prev ? latest.totalScore - prev.totalScore : null,
    bestScore: Math.max(latest.totalScore, bestBefore),
    isNewBest: before.length > 0 && latest.totalScore > bestBefore,
    streakDays: streakDays(mine),
  };
}

// บันทึกผลจาก summarizeGame (7.4) แล้วคืนผลเปรียบเทียบ — ไม่บันทึกรอบที่ไม่ได้เล่นอะไรเลย
function recordSession(storage, summary, now = Date.now()) {
  const list = load(storage);
  if (summary.stats.totalReps > 0 || summary.scores.perExercise.length > 0) {
    list.push({
      at: now,
      player: summary.stats.playerName,
      difficulty: summary.stats.difficulty,
      totalScore: summary.scores.totalScore,
      grade: summary.assessment.grade,
      totalReps: summary.stats.totalReps,
      totalTimeSec: summary.stats.totalTimeSec,
      completed: summary.stats.completedExercises,
      total: summary.stats.totalExercises,
    });
    try { storage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES))); } catch (e) { /* เก็บไม่ได้ ข้ามไป */ }
  }
  return analyze(list);
}

function formatHistory(a) {
  if (!a) return [];
  const lines = [`เล่นแล้ว ${a.plays} รอบ · คะแนนสูงสุด ${a.bestScore}` + (a.streakDays > 1 ? ` · เล่นติดต่อกัน ${a.streakDays} วัน 🔥` : '')];
  if (a.isNewBest) lines.unshift('🏆 คะแนนสูงสุดใหม่!');
  if (a.delta != null) {
    lines.push(a.delta > 0 ? `ดีขึ้น +${a.delta} จากรอบก่อน (${a.previousScore})`
      : a.delta < 0 ? `ลดลง ${a.delta} จากรอบก่อน (${a.previousScore}) — สู้ ๆ รอบหน้าทำได้`
      : `เท่ารอบก่อน (${a.previousScore})`);
  } else {
    lines.push('นี่คือรอบแรกของคุณ — รอบหน้าจะเทียบพัฒนาการให้');
  }
  return lines;
}

// ล้างประวัติทั้งหมด (คืน true ถ้าสำเร็จ)
function clear(storage) {
  try { storage.removeItem(KEY); return true; } catch (e) { return false; }
}

module.exports = { KEY, load, analyze, streakDays, recordSession, formatHistory, clear };
