// 2.5 ระบบรองรับกล้อง — เปิด/ปิดกล้องเว็บแคม, เลือกกล้อง, ตรวจการเคลื่อนไหวเพื่อนับครั้ง
// หมายเหตุ: ตัวนับครั้งนี้ดูจาก "ปริมาณการเคลื่อนไหว" ของภาพเท่านั้น ไม่ได้วิเคราะห์ท่าทางร่างกาย
// (การตรวจท่าทางจริงเป็นหน้าที่ของโฟลเดอร์ 1 ระบบ AI)
'use strict';

let activeStream = null;
let activeDeviceId = ''; // กล้องที่เปิดค้างไว้ (ใช้ซ้ำข้ามรอบเกมโดยไม่ต้องขออนุญาตใหม่)

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
  // กล้องเปิดอยู่แล้วและเป็นตัวเดียวกับที่ขอ: ใช้ต่อ ไม่ต้องเปิดใหม่
  if (isCameraOn() && activeDeviceId === (deviceId || '')) {
    return attach(videoEl);
  }
  stopCamera();
  const size = { width: { ideal: 640 }, height: { ideal: 480 } };
  try {
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { ...size, deviceId: { exact: deviceId } } : size,
        audio: false,
      });
    } catch (err) {
      // รหัสกล้องที่จำไว้อาจเปลี่ยนไปแล้ว: ลองใหม่ด้วยกล้องเริ่มต้น
      if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        activeStream = await navigator.mediaDevices.getUserMedia({ video: size, audio: false });
      } else {
        throw err;
      }
    }
  } catch (err) {
    throw new Error(explainError(err));
  }
  activeDeviceId = deviceId || '';
  return attach(videoEl);
}

async function attach(videoEl) {
  videoEl.srcObject = activeStream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  // play() บางครั้งไม่ตอบกลับ (เช่นแท็บอยู่เบื้องหลัง) จึงไม่รอเกิน 3 วินาที
  try {
    await Promise.race([videoEl.play(), new Promise((r) => setTimeout(r, 3000))]);
  } catch (err) {
    // autoplay ถูกบล็อกก็ไม่เป็นไร ภาพจะเริ่มเองเมื่อพร้อม
  }
  return activeStream;
}

// ถอดภาพออกจากวิดีโอ แต่ปล่อยกล้องเปิดค้างไว้ให้ใช้ซ้ำ
function detachCamera(videoEl) {
  if (videoEl) videoEl.srcObject = null;
}

// ปิดกล้องจริง (ไฟกล้องดับ)
function stopCamera(videoEl) {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
    activeDeviceId = '';
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
  sensitivity = 7,        // 1 (ไวน้อย) - 10 (ไวมาก)
  minIntervalMs = 700,    // กันนับซ้ำ
  smoothing = 0.5,
} = {}) {
  const W = 64, H = 48;
  // สัดส่วนพิกเซลที่เปลี่ยนเพื่อถือว่า "กำลังขยับ" (high) และ "หยุดนิ่งแล้ว" (low)
  let highThreshold = 0.15 / sensitivity;
  let lowThreshold = highThreshold * 0.4;
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
      for (let k = 0; k < gray.length; k++) if (Math.abs(gray[k] - prev[k]) > 18) changed++;
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

  function setSensitivity(level) {
    const v = Math.max(1, Math.min(10, Number(level) || 7));
    highThreshold = 0.15 / v;
    lowThreshold = highThreshold * 0.4;
  }

  return { update, reset, setSensitivity, getScore: () => score, getHigh: () => highThreshold };
}

module.exports = { detachCamera, isSupported, listCameras, unlockCameraLabels, hasCameraPermission, startCamera, stopCamera, isCameraOn, createMotionRepDetector };
