// สร้างชุดไฟล์สำหรับขึ้นเว็บ (GitHub Pages / เว็บโฮสต์ทั่วไป) ไว้ที่ dist/
//   node "3.Game Control System/build-web.js"                 ไม่รวมเพลง (ค่าเริ่มต้น เพราะเพลงมักมีลิขสิทธิ์)
//   node "3.Game Control System/build-web.js" --with-music    รวมเพลงในโฟลเดอร์ Music (ใช้เมื่อคุณมีสิทธิ์เผยแพร่เพลงเหล่านั้น)
//   node "3.Game Control System/build-web.js" --out <โฟลเดอร์>
// ผลลัพธ์: index.html + ai/ + manifest + sw.js (ใช้ออฟไลน์ได้หลังเปิดครั้งแรก, ติดตั้งเป็นแอปได้) + .nojekyll
// กล้องของเบราว์เซอร์ใช้ได้เฉพาะหน้าเว็บที่เป็น https หรือ localhost — GitHub Pages เป็น https อยู่แล้ว
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const withMusic = argv.includes('--with-music');
const outIdx = argv.indexOf('--out');
const OUT = path.resolve(outIdx >= 0 ? argv[outIdx + 1] : path.join(__dirname, '..', 'dist'));

require('./build.js'); // สร้าง Game Start.html + ซิงก์ ai/ ให้ล่าสุดก่อน

const rootDir = path.join(__dirname, '..');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---- index.html (เพิ่ม manifest / ไอคอน / ลงทะเบียน service worker)
let html = fs.readFileSync(path.join(__dirname, 'Game Start.html'), 'utf8');
// Pin every external script to its actual contents. Also fail the build rather
// than publishing HTML that references a missing script.
const scriptFiles=[];
html=html.replace(/<script src="([^"]+)"/g,(tag,src)=>{
  const file=path.join(__dirname,src);
  if(!fs.existsSync(file)||!fs.statSync(file).size)throw new Error('Missing release script: '+src);
  scriptFiles.push(src);
  const revision=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,16);
  return '<script data-cfasync="false" src="'+src+'?v='+revision+'"';
});
// Preserve script execution order when the site is behind Cloudflare Rocket Loader.
html=html.replace(/<script>/g,'<script data-cfasync="false">');
const headTags = '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#2563eb">';
if (!html.includes('name="viewport"')) throw new Error('ไม่พบ meta viewport ใน Game Start.html');
html = html.replace(/(<meta name="viewport"[^>]*>)/, `$1${headTags}`);
const swReg = `<script data-cfasync="false">if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0){
  const hadController=!!navigator.serviceWorker.controller;let refreshed=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!refreshed){refreshed=true;location.reload();}});
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}</script>`;
const endBody = html.lastIndexOf('</body>');
html = html.slice(0, endBody) + swReg + html.slice(endBody);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- ระบบ AI
fs.cpSync(path.join(__dirname, 'ai'), path.join(OUT, 'ai'), { recursive: true });
fs.cpSync(path.join(__dirname, 'assets'), path.join(OUT, 'assets'), { recursive: true });
if (fs.existsSync(path.join(__dirname, 'dance'))) fs.cpSync(path.join(__dirname, 'dance'), path.join(OUT, 'dance'), { recursive: true }); // โหมดแผ่นเต้น

// ---- มาสคอตหน้าเมนู (ไม่คัดลอกวิดีโอต้นฉบับใน vid/)
fs.mkdirSync(path.join(OUT, 'vid'), { recursive: true });
['mascot.webm', 'mascot.png'].forEach((f) => fs.copyFileSync(path.join(__dirname, 'vid', f), path.join(OUT, 'vid', f)));

// ---- เพลง
const musicExt = /\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i;
const tracks = [];
if (withMusic) {
  const src = path.join(rootDir, 'Music');
  const add = (dir, group) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && musicExt.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => {
      const rel = (group ? group + '/' : '') + e.name;
      fs.mkdirSync(path.dirname(path.join(OUT, 'Music', rel)), { recursive: true });
      fs.copyFileSync(path.join(dir, e.name), path.join(OUT, 'Music', rel));
      tracks.push({ u: 'Music/' + rel.split('/').map(encodeURIComponent).join('/'), g: group });
    });
  };
  add(src, '');
  ['slow', 'mid', 'fast'].forEach((g) => add(path.join(src, g), g));
}
fs.writeFileSync(path.join(OUT, 'music-list.js'), 'window.MR_MUSIC=' + JSON.stringify(tracks) + ';\n');
// music-list.js differs in a web release (Music/ instead of ../Music/).
html=html.replace(/music-list\.js\?v=[a-f0-9]+/,'music-list.js?v='+crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,'music-list.js'))).digest('hex').slice(0,16));
fs.writeFileSync(path.join(OUT,'index.html'),html);
fs.writeFileSync(path.join(OUT,'release-manifest.json'),JSON.stringify({scripts:scriptFiles},null,2));

// ---- manifest + ไอคอน
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Pose Hero AI — ขยับกาย ทลายเมื่อย',
  short_name: 'Pose Hero AI',
  description: 'เกมบริหารร่างกายสำหรับคนทำงานออฟฟิศ ใช้ AI จับท่าทางจากกล้อง',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#fff7e0',
  theme_color: '#ff6b9d',
  lang: 'th',
  icons: [{ src: 'assets/pose-hero-logo-mascot-v3.png', sizes: '1920x819', type: 'image/png', purpose: 'any' }],
}, null, 2));
fs.writeFileSync(path.join(OUT, 'icon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="#ff6b9d"/>' +
  '<g stroke="#fff" stroke-width="30" stroke-linecap="round" fill="none"><circle cx="256" cy="130" r="38" fill="#fff"/>' +
  '<path d="M256 180v130M256 215L160 150M256 215L352 150M256 310L190 420M256 310L322 420"/></g></svg>\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// ---- service worker: เก็บไฟล์หลักไว้ในเครื่องหลังเปิดครั้งแรก (เพลงไม่เก็บ เพราะไฟล์ใหญ่และต้องสตรีมแบบ Range)
const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name), base + e.name + '/') : [base + e.name]);
const files = walk(OUT).filter((f) => !f.startsWith('Music/') && f !== 'sw.js' && f !== '.nojekyll');
const hash = crypto.createHash('sha1');
files.forEach((f) => { hash.update(f);hash.update(fs.readFileSync(path.join(OUT,f))); });
hash.update(html);
const version = 'mr-' + hash.digest('hex').slice(0, 10);
const pre = files.map((f) => (f === 'index.html' ? './' : f.split('/').map(encodeURIComponent).join('/')));
fs.writeFileSync(path.join(OUT, 'sw.js'), `// สร้างอัตโนมัติโดย build-web.js — อย่าแก้ตรงนี้
const VERSION = ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(pre)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const url=new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin || r.headers.has('range') || url.pathname.includes('/Music/')) return;
  e.respondWith((async()=>{
    const cache=await caches.open(VERSION).catch(()=>null);
    // Network first prevents a previous deployment from pinning HTML/JS forever.
    try{
      const res=await fetch(r);
      if(cache&&res.ok&&(!url.pathname.endsWith('.js')||!(res.headers.get('content-type')||'').includes('text/html'))){try{await cache.put(r,res.clone());}catch(error){/* Full storage must not break a successful network response. */}}
      return res;
    }catch(error){
      const hit=cache&&await cache.match(r);if(hit)return hit;
      // Precache uses unversioned paths; only this exact release may supply them.
      if(cache&&url.pathname.endsWith('.js')){url.search='';const script=await cache.match(url.href);if(script)return script;}
      if(cache&&r.mode==='navigate'){const home=await cache.match('./');if(home)return home;}
      // Never return index.html in place of JavaScript or images.
      return Response.error();
    }
  })());
});
`);

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
const total = walk(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`สร้าง ${OUT} เสร็จ: ${walk(OUT).length} ไฟล์ รวม ${mb(total)}` + (withMusic ? ` (รวมเพลง ${tracks.length} ไฟล์)` : ' (ไม่รวมเพลง)'));
console.log('เวอร์ชันแคชออฟไลน์: ' + version);
