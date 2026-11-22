// 2.7 ท่าสาธิตของมาสคอต — ทำให้มาสคอตขยับให้เห็นชัดในทุกท่า (ใช้แสดงผลเท่านั้น ไม่กระทบการนับของ AI)
// บางท่า เช่น เอียงคอ หมุนไหล่ หมุนข้อมือ มุมเป้าหมายของตัวตรวจท่าเล็กมาก มาสคอตจึงดูเหมือนยืนนิ่ง
// โมดูลนี้ปรับจุด landmark ให้ทำท่าจริงตามขั้นตอนของท่านั้นในระยะที่มองเห็นได้
'use strict';

const TAU = Math.PI * 2;
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
const wave = (t, T) => Math.sin((TAU * t) / T);

const HEAD = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left', 'mouth_right'];
const ARM = (s) => [s + '_elbow', s + '_wrist', s + '_pinky', s + '_index', s + '_thumb'];
const HAND = (s) => [s + '_pinky', s + '_index', s + '_thumb'];
const LEG = (s) => [s + '_knee', s + '_ankle', s + '_heel', s + '_foot_index'];

function make(lm, names) {
  const out = lm.map((q) => Object.assign({}, q));
  const at = (n) => out[names.indexOf(n)];
  const move = (list, dx, dy) => list.forEach((n) => { const q = at(n); if (q) { q.x += dx; q.y += dy; } });
  const rotate = (list, cx, cy, a) => {
    // หมุนในพื้นที่ภาพ 1280x720 เพื่อไม่ให้รูปร่างบิดเบี้ยว
    const c = Math.cos(a), s = Math.sin(a);
    list.forEach((n) => {
      const q = at(n); if (!q) return;
      const x = (q.x - cx) * 1280, y = (q.y - cy) * 720;
      q.x = cx + (x * c - y * s) / 1280; q.y = cy + (x * s + y * c) / 720;
    });
  };
  const set = (n, x, y) => { const q = at(n); if (q) { q.x = x; q.y = y; } };
  return { out, at, move, rotate, set };
}

// แต่ละท่า: (ตัวช่วย, t วินาที, T คาบของ 1 ครั้ง) — อ้างอิงขั้นตอนในข้อมูลท่าของเกม
const MOVES = {
  // เอียงศีรษะไปซ้ายช้า ๆ ค้าง แล้วเอียงไปขวา
  'neck-tilt'(h, t, T) {
    const ls = h.at('left_shoulder'), rs = h.at('right_shoulder');
    const p = ((t / T) % 2) / 2, side = p < 0.5 ? -1 : 1, k = ease(Math.min(1, Math.sin(Math.PI * ((p * 2) % 1)) * 1.6));
    h.rotate(HEAD, (ls.x + rs.x) / 2, (ls.y + rs.y) / 2, side * 0.55 * k);
  },
  // เอียงศีรษะค้างไว้ข้างหนึ่ง มือข้างตรงข้ามเหยียดลงเพื่อยืดบ่า แล้วสลับข้าง
  'upper-trap'(h, t) {
    const ls = h.at('left_shoulder'), rs = h.at('right_shoulder');
    const seg = 7, u = t % (seg * 2), side = u < seg ? -1 : 1, v = u % seg;
    const k = ease(Math.min(v / 1.4, (seg - v) / 1.4, 1));
    h.rotate(HEAD, (ls.x + rs.x) / 2, (ls.y + rs.y) / 2, side * 0.55 * k);
    const arm = side < 0 ? 'right' : 'left';
    h.move(ARM(arm), 0, 0.03 * k);
    h.move([arm + '_shoulder'], 0, 0.018 * k);
  },
  // ยกไหล่ขึ้น หมุนไปด้านหลังเป็นวงกลม (สลับซ้าย-ขวาเพื่อให้เห็นวงหมุนชัด)
  'shoulder-roll'(h, t, T) {
    const a = (TAU * t) / T;
    let mx = 0, my = 0;
    ['left', 'right'].forEach((s, i) => {
      const ph = a + i * Math.PI, dy = -0.032 * (0.5 + 0.5 * Math.sin(ph)), dx = 0.012 * Math.cos(ph) * (s === 'left' ? -1 : 1);
      h.move([s + '_shoulder'].concat(ARM(s)), dx, dy); mx += dx / 2; my += dy / 2;
    });
    h.move(HEAD, mx, my);
  },
  // ยกไหล่ทั้งสองขึ้นเข้าหาหู ค้าง แล้วปล่อยลงช้า ๆ
  basic_07(h, t, T) {
    const p = (t % T) / T, k = p < 0.35 ? ease(p / 0.35) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.35);
    ['left', 'right'].forEach((s) => h.move([s + '_shoulder'].concat(ARM(s)), 0, -0.024 * k));
  },
  // ไขว้แขนไว้หน้าอก บิดลำตัวไปซ้าย-ขวา สะโพกอยู่กับที่
  'seated-twist'(h, t, T) {
    const ls = h.at('left_shoulder'), rs = h.at('right_shoulder'), cx = (ls.x + rs.x) / 2, y = ls.y, hw = (rs.x - ls.x) / 2;
    const yaw = 0.75 * wave(t, T * 2), c = Math.cos(yaw), sw = Math.sin(yaw);
    h.set('left_shoulder', cx - hw * c, y); h.set('right_shoulder', cx + hw * c, y);
    ['left', 'right'].forEach((side) => {
      const d = side === 'left' ? -1 : 1, sh = h.at(side + '_shoulder');
      // แขนที่หมุนมาด้านหน้าดูสั้นลง แขนที่ไปด้านหลังยังเหยียดออกข้าง
      const fwd = Math.max(0, sw * -d), reach = 0.15 * (1 - 0.7 * fwd);
      h.set(side + '_elbow', sh.x + d * reach * 0.5, y + 0.005);
      h.set(side + '_wrist', sh.x + d * reach, y + 0.01);
      HAND(side).forEach((n) => h.set(n, sh.x + d * (reach + 0.02), y + 0.01));
    });
    h.move(HEAD, sw * hw * 0.25, 0);
  },
  // เอียงลำตัวด้านข้าง: ลำตัวเอียงจากสะโพก แขนข้างตรงข้ามชูขึ้นเหนือศีรษะ
  basic_05(h, t, T) {
    const lh = h.at('left_hip'), rh = h.at('right_hip'), px = (lh.x + rh.x) / 2, py = (lh.y + rh.y) / 2;
    const a = 0.38 * wave(t, T * 2), side = a < 0 ? 'right' : 'left', k = Math.abs(a) / 0.38;
    const sh = h.at(side + '_shoulder');
    // แขนข้างที่ยืดขึ้น (ข้างตรงข้ามกับทิศที่เอียง)
    h.set(side + '_elbow', sh.x, sh.y - 0.09 * k - 0.02);
    h.set(side + '_wrist', sh.x + (side === 'left' ? 0.02 : -0.02) * k, sh.y - 0.17 * k - 0.02);
    HAND(side).forEach((n) => { const w = h.at(side + '_wrist'); h.set(n, w.x, w.y - 0.025); });
    const upper = HEAD.concat(['left_shoulder', 'right_shoulder'], ARM('left'), ARM('right'));
    h.rotate(upper, px, py, a);
  },
  // กางแขนระดับไหล่ งอข้อมือให้ปลายนิ้วชี้ขึ้น ค้าง แล้วผ่อน
  'wrist-stretch'(h, t, T) {
    const p = (t % T) / T, k = p < 0.3 ? ease(p / 0.3) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3);
    ['left', 'right'].forEach((s) => {
      const sh = h.at(s + '_shoulder'), d = s === 'left' ? -1 : 1;
      h.set(s + '_elbow', sh.x + d * 0.075, sh.y); h.set(s + '_wrist', sh.x + d * 0.14, sh.y - 0.04 * k);
      const w = h.at(s + '_wrist'), ang = (1 - k) * 0 + k * (Math.PI / 2);
      HAND(s).forEach((n) => h.set(n, w.x + d * 0.03 * Math.cos(ang), w.y - 0.06 * Math.sin(ang)));
    });
  },
  // งอศอกยกมือขึ้นหน้าอก กำมือหมุนข้อมือเป็นวงกลม
  'wrist-circle'(h, t, T) {
    const a = (TAU * t) / T;
    ['left', 'right'].forEach((s) => {
      const sh = h.at(s + '_shoulder'), d = s === 'left' ? -1 : 1;
      const ph = a * d;
      h.set(s + '_elbow', sh.x + d * 0.03, sh.y + 0.12); h.set(s + '_wrist', sh.x + d * 0.01 + 0.015 * Math.cos(ph), sh.y + 0.02 + 0.02 * Math.sin(ph));
      const w = h.at(s + '_wrist');
      HAND(s).forEach((n) => h.set(n, w.x + 0.022 * Math.cos(ph), w.y - 0.025 + 0.035 * Math.sin(ph)));
    });
  },
};

// ขาในท่าคอมโบ (กล้อง + แผ่นเต้น): มาสคอตก้าวตามแผ่นที่ต้องเหยียบ
function stepLegs(h, steps, t, T) {
  const k = Math.floor(t / T + 0.5), pad = steps[((k % steps.length) + steps.length) % steps.length];
  const ph = t / T + 0.5 - k; // 0..1 ภายในจังหวะ, จังหวะเหยียบอยู่กลางช่วง
  const lift = ph < 0.5 ? Math.sin(TAU * ph) : 0; // ยกเท้าขึ้นแล้ววางลงตรงจังหวะเหยียบ (กลางช่วง)
  const side = pad === 'l' || pad === 'u' ? 'left' : 'right';
  if (pad === 'l' || pad === 'r') {
    const d = pad === 'l' ? -1 : 1, out = d * 0.04 * ease(ph * 2);
    h.move([side + '_ankle', side + '_heel', side + '_foot_index'], out, -0.022 * lift);
    h.move([side + '_knee'], out * 0.5, -0.01 * lift);
  } else {
    // ก้าวหน้า/หลัง: ยกเข่าขึ้นแล้ววางเท้า
    h.move([side + '_knee'], 0, -0.06 * lift);
    h.move(LEG(side).slice(1), 0, -0.07 * lift);
  }
}

/**
 * ปรับท่าของมาสคอตให้ขยับชัด
 * @param {string} id รหัสท่า
 * @param {Array} lm จุด landmark จาก teachPose
 * @param {number} t เวลา (วินาที)
 * @param {number} T คาบของ 1 ครั้ง (วินาที)
 * @param {Array} names ชื่อจุด landmark
 * @param {Array|null} steps แผ่นที่ต้องเหยียบ (ท่าคอมโบ) หรือ null
 */
function mascotPose(id, lm, t, T, names, steps) {
  const fn = MOVES[id];
  if (!fn && !steps) return lm;
  const h = make(lm, names);
  if (fn) fn(h, t, T || 3);
  if (steps && id !== 'basic_06') stepLegs(h, steps, t, T || 3); // ยกเข่าสลับข้าง: ขาขยับเองอยู่แล้ว
  return h.out;
}

module.exports = { mascotPose, MOVES };
