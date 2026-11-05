/* camera.js - ระบบ 1.1 (กล้อง) + MediaPipe ของ 1.2 ฉบับเว็บ
 * ใช้ได้ทั้งออนไลน์/ออฟไลน์: wasm ฝังใน vendor/mp-assets.js, โมเดลฝังใน vendor/model-data.js
 * (เตรียมไฟล์.py ฝังจาก models/pose_landmarker_lite.task ตัวเดียวเท่านั้น) */
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

  class CameraSource {
    constructor() { this.landmarker = null; this.stream = null; this.video = null; this.lastTs = -1; this.mirror = true; this.smoother = new root.MR.LandmarkSmoother(); this.smooth = true; this.deviceId = ""; this.label = ""; }
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
    modelReady() { return !!this.landmarker; }
    hasEmbeddedModel() { return !!root.MR_MODEL_B64; }
    /** โหลดโมเดล pose_landmarker_lite.task ที่ฝังไว้ (ไม่ดาวน์โหลด ไม่รับไฟล์อื่น) */
    async prepareModel() {
      if (this.landmarker) return true;
      if (!root.MR_MODEL_B64) return false;
      this.landmarker = await createLandmarker(b64ToBytes(root.MR_MODEL_B64));
      return true;
    }
    async open(video, deviceId) {
      this.close();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดด้วย Chrome หรือ Edge)");
      this.stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ width: { ideal: 1280 }, height: { ideal: 720 } }, deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }), audio: false });
      this.smoother.reset(); this.lastOut = null; this.video = video; this.deviceId = deviceId || ""; video.srcObject = this.stream; this.setMirror(this.mirror); await video.play();
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
      if (!v || v.readyState < 2 || !this.landmarker) return undefined;
      if (v.currentTime === this.lastVT) return undefined; // ยังเป็นเฟรมวิดีโอเดิม ไม่ต้องตรวจซ้ำ
      this.lastVT = v.currentTime;
      const ts = performance.now(); if (ts <= this.lastTs) return undefined; this.lastTs = ts;
      try {
        const r = this.landmarker.detectForVideo(v, ts);
        const lm = r.landmarks && r.landmarks[0];
        if (!lm) { // หลุดแว็บเดียว: คงท่าล่าสุดไว้ ไม่ให้โครงกระดูกกะพริบหาย (หลุดนานเกิน 0.8 วินาทีจึงถือว่าไม่พบคน)
          if (this.lastOut && ts / 1000 - this.lastGoodT < 0.8) return this.lastOut;
          this.smoother.reset(); this.lastOut = null; return null;
        }
        let pts = lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility == null ? 0 : p.visibility }));
        if (this.smooth) pts = this.smoother.apply(pts, ts / 1000); // กรองให้ขยับลื่นก่อนส่งต่อ (ก่อนกลับกระจก)
        this.lastGoodT = ts / 1000;
        return (this.lastOut = this.mirror ? root.MR.mirrorLandmarks(pts) : pts); // กลับ x ให้ตรงกับภาพบนจอ เฉพาะโหมดกระจก (เหมือน mirrored_input ของ 1.2)
      } catch (e) { return undefined; }
    }
  }
  root.MRCam = { CameraSource };
})(typeof self !== "undefined" ? self : this);
