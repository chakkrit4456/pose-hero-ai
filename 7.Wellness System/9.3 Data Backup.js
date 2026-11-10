// 9.3 สำรอง/นำเข้าข้อมูล — ทุกอย่างที่เก็บใน localStorage (ตั้งค่า ประวัติ ท่าที่สร้าง ค่าแผ่นเต้น บันทึกอาการปวด) เป็นไฟล์ JSON ไฟล์เดียว
// ปลอดภัยไว้ก่อน: นำเข้าเฉพาะคีย์ที่อยู่ในรายการอนุญาต ค่าต้องเป็น JSON ที่อ่านได้ ขนาดจำกัด ไม่ทับคีย์อื่นของเว็บ
'use strict';

const FORMAT = 'move-relieve-backup';
const VERSION = 1;
const MAX_VALUE_BYTES = 2 * 1024 * 1024;
const KEYS = Object.freeze([
  'move-relieve-settings', 'move-relieve-history', 'move-relieve-dance-best', 'move-relieve-pain', 'move-relieve-remind',
  'move-relieve-notice', 'mr_sys2_poses', 'dancepad-map-v6', 'dancepad-ignore-v1', 'dancepad-hold-v1',
]);

// คืนข้อความ JSON ของข้อมูลทั้งหมดที่มี (ค่าเก็บเป็นข้อความดิบตามที่อยู่ใน storage เพื่อกู้คืนได้เหมือนเดิมทุกตัวอักษร)
function exportData(storage, now = Date.now()) {
  const data = {};
  KEYS.forEach((k) => { try { const v = storage.getItem(k); if (v != null) data[k] = v; } catch (e) { /* ข้ามคีย์ที่อ่านไม่ได้ */ } });
  return JSON.stringify({ format: FORMAT, version: VERSION, at: now, data }, null, 1);
}

// ตรวจไฟล์สำรอง: คืน { ok, error?, data?, skipped[] } ยังไม่เขียนอะไรลง storage
function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'ไฟล์ไม่ใช่ JSON ที่อ่านได้' }; }
  if (!o || o.format !== FORMAT) return { ok: false, error: 'ไม่ใช่ไฟล์สำรองของ Move & Relieve' };
  if (!(o.version >= 1) || o.version > VERSION) return { ok: false, error: 'ไฟล์สำรองมาจากเวอร์ชันที่ใหม่กว่า — อัปเดตเกมก่อน' };
  if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) return { ok: false, error: 'ไฟล์สำรองไม่มีข้อมูล' };
  const data = {}, skipped = [];
  Object.keys(o.data).forEach((k) => {
    const v = o.data[k];
    if (!KEYS.includes(k)) return skipped.push(k + ' (ไม่รู้จักคีย์นี้)');
    if (typeof v !== 'string' || v.length > MAX_VALUE_BYTES) return skipped.push(k + ' (ค่าไม่ถูกต้องหรือใหญ่เกินไป)');
    try { JSON.parse(v); } catch (e) { return skipped.push(k + ' (ข้อมูลเสียหาย)'); }
    data[k] = v;
  });
  if (!Object.keys(data).length) return { ok: false, error: 'ไม่มีข้อมูลที่นำเข้าได้ในไฟล์นี้', skipped };
  return { ok: true, data, skipped, at: o.at || null };
}

// นำเข้า: เขียนทับเฉพาะคีย์ที่อยู่ในไฟล์ (คีย์ที่ไม่มีในไฟล์คงเดิม) คืน { ok, restored[], skipped[] }
function importData(storage, text) {
  const p = parseBackup(text);
  if (!p.ok) return p;
  const restored = [], skipped = p.skipped.slice();
  Object.keys(p.data).forEach((k) => {
    try { storage.setItem(k, p.data[k]); restored.push(k); } catch (e) { skipped.push(k + ' (เขียนไม่ได้)'); }
  });
  return { ok: restored.length > 0, restored, skipped, at: p.at };
}

module.exports = { FORMAT, VERSION, KEYS, exportData, parseBackup, importData };
