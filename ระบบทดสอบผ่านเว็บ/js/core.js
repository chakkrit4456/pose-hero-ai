/* core.js - ระบบ 1 ฉบับเว็บ (ย้ายจากไฟล์ Python ตรง ๆ ไม่แก้ตรรกะ ไม่แตะ DOM ใช้ใน Node เพื่อทดสอบได้)
 *   exercise_loader.py        -> loadExercises / validateExercise / requiredJoints
 *   1.2 ระบบตรวจจับร่างกาย.py  -> detect (ข้อความแจ้งผู้เล่น, ข้อต่อที่ต้องเห็น)
 *   1.3 ระบบตรวจจับข้อต่อ.py   -> JointTracker (ลดสั่น + ข้อต่อเสมือน)
 *   1.4 ระบบวิเคราะห์ท่าทาง.py -> calculateAngle / PoseAnalyzer
 *   1.5 ระบบประเมินท่าทาง.py   -> PoseEvaluator / gradeFor
 *   main.py                   -> WorkoutRunner (นับถอยหลัง -> ทำท่า -> สรุปผลของ 1 ท่า)
 *   test_all_systems.py       -> SimPerson (คนจำลองที่ขยับตามท่า ใช้แทนกล้อง)
 */
(function (root) {
  "use strict";
  const DEG = Math.PI / 180;

  // ======================================================== exercise_loader.py
  const VALID_CATEGORIES = ["แขนและไหล่", "ลำตัวและเอว", "ขาและสะโพก", "การยืดเหยียดร่างกาย"];

  const LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index"];
  const JOINT_NAMES_TH = {
    nose: "จมูก", left_shoulder: "ไหล่ซ้าย", right_shoulder: "ไหล่ขวา", left_elbow: "ศอกซ้าย", right_elbow: "ศอกขวา",
    left_wrist: "ข้อมือซ้าย", right_wrist: "ข้อมือขวา", left_hip: "สะโพกซ้าย", right_hip: "สะโพกขวา",
    left_knee: "เข่าซ้าย", right_knee: "เข่าขวา", left_ankle: "ข้อเท้าซ้าย", right_ankle: "ข้อเท้าขวา" };
  const DEFAULT_REQUIRED = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"];
  const LOWER_BODY = ["hip", "knee", "ankle", "heel", "foot"];

  const VIRTUAL_JOINTS = ["mid_shoulder", "mid_hip", "below_mid_hip"];
  const VIRTUAL_SOURCES = {
    mid_shoulder: ["left_shoulder", "right_shoulder"],
    mid_hip: ["left_hip", "right_hip"],
    below_mid_hip: ["left_hip", "right_hip"],
  };
  const VALID_JOINTS = new Set(LANDMARK_NAMES.concat(VIRTUAL_JOINTS));

  function realJointsOf(names) {
    const real = [];
    names.forEach((n) => (VIRTUAL_SOURCES[n] || [n]).forEach((r) => real.push(r)));
    return Array.from(new Set(real));
  }
  function requiredJoints(ex) {
    if (ex.tracked_joints && ex.tracked_joints.length) return realJointsOf(ex.tracked_joints);
    const used = [];
    Object.values(ex.angles).forEach((t) => t.forEach((j) => used.push(j)));
    return realJointsOf(used);
  }
  const isNum = (v) => typeof v === "number" && isFinite(v);

  /** ตรวจข้อมูลท่า 1 ท่า คืนรายการข้อผิดพลาด (ว่าง = ใช้ได้) */
  function validateExercise(ex) {
    const errors = [];
    if (!ex || typeof ex !== "object" || Array.isArray(ex)) return ["ข้อมูลท่าต้องเป็นออบเจ็กต์ { ... }"];
    ["id", "name", "category", "angles", "counter"].forEach((k) => { if (!(k in ex)) errors.push(`ขาดข้อมูล '${k}'`); });
    if (errors.length) return errors;

    if (!String(ex.name).trim()) errors.push("ชื่อท่าว่างเปล่า");
    if (!VALID_CATEGORIES.includes(ex.category)) errors.push(`หมวดหมู่ '${ex.category}' ไม่ถูกต้อง ต้องเป็นหนึ่งใน ${JSON.stringify(VALID_CATEGORIES)}`);

    const angles = ex.angles;
    if (!angles || typeof angles !== "object" || Array.isArray(angles) || !Object.keys(angles).length)
      return errors.concat(["'angles' ต้องเป็นพจนานุกรมที่มีอย่างน้อย 1 มุม"]);
    for (const name in angles) {
      const triple = angles[name];
      if (!(Array.isArray(triple) && triple.length === 3)) { errors.push(`มุม '${name}' ต้องระบุข้อต่อ 3 จุด [จุดแรก, จุดมุม, จุดสุดท้าย]`); continue; }
      triple.forEach((j) => { if (!VALID_JOINTS.has(j)) errors.push(`มุม '${name}' ใช้ชื่อข้อต่อที่ไม่รู้จัก: '${j}'`); });
    }

    if (ex.tracked_joints != null) {
      const bad = ex.tracked_joints.filter((j) => !VALID_JOINTS.has(j));
      if (bad.length) errors.push(`tracked_joints มีชื่อที่ไม่รู้จัก: ${JSON.stringify(bad)}`);
      else if (!errors.length) {
        const used = new Set(realJointsOf([].concat(...Object.values(angles))));
        const have = new Set(realJointsOf(ex.tracked_joints));
        const uncovered = Array.from(used).filter((j) => !have.has(j)).sort();
        if (uncovered.length) errors.push(`tracked_joints ไม่ครอบคลุมข้อต่อที่ใช้คำนวณมุม: ${JSON.stringify(uncovered)}`);
      }
    }

    const counter = ex.counter;
    if (!counter || typeof counter !== "object" || Array.isArray(counter)) errors.push("'counter' ต้องเป็นออบเจ็กต์");
    else {
      const mode = counter.mode == null ? "reps" : counter.mode;
      if (mode !== "reps" && mode !== "hold") errors.push("counter.mode ต้องเป็น 'reps' หรือ 'hold'");
      let names = counter.angle;
      names = typeof names === "string" ? [names] : names;
      if (!names || !names.length || names.some((n) => !(n in angles))) errors.push("counter.angle ต้องอ้างถึงมุมที่มีอยู่ใน 'angles'");
      ["start_angle", "target_angle"].forEach((k) => { if (!isNum(counter[k])) errors.push(`counter.${k} ต้องเป็นตัวเลข`); });
      if (isNum(counter.start_angle) && counter.start_angle === counter.target_angle) errors.push("start_angle กับ target_angle ต้องไม่เท่ากัน");
      if (mode === "hold" && !(isNum(counter.hold_sec) && counter.hold_sec > 0)) errors.push("โหมด hold ต้องกำหนด hold_sec มากกว่า 0");
    }

    (ex.criteria || []).forEach((c, idx) => {
      const i = idx + 1;
      if (!(c.angle in angles)) errors.push(`เกณฑ์ข้อ ${i} อ้างถึงมุมที่ไม่มีใน 'angles'`);
      if (["always", "target"].indexOf(c.when == null ? "always" : c.when) < 0) errors.push(`เกณฑ์ข้อ ${i}: when ต้องเป็น 'always' หรือ 'target'`);
      if (!("min" in c) && !("max" in c)) errors.push(`เกณฑ์ข้อ ${i} ต้องมี min หรือ max อย่างน้อยหนึ่งค่า`);
      ["min", "max", "margin"].forEach((k) => { if (k in c && !isNum(c[k])) errors.push(`เกณฑ์ข้อ ${i}: ${k} ต้องเป็นตัวเลข`); });
      if (isNum(c.min) && isNum(c.max) && c.min > c.max) errors.push(`เกณฑ์ข้อ ${i}: min ต้องไม่มากกว่า max`);
    });

    ["reps", "duration_sec", "rest_sec"].forEach((k) => {
      const v = ex[k] == null ? 0 : ex[k];
      if (!isNum(v) || v < 0) errors.push(`${k} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
    });
    const reps = ex.reps == null ? 0 : ex.reps, dur = ex.duration_sec == null ? 0 : ex.duration_sec;
    if (isNum(reps) && isNum(dur) && reps <= 0 && dur <= 0) errors.push("ต้องกำหนด reps หรือ duration_sec อย่างน้อยหนึ่งอย่าง");
    return errors;
  }

  /** รับข้อมูลที่อ่านจาก exercises.json คืน { exercises, warnings } (ท่าที่ข้อมูลผิดถูกข้ามพร้อมเหตุผล) */
  function loadExercises(data) {
    const items = Array.isArray(data) ? data : data && data.exercises;
    if (!Array.isArray(items)) throw new Error('ไฟล์ต้องมีรายการ "exercises"');
    const valid = [], warnings = [], seen = new Set();
    items.forEach((ex, idx) => {
      const label = ex && typeof ex === "object" && ex.name ? ex.name : `ท่าที่ ${idx + 1}`;
      const errors = validateExercise(ex);
      if (!errors.length && seen.has(ex.id)) errors.push(`id '${ex.id}' ซ้ำกับท่าอื่น`);
      if (errors.length) { warnings.push(`ข้ามท่า '${label}': ` + errors.join("; ")); return; }
      seen.add(ex.id); valid.push(ex);
    });
    return { exercises: valid, warnings };
  }

  // ======================================================== 1.2 detect
  const MSG_NO_BODY = "ไม่พบร่างกาย กรุณายืนให้อยู่ในกล้อง";
  /**
   * lm = จุด 33 จุด [{x,y,z,visibility}] ที่ x ตรงกับภาพบนจอแล้ว (กลับกระจกแล้ว) หรือ null ถ้าไม่พบคน
   * คืนค่ารูปแบบเดียวกับ BodyDetectionSystem.detect()
   */
  function detect(lm, requiredList, minVisibility) {
    minVisibility = minVisibility == null ? 0.5 : minVisibility;
    const result = { detected: false, in_frame: false, landmarks: {}, missing: [], message: "" };
    if (!lm || lm.length < LANDMARK_NAMES.length) { result.message = MSG_NO_BODY; return result; }

    const landmarks = {};
    LANDMARK_NAMES.forEach((n, i) => { const p = lm[i]; landmarks[n] = [p.x, p.y, p.z || 0, p.visibility == null ? 0 : p.visibility]; });
    const inside = (p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
    const ok = (p) => p[3] >= minVisibility && inside(p);

    const req = (requiredList && requiredList.length ? requiredList : DEFAULT_REQUIRED).filter((n) => n in landmarks);
    const missing = req.filter((n) => !ok(landmarks[n]));
    const outside = missing.filter((n) => !inside(landmarks[n]));

    result.detected = true; result.landmarks = landmarks; result.missing = missing; result.in_frame = !missing.length;
    if (!missing.length) result.message = "พร้อม";
    else if (outside.length || missing.some((n) => LOWER_BODY.some((part) => n.includes(part)))) result.message = "ถอยห่างจากกล้องอีกเล็กน้อย ให้เห็นทั้งตัว";
    else result.message = "มองไม่เห็น: " + missing.slice(0, 3).map((n) => JOINT_NAMES_TH[n] || n).join(", ") + " ปรับตำแหน่งให้เห็นชัด";
    return result;
  }
  /** MediaPipe ทำงานกับภาพปกติ -> กลับค่า x ให้ตรงกับภาพกระจกบนจอ (เหมือน mirrored_input ของ 1.2) */
  function mirrorLandmarks(lm) {
    return lm ? lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility })) : lm;
  }

  // ======================================================== 1.3 JointTracker
  class JointTracker {
    constructor(smoothing = 0.5, minVisibility = 0.5) {
      if (!(smoothing >= 0 && smoothing < 1)) throw new Error("smoothing ต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 1");
      this.smoothing = smoothing; this.minVisibility = minVisibility; this._previous = {};
    }
    reset() { this._previous = {}; }
    update(body, frameShape) {
      if (!body || !body.detected) { this.reset(); return {}; }
      const height = frameShape[0], width = frameShape[1], joints = {};
      for (const name in body.landmarks) {
        const [x, y, z, visibility] = body.landmarks[name];
        let px = x * width, py = y * height;
        const prev = this._previous[name];
        if (prev) { const keep = this.smoothing; px = keep * prev[0] + (1 - keep) * px; py = keep * prev[1] + (1 - keep) * py; }
        this._previous[name] = [px, py];
        joints[name] = { x, y, z, px, py, visibility, visible: visibility >= this.minVisibility };
      }
      JointTracker._addVirtual(joints);
      return joints;
    }
    static _addVirtual(joints) {
      for (const name in VIRTUAL_SOURCES) {
        const a = joints[VIRTUAL_SOURCES[name][0]], b = joints[VIRTUAL_SOURCES[name][1]];
        if (!a || !b) continue;
        const px = (a.px + b.px) / 2; let py = (a.py + b.py) / 2;
        if (name === "below_mid_hip") py += 100; // ลงไปตรง ๆ ในแนวดิ่ง
        joints[name] = { x: 0, y: 0, z: 0, px, py, visibility: Math.min(a.visibility, b.visibility), visible: a.visible && b.visible };
      }
    }
  }
  const SKELETON_LINES = [
    ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
    ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
    ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"]];
  const SKELETON_JOINTS = new Set([].concat(...SKELETON_LINES));
  const LEG_JOINTS = new Set(["left_knee", "right_knee", "left_ankle", "right_ankle"]);

  /** วาดโครงกระดูกลง canvas 2D (เหมือน draw_skeleton ของ 1.3: ขาวาดเฉพาะท่าที่ใช้ขา) */
  function drawSkeleton(g, joints, tracked, lineColor, jointColor) {
    if (!joints || !Object.keys(joints).length) return;
    tracked = new Set(tracked || []); lineColor = lineColor || "rgb(80,200,80)"; jointColor = jointColor || "rgb(255,200,0)";
    const drawable = (n) => { const j = joints[n]; return !!(j && j.visible && (!LEG_JOINTS.has(n) || tracked.has(n))); };
    g.lineWidth = 3; g.strokeStyle = lineColor;
    SKELETON_LINES.forEach(([a, b]) => { if (drawable(a) && drawable(b)) { g.beginPath(); g.moveTo(joints[a].px, joints[a].py); g.lineTo(joints[b].px, joints[b].py); g.stroke(); } });
    LANDMARK_NAMES.forEach((n) => {
      if (!SKELETON_JOINTS.has(n) || !drawable(n)) return;
      const t = tracked.has(n); g.fillStyle = t ? jointColor : "rgb(200,200,200)";
      g.beginPath(); g.arc(joints[n].px, joints[n].py, t ? 9 : 5, 0, 7); g.fill();
    });
  }

  // ======================================================== ตัวกรองให้จุดขยับลื่น (One Euro Filter)
  /** MediaPipe Tasks (รุ่นใหม่) ไม่กรองจุดให้ ภาพจึงสั่น  ตัวกรองนี้นิ่งเมื่อผู้เล่นอยู่นิ่ง และตามทันเมื่อขยับเร็ว (หน่วงน้อย) */
  class LandmarkSmoother {
    constructor(minCutoff = 0.9, beta = 8, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.reset(); }
    reset() { this.s = null; this.t = null; this.v = null; this.on = null; }
    /** ความมั่นใจของแต่ละจุดเฉลี่ยย้อนหลัง + ฮิสเทอรีซิส (ติดที่ ≥ 0.5 ดับที่ < 0.3) กันจุดกะพริบหายแว็บเดียว */
    _vis(lm) {
      if (!this.v || this.v.length !== lm.length) { this.v = lm.map((p) => p.visibility); this.on = lm.map((p) => p.visibility >= 0.5); }
      return lm.map((p, i) => {
        const e = (this.v[i] = 0.5 * this.v[i] + 0.5 * p.visibility);
        if (this.on[i] ? e < 0.3 : e >= 0.5) this.on[i] = !this.on[i];
        return this.on[i] ? Math.max(0.6, e) : Math.min(0.4, e);
      });
    }
    static _alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
    /** lm = [{x,y,z,visibility}] t = เวลา (วินาที) คืนรายการใหม่ที่กรองแล้ว (ไม่แก้ของเดิม) */
    apply(lm, t) {
      if (!lm) { this.reset(); return lm; }
      const vis = this._vis(lm), withVis = (out) => out.map((p, i) => Object.assign({}, p, { visibility: vis[i] }));
      if (!this.s || this.s.length !== lm.length || t <= this.t) {
        if (this.s && this.s.length === lm.length && t <= this.t) return withVis(this.s.map((p, i) => Object.assign({}, lm[i], { x: p.x, y: p.y })));
        this.s = lm.map((p) => ({ x: p.x, y: p.y, dx: 0, dy: 0 })); this.t = t; return withVis(lm);
      }
      const dt = Math.max(1e-3, t - this.t); this.t = t;
      const ad = LandmarkSmoother._alpha(this.dCutoff, dt);
      this.s = this.s.map((p, i) => {
        const o = {};
        ["x", "y"].forEach((k) => {
          const raw = lm[i][k], d = (raw - p[k]) / dt, dh = ad * d + (1 - ad) * p["d" + k];
          const a = LandmarkSmoother._alpha(this.minCutoff + this.beta * Math.abs(dh), dt);
          o[k] = a * raw + (1 - a) * p[k]; o["d" + k] = dh;
        });
        return o;
      });
      return withVis(lm.map((p, i) => Object.assign({}, p, { x: this.s[i].x, y: this.s[i].y })));
    }
  }

  // ======================================================== 1.2 วาดโครงกระดูก (BodyDetectionSystem.draw_skeleton / draw_status)
  /** วาดแบบเดียวกับโหมดทดสอบ 1.2: เส้นเหลือง จุดแดงขอบขาว จุดคอสีม่วง (คอ = กึ่งกลางไหล่ ขึ้นไป 12% ของความยาวลำตัว)  body = ผลจาก detect() */
  function drawBodySkeleton(g, body, W, H, fps) {
    const vis = (n) => { const l = body.landmarks[n]; if (!l || l[3] < 0.5) return null; const x = Math.trunc(l[0] * W), y = Math.trunc(l[1] * H); return x >= 0 && x < W && y >= 0 && y < H ? [x, y] : null; };
    const names = ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip"];
    const P = {}; names.forEach((n) => (P[n] = vis(n)));
    const ls = P.left_shoulder, rs = P.right_shoulder, lh = P.left_hip, rh = P.right_hip;
    if (ls && rs && lh && rh) {
      const sc = [Math.trunc((ls[0] + rs[0]) / 2), Math.trunc((ls[1] + rs[1]) / 2)], hc = [Math.trunc((lh[0] + rh[0]) / 2), Math.trunc((lh[1] + rh[1]) / 2)];
      const nx = sc[0], ny = sc[1] - Math.trunc(Math.hypot(sc[0] - hc[0], sc[1] - hc[1]) * 0.12);
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) P.neck = [nx, ny];
    }
    const sc = Math.max(1, W / 640); // ภาพกล้องจริงใหญ่กว่า 640 ให้เส้น/จุดโตตาม
    g.lineCap = "round"; g.lineWidth = 3 * sc; g.strokeStyle = "rgb(255,255,0)";
    [["neck", "left_shoulder"], ["neck", "right_shoulder"], ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
     ["left_hip", "right_hip"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"]]
      .forEach(([a, b]) => { if (P[a] && P[b]) { g.beginPath(); g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); g.stroke(); } });
    names.forEach((n) => {
      if (!P[n]) return;
      g.beginPath(); g.arc(P[n][0], P[n][1], 6 * sc, 0, 7); g.fillStyle = "rgb(255,0,0)"; g.fill();
      g.lineWidth = 1 * sc; g.strokeStyle = "#fff"; g.stroke();
    });
    if (P.neck) { g.beginPath(); g.arc(P.neck[0], P.neck[1], 7 * sc, 0, 7); g.fillStyle = "rgb(255,0,255)"; g.fill(); }
    // แถบสถานะ + FPS (draw_status / process_frame)
    g.fillStyle = "rgb(30,30,30)"; g.fillRect(10 * sc, 10 * sc, 320 * sc, 45 * sc);
    g.font = `bold ${Math.round(22 * sc)}px sans-serif`; g.fillStyle = body.detected ? "rgb(0,255,0)" : "rgb(255,60,60)";
    g.fillText(body.detected ? "BODY DETECTED" : "BODY NOT DETECTED", 20 * sc, 40 * sc);
    g.font = `bold ${Math.round(19 * sc)}px sans-serif`; g.fillStyle = "#fff"; g.fillText("FPS: " + fps.toFixed(1), 20 * sc, 85 * sc);
  }

  /** โครงกระดูกแบบเดียวกับ 1.2 (เส้นเหลือง จุดแดงขอบขาว จุดคอสีม่วง) แต่วาดจากข้อต่อของ 1.3 (px,py) ใช้ตอนเล่นจริงและตอนแสดงตัวอย่างท่า
   *  tracked = ข้อต่อที่ท่านี้ใช้ (ขาจะวาดเฉพาะท่าที่ใช้ขา)  sc = ตัวคูณขนาดเส้น/จุด  col = {line, dot, neck, edge} เปลี่ยนสีได้ (เช่น เงาสีเทา) */
  function drawPlayerSkeleton(g, joints, tracked, sc, col) {
    if (!joints || !Object.keys(joints).length) return;
    tracked = new Set(tracked || []); sc = sc || 1;
    col = Object.assign({ line: "rgb(255,255,0)", dot: "rgb(255,0,0)", neck: "rgb(255,0,255)", edge: "#fff", head: "rgb(0,220,255)" }, col || {});
    const ok = (n) => { const j = joints[n]; return !!(j && j.visible && (!LEG_JOINTS.has(n) || tracked.has(n))); };
    const P = (n) => [joints[n].px, joints[n].py];
    let neck = null;
    if (ok("left_shoulder") && ok("right_shoulder")) {
      const a = P("left_shoulder"), b = P("right_shoulder"), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let torso = Math.hypot(a[0] - b[0], a[1] - b[1]) * 1.2;
      if (ok("left_hip") && ok("right_hip")) { const l = P("left_hip"), r = P("right_hip"); torso = Math.hypot(c[0] - (l[0] + r[0]) / 2, c[1] - (l[1] + r[1]) / 2); }
      neck = [c[0], c[1] - torso * 0.12]; // คอ = กึ่งกลางไหล่ขึ้นไป 12% ของความยาวลำตัว (เหมือน 1.2)
    }
    g.lineCap = "round"; g.lineWidth = 3 * sc; g.strokeStyle = col.line;
    const line = (p, q) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
    if (neck) ["left_shoulder", "right_shoulder"].forEach((n) => ok(n) && line(neck, P(n)));
    SKELETON_LINES.forEach(([a, b]) => { if (ok(a) && ok(b)) line(P(a), P(b)); });
    SKELETON_JOINTS.forEach((n) => {
      if (!ok(n)) return; const p = P(n);
      g.beginPath(); g.arc(p[0], p[1], 6 * sc, 0, 7); g.fillStyle = col.dot; g.fill(); g.lineWidth = sc; g.strokeStyle = col.edge; g.stroke();
    });
    if (neck) { g.beginPath(); g.arc(neck[0], neck[1], 7 * sc, 0, 7); g.fillStyle = col.neck; g.fill(); }
    // ท่าที่ตรวจศีรษะ (เช่น ยืดคอ ยกไหล่) วาดจมูก/หู ด้วย เพื่อให้เห็นการเอียงคอ
    const head = (n) => tracked.has(n) && joints[n] && joints[n].visible;
    if (head("nose")) {
      const q = P("nose"); if (neck) line(neck, q);
      g.beginPath(); g.arc(q[0], q[1], 5 * sc, 0, 7); g.fillStyle = col.head || "rgb(0,220,255)"; g.fill();
    }
    ["left_ear", "right_ear"].forEach((n) => { if (head(n)) { const q = P(n); g.beginPath(); g.arc(q[0], q[1], 4 * sc, 0, 7); g.fillStyle = col.head || "rgb(0,220,255)"; g.fill(); } });
  }

  /** ความคืบหน้า 0-1 ของแอนิเมชันตัวอย่างท่า ณ เวลา t (วินาที): ยืน -> เข้าท่า -> ค้าง -> กลับ (ช้ากว่าคนจำลองตอนทดสอบ ให้ดูท่าทัน) */
  function demoPhi(ex, t) {
    const hold = ex.counter.mode === "hold" ? Math.min(3, Math.max(1.5, ex.counter.hold_sec || 0)) : 1.2;
    const L = 0.6, U = 1.6, D = 1.6, G = 0.4, T = L + U + hold + D + G, e = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    t = ((t % T) + T) % T;
    if (t < L) return 0; t -= L;
    if (t < U) return e(t / U); t -= U;
    if (t < hold) return 1; t -= hold;
    if (t < D) return 1 - e(t / D);
    return 0;
  }

  // ======================================================== 1.4 วิเคราะห์ท่าทาง
  function calculateAngle(a, b, c) {
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    if (l1 === 0 || l2 === 0) return null;
    const cs = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)));
    return Math.acos(cs) / DEG;
  }

  class PoseAnalyzer {
    constructor(ex, smoothingWindow = 5) {
      const c = ex.counter;
      this.angleDefs = ex.angles; this.mode = c.mode || "reps";
      this.counterAngles = typeof c.angle === "string" ? [c.angle] : c.angle.slice();
      this.start = +c.start_angle; this.target = +c.target_angle;
      if (this.start === this.target) throw new Error("start_angle กับ target_angle ต้องไม่เท่ากัน");
      this.reach = c.reach_ratio == null ? 0.85 : +c.reach_ratio;
      this.ret = c.return_ratio == null ? 0.15 : +c.return_ratio;
      // ท่านับครั้ง: นับทันทีที่หลอดเต็ม (ค้างในท่าเป้าหมายครบ rep_dwell_sec) ไม่ต้องรอกลับจุดเริ่มต้นสุด
      // นับแล้วต้องกลับลงมาต่ำกว่า rearm_ratio ก่อน จึงนับครั้งถัดไปได้ (กันนับซ้ำตอนค้างอยู่ที่เต็ม)
      this.repDwell = c.rep_dwell_sec == null ? 0.25 : +c.rep_dwell_sec;
      this.rearm = c.rearm_ratio == null ? Math.max(this.ret, 0.4) : +c.rearm_ratio;
      this.holdSec = c.hold_sec == null ? 0 : +c.hold_sec;
      // ท่าค้าง: ขยับนิดหน่อยไม่ถือว่าหลุด + หลุดแล้วเวลาค่อย ๆ ลด (ไม่รีเซ็ตเป็น 0 ทันที)
      this.holdRatio = c.hold_ratio == null ? Math.max(0.5, this.reach - 0.2) : +c.hold_ratio; // ค้างอยู่ได้ตราบที่คืบหน้า >= ค่านี้ (ต่ำกว่าตอนเข้าท่า)
      this.holdGrace = c.hold_grace_sec == null ? 0.5 : +c.hold_grace_sec;                      // หลุดไม่เกินเท่านี้ เวลาไม่ลดเลย
      this.holdDecay = c.hold_decay == null ? 1.0 : +c.hold_decay;                              // หลุดนานกว่านั้น เวลาลดด้วยความเร็วเท่านี้ (1 = เท่าความเร็วที่สะสม)
      this.win = smoothingWindow; this.reset();
    }
    reset() {
      this.hist = {}; for (const k in this.angleDefs) this.hist[k] = [];
      this.reps = 0; this.armed = false; this.needRearm = false; this.dwellStart = null; this.peakProg = null; this.peakSnap = null;
      this.holdAccum = 0; this.holdLast = null; this.dropStart = null; this.holdSnap = null;
    }
    _raw(joints) {
      const out = {};
      for (const k in this.angleDefs) {
        const [a, b, c] = this.angleDefs[k].map((n) => joints[n]);
        out[k] = a && b && c && a.visible && b.visible && c.visible ? calculateAngle([a.px, a.py], [b.px, b.py], [c.px, c.py]) : null;
      }
      return out;
    }
    _smooth(raw) {
      const out = {};
      for (const k in raw) {
        const h = this.hist[k];
        if (raw[k] == null) { h.length = 0; out[k] = null; }
        else { h.push(raw[k]); if (h.length > this.win) h.shift(); out[k] = h.reduce((s, v) => s + v, 0) / h.length; }
      }
      return out;
    }
    analyze(joints, now) {
      const angles = this._smooth(this._raw(joints));
      const res = { valid: false, angles, progress: 0, phase: "unknown", reps: this.reps, hold_time: 0, rep_completed: false, rep_snapshot: null };
      const vals = this.counterAngles.map((n) => angles[n]);
      if (vals.some((v) => v == null)) { // มองไม่เห็นข้อต่อ: โหมดค้างท่าให้เวลาค่อย ๆ ลด ไม่รีเซ็ต
        if (this.mode === "hold") { res.hold_time = this._hold(false, angles, now)[1]; res.holding = false; }
        return res;
      }
      const angle = vals.reduce((s, v) => s + v, 0) / vals.length;
      const raw = (angle - this.start) / (this.target - this.start);
      const atStart = raw <= this.ret, atTarget = raw >= this.reach;
      if (atStart) { this.armed = true; this.needRearm = false; }
      else if (this.needRearm && raw <= this.rearm) { this.armed = true; this.needRearm = false; }
      let snap;
      if (this.mode === "hold") {
        const holding = this.armed && (this.holdAccum > 0 ? raw >= this.holdRatio : atTarget); // ค้างไปแล้ว: เกณฑ์ผ่อนลง ขยับนิดหน่อยไม่หลุด
        const r = this._hold(holding, angles, now); snap = r[0]; res.hold_time = r[1]; res.holding = holding;
      }
      else snap = this._reps(atTarget, raw, angles, now);
      res.valid = true; res.progress = Math.max(0, Math.min(1, raw));
      res.phase = atStart ? "start" : atTarget ? "target" : "moving";
      if (snap) { this.reps++; res.rep_completed = true; res.rep_snapshot = snap; }
      res.reps = this.reps;
      return res;
    }
    _reps(atTarget, raw, angles, now) {
      if (this.armed && atTarget) {
        if (this.dwellStart == null) this.dwellStart = now;
        if (this.peakProg == null || raw > this.peakProg) { this.peakProg = raw; this.peakSnap = Object.assign({}, angles); }
        if (now - this.dwellStart >= this.repDwell) { // หลอดเต็ม (ถึงเป้าหมาย) ครบเวลา -> นับ 1 ครั้งทันที
          const snap = this.peakSnap;
          this.armed = false; this.needRearm = true; this.dwellStart = null; this.peakProg = null; this.peakSnap = null;
          return snap;
        }
      } else if (!atTarget) { this.dwellStart = null; this.peakProg = null; this.peakSnap = null; }
      return null;
    }
    /** โหมดค้างท่า: สะสมเวลาที่อยู่ในท่า  หลุดไม่เกิน holdGrace วินาที = ไม่ลด  หลุดนานกว่านั้น = ค่อย ๆ ลด (ไม่รีเซ็ตเป็น 0) */
    _hold(inTarget, angles, now) {
      const dt = this.holdLast == null ? 0 : Math.max(0, Math.min(0.5, now - this.holdLast)); this.holdLast = now;
      if (inTarget) { this.dropStart = null; this.holdAccum += dt; this.holdSnap = Object.assign({}, angles); }
      else if (this.holdAccum > 0) {
        if (this.dropStart == null) this.dropStart = now;
        if (now - this.dropStart > this.holdGrace) this.holdAccum = Math.max(0, this.holdAccum - dt * this.holdDecay);
        if (this.holdAccum === 0) this.dropStart = null;
      }
      if (this.holdAccum >= this.holdSec && this.holdSnap) {
        const s = this.holdSnap, t = this.holdAccum;
        this.armed = false; this.holdAccum = 0; this.dropStart = null; this.holdSnap = null; // ต้องกลับท่าเริ่มต้นก่อนทำครั้งต่อไป
        return [s, t];
      }
      return [null, this.holdAccum];
    }
  }

  // ======================================================== 1.5 ประเมินท่าทาง
  /** round() แบบ Python 3 (ปัดเข้าหาเลขคู่เมื่อเป็นครึ่งพอดี) */
  function pyRound(x) { const f = Math.floor(x), d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; }
  function gradeFor(s) { return s >= 85 ? "ยอดเยี่ยม" : s >= 70 ? "ดี" : s >= 50 ? "พอใช้" : "ต้องปรับปรุง"; }
  const uniq = (a) => Array.from(new Set(a));

  class PoseEvaluator {
    constructor(ex, passThreshold = 0.7) {
      this.criteria = ex.criteria || []; this.mode = ex.counter.mode || "reps"; this.pass = passThreshold;
      this.repScores = []; this.allFb = []; this._acc();
    }
    reset() { this.repScores = []; this.allFb = []; this._acc(); }
    _acc() { const n = this.criteria.length; this.sum = Array(n).fill(0); this.cnt = Array(n).fill(0); this.last = Array(n).fill(null); }
    static scoreOne(angle, c) {
      const lo = c.min, hi = c.max, margin = c.margin == null ? 30 : +c.margin;
      let dev;
      if (lo != null && angle < lo) dev = lo - angle; else if (hi != null && angle > hi) dev = angle - hi; else return 1;
      return Math.max(0, 1 - dev / margin);
    }
    static message(c, angle) {
      if (angle != null && c.min != null && angle < c.min && c.feedback_low) return c.feedback_low;
      if (angle != null && c.max != null && angle > c.max && c.feedback_high) return c.feedback_high;
      return c.feedback || "ปรับท่าทางให้ตรงตามตัวอย่าง";
    }
    averageScore() { return this.repScores.length ? pyRound(this.repScores.reduce((s, v) => s + v, 0) / this.repScores.length) : null; }
    evaluate(an) {
      const res = { live_score: null, live_feedback: [], rep_completed: false, rep_score: null, rep_feedback: [], rep_grade: null,
                    rep_scores: this.repScores.slice(), average_score: this.averageScore() };
      if (!an.valid && !an.rep_completed) return res;
      const collecting = this.mode === "hold" ? an.hold_time > 0 : true;
      const live = [], msgs = [];
      this.criteria.forEach((c, i) => {
        const angle = an.angles[c.angle]; if (angle == null) return;
        const when = c.when || "always", score = PoseEvaluator.scoreOne(angle, c);
        if (when === "always") {
          if (collecting) { this.sum[i] += score; this.cnt[i]++; if (score < this.pass) this.last[i] = PoseEvaluator.message(c, angle); }
          live.push(score); if (score < this.pass) msgs.push(PoseEvaluator.message(c, angle));
        } else if (an.phase === "target") { live.push(score); if (score < this.pass) msgs.push(PoseEvaluator.message(c, angle)); }
      });
      if (live.length) res.live_score = pyRound(100 * live.reduce((s, v) => s + v, 0) / live.length);
      res.live_feedback = uniq(msgs).slice(0, 2);
      if (an.rep_completed) this._finish(an.rep_snapshot, res);
      return res;
    }
    _finish(snap, res) {
      const scores = [], fb = [];
      this.criteria.forEach((c, i) => {
        const when = c.when || "always", a = snap ? snap[c.angle] : null;
        let score, msg;
        if (when === "always" && this.cnt[i] > 0) { score = this.sum[i] / this.cnt[i]; msg = this.last[i]; }
        else if (a != null) { score = PoseEvaluator.scoreOne(a, c); msg = PoseEvaluator.message(c, a); }
        else return;
        scores.push(score); if (score < this.pass && msg) fb.push(msg);
      });
      const rs = scores.length ? pyRound(100 * scores.reduce((s, v) => s + v, 0) / scores.length) : 100;
      const f = uniq(fb);
      this.repScores.push(rs); this.allFb.push(...f); this._acc();
      Object.assign(res, { rep_completed: true, rep_score: rs, rep_feedback: f, rep_grade: gradeFor(rs), rep_scores: this.repScores.slice(), average_score: this.averageScore() });
    }
    summary() {
      const avg = this.averageScore(), cnt = {}, order = [];
      this.allFb.forEach((t) => { if (!(t in cnt)) { cnt[t] = 0; order.push(t); } cnt[t]++; });
      const common = order.slice().sort((a, b) => cnt[b] - cnt[a]).slice(0, 2); // เสมอกัน เรียงตามที่พบก่อน (เหมือน Counter)
      return { reps: this.repScores.length, scores: this.repScores.slice(), average: avg, grade: avg != null ? gradeFor(avg) : null, advice: common };
    }
  }

  // ======================================================== main.py : เล่น 1 ท่า
  /**
   * WorkoutRunner = run_exercise() ของ main.py แยกเป็นทีละเฟรม
   *   step(lm, now, W, H) รับจุด 33 จุด (หรือ null) คืนสถานะให้หน้าจอแสดงผล
   *   stage: "ready" (นับถอยหลัง) -> "run" (ทำท่า) -> "done"
   */
  class WorkoutRunner {
    constructor(ex, opts) {
      opts = opts || {};
      this.ex = ex; this.readySec = opts.readySec == null ? 3 : opts.readySec;
      this.tracker = opts.tracker || new JointTracker();
      this.analyzer = new PoseAnalyzer(ex); this.evaluator = new PoseEvaluator(ex);
      this.required = requiredJoints(ex);
      this.targetReps = opts.reps != null ? opts.reps : parseInt(ex.reps || 0, 10);
      this.duration = +(ex.duration_sec || 0); this.holdSec = +(ex.counter.hold_sec || 0);
      this.tracker.reset();
      this.grace = opts.grace == null ? 0.5 : opts.grace; this.lastInView = null; // ตกกรอบแว็บเดียว (< 0.5 วินาที) ไม่ถือว่าหลุด
      this.stage = "ready"; this.readyStart = null; this.startTime = null; this.lastRep = null; this.skipped = false;
      this.analysis = { valid: false, reps: 0, progress: 0, hold_time: 0, phase: "unknown" };
    }
    step(lm, now, W, H) {
      const body = detect(lm, this.required);
      const joints = this.tracker.update(body, [H, W]);
      const seen = body.detected && body.in_frame;
      if (seen) this.lastInView = now;
      const inView = seen || (body.detected && this.lastInView != null && now - this.lastInView <= this.grace);
      const st = { stage: this.stage, body, joints, inView, message: body.message, countdown: null, evaluation: null,
                   analysis: this.analysis, reps: this.analysis.reps, targetReps: this.targetReps, hold: this.holdSec,
                   lastRep: this.lastRep, finished: false, skipped: false, required: this.required };
      if (this.stage === "ready") {
        this.analyzer.analyze({}, now);
        if (inView) {
          if (this.readyStart == null) this.readyStart = now;
          if (now - this.readyStart >= this.readySec) { this.startTime = now; this.stage = "run"; }
          else st.countdown = Math.floor(this.readySec - (now - this.readyStart)) + 1;
        } else this.readyStart = null;
      }
      if (this.stage === "run") {
        this.analysis = this.analyzer.analyze(inView ? joints : {}, now);
        const ev = this.evaluator.evaluate(this.analysis);
        st.evaluation = ev; st.analysis = this.analysis; st.reps = this.analysis.reps;
        if (ev.rep_completed) {
          const a = this.analysis;
          let text = `ครั้งที่ ${a.reps}: ${ev.rep_score} คะแนน (${ev.rep_grade})`;
          if (ev.rep_feedback.length) text += " - " + ev.rep_feedback[0];
          this.lastRep = st.lastRep = { reps: a.reps, score: ev.rep_score, grade: ev.rep_grade, feedback: ev.rep_feedback, text, at: now };
        }
        if ((this.targetReps && this.analysis.reps >= this.targetReps) || (this.duration && now - this.startTime >= this.duration)) this.stage = "done";
      }
      st.stage = this.stage; st.finished = this.stage === "done";
      st.summary = this.evaluator.summary();
      return st;
    }
    skip() { this.skipped = true; this.stage = "done"; }
    /** ผลสรุปของท่า (เหมือนค่าที่ run_exercise คืน) */
    result() {
      const s = this.evaluator.summary(), ex = this.ex;
      return { id: ex.id, name: ex.name, category: ex.category, reps_done: this.analysis.reps, target_reps: this.targetReps,
               scores: s.scores, average: s.average, grade: s.grade, advice: s.advice, skipped: this.skipped };
    }
  }

  /** หน้าสรุปผลของ main.py: คะแนนรวมของทุกท่า */
  function overallScore(results) {
    const scored = results.filter((r) => r.average != null).map((r) => r.average);
    return scored.length ? pyRound(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  }

  // ======================================================== คนจำลองแทนกล้อง (จาก test_all_systems.py)
  const SIM_W = 1280, SIM_H = 720, SIM_FPS = 30;
  const rotate = (v, deg) => { const r = deg * DEG; return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)]; };

  /**
   * สร้างจุด 33 จุด (สัดส่วน 0-1) ของคนยืนหันหน้าเข้ากล้อง
   * p = {shoulder:[l,r], elbow:[l,r], knee:[l,r], tilt,           (เดิม: มุมแขน ศอก เข่า เอียงลำตัว)
   *      headTilt (เอียงคอ°), shrugL/shrugR (ยกไหล่ px), armIn (แขนชิดเข้ากลาง° = มือประสานกัน),
   *      twist (บิดลำตัว°), bend (โน้มตัวไปหน้า°), liftL/liftR (ยกข้อเท้า px), hidden:[ชื่อ]}
   */
  function buildPose(p) {
    p = p || {};
    const el = p.elbow || [175, 175], kn = p.knee || [175, 175], tilt = p.tilt || 0, hidden = p.hidden || [];
    const sh = p.armIn > 0 ? [-p.armIn, -p.armIn] : p.shoulder || [15, 15];
    const shrug = [p.shrugL || 0, p.shrugR || 0], lift = [p.liftL || 0, p.liftR || 0];
    const k = 0.75, hipC = [640, 370], t = tilt * DEG, bendC = Math.cos((p.bend || 0) * DEG), twistC = Math.cos((p.twist || 0) * DEG);
    const up = [Math.sin(t), -Math.cos(t)], right = [Math.cos(t), Math.sin(t)];
    const midSh = [hipC[0] + 170 * k * bendC * up[0], hipC[1] + 170 * k * bendC * up[1]];
    const tr = (tilt + (p.headTilt || 0)) * DEG, headUp = [Math.sin(tr), -Math.cos(tr)], headRight = [Math.cos(tr), Math.sin(tr)];
    const nose = [midSh[0] + 60 * k * headUp[0], midSh[1] + 60 * k * headUp[1]];
    const pts = { nose };
    [["left", -1, 0], ["right", 1, 1]].forEach(([side, s, i]) => {
      pts[side + "_ear"] = [nose[0] + s * 38 * k * headRight[0] - 5 * k * headUp[0], nose[1] + s * 38 * k * headRight[1] - 5 * k * headUp[1]];
      const S = [midSh[0] + s * 80 * k * twistC * right[0], midSh[1] + s * 80 * k * twistC * right[1] - shrug[i] * k];
      const hip = [640 + s * 80 * k, hipC[1]];
      const d = [s * Math.sin(sh[i] * DEG), Math.cos(sh[i] * DEG)];
      const E = [S[0] + 120 * k * d[0], S[1] + 120 * k * d[1]];
      const wd = rotate(d, s * (180 - el[i]));
      const Wr = [E[0] + 110 * k * wd[0], E[1] + 110 * k * wd[1]];
      const base = 2 * 130 * k * Math.sin(kn[i] * DEG / 2);
      const ankle = [hip[0], hip[1] + base - lift[i]];
      const K = [hip[0] + s * 130 * k * Math.cos(kn[i] * DEG / 2), hip[1] + base / 2 - lift[i] * 0.6];
      pts[side + "_shoulder"] = S; pts[side + "_elbow"] = E; pts[side + "_wrist"] = Wr;
      pts[side + "_hip"] = hip; pts[side + "_knee"] = K; pts[side + "_ankle"] = ankle;
    });
    return LANDMARK_NAMES.map((name) => {
      const q = pts[name] || pts.nose;
      return { x: q[0] / SIM_W, y: q[1] / SIM_H, z: 0, visibility: hidden.indexOf(name) >= 0 ? 0.1 : 0.99 };
    });
  }

  /**
   * มุมที่คนจำลองทำได้นอกเหนือจากไหล่/ศอก/เข่า/ลำตัว: ตั้งชื่อมุมในไฟล์ท่าตามนี้ คนจำลองจะขยับตามให้
   * (หาค่าพารามิเตอร์ของท่าทางที่ทำให้ได้มุมนั้นจริง ด้วยการสุ่มตารางแล้วเทียบกลับ ไม่ใช้สูตรลัด)
   */
  const SIM_CUSTOM = {
    neck: { triple: ["nose", "mid_shoulder", "mid_hip"], param: "headTilt", hi: 60 },                  // เอียงคอ (ยิ่งเอียง มุมยิ่งน้อย)
    left_shrug: { triple: ["left_ear", "left_shoulder", "left_hip"], param: "shrugL", hi: 60 },        // ยกไหล่ซ้าย
    right_shrug: { triple: ["right_ear", "right_shoulder", "right_hip"], param: "shrugR", hi: 60 },
    hands_back: { triple: ["left_wrist", "mid_hip", "right_wrist"], param: "armIn", hi: 25 },          // มือประสานด้านหลัง/ชิดกลางลำตัว
    hands_front: { triple: ["left_wrist", "mid_shoulder", "right_wrist"], param: "armIn", hi: 25 },    // มือประสานด้านหน้า
    torso_twist: { triple: ["left_shoulder", "mid_hip", "right_shoulder"], param: "twist", hi: 70 },   // บิดตัว: ไหล่แคบลงในภาพ มุมลด
    torso_bend: { triple: ["left_shoulder", "mid_hip", "right_shoulder"], param: "bend", hi: 70 },     // โน้มตัวไปหน้า: ไหล่ลงมาใกล้สะโพก มุมเพิ่ม
    legs: { triple: ["left_ankle", "mid_hip", "right_ankle"], param: "liftL", hi: 150 },               // ยกขา: ข้อเท้าข้างหนึ่งสูงขึ้น มุมเพิ่ม
  };
  const customTables = {};
  function pointOfLm(lm, name) {
    const get = (n) => { const q = lm[LANDMARK_NAMES.indexOf(n)]; return [q.x * SIM_W, q.y * SIM_H]; };
    if (VIRTUAL_SOURCES[name]) {
      const a = get(VIRTUAL_SOURCES[name][0]), b = get(VIRTUAL_SOURCES[name][1]);
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (name === "below_mid_hip" ? 100 : 0)];
    }
    return get(name);
  }
  /** ตารางมุม-พารามิเตอร์ของมุมพิเศษ name  base = ท่าทางส่วนอื่นที่ใช้อยู่ (ศอก เข่า ฯลฯ) เพราะมีผลต่อมุมที่วัดได้ */
  function customTable(name, base) {
    base = base || {};
    const key = name + "|" + JSON.stringify([base.elbow, base.knee, base.shoulder, base.tilt].map((v) => (v ? [].concat(v).map((x) => Math.round(x)) : 0)));
    if (customTables[key]) return customTables[key];
    const c = SIM_CUSTOM[name], N = 60, xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const v = (c.hi * i) / N, lm = buildPose(Object.assign({}, base, { [c.param]: v })), [a, b, d] = c.triple.map((n) => pointOfLm(lm, n));
      xs.push(v); ys.push(calculateAngle(a, b, d));
    }
    return (customTables[key] = { xs, ys });
  }
  /** ค่าพารามิเตอร์ที่ทำให้มุม name เท่ากับ target (นอกช่วงที่ทำได้ ใช้ค่าสุดช่วง) */
  function solveCustom(name, target, base) {
    const { xs, ys } = customTable(name, base);
    let best = 0, bd = Infinity;
    for (let i = 0; i < ys.length - 1; i++) {
      const lo = Math.min(ys[i], ys[i + 1]), hi = Math.max(ys[i], ys[i + 1]);
      if (target >= lo && target <= hi) { const f = ys[i + 1] === ys[i] ? 0 : (target - ys[i]) / (ys[i + 1] - ys[i]); return xs[i] + f * (xs[i + 1] - xs[i]); }
    }
    ys.forEach((y, i) => { const d = Math.abs(y - target); if (d < bd) { bd = d; best = xs[i]; } });
    return best;
  }

  const SIM_DEFAULT = { shoulder: 15, elbow: 175, knee: 175, trunk: 180 };
  const familyOf = (name) => (name === "trunk" ? "trunk" : name.split("_").pop());
  const restAngle = (name) => (SIM_CUSTOM[name] ? customTable(name).ys[0] : SIM_DEFAULT[familyOf(name)]);

  /**
   * มุมของคนจำลองที่ความคืบหน้า phi (0 = ท่าเริ่มต้น, 1 = ท่าเป้าหมาย) ตามนิยามท่าใน exercises.json
   *   มุมนับครั้ง: ไล่จาก start_angle ไป target_angle  | มุมที่ต้องคงที่ (always): ค่ากลางของเกณฑ์
   *   มุมที่ตรวจตอนถึงเป้าหมาย (target): ไล่ไปที่ค่ากลางของเกณฑ์  | ไม่มีเกณฑ์: ท่ายืนตรง
   * errors = {ชื่อมุม: องศาที่ผิด}  (มุมนับครั้งผิดตามความคืบหน้า มุมอื่นผิดคงที่)
   */
  function anglesFor(ex, phi, errors) {
    errors = errors || {};
    const c = ex.counter, cn = typeof c.angle === "string" ? [c.angle] : c.angle, out = {};
    for (const name in ex.angles) {
      const def = restAngle(name);
      let v;
      const crit = (ex.criteria || []).find((x) => x.angle === name);
      if (cn.indexOf(name) >= 0) v = c.start_angle + (c.target_angle - c.start_angle) * phi + (errors[name] || 0) * phi;
      else {
        if (crit) {
          const lo = crit.min != null ? crit.min : crit.max, hi = crit.max != null ? crit.max : crit.min, mid = (lo + hi) / 2;
          v = (crit.when || "always") === "always" ? mid : def + (mid - def) * phi;
        } else v = def;
        v += errors[name] || 0;
      }
      out[name] = v;
    }
    return out;
  }
  function poseFromAngles(a, hidden) {
    const g = (n, d) => (a[n] != null ? a[n] : d), params = {};
    const base = { shoulder: [g("left_shoulder", 15), g("right_shoulder", 15)], elbow: [g("left_elbow", 175), g("right_elbow", 175)],
      knee: [g("left_knee", 175), g("right_knee", 175)], tilt: 180 - g("trunk", 180) };
    for (const name in a) if (SIM_CUSTOM[name] && a[name] != null) params[SIM_CUSTOM[name].param] = solveCustom(name, a[name], base);
    return buildPose(Object.assign({ hidden }, base, params));
  }
  /** ลำดับความคืบหน้าของ 1 รอบ: นิ่งที่เริ่ม -> ขึ้น -> ค้างที่เป้าหมาย -> ลง */
  function phiSequence(peakHoldFrames) {
    const seq = []; for (let i = 0; i < 10; i++) seq.push(0);
    for (let i = 1; i <= 15; i++) seq.push(i / 15);
    for (let i = 0; i < peakHoldFrames; i++) seq.push(1);
    for (let i = 1; i <= 15; i++) seq.push(1 - i / 15);
    return seq;
  }
  /** ความผิดพลาดมาตรฐานที่ทำให้คะแนนตกแน่นอน (ใช้ทดสอบ): ดันมุมที่มีเกณฑ์ให้พ้นช่วง 35 องศา */
  function badErrors(ex, only) {
    const c = ex.counter, cn = typeof c.angle === "string" ? [c.angle] : c.angle, errs = {};
    const sign = Math.sign(c.target_angle - c.start_angle), ok = (v) => v >= 5 && v <= 175;
    (ex.criteria || []).forEach((cr) => {
      if (cr.angle in errs || (cr.angle === "trunk" && !only)) return; // ไม่เอียงลำตัวจนภาพทั้งตัวเพี้ยน (ทำให้นับไม่ได้)
      if (only && cr.angle !== only) return;
      const base = anglesFor(ex, 1)[cr.angle];
      const isCounter = cn.indexOf(cr.angle) >= 0;
      const opts = [];
      if (cr.max != null) opts.push(cr.max + 35 - base);
      if (cr.min != null) opts.push(cr.min - 35 - base);
      const pick = opts.find((o) => ok(base + o) && (!isCounter || Math.sign(o) === sign));
      if (pick != null) errs[cr.angle] = pick;
    });
    return errs;
  }

  /** ชุดความผิดพลาดที่ลองใช้ทดสอบ: รวมทุกมุม แล้วไล่ทีละมุม (บางมุมผิดแล้วภาพเพี้ยนจนนับครั้งไม่ได้ ต้องลองชุดอื่น) */
  function badCandidates(ex) {
    const list = [badErrors(ex)], seen = new Set();
    (ex.criteria || []).forEach((c) => { if (!seen.has(c.angle)) { seen.add(c.angle); list.push(badErrors(ex, c.angle)); } });
    return list.filter((e) => Object.keys(e).length);
  }

  /** แหล่งภาพจำลอง: ใช้แทนกล้อง ส่งจุด 33 จุดทีละเฟรม (30 เฟรม/วินาทีของเวลาจำลอง) */
  class SimPerson {
    constructor(ex) { this.opts = { errors: {}, still: false, hidden: [], noBody: false, other: null }; this.bind(ex); }
    bind(ex) {
      this.ex = ex; this.idx = 0; this.vt = 1000;
      const hold = ex.counter.mode === "hold" ? Math.floor(ex.counter.hold_sec * SIM_FPS) + 30 : 8;
      this.seq = phiSequence(hold);
    }
    /** เดินเวลาไป 1 เฟรม  stage = ขั้นตอนของ WorkoutRunner (ยืนนิ่งรอจนเริ่มทำท่า) */
    next(stage) {
      this.vt += 1 / SIM_FPS;
      if (this.opts.noBody) return { lm: null, now: this.vt, phi: 0 };
      let phi = 0;
      if (stage === "run" && !this.opts.still) { phi = this.seq[this.idx % this.seq.length]; this.idx++; } else this.idx = 0;
      const ex = this.opts.other && stage === "run" ? this.opts.other : this.ex;
      return { lm: poseFromAngles(anglesFor(ex, phi, this.opts.other ? {} : this.opts.errors), this.opts.hidden), now: this.vt, phi };
    }
    ghost() { return poseFromAngles(anglesFor(this.ex, 1), []); }
  }

  /** ดึงจุดข้อต่อของภาพจำลองมาวางเป็นโครงเงา (พิกเซลของภาพ W x H) */
  function ghostJoints(lm, W, H) {
    const j = {}; LANDMARK_NAMES.forEach((n, i) => (j[n] = { px: lm[i].x * W, py: lm[i].y * H, visible: true }));
    return j;
  }

  const api = {
    VALID_CATEGORIES, LANDMARK_NAMES, JOINT_NAMES_TH, VIRTUAL_JOINTS, VIRTUAL_SOURCES, SKELETON_LINES,
    validateExercise, loadExercises, requiredJoints, detect, mirrorLandmarks, JointTracker, drawSkeleton,
    LandmarkSmoother, drawBodySkeleton, drawPlayerSkeleton, demoPhi, calculateAngle, PoseAnalyzer, PoseEvaluator, gradeFor, pyRound, WorkoutRunner, overallScore,
    SIM_W, SIM_H, SIM_FPS, buildPose, anglesFor, poseFromAngles, phiSequence, badErrors, badCandidates, SimPerson, ghostJoints,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MR = Object.assign(root.MR || {}, api);
})(typeof self !== "undefined" ? self : this);
