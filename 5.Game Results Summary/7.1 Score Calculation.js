// 7.1 ระบบคำนวณคะแนน — คะแนนรายท่า (0-100) และคะแนนรวมจากผลของ 2.3/2.4
// อินพุตต่อท่า: { name, targetReps, repsDone, targetDurationSec, elapsedMs, completed, reason, formScore? }
//   formScore (0-100, ไม่บังคับ) = คะแนนความถูกต้องของท่าจากระบบ AI (1.5 PoseEvaluator.average)
'use strict';

const WEIGHTS = Object.freeze({ completion: 0.6, form: 0.4 }); // เมื่อมีคะแนนท่าทาง
const MAX_TIME_BONUS = 10;                                      // โบนัสทำเสร็จเร็วสูงสุด (คะแนน)
const DIFFICULTY_MULTIPLIER = Object.freeze({ easy: 0.9, normal: 1, hard: 1.1 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// สัดส่วนจำนวนครั้งที่ทำได้ (0-100)
function completionScore(r) {
  if (!(r.targetReps > 0)) return r.completed ? 100 : 0;
  return clamp((r.repsDone / r.targetReps) * 100, 0, 100);
}

// โบนัสเมื่อทำครบด้วยจำนวนครั้ง (reason 'reps') และเหลือเวลา — ยิ่งเร็วยิ่งได้มาก
function timeBonus(r) {
  if (r.reason !== 'reps' || !(r.targetDurationSec > 0)) return 0;
  const left = 1 - r.elapsedMs / (r.targetDurationSec * 1000);
  return round1(clamp(left, 0, 1) * MAX_TIME_BONUS);
}

// คะแนนของท่าเดียว
function scoreExercise(r) {
  const completion = completionScore(r);
  const hasForm = typeof r.formScore === 'number' && !Number.isNaN(r.formScore);
  const form = hasForm ? clamp(r.formScore, 0, 100) : null;
  const base = hasForm ? completion * WEIGHTS.completion + form * WEIGHTS.form : completion;
  const bonus = completion >= 100 ? timeBonus(r) : 0; // ได้โบนัสเฉพาะเมื่อทำครบ
  return {
    id: r.id,
    name: r.name,
    completion: round1(completion),
    form: form == null ? null : round1(form),
    timeBonus: bonus,
    score: round1(clamp(base + bonus, 0, 100)),
    skipped: r.reason === 'skip',
    repsDone: r.repsDone,
    targetReps: r.targetReps,
    repScores: Array.isArray(r.repScores) ? r.repScores.slice() : [], // คะแนนรายครั้งจาก AI (ถ้ามี)
  };
}

// คะแนนรวมทั้งเกม: ค่าเฉลี่ยรายท่า × ตัวคูณระดับความยาก (สูงสุด 100)
// totalQueue = จำนวนท่าที่เลือกไว้ทั้งหมด — ท่าที่ยังไม่ได้เล่น (ออกเกมกลางคัน) นับเป็น 0
function calculateScores(results, options = {}) {
  const perExercise = (results || []).map(scoreExercise);
  const count = Math.max(options.totalQueue || 0, perExercise.length);
  const sum = perExercise.reduce((s, e) => s + e.score, 0);
  const average = count ? sum / count : 0;
  const multiplier = DIFFICULTY_MULTIPLIER[options.difficulty] ?? 1;
  return {
    perExercise,
    averageScore: round1(average),
    difficulty: options.difficulty || 'normal',
    multiplier,
    totalScore: Math.round(clamp(average * multiplier, 0, 100)),
    unplayed: Math.max(0, count - perExercise.length),
  };
}

module.exports = { WEIGHTS, MAX_TIME_BONUS, DIFFICULTY_MULTIPLIER, completionScore, timeBonus, scoreExercise, calculateScores };
