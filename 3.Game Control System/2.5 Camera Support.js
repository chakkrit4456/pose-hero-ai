// 2.5 ระบบรองรับกล้อง — เปิด/ปิดกล้องเว็บแคม, เลือกกล้อง, ตรวจการเคลื่อนไหวเพื่อนับครั้ง
// หมายเหตุ: ตัวนับครั้งนี้ดูจาก "ปริมาณการเคลื่อนไหว" ของภาพเท่านั้น ไม่ได้วิเคราะห์ท่าทางร่างกาย
// (การตรวจท่าทางจริงเป็นหน้าที่ของโฟลเดอร์ 1 ระบบ AI)
'use strict';

let activeStream = null;

function isSupported() {
  return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function explainError(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณากดอนุญาตในเบราว์เซอร์';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'ไม่พบกล้องที่เลือก';
    case 'NotReadableError':
      return 'กล้องถูกใช้งานโดยโปรแกรมอื่นอยู่';
    default:
      return 'เปิดกล้องไม่สำเร็จ' + (err && err.message ? ': ' + err.message : '');
  }
}

// คืนรายการกล้อง (ชื่อจะแสดงครบหลังผู้ใช้อนุญาตกล้องแล้ว)
async function listCameras() {
  if (!isSupported() || !navigator.mediaDevices.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `กล้อง ${i + 1}`, named: !!d.label }));
}

// เบราว์เซอร์จะบอกชื่อกล้องจริงก็ต่อเมื่อผู้ใช้อนุญาตกล้องแล้ว: ขอสิทธิ์ครั้งเดียวแล้วปิดทันที
async function unlockCameraLabels() {
  if (!isSupported()) return false;
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach((t) => t.stop());
    return true;
  } catch (err) {
    return false;
  }
}

async function hasCameraPermission() {
  try {
    const p = await navigator.permissions.query({ name: 'camera' });
    return p.state === 'granted';
  } catch (err) {
    return false;
  }
}

async function startCamera(videoEl, deviceId) {
  if (!isSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับการใช้กล้อง (ต้องเปิดผ่าน https หรือ localhost/ไฟล์ในเครื่อง)');
  stopCamera(videoEl);
  try {
    const video = { width: { ideal: 640 }, height: { ideal: 480 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    activeStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    throw new Error(explainError(err));
  }
  videoEl.srcObject = activeStream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  await videoEl.play();
  return activeStream;
}

function stopCamera(videoEl) {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}

function isCameraOn() {
  return !!activeStream && activeStream.getTracks().some((t) => t.readyState === 'live');
}

// ตัวนับครั้งจากการเคลื่อนไหว: เปรียบเทียบภาพย่อ 64x48 ระหว่างเฟรม
// นับ 1 ครั้งเมื่อการเคลื่อนไหวพุ่งเกิน highThreshold แล้วลดลงต่ำกว่า lowThreshold (hysteresis)
function createMotionRepDetector({
  onRep,
  highThreshold = 0.06,   // สัดส่วนพิกเซลที่เปลี่ยนเพื่อถือว่า "กำลังขยับ"
  lowThreshold = 0.025,
  minIntervalMs = 700,    // กันนับซ้ำ
  smoothing = 0.5,
} = {}) {
  const W = 64, H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let prev = null;
  let score = 0;
  let moving = false;
  let lastRepAt = -Infinity;

  function update(videoEl, nowMs) {
    if (!videoEl || videoEl.readyState < 2) return score;
    ctx.drawImage(videoEl, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const gray = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    if (prev) {
      let changed = 0;
      for (let k = 0; k < gray.length; k++) if (Math.abs(gray[k] - prev[k]) > 25) changed++;
      const raw = changed / gray.length;
      score = score * smoothing + raw * (1 - smoothing);
      if (!moving && score >= highThreshold) {
        moving = true;
      } else if (moving && score <= lowThreshold) {
        moving = false;
        if (nowMs - lastRepAt >= minIntervalMs) {
          lastRepAt = nowMs;
          if (onRep) onRep();
        }
      }
    }
    prev = gray;
    return score;
  }

  function reset() {
    prev = null;
    score = 0;
    moving = false;
    lastRepAt = -Infinity;
  }

  return { update, reset, getScore: () => score, highThreshold };
}

module.exports = { isSupported, listCameras, unlockCameraLabels, hasCameraPermission, startCamera, stopCamera, isCameraOn, createMotionRepDetector };
