// สร้าง Game Start.html โดยฝังโมดูล 2.1-2.4 (shim require สำหรับเบราว์เซอร์)
const fs=require('fs'),path=require('path');
const files={'2.1':'2.1 Start Game.js','2.2':'2.2 Exercise Selection.js','2.3':'2.3 Game Sequence Control.js','2.4':'2.4 Pause and End Game.js','2.5':'2.5 Camera Support.js','7.1':'../5.Game Results Summary/7.1 Score Calculation.js','7.2':'../5.Game Results Summary/7.2 Gameplay Assessment.js','7.3':'../5.Game Results Summary/7.3 Total Score Display.js','7.4':'../5.Game Results Summary/7.4 Gameplay Summary.js','7.5':'../5.Game Results Summary/7.5 Play History.js','7.6':'../5.Game Results Summary/7.6 Share Card.js','7.7':'../5.Game Results Summary/7.7 Stats View.js','8.1':'../6.Dance Game/8.1 Dance Chart.js','8.2':'../6.Dance Game/8.2 Dance Judge.js','8.3':'../6.Dance Game/8.3 Dance Result.js','6.1':'../4.Notifications and Guidance System/6.1 Incorrect Pose Alert.js','6.2':'../4.Notifications and Guidance System/6.2 Posture Correction Guidance.js','6.3':'../4.Notifications and Guidance System/6.3 Time and Rep Count Alerts.js','6.4':'../4.Notifications and Guidance System/6.4 Exercise Status Notification.js'};

// ซิงก์ไฟล์ระบบ AI จาก Web Testing System เข้า ai/ (ต้นฉบับอยู่ที่นั่นที่เดียว — ห้ามแก้สำเนาใน ai/ ตรง ๆ)
const web=path.join(__dirname,'..','Web Testing System');
const syncAi=[['js/core.js','core.js'],['js/camera.js','camera.js'],['js/sys2core.js','sys2core.js'],['js/sys2ui.js','sys2ui.js'],
  ['vendor/vision.js','vendor/vision.js'],['vendor/mp-assets.js','vendor/mp-assets.js'],['vendor/model-data.js','vendor/model-data.js'],
  ['data/exercises-data.js','data/exercises-data.js'],['data/poses-data.js','data/poses-data.js']];
if(fs.existsSync(web)){
  for(const[from,to]of syncAi){
    const a=path.join(web,from),b=path.join(__dirname,'ai',to);
    if(!fs.existsSync(a)){console.warn('ไม่พบ '+a);continue}
    const sa=fs.statSync(a),sb=fs.existsSync(b)?fs.statSync(b):null;
    if(!sb||sa.size!==sb.size||sa.mtimeMs>sb.mtimeMs){fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);console.log('ซิงก์ ai/'+to);}
  }
}else console.warn('ไม่พบโฟลเดอร์ Web Testing System — ใช้ไฟล์ใน ai/ ตามเดิม');


// ส่งออกท่า AI ทั้งหมดให้ฝั่ง Python (ใช้คู่กับ main.py --file exercises_full.json) — exercises.json เดิมของฝั่ง Python ไม่ถูกแก้
const py1=path.join(__dirname,'..','1.AI Posture Detection and Analysis (Additional)');
const srcEx=path.join(web,'data','src','exercises.json');
if(fs.existsSync(py1)&&fs.existsSync(srcEx)){
  const a=fs.readFileSync(srcEx),b=path.join(py1,'exercises_full.json');
  if(!fs.existsSync(b)||!fs.readFileSync(b).equals(a)){fs.writeFileSync(b,a);console.log('ส่งออก exercises_full.json ให้ฝั่ง Python');}
}

// ซิงก์ระบบแผ่นเต้นจากโฟลเดอร์ "ส่วน ระบบ" เข้า dance/ (ต้นฉบับอยู่ที่นั่นที่เดียว — ห้ามแก้สำเนาใน dance/)
// รูปประจำแผ่นฝังเป็น data URI จากโฟลเดอร์ "รูป" (ถ้าไม่มีโฟลเดอร์นั้น ใช้ images-data.js ที่มากับ "ส่วน ระบบ")
const danceSrc=path.join(__dirname,'..','ส่วน ระบบ'),picsDir=path.join(__dirname,'..','รูป'),danceOut=path.join(__dirname,'dance');
const writeIfChanged=(file,data)=>{const buf=Buffer.isBuffer(data)?data:Buffer.from(data);if(!fs.existsSync(file)||!fs.readFileSync(file).equals(buf)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,buf);return true}return false};
if(fs.existsSync(danceSrc)){
  let n=0;
  for(const f of ['dancepad.js','index.html','ทดสอบปุ่ม.html']){const a=path.join(danceSrc,f);if(fs.existsSync(a)&&writeIfChanged(path.join(danceOut,f),fs.readFileSync(a)))n++}
  if(fs.existsSync(picsDir)){
    const out={};
    for(const f of fs.readdirSync(picsDir)){
      if(!/\.(jpe?g|png|webp|gif)$/i.test(f))continue;
      out[f]=`data:image/${path.extname(f).slice(1).toLowerCase().replace('jpg','jpeg')};base64,`+fs.readFileSync(path.join(picsDir,f)).toString('base64');
    }
    if(writeIfChanged(path.join(danceOut,'images-data.js'),'window.PAD_IMAGES='+JSON.stringify(out)+';\n'))n++;
  }else if(fs.existsSync(path.join(danceSrc,'images-data.js'))&&writeIfChanged(path.join(danceOut,'images-data.js'),fs.readFileSync(path.join(danceSrc,'images-data.js'))))n++;
  if(n)console.log('ซิงก์ระบบแผ่นเต้น '+n+' ไฟล์ -> dance/');
}else console.warn('ไม่พบโฟลเดอร์ "ส่วน ระบบ" — โหมดแผ่นเต้นจะใช้งานไม่ได้');
// สแกนโฟลเดอร์ Music แล้วเขียนรายชื่อเพลงลง music-list.js (เบราว์เซอร์อ่านรายชื่อไฟล์ในโฟลเดอร์เองไม่ได้)
const musicDir=path.join(__dirname,'..','Music');
const musicExt=/\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i;
// ไฟล์ในโฟลเดอร์ Music ตรง ๆ = เพลงทั่วไป (g:'')   ไฟล์ใน Music/slow, Music/mid, Music/fast = เพลงตามจังหวะ (ใช้ในโหมดอัตโนมัติ)
const musicGroups=['slow','mid','fast'];
const listAudio=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()&&musicExt.test(e.name)).map(e=>e.name).sort():[];
const tracks=[];
listAudio(musicDir).forEach(f=>tracks.push({u:'../Music/'+encodeURIComponent(f),g:''}));
musicGroups.forEach(g=>listAudio(path.join(musicDir,g)).forEach(f=>tracks.push({u:'../Music/'+g+'/'+encodeURIComponent(f),g})));
fs.writeFileSync(path.join(__dirname,'music-list.js'),'window.MR_MUSIC='+JSON.stringify(tracks)+';\n');
console.log('เพลง: '+tracks.length+' ไฟล์');
let m='const __src={},__cache={};function require(p){const k=p.replace("./","").slice(0,3);if(__cache[k])return __cache[k].exports;const mod={exports:{}};__cache[k]=mod;__src[k](mod,mod.exports,require);return mod.exports}\n';
for(const[k,f]of Object.entries(files)){
  const src=fs.readFileSync(path.join(__dirname,f),'utf8').replace(/<\/script/gi,'<\/script');
  m+=`__src['${k}']=function(module,exports,require){${src}\n};\n`;
}
const t=fs.readFileSync(path.join(__dirname,'Game Start.template.html'),'utf8');
fs.writeFileSync(path.join(__dirname,'Game Start.html'),t.replace('/*__MODULES__*/',()=>m));
