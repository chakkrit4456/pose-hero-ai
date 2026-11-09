/*
 * DancePad — โมดูลอ่านแผ่นเต้น (ไม่มี UI, ไม่ต้องพึ่งไลบรารี) สำหรับใช้ร่วมกับระบบอื่น
 *
 * ใช้งานในหน้าเว็บอื่น:
 *   <script src="dancepad.js"></script>
 *   const pad = DancePad.create();
 *   pad.on('press',   e => console.log(e.id, e.name));   // e = {id,name,pos,source,time}
 *   pad.on('release', e => ...);
 *   pad.start();
 *
 * id ของแผ่น:  x u o / l r / tri d sq   (ตำแหน่งตาราง 3x3, กลางว่าง)
 *   x=ซ้ายบน  u=บน  o=ขวาบน  l=ซ้าย  r=ขวา  tri=ซ้ายล่าง  d=ล่าง  sq=ขวาล่าง
 *
 * Event ที่มี:  press, release, status, prompt, change, raw, log
 * ส่งต่อให้หน้า/แท็บ/iframe อื่นอัตโนมัติ (bridge):
 *   - window event       : 'dancepad:press' / 'dancepad:release'   (detail = ข้อมูลเหตุการณ์)
 *   - BroadcastChannel   : 'dancepad'   ({type:'press'|'release', ...})
 *   - postMessage        : ไปยัง window.parent และ window.opener  ({source:'dancepad', type, ...})
 * ค่าที่ตั้งไว้ (map) เก็บใน localStorage ชื่อ 'dancepad-map-v4' ใช้ร่วมกันได้ทุกหน้าที่อยู่ origin เดียวกัน
 */
(function (global) {
  'use strict';

  const DEFAULT_PANELS = [
    { id: 'x',   name: 'ซ้ายบน (X)',   pos: 0, key: 'q' },
    { id: 'u',   name: 'บน ↑',         pos: 1, key: 'ArrowUp' },
    { id: 'o',   name: 'ขวาบน (O)',    pos: 2, key: 'e' },
    { id: 'l',   name: 'ซ้าย ←',       pos: 3, key: 'ArrowLeft' },
    { id: 'r',   name: 'ขวา →',        pos: 5, key: 'ArrowRight' },
    { id: 'tri', name: 'ซ้ายล่าง (▲)', pos: 6, key: 'z' },
    { id: 'd',   name: 'ล่าง ↓',       pos: 7, key: 'ArrowDown' },
    { id: 'sq',  name: 'ขวาล่าง (□)',  pos: 8, key: 'c' },
  ];

  function create(opts) {
    opts = opts || {};
    const PANELS = opts.panels || DEFAULT_PANELS;
    const STORE = opts.storageKey || 'dancepad-map-v6';   // ลายเซ็นสัญญาณ เช่น a1+ หรือ a1+&b4
    const IGN = opts.ignoreKey || 'dancepad-ignore-v1';   // สัญญาณที่เกิดตอนยืนกลาง
    const HOLD_KEY = 'dancepad-hold-v1';
    let RELEASE_HOLD = 90;     // ms กันสัญญาณสั่น (ปรับเพิ่มเองได้เมื่อ autoFix เจอสัญญาณติดๆ ดับๆ)
    try { const h = JSON.parse(localStorage.getItem(HOLD_KEY) || 'null'); if (h >= 30 && h <= 600) RELEASE_HOLD = h; } catch (e) {}
    const CAP_MS = 350;        // ms เก็บสัญญาณตอนผูกปุ่ม
    const bridge = opts.bridge !== false;
    // แป้นที่มีแค่ปุ่ม b0..b7: ตั้ง {buttons:8, axes:false, single:true} → 1 แผ่น = 1 ปุ่ม ไม่สนแกน/ปุ่มอื่น
    const MAX_BTN = opts.buttons || 64, USE_AXES = opts.axes !== false, SINGLE = !!opts.single;
    const find = id => PANELS.find(p => p.id === id);

    // ---------- storage ----------
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };

    let map = lsGet(STORE, {});                 // panelId -> "b3" | "a0+" | "a1+&b4"
    // ค่าเริ่มต้นเฉพาะแผ่น (ใช้เมื่อแผ่นนั้นยังไม่เคยผูก) เช่น {o:'b0&b1&b2'}
    if (opts.defaults) Object.keys(opts.defaults).forEach(id => { if (!map[id]) map[id] = opts.defaults[id]; });
    let ignore = new Set(lsGet(IGN, []));
    const state = {};                           // panelId -> {down,count,tested,pt}
    const resetState = () => PANELS.forEach(p => state[p.id] = { down: false, count: 0, tested: false, pt: 0 });
    resetState();

    // ---------- event emitter + bridge ----------
    const handlers = {};
    const on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); return () => off(ev, fn); };
    const off = (ev, fn) => { handlers[ev] = (handlers[ev] || []).filter(f => f !== fn); };
    let bc = null;
    try { if (bridge && typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel('dancepad'); } catch (e) {}
    function emit(ev, data) {
      (handlers[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[DancePad]', e); } });
    }
    function broadcast(type, data) {
      if (!bridge) return;
      try { global.dispatchEvent(new CustomEvent('dancepad:' + type, { detail: data })); } catch (e) {}
      const msg = Object.assign({ source: 'dancepad', type }, data);
      try { if (bc) bc.postMessage(msg); } catch (e) {}
      try { if (global.parent && global.parent !== global) global.parent.postMessage(msg, '*'); } catch (e) {}
      try { if (global.opener) global.opener.postMessage(msg, '*'); } catch (e) {}
    }
    const log = t => emit('log', t);
    const prompt = (text, extra) => emit('prompt', Object.assign({ text }, extra || {}));

    // ---------- แผ่นถูกเหยียบ / ปล่อย ----------
    let maxSim = 0;
    // สถิติไว้ตรวจปัญหา: chatter = ปล่อยแล้วติดซ้ำเร็วผิดปกติ, cross = สองแผ่นติดพร้อมกันในเสี้ยววินาที, relAt = เวลาปล่อยล่าสุด
    const stats = { chatter: {}, cross: {}, relAt: {}, stuck: {} };
    function press(id, src) {
      const s = state[id]; if (s.down) return;
      const t = performance.now();
      if (src !== 'คีย์บอร์ด') {
        if (t - (stats.relAt[id] || -1e9) < 150) stats.chatter[id] = (stats.chatter[id] || 0) + 1;
        PANELS.forEach(q => { if (q.id !== id && state[q.id].down && t - state[q.id].pt < 30 && state[q.id].gp) {
          const k = [q.id, id].sort().join('+'); stats.cross[k] = (stats.cross[k] || 0) + 1; } });
      }
      s.gp = src !== 'คีย์บอร์ด';
      s.down = true; s.count++; s.tested = true; s.pt = performance.now();
      const p = find(id);
      const nDown = PANELS.filter(q => state[q.id].down).length; if (nDown > maxSim) maxSim = nDown;
      const e = { id, name: p.name, pos: p.pos, source: src, time: Date.now() };
      log('เหยียบ ' + p.name + ' (' + src + ')');
      emit('press', e); broadcast('press', e); emit('change');
    }
    function release(id) {
      const s = state[id]; if (!s.down) return;
      s.down = false; stats.relAt[id] = performance.now();
      const p = find(id);
      const e = { id, name: p.name, pos: p.pos, time: Date.now() };
      emit('release', e); broadcast('release', e); emit('change');
    }

    // ---------- อ่าน Gamepad ----------
    let connected = null;
    function readInputs() {
      const set = new Set(), raw = [];
      const pads = (navigator.getGamepads ? navigator.getGamepads() : []);
      let gp = null;
      for (const g of pads) { if (g && g.connected) { gp = g; break; } }
      if (gp) {
        gp.buttons.forEach((b, i) => { if (i >= MAX_BTN) return; const on = b.pressed || b.value > 0.5; if (on) set.add('b' + i); raw.push(['b' + i, on]); });
        if (USE_AXES) gp.axes.forEach((v, i) => {
          let key = null;
          if (v > 1.01) { /* hat ว่าง (ไม่ได้กด) */ }
          else if (i >= 2 && Math.abs(v) > 0.1 && Math.abs(v * 3.5 + 3.5 - Math.round(v * 3.5 + 3.5)) < 0.06 && Math.abs(Math.abs(v) - 1) > 0.02) {
            key = 'a' + i + '~' + Math.round((v + 1) * 3.5);   // hat 8 ทิศ (ค่าเป็นขั้น)
          } else if (v > 0.5) key = 'a' + i + '+'; else if (v < -0.5) key = 'a' + i + '-';
          if (i >= 2 && Math.abs(v) >= 0.98 && Math.abs(v) <= 1.01) key = 'a' + i + (v > 0 ? '+' : '-');
          if (key) set.add(key);
          raw.push(['a' + i + '=' + v.toFixed(2) + (key ? ' → ' + key : ''), !!key]);
        });
      }
      if (gp !== connected && (gp ? gp.id : null) !== (connected ? connected.id : null)) {
        connected = gp; emit('status', gp ? { connected: true, id: gp.id, buttons: gp.buttons.length, axes: gp.axes.length, mapping: gp.mapping || '' } : { connected: false });
        log(gp ? 'เชื่อมต่อ: ' + gp.id : 'ตัดการเชื่อมต่อ');
      } else connected = gp;
      return { set, raw };
    }

    // ---------- ลูปหลัก ----------
    // mode: 'free' (ใช้งานปกติ) | 'center' (สอบเทียบตอนยืนกลาง) | 'map' (ผูกปุ่ม)
    let mode = 'free', running = false;
    const kbDown = new Set();
    const lastOn = {};
    let cap = null, needRelease = false, warnedIgn = false;
    let single = null, queue = [], mapIdx = 0, target = null;
    const centerKeys = new Map(); let centerFrames = 0;

    function loop() {
      if (!running) return;
      const { set: rawSet, raw } = readInputs();
      const set = new Set([...rawSet].filter(k => !ignore.has(k)));   // ตัดสัญญาณที่เกิดตอนยืนกลาง
      emit('raw', raw);
      // สัญญาณที่ไม่ได้อยู่ในแผ่นใดเลยแต่ติดค้างเกิน 3 วินาที = ปุ่มค้าง/สายหลวม/ปุ่มที่ไม่ได้ผูก
      if (mode === 'free') {
        const used = new Set(); Object.values(map).forEach(v => v.split('&').forEach(k => used.add(k)));
        const now2 = performance.now();
        rawSet.forEach(k => { if (!used.has(k) && !ignore.has(k)) { if (!stats.stuck[k]) stats.stuck[k] = { t0: now2 }; stats.stuck[k].last = now2; } });
        Object.keys(stats.stuck).forEach(k => { if (!rawSet.has(k)) delete stats.stuck[k]; });
      }

      if (mode === 'center') {
        centerFrames++; rawSet.forEach(k => centerKeys.set(k, (centerKeys.get(k) || 0) + 1));
      } else if (mode === 'map') {
        const now = performance.now();
        if (needRelease) { if (set.size === 0) needRelease = false; }
        if (!needRelease) {
          if (!cap && set.size) { cap = { t0: now, frames: 0, n: {}, first: {} }; warnedIgn = false; }
          if (cap) set.forEach(k => { if (!(k in cap.first)) cap.first[k] = now; });
          if (cap) {
            cap.frames++; set.forEach(k => cap.n[k] = (cap.n[k] || 0) + 1);
            if (now - cap.t0 >= CAP_MS) {   // สรุปสัญญาณที่ติดค้างช่วงเหยียบเป็นลายเซ็นของแผ่น
              const ratio = r => Object.keys(cap.n).filter(k => cap.n[k] / cap.frames >= r).sort().join('&');
              let keys = ratio(0.6), loose = ratio(0.25);   // loose = ใช้แยกแผ่นที่สัญญาณหลักซ้ำกัน
              if (SINGLE) {   // 1 แผ่น = 1 ปุ่ม: เลือกปุ่มที่ติดนานสุด (เท่ากันเลือกปุ่มที่มาก่อน)
                const best = Object.keys(cap.n).sort((a, b) => cap.n[b] - cap.n[a] || cap.first[a] - cap.first[b])[0];
                keys = loose = best || '';
              }
              cap = null;
              if (keys) { needRelease = true; handleMapSig(keys, loose); }
            }
          } else if (rawSet.size && !warnedIgn) {
            warnedIgn = true;
            prompt('⚠ สัญญาณ (' + [...rawSet].join(', ') + ') เหมือนตอนยืนกลาง ระบบเลยตัดทิ้ง — ยกเท้าออกจากแผ่นกลาง/แผ่นข้างเคียง แล้วกด "ล้างค่า" เพื่อสอบเทียบใหม่', { level: 'warn' });
          }
          if (!rawSet.size) warnedIgn = false;
        }
      } else {
        const now = performance.now();
        // แผ่นถูกเหยียบเมื่อสัญญาณครบตามลายเซ็น; ถ้าลายเซ็นหนึ่งเป็นส่วนย่อยของอีกแผ่น ให้แผ่นที่เฉพาะเจาะจงกว่าชนะ
        const sig = {}; PANELS.forEach(p => { if (map[p.id]) sig[p.id] = map[p.id].split('&'); });
        const act = PANELS.filter(p => sig[p.id] && sig[p.id].every(k => set.has(k)));
        const onSet = new Set(act.filter(p => !act.some(q => q !== p && sig[q.id].length > sig[p.id].length && sig[p.id].every(k => sig[q.id].includes(k)))).map(p => p.id));
        PANELS.forEach(p => {
          const on = onSet.has(p.id);
          if (on) lastOn[p.id] = now;
          if (on && !state[p.id].down) press(p.id, map[p.id]);
          else if (!on && state[p.id].down && !kbDown.has(p.id) && now - (lastOn[p.id] || 0) > RELEASE_HOLD) release(p.id);
        });
      }
      requestAnimationFrame(loop);
    }

    // ---------- คีย์บอร์ดสำรอง ----------
    const byKey = k => PANELS.find(x => x.key.toLowerCase() === k.toLowerCase());
    function onKeyDown(e) {
      if (e.repeat || mode === 'map') return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const p = byKey(e.key); if (!p) return;
      e.preventDefault(); kbDown.add(p.id); press(p.id, 'คีย์บอร์ด');
    }
    function onKeyUp(e) {
      const p = byKey(e.key); if (!p) return;
      kbDown.delete(p.id); release(p.id);
    }
    // ค่าที่ผูกถูกแก้จากหน้าอื่น (เช่น ทดสอบปุ่ม.html) → โหลดใหม่ทันที
    const onStorage = e => { if (e.key === STORE || e.key === IGN || e.key === null) { map = lsGet(STORE, {}); ignore = new Set(lsGet(IGN, [])); emit('change'); } };
    const onGpConnect = e => log('gamepadconnected ' + e.gamepad.id);

    // ---------- สอบเทียบตอนยืนกลาง ----------
    function calibrateCenter(then) {
      if (typeof then !== 'function') then = null;
      if (mode !== 'free') return;
      mode = 'center'; centerKeys.clear(); centerFrames = 0; let n = 4;
      emit('change');
      const tick = () => {
        if (n > 0) { prompt('ยืนตรงกลางด้วยสองเท้า อย่าเหยียบแผ่นอื่น … ' + n + ' วินาที', { step: 'center', count: n }); n--; setTimeout(tick, 1000); return; }
        // เก็บเฉพาะสัญญาณที่ติดอย่างน้อย 20% ของเวลา (ตัดการสะดุดชั่วขณะ)
        ignore = new Set([...centerKeys].filter(([k, c]) => centerFrames && c / centerFrames >= 0.2).map(([k]) => k)); lsSet(IGN, [...ignore]);
        queue = []; PANELS.forEach(p => {
          if (!map[p.id]) return;
          const keep = map[p.id].split('&').filter(k => !ignore.has(k));
          if (!keep.length) { delete map[p.id]; queue.push(p.id); } else map[p.id] = keep.join('&');
        });
        lsSet(STORE, map); mode = 'free'; log('ค่าตอนยืนกลาง: ' + ([...ignore].join(', ') || 'ไม่มีสัญญาณ'));
        prompt(ignore.size ? ('ตัดสัญญาณตอนยืนกลางแล้ว (' + [...ignore].join(', ') + ')' + (queue.length ? ' — ต้องผูกใหม่: ' + queue.map(i => find(i).name).join(', ') : '')) : 'ยืนกลางแล้วไม่มีสัญญาณ ✔', { step: 'center-done' });
        emit('change');
        if (then) then(); else if (queue.length) bindOne(queue.shift());
      };
      tick();
    }

    // ---------- ผูกปุ่ม ----------
    function bindOne(id) {
      if (mode === 'map' || mode === 'center') return;
      single = find(id); mode = 'map'; target = id; cap = null; needRelease = true;
      prompt('ผูกใหม่เฉพาะ "' + single.name + '": เหยียบแผ่นนั้นเลย', { step: 'bind-one', target: id });
      emit('change');
    }
    function askMap() {
      cap = null; needRelease = true; target = PANELS[mapIdx].id;
      prompt('เหยียบแผ่น "' + PANELS[mapIdx].name + '" (' + (mapIdx + 1) + '/' + PANELS.length + ') – ไม่มีแผ่นนี้ให้กดข้าม', { step: 'bind', target, index: mapIdx + 1, total: PANELS.length });
      emit('change');
    }
    function endMap(done) {
      mode = 'free'; target = null; lsSet(STORE, map); resetState();
      prompt(done ? 'บันทึกการตั้งค่าแล้ว ✔ ลองเหยียบทดสอบได้เลย' : '', { step: 'done' });
      emit('mapdone', { map: Object.assign({}, map) }); emit('change');
    }
    let dupTries = 0;
    function handleMapSig(k, loose) {
      const cur = single ? single : PANELS[mapIdx];
      const clash = key => Object.entries(map).find(([id, v]) => v === key && id !== cur.id);
      let dup = clash(k);
      // สัญญาณหลักซ้ำกับแผ่นอื่น → ลองใช้สัญญาณที่ละเอียดขึ้น (รวมปุ่มที่ติดเป็นช่วงสั้นๆ) ถ้าไม่ซ้ำก็ใช้ได้
      if (dup && loose && loose !== k && !clash(loose)) { log('สัญญาณ [' + k + '] ซ้ำ — ใช้ค่าละเอียด [' + loose + '] แทน'); k = loose; dup = null; }
      if (dup) {
        dupTries++;
        const prev = find(dup[0]).name;
        prompt(dupTries < 3
          ? 'สัญญาณ [' + k + '] ซ้ำกับแผ่น "' + prev + '" — ยกเท้าออกจากทุกแผ่นให้หมด แล้วเหยียบ "' + cur.name + '" ตรงกลางแผ่นให้เต็มเท้า'
          : 'แผ่น "' + cur.name + '" ยังส่งสัญญาณเหมือน "' + prev + '" (' + dupTries + ' ครั้งแล้ว) — เช็กว่าเท้าไม่ได้เหยียบแผ่นข้างเคียง หรือกด "ข้ามแผ่นนี้" แล้วกลับมาผูกทีหลัง',
          { level: 'warn', target: cur.id, step: 'dup' });
        return;
      }
      dupTries = 0;
      if (single) {
        const p = single;
        map[p.id] = k; log('ผูกใหม่ ' + p.name + ' = ' + k); single = null; mode = 'free'; target = null; lsSet(STORE, map);
        const lost = PANELS.filter(x => !map[x.id]).map(x => x.name);
        prompt('ผูก "' + p.name + '" = [' + k + '] แล้ว ✔' + (lost.length ? ' — แต่ต้องผูกใหม่: ' + lost.join(', ') : ''), { step: 'bound-one' });
        resetState(); emit('change');
        if (queue.length) bindOne(queue.shift());
        return;
      }
      map[cur.id] = k; log('ผูก ' + cur.name + ' = ' + k);
      mapIdx++; target = null;
      if (mapIdx >= PANELS.length) endMap(true); else askMap();
    }
    // สอบเทียบกลางก่อน แล้วผูกทีละแผ่น
    function bindAll() {
      if (mode !== 'free') return;
      single = null; queue = []; map = {};
      calibrateCenter(() => { mode = 'map'; mapIdx = 0; map = {}; askMap(); });
    }
    function skip() { if (mode === 'map' && !single) { dupTries = 0; mapIdx++; if (mapIdx >= PANELS.length) endMap(true); else askMap(); } }
    function cancel() {
      if (mode !== 'map') return;
      single = null; queue = []; mode = 'free'; target = null; lsSet(STORE, map);
      prompt('ยกเลิกแล้ว', { step: 'cancel' }); emit('change');
    }
    function resetAll() { lsDel(STORE); lsDel(IGN); ignore = new Set(); map = {}; if (mode === 'map') { mode = 'free'; single = null; } bindAll(); }

    // ---------- ตรวจสอบปัญหา ----------
    // คืนรายการ {level:'ok'|'warn'|'error', text} — เรียกเมื่อไรก็ได้
    function diagnose() {
      const out = [], add = (level, text) => out.push({ level, text });
      const nm = id => find(id).name;
      if (!connected) add('error', 'เบราว์เซอร์ยังไม่เห็นแผ่นเต้น — เช็กสาย USB แล้วเหยียบแผ่นใดแผ่นหนึ่ง 1 ครั้ง (ใช้ Chrome/Edge) ถ้าไม่ขึ้นลองเสียบพอร์ตอื่น');
      else add('ok', 'พบอุปกรณ์: ' + connected.id);
      const un = PANELS.filter(p => !map[p.id]);
      if (un.length) add('warn', 'ยังไม่ได้ผูกแผ่น: ' + un.map(p => p.name).join(', ') + ' — กด "ตั้งค่าแผ่น" หรือคลิกช่องนั้น');
      const sig = {}; PANELS.forEach(p => { if (map[p.id]) sig[p.id] = map[p.id].split('&'); });
      const ids = Object.keys(sig);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j], A = sig[a], B = sig[b];
        if (map[a] === map[b]) add('error', 'แผ่น "' + nm(a) + '" กับ "' + nm(b) + '" ถูกผูกสัญญาณเดียวกัน [' + map[a] + '] — แยกกันไม่ได้ ให้ผูกใหม่');
        else if (A.every(k => B.includes(k))) add('ok', '"' + nm(a) + '" [' + map[a] + '] เป็นส่วนหนึ่งของ "' + nm(b) + '" [' + map[b] + '] — ใช้ได้ (ระบบให้แผ่นเจาะจงกว่าชนะ) แต่ถ้าเหยียบ ' + nm(b) + ' แล้วติดผิดแผ่นให้ผูกใหม่');
        else if (B.every(k => A.includes(k))) add('ok', '"' + nm(b) + '" [' + map[b] + '] เป็นส่วนหนึ่งของ "' + nm(a) + '" [' + map[a] + '] — ใช้ได้ (ระบบให้แผ่นเจาะจงกว่าชนะ) แต่ถ้าเหยียบ ' + nm(a) + ' แล้วติดผิดแผ่นให้ผูกใหม่');
      }
      if (ignore.size) add(ignore.size > 3 ? 'warn' : 'ok', 'สัญญาณที่ตัดทิ้งตอนยืนกลาง: ' + [...ignore].join(', ') + (ignore.size > 3 ? ' — เยอะผิดปกติ อาจยืนไม่นิ่งตอนสอบเทียบ ให้ "ล้างค่า" แล้วทำใหม่' : ''));
      Object.keys(stats.chatter).forEach(id => { if (stats.chatter[id] >= 2) add('warn', nm(id) + ': สัญญาณติดๆ ดับๆ ' + stats.chatter[id] + ' ครั้ง — แผ่นหรือสายอาจสัมผัสไม่ดี'); });
      Object.keys(stats.cross).forEach(k => { if (stats.cross[k] >= 3) add('warn', k.split('+').map(nm).join(' กับ ') + ' ติดพร้อมกันภายใน 30ms ' + stats.cross[k] + ' ครั้ง — เท้าคร่อมสองแผ่น หรือสัญญาณพ่วงกัน (ถ้าเหยียบเดี่ยวแล้วเป็น แปลว่าแผ่นพ่วงกัน)'); });
      const nowT = performance.now();
      Object.keys(stats.stuck).forEach(k => { if (nowT - stats.stuck[k].t0 > 3000) add('warn', 'สัญญาณ [' + k + '] ติดค้างเกิน 3 วินาทีและไม่อยู่ในแผ่นใดเลย — ปุ่มค้าง/ปุ่มที่ไม่ได้ผูก (เช่น SELECT/START)'); });
      const tested = PANELS.filter(p => state[p.id].tested).length;
      const never = PANELS.filter(p => map[p.id] && !state[p.id].tested);
      if (tested && never.length) add('warn', 'ยังไม่เคยเหยียบ: ' + never.map(p => p.name).join(', '));
      if (!out.some(o => o.level !== 'ok')) add('ok', tested === PANELS.length ? 'ไม่พบปัญหา — ทุกแผ่นใช้งานได้' : 'ยังไม่พบปัญหา (เหยียบให้ครบทุกแผ่นเพื่อตรวจเต็มรูปแบบ)');
      return out;
    }

    // ---------- แก้ปัญหาอัตโนมัติ ----------
    // แก้เฉพาะที่ซอฟต์แวร์แก้ได้: สัญญาณค้าง, สัญญาณสั่น, ผูกซ้ำ/ยังไม่ผูก  (คืนรายการสิ่งที่ทำ)
    function autoFix() {
      if (mode !== 'free') return ['กำลังตั้งค่าอยู่ — ทำให้เสร็จก่อนแล้วค่อยกดแก้ปัญหา'];
      const done = [], nowT = performance.now(), redo = [];
      // 1) สัญญาณค้างที่ไม่ใช่ของแผ่นใด → ตัดทิ้งถาวร
      const stuck = Object.keys(stats.stuck).filter(k => nowT - stats.stuck[k].t0 > 3000);
      if (stuck.length) {
        stuck.forEach(k => { ignore.add(k); delete stats.stuck[k]; }); lsSet(IGN, [...ignore]);
        PANELS.forEach(p => { if (!map[p.id]) return; const keep = map[p.id].split('&').filter(k => !ignore.has(k)); if (!keep.length) { delete map[p.id]; } else map[p.id] = keep.join('&'); });
        done.push('ตัดสัญญาณค้าง [' + stuck.join(', ') + '] ออกแล้ว');
      }
      // 2) สัญญาณติดๆ ดับๆ → เพิ่มช่วงหน่วงกันสั่น
      if (Object.keys(stats.chatter).some(id => stats.chatter[id] >= 2)) {
        RELEASE_HOLD = Math.min(400, RELEASE_HOLD * 2); lsSet(HOLD_KEY, RELEASE_HOLD); stats.chatter = {};
        done.push('เพิ่มช่วงหน่วงกันสัญญาณสั่นเป็น ' + RELEASE_HOLD + ' ms');
      }
      // 3) ผูกซ้ำ → เก็บแผ่นแรกไว้ ที่เหลือผูกใหม่
      const seen = {};
      PANELS.forEach(p => { const v = map[p.id]; if (!v) return; if (seen[v]) { delete map[p.id]; } else seen[v] = p.id; });
      // 4) แผ่นที่ยังไม่ผูก (รวมที่เพิ่งถูกลบ) → ผูกต่อทีละแผ่น
      PANELS.forEach(p => { if (!map[p.id]) redo.push(p.id); });
      lsSet(STORE, map);
      if (Object.keys(stats.cross).some(k => stats.cross[k] >= 3)) {
        done.push('แผ่นที่ติดพร้อมกันเป็นเรื่องของตัวแผ่น/สาย/เท้า ซอฟต์แวร์แก้ไม่ได้ — เหยียบทีละแผ่นกลางๆ แล้วดูว่ายังเป็นอีกไหม');
        stats.cross = {};
      }
      emit('change');
      if (redo.length) { done.push('ผูกใหม่: ' + redo.map(i => find(i).name).join(', ')); queue = redo.slice(1); bindOne(redo[0]); }
      if (!done.length) done.push('ไม่มีอะไรต้องแก้');
      log('แก้ปัญหา: ' + done.join(' | '));
      return done;
    }

    // ---------- สั่งงาน ----------
    function start() {
      if (running) return api;
      running = true;
      global.addEventListener('keydown', onKeyDown); global.addEventListener('keyup', onKeyUp);
      global.addEventListener('gamepadconnected', onGpConnect); global.addEventListener('storage', onStorage);
      requestAnimationFrame(loop); return api;
    }
    function stop() {
      running = false;
      global.removeEventListener('keydown', onKeyDown); global.removeEventListener('keyup', onKeyUp);
      global.removeEventListener('gamepadconnected', onGpConnect); global.removeEventListener('storage', onStorage);
      return api;
    }

    const api = {
      panels: PANELS, state,
      get map() { return map; },
      get mode() { return mode; },
      get target() { return target; },
      get maxSimultaneous() { return maxSim; },
      get isMapped() { return PANELS.every(p => map[p.id]); },
      get gamepad() { return connected; },
      resetStats() { maxSim = 0; resetState(); emit('change'); },
      isDown: id => !!(state[id] && state[id].down),
      down: () => PANELS.filter(p => state[p.id].down).map(p => p.id),
      diagnose, autoFix, on, off, start, stop,
      calibrateCenter, bindAll, bindOne, skip, cancel, resetAll,
    };
    return api;
  }

  global.DancePad = { create, PANELS: DEFAULT_PANELS };
})(window);
