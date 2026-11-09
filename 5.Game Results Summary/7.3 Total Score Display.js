// 7.3 ระบบแสดงคะแนนรวม — จัดรูปแบบข้อความ/HTML สำหรับหน้าจอสรุป
'use strict';

const stars = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
const bar = (pct, width = 20) => {
  const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return '█'.repeat(f) + '░'.repeat(width - f);
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ข้อความล้วน (เทอร์มินัล / กล่องผลลัพธ์)
function formatTotalScore(scores, assessment) {
  return [
    `คะแนนรวม ${scores.totalScore} / 100  ${stars(assessment.stars)}`,
    `[${bar(scores.totalScore)}]  เกรด ${assessment.letter} (${assessment.grade})`,
  ].join('\n');
}

function formatExerciseLine(e) {
  const reps = e.targetReps ? `${e.repsDone}/${e.targetReps} ครั้ง` : `${e.repsDone} ครั้ง`;
  const form = e.form == null ? '' : ` · ท่าทาง ${e.form}`;
  const per = e.repScores && e.repScores.length > 1 ? `\n   รายครั้ง: ${e.repScores.join(', ')}` : '';
  return `${e.skipped ? '(ข้าม) ' : ''}${e.name}: ${reps} · ${e.score} คะแนน${form}${per}`;
}

// กราฟแท่งคะแนนรายครั้ง (HTML) — สีตามเกณฑ์เกรด: >=85 ดีมาก, >=70 ดี, ต่ำกว่านั้นควรปรับ
function repChartHtml(scores) {
  const bars = scores.map((s, i) => {
    const v = Math.max(0, Math.min(100, s));
    const cls = v >= 85 ? 'g' : v >= 70 ? 'o' : 'l';
    return `<i class="${cls}" style="height:${Math.max(6, v)}%" title="ครั้งที่ ${i + 1}: ${v} คะแนน"></i>`;
  }).join('');
  return `<div class="rep-chart" role="img" aria-label="คะแนนรายครั้ง">${bars}</div>`;
}

// HTML ชิ้นเดียว (ใส่ innerHTML ได้ — ข้อความทั้งหมดถูก escape แล้ว)
function renderTotalScoreHtml(scores, assessment) {
  const rows = scores.perExercise.map((e) =>
    `<tr><td>${esc(e.name)}${e.skipped ? ' (ข้าม)' : ''}</td><td>${e.repsDone}${e.targetReps ? '/' + e.targetReps : ''}</td>` +
    `<td>${e.form == null ? '-' : e.form}</td><td><b>${e.score}</b></td></tr>` +
    (e.repScores && e.repScores.length > 1 ? `<tr class="rep-row"><td colspan="4">${repChartHtml(e.repScores)}</td></tr>` : '')).join('');
  return `<div class="score-summary">
  <div class="score-total"><span class="score-num">${scores.totalScore}</span><span>/100</span></div>
  <div class="score-stars">${stars(assessment.stars)}</div>
  <div class="score-grade">เกรด ${esc(assessment.letter)} · ${esc(assessment.grade)}</div>
  <table><thead><tr><th>ท่า</th><th>ครั้ง</th><th>ท่าทาง</th><th>คะแนน</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
}

module.exports = { stars, bar, formatTotalScore, formatExerciseLine, repChartHtml, renderTotalScoreHtml };
