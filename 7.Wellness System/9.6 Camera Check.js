// 9.6 ตัวช่วยตั้งกล้อง — ตรวจจากจุด 33 จุดของ AI ว่ายืนอยู่ในตำแหน่งที่เล่นได้ไหม แล้วบอกว่าต้องขยับอย่างไร
// lm = [{x,y,visibility}] พิกัด 0-1 ของภาพ (ลำดับตาม MediaPipe Pose) — ฟังก์ชันล้วน ทดสอบได้
'use strict';

const IDX = { nose: 0, lShoulder: 11, rShoulder: 12, lHip: 23, rHip: 24, lAnkle: 27, rAnkle: 28 };
const VIS = 0.5;
const SHOULDER_WIDTH = Object.freeze({ min: 0.14, max: 0.46 }); // สัดส่วนความกว้างไหล่ต่อความกว้างภาพ (บอกระยะห่างจากกล้อง)
const CENTER = Object.freeze({ min: 0.3, max: 0.7 });

const seen = (p) => !!p && (p.visibility == null ? 1 : p.visibility) >= VIS && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

// คืน { ready, checks:[{ id, ok, required, text }] } ready = เงื่อนไขจำเป็นผ่านครบ
function evaluate(lm) {
  const out = [], add = (id, ok, required, okText, badText) => out.push({ id, ok: !!ok, required, text: ok ? okText : badText });
  if (!lm || lm.length < 29) {
    add('body', false, true, '', 'ยังไม่พบร่างกายในภาพ — ยืนให้เห็นทั้งตัวหน้ากล้อง');
    return { ready: false, checks: out };
  }
  const ls = lm[IDX.lShoulder], rs = lm[IDX.rShoulder], lh = lm[IDX.lHip], rh = lm[IDX.rHip], nose = lm[IDX.nose];
  add('body', true, true, 'พบร่างกายแล้ว', '');
  const shoulders = seen(ls) && seen(rs);
  add('shoulders', shoulders, true, 'เห็นไหล่ทั้งสองข้าง', 'มองไม่เห็นไหล่ — ยืนให้ไหล่ทั้งสองข้างอยู่ในภาพ');
  const hips = seen(lh) && seen(rh);
  add('hips', hips, true, 'เห็นสะโพก', 'มองไม่เห็นสะโพก — ถอยห่างจากกล้อง หรือเลื่อนกล้องให้เห็นถึงสะโพก (ระวังโต๊ะบัง)');
  if (shoulders) {
    const w = Math.abs(ls.x - rs.x);
    add('distance', w >= SHOULDER_WIDTH.min && w <= SHOULDER_WIDTH.max, true, 'ระยะห่างจากกล้องพอดี',
      w < SHOULDER_WIDTH.min ? 'ไกลเกินไป — เข้าใกล้กล้องอีกนิด' : 'ใกล้เกินไป — ถอยออกจากกล้องอีกนิด');
    const cx = (ls.x + rs.x) / 2;
    add('center', cx >= CENTER.min && cx <= CENTER.max, true, 'ยืนกลางภาพ',
      cx < CENTER.min ? 'อยู่ซ้ายของภาพมากไป — ขยับไปทางขวาของจอ' : 'อยู่ขวาของภาพมากไป — ขยับไปทางซ้ายของจอ');
  } else {
    add('distance', false, true, '', 'ยังวัดระยะห่างไม่ได้ (ต้องเห็นไหล่ก่อน)');
    add('center', false, true, '', 'ยังวัดตำแหน่งไม่ได้ (ต้องเห็นไหล่ก่อน)');
  }
  add('head', seen(nose) && nose.y > 0.03, false, 'เห็นศีรษะครบ', 'ศีรษะชิดขอบบนของภาพ — ปรับกล้องให้เห็นศีรษะ (ท่าเอียงคอต้องใช้)');
  add('feet', seen(lm[IDX.lAnkle]) && seen(lm[IDX.rAnkle]), false, 'เห็นเท้า (เล่นท่าย่อเข่า/ยกเข่าได้)', 'ยังไม่เห็นข้อเท้า — ท่าย่อเข่าและยกเข่าสลับต้องเห็นเท้า (ท่าอื่นไม่จำเป็น)');
  return { ready: out.filter((c) => c.required).every((c) => c.ok), checks: out };
}

// ข้อความสรุปสั้น ๆ: ถ้ายังไม่พร้อมให้บอกข้อแรกที่ต้องแก้
function summary(result) {
  if (result.ready) return 'พร้อมเล่นแล้ว ✓';
  const bad = result.checks.find((c) => c.required && !c.ok);
  return bad ? bad.text : '';
}

module.exports = { IDX, VIS, SHOULDER_WIDTH, CENTER, seen, evaluate, summary };
