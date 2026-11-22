// Game shell: one START button in the lobby, every other action lives in a ☰ dropdown per scene.
(function(){
const $=id=>document.getElementById(id);
const visible=el=>!!el&&!el.hidden&&el.getClientRects().length>0;
const menus=[];

function wire(root){
  const tog=root.querySelector('.gm-toggle'),panel=root.querySelector('.gm-panel');
  const close=()=>{panel.hidden=true;tog.setAttribute('aria-expanded','false')};
  tog.onclick=e=>{e.stopPropagation();const open=panel.hidden;menus.forEach(m=>m.close());if(open){root.refresh&&root.refresh();panel.hidden=false;tog.setAttribute('aria-expanded','true')}};
  panel.addEventListener('click',e=>{if(e.target.closest('button'))setTimeout(close,0)});
  const m={root,close};menus.push(m);return m;
}
document.addEventListener('click',e=>{menus.forEach(m=>{if(!m.root.contains(e.target))m.close()})});
document.addEventListener('keydown',e=>{if(e.key==='Escape')menus.forEach(m=>m.close())});

// ----- Lobby -----
// START always opens the main 20-minute mode; other modes launch straight from ☰.
document.querySelectorAll('#home-menu [data-mode]').forEach(b=>{b.removeAttribute('role');b.addEventListener('click',()=>$(b.dataset.mode).click())});
$('gl-mode').textContent='โหมดหลัก · ยืดเหยียด + ออกกำลังกาย 20 นาที';
// START -> choose difficulty (all 20 minutes) -> main mode
const LV=[['easy','ง่าย','🌱','ท่าเบา ช้า ก้าวข้างเบา ๆ','ช้า'],['normal','ปานกลาง','🔥','จังหวะปกติ มียกเข่า','ปกติ'],['hard','ยาก','⚡','เร็ว ยกเข่า ย่อเข่า ก้าว 4 ทิศ','เร็ว']];
const lvOv=document.createElement('div');lvOv.className='notice-ov lv-ov';lvOv.hidden=true;
lvOv.innerHTML='<div class="notice-card lv-card" role="dialog" aria-modal="true" aria-labelledby="lv-t"><button type="button" class="ph-x" aria-label="ปิด">✕</button><p class="ph-kicker">โหมดหลัก · 20 นาที</p><h2 id="lv-t">เลือกระดับความยาก</h2><div class="lv-grid">'+
  LV.map(l=>'<button type="button" class="lv-opt lv-'+l[0]+'" data-lv="'+l[0]+'"><span class="lv-ic">'+l[2]+'</span><b>'+l[1]+'</b><small>'+l[3]+'</small><i>ความเร็ว: '+l[4]+' · 20 นาที</i></button>').join('')+
  '</div><p class="ph-small">ทุกระดับ: ยืดเหยียด 5 นาที → ออกกำลังกาย + แผ่นเต้น 10 นาที → ยืดเหยียด 5 นาที</p></div>';
document.body.append(lvOv);
lvOv.querySelector('.ph-x').onclick=()=>{lvOv.hidden=true};
lvOv.addEventListener('click',e=>{if(e.target===lvOv)lvOv.hidden=true});
let lastLv='normal';try{lastLv=localStorage.getItem('pose-hero-level')||'normal'}catch(e){}
lvOv.querySelectorAll('[data-lv]').forEach(b=>b.onclick=()=>{lvOv.hidden=true;try{localStorage.setItem('pose-hero-level',b.dataset.lv)}catch(e){}heroLevel=b.dataset.lv;openInputSetup();});
$('gl-start').onclick=()=>{lvOv.hidden=false;lvOv.querySelectorAll('[data-lv]').forEach(b=>b.classList.toggle('last',b.dataset.lv===lastLv));(lvOv.querySelector('.last')||lvOv.querySelector('[data-lv]')).focus();try{lastLv=localStorage.getItem('pose-hero-level')||lastLv}catch(e){}};
wire($('home-menu'));

// ----- Other scenes: move secondary buttons into a menu, replace "back" with an icon -----
const SCENES={
  setup:['setup-routines','setup-level','thumb-motion','all','clr','cam-setup'],
  settings:['s-bk','s-bk-in','s-notice'],
  stats:['st-clear'],
  routines:['rt-cam'],
  camsetup:['cs-done'],
  next:['nx-sum','nx-skip'],
  dance:['d-map','d-skip','d-reset','dr-ex','dr-menu','dr-home','dr-share','dr-save','dr-copy'],
  fire:['ff-map','ff-skip','fr-ex','fr-menu','fr-home','fr-save','fr-copy'],
  play:['rep','skip','camtog','mnext','end'],
  warmup:['เหยียบแผ่นช่องที่สว่างพร้อมทำท่าไปด้วยนะครับ!','วอร์มอัพกัน ก้าวตามแผ่นพร้อมยืดตัวครับ'],
  combo:['ได้เวลาออกกำลังกายแล้ว! เร่งจังหวะกันครับ','เข้าช่วงออกกำลังกาย ก้าวตามแผ่นให้ทันนะครับ!'],
  cooldown:['ยืดเหยียดผ่อนคลายกันครับ','เก่งมาก! มาคูลดาวน์กันครับ'],
  done:['weak','tohome','dl','prt','share-go','share-save','share-copy'],
  level:[],manage:[]
};
Object.keys(SCENES).forEach(id=>{
  const sec=$(id);if(!sec)return;
  const items=SCENES[id].map(bid=>{const b=$(bid);if(!b)return null;const ph=document.createElement('span');ph.className='gm-ph';b.before(ph);return{b,ph}}).filter(Boolean);
  if(items.length){
    const root=document.createElement('div');root.className='gm';
    root.innerHTML='<button class="gm-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="เมนู">'+(id==='play'?'⏸':'☰')+'</button><div class="gm-panel" role="menu" hidden></div>';
    const panel=root.querySelector('.gm-panel');
    items.forEach(({b})=>{b.classList.remove('p');panel.append(b)});
    // Only list buttons whose original spot is currently on screen (e.g. result buttons only after a round).
    root.refresh=()=>{let n=0;items.forEach(({b,ph})=>{const on=visible(ph.parentElement)&&!b.hidden;b.style.display=on?'':'none';if(on)n++});root.querySelector('.gm-toggle').style.display=n?'':'none';return n};
    sec.prepend(root);wire(root);
    setInterval(()=>{if(!sec.hidden)root.refresh()},600);
    if(id==='play'){const p=$('pause');if(p){panel.prepend(p);p.classList.add('p');
      // Opening the in-game menu pauses the round, like a console game.
      root.querySelector('.gm-toggle').addEventListener('click',()=>{if(!panel.hidden&&p.textContent.trim()==='หยุด')p.click()})}}
  }
  const backs=[...sec.querySelectorAll('.back')];
  if(backs.length){
    const bk=document.createElement('button');bk.type='button';bk.className='gm-back';bk.setAttribute('aria-label','กลับ');bk.textContent='◀';
    const target=()=>backs.find(b=>visible(b.parentElement));
    bk.onclick=()=>{const t=target();if(t)t.click()};
    sec.prepend(bk);
    setInterval(()=>{if(!sec.hidden)bk.style.display=target()?'':'none'},600);
  }
});
})();

// Personal-trainer mascot: pops up with short lines at key moments of a round.
(function(){
const box=document.createElement('div');box.className='coach';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.hidden=true;
box.innerHTML='<video src="vid/mascot.webm" poster="vid/mascot.png" muted loop playsinline aria-hidden="true"></video><p class="coach-say"></p>';
document.body.append(box);
const vid=box.querySelector('video'),say=box.querySelector('.coach-say');
const pick=a=>a[Math.floor(Math.random()*a.length)];
const L={
  start:n=>pick(['มาเริ่มท่า "'+n+'" กัน! ดูผมแล้วทำตามนะครับ','ท่าต่อไป "'+n+'" ทำตามผมเลยครับ!','พร้อมไหมครับ? "'+n+'" ไปกันเลย!']),
  rep:['ดีมากครับ!','เยี่ยมเลย!','มากกว่านี้อีก!','สู้ๆ นะครับ!','จังหวะดีมาก ทำต่อเลย!','ยืดให้สุดอีกนิดครับ!'],
  half:['ครึ่งทางแล้ว สู้ๆ นะครับ!','มาได้ครึ่งทางแล้ว เก่งมาก!'],
  near:['ใกล้แล้ว! อีกนิดเดียว!','อีกนิดเดียวครับ สู้ๆ!','ใกล้แล้ว มากกว่านี้อีก!'],
  idle:['ขยับตามผมเลยครับ มากกว่านี้อีก!','ค่อยๆ ทำตามผมนะครับ ไม่ต้องรีบ','ยังไหวไหมครับ? สู้ๆ!'],
  time:['เหลือ 10 วินาที เร่งอีกนิดครับ!','ใกล้หมดเวลาแล้ว สู้ๆ!'],
  rest:['พักหายใจลึกๆ ก่อนนะครับ','เก่งมาก! พักแป๊บนึงครับ'],
  combo:['ต่อไปใช้แผ่นเต้นด้วยนะครับ! เหยียบช่องที่สว่าง','ได้เวลาออกกำลังกายพร้อมแผ่นเต้นแล้วครับ!'],
  cooldown:['ยืดเหยียดผ่อนคลายกันครับ','เก่งมาก! มาคูลดาวน์กันครับ'],
  done:['สุดยอด! จบแล้ว เก่งมากครับ!','เยี่ยมมาก! วันนี้ทำได้ดีมากครับ']
};
let hideT=0,lastSay=0;
window.PHCoach=t=>pop(t,true);
function pop(text,force){
  const now=Date.now();if(!force&&now-lastSay<4500)return;lastSay=now;
  say.textContent=text;box.hidden=false;box.classList.remove('coach-in');void box.offsetWidth;box.classList.add('coach-in');
  const p=vid.play();if(p&&p.catch)p.catch(()=>{});
  clearTimeout(hideT);hideT=setTimeout(()=>{box.hidden=true;vid.pause()},3200);
}
// Speak only at meaningful moments, never on every rep: near the target, halfway (long sets), time running out, finish.
let exId=null,reps=-1,half=false,near=false,timeWarn=false,lastStatus='';
const GAP=20000; // at most one non-critical line every 20 s
setInterval(()=>{
  let s,p;try{s=st;p=s.status==='playing'?P.getProgress(s):null}catch(e){return}
  const playOn=!document.getElementById('play').hidden;
  if(lastStatus!=='finished'&&s.status==='finished'&&exId){pop(pick(L.done),true);exId=null}
  lastStatus=s.status;
  if(!playOn){box.hidden=true;exId=null;box.dataset.phase='';return}
  if(!p||!p.exercise||p.resting)return;
  if(p.exercise.id!==exId&&p.exercise.phase&&p.exercise.phase!==box.dataset.phase){box.dataset.phase=p.exercise.phase;if(L[p.exercise.phase])pop(pick(L[p.exercise.phase]),true)}
  if(p.exercise.id!==exId){exId=p.exercise.id;reps=p.repsDone;half=near=timeWarn=false;return}
  const goal=p.exercise.reps||0;
  if(p.repsDone>reps){reps=p.repsDone;
    if(goal>=3&&!near&&reps<goal&&goal-reps<=2){near=true;pop(pick(L.near),true)}
    else if(goal>=8&&!half&&reps>=goal/2&&Date.now()-lastSay>GAP){half=true;pop(pick(L.half),true)}
  }
  if(!timeWarn&&reps<goal&&p.timeLeftSec!=null&&p.timeLeftSec<=10&&p.timeLeftSec>0&&Date.now()-lastSay>GAP){timeWarn=true;pop(pick(L.time),true)}
},400);
})();

// Rep counter ring shows how much of the current block's time has passed.
setInterval(()=>{try{const c=st.current,b=document.getElementById('big');if(!b)return;
  const f=c&&!c.resting&&c.exercise?Math.min(1,c.elapsedMs/(c.exercise.durationSec*1000)):0;b.style.setProperty('--blk',(f*100).toFixed(1)+'%');}catch(e){}},200);


// ===== Online players, scores and ranking (server/app.py) =====
(function(){
const $=id=>document.getElementById(id);
const TOKEN='pose-hero-token';
const TIER_TH={Bronze:'บรอนซ์',Silver:'ซิลเวอร์',Gold:'โกลด์',Platinum:'แพลทินัม',Diamond:'ไดมอนด์'};
const TIER_ICON={Bronze:'🥉',Silver:'🥈',Gold:'🥇',Platinum:'💠',Diamond:'💎'};
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let token=null,me=null,online=null;
try{token=localStorage.getItem(TOKEN)}catch(e){}

async function api(method,path,body){
  const r=await fetch('/api'+path,{method,headers:Object.assign({'Content-Type':'application/json'},token?{Authorization:'Bearer '+token}:{}),body:body?JSON.stringify(body):undefined});
  let data={};try{data=await r.json()}catch(e){}
  if(!r.ok)throw Object.assign(new Error(data.error||('HTTP '+r.status)),{status:r.status});
  return data;
}
async function checkOnline(){
  if(location.protocol==='file:'){online=false;return false}
  try{await api('GET','/health');online=true}catch(e){online=false}
  return online;
}
function setToken(t){token=t;try{t?localStorage.setItem(TOKEN,t):localStorage.removeItem(TOKEN)}catch(e){}}

// ---- lobby chip ----
function paintChip(){
  const hello=$('hello'),lv=$('lvnow');if(!hello)return;
  if(me){
    hello.textContent=me.name;
    lv.textContent=TIER_ICON[me.tier]+' '+TIER_TH[me.tier]+' · '+me.points+' แต้ม'+(me.rank?' · อันดับ #'+me.rank:'');
    try{if(typeof cfg!=='undefined'&&cfg.playerName!==me.name){cfg.playerName=me.name;st.playerName=me.name}}catch(e){}
  }else if(online===false){lv.textContent='โหมดออฟไลน์ — คะแนนไม่ขึ้นแรงค์'}
  else{hello.textContent='แตะเพื่อเข้าสู่ระบบ';lv.textContent='เข้าสู่ระบบเพื่อเก็บคะแนนและแรงค์'}
}
async function refreshMe(){
  if(!token||!online){me=null;paintChip();return}
  try{me=await api('GET','/players/me')}catch(e){if(e.status===401)setToken(null);me=null}
  paintChip();
}

// ---- modal ----
const ov=document.createElement('div');ov.className='notice-ov ph-ov';ov.hidden=true;
ov.innerHTML='<div class="notice-card ph-card" role="dialog" aria-modal="true"><button type="button" class="ph-x" aria-label="ปิด">✕</button><div class="ph-body"></div></div>';
document.body.append(ov);
const body=ov.querySelector('.ph-body');
ov.querySelector('.ph-x').onclick=()=>{ov.hidden=true};
ov.addEventListener('click',e=>{if(e.target===ov)ov.hidden=true});
document.addEventListener('keydown',e=>{if(e.key==='Escape')ov.hidden=true});
function open(html){body.innerHTML=html;ov.hidden=false}

function playerCard(){
  if(online===false)return open('<h2>โหมดออฟไลน์</h2><p>เชื่อมต่อเซิร์ฟเวอร์เกมไม่ได้ ตอนนี้เล่นได้ตามปกติ แต่คะแนนจะไม่ขึ้นตารางแรงค์</p>');
  if(me){
    const nt=me.next,pct=nt?Math.min(100,Math.round(me.points/nt.at*100)):100;
    open(`<p class="ph-kicker">ผู้เล่น</p><h2>${esc(me.name)}</h2>
      <div class="ph-tier"><span class="ph-badge t-${me.tier}">${TIER_ICON[me.tier]} ${TIER_TH[me.tier]}</span><b>${me.points}</b> แต้ม</div>
      <div class="ph-bar"><i style="width:${pct}%"></i></div><p class="ph-small">${nt?'อีก '+(nt.at-me.points)+' แต้ม ถึง '+TIER_TH[nt.name]:'แรงค์สูงสุดแล้ว!'}</p>
      <div class="ph-stats"><div><b>${me.rank?'#'+me.rank:'-'}</b><span>อันดับ</span></div><div><b>${me.best}</b><span>คะแนนสูงสุด</span></div><div><b>${me.rounds}</b><span>รอบที่เล่น</span></div></div>
      <div class="row"><button type="button" class="p" data-a="rank">🏆 ดูตารางอันดับ</button><button type="button" data-a="out">ออกจากระบบ / เปลี่ยนผู้เล่น</button></div>`);
    body.querySelector('[data-a=rank]').onclick=()=>leaderboard('all');
    body.querySelector('[data-a=out]').onclick=()=>{setToken(null);me=null;paintChip();playerCard()};
    return;
  }
  open(`<p class="ph-kicker">ผู้เล่น</p><h2>เข้าสู่ระบบ</h2><p class="ph-small">ใช้ชื่อผู้เล่นของคุณ + PIN 4 หลัก เพื่อเก็บคะแนนและแรงค์แยกของแต่ละคน</p>
    <form class="ph-form"><label>ชื่อผู้เล่น<input name="name" maxlength="20" autocomplete="nickname" required></label>
    <label>PIN 4 หลัก<input name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="off" required></label>
    <p class="ph-err" role="alert"></p>
    <div class="row"><button type="submit" class="p" data-a="login">เข้าสู่ระบบ</button><button type="button" data-a="new">สร้างผู้เล่นใหม่</button></div></form>`);
  const f=body.querySelector('form'),err=body.querySelector('.ph-err');
  const go=async path=>{
    err.textContent='';const name=f.name.value.trim(),pin=f.pin.value.trim();
    if(name.length<2){err.textContent='กรอกชื่ออย่างน้อย 2 ตัวอักษร';return}
    if(!/^\d{4}$/.test(pin)){err.textContent='PIN ต้องเป็นตัวเลข 4 หลัก';return}
    try{const r=await api('POST',path,{name,pin});setToken(r.token);me=r.player;paintChip();playerCard()}catch(e){err.textContent=e.message}
  };
  f.onsubmit=e=>{e.preventDefault();go('/login')};
  body.querySelector('[data-a=new]').onclick=()=>go('/players');
  f.name.focus();
}

async function leaderboard(period){
  if(online===false)return playerCard();
  open('<p class="ph-kicker">ตารางอันดับ</p><h2>🏆 อันดับผู้เล่น</h2><p class="ph-small">กำลังโหลด…</p>');
  let rows=[];try{rows=(await api('GET','/leaderboard?period='+period)).rows}catch(e){body.querySelector('.ph-small').textContent=e.message;return}
  const list=rows.length?rows.map(r=>`<li class="${me&&r.id===me.id?'me':''}"><span class="ph-rk r${r.rank}">${r.rank}</span><span class="ph-nm">${esc(r.name)}<small>${TIER_ICON[r.tier]} ${TIER_TH[r.tier]} · ${r.rounds} รอบ · สูงสุด ${r.best}</small></span><b>${r.points}</b></li>`).join(''):'<li class="ph-empty">ยังไม่มีคะแนน เล่นจบรอบแรกเพื่อขึ้นตาราง!</li>';
  open(`<p class="ph-kicker">ตารางอันดับ</p><h2>🏆 อันดับผู้เล่น</h2>
    <div class="ph-tabs"><button type="button" data-p="all" class="${period==='all'?'on':''}">ตลอดกาล</button><button type="button" data-p="week" class="${period==='week'?'on':''}">7 วันล่าสุด</button></div>
    <ol class="ph-list">${list}</ol>${me?'':'<p class="ph-small"><button type="button" data-a="login" class="p">เข้าสู่ระบบเพื่อร่วมแข่ง</button></p>'}`);
  body.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>leaderboard(b.dataset.p));
  const l=body.querySelector('[data-a=login]');if(l)l.onclick=playerCard;
}

// ---- hooks into the lobby ----
const chip=document.querySelector('.gl-hud');
if(chip){chip.setAttribute('role','button');chip.tabIndex=0;chip.style.cursor='pointer';chip.onclick=playerCard;chip.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();playerCard()}};}
const panel=document.querySelector('#home-menu .gm-panel');
if(panel){
  const lab=document.createElement('p');lab.className='gm-label';lab.textContent='แข่งขัน';
  const b1=document.createElement('button');b1.type='button';b1.innerHTML='🏆 ตารางอันดับ <small>ดูแรงค์ผู้เล่นทุกคน</small>';b1.onclick=()=>leaderboard('all');
  const b2=document.createElement('button');b2.type='button';b2.innerHTML='👤 ผู้เล่น <small>เข้าสู่ระบบ / เปลี่ยนผู้เล่น</small>';b2.onclick=playerCard;
  panel.prepend(lab,b1,b2);
}

// ---- after a finished round ----
window.PHOnline={
  get player(){return me},
  async roundFinished({mode,summary,stepAcc,durationSec}){
    const box=$('online-sum');if(!box)return;
    const a=summary.assessment||{},base=summary.scores?summary.scores.totalScore:0;
    const score=Math.round(stepAcc==null?base:base*0.7+stepAcc*0.3);
    box.hidden=false;
    if(a.quit){box.innerHTML='<p class="ph-small">ออกก่อนจบรอบ — ไม่นับแรงค์</p>';return}
    if(!online){box.innerHTML='<p class="ph-small">โหมดออฟไลน์ — คะแนน '+score+' ไม่ขึ้นแรงค์</p>';return}
    if(!me){box.innerHTML='<div class="ph-result"><b>'+score+'</b> แต้ม<p class="ph-small">เข้าสู่ระบบเพื่อบันทึกคะแนนและแรงค์</p><button type="button" class="p" data-a="login">เข้าสู่ระบบ</button></div>';box.querySelector('[data-a=login]').onclick=playerCard;return}
    const prevTier=me.tier;
    try{
      const r=await api('POST','/scores',{mode,score,reps:summary.stats?summary.stats.totalReps||0:0,stepAccuracy:stepAcc,durationSec:Math.max(30,Math.min(1500,durationSec)),completed:true});
      me=r.player;paintChip();
      box.innerHTML=`<div class="ph-result"><p class="ph-kicker">บันทึกคะแนนแล้ว</p><b>+${score}</b> แต้ม
        <div class="ph-tier"><span class="ph-badge t-${me.tier}">${TIER_ICON[me.tier]} ${TIER_TH[me.tier]}</span> ${me.points} แต้ม · อันดับ #${me.rank}</div>
        ${prevTier!==me.tier?'<p class="ph-up">🎉 เลื่อนแรงค์เป็น '+TIER_TH[me.tier]+'!</p>':''}
        <button type="button" data-a="rank">🏆 ดูตารางอันดับ</button></div>`;
      box.querySelector('[data-a=rank]').onclick=()=>leaderboard('week');
    }catch(e){box.innerHTML='<p class="ph-small">บันทึกคะแนนไม่สำเร็จ: '+esc(e.message)+'</p>'}
  }
};
checkOnline().then(refreshMe);
})();

// Lobby stage FX layer (spotlights, floor rings, sparkles) placed behind the 3D hero canvas.
(function(){
  const home=document.getElementById('home');if(!home)return;
  const fx=document.createElement('div');fx.className='gl-fx';fx.setAttribute('aria-hidden','true');
  let h='<i class="spot l" style="--a:-22deg"></i><i class="spot r" style="--a:22deg"></i><i class="ring r2"></i><i class="ring"></i>';
  for(let i=0;i<18;i++)h+='<i class="spark'+(i%4===0?' red':'')+'" style="left:'+(8+Math.random()*84)+'%;bottom:'+(Math.random()*30)+'%;animation-delay:'+(-Math.random()*6).toFixed(2)+'s;animation-duration:'+(4+Math.random()*4).toFixed(2)+'s"></i>';
  fx.innerHTML=h;
  const place=()=>{const scene=document.querySelector('.lobby-scene');if(scene&&fx.parentNode!==scene){fx.style.position='absolute';fx.style.zIndex='1';scene.append(fx)}};
  place();setTimeout(place,1500);setTimeout(place,5000);
  const sync=()=>{fx.hidden=home.hidden};new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['hidden']});
})();

// Only one tab plays music: when this tab starts any sound, other open tabs of the game pause theirs.
(function(){
  if(!('BroadcastChannel' in window))return;
  const ch=new BroadcastChannel('pose-hero-audio'),me=Math.random().toString(36).slice(2),mine=new Set();
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){
    if(!this.muted){mine.add(this);try{ch.postMessage({tab:me})}catch(e){}}
    return play.apply(this,arguments);
  };
  ch.onmessage=e=>{if(e.data&&e.data.tab!==me)mine.forEach(m=>{try{if(!m.paused)m.pause()}catch(x){}})};
})();


// ===== Before the main mode: choose camera / dance pad / both, and set up the pad (same mapping as Fire Feet) =====
const inOv=document.createElement('div');inOv.className='notice-ov in-ov';inOv.hidden=true;
inOv.innerHTML='<div class="notice-card in-card" role="dialog" aria-modal="true" aria-labelledby="in-t"><button type="button" class="ph-x" aria-label="ปิด">✕</button>'+
 '<p class="ph-kicker" id="in-lv"></p><h2 id="in-t">ตั้งค่าก่อนเริ่มเล่น</h2><p class="ph-small">เลือกสิ่งที่จะใช้เล่น เลือกอย่างเดียวหรือทั้งสองอย่างก็ได้</p>'+
 '<div class="in-grid">'+
  '<label class="in-opt"><input type="checkbox" id="in-cam" checked><span class="in-ic">📷</span><b>กล้อง</b><small>ตรวจท่าช่วงบนและนับครั้งให้อัตโนมัติ</small><i id="in-cam-st">ยังไม่ได้ตรวจ</i><button type="button" id="in-cam-test">ทดสอบกล้อง</button></label>'+
  '<label class="in-opt"><input type="checkbox" id="in-pad" checked><span class="in-ic">🕹️</span><b>แผ่นเต้น</b><small>เหยียบช่องที่สว่างตามจังหวะ ไม่มีแผ่นใช้คีย์บอร์ด (ลูกศร) ได้</small><i id="in-pad-st">กำลังตรวจหาแผ่น…</i><button type="button" id="in-pad-map">ตั้งค่าแผ่น</button></label>'+
 '</div><p class="in-hint" id="in-hint" role="status"></p>'+
 '<div class="row"><button type="button" class="p" id="in-go">▶ เริ่มเล่น</button><button type="button" id="in-back">เปลี่ยนความยาก</button></div></div>';
document.body.append(inOv);
const LVTH={easy:'ง่าย',normal:'ปานกลาง',hard:'ยาก'};
let inTimer=0,camStream=null;
function padState(){
  if(typeof DPAD==='undefined'||!DPAD)return{ok:false,txt:'เบราว์เซอร์นี้ไม่รองรับแผ่นเต้น — ใช้คีย์บอร์ดแทนได้'};
  if(DPAD.mode&&DPAD.mode!=='free')return{ok:false,txt:'กำลังตั้งค่าแผ่น… เหยียบตามที่บอก'};
  if(!DPAD.gamepad)return{ok:false,txt:'ยังไม่พบแผ่นเต้น — เสียบแผ่นแล้วเหยียบ 1 ครั้ง (หรือใช้คีย์บอร์ด)'};
  if(!DPAD.isMapped)return{ok:false,txt:'พบแผ่นแล้ว — กด "ตั้งค่าแผ่น" (ทำครั้งเดียว ระบบจำไว้)'};
  return{ok:true,txt:'✓ พร้อมใช้: '+(DPAD.gamepad.id.length>28?DPAD.gamepad.id.slice(0,28)+'…':DPAD.gamepad.id)};
}
function paintIn(){
  const p=padState(),pe=$('in-pad-st');pe.textContent=p.txt;pe.className=p.ok?'ok':'';
  const cam=$('in-cam').checked,pad=$('in-pad').checked;
  $('in-cam').closest('.in-opt').classList.toggle('off',!cam);$('in-pad').closest('.in-opt').classList.toggle('off',!pad);
  $('in-go').disabled=!cam&&!pad;
  $('in-hint').textContent=!cam&&!pad?'เลือกอย่างน้อย 1 อย่าง':cam&&pad?'เล่นเต็มรูปแบบ: ทำท่าให้กล้องนับ + เหยียบแผ่นตามจังหวะ':cam?'โหมดกล้องอย่างเดียว: มาสคอตยังก้าวให้ดู ทำตามได้แต่ไม่นับการเหยียบ':'โหมดแผ่นเต้นอย่างเดียว: ไม่นับท่าด้วยกล้อง ใช้ปุ่ม +1 ในเมนู ⏸ นับเองได้';
}
function openInputSetup(){
  $('in-lv').textContent='โหมดหลัก · ระดับ'+(LVTH[heroLevel]||'')+' · 20 นาที';
  try{const v=JSON.parse(localStorage.getItem('pose-hero-inputs')||'{}');if(typeof v.cam==='boolean')$('in-cam').checked=v.cam;if(typeof v.pad==='boolean')$('in-pad').checked=v.pad;}catch(e){}
  try{if(typeof DPAD!=='undefined'&&DPAD)DPAD.start()}catch(e){}
  inOv.hidden=false;paintIn();clearInterval(inTimer);inTimer=setInterval(paintIn,400);$('in-go').focus();
}
function closeIn(){inOv.hidden=true;clearInterval(inTimer);if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}try{if(typeof DPAD!=='undefined'&&DPAD&&DPAD.mode!=='free')DPAD.cancel()}catch(e){}}
inOv.querySelector('.ph-x').onclick=closeIn;
$('in-back').onclick=()=>{closeIn();$('gl-start').click()};
$('in-cam').onchange=$('in-pad').onchange=paintIn;
$('in-cam-test').onclick=async e=>{e.preventDefault();const st=$('in-cam-st');st.textContent='กำลังขอสิทธิ์กล้อง…';st.className='';
  try{camStream=await navigator.mediaDevices.getUserMedia({video:true});st.textContent='✓ กล้องใช้งานได้';st.className='ok';setTimeout(()=>{if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}},800);}
  catch(err){st.textContent='เปิดกล้องไม่ได้ — ตรวจสิทธิ์กล้องของเบราว์เซอร์';}};
$('in-pad-map').onclick=e=>{e.preventDefault();try{DPAD.start();DPAD.bindAll()}catch(x){}paintIn();};

$('in-go').onclick=()=>{
  const cam=$('in-cam').checked,pad=$('in-pad').checked;if(!cam&&!pad)return;
  try{localStorage.setItem('pose-hero-inputs',JSON.stringify({cam,pad}))}catch(e){}
  heroUseCam=cam;heroUsePad=pad;closeIn();$('m-hero').click();
};


// ===== Pad setup in the main-mode setup card: same flow as Fire Feet (connection badge, 3x3 board, map / skip / reset) =====
(function(){
  if(typeof DPAD==='undefined'||!DPAD)return;
  const card=document.getElementById('in-pad').closest('.in-opt');
  const POS=['x','u','o','l',null,'r','tri','d','sq'],ARW=['↖','↑','↗','←','●','→','↙','↓','↘'];
  const extra=document.createElement('div');extra.className='in-padset';
  extra.innerHTML='<div class="pad-badge" id="in-badge"><i></i><b id="in-badge-t">ยังไม่เชื่อมต่อแผ่นเต้น</b><small id="in-badge-s"></small></div>'+
    '<div class="pad-board" id="in-board">'+POS.map((p,i)=>p?'<span data-p="'+p+'">'+ARW[i]+'</span>':'<span class="mid">'+ARW[i]+'</span>').join('')+'</div>'+
    '<p class="pad-prompt" id="in-prompt"></p>'+
    '<div class="pad-btns"><button type="button" id="in-map">ตั้งค่าแผ่น</button><button type="button" id="in-skip" hidden>ข้ามแผ่นนี้</button><button type="button" id="in-reset">ล้างค่า</button></div>';
  // replace the simple status + button with the full setup
  const oldSt=document.getElementById('in-pad-st'),oldBtn=document.getElementById('in-pad-map');
  oldSt.replaceWith(extra);oldBtn.remove();
  extra.addEventListener('click',e=>e.preventDefault()); // clicks inside must not toggle the checkbox
  const $=id=>document.getElementById(id);
  let target=null,prompt='';
  function paint(){
    const gp=DPAD.gamepad,mapping=DPAD.mode&&DPAD.mode!=='free',mapped=DPAD.isMapped;
    const b=$('in-badge');b.className='pad-badge'+(gp?' on':'')+(gp&&mapped?' ready':'');
    $('in-badge-t').textContent=!gp?'ยังไม่เชื่อมต่อแผ่นเต้น':mapping?'เชื่อมต่อแล้ว · กำลังตั้งค่า':mapped?'เชื่อมต่อแล้ว · พร้อมเล่น ✓':'เชื่อมต่อแล้ว · ยังไม่ได้ตั้งค่า';
    $('in-badge-s').textContent=gp?(gp.id.length>34?gp.id.slice(0,34)+'…':gp.id):'เสียบแผ่น USB แล้วเหยียบ 1 ครั้ง (ไม่มีแผ่นใช้คีย์บอร์ดได้)';
    document.querySelectorAll('#in-board [data-p]').forEach(c=>{const id=c.dataset.p;
      c.classList.toggle('mapped',!!DPAD.map[id]);c.classList.toggle('target',mapping&&target===id);c.classList.toggle('down',DPAD.isDown?DPAD.isDown(id):false);});
    $('in-skip').hidden=!mapping;$('in-map').textContent=mapping?'ยกเลิกการตั้งค่า':mapped?'ตั้งค่าแผ่นใหม่':'ตั้งค่าแผ่น';
    $('in-map').disabled=!gp&&!mapping;
    $('in-prompt').textContent=mapping?prompt:!gp?'ยังไม่พบแผ่น — เสียบสาย USB แล้วเหยียบแผ่นใดก็ได้ 1 ครั้ง':!mapped?'กด "ตั้งค่าแผ่น" แล้วเหยียบตามช่องที่กะพริบบนกระดาน (ทำครั้งเดียว ระบบจำไว้)':'ลองเหยียบทดสอบ ช่องบนกระดานจะสว่างตามที่เหยียบ';
  }
  $('in-map').onclick=()=>{try{DPAD.start();if(DPAD.mode&&DPAD.mode!=='free')DPAD.cancel();else DPAD.bindAll();}catch(e){}paint()};
  $('in-skip').onclick=()=>{try{DPAD.skip()}catch(e){}paint()};
  $('in-reset').onclick=()=>{if(confirm('ล้างการตั้งค่าแผ่นเต้นทั้งหมด แล้วตั้งค่าใหม่?')){try{DPAD.resetAll()}catch(e){}paint()}};
  DPAD.on('prompt',m=>{if(m){prompt=m.text||'';target=m.target||null;if(m.step==='done'||m.step==='cancel')target=null;}paint();});
  DPAD.on('change',paint);DPAD.on('status',paint);DPAD.on('press',paint);DPAD.on('release',paint);
  setInterval(()=>{if(!card.closest('.in-ov').hidden)paint()},500);
  paint();
})();
