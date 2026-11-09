// 7.4 ระบบสรุปการเล่น — รวม 7.1-7.3 เป็นสรุปผลเกมฉบับเดียวจากสถานะเกม (2.x)
// ใช้: const { summarizeGame } = require('./7.4 Gameplay Summary.js'); summarizeGame(state)
'use strict';

const { calculateScores } = require('./7.1 Score Calculation.js');
const { assessGameplay } = require('./7.2 Gameplay Assessment.js');
const { formatTotalScore, formatExerciseLine, renderTotalScoreHtml } = require('./7.3 Total Score Display.js');

const fmtTime = (sec) => `${Math.floor(sec / 60)} นาที ${sec % 60} วินาที`;

// options.formScores (ไม่บังคับ): { [exerciseId]: คะแนนท่าทาง 0-100 } จากระบบ AI
function summarizeGame(state, options = {}) {
  const formScores = options.formScores || {};
  const repScores = options.repScores || {};
  const results = (state.results || []).map((r) => ({ ...r, formScore: r.formScore ?? formScores[r.id], repScores: r.repScores ?? repScores[r.id] }));
  const totalQueue = (state.queue || []).length;
  const scores = calculateScores(results, { difficulty: state.difficulty, totalQueue });
  const quit = results.some((r) => r.reason === 'quit') || scores.unplayed > 0;
  const assessment = assessGameplay(scores, { ...options, quit });
  // ท่าที่ควรฝึกซ้ำ: คะแนนต่ำกว่า 70 หรือยังไม่ได้เล่น (ออกก่อนจบ)
  const playedIds = new Set(results.map((r) => r.id));
  const weakIds = [
    ...scores.perExercise.filter((e) => e.score < 70).map((e) => e.id),
    ...(state.queue || []).filter((q) => !playedIds.has(q.id)).map((q) => q.id),
  ];
  // คำแนะนำรายท่าจาก AI (1.5): options.exerciseAdvice = { [exerciseId]: [ข้อความ] } — เฉพาะท่าที่ได้เล่นและคะแนนท่าทางไม่เต็ม
  const tips = scores.perExercise
    .filter((e) => (options.exerciseAdvice || {})[e.id]?.length)
    .map((e) => ({ id: e.id, name: e.name, advice: options.exerciseAdvice[e.id].slice(0, 3) }));
  const totalReps = results.reduce((s, r) => s + r.repsDone, 0);
  const totalTimeSec = Math.round((state.totalElapsedMs || 0) / 1000);
  const stats = {
    playerName: state.playerName,
    difficulty: state.difficulty,
    totalExercises: totalQueue,
    completedExercises: results.filter((r) => r.completed).length,
    totalReps,
    totalTimeSec,
    quit,
  };

  const text = [
    `==== สรุปผลการเล่น — ${stats.playerName} ====`,
    `ระดับ: ${state.difficulty} · เวลารวม ${fmtTime(totalTimeSec)} · ทำได้ ${totalReps} ครั้ง · สำเร็จ ${stats.completedExercises}/${stats.totalExercises} ท่า`,
    '',
    ...scores.perExercise.map(formatExerciseLine),
    '',
    formatTotalScore(scores, assessment),
    ...(assessment.strengths.length ? ['', 'จุดเด่น:', ...assessment.strengths.map((s) => `  + ${s}`)] : []),
    ...(assessment.improvements.length ? ['', 'ควรปรับปรุง:', ...assessment.improvements.map((s) => `  - ${s}`)] : []),
    ...(tips.length ? ['', 'วิธีแก้รายท่า:', ...tips.map((t) => `  ${t.name}: ${t.advice.join(' / ')}`)] : []),
    '',
    'คำแนะนำ: ' + assessment.advice.join(' / '),
  ].join('\n');

  return { stats, scores, assessment, tips, weakIds, text, html: renderTotalScoreHtml(scores, assessment) };
}

module.exports = { summarizeGame };
