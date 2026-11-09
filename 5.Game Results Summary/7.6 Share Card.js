// 7.6 การ์ดแชร์ผลการเล่น — สร้างข้อมูลการ์ด (buildShareCard) และวาดลง canvas 2D (drawShareCard) เป็นรูป 1080x1350
// ไม่พึ่งไลบรารีใด ใช้ได้ออฟไลน์ ข้อมูลบนการ์ดมีเฉพาะ: ชื่อ (แก้/ลบได้) คะแนน เกรด สถิติรวม และวันที่
'use strict';

const APP = 'MOVE & RELIEVE';
const TAGLINE = 'ขยับกาย ทลายเมื่อย';
const FONT = "Prompt, Tahoma, 'Noto Sans Thai', 'Leelawadee UI', sans-serif";
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const GRADE_COLOR = { A: '#1e9e62', B: '#f5a800', C: '#ff8a3d', D: '#ff6b9d', '–': '#8a82b3' };

const thaiDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
const fmtTime = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} นาที${sec % 60 ? ' ' + (sec % 60) + ' วิ' : ''}` : `${sec} วินาที`);

// summary = ผลของ summarizeGame (7.4)   history = ผลเปรียบเทียบของ recordSession (7.5) หรือ null
// opts.name = ชื่อที่จะโชว์บนการ์ด ('' = ไม่แสดงชื่อ)   opts.now = เวลา (ทดสอบ)
function buildShareCard(summary, history, opts = {}) {
  const { stats, scores, assessment } = summary;
  const name = String(opts.name !== undefined ? opts.name : stats.playerName || '').trim().slice(0, 24);
  const best = [...scores.perExercise].sort((a, b) => b.score - a.score)[0];
  const badges = [];
  if (history && history.isNewBest) badges.push('🏆 คะแนนสูงสุดใหม่!');
  if (history && history.streakDays > 1) badges.push(`🔥 เล่นติดต่อกัน ${history.streakDays} วัน`);
  if (history && history.delta > 0) badges.push(`📈 ดีขึ้น +${history.delta} จากรอบก่อน`);
  const card = {
    app: APP,
    tagline: TAGLINE,
    name,
    date: thaiDate(new Date(opts.now || Date.now())),
    score: scores.totalScore,
    letter: assessment.letter,
    grade: assessment.grade,
    stars: assessment.stars,
    quit: !!assessment.quit,
    tiles: [
      { label: 'ท่าที่ทำสำเร็จ', value: `${stats.completedExercises}/${stats.totalExercises}` },
      { label: 'จำนวนครั้งรวม', value: String(stats.totalReps) },
      { label: 'เวลาที่ใช้', value: fmtTime(stats.totalTimeSec) },
    ],
    highlight: best && best.score >= 70 ? `ท่าเด่น: ${best.name} (${best.score} คะแนน)` : '',
    badges: badges.slice(0, 3),
  };
  card.text = shareText(card);
  return card;
}

function shareText(card) {
  const lead = card.quit ? 'ฉันออกกำลังกายกับ Move & Relieve ได้' : 'ฉันเล่น Move & Relieve ได้';
  const grade = card.quit ? '' : ` (เกรด ${card.letter} · ${card.grade})`;
  const who = card.name ? `${card.name}: ` : '';
  return `${who}${lead} ${card.score}/100${grade} — สำเร็จ ${card.tiles[0].value} ท่า ${card.tiles[1].value} ครั้ง ใช้เวลา ${card.tiles[2].value} #MoveAndRelieve`;
}

// ---------------------------------------------------------------- วาด
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShareCard(ctx, card, W = 1080, H = 1350) {
  const INK = '#2b2350', MUT = '#7a6f9e', ACC = '#ff6b9d';
  const text = (t, x, y, size, weight, color, align = 'center') => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x, y);
  };

  // พื้นหลัง
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ffe0f0'); bg.addColorStop(0.5, '#fff7e0'); bg.addColorStop(1, '#d6f7f3');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5;
  [[120, 90, 120, '#ffd93d'], [980, 1240, 150, '#4ecdc4'], [1000, 160, 70, '#ff6b9d']].forEach(([x, y, r, c]) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
  });
  ctx.globalAlpha = 1;

  // การ์ด
  const cx = 60, cy = 100, cw = W - 120, ch = 1130;
  rr(ctx, cx + 12, cy + 14, cw, ch, 56); ctx.fillStyle = 'rgba(43,35,80,0.18)'; ctx.fill();
  rr(ctx, cx, cy, cw, ch, 56); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();

  // หัว
  text(card.app, W / 2, cy + 105, 56, 700, ACC);
  text(card.tagline, W / 2, cy + 152, 28, 400, MUT);
  if (card.name) text(card.name, W / 2, cy + 232, 46, 700, INK);
  text(card.quit ? 'ออกกำลังกายวันนี้' : 'เล่นจบแล้ว!', W / 2, cy + (card.name ? 282 : 240), 30, 400, MUT);

  // วงแหวนคะแนน
  const rx = W / 2, ry = cy + 470, R = 165, color = GRADE_COLOR[card.letter] || ACC;
  ctx.lineWidth = 38; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(rx, ry, R, 0, Math.PI * 2); ctx.strokeStyle = '#f1ecff'; ctx.stroke();
  const frac = Math.max(0, Math.min(100, card.score)) / 100;
  if (frac > 0) {
    ctx.beginPath(); ctx.arc(rx, ry, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.strokeStyle = color; ctx.stroke();
  }
  text(String(card.score), rx, ry + 38, 130, 700, INK);
  text('/ 100', rx, ry + 92, 34, 400, MUT);

  // ดาว + เกรด
  const sy = cy + 745;
  const starsStr = '★'.repeat(card.stars) + '☆'.repeat(Math.max(0, 3 - card.stars));
  text(starsStr, W / 2, sy, 84, 700, '#ffc400');
  text(card.quit ? card.grade : `เกรด ${card.letter} · ${card.grade}`, W / 2, sy + 76, 50, 700, color);

  // สถิติ 3 ช่อง
  const tw = 276, gap = 24, tx0 = (W - (tw * 3 + gap * 2)) / 2, ty = cy + 840, th = 120;
  card.tiles.forEach((t, i) => {
    const x = tx0 + i * (tw + gap);
    rr(ctx, x, ty, tw, th, 28); ctx.fillStyle = '#fff7e0'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    text(t.value, x + tw / 2, ty + 58, 44, 700, INK);
    text(t.label, x + tw / 2, ty + 100, 24, 400, MUT);
  });

  // จุดเด่น + เหรียญ
  let ly = ty + th + 52;
  if (card.highlight) { text(card.highlight, W / 2, ly, 32, 600, INK); ly += 44; }
  card.badges.slice(0, 2).forEach((b) => { text(b, W / 2, ly, 32, 600, ACC); ly += 44; });

  // ท้าย
  text(`${card.date} · เล่นได้ที่ Move & Relieve`, W / 2, H - 52, 28, 400, MUT);
}

module.exports = { buildShareCard, shareText, drawShareCard, thaiDate, fmtTime };
