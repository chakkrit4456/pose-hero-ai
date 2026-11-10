// 9.4 บันทึกอาการปวด — ระดับ 0-10 ก่อนและหลังเล่น แล้วสรุปว่า "ปวดลดลงเฉลี่ยเท่าไร" (ตัวชี้วัดที่ผู้ใช้เห็นผลจริงกว่าคะแนนเกม)
// ข้อมูลเก็บในเครื่องเท่านั้น (localStorage) ไม่ใช่การวินิจฉัยโรค
'use strict';

const KEY = 'move-relieve-pain';
const MAX_ENTRIES = 200;

const isLevel = (v) => Number.isInteger(v) && v >= 0 && v <= 10;

function load(storage) {
  try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

// entry = { player, before?, after?, at? } ต้องมี before หรือ after อย่างน้อยหนึ่งค่า (0-10 จำนวนเต็ม)
function record(storage, entry, now = Date.now()) {
  const before = entry.before == null ? null : entry.before, after = entry.after == null ? null : entry.after;
  if (before != null && !isLevel(before)) return { ok: false, error: 'ระดับก่อนเล่นต้องเป็น 0-10' };
  if (after != null && !isLevel(after)) return { ok: false, error: 'ระดับหลังเล่นต้องเป็น 0-10' };
  if (before == null && after == null) return { ok: false, error: 'ไม่มีระดับอาการให้บันทึก' };
  const list = load(storage);
  list.push({ at: entry.at || now, player: entry.player || '', before, after });
  try { storage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES))); } catch (e) { return { ok: false, error: 'บันทึกไม่ได้' }; }
  return { ok: true, count: list.length };
}

// สรุปผล (player ว่าง = ทุกคน) นับเฉพาะรอบที่มีทั้งก่อนและหลังในการคิดว่า "ลดลง"
function summarize(list, player) {
  const mine = player ? list.filter((e) => e.player === player) : list;
  const both = mine.filter((e) => e.before != null && e.after != null);
  const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);
  const drops = both.map((e) => e.before - e.after);
  return {
    count: mine.length,
    pairs: both.length,
    avgBefore: avg(both.map((e) => e.before)),
    avgAfter: avg(both.map((e) => e.after)),
    avgDrop: avg(drops),
    improved: drops.filter((d) => d > 0).length,
    last: mine.length ? mine[mine.length - 1] : null,
  };
}

function headline(s) {
  if (!s.pairs) return s.count ? 'บันทึกระดับอาการทั้งก่อนและหลังเล่นให้ครบ จะสรุปได้ว่าปวดลดลงเท่าไร' : '';
  if (s.avgDrop > 0) return `หลังเล่นอาการปวดลดลงเฉลี่ย ${s.avgDrop} ระดับ (จาก ${s.avgBefore} เหลือ ${s.avgAfter}) · ลดลง ${s.improved}/${s.pairs} ครั้ง`;
  if (s.avgDrop === 0) return `ระดับอาการหลังเล่นเท่าเดิมโดยเฉลี่ย (${s.avgBefore}) — ลองทำต่อเนื่องหรือเลือกชุดท่าให้ตรงกับจุดที่ปวด`;
  return `หลังเล่นอาการปวดเพิ่มขึ้นเฉลี่ย ${Math.abs(s.avgDrop)} ระดับ — ควรลดความหนักหรือหยุดพัก และปรึกษาแพทย์ถ้าปวดต่อเนื่อง`;
}

module.exports = { KEY, load, record, summarize, headline, isLevel };
