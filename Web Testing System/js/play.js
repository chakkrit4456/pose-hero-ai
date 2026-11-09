/* play.js - ระบบ 1 ฉบับเว็บ: ทำงานเหมือน main.py (WorkoutApp)
 *   เลือกท่า -> นับถอยหลังเมื่อผู้เล่นอยู่ในกรอบ -> ทำท่า (นับครั้ง/ให้คะแนนสด) -> พัก -> ท่าถัดไป -> สรุปผล
 * แหล่งภาพเลือกได้: กล้องจริง (MediaPipe) หรือคนจำลองที่ขยับตามนิยามท่าใน exercises.json
 * ทั้งสองแบบส่งจุด 33 จุดเข้าสายเดียวกัน: detect(1.2) -> JointTracker(1.3) -> PoseAnalyzer(1.4) -> PoseEvaluator(1.5) */
(function (root) {
  "use strict";
  const MR = root.MR, $ = (id) => document.getElementById(id);
  const P = (root.MRPlay = { run: null, exercises: [], cam: new root.MRCam.CameraSource() });

  const say = (t) => { $("play-msg").textContent = t || ""; };
  const setBtns = (running) => { $("play-start").disabled = running; $("play-skip").disabled = !running; $("play-stop").disabled = !running; };
  const mode = () => document.querySelector("input[name=play-mode]:checked").value;

  // ---------------------------------------------------------------- รายการท่า
  P.setExercises = function (list) {
    P.stop(true); P.exercises = list;
    const box = $("play-list"); box.innerHTML = "";
    list.forEach((ex) => {
      const lab = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.value = ex.id;
      const amount = ex.reps ? `${ex.reps} ครั้ง` : `${ex.duration_sec} วินาที`;
      lab.onmouseenter = lab.onclick = () => { P.previewEx = ex; };
      lab.append(cb, document.createTextNode(` ${ex.name} (${(ex.counter.mode === "hold" ? `ค้าง ${ex.counter.hold_sec} วิ × ` : "") + amount} · พัก ${ex.rest_sec || 0} วิ)`));
      box.appendChild(lab);
    });
    if (!list.length) box.textContent = 'ไม่มีท่าที่ใช้ได้ — ดูแท็บ "ข้อมูล / ตั้งค่า"';
    const other = $("sim-other"); other.innerHTML = ""; other.add(new Option("(ทำตามท่าที่กำลังเล่น)", ""));
    list.forEach((ex) => other.add(new Option(ex.name, ex.id)));
    fillAngles(list[0]); P.previewEx = list[0] || null;
    $("play-steps").textContent = ""; clearView(); $("play-title").textContent = "เลือกท่า แล้วกด ▶ เริ่มเล่น";
  };
  function fillAngles(ex) {
    const sel = $("sim-err"), keep = sel.value; sel.innerHTML = ""; sel.add(new Option("(ไม่ใส่ความผิดพลาด)", ""));
    if (ex) Object.keys(ex.angles).forEach((a) => sel.add(new Option(a, a)));
    sel.value = Array.from(sel.options).some((o) => o.value === keep) ? keep : "";
  }
  const chosen = () => {
    const ids = Array.from(document.querySelectorAll("#play-list input:checked")).map((i) => i.value);
    return P.exercises.filter((x) => ids.includes(x.id));
  };
  function clearView() {
    const ov = $("play-ov"); ov.getContext("2d").clearRect(0, 0, ov.width, ov.height);
    ["play-ovmsg", "play-live", "play-reps-l", "play-hold", "play-last", "play-angles"].forEach((id) => ($(id).textContent = ""));
    $("play-bar").style.width = "0"; $("play-ovmsg").classList.remove("top");
  }

  // ---------------------------------------------------------------- เริ่ม / หยุด
  P.start = async function () {
    endRun(); stopTest();
    const list = chosen();
    if (!list.length) { alert("เลือกท่าอย่างน้อย 1 ท่า"); return; }
    const s = (P.run = { list, mode: mode(), i: 0, results: [], over: Math.max(0, +$("play-reps").value || 0), phase: "idle", timer: 0, raf: 0, acc: 0 });
    $("play-out").textContent = ""; setBtns(true); clearView(); say("");
    $("play-vid").classList.toggle("sim", s.mode !== "cam"); $("sim-box").style.opacity = s.mode === "sim" ? 1 : 0.5;
    if (s.mode === "cam") {
      try {
        say("กำลังเตรียมโมเดลและกล้อง…");
        if (!P.cam.hasEmbeddedModel()) { say("ยังไม่ได้ฝังโมเดล — รัน Prepare Web Test Files.bat หรือเลือกคนจำลอง"); P.stop(true); return; }
        await P.cam.prepareModel();
        if (P.run !== s) return;
        if (!P.cam.isOpen()) await openCamera(); // ยังไม่ได้เปิดกล้องเอง: เปิดให้ (เหมือน select_camera ของ 1.1)
        if (P.run !== s) { P.cam.close(); camUi(); return; }
        $("play-vid").classList.remove("sim"); const [w, h] = P.cam.size(); $("play-vid").style.aspectRatio = `${w} / ${h}`; say("");
      } catch (e) {
        say("เปิดกล้องไม่ได้: " + (e.name === "NotAllowedError" ? "ยังไม่ได้อนุญาตกล้อง" : e.message)); P.stop(true); return;
      }
    } else $("play-vid").style.aspectRatio = "16 / 9";
    begin(s);
  };

  function endRun() {
    const s = P.run; P.run = null;
    if (s) { clearInterval(s.timer); cancelAnimationFrame(s.raf); }
    return s;
  }
  P.stop = function (silent) {
    const s = endRun(); stopTest();
    P.cam.close(); camUi(); setBtns(false);
    if (s && !silent) say("ออกจากโปรแกรมตามที่ผู้เล่นสั่ง");
  };

  // ---------------------------------------------------------------- ระบบ 1.1 : ค้นหา / เลือก / เปิด / ปิดกล้อง / ทดสอบ
  const camMsg = (t) => { $("cam-status").textContent = t; };
  function camUi() {
    const open = P.cam.isOpen();
    $("cam-open").disabled = open; $("cam-close").disabled = !open; $("cam-test").disabled = !open; $("cam-body").disabled = !open;
    $("cam-find").disabled = false;
    if (!open && !P.run) $("play-vid").classList.add("sim");
    camMsg(open ? `เปิดกล้องสำเร็จ: ${P.cam.label || "กล้อง"} (${P.cam.size().join("×")})` : "ยังไม่ได้เปิดกล้อง");
  }
  async function findCameras() {
    camMsg("กำลังค้นหากล้อง…");
    try {
      const list = await P.cam.detect(), sel = $("cam-select"); sel.innerHTML = "";
      list.forEach((c, i) => sel.add(new Option(`${i} : ${c.name}`, c.id)));
      if (!list.length) { sel.add(new Option("(ไม่พบกล้อง)", "")); camMsg("ไม่พบกล้องที่ใช้งานได้"); return; }
      camMsg(`พบกล้อง ${list.length} ตัว` + (list.length > 1 ? " เลือกหมายเลขกล้องแล้วกด เปิดกล้อง" : ""));
    } catch (e) { camMsg("ค้นหากล้องไม่ได้: " + (e.name === "NotAllowedError" ? "ยังไม่ได้อนุญาตกล้อง (Windows/เบราว์เซอร์ต้องอนุญาตให้ใช้กล้อง)" : e.message)); }
  }
  async function openCamera() {
    P.cam.setMirror($("cam-mirror").checked); camMsg("กำลังเปิดกล้อง… (ถ้าเบราว์เซอร์ถามสิทธิ์ ให้กดอนุญาต)");
    try { await P.cam.open($("play-video"), $("cam-select").value); }
    catch (e) {
      camUi();
      const m = e.name === "NotAllowedError" ? "ยังไม่ได้อนุญาตกล้อง" : e.name === "NotReadableError" ? "เปิดกล้องไม่ได้ อาจมี Zoom/Line/Teams ใช้กล้องอยู่" : e.message;
      camMsg("เปิดกล้องไม่ได้: " + m); throw e;
    }
    $("play-vid").classList.remove("sim"); const [w, h] = P.cam.size(); $("play-vid").style.aspectRatio = `${w} / ${h}`; camUi();
    if (!$("cam-select").value && P.cam.stream) { // หลังได้สิทธิ์แล้ว เติมรายชื่อกล้องให้เลือก
      try { const l = await P.cam.detect(); if (l.length > 1 && $("cam-select").options.length <= 1) { l.forEach((c, i) => $("cam-select").add(new Option(`${i} : ${c.name}`, c.id))); } } catch (e) { /* ข้าม */ }
    }
  }
  let test = null;
  function stopTest() { if (test) { cancelAnimationFrame(test.raf); test = null; const ov = $("play-ov"); ov.getContext("2d").clearRect(0, 0, ov.width, ov.height); $("play-ovmsg").textContent = ""; } }
  /** ทดสอบรับภาพ (show_camera ของ 1.1) / ทดสอบตรวจจับร่างกาย (BodyDetectionSystem.run ของ 1.2) */
  async function camTest(kind) {
    if (P.run) { alert("กำลังเล่นอยู่ กด ออก (q) ก่อน"); return; }
    stopTest(); if (!P.cam.isOpen()) return;
    const t = (test = { kind, raf: 0, fps: 0, prev: performance.now() });
    $("play-title").textContent = kind === "camera" ? "ทดสอบรับภาพจากกล้อง (1.1)" : "ทดสอบ AI ตรวจจับร่างกาย (1.2)";
    $("play-vid").classList.remove("sim"); $("play-ovmsg").style.color = "#8bf29b";
    if (kind === "body") {
      camMsg("กำลังโหลดโมเดล…");
      try { if (!P.cam.hasEmbeddedModel()) { camMsg("ยังไม่ได้ฝังโมเดล — รัน Prepare Web Test Files.bat"); stopTest(); return; } await P.cam.prepareModel(); } catch (e) { camMsg("โหลดโมเดลไม่ได้: " + e.message); stopTest(); return; }
      camUi();
    }
    const loop = () => {
      if (test !== t) return; t.raf = requestAnimationFrame(loop);
      const [w, h] = P.cam.size(), ov = $("play-ov"); if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
      const g = ov.getContext("2d"); g.clearRect(0, 0, w, h);
      if (kind === "camera") { $("play-ovmsg").textContent = "CAMERA TEST"; return; }
      const lm = P.cam.read(); if (lm === undefined) return;
      const now = performance.now(), inst = 1000 / Math.max(1, now - t.prev); t.prev = now; t.fps = t.fps ? t.fps * 0.8 + inst * 0.2 : inst;
      MR.drawBodySkeleton(g, MR.detect(lm, []), w, h, t.fps); // วาดแบบเดียวกับ 1.2 process_frame
      $("play-ovmsg").textContent = "";
    };
    loop();
  }

  P.skip = function () {
    const s = P.run; if (!s) return;
    if (s.phase === "rest") { clearInterval(s.timer); begin(s); return; }
    if (s.phase === "demo") { clearInterval(s.timer); startPlay(s); return; }
    if (s.phase === "play") { s.runner.skip(); finish(s); }
  };

  // ---------------------------------------------------------------- เล่นทีละท่า
  /** เริ่มท่าใหม่: แสดงแอนิเมชันท่าตัวอย่างก่อน (ค่าเริ่มต้น 10 วินาที) แล้วจึงเข้าสู่ขั้นนับถอยหลัง/ทำท่า */
  function begin(s) {
    const ex = s.list[s.i];
    s.ex = ex; s.log = []; P.previewEx = ex; clearView(); say("");
    $("play-title").textContent = `ท่าที่ ${s.i + 1} / ${s.list.length}: ${ex.name}`;
    $("play-steps").textContent = (ex.steps || [ex.description || ""]).map((t, i) => `${i + 1}. ${t}`).join("\n") +
      (ex.precautions && ex.precautions.length ? "\n\nข้อควรระวัง: " + ex.precautions.join(" / ") : "");
    fillAngles(ex);
    const secs = Math.max(0, +$("play-demo-sec").value || 0);
    if (!secs) return startPlay(s);
    s.phase = "demo"; $("play-vid").style.aspectRatio = "16 / 9"; $("play-ovmsg").classList.add("top");
    const t0 = performance.now();
    const tick = () => {
      if (P.run !== s || s.phase !== "demo") return;
      const el = (performance.now() - t0) / 1000, left = secs - el;
      if (left <= 0) { clearInterval(s.timer); startPlay(s); return; }
      const ov = $("play-ov"); if (ov.width !== 1280 || ov.height !== 720) { ov.width = 1280; ov.height = 720; }
      drawDemo(ov.getContext("2d"), 1280, 720, 720 / 540, ex, el, 1.2);
      $("play-ovmsg").style.color = "#ffe066";
      $("play-ovmsg").textContent = `ดูท่าตัวอย่าง: ${ex.name}\nเริ่มใน ${Math.ceil(left)} วินาที (กด n เพื่อข้าม)`;
      $("play-bar").style.width = (100 * el / secs) + "%";
    };
    tick(); s.timer = setInterval(tick, 33);
  }

  function startPlay(s) {
    const ex = s.ex, reps = s.over > 0 && ex.reps > 0 ? s.over : parseInt(ex.reps || 0, 10);
    s.phase = "play"; s.runner = new MR.WorkoutRunner(ex, { reps }); s.acc = 0;
    clearView(); $("play-ovmsg").classList.remove("top");
    if (s.mode === "cam") { const [w, h] = P.cam.size(); $("play-vid").style.aspectRatio = `${w} / ${h}`; }
    if (s.mode === "sim") {
      s.person = new MR.SimPerson(ex);
      s.timer = setInterval(() => simTick(s), 33);
    } else cameraLoop(s);
  }

  function simTick(s) {
    if (P.run !== s || s.phase !== "play") return;
    const o = s.person.opts, ang = $("sim-err").value, deg = +$("sim-deg").value, hide = $("sim-hide").value, otherId = $("sim-other").value;
    o.errors = ang && deg ? { [ang]: deg } : {};
    o.still = $("sim-still").checked; o.noBody = $("sim-nobody").checked;
    o.hidden = hide === "ankle" ? ["left_ankle", "right_ankle"] : hide ? [hide] : [];
    o.other = otherId ? P.exercises.find((x) => x.id === otherId) : null;
    s.acc += +$("play-speed").value;
    let st = null, n = Math.floor(s.acc); s.acc -= n;
    while (n-- > 0 && !(st && st.finished)) {
      const f = s.person.next(s.runner.stage);
      st = s.runner.step(f.lm, f.now, MR.SIM_W, MR.SIM_H); s.now = f.now;
    }
    if (st) handle(s, st, MR.SIM_W, MR.SIM_H);
  }

  function cameraLoop(s) {
    if (P.run !== s || s.phase !== "play") return;
    s.raf = requestAnimationFrame(() => cameraLoop(s));
    const lm = P.cam.read(); if (lm === undefined) return;
    const [w, h] = P.cam.size(), now = performance.now() / 1000; s.now = now;
    handle(s, s.runner.step(lm, now, w, h), w, h);
  }

  function handle(s, st, W, H) {
    render(s, st, W, H);
    if (st.finished) finish(s);
  }

  // ---------------------------------------------------------------- วาดหน้าจอ (เหมือนส่วน "วาดภาพ" ของ main.py)
  function render(s, st, W, H) {
    const ov = $("play-ov"); if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
    const g = ov.getContext("2d");
    if (s.mode === "sim") {
      g.fillStyle = "#101418"; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H / 2); g.scale(1.35, 1.35); g.translate(-W / 2, -H * 0.444); // ขยายภาพเฉพาะการแสดงผล (ตัวเลขที่วัดไม่เปลี่ยน)
      const grey = { line: "rgba(150,160,175,.5)", dot: "rgba(150,160,175,.5)", neck: "rgba(150,160,175,.5)", edge: "rgba(150,160,175,.5)", head: "rgba(150,160,175,.5)" };
      MR.drawPlayerSkeleton(g, MR.ghostJoints(s.person.ghost(), W, H), st.required, 1.2, grey); // เงาท่าเป้าหมาย
      MR.drawPlayerSkeleton(g, st.joints, st.required, 1.2); g.restore();
    } else { g.clearRect(0, 0, W, H); MR.drawPlayerSkeleton(g, st.joints, st.required, Math.max(1, W / 640)); }

    const ex = s.ex, a = st.analysis;
    let m = "";
    if (st.stage === "ready") m = st.countdown ? `${st.countdown}\nเตรียมตัว ยืนในท่าเริ่มต้น` : st.message;
    else if (!st.inView) m = st.message;
    else if (st.hold && a.hold_time > 0) m = a.holding === false ? `กลับเข้าท่าเพื่อค้างต่อ (เวลาค้าง ${a.hold_time.toFixed(1)} กำลังลด)` : `ค้างไว้ ${a.hold_time.toFixed(1)} / ${st.hold.toFixed(0)} วินาที`;
    $("play-ovmsg").textContent = m;
    $("play-ovmsg").style.color = st.stage === "ready" && st.countdown ? "#ffe066" : !st.inView ? "#ff8a80" : a.holding === false && a.hold_time > 0 ? "#ffe066" : "#8bf29b";
    $("play-bar").style.width = Math.round((a.valid ? a.progress : 0) * 100) + "%";
    $("play-reps-l").textContent = st.targetReps ? `จำนวนครั้ง ${st.reps} / ${st.targetReps}` : `ทำแล้ว ${st.reps} ครั้ง`;
    $("play-hold").textContent = st.hold && a.hold_time > 0 ? `ค้าง ${a.hold_time.toFixed(1)} / ${st.hold.toFixed(0)} วินาที` : "";
    const ev = st.evaluation, live = $("play-live");
    if (ev && ev.live_feedback.length) { live.textContent = ev.live_feedback.join(" / "); live.className = "big warn"; }
    else if (ev && ev.live_score != null) { live.textContent = `ท่าทางดี (${ev.live_score} คะแนน)`; live.className = "big ok"; }
    else live.textContent = "";
    const last = st.lastRep;
    $("play-last").textContent = last && s.now - last.at < 4 ? last.text : "";
    if (last && last !== s.logged) { s.logged = last; s.log.push(last.text); }
    $("play-angles").textContent = a.angles ? Object.keys(a.angles).map((k) => `${k}: ${a.angles[k] == null ? "-" : a.angles[k].toFixed(1) + "°"}`).join("\n") : "";
    const L = s.results.map(resultLine).concat(s.log.slice(-8));
    $("play-out").textContent = L.join("\n");
  }
  const resultLine = (r) => `${r.skipped ? "(ข้าม) " : ""}${r.name}: ${r.reps_done}/${r.target_reps || "-"} ครั้ง · ` + (r.average == null ? "ไม่มีคะแนน" : `${r.average} คะแนน (${r.grade})`);

  // ---------------------------------------------------------------- จบท่า / พัก / สรุป
  function finish(s) {
    if (P.run !== s || s.phase !== "play") return;
    clearInterval(s.timer); cancelAnimationFrame(s.raf); s.phase = "between";
    s.results.push(s.runner.result());
    const prev = s.ex; s.i++;
    if (s.i >= s.list.length) return summary(s);
    rest(s, prev);
  }

  function rest(s, prev) {
    const next = s.list[s.i], speed = s.mode === "sim" ? +$("play-speed").value : 1, seconds = (+prev.rest_sec || 0) / speed;
    if (seconds <= 0) { begin(s); return; }
    s.phase = "rest"; clearView(); $("play-out").textContent = s.results.map(resultLine).join("\n");
    const end = Date.now() + seconds * 1000, ov = $("play-ov");
    const tick = () => {
      const left = (end - Date.now()) / 1000;
      if (left <= 0) { clearInterval(s.timer); begin(s); return; }
      ov.getContext("2d").clearRect(0, 0, ov.width, ov.height);
      $("play-ovmsg").style.color = "#fff"; $("play-ovmsg").textContent = `พักผ่อน\n${Math.floor(left) + 1}\nท่าถัดไป: ${next.name}`;
      say('กด "ข้าม (n)" เพื่อข้ามช่วงพัก');
    };
    tick(); s.timer = setInterval(tick, 200);
  }

  function summary(s) {
    s.phase = "summary"; P.cam.close(); camUi(); setBtns(false); clearView(); say("");
    const overall = MR.overallScore(s.results);
    const L = ["==== สรุปผลการออกกำลังกาย ===="];
    s.results.forEach((r) => { L.push(resultLine(r)); if (r.advice.length) L.push("   ข้อแนะนำ: " + r.advice[0]); });
    L.push("", overall == null ? "ไม่มีคะแนนรวม" : `คะแนนรวม ${overall} (${MR.gradeFor(overall)})`);
    $("play-out").textContent = L.join("\n"); $("play-title").textContent = "จบแล้ว เก่งมาก!";
    P.lastSession = { results: s.results, overall };
    P.run = null;
  }

  // ---------------------------------------------------------------- ปุ่ม
  $("cam-find").onclick = findCameras; $("cam-open").onclick = () => openCamera().catch(() => {});
  $("cam-close").onclick = () => { stopTest(); P.cam.close(); camUi(); };
  $("cam-smooth").onchange = () => P.cam.setSmooth($("cam-smooth").checked);
  $("cam-mirror").onchange = () => P.cam.setMirror($("cam-mirror").checked);
  $("cam-test").onclick = () => camTest("camera"); $("cam-body").onclick = () => camTest("body");
  camUi();
  $("play-start").onclick = P.start; $("play-skip").onclick = P.skip; $("play-stop").onclick = () => P.stop();
  $("play-all").onclick = () => document.querySelectorAll("#play-list input").forEach((c) => (c.checked = true));
  $("play-none").onclick = () => document.querySelectorAll("#play-list input").forEach((c) => (c.checked = false));
  $("sim-deg").oninput = () => ($("sim-deg-v").textContent = $("sim-deg").value);
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("tab-play").hidden || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) return;
    if (e.key === "n") P.skip(); else if (e.key === "q" || e.key === "Escape") P.stop();
  });
  // ---------------------------------------------------------------- แอนิเมชันตัวอย่างท่า (หน้าเลือกท่า / ก่อนเริ่มแต่ละท่า)
  /** วาดคนจำลองทำท่า ex ณ เวลา t ลงพื้นหลังสีเข้ม  k = ตัวขยาย  */
  function drawDemo(g, cw, ch, k, ex, t, sc) {
    g.fillStyle = "#101418"; g.fillRect(0, 0, cw, ch);
    g.save(); g.translate(cw / 2, ch / 2); g.scale(k, k); g.translate(-MR.SIM_W / 2, -320);
    const lm = MR.poseFromAngles(MR.anglesFor(ex, MR.demoPhi(ex, t), {}), []);
    MR.drawPlayerSkeleton(g, MR.ghostJoints(lm, MR.SIM_W, MR.SIM_H), MR.requiredJoints(ex), sc); g.restore();
  }
  function previewLoop() {
    requestAnimationFrame(previewLoop);
    if ($("tab-play").hidden) return;
    const s = P.run, ex = (s && s.ex) || P.previewEx; if (!ex) return;
    const t = performance.now() / 1000, cv = $("play-demo");
    drawDemo(cv.getContext("2d"), cv.width, cv.height, cv.height / 540, ex, t, 1.3);
    $("play-demo-name").textContent = ex.name;
    if (!s && !test && !P.cam.isOpen()) { // ยังไม่เล่น/ไม่มีกล้อง: ใช้พื้นที่กลางจอแสดงตัวอย่างท่าด้วย
      const ov = $("play-ov"); if (ov.width !== 1280 || ov.height !== 720) { ov.width = 1280; ov.height = 720; }
      drawDemo(ov.getContext("2d"), 1280, 720, 720 / 540, ex, t, 1.2);
    }
  }
  previewLoop();
  setBtns(false);
  $("play-hint").textContent = "ปุ่มลัด: n = ข้ามท่า/ข้ามช่วงพัก · q หรือ Esc = ออก (เหมือน main.py)";
})(typeof self !== "undefined" ? self : this);
