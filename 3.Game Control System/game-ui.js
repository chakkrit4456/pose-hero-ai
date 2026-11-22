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
$('gl-start').onclick=()=>$('m-hero').click();
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
  combo:['ต่อไปใช้แผ่นเต้นด้วยนะครับ! เหยียบช่องที่สว่าง','ได้เวลาออกกำลังกายพร้อมแผ่นเต้นแล้วครับ!'],
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
