/* camera.js - ระบบ 1.1 (กล้อง) + MediaPipe ของ 1.2 ฉบับเว็บ
 * ใช้ได้ทั้งออนไลน์/ออฟไลน์: wasm ฝังใน vendor/mp-assets.js, โมเดลฝังใน vendor/model-data.js
 * (Prepare Web Test Files.py ฝังจาก models/pose_landmarker_lite.task ตัวเดียวเท่านั้น) */
(function (root) {
  "use strict";
  const b64ToBytes = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  async function createLandmarker(bytes) {
    const V = root.MPVision, A = root.MR_ASSETS;
    if (!V || !A) throw new Error("ไม่พบไฟล์ vendor/vision.js หรือ vendor/mp-assets.js");
    const fileset = {
      wasmLoaderPath: URL.createObjectURL(new Blob([b64ToBytes(A.loader)], { type: "text/javascript" })),
      wasmBinaryPath: URL.createObjectURL(new Blob([b64ToBytes(A.wasm)], { type: "application/wasm" })),
    };
    // ค่าความมั่นใจ 0.6 เท่ากับ MediaPipeBackend ของ 1.2
    const opts = (delegate) => ({ baseOptions: { modelAssetBuffer: bytes.slice(), delegate }, runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { return await V.PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
    catch (e) { return await V.PoseLandmarker.createFromOptions(fileset, opts("CPU")); }
  }

  // โค้ดที่รันใน Worker: ตรวจท่าแยกจากหน้าเว็บ แอนิเมชันและการอ่านแผ่นเต้นจึงไม่สะดุดตอน AI ประมวลผล
  const WORKER_SRC = `
self.window = self;
let landmarker = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    try {
      // สร้าง blob ใน Worker เอง: เปิดเกมจากไฟล์ในเครื่อง (file://) Worker โหลด blob ที่หน้าเว็บสร้างไม่ได้
      const url = (bytes, type) => URL.createObjectURL(new Blob([bytes], { type }));
      importScripts(url(m.vision, "text/javascript"));
      const V = self.MPVision, fileset = { wasmLoaderPath: url(m.loader, "text/javascript"), wasmBinaryPath: url(m.wasm, "application/wasm") };
      const opts = (delegate) => ({ baseOptions: { modelAssetBuffer: m.model.slice(), delegate }, runningMode: "VIDEO", numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      try { landmarker = await V.PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
      catch (err) { landmarker = await V.PoseLandmarker.createFromOptions(fileset, opts("CPU")); }
      self.postMessage({ type: "ready" });
    } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
    return;
  }
  if (m.type === "detect") {
    try {
      const r = landmarker.detectForVideo(m.bitmap, m.ts), lm = r.landmarks && r.landmarks[0];
      self.postMessage({ type: "result", ts: m.ts, lm: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility == null ? 0 : p.visibility })) : null });
    } catch (err) { self.postMessage({ type: "result", ts: m.ts, failed: true }); }
    m.bitmap.close();
  }
};`;
  const blobUrl = (bytes, type) => URL.createObjectURL(new Blob([bytes], { type }));
  /** เปิด Worker ที่โหลดโมเดลแล้ว คืน Worker หรือ null ถ้าเบราว์เซอร์นี้ใช้ไม่ได้ (ผู้เรียกจะรันบนหน้าเว็บแทน) */
  function createWorker(bytes) {
    const A = root.MR_ASSETS;
    if (!root.Worker || !root.createImageBitmap || !root.MR_VISION_B64 || !A) return Promise.resolve(null);
    return new Promise((resolve) => {
      let w;
      const done = (val) => { clearTimeout(limit); if (!val && w) w.terminate(); resolve(val); };
      const limit = setTimeout(() => done(null), 45000);
      try { w = new Worker(blobUrl(WORKER_SRC, "text/javascript")); } catch (e) { return done(null); }
      w.onerror = () => done(null);
      w.onmessage = (e) => {
        if (e.data.type === "result") return done(e.data.failed ? null : w);
        if (e.data.type !== "ready") return done(null);
        // ตรวจภาพเปล่า 1 ครั้ง: AI ครั้งแรกใช้เวลาหลายวินาที ให้จบตอนหน้าโหลดโมเดล จะได้เห็นโครงกระดูกทันทีเมื่อเริ่มเกม
        createImageBitmap(new ImageData(256, 256)).then((b) => w.postMessage({ type: "detect", bitmap: b, ts: 1 }, [b])).catch(() => done(null));
      };
      w.postMessage({ type: "init", model: bytes, vision: b64ToBytes(root.MR_VISION_B64), loader: b64ToBytes(A.loader), wasm: b64ToBytes(A.wasm) });
    });
  }

  class CameraSource {
    constructor() { this.worker = null; this.busy = false; this.busyAt = 0; this.pending = undefined; this.landmarker = null; this.stream = null; this.video = null; this.lastTs = -1; this.mirror = true; this.smoother = new root.MR.LandmarkSmoother(); this.smooth = true; this.deviceId = ""; this.label = ""; }
    /** ค้นหากล้อง (detect_cameras ของ 1.1) คืน [{id, name}]  ต้องขอสิทธิ์กล้องก่อน เบราว์เซอร์จึงจะบอกชื่อกล้อง */
    async detect() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดด้วย Chrome หรือ Edge)");
      if (!this.stream) {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tmp.getTracks().forEach((t) => t.stop());
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, name: d.label || ("กล้องหมายเลข " + i) }));
    }
    setSmooth(on) { this.smooth = !!on; this.smoother.reset(); }
    setMirror(on) { this.mirror = !!on; if (this.video) this.video.style.transform = this.mirror ? "scaleX(-1)" : "none"; }
    modelReady() { return !!(this.worker || this.landmarker); }
    hasEmbeddedModel() { return !!root.MR_MODEL_B64; }
    /** โหลดโมเดล pose_landmarker_lite.task ที่ฝังไว้ (ไม่ดาวน์โหลด ไม่รับไฟล์อื่น) */
    async prepareModel() {
      if (this.modelReady()) return true;
      if (!root.MR_MODEL_B64) return false;
      const bytes = b64ToBytes(root.MR_MODEL_B64);
      const w = await createWorker(bytes);
      if (w) { this.useWorker(w); return true; }
      this.landmarker = await createLandmarker(bytes);
      return true;
    }
    useWorker(w) {
      this.worker = w; this.fails = 0;
      w.onmessage = (e) => {
        if (e.data.type !== "result") return;
        this.busy = false;
        if (e.data.failed) { if (++this.fails >= 5) this.dropWorker(); return; }
        this.fails = 0;
        if (this.stream) this.pending = this.process(e.data.lm, e.data.ts);
      };
      w.onerror = () => this.dropWorker();
    }
    /** Worker ใช้ไม่ได้บนเครื่องนี้ (เช่น GPU ใน Worker มีปัญหา): กลับไปรัน AI บนหน้าเว็บ เกมและการจับท่าทำงานต่อได้ */
    dropWorker() {
      if (!this.worker) return;
      this.worker.terminate(); this.worker = null; this.busy = false; this.lastVT = null;
      createLandmarker(b64ToBytes(root.MR_MODEL_B64)).then((l) => { this.landmarker = l; }).catch(() => {});
    }
    /** แปลงผลดิบจาก AI เป็นจุดที่พร้อมใช้: คงท่าล่าสุดถ้าหลุดแว็บเดียว กรองให้ลื่น แล้วกลับกระจก */
    process(lm, ts) {
      if (!lm) { // หลุดแว็บเดียว: คงท่าล่าสุดไว้ ไม่ให้โครงกระดูกกะพริบหาย (หลุดนานเกิน 0.8 วินาทีจึงถือว่าไม่พบคน)
        if (this.lastOut && ts / 1000 - this.lastGoodT < 0.8) return this.lastOut;
        this.smoother.reset(); this.lastOut = null; return null;
      }
      let pts = lm;
      if (this.smooth) pts = this.smoother.apply(pts, ts / 1000); // กรองให้ขยับลื่นก่อนส่งต่อ (ก่อนกลับกระจก)
      this.lastGoodT = ts / 1000;
      return (this.lastOut = this.mirror ? root.MR.mirrorLandmarks(pts) : pts); // กลับ x ให้ตรงกับภาพบนจอ เฉพาะโหมดกระจก (เหมือน mirrored_input ของ 1.2)
    }
    /** ส่งเฟรมล่าสุดให้ Worker (ทีละเฟรม ถ้ายังตรวจไม่เสร็จจะไม่ส่งเพิ่ม) แล้วคืนผลที่เพิ่งเสร็จ */
    readWorker(v) {
      const now = performance.now();
      if (this.busy && now - this.busyAt > 5000) { this.dropWorker(); return undefined; } // ผลไม่กลับมา = Worker ค้าง
      if (!this.busy && v.currentTime !== this.lastVT) {
        this.busy = true; this.busyAt = now; this.lastVT = v.currentTime;
        const w = v.videoWidth || 640, h = v.videoHeight || 480, sc = Math.min(1, 640 / w), ts = Math.max(now, this.lastTs + 1); this.lastTs = ts;
        createImageBitmap(v, { resizeWidth: Math.round(w * sc), resizeHeight: Math.round(h * sc), resizeQuality: "low" }).then((b) => {
          if (this.worker && this.stream) this.worker.postMessage({ type: "detect", bitmap: b, ts }, [b]);
          else { b.close(); this.busy = false; }
        }).catch(() => { this.busy = false; });
      }
      const out = this.pending; this.pending = undefined; return out;
    }
    async open(video, deviceId) {
      this.close();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดด้วย Chrome หรือ Edge)");
      this.stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ width: { ideal: 1280 }, height: { ideal: 720 } }, deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }), audio: false });
      this.smoother.reset(); this.lastOut = null; this.pending = undefined; this.video = video; this.deviceId = deviceId || ""; video.srcObject = this.stream; this.setMirror(this.mirror); await video.play();
      const t = this.stream.getVideoTracks()[0]; this.label = t ? t.label : "";
    }
    close() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null; if (this.video) this.video.srcObject = null;
    }
    isOpen() { return !!this.stream; }
    size() { return [this.video.videoWidth || 640, this.video.videoHeight || 480]; }
    /** อ่าน 1 เฟรม: คืนจุด 33 จุดที่กลับกระจกแล้ว หรือ null ถ้าไม่พบคน / undefined ถ้ายังไม่มีเฟรมใหม่ */
    read() {
      const v = this.video;
      if (!v || v.readyState < 2 || !this.modelReady()) return undefined;
      if (this.worker) return this.readWorker(v);
      if (performance.now() < (this.nextDetect || 0)) return undefined; // เว้นช่วงให้หน้าเว็บได้วาดเฟรม (ดูท้าย try)
      if (v.currentTime === this.lastVT) return undefined; // ยังเป็นเฟรมวิดีโอเดิม ไม่ต้องตรวจซ้ำ
      this.lastVT = v.currentTime;
      const ts = performance.now(); if (ts <= this.lastTs) return undefined; this.lastTs = ts;
      try {
        const r = this.landmarker.detectForVideo(v, ts);
        const lm = r.landmarks && r.landmarks[0];
        return this.process(lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility == null ? 0 : p.visibility })) : null, ts);
      } catch (e) { return undefined; }
      finally { const end = performance.now(); this.nextDetect = end + Math.min(end - ts, 120); } // AI รันบน thread เดียวกับหน้าเว็บ: พักเท่าเวลาที่ใช้ตรวจ แอนิเมชันจึงไม่สะดุดทุกเฟรม
    }
  }
  root.MRCam = { CameraSource };
})(typeof self !== "undefined" ? self : this);
