// 7.2 ระบบประเมินการเล่น — เกรด, ดาว, จุดเด่น/จุดที่ควรปรับปรุง, คำแนะนำ
// เกณฑ์เกรดตรงกับ gradeFor ของ 1.5 (85 / 70 / 50)
'use strict';

const GRADES = Object.freeze([
  { min: 85, grade: 'ยอดเยี่ยม', letter: 'A', stars: 3 },
  { min: 70, grade: 'ดี', letter: 'B', stars: 2 },
  { min: 50, grade: 'พอใช้', letter: 'C', stars: 1 },
  { min: 0, grade: 'ต้องปรับปรุง', letter: 'D', stars: 0 },
]);

function gradeFor(score) {
  return GRADES.find((g) => score >= g.min) || GRADES[GRADES.length - 1];
}

// ประเมินจากผลคะแนน (ผลลัพธ์ของ 7.1 calculateScores)
function assessGameplay(scores, options = {}) {
  const { perExercise, totalScore, unplayed } = scores;
  const quit = !!options.quit; // ออกก่อนจบ: ไม่ตัดเกรดโหด แต่บอกว่าเล่นยังไม่จบ
  const g = quit ? { ...gradeFor(totalScore), grade: 'เล่นยังไม่จบ', letter: '–' } : gradeFor(totalScore);
  const played = perExercise.filter((e) => !e.skipped);
  const strengths = [];
  const improvements = [];

  const best = [...perExercise].sort((a, b) => b.score - a.score)[0];
  const worst = [...perExercise].sort((a, b) => a.score - b.score)[0];
  if (best && best.score >= 70) strengths.push(`ทำท่า "${best.name}" ได้ดีที่สุด (${best.score} คะแนน)`);
  if (worst && worst.score < 70 && perExercise.length > 1) improvements.push(`ท่า "${worst.name}" ยังได้คะแนนน้อย (${worst.score}) ลองฝึกซ้ำ`);

  if (perExercise.length > 0 && perExercise.every((e) => e.completion >= 100)) strengths.push('ทำครบจำนวนครั้งในทุกท่า');
  const skipped = perExercise.filter((e) => e.skipped);
  if (skipped.length) improvements.push(`ข้ามไป ${skipped.length} ท่า: ${skipped.map((e) => e.name).join(', ')}`);
  if (unplayed > 0) improvements.push(`ยังไม่ได้เล่นอีก ${unplayed} ท่า (ออกจากเกมก่อนจบ)`);

  const withForm = played.filter((e) => e.form != null);
  if (withForm.length) {
    const avgForm = withForm.reduce((s, e) => s + e.form, 0) / withForm.length;
    if (avgForm >= 85) strengths.push('ท่าทางถูกต้องแม่นยำมาก');
    else if (avgForm < 60) improvements.push('ท่าทางยังไม่ค่อยถูกต้อง ลองทำช้าลงและดูท่าตัวอย่างประกอบ');
  }
  if (perExercise.some((e) => e.timeBonus >= 5)) strengths.push('ทำเสร็จก่อนเวลาที่กำหนดในบางท่า');

  // คะแนนรายครั้งตกช่วงท้าย = ล้า: เทียบค่าเฉลี่ยครึ่งแรกกับครึ่งหลัง
  perExercise.forEach((e) => {
    const rs = e.repScores || [];
    if (rs.length < 6) return;
    const mid = Math.floor(rs.length / 2);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    if (avg(rs.slice(mid)) - avg(rs.slice(0, mid)) <= -10) improvements.push(`ท่า "${e.name}" คะแนนตกในช่วงท้าย (อาจล้า) ลองพักหายใจหรือทำช้าลง`);
  });

  const advice = options.extraAdvice ? [...options.extraAdvice] : [];
  if (quit) advice.push('ไม่เป็นไร พักก่อนได้เสมอ — รอบหน้าลองเล่นให้ครบทุกท่า คะแนนจะสะท้อนฝีมือจริง');
  else if (totalScore >= 85) advice.push('เยี่ยมมาก! ลองเพิ่มระดับความยากในรอบถัดไป');
  else if (totalScore >= 70) advice.push('ทำได้ดี รักษาความสม่ำเสมอแล้วจะดีขึ้นอีก');
  else if (totalScore >= 50) advice.push('ลองดูท่าตัวอย่างให้ชัดก่อนเริ่มแต่ละท่า และทำให้ครบจำนวนครั้ง');
  else advice.push('ลองเริ่มจากระดับง่าย ทำช้า ๆ ให้ท่าถูกต้องก่อน');

  return { totalScore, grade: g.grade, letter: g.letter, stars: g.stars, quit, strengths, improvements, advice };
}

module.exports = { GRADES, gradeFor, assessGameplay };
