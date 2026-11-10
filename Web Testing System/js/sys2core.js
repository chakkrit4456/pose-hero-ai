/* sys2core.js - ระบบ 2 (pose_core.py) ฉบับเว็บ: โครงกระดูก 15 จุด, ท่าตัวอย่าง, ที่เก็บข้อมูล, ไทม์ไลน์ฝึกตามเวลา
 * ย้ายจาก Python ตรง ๆ ไม่แตะ DOM (ใช้ใน Node ทดสอบได้)  พิกัด 0-1  มุม: ชี้ลง = 0°, บวก = ขวาจอ, 180° = ชี้ขึ้น */
(function (root) {
  "use strict";
  const DEG = Math.PI / 180;

  const CATEGORIES = ["คอ", "ไหล่และแขน", "หลังและลำตัว", "ขาและสะโพก", "ทั้งตัว"];
  const JOINTS = ["neck", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_hand", "r_hand", "hip", "l_hip", "r_hip",
    "l_knee", "r_knee", "l_foot", "r_foot"];
  const JOINT_TH = { neck: "คอ/อก", hip: "สะโพก(กลาง)", l_shoulder: "ไหล่ซ้าย", r_shoulder: "ไหล่ขวา",
    l_elbow: "ศอกซ้าย", r_elbow: "ศอกขวา", l_hand: "มือซ้าย", r_hand: "มือขวา", l_hip: "ข้อสะโพกซ้าย", r_hip: "ข้อสะโพกขวา",
    l_knee: "เข่าซ้าย", r_knee: "เข่าขวา", l_foot: "เท้าซ้าย", r_foot: "เท้าขวา" };
  const PARENT = { neck: "hip", l_shoulder: "neck", r_shoulder: "neck", l_elbow: "l_shoulder", r_elbow: "r_shoulder",
    l_hand: "l_elbow", r_hand: "r_elbow", l_hip: "hip", r_hip: "hip", l_knee: "l_hip", r_knee: "r_hip", l_foot: "l_knee", r_foot: "r_knee" };
  const CHILDREN = {};
  for (const c in PARENT) (CHILDREN[PARENT[c]] = CHILDREN[PARENT[c]] || []).push(c);
  const BONES = [["neck", "l_shoulder"], ["neck", "r_shoulder"], ["l_shoulder", "l_elbow"], ["l_elbow", "l_hand"],
    ["r_shoulder", "r_elbow"], ["r_elbow", "r_hand"], ["neck", "hip"], ["hip", "l_hip"], ["hip", "r_hip"], ["l_hip", "l_knee"],
    ["l_knee", "l_foot"], ["r_hip", "r_knee"], ["r_knee", "r_foot"]];

  function subtree(j) {
    const out = [], stack = [j];
    while (stack.length) { const k = stack.pop(); out.push(k); (CHILDREN[k] || []).forEach((c) => stack.push(c)); }
    return out;
  }
  function mirrorName(k) { return k.startsWith("l_") ? "r_" + k.slice(2) : k.startsWith("r_") ? "l_" + k.slice(2) : k; }
  function mirrorJoints(J) { const o = {}; for (const k in J) o[mirrorName(k)] = [1 - J[k][0], J[k][1]]; return o; }
  const round4 = (x) => Math.round(x * 10000) / 10000;
  const seg = (p, ang, len) => [p[0] + len * Math.sin(ang * DEG), p[1] + len * Math.cos(ang * DEG)];

  function buildPose(o) {
    o = Object.assign({ lean: 0, head_tilt: 0, l_arm: [-12, -5], r_arm: [12, 5], l_leg: [-6, -3], r_leg: [6, 3], hip_x: 0.5, hip_y: 0.58 }, o || {});
    const TR = 0.26, SH = 0.09, UA = 0.15, FA = 0.13, TH = 0.18, SN = 0.18, HW = 0.05;
    const hip = [o.hip_x, o.hip_y], t = o.lean * DEG, up = [Math.sin(t), -Math.cos(t)], perp = [Math.cos(t), Math.sin(t)];
    const neck = [hip[0] + up[0] * TR, hip[1] + up[1] * TR];
    const ls = [neck[0] - perp[0] * SH, neck[1] - perp[1] * SH], rs = [neck[0] + perp[0] * SH, neck[1] + perp[1] * SH];
    const le = seg(ls, o.l_arm[0], UA), lh = seg(le, o.l_arm[1], FA), re = seg(rs, o.r_arm[0], UA), rh = seg(re, o.r_arm[1], FA);
    const lhp = [hip[0] - HW, hip[1]], rhp = [hip[0] + HW, hip[1]];
    const lk = seg(lhp, o.l_leg[0], TH), lf = seg(lk, o.l_leg[1], SN), rk = seg(rhp, o.r_leg[0], TH), rf = seg(rk, o.r_leg[1], SN);
    const J = { neck, l_shoulder: ls, r_shoulder: rs, l_elbow: le, r_elbow: re, l_hand: lh, r_hand: rh, hip, l_hip: lhp, r_hip: rhp,
      l_knee: lk, r_knee: rk, l_foot: lf, r_foot: rf };
    const out = {}; for (const k in J) out[k] = [round4(J[k][0]), round4(J[k][1])];
    return out;
  }
  const neutral = () => buildPose();

  function pose(id, name, cat, desc, joints, reps, hold, sets, rest) {
    return { id, name, category: cat, description: desc, joints, reps: reps == null ? 10 : reps, hold: hold == null ? 5 : hold,
      sets: sets == null ? 1 : sets, rest: rest == null ? 10 : rest };
  }
  /** 10 ท่าออกกำลังกายพื้นฐาน (ชุดเดียวกับท่าของระบบ 1 ในหน้าเว็บ) */
  function seedPoses() {
    const P = (n, name, cat, desc, o, reps, hold) => pose("basic-" + String(n).padStart(2, "0"), name, cat, desc, buildPose(o), reps, hold, 1, 15);
    return [
      P(1, "ยกแขนด้านข้าง", "ไหล่และแขน", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่ ปล่อยแขนข้างลำตัว\nเหยียดศอกให้ตรง ยกแขนทั้งสองข้างขึ้นด้านข้างช้า ๆ จนถึงระดับไหล่\nค้างไว้เล็กน้อย แล้วลดแขนลงช้า ๆ",
        { l_arm: [-90, -90], r_arm: [90, 90] }, 10, 2),
      P(2, "ยกแขนเหนือศีรษะ", "ไหล่และแขน", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nเหยียดศอกให้ตรง ยกแขนทั้งสองข้างขึ้นเหนือศีรษะช้า ๆ\nลดแขนลงช้า ๆ กลับท่าเริ่มต้น",
        { l_arm: [-166, -176], r_arm: [166, 176] }, 10, 2),
      P(3, "งอศอกยกมือแตะไหล่", "ไหล่และแขน", "ยืนตรง ปล่อยแขนข้างลำตัว ฝ่ามือหันไปข้างหน้า\nแนบต้นแขนไว้ข้างลำตัว งอศอกยกมือขึ้นเข้าหาไหล่\nค่อย ๆ เหยียดแขนลงกลับท่าเริ่มต้น",
        { l_arm: [-6, 175], r_arm: [6, -175] }, 10, 2),
      P(4, "ย่อเข่า", "ขาและสะโพก", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nงอเข่าย่อตัวลงช้า ๆ เหมือนจะนั่งเก้าอี้ ให้หลังตรง\nดันตัวขึ้นกลับท่ายืน",
        { hip_y: 0.64, l_arm: [-35, -20], r_arm: [35, 20], l_leg: [-55, 5], r_leg: [55, -5] }, 10, 2),
      P(5, "เอียงลำตัวด้านข้าง", "หลังและลำตัว", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่ มือวางข้างลำตัว\nเอียงลำตัวไปทางซ้ายช้า ๆ โดยไม่บิดตัว\nกลับมายืนตรง แล้วเอียงไปทางขวา",
        { lean: 20, l_arm: [-8, -4], r_arm: [10, 5] }, 10, 2),
      P(6, "ยกเข่าสลับข้าง", "ขาและสะโพก", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nยกขาข้างหนึ่งขึ้น ค้างเล็กน้อย\nวางลง แล้วสลับยกอีกข้าง",
        { r_leg: [70, 10] }, 10, 2),
      P(7, "ยกไหล่ขึ้น-ลง", "ไหล่และแขน", "ยืนหรือนั่งหลังตรง ปล่อยแขนข้างลำตัว\nยกไหล่ทั้งสองข้างขึ้นเข้าหาหู\nปล่อยไหล่ลงช้า ๆ",
        { l_arm: [-8, -4], r_arm: [8, 4] }, 10, 2),
      P(8, "ก้มตัวแตะปลายเท้า", "หลังและลำตัว", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nเหยียดเข่าให้ตรง ก้มตัวไปข้างหน้าช้า ๆ เหยียดมือลงหาปลายเท้า\nค่อย ๆ ยืดตัวขึ้นกลับท่ายืน",
        { hip_y: 0.52, l_arm: [-2, -2], r_arm: [2, 2] }, 10, 2),
      P(9, "บิดลำตัว", "หลังและลำตัว", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่ มือวางบนสะโพกหรือไขว้หน้าอก\nบิดลำตัวไปด้านหนึ่งช้า ๆ สะโพกอยู่กับที่\nกลับมาตรง แล้วบิดสลับไปอีกข้าง",
        { l_arm: [-15, -5], r_arm: [35, 95] }, 10, 2),
      P(10, "ยืดแขนเหนือศีรษะ", "ไหล่และแขน", "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nยกแขนทั้งสองข้างขึ้นเหนือศีรษะ เหยียดศอกให้ตรง\nค้างไว้ 8 วินาที หายใจเข้าออกช้า ๆ แล้วลดแขนลง",
        { l_arm: [-166, -176], r_arm: [166, 176] }, 3, 8),
    ];
  }

  // ---------------------------------------------------------------- สัญญาณระหว่างหน้าจอ
  class Bus {
    constructor() { this.h = {}; }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }
    emit(ev, ...a) { (this.h[ev] || []).slice().forEach((fn) => { try { fn(...a); } catch (e) { if (root.console) console.error(e); } }); }
  }
  const bus = new Bus();

  let uid = 0;
  const newId = () => (Date.now().toString(16) + (uid++).toString(16)).slice(-8);
  function cleanPose(p) {
    const base = neutral(), j = p.joints || {}, joints = {};
    JOINTS.forEach((k) => (joints[k] = j[k] ? [Number(j[k][0]), Number(j[k][1])] : base[k]));
    p.joints = joints;
    if (p.name == null) p.name = "ท่าไม่มีชื่อ";
    if (p.category == null) p.category = "ทั้งตัว";
    if (p.description == null) p.description = "";
    p.reps = parseInt(p.reps == null ? 10 : p.reps, 10); p.hold = parseInt(p.hold == null ? 5 : p.hold, 10);
    p.sets = parseInt(p.sets == null ? 1 : p.sets, 10); p.rest = parseInt(p.rest == null ? 10 : p.rest, 10);
    if (p.id == null) p.id = newId();
    return p;
  }

  /** ที่เก็บท่า: เก็บใน localStorage ของเบราว์เซอร์ (ถ้าไม่มี ใช้ในหน่วยความจำ) เริ่มต้นจาก poses.json ที่ส่งออกจากระบบ 2 หรือท่าตัวอย่าง */
  class Store {
    /** origin = รหัสชุดท่าเริ่มต้น ถ้าเปลี่ยนชุด (เช่น เปลี่ยนเป็นท่าชุดใหม่) ข้อมูลเก่าในเบราว์เซอร์จะถูกแทนที่ */
    constructor(storage, initial, origin) {
      this.storage = storage; this.key = "mr_sys2_poses"; this.poses = []; this.origin = origin || "";
      let loaded = false;
      try {
        const t = storage && storage.getItem(this.key);
        if (t) { const d = JSON.parse(t); if ((d.origin || "") === this.origin) { this.poses = d.poses.map(cleanPose); loaded = true; } }
      } catch (e) { loaded = false; }
      if (!loaded) { this.poses = (initial && initial.length ? initial : seedPoses()).map((p) => cleanPose(JSON.parse(JSON.stringify(p)))); this.save(false); }
    }
    save(emit) {
      this.lastSaveError = !this.storage;
      try { if (this.storage) this.storage.setItem(this.key, JSON.stringify({ version: 1, origin: this.origin, poses: this.poses })); } catch (e) { this.lastSaveError = true; }
      if (this.lastSaveError && emit !== false) bus.emit('storage-error');
      if (emit !== false) bus.emit("changed");
    }
    replaceAll(list) { this.poses = list.map((p) => cleanPose(JSON.parse(JSON.stringify(p)))); this.save(); }
    resetToSeed() { this.poses = seedPoses().map(cleanPose); this.save(); }
    get(id) { return this.poses.find((p) => p.id === id) || null; }
    findByName(name) { return this.poses.find((p) => p.name.trim() === name.trim()) || null; }
    add(name, category, description, joints) {
      const p = cleanPose({ id: newId(), name, category, description, joints: JSON.parse(JSON.stringify(joints)) });
      this.poses.push(p); this.save(); return p;
    }
    overwrite(id, name, category, description, joints) {
      const p = this.get(id); if (!p) return this.add(name, category, description, joints);
      Object.assign(p, { name, category, description, joints: JSON.parse(JSON.stringify(joints)) }); this.save(); return p;
    }
    updateSettings(id, reps, hold, sets, rest) {
      const p = this.get(id); if (p) { Object.assign(p, { reps: parseInt(reps, 10), hold: parseInt(hold, 10), sets: parseInt(sets, 10), rest: parseInt(rest, 10) }); this.save(); }
    }
    delete(id) { this.poses = this.poses.filter((p) => p.id !== id); this.save(); }
    categories() { const extra = Array.from(new Set(this.poses.map((p) => p.category))).filter((c) => CATEGORIES.indexOf(c) < 0).sort(); return CATEGORIES.concat(extra); }
  }

  // ---------------------------------------------------------------- วาด / คำนวณ
  const toPx = (p, w, h) => { const s = Math.min(w, h); return [(w - s) / 2 + p[0] * s, p[1] * s]; };
  const fromPx = (x, y, w, h) => { const s = Math.min(w, h); return [(x - (w - s) / 2) / s, y / s]; };
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function lerpPose(a, b, t) { const o = {}; JOINTS.forEach((k) => (o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t])); return o; }

  /** วาดโครงกระดูกลง canvas 2D (draw_pose) */
  function drawPose(cv, joints, o) {
    o = Object.assign({ color: "#1f6feb", widthRatio: 0.028, handles: false, active: null }, o || {});
    const g = cv.getContext("2d"), w = cv.width, h = cv.height, s = Math.min(w, h), lw = Math.max(3, Math.floor(s * o.widthRatio));
    const P = {}; for (const k in joints) P[k] = toPx(joints[k], w, h);
    g.lineCap = "round"; g.lineWidth = lw; g.strokeStyle = o.color;
    BONES.forEach(([a, b]) => { g.beginPath(); g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); g.stroke(); });
    if (o.handles) JOINTS.forEach((k) => {
      const rr = k === "hip" ? 10 : 8; g.fillStyle = k === o.active ? "#ff7b00" : k === "hip" ? "#e5534b" : "#ffffff";
      g.lineWidth = 2; g.strokeStyle = "#333"; g.beginPath(); g.arc(P[k][0], P[k][1], rr, 0, 7); g.fill(); g.stroke();
    });
  }

  /** ไทม์ไลน์ฝึกตามเวลา (4.4): เข้าท่า -> ค้าง -> กลับท่า ซ้ำตามครั้ง/เซ็ต แล้วพัก */
  const MOVE = 1.0;
  function buildTimeline(store, ids) {
    const tl = [];
    ids.forEach((pid, n) => {
      const p = store.get(pid); if (!p) return;
      for (let s = 1; s <= p.sets; s++) {
        for (let r = 1; r <= p.reps; r++) {
          const base = { pid, s, r, S: p.sets, R: p.reps };
          tl.push(Object.assign({}, base, { kind: "in", dur: MOVE }), Object.assign({}, base, { kind: "hold", dur: p.hold }), Object.assign({}, base, { kind: "out", dur: MOVE }));
        }
        const last = n === ids.length - 1 && s === p.sets;
        if (p.rest > 0 && !last) tl.push({ pid, s, r: p.reps, S: p.sets, R: p.reps, kind: "rest", dur: p.rest });
      }
    });
    return tl;
  }
  const estimate = (store, ids) => buildTimeline(store, ids).reduce((a, s) => a + s.dur, 0);
  function fmtDuration(sec) { sec = Math.round(sec); return sec >= 60 ? `${Math.floor(sec / 60)} นาที ${sec % 60} วินาที` : `${sec} วินาที`; }

  /** ลากข้อต่อ j ไปที่ m (พิกัด 0-1): หมุนรอบจุดแม่ ความยาวกระดูกคงที่ (4.2 on_move) คืน {joints, msg} หรือ null ถ้าออกนอกกรอบ */
  function dragJoint(J, j, m, snap) {
    let nw, msg;
    if (j === "hip") {
      const dx = m[0] - J.hip[0], dy = m[1] - J.hip[1]; nw = {};
      for (const k in J) nw[k] = [J[k][0] + dx, J[k][1] + dy];
      msg = "เลื่อนทั้งตัว";
    } else {
      const par = J[PARENT[j]]; let ang = Math.atan2(m[0] - par[0], m[1] - par[1]);
      if (snap) ang = Math.round(ang / DEG / 5) * 5 * DEG;
      const old = Math.atan2(J[j][0] - par[0], J[j][1] - par[1]), phi = -(ang - old), c = Math.cos(phi), s = Math.sin(phi);
      nw = Object.assign({}, J);
      subtree(j).forEach((k) => { const vx = J[k][0] - par[0], vy = J[k][1] - par[1]; nw[k] = [par[0] + vx * c - vy * s, par[1] + vx * s + vy * c]; });
      msg = `${JOINT_TH[j]}: ${Math.round(ang / DEG)}°  (0°=ชี้ลง, 90°=ขวาจอ, 180°=ชี้ขึ้น)`;
    }
    for (const k in nw) if (!(nw[k][0] >= 0.01 && nw[k][0] <= 0.99 && nw[k][1] >= 0.01 && nw[k][1] <= 0.99)) return null;
    return { joints: nw, msg };
  }

  const api = { CATEGORIES, JOINTS, JOINT_TH, PARENT, BONES, bus, Store, subtree, mirrorName, mirrorJoints, buildPose, neutral, seedPoses,
    cleanPose, toPx, fromPx, ease, lerpPose, drawPose, buildTimeline, estimate, fmtDuration, dragJoint, MOVE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.S2 = api;
})(typeof self !== "undefined" ? self : this);
