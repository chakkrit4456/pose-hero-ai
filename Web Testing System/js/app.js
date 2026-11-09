/* app.js - ประกอบหน้าเว็บ: แท็บ ข้อมูลท่า ป้ายสถานะ ชุดทดสอบอัตโนมัติ
 * ระบบ 1 (play.js) อ่านท่าจาก exercises.json  |  ระบบ 2 (sys2ui.js) อ่านท่าจาก poses.json  สองระบบแยกกันเหมือนของจริง */
(function (root) {
  "use strict";
  const MR = root.MR, S2 = root.S2, $ = (id) => document.getElementById(id);
  const App = (root.MRApp = { exercises: [], warnings: [], exSrc: "", exData: null, store: null });

  // ---------------------------------------------------------------- ท่าของระบบ 1
  function setExercises(data, src) {
    let loaded;
    try { loaded = MR.loadExercises(data); } catch (e) { alert("อ่านไฟล์ท่าไม่ได้: " + e.message); return false; }
    App.exData = data; App.exercises = loaded.exercises; App.warnings = loaded.warnings; App.exSrc = src;
    root.MRPlay.setExercises(App.exercises); renderData(); badges();
    return true;
  }
  function readJson(text, label) {
    try { return JSON.parse(text); } catch (e) { alert(`ไฟล์ ${label} อ่านไม่ได้ (รูปแบบ JSON ผิด): ${e.message}`); return null; }
  }

  // ---------------------------------------------------------------- ท่าของระบบ 2
  function poseSource() {
    try { const t = root.localStorage.getItem("mr_sys2_poses"); if (t) return "ที่บันทึกไว้ในเบราว์เซอร์นี้"; } catch (e) { /* ไม่มี localStorage */ }
    return root.MR_POSES_DATA ? root.MR_POSES_DATA.source : "ท่าตัวอย่าง 10 ท่า (ออกกำลังกายพื้นฐาน)";
  }
  function initStore() {
    let storage = null; try { storage = root.localStorage; storage.getItem("x"); } catch (e) { storage = null; }
    const d = root.MR_POSES_DATA;
    App.store = new S2.Store(storage, d && d.poses, d && d.origin);
    App.posesSrc = poseSource();
  }

  // ---------------------------------------------------------------- ป้ายสถานะ
  function badges() {
    const net = $("b-net"), on = navigator.onLine;
    net.textContent = on ? "ออนไลน์" : "ออฟไลน์"; net.className = "badge " + (on ? "ok" : "warn");
    const e = $("b-ex"); e.textContent = `ระบบ 1: ${App.exercises.length} ท่า`; e.className = "badge " + (App.exercises.length ? "ok" : "bad");
    const p = $("b-poses"); p.textContent = `ระบบ 2: ${App.store ? App.store.poses.length : 0} ท่า`; p.className = "badge ok";
    const m = $("b-model");
    if (root.MR_MODEL_B64) { m.textContent = "โมเดล pose_landmarker_lite ฝังแล้ว"; m.className = "badge ok"; }
    else { m.textContent = "ยังไม่ได้ฝังโมเดล (รัน Prepare Web Test Files.bat)"; m.className = "badge bad"; }
  }

  // ---------------------------------------------------------------- แท็บข้อมูล
  function renderData() {
    $("data-info").textContent = `ที่มา: ${App.exSrc} · ท่าทั้งหมด ${(App.exData && (App.exData.exercises || App.exData).length) || 0} · ใช้ได้ ${App.exercises.length}`;
    $("data-skip").textContent = App.warnings.length ? App.warnings.map((w) => "• " + w).join("\n") : "ไม่มี";
    const sel = $("data-ex"); sel.innerHTML = ""; App.exercises.forEach((x) => sel.add(new Option(x.name, x.id))); renderExJson();
    if (App.store) $("data-poses").textContent = `ที่มา: ${App.posesSrc} · ${App.store.poses.length} ท่า (แก้ไขได้ที่แท็บ 4.2 เก็บในเบราว์เซอร์นี้)`;
  }
  function renderExJson() { const ex = App.exercises.find((x) => x.id === $("data-ex").value); $("data-json").textContent = ex ? JSON.stringify(ex, null, 2) : ""; }
  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click();
  }
  function wireDrop(box, handler) {
    ["dragover", "dragenter"].forEach((n) => box.addEventListener(n, (e) => { e.preventDefault(); box.classList.add("on"); }));
    ["dragleave", "drop"].forEach((n) => box.addEventListener(n, (e) => { e.preventDefault(); box.classList.remove("on"); }));
    box.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) f.text().then((t) => handler(t, f.name)); });
  }

  // ---------------------------------------------------------------- ทดสอบอัตโนมัติ
  function runAuto() {
    const rows = root.MRTests.runAll(App.exData || { exercises: [] }), tb = document.querySelector("#auto-tbl tbody"); tb.innerHTML = "";
    let fail = 0;
    rows.forEach((r) => {
      if (!r[0]) fail++;
      const tr = document.createElement("tr"); tr.innerHTML = `<td class="${r[0] ? "ok" : "bad"}">${r[0] ? "ผ่าน" : "ไม่ผ่าน"}</td><td></td><td></td>`;
      tr.children[1].textContent = r[1]; tr.children[2].textContent = r[2]; tb.appendChild(tr);
    });
    $("auto-sum").textContent = fail ? `ไม่ผ่าน ${fail} จาก ${rows.length} รายการ` : `ผ่านทั้งหมด ${rows.length} รายการ`;
    $("auto-sum").className = "big " + (fail ? "bad" : "ok");
    App.autoResult = { total: rows.length, fail, rows };
    return App.autoResult;
  }
  App.runAuto = runAuto;

  // ---------------------------------------------------------------- เริ่มต้น
  function showTab(key) {
    document.querySelectorAll("#tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === key));
    ["play", "list", "edit", "detail", "settings", "auto", "data"].forEach((t) => ($("tab-" + t).hidden = t !== key));
    if (key !== "play") root.MRPlay.stop(true);
    if (key === "data") renderData();
  }
  App.showTab = showTab;

  function init() {
    initStore();
    S2.mountAll(App.store, { list: $("tab-list"), edit: $("tab-edit"), detail: $("tab-detail"), settings: $("tab-settings") });
    S2.bus.on("goto", showTab); S2.bus.on("changed", () => { badges(); renderData(); });
    document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
    $("data-ex").onchange = renderExJson;
    $("auto-run").onclick = runAuto;
    $("data-sample").onclick = () => { const d = root.MR_EXERCISES_DATA; if (d) setExercises(d, d.source); };
    const loadEx = (text, name) => { const j = readJson(text, name); if (j) setExercises(j, "ไฟล์ " + name); };
    $("data-file").onchange = (ev) => { const f = ev.target.files[0]; if (f) f.text().then((t) => loadEx(t, f.name)); };
    wireDrop($("drop"), loadEx);
    const loadPoses = (text, name) => {
      const j = readJson(text, name); if (!j) return;
      const list = Array.isArray(j) ? j : j.poses;
      if (!Array.isArray(list) || !list.length) { alert("ไม่พบรายการท่า (poses) ในไฟล์"); return; }
      App.store.replaceAll(list); App.posesSrc = "ไฟล์ " + name; renderData();
    };
    $("data-file2").onchange = (ev) => { const f = ev.target.files[0]; if (f) f.text().then((t) => loadPoses(t, f.name)); };
    wireDrop($("drop2"), loadPoses);
    $("data-poses-sample").onclick = () => { const d = root.MR_POSES_DATA; if (d) { App.store.replaceAll(d.poses); App.posesSrc = d.source; renderData(); } };
    $("data-poses-seed").onclick = () => { App.store.resetToSeed(); App.posesSrc = "ท่าตัวอย่าง 10 ท่า (ออกกำลังกายพื้นฐาน)"; renderData(); };
    $("data-ex-dl").onclick = () => download("exercises.json", JSON.stringify({ version: 1, exercises: App.exercises }, null, 2));
    $("data-poses-dl").onclick = () => download("poses.json", JSON.stringify({ version: 1, poses: App.store.poses }, null, 2));
    addEventListener("online", badges); addEventListener("offline", badges);

    const d = root.MR_EXERCISES_DATA;
    if (d) setExercises(d, d.source); else { setExercises({ exercises: [] }, "ไม่มีข้อมูล (รัน Prepare Web Test Files.bat)"); }
    badges(); renderData();
  }
  init();
})(typeof self !== "undefined" ? self : this);
