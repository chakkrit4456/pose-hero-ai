// สร้างวิดีโอมาสคอตพื้นหลังโปร่งใส (WebM VP9 alpha) + รูปนิ่ง จากวิดีโอตัวละครเส้นขอบเข้มบนพื้นสีอ่อน
//   node tools/make_mascot.js <วิดีโอต้นฉบับ> <โฟลเดอร์ปลายทาง> <ffmpeg>
// หน้าเกมที่เปิดจากไฟล์ในเครื่องอ่านพิกเซลของวิดีโอไม่ได้ จึงลบพื้นหลังสดในเบราว์เซอร์ไม่ได้ ต้องสร้างไฟล์ไว้ล่วงหน้า
//
// วิธีลบ: ไล่จากขอบภาพเข้ามาบนพิกเซลสีอ่อนจนชนเส้นขอบตัวละคร ฟัน/ตาที่สีขาวจึงไม่หาย
// ช่องว่างที่ถูกล้อมไว้ (เช่น ระหว่างแขนกับลำตัว) ลบเฉพาะที่ใหญ่พอและอยู่ใต้ศีรษะ
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { spawnSync } = require('child_process');
const [, , SRC, OUT, FFMPEG] = process.argv;
if (!SRC || !OUT || !FFMPEG) { console.error('ใช้: node tools/make_mascot.js <วิดีโอ> <โฟลเดอร์> <ffmpeg>'); process.exit(1); }

const HOLE_MIN = 260;      // ช่องว่างที่ถูกล้อม: เล็กกว่านี้ถือเป็นส่วนของตัวละคร (ตา ฟัน ลายผ้า)
const HEAD_LIMIT = 0.40;   // เหนือแนวนี้ (สัดส่วนความสูงภาพ) ไม่ลบช่องว่างที่ถูกล้อม เพราะเป็นใบหน้าและผ้าโพกหัว

const info = spawnSync(FFMPEG, ['-hide_banner', '-i', SRC], { encoding: 'utf8' }).stderr;
const m = /(\d{2,5})x(\d{2,5})[ ,].*?(\d+(?:\.\d+)?) fps/.exec(info);
if (!m) throw new Error('อ่านข้อมูลวิดีโอไม่ได้');
const W = +m[1], H = +m[2], FPS = +m[3], N = W * H;
const raw = spawnSync(FFMPEG, ['-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 2 ** 31 - 1 }).stdout;
const frames = Math.floor(raw.length / (N * 4));
console.log(`วิดีโอ ${W}x${H} ${FPS} fps ${frames} เฟรม`);

function keyFrame(f) {
  const bgLike = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = f[i * 4], g = f[i * 4 + 1], b = f[i * 4 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi > 150 && hi - lo < 48) bgLike[i] = 1; // สีอ่อนไม่อิ่มตัว: พื้น ลายตาราง เงา ลายน้ำ (เงาใต้เท้าเป็นม่วงอมเทา)
  }
  const bg = new Uint8Array(N), q = new Int32Array(N);
  let head = 0, tail = 0;
  const push = (i) => { if (bgLike[i] && !bg[i]) { bg[i] = 1; q[tail++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push(N - 1 - x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  const spread = () => { while (head < tail) { const i = q[head++], x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W); } };
  spread();
  // ช่องว่างที่ถูกล้อม
  const seen = new Uint8Array(N), stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!bgLike[s] || bg[s] || seen[s]) continue;
    let sp = 0, area = 0, ySum = 0; stack[sp++] = s; seen[s] = 1; const members = [];
    while (sp) {
      const i = stack[--sp], x = i % W; area++; ySum += (i / W) | 0; members.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < N - W ? i + W : -1]) if (j >= 0 && bgLike[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
    }
    if (area >= HOLE_MIN && ySum / area > H * HEAD_LIMIT) for (const i of members) bg[i] = 1;
  }
  // กินเข้าไป 1 พิกเซลเพื่อตัดขอบสีอ่อนจากการบีบอัดวิดีโอ แล้วเกลี่ยขอบให้เนียน
  const grown = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    grown[i] = bg[i] || (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]) ? 1 : 0;
  }
  const out = Buffer.from(f);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < W && b < H) { sum += grown[b * W + a]; n++; } }
    out[(y * W + x) * 4 + 3] = Math.round(255 * (1 - sum / n));
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const keyed = Buffer.alloc(frames * N * 4);
let lo = 1e9, hi = 0, top = 1e9, bottom = 0;
for (let k = 0; k < frames; k++) {
  const f = keyFrame(raw.subarray(k * N * 4, (k + 1) * N * 4));
  f.copy(keyed, k * N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3] > 128) { if (x < lo) lo = x; if (x > hi) hi = x; if (y < top) top = y; if (y > bottom) bottom = y; }
}
console.log('กรอบตัวละครตลอดวิดีโอ', { x: [lo, hi], y: [top, bottom] });
// ตัดขอบว่างออก (ใช้ขนาดเลขคู่ตามข้อกำหนดของตัวเข้ารหัส) วิดีโอจะได้เล็กและจัดวางบนหน้าเกมง่าย
const pad = 4, cx = Math.max(0, lo - pad) & ~1, cy = Math.max(0, top - pad) & ~1;
const cw = (Math.min(W, hi + pad + 1) - cx + 1) & ~1, ch = (Math.min(H, bottom + pad + 1) - cy + 1) & ~1;
const webm = path.join(OUT, 'mascot.webm');
const enc = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-vf', `crop=${cw}:${ch}:${cx}:${cy}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-an', webm], { input: keyed, maxBuffer: 2 ** 31 - 1 });
if (enc.status !== 0) throw new Error('เข้ารหัสไม่สำเร็จ: ' + enc.stderr);
// รูปนิ่ง (เบราว์เซอร์ที่ไม่รองรับวิดีโอโปร่งใส หรือผู้ใช้ที่ขอลดการเคลื่อนไหว)
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (d) => { let c = ~0; for (const x of d) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const still = keyed.subarray(0, N * 4), rows = Buffer.alloc((cw * 4 + 1) * ch);
for (let y = 0; y < ch; y++) still.copy(rows, y * (cw * 4 + 1) + 1, ((y + cy) * W + cx) * 4, ((y + cy) * W + cx + cw) * 4);
const ih = Buffer.alloc(13); ih.writeUInt32BE(cw, 0); ih.writeUInt32BE(ch, 4); ih[8] = 8; ih[9] = 6;
fs.writeFileSync(path.join(OUT, 'mascot.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`ส่งออก ${cw}x${ch}: mascot.webm ${(fs.statSync(webm).size / 1024).toFixed(0)} KB, mascot.png ${(fs.statSync(path.join(OUT, 'mascot.png')).size / 1024).toFixed(0)} KB`);
