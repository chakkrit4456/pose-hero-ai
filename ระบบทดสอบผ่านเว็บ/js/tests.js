/* tests.js - ชุดทดสอบอัตโนมัติ (ย้ายจาก test_all_systems.py + ทดสอบระบบ 2) ไม่ใช้กล้อง รันได้ทั้งในหน้าเว็บและ Node
 * runAll(exerciseData) -> [[ผ่านไหม, ชื่อรายการ, รายละเอียด], ...] */
(function (root) {
  "use strict";
  const MR = typeof module !== "undefined" && module.exports ? require("./core.js") : root.MR;
  const S2 = typeof module !== "undefined" && module.exports ? require("./sys2core.js") : root.S2;
  const W = MR.SIM_W, H = MR.SIM_H, FPS = MR.SIM_FPS;

  /** ส่งท่าสังเคราะห์ผ่าน detect -> tracker -> 1.4 -> 1.5 ทีละเฟรม (run_pipeline) */
  function runPipeline(ex, reps, errors, opts) {
    opts = opts || {};
    const tracker = new MR.JointTracker(), analyzer = new MR.PoseAnalyzer(ex), evaluator = new MR.PoseEvaluator(ex);
    const required = MR.requiredJoints(ex);
    const hold = ex.counter.mode === "hold" ? Math.floor(ex.counter.hold_sec * FPS) + 30 : 8;
    const seq = [];
    for (let i = 0; i < 20; i++) seq.push(0);
    const cycle = MR.phiSequence(hold);
    for (let r = 0; r < reps + 1; r++) cycle.forEach((v) => seq.push(v));
    let now = 0, completed = 0; const feedback = [];
    for (const phi of seq) {
      const lm = MR.poseFromAngles(MR.anglesFor(ex, phi, errors), opts.hidden || []);
      const body = MR.detect(lm, required), joints = tracker.update(body, [H, W]);
      const ev = evaluator.evaluate(analyzer.analyze(joints, now));
      if (ev.rep_completed) { completed++; feedback.push(...ev.rep_feedback); }
      now += 1 / FPS;
      if (completed >= reps) break;
    }
    return { completed, summary: evaluator.summary(), feedback };
  }

  /** เล่นท่าเดียวด้วยคนจำลองผ่าน WorkoutRunner (เหมือน main.py) */
  function playWithRunner(ex, reps, opts) {
    opts = opts || {};
    const person = new MR.SimPerson(ex); Object.assign(person.opts, opts.person || {});
    const runner = new MR.WorkoutRunner(ex, { reps });
    let st = null, frames = 0, stage = "ready";
    while (frames++ < (opts.limit || 6000)) {
      const f = person.next(stage);
      st = runner.step(f.lm, f.now, W, H); stage = st.stage;
      if (opts.afterStep) opts.afterStep(st, frames);
      if (st.finished) break;
    }
    return { st, runner, frames };
  }

  function runAll(data) {
    const rows = []; const add = (ok, name, detail) => rows.push([!!ok, name, detail || ""]);
    const guard = (name, fn) => { try { fn(); } catch (e) { add(false, name + " (เกิดข้อผิดพลาด)", String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); } };

    // [1] ข้อมูลและการคำนวณ
    let exercises = [];
    guard("[1] โหลดข้อมูลท่า", () => {
      const loaded = MR.loadExercises(data); exercises = loaded.exercises;
      add(exercises.length > 0 && !loaded.warnings.length, "[1] โหลด exercises.json ผ่านการตรวจสอบทุกท่า", `${exercises.length} ท่า` + (loaded.warnings.length ? " · " + loaded.warnings.join(" | ") : ""));
      add(Math.abs(MR.calculateAngle([0, 1], [0, 0], [1, 0]) - 90) < 1e-6, "[1] คำนวณมุม 90 องศาถูกต้อง");
      add(MR.calculateAngle([0, 0], [0, 0], [1, 0]) === null, "[1] จุดซ้อนกัน คืน null ไม่ล้ม");
      const broken = JSON.parse(JSON.stringify(exercises[0])); broken.counter.angle = "angle_that_does_not_exist"; broken.category = "หมวดที่ไม่มี";
      const errs = MR.validateExercise(broken); add(errs.length >= 2, "[1] ข้อมูลท่าที่ผิดถูกตรวจพบ", errs.length + " ข้อผิดพลาด");
      const dup = MR.loadExercises({ exercises: [exercises[0], exercises[0]] });
      add(dup.exercises.length === 1 && dup.warnings.length === 1, "[1] id ซ้ำ ถูกข้ามพร้อมคำเตือน");
    });
    if (!exercises.length) return rows;

    // [2] กระจก + ข้อความแจ้งผู้เล่น (1.2)
    guard("[2] กระจก/ข้อความ", () => {
      const lm = MR.poseFromAngles({}, []);
      add(Math.abs(MR.mirrorLandmarks(lm)[11].x - (1 - lm[11].x)) < 1e-9, "[2] โหมดกระจก: กลับค่า x ให้ตรงกับภาพบนจอ");
      add(!MR.detect(null, []).detected, "[3] ไม่มีคนในภาพ → detected = false");
      const ank = MR.detect(MR.poseFromAngles({}, ["left_ankle", "right_ankle"]), ["left_ankle", "left_hip"]);
      add(ank.detected && !ank.in_frame && ank.message.includes("ถอยห่าง"), "[3] มองไม่เห็นข้อเท้า → แนะนำให้ถอยห่างกล้อง", ank.message);
      const wr = MR.detect(MR.poseFromAngles({}, ["left_wrist"]), ["left_wrist"]);
      add(wr.message.includes("ข้อมือซ้าย"), "[3] มองไม่เห็นข้อมือ → บอกชื่อข้อต่อเป็นภาษาไทย", wr.message);
      const ex0 = exercises[0], tr = new MR.JointTracker(), an = new MR.PoseAnalyzer(ex0);
      const hidden = Object.values(ex0.angles)[0].filter((n) => n !== Object.values(ex0.angles)[0][1])[0];
      const body = MR.detect(MR.poseFromAngles({}, [hidden]), [hidden]);
      add(!an.analyze(tr.update(body, [H, W]), 0).valid, "[3] ข้อต่อหายไป → 1.4 ไม่คำนวณมุมมั่ว (valid = false)");
      const r = MR.requiredJoints({ angles: { trunk: ["mid_shoulder", "mid_hip", "below_mid_hip"] } });
      add(["left_shoulder", "right_shoulder", "left_hip", "right_hip"].every((n) => r.includes(n)) && r.length === 4, "[3] ข้อต่อเสมือนแปลงเป็นข้อต่อจริงที่กล้องต้องเห็น");
    });

    // [4] สายงานทุกท่า ท่าถูก / ท่าผิด
    const good = {};
    exercises.forEach((ex) => guard("[4] " + ex.name, () => {
      const reps = 2, g = runPipeline(ex, reps, {});
      good[ex.id] = g.summary.average;
      add(g.completed === reps, `[4] ${ex.name}: นับครบ ${reps} ครั้ง`, `นับได้ ${g.completed}`);
      add(g.summary.average != null && g.summary.average >= 90, `[4] ${ex.name}: ท่าถูกต้องได้คะแนนสูง`, `${g.summary.average} คะแนน`);
      let bad = null;
      for (const errs of MR.badCandidates(ex)) { // ลองชุดความผิดพลาดจนกว่าจะได้ชุดที่ยังนับครั้งได้
        bad = runPipeline(ex, reps, errs);
        if (bad.completed >= reps && bad.summary.average != null && bad.summary.average <= 75 && bad.feedback.length) break;
      }
      add(bad && bad.summary.average != null && bad.summary.average <= 75 && bad.feedback.length > 0, `[4] ${ex.name}: ท่าผิดได้คะแนนต่ำพร้อมคำแนะนำ`,
        `${bad.summary.average} คะแนน · ${bad.feedback[0] || "-"}`);
    }));

    // [5] ไม่นับผิดพลาด
    guard("[5] ไม่นับผิดพลาด", () => {
      const ex = exercises.find((e) => e.counter.mode !== "hold" && typeof e.counter.angle !== "string" && e.criteria && e.criteria.length) || exercises[0];
      const c = ex.counter, cn = typeof c.angle === "string" ? [c.angle] : c.angle;
      const shallow = {}; cn.forEach((n) => (shallow[n] = -(c.target_angle - c.start_angle) * 0.5)); // ไปไม่ถึงครึ่งทาง
      add(runPipeline(ex, 2, shallow).completed === 0, `[5] ${ex.name}: ทำไม่ถึงเป้าหมาย → ไม่นับเป็นครั้ง`);
      const tr = new MR.JointTracker(), an = new MR.PoseAnalyzer(ex); let a = null;
      for (let i = 0; i < 60; i++) { const lm = MR.poseFromAngles(MR.anglesFor(ex, 1, {}), []); a = an.analyze(tr.update(MR.detect(lm, MR.requiredJoints(ex)), [H, W]), i / FPS); }
      add(a.reps === 0, `[5] ${ex.name}: ค้างอยู่ท่าเป้าหมายตั้งแต่ต้น ไม่เคยอยู่ท่าเริ่มต้น → ไม่นับ`);
    });

    // [6] WorkoutRunner (main.py) ทั้งขั้นตอน
    guard("[6] WorkoutRunner", () => {
      const results = [];
      exercises.forEach((src) => {
        const ex = JSON.parse(JSON.stringify(src));
        if (ex.counter.mode === "hold") ex.counter.hold_sec = 2;
        const reps = ex.counter.mode === "hold" ? 1 : 2;
        let sawCountdown = false;
        const r = playWithRunner(ex, reps, { afterStep: (st) => { if (st.countdown) sawCountdown = true; } });
        const res = r.runner.result(); results.push(res);
        add(sawCountdown && r.st.finished && res.reps_done === reps && res.average >= 90, `[6] เล่น "${ex.name}" ครบ (นับถอยหลัง → ทำท่า → สรุป)`,
          `นับ ${res.reps_done}/${reps} ครั้ง ${res.average} คะแนน (${res.grade})`);
      });
      const overall = MR.overallScore(results);
      add(overall != null && overall >= 90, "[6] คะแนนรวมทุกท่า", overall + " (" + MR.gradeFor(overall) + ")");
    });

    // [7] ปุ่มข้าม / ไม่มีคน / ซ่อนข้อต่อ
    guard("[7] ข้าม/ไม่มีคน", () => {
      const ex = exercises[0], r = new MR.WorkoutRunner(ex, { reps: 3 });
      r.step(MR.poseFromAngles({}, []), 0, W, H); r.skip();
      add(r.result().skipped === true && r.stage === "done", "[7] กด n ข้ามท่าได้");
      const still = playWithRunner(ex, 3, { person: { still: true }, limit: 600 });
      add(still.st.reps === 0 && !still.st.finished, "[7] ยืนนิ่ง ๆ ไม่ทำท่า → ไม่นับครั้ง", `นับ ${still.st.reps}`);
      const none = playWithRunner(ex, 3, { person: { noBody: true }, limit: 120 });
      add(none.st.stage === "ready" && /ไม่พบร่างกาย/.test(none.st.message), "[7] ไม่มีคนในภาพ → ไม่เริ่มนับถอยหลัง แจ้งข้อความ", none.st.message);
      const lower = exercises.find((e) => MR.requiredJoints(e).some((n) => n.includes("ankle")));
      if (lower) {
        const h = playWithRunner(lower, 2, { person: { hidden: ["left_ankle", "right_ankle"] }, limit: 120 });
        add(h.st.stage === "ready" && h.st.message.includes("ถอยห่าง"), `[7] "${lower.name}" มองไม่เห็นข้อเท้า → แนะนำให้ถอยห่าง`, h.st.message);
      }
      const other = exercises.find((e) => e.id !== ex.id && !Object.keys(ex.counter.angle instanceof Array ? ex.counter.angle : [ex.counter.angle]).some((n) => n in e.angles));
      if (other) {
        const o = playWithRunner(ex, 3, { person: { other }, limit: 900 });
        const avg = o.runner.evaluator.averageScore();
        add(o.st.reps === 0 || (avg != null && avg < good[ex.id] - 5), `[7] ทำท่าอื่น ("${other.name}") แทน → ไม่นับ/คะแนนต่ำ`, `นับ ${o.st.reps} คะแนน ${avg}`);
      }
    });

    // [7b] ค้างท่า: ขยับนิดหน่อยไม่หลุด / หลุดแล้วเวลาค่อย ๆ ลด
    guard("[7b] ค้างท่า", () => {
      const src = exercises.find((e) => e.counter.mode === "hold"); if (!src) return;
      const ex = JSON.parse(JSON.stringify(src)); ex.counter.hold_sec = 6;
      // เดินท่า: ลำดับ [phi, วินาที] แล้วคืน {เวลาค้างสูงสุด, ครบหรือไม่, เวลาค้างตอนท้าย}
      const run = (plan, hiddenPlan) => {
        const tr = new MR.JointTracker(), an = new MR.PoseAnalyzer(ex), req = MR.requiredJoints(ex); let now = 0, peak = 0, done = false, last = 0, minAfter = null;
        for (const [phi, sec, hide] of plan) for (let i = 0; i < Math.round(sec * FPS); i++) {
          const lm = MR.poseFromAngles(MR.anglesFor(ex, phi, {}), hide ? ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist"] : []);
          const r = an.analyze(tr.update(MR.detect(lm, req), [H, W]), now); now += 1 / FPS;
          if (r.rep_completed) done = true; last = r.hold_time; peak = Math.max(peak, r.hold_time);
        }
        return { peak, done, last };
      };
      const base = run([[0, 1], [1, 2], [0.7, 0.4], [1, 5], [0, 1]]); // ขยับหลุดช่วงสั้น ๆ (ไม่ถึงท่า แต่ยังใกล้ท่า) แล้วกลับมาค้างต่อ
      add(base.done, "[7b] ขยับนิดหน่อยระหว่างค้าง ไม่ถือว่าหลุด ค้างต่อจนครบ", "ครบ = " + base.done);
      const lose = run([[0, 1], [1, 3], [0, 1.5]]); // ตกจากท่าจริง ๆ ค้างมา 3 วินาที แล้วหลุด 1.5 วินาที
      add(!lose.done && lose.last > 0 && lose.last < lose.peak, "[7b] หลุดจากท่า เวลาค้างค่อย ๆ ลด ไม่รีเซ็ตเป็น 0 ทันที", "สูงสุด " + lose.peak.toFixed(1) + " วินาที -> เหลือ " + lose.last.toFixed(1));
      const gone = run([[0, 1], [1, 3], [0, 6]]);
      add(gone.last === 0 && !gone.done, "[7b] หลุดนานพอ เวลาลดจนเป็น 0 (ไม่นับครั้ง)", "เหลือ " + gone.last.toFixed(1));
      const hid = run([[0, 1], [1, 3], [1, 0.4, true], [1, 5], [0, 1]]); // กล้องมองไม่เห็นข้อต่อแว็บเดียว
      add(hid.done, "[7b] มองไม่เห็นข้อต่อแว็บเดียว (< 0.5 วินาที) ไม่ทำให้เวลาค้างหาย", "ครบ = " + hid.done);
    });

    // [7c] ท่านับครั้ง: หลอดเต็มแล้วนับทันที ไม่ต้องรอกลับจุดเริ่มต้นสุด
    guard("[7c] นับตอนหลอดเต็ม", () => {
      const ex = exercises.find((e) => e.counter.mode !== "hold"); if (!ex) return;
      const run = (plan) => {
        const tr = new MR.JointTracker(), an = new MR.PoseAnalyzer(ex), req = MR.requiredJoints(ex); let now = 0, reps = 0, full = false;
        for (const [phi, sec] of plan) for (let i = 0; i < Math.round(sec * FPS); i++) {
          const r = an.analyze(tr.update(MR.detect(MR.poseFromAngles(MR.anglesFor(ex, phi, {}), []), req), [H, W]), now); now += 1 / FPS; reps = r.reps; full = r.progress >= 0.99;
        }
        return { reps, full };
      };
      const a = run([[0, 1], [1, 1.5]]); // ขึ้นไปค้างที่เต็ม ไม่กลับลง
      add(a.reps === 1, "[7c] หลอดเต็มแล้วนับ 1 ครั้งทันที ไม่ต้องกลับลงมาสุด", "นับ " + a.reps);
      const b = run([[0, 1], [1, 3]]);
      add(b.reps === 1, "[7c] ค้างอยู่ที่เต็มต่อ ไม่นับซ้ำ", "นับ " + b.reps);
      const c = run([[0, 1], [1, 1], [0.6, 1], [1, 1]]); // ลงมาไม่ถึงครึ่ง (ยังไม่พร้อมนับใหม่) แล้วขึ้นเต็มอีก
      add(c.reps === 1, "[7c] ยังไม่ได้กลับลงพอ ขึ้นเต็มอีกก็ยังไม่นับเพิ่ม", "นับ " + c.reps);
      const d = run([[0, 1], [1, 1], [0.2, 1], [1, 1]]);
      add(d.reps === 2, "[7c] กลับลงมาพอ แล้วขึ้นเต็มอีกครั้ง นับเพิ่มเป็น 2", "นับ " + d.reps);
      const e = run([[0, 1], [0.7, 1.5]]); // ขึ้นไปไม่ถึงเป้าหมาย
      add(e.reps === 0, "[7c] หลอดยังไม่เต็ม ไม่นับ", "นับ " + e.reps);
    });

    // [8] ลดสั่นของ 1.3
    guard("[8] 1.3", () => {
      const tr = new MR.JointTracker(0.5), lm1 = MR.poseFromAngles({}, []), lm2 = lm1.map((p) => ({ x: p.x + 0.1, y: p.y, z: 0, visibility: 0.99 }));
      tr.update(MR.detect(lm1, []), [H, W]); const j = tr.update(MR.detect(lm2, []), [H, W]);
      add(Math.abs(j.left_shoulder.px - (lm1[11].x * W + 0.05 * W)) < 1e-6, "[8] 1.3 ลดอาการสั่น: ตำแหน่งใหม่ถ่วงกับตำแหน่งเดิม ครึ่งต่อครึ่ง");
      add(Math.abs(j.mid_shoulder.px - (j.left_shoulder.px + j.right_shoulder.px) / 2) < 1e-6 && Math.abs(j.below_mid_hip.py - j.mid_hip.py - 100) < 1e-6, "[8] 1.3 สร้างข้อต่อเสมือน (กึ่งกลางไหล่/สะโพก/ใต้สะโพก)");
    });

    // [9] ระบบ 2
    guard("[9] ระบบ 2", () => {
      const mem = {}; const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = v) };
      const store = new S2.Store(storage, null);
      add(store.poses.length === 10, "[9] ระบบ 2: ท่าตัวอย่างเริ่มต้น 10 ท่า (ออกกำลังกายพื้นฐาน)", store.poses.length + " ท่า");
      add(store.poses.every((p) => S2.JOINTS.every((k) => p.joints[k][0] >= 0.01 && p.joints[k][0] <= 0.99 && p.joints[k][1] >= 0.01 && p.joints[k][1] <= 0.99)), "[9] ระบบ 2: ทุกท่าอยู่ในกรอบภาพ");
      const p = store.add("ท่าทดสอบ", "ทั้งตัว", "ขั้นที่ 1\nขั้นที่ 2", S2.neutral());
      add(store.get(p.id) && store.findByName("ท่าทดสอบ"), "[9] 4.2 บันทึกเป็นท่าใหม่ / ค้นหาตามชื่อ");
      store.overwrite(p.id, "ท่าทดสอบ 2", "คอ", "x", S2.neutral()); add(store.get(p.id).name === "ท่าทดสอบ 2", "[9] 4.2 บันทึกทับท่าที่เลือก");
      const again = new S2.Store(storage, null); add(again.get(p.id) && again.poses.length === 11, "[9] ข้อมูลที่บันทึกยังอยู่หลังเปิดใหม่");
      store.updateSettings(p.id, 5, 3, 2, 4);
      const tl = S2.buildTimeline(store, [p.id]);
      add(tl.length === 5 * 2 * 3 + 1 && tl.filter((s) => s.kind === "rest").length === 1 && S2.estimate(store, [p.id]) === 2 * 5 * (2 * S2.MOVE + 3) + 4, "[9] 4.4 ไทม์ไลน์: 5 ครั้ง × 2 เซ็ต ค้าง 3 วิ พัก 4 วิ", S2.fmtDuration(S2.estimate(store, [p.id])));
      store.delete(p.id); add(!store.get(p.id), "[9] 4.2 ลบท่า");
      const J = S2.neutral(), mj = S2.mirrorJoints(S2.mirrorJoints(J));
      add(S2.JOINTS.every((k) => Math.abs(mj[k][0] - J[k][0]) < 1e-9), "[9] 4.2 สลับซ้าย↔ขวา สองครั้งกลับเป็นท่าเดิม");
      const L0 = Math.hypot(J.l_elbow[0] - J.l_shoulder[0], J.l_elbow[1] - J.l_shoulder[1]);
      const d = S2.dragJoint(J, "l_elbow", [J.l_shoulder[0] - 0.1, J.l_shoulder[1] - 0.1], true);
      const L1 = Math.hypot(d.joints.l_elbow[0] - d.joints.l_shoulder[0], d.joints.l_elbow[1] - d.joints.l_shoulder[1]);
      add(d && Math.abs(L0 - L1) < 1e-9 && S2.dragJoint(J, "hip", [2, 2], false) === null, "[9] 4.2 ลากข้อต่อ: ความยาวกระดูกคงที่ / ห้ามลากออกนอกกรอบ");
    });
    return rows;
  }

  const api = { runAll, runPipeline, playWithRunner };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MRTests = api;
})(typeof self !== "undefined" ? self : this);
