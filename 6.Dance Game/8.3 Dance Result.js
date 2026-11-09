// 8.3 โหมดแผ่นเต้น — สรุปผลรอบเล่น เกรด การ์ดแชร์ (ใช้วาดด้วย drawShareCard ของ 7.6) และคะแนนสูงสุดต่อระดับ
// ไม่ require โมดูลของโฟลเดอร์อื่น (ระบบ build ฝังโดยใช้ 3 ตัวอักษรแรกของชื่อไฟล์เป็นตัวระบุ)
'use strict';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const LEVEL_TH = { easy: 'ง่าย', normal: 'ปานกลาง', hard: 'ยาก' };
const BEST_KEY = 'move-relieve-dance-best';

// เกณฑ์เดียวกับโหมดท่าออกกำลังกาย: 85 / 70 / 50
function gradeOf(score) {
  return score >= 85 ? { letter: 'A', grade: 'ยอดเยี่ยม', stars: 3 }
    : score >= 70 ? { letter: 'B', grade: 'ดี', stars: 2 }
    : score >= 50 ? { letter: 'C', grade: 'พอใช้', stars: 1 }
    : { letter: 'D', grade: 'ต้องปรับปรุง', stars: 0 };
}

// คะแนนรวม 0-100 = ความแม่นยำ
function buildResult(level, summary) {
  const score = Math.round(summary.accuracy);
  return { level, levelTh: LEVEL_TH[level] || level, score, ...gradeOf(score), ...summary };
}

// คำแนะนำสั้น ๆ จากสถิติ
function advice(r) {
  const out = [];
  if (r.counts.miss > r.total * 0.3) out.push('พลาดค่อนข้างเยอะ ลองเริ่มจากระดับง่ายกว่านี้ หรือเช็กว่าแผ่นตั้งค่าถูกต้อง');
  if (r.avgAbsMs != null && r.biasMs <= -60) out.push(`เหยียบเร็วกว่าจังหวะเฉลี่ย ${Math.abs(r.biasMs)} ms รอให้แผ่นสว่างเต็มที่ค่อยก้าว`);
  else if (r.avgAbsMs != null && r.biasMs >= 60) out.push(`เหยียบช้ากว่าจังหวะเฉลี่ย ${r.biasMs} ms ลองก้าวให้เร็วขึ้นเล็กน้อย`);
  if (r.stray > r.total * 0.25) out.push('เหยียบแผ่นที่ไม่ได้สว่างบ่อย ดูให้ชัดก่อนก้าวทีละแผ่น');
  if (r.score >= 85) out.push('ยอดเยี่ยม! ลองระดับที่ยากขึ้น');
  if (!out.length) out.push('ทำได้ดี เล่นต่ออีกรอบเพื่อเก็บคอมโบให้ยาวขึ้น');
  return out;
}

function thaiDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; }

// การ์ดแชร์: โครงข้อมูลเดียวกับ buildShareCard ของ 7.6 (ส่งต่อให้ drawShareCard วาดได้เลย)
function buildDanceCard(r, opts = {}) {
  const name = String(opts.name !== undefined ? opts.name : '').trim().slice(0, 24);
  const badges = [];
  if (opts.isBest) badges.push('🏆 คะแนนสูงสุดใหม่!');
  if (r.maxCombo >= 10) badges.push(`🔥 คอมโบสูงสุด ${r.maxCombo}`);
  if (r.counts.miss === 0) badges.push('✨ ไม่พลาดเลย!');
  const card = {
    app: 'MOVE & RELIEVE',
    tagline: 'โหมดแผ่นเต้น',
    name,
    date: thaiDate(new Date(opts.now || Date.now())),
    score: r.score,
    letter: r.letter,
    grade: r.grade,
    stars: r.stars,
    quit: false,
    tiles: [
      { label: 'ความแม่นยำ', value: `${r.accuracy}%` },
      { label: 'คอมโบสูงสุด', value: String(r.maxCombo) },
      { label: 'PERFECT', value: `${r.counts.perfect}/${r.total}` },
    ],
    highlight: `ระดับ${r.levelTh}${r.avgAbsMs != null ? ` · เฉลี่ยคลาด ${r.avgAbsMs} ms` : ''}`,
    badges: badges.slice(0, 2),
  };
  const who = name ? `${name}: ` : '';
  card.text = `${who}ฉันเล่นโหมดแผ่นเต้นของ Move & Relieve ระดับ${r.levelTh} ได้ ${r.score}/100 (เกรด ${r.letter}) คอมโบสูงสุด ${r.maxCombo} PERFECT ${r.counts.perfect}/${r.total} #MoveAndRelieve`;
  return card;
}

// ---------------------------------------------------------------- คะแนนสูงสุดต่อระดับ (localStorage)
function loadBest(storage) {
  try { const o = JSON.parse(storage.getItem(BEST_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
// บันทึกถ้าสูงกว่าเดิม คืน { isBest, best } (รอบแรกของระดับนั้นไม่นับเป็น "สถิติใหม่" แต่ถูกบันทึก)
function recordBest(storage, level, score) {
  const all = loadBest(storage), prev = all[level];
  const isBest = typeof prev === 'number' && score > prev;
  if (typeof prev !== 'number' || score > prev) {
    all[level] = score;
    try { storage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* เก็บไม่ได้ ข้ามไป */ }
  }
  return { isBest, best: Math.max(prev || 0, score) };
}

module.exports = { LEVEL_TH, BEST_KEY, gradeOf, buildResult, advice, buildDanceCard, loadBest, recordBest, thaiDate };
