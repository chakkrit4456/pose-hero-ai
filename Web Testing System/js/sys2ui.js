/* sys2ui.js - หน้าจอระบบ 2 ฉบับเว็บ (ย้ายจาก 4.1 - 4.4 และ main.py ของระบบ 2)
 *   4.1 รายการท่า  4.2 สร้าง/แก้ไขท่า  4.3 รายละเอียด/ทำตามท่า  4.4 ตั้งค่าจำนวนครั้งและเวลา/ฝึกตามเวลา
 * ทั้ง 4 หน้าใช้ที่เก็บท่าเดียวกัน (S2.store) และคุยกันผ่าน S2.bus เหมือนฉบับ Python */
(function (root) {
  "use strict";
  const S2 = root.S2, bus = S2.bus;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") el.className = attrs[k]; else if (k.startsWith("on")) el[k] = attrs[k]; else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  const pick = (list, id) => list.find((p) => p.id === id);
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const visible = (el) => !el.closest("section").hidden;
  function goto(key) { bus.emit("goto", key); }

  // ================================================================ 4.1 รายการท่า
  function mount41(el, store) {
    let selId = null;
    const q = h("input", { type: "search", placeholder: "ค้นหาชื่อหรือวิธีทำ" }), cat = h("select");
    const tbody = h("tbody"), cv = h("canvas", { class: "fig", width: 300, height: 300, style: "max-width:380px" }), title = h("div", { class: "big" }), count = h("div", { class: "mut" });
    const visibleList = () => {
      const t = q.value.trim().toLowerCase(), c = cat.value;
      return store.poses.filter((p) => (c === "ทั้งหมด" || p.category === c) && (!t || p.name.toLowerCase().includes(t) || p.description.toLowerCase().includes(t)));
    };
    function refresh() {
      const keep = cat.value || "ทั้งหมด";
      cat.innerHTML = ""; ["ทั้งหมด"].concat(store.categories()).forEach((c) => cat.add(new Option(c, c))); cat.value = ["ทั้งหมด"].concat(store.categories()).includes(keep) ? keep : "ทั้งหมด";
      const vis = visibleList(); tbody.innerHTML = "";
      vis.forEach((p) => tbody.append(h("tr", { "data-id": p.id, onclick: () => select(p.id), ondblclick: () => { select(p.id); detail(); } },
        h("td", { text: p.name }), h("td", { text: p.category }), h("td", { text: `${p.reps} ครั้ง × ${p.sets} เซ็ต` }), h("td", { text: `${p.hold} วิ` }))));
      count.textContent = `แสดง ${vis.length} จาก ${store.poses.length} ท่า`;
      if (selId && vis.some((p) => p.id === selId)) select(selId, true); else if (vis.length) select(vis[0].id, true); else { selId = null; cv.getContext("2d").clearRect(0, 0, 300, 300); title.textContent = ""; }
    }
    function select(id, quiet) {
      selId = id; const p = store.get(id);
      tbody.querySelectorAll("tr").forEach((r) => r.classList.toggle("sel", r.dataset.id === id));
      cv.getContext("2d").clearRect(0, 0, 300, 300);
      if (p) { S2.drawPose(cv, p.joints, { color: cssv("--acc") }); title.textContent = p.name; if (!quiet) bus.emit("select", id); }
    }
    const detail = () => { if (selId) { bus.emit("select", selId); goto("detail"); } };
    const btn = (t, fn) => h("button", { class: "btn", style: "width:100%", onclick: fn, text: t });
    q.oninput = refresh; cat.onchange = refresh;
    el.append(
      h("div", { class: "row" }, h("label", { text: "ค้นหา " }, q), h("label", { text: "หมวด " }, cat)),
      h("div", { class: "grid2", style: "margin-top:10px" },
        h("div", { style: "overflow:auto;max-height:480px" }, h("table", { class: "pick" }, h("thead", {}, h("tr", {}, h("th", { text: "ชื่อท่า" }), h("th", { text: "หมวด" }), h("th", { text: "จำนวน" }), h("th", { text: "ค้าง" }))), tbody)),
        h("div", {}, cv, title,
          btn("ดูรายละเอียด / ทำตามท่า", detail),
          btn("แก้ไขท่านี้", () => { if (selId) { bus.emit("edit_pose", selId); goto("edit"); } }),
          btn("ฝึกท่านี้ (ตั้งเวลา)", () => { if (selId) { bus.emit("start_routine", [selId]); goto("settings"); } }),
          btn("ฝึกทุกท่าที่แสดงอยู่", () => { const ids = visibleList().map((p) => p.id); if (ids.length) { bus.emit("start_routine", ids); goto("settings"); } }))),
      count);
    bus.on("changed", refresh); refresh();
  }

  // ================================================================ 4.2 สร้าง/แก้ไขท่า
  function mount42(el, store) {
    let curId = null, joints = S2.neutral(), drag = null, active = null;
    const list = h("div", { class: "list", style: "max-height:520px;min-width:230px" });
    const cv = h("canvas", { class: "fig", width: 460, height: 460, style: "touch-action:none;max-width:460px" });
    const info = h("div", { class: "mut", text: "ลากจุดเพื่อหมุนข้อต่อ • จุดแดง(สะโพก) = เลื่อนทั้งตัว" });
    const snap = h("input", { type: "checkbox", checked: "" });
    const name = h("input", { type: "text", style: "width:100%" }), cat = h("input", { type: "text", list: "s42-cats", style: "width:100%", value: S2.CATEGORIES[S2.CATEGORIES.length - 1] });
    const datalist = h("datalist", { id: "s42-cats" }), desc = h("textarea", { rows: 8, style: "width:100%;font:inherit" });
    const status = h("div", { class: "ok", style: "min-height:1.5em" });
    const redraw = () => { cv.getContext("2d").clearRect(0, 0, 460, 460); S2.drawPose(cv, joints, { color: cssv("--acc"), handles: true, active }); };

    function refresh() {
      list.innerHTML = "";
      store.poses.forEach((p) => list.append(h("button", { "aria-pressed": String(p.id === curId), onclick: () => loadId(p.id) }, p.name, h("span", { class: "mut", text: "  · " + p.category }))));
      datalist.innerHTML = ""; store.categories().forEach((c) => datalist.append(h("option", { value: c })));
      if (curId && !store.get(curId)) curId = null;
    }
    function loadId(id) {
      const p = store.get(id); if (!p) return;
      curId = id; joints = JSON.parse(JSON.stringify(p.joints)); name.value = p.name; cat.value = p.category; desc.value = p.description;
      status.textContent = `กำลังแก้ไข: ${p.name}`; refresh(); redraw();
    }
    function nearest(x, y) {
      let best = null, bd = 18;
      S2.JOINTS.forEach((k) => { const [px, py] = S2.toPx(joints[k], 460, 460), d = Math.hypot(px - x, py - y); if (d < bd) { best = k; bd = d; } });
      return best;
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 460 / r.width, (e.clientY - r.top) * 460 / r.height]; };
    cv.onpointerdown = (e) => { const [x, y] = pos(e); drag = nearest(x, y); active = drag; if (drag) cv.setPointerCapture(e.pointerId); redraw(); };
    cv.onpointermove = (e) => {
      if (!drag) return; const [x, y] = pos(e);
      const r = S2.dragJoint(joints, drag, S2.fromPx(x, y, 460, 460), snap.checked);
      if (r) { joints = r.joints; info.textContent = r.msg; redraw(); }
    };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; active = null; redraw(); };

    const form = () => {
      const n = name.value.trim(); if (!n) { alert("กรุณาตั้งชื่อท่าก่อนบันทึก"); return null; }
      return [n, cat.value.trim() || S2.CATEGORIES[S2.CATEGORIES.length - 1], desc.value.trim(), joints];
    };
    function newPose() { curId = null; joints = S2.neutral(); name.value = ""; desc.value = ""; status.textContent = "ท่าใหม่ (ยังไม่ได้บันทึก)"; refresh(); redraw(); }
    function saveNew() {
      const f = form(); if (!f) return;
      const dup = store.findByName(f[0]);
      if (dup) {
        if (confirm(`มีท่า "${dup.name}" อยู่แล้ว\n\nตกลง = บันทึกทับท่าเดิม\nยกเลิก = ไปเลือกต่อ`)) {
          const p = store.overwrite(dup.id, ...f); curId = p.id; status.textContent = `บันทึกทับ "${p.name}" แล้ว`; return;
        }
        if (!confirm("เพิ่มเป็นท่าใหม่อีกท่าที่ชื่อซ้ำหรือไม่?\n\nตกลง = เพิ่ม  ยกเลิก = ไม่บันทึก")) return;
      }
      const p = store.add(...f); curId = p.id; refresh(); status.textContent = `เพิ่มท่าใหม่ "${p.name}" แล้ว`;
    }
    function saveOver() {
      if (!curId || !store.get(curId)) { alert('เลือกท่าจากรายการด้านซ้ายก่อน หรือใช้ "บันทึกเป็นท่าใหม่"'); return; }
      const f = form(); if (!f) return;
      if (confirm(`บันทึกทับท่า "${store.get(curId).name}" ด้วยท่าที่กำลังแก้ไข?`)) { const p = store.overwrite(curId, ...f); status.textContent = `บันทึกทับ "${p.name}" แล้ว`; }
    }
    function del() {
      const p = curId && store.get(curId); if (!p) return;
      if (confirm(`ลบท่า "${p.name}" ?`)) { store.delete(p.id); newPose(); status.textContent = "ลบท่าแล้ว"; }
    }
    const B = (t, fn, pri) => h("button", { class: "btn" + (pri ? " pri" : ""), style: "width:100%;margin-top:4px", onclick: fn, text: t });
    el.append(h("div", { class: "grid3" },
      h("div", {}, h("h2", { text: "ท่าทั้งหมด" }), list),
      h("div", {}, cv, info, h("label", {}, snap, " ล็อกมุมทีละ 5° (ทำซ้ำให้ตรงเป๊ะ)"), h("div", { class: "mut", text: "ภาพแบบส่องกระจก: ซ้ายของจอ = ซ้ายของผู้ทำท่า" })),
      h("div", {}, h("h2", { text: "ชื่อท่า" }), name, h("h2", { text: "หมวด", style: "margin-top:8px" }), cat, datalist,
        h("h2", { text: "วิธีทำ (หนึ่งบรรทัด = หนึ่งขั้นตอน)", style: "margin-top:8px" }), desc, status,
        B("＋ ท่าใหม่ (เริ่มจากท่ายืนตรง)", newPose),
        B("คัดลอกท่านี้เป็นฉบับร่าง", () => { const o = name.value.trim(); curId = null; name.value = o ? o + " (สำเนา)" : ""; status.textContent = "ฉบับร่างจากสำเนา (ยังไม่ได้บันทึก)"; refresh(); }),
        B("สลับซ้าย ↔ ขวา", () => { joints = S2.mirrorJoints(joints); redraw(); }),
        B("รีเซ็ตเป็นท่ายืนตรง", () => { joints = S2.neutral(); redraw(); }),
        B("บันทึกเป็นท่าใหม่ (เพิ่มเข้าไป)", saveNew, true), B("บันทึกทับท่าที่เลือก", saveOver, true), B("ลบท่าที่เลือก", del))));
    bus.on("changed", refresh); bus.on("edit_pose", loadId);
    refresh(); redraw();
  }

  // ================================================================ 4.3 รายละเอียด / ทำตามท่า
  const T_IN = 1.2, T_HOLD = 1.8, T_OUT = 1.2, T_GAP = 0.6;
  function mount43(el, store) {
    let pid = null, playing = true, t0 = performance.now() / 1000; const neutral = S2.neutral();
    const cv = h("canvas", { class: "fig", width: 600, height: 600, style: "max-width:600px" });
    const title = h("div", { class: "big", style: "font-size:26px", text: "(ยังไม่ได้เลือกท่า)" }), meta = h("div", { class: "mut" }), steps = h("div", { class: "panel", style: "min-height:200px;font-size:18px;line-height:1.7" });
    const phase = h("div", { class: "big", style: "color:var(--acc)" }), toggleBtn = h("button", { class: "btn", text: "⏸ หยุดแอนิเมชัน" });
    function show(id) {
      const p = store.get(id); if (!p) return;
      pid = id; title.textContent = p.name;
      meta.textContent = `หมวด: ${p.category}   •   ${p.reps} ครั้ง × ${p.sets} เซ็ต   •   ค้าง ${p.hold} วินาที   •   พัก ${p.rest} วินาที`;
      const lines = p.description.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      steps.textContent = lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join("\n") : "(ยังไม่มีคำอธิบาย)"; t0 = performance.now() / 1000;
    }
    function step(d) {
      const ids = store.poses.map((p) => p.id); if (!ids.length) return;
      show(ids[(ids.indexOf(pid) >= 0 ? (ids.indexOf(pid) + d + ids.length) % ids.length : 0)]);
    }
    toggleBtn.onclick = () => { playing = !playing; toggleBtn.textContent = playing ? "⏸ หยุดแอนิเมชัน" : "▶ เล่นแอนิเมชัน"; t0 = performance.now() / 1000; };
    function tick() {
      requestAnimationFrame(tick);
      if (!visible(el)) return;
      const g = cv.getContext("2d"); g.clearRect(0, 0, 600, 600);
      const p = pid && store.get(pid); if (!p) return;
      S2.drawPose(cv, p.joints, { color: cssv("--ghost"), widthRatio: 0.05 });
      let cur;
      if (playing) {
        const t = (performance.now() / 1000 - t0) % (T_IN + T_HOLD + T_OUT + T_GAP);
        if (t < T_IN) { cur = S2.lerpPose(neutral, p.joints, S2.ease(t / T_IN)); phase.textContent = "กำลังเข้าท่า…"; }
        else if (t < T_IN + T_HOLD) { cur = p.joints; phase.textContent = "ค้างไว้ในท่านี้"; }
        else if (t < T_IN + T_HOLD + T_OUT) { cur = S2.lerpPose(p.joints, neutral, S2.ease((t - T_IN - T_HOLD) / T_OUT)); phase.textContent = "กลับท่าเริ่มต้น"; }
        else { cur = neutral; phase.textContent = "ท่ายืนตรง"; }
      } else { cur = p.joints; phase.textContent = "แสดงท่าเป้าหมาย"; }
      S2.drawPose(cv, cur, { color: cssv("--acc") });
    }
    el.append(h("div", { class: "grid2" }, cv, h("div", {}, title, meta, h("h2", { text: "วิธีทำ", style: "margin-top:8px" }), steps,
      h("div", { class: "row", style: "margin:8px 0" }, toggleBtn, h("button", { class: "btn", text: "◀ ท่าก่อนหน้า", onclick: () => step(-1) }), h("button", { class: "btn", text: "ท่าถัดไป ▶", onclick: () => step(1) })),
      h("div", { class: "row" }, h("button", { class: "btn", text: "แก้ไขท่านี้", onclick: () => { if (pid) { bus.emit("edit_pose", pid); goto("edit"); } } }),
        h("button", { class: "btn", text: "ฝึกท่านี้ (ตั้งเวลา)", onclick: () => { if (pid) { bus.emit("start_routine", [pid]); goto("settings"); } } })), phase)));
    bus.on("select", show);
    bus.on("changed", () => { if (pid && store.get(pid)) show(pid); else if (store.poses.length) show(store.poses[0].id); else { pid = null; title.textContent = "(ยังไม่มีท่า)"; } });
    if (store.poses.length) show(store.poses[0].id);
    tick();
  }

  // ================================================================ 4.4 ตั้งค่าจำนวนครั้งและเวลา / ฝึกตามเวลา
  let audio = null;
  function beep() {
    try {
      audio = audio || new (root.AudioContext || root.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.09);
    } catch (e) { /* ไม่มีเสียงก็ใช้งานได้ */ }
  }
  function mount44(el, store) {
    let queue = [], sel = null, timeline = [], running = false, paused = false, segI = 0, segT = 0, last = 0, total = 0, raf = 0;
    const neutral = S2.neutral();
    const poseList = h("div", { class: "list", style: "max-height:220px" }), qbox = h("div", { class: "list", style: "max-height:150px" });
    const cv = h("canvas", { class: "fig", width: 440, height: 440, style: "max-width:440px" });
    const lblName = h("div", { class: "big", text: "พร้อมเริ่ม" }), lblCnt = h("div", { class: "big", style: "color:var(--acc)" }), lblInfo = h("div", { class: "mut" });
    const prog = h("div", { class: "bar" }, h("i")), est = h("div", { class: "mut" });
    const fields = { reps: ["จำนวนครั้ง / เซ็ต", 1, 200], sets: ["จำนวนเซ็ต", 1, 30], hold: ["ค้างท่า (วินาที)", 1, 300], rest: ["พักระหว่างเซ็ต (วินาที)", 0, 300] };
    const inputs = {};
    const form = h("div", {}); Object.keys(fields).forEach((k) => { inputs[k] = h("input", { type: "number", min: fields[k][1], max: fields[k][2], value: 1, style: "width:80px" }); form.append(h("label", {}, fields[k][0] + " ", inputs[k])); });
    const pauseBtn = h("button", { class: "btn", text: "⏸ หยุดชั่วคราว", onclick: pause });

    function refresh() {
      poseList.innerHTML = "";
      store.poses.forEach((p) => poseList.append(h("button", { "aria-pressed": String(p.id === sel), onclick: () => { sel = p.id; refresh(); loadSettings(); drawIdle(); } },
        `${p.name}  ·  ${p.reps}×${p.sets} / ${p.hold}วิ`)));
      if (!sel || !store.get(sel)) { sel = store.poses.length ? store.poses[0].id : null; if (sel) { poseList.querySelector("button").setAttribute("aria-pressed", "true"); } }
      queue = queue.filter((i) => store.get(i)); showQueue(); loadSettings();
    }
    function loadSettings() { const p = sel && store.get(sel); if (!p) return; Object.keys(inputs).forEach((k) => (inputs[k].value = p[k])); est.textContent = `ใช้เวลาประมาณ ${S2.fmtDuration(S2.estimate(store, [p.id]))} ต่อท่านี้`; }
    function saveSettings() {
      if (!sel) return; const v = {};
      for (const k in inputs) {
        const x = parseInt(inputs[k].value, 10); if (isNaN(x)) { alert("กรุณากรอกตัวเลขจำนวนเต็ม"); return; }
        v[k] = Math.max(fields[k][1], Math.min(fields[k][2], x)); inputs[k].value = v[k];
      }
      store.updateSettings(sel, v.reps, v.hold, v.sets, v.rest);
    }
    function showQueue() {
      qbox.innerHTML = ""; queue.forEach((id, i) => qbox.append(h("button", { onclick: () => { queue.splice(i, 1); showQueue(); }, title: "คลิกเพื่อเอาออก", text: `${i + 1}. ${store.get(id).name}` })));
      if (!queue.length) qbox.append(h("span", { class: "mut", text: "(ว่าง — เพิ่มท่าที่เลือก หรือกด ฝึกจากหน้า 4.1)" }));
    }
    function setQueue(ids) { stop(); queue = ids.filter((i) => store.get(i)); showQueue(); lblName.textContent = `คิวฝึก ${queue.length} ท่า • กด ▶ เริ่ม`; lblInfo.textContent = `รวมประมาณ ${S2.fmtDuration(S2.estimate(store, queue))}`; }
    function drawIdle() { const g = cv.getContext("2d"); g.clearRect(0, 0, 440, 440); const p = sel && store.get(sel); S2.drawPose(cv, p ? p.joints : neutral, { color: "#9aa4b2" }); }
    function start() {
      const ids = queue.length ? queue : sel ? [sel] : [];
      timeline = S2.buildTimeline(store, ids);
      if (!timeline.length) { alert("เลือกท่าหรือเพิ่มท่าเข้าคิวก่อน"); return; }
      total = timeline.reduce((a, s) => a + s.dur, 0); segI = 0; segT = 0; running = true; paused = false; last = performance.now() / 1000; pauseBtn.textContent = "⏸ หยุดชั่วคราว"; beep(); loop();
    }
    function pause() { if (!running) return; paused = !paused; last = performance.now() / 1000; pauseBtn.textContent = paused ? "▶ เล่นต่อ" : "⏸ หยุดชั่วคราว"; }
    function stop() { running = false; paused = false; cancelAnimationFrame(raf); prog.firstChild.style.width = "0"; lblCnt.textContent = ""; drawIdle(); }
    function loop() {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now() / 1000; if (!paused) segT += Math.min(0.25, now - last); last = now;
      while (segI < timeline.length && segT >= timeline[segI].dur) {
        segT -= timeline[segI].dur; segI++;
        if (segI < timeline.length && (timeline[segI].kind === "in" || timeline[segI].kind === "rest")) beep();
      }
      const g = cv.getContext("2d"); g.clearRect(0, 0, 440, 440);
      if (segI >= timeline.length) {
        running = false; S2.drawPose(cv, neutral, { color: cssv("--acc") }); lblName.textContent = "เสร็จสิ้น เก่งมาก! 🎉"; lblCnt.textContent = ""; lblInfo.textContent = ""; prog.firstChild.style.width = "100%"; beep(); return;
      }
      const seg = timeline[segI], p = store.get(seg.pid), tgt = p.joints, k = seg.kind, t = segT / seg.dur;
      let cur, txt;
      if (k === "in") { cur = S2.lerpPose(neutral, tgt, S2.ease(t)); txt = "เข้าท่า"; } else if (k === "hold") { cur = tgt; txt = "ค้างไว้"; }
      else if (k === "out") { cur = S2.lerpPose(tgt, neutral, S2.ease(t)); txt = "กลับท่าเดิม"; } else { cur = neutral; txt = "พัก"; }
      if (k !== "rest") S2.drawPose(cv, tgt, { color: cssv("--ghost"), widthRatio: 0.05 });
      S2.drawPose(cv, cur, { color: k !== "rest" ? cssv("--acc") : "#9aa4b2" });
      const remain = Math.ceil(seg.dur - segT);
      lblName.textContent = k !== "rest" ? p.name : "พักสักครู่…"; lblCnt.textContent = k === "hold" || k === "rest" ? `${txt}  ${remain}` : txt;
      lblInfo.textContent = `เซ็ต ${seg.s}/${seg.S}   ครั้งที่ ${seg.r}/${seg.R}`;
      prog.firstChild.style.width = 100 * (timeline.slice(0, segI).reduce((a, s) => a + s.dur, 0) + segT) / total + "%";
    }
    const B = (t, fn) => h("button", { class: "btn", onclick: fn, text: t });
    el.append(h("div", { class: "grid2" },
      h("div", {}, h("h2", { text: "ตั้งค่าต่อท่า" }), poseList, h("div", { style: "margin:8px 0" }, form, B("บันทึกการตั้งค่าท่านี้", saveSettings), est),
        h("h2", { text: "คิวฝึก" }), qbox,
        h("div", { class: "row", style: "margin-top:4px" }, B("เพิ่มท่าที่เลือก", () => { if (sel) { queue.push(sel); showQueue(); } }),
          B("ใช้ทุกท่า", () => setQueue(store.poses.map((p) => p.id))), B("ล้าง", () => { queue = []; showQueue(); }))),
      h("div", {}, cv, lblName, lblCnt, lblInfo, prog,
        h("div", { class: "row" }, h("button", { class: "btn pri", text: "▶ เริ่ม", onclick: start }), pauseBtn, B("■ หยุด", stop)))));
    bus.on("changed", refresh); bus.on("start_routine", setQueue); refresh(); drawIdle();
  }

  S2.mountAll = function (store, ids) {
    S2.store = store;
    mount41(ids.list, store); mount42(ids.edit, store); mount43(ids.detail, store); mount44(ids.settings, store);
  };
})(typeof self !== "undefined" ? self : this);
