/* Real 3D lobby: continuous dance, with a scroll-driven orbit camera. */
(() => {
'use strict';
const home=document.getElementById('home'),button=document.getElementById('lobby-motion');
if(!home||!button)return;
const mascot=document.getElementById('mascot'),video=mascot.querySelector('video');
video.pause();video.removeAttribute('autoplay');video.removeAttribute('src');video.removeAttribute('poster');video.load();
const loadStatus=document.createElement('p');loadStatus.className='lobby-load-status';loadStatus.setAttribute('role','status');loadStatus.textContent='กำลังเตรียมฉาก 3D…';document.querySelector('.lobby-copy').append(loadStatus);
document.getElementById('lobby-character').append(mascot);
const layer=document.createElement('div');layer.className='lobby-scene';layer.setAttribute('aria-hidden','true');
const canvas=document.createElement('canvas');layer.append(canvas);document.querySelector('.site-header').after(layer);
let sceneDone=window.MRLoading?MRLoading.begin('กำลังโหลดฉากและมาสคอต 3D…'):()=>{};
let sceneSettled=false,fallbackReady=false,initTimer=0,generation=0,preferred2d=!!cfg.lobbyBackground2d;
function finishScene(){if(!sceneSettled){sceneSettled=true;sceneDone();}}
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const compact=matchMedia('(max-width: 1100px), (pointer: coarse) and (max-width: 1400px)');
const phone=matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 500px) and (max-width: 1000px)');
let paused=false,world=null,raf=0,last=0,progress=0,target=0,danceTime=0,loaded=false,failed=false;
try{paused=localStorage.getItem('pose-hero-lobby-motion')==='paused';}catch(e){}
const clamp=n=>Math.min(1,Math.max(0,n)),ease=t=>t*t*(3-2*t);
const finale=document.createElement('div');finale.className='lobby-finale';
finale.innerHTML='<div><p class="eyebrow">YOUR NEXT MOVE</p><h3>พร้อมขยับ<br>ไปด้วยกันหรือยัง?</h3><p>เลื่อนกลับขึ้นไปเลือกเกมที่อยากเล่น<br>กล้องและฮีโร่จะกลับไปยังจุดเริ่มต้น</p><a class="lobby-cta" href="#lobby-missions">กลับไปเลือกเกม ↑</a></div><span>เลื่อนขึ้นเพื่อย้อนมุมกล้องและท่าทาง</span>';
home.append(finale);
function readScroll(){target=clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight));}
function canMove(){return !document.documentElement.classList.contains('app-loading')&&!failed&&!paused&&!reduced.matches&&!document.hidden&&!home.hidden;}
function ring(T,r,width,color,opacity=1){
 const g=new T.CircleGeometry(1,128),p=g.attributes.position,indices=[];
 for(let i=0;i<=64;i++)for(let j=0;j<2;j++){const a=i/64*Math.PI*2,rr=r+(j?width:0);p.setXYZ(i*2+j,Math.cos(a)*rr,0,Math.sin(a)*rr);}
 for(let i=0;i<64;i++){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}g.setIndex(indices);g.computeVertexNormals();
 return new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:2}));
}
function environment(w){
 const T=window.MR_THREE,{scene}=w,F=w.floorY,existing=new Set(w.scene.children);
 scene.background=new T.Color(0x111e35);
 // Cuboids built from an indexed mesh; all furniture stays BEHIND the pad.
 const faces=[[-1,-1,1,1,-1,1,1,1,1,-1,1,1],[1,-1,-1,-1,-1,-1,-1,1,-1,1,1,-1],[-1,1,1,1,1,1,1,1,-1,-1,1,-1],[-1,-1,-1,1,-1,-1,1,-1,1,-1,-1,1],[1,-1,1,1,-1,-1,1,1,-1,1,1,1],[-1,-1,-1,-1,-1,1,-1,1,1,-1,1,-1]];
 function box(name,x,y,z,sx,sy,sz,color){
  const g=new T.CircleGeometry(1,24),p=g.attributes.position,ix=[];
  faces.forEach((f,j)=>{for(let i=0;i<4;i++)p.setXYZ(j*4+i,f[i*3]*sx/2,f[i*3+1]*sy/2,f[i*3+2]*sz/2);const n=j*4;ix.push(n,n+1,n+2,n,n+2,n+3);});g.setIndex(ix);g.computeVertexNormals();g.clearGroups();
  const materials=faces.map((f,i)=>new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar([1,.65,1.15,.55,.8,.7][i]),side:2}));
  faces.forEach((f,i)=>g.addGroup(i*6,6,i));const m=new T.Mesh(g,materials);m.name=name;m.position.set(x,F+y,z);scene.add(m);return m;
 }
 box('office-floor',0,-.07,-1,12,.1,10,0x24364b);
 for(let i=-5;i<=5;i++)box('floor-seam',i,.001,-1,.008,.002,10,0x34495e);
 box('back-wall',0,1.4,-3.5,10,2.8,.08,0x334459);
 for(let i=-2;i<=2;i++){
  box('window-frame',i*1.6,1.65,-3.43,1.42,1.5,.045,0x0e1a2d);
  box('window-glass',i*1.6,1.65,-3.40,1.29,1.36,.025,0x447c9d);
  for(let j=0;j<5;j++){const h=.18+(j*3+i+8)%5*.12;box('city-building',i*1.6-.5+j*.24,1.05+h/2,-3.37,.16,h,.015,0x273e5a);}
  box('window-mullion',i*1.6,1.65,-3.34,.025,1.4,.025,0x17293d);
 }
 function desk(x,z){
  box('desk-top',x,.69,z,1.45,.065,.65,0x9e826b);
  for(const dx of [-.61,.61])for(const dz of [-.24,.24])box('desk-leg',x+dx,.33,z+dz,.045,.66,.045,0x182638);
  box('monitor-foot',x,.75,z-.07,.22,.025,.16,0x17263a);box('monitor-stand',x,.83,z-.12,.045,.18,.045,0x23364b);
  box('monitor',x,1.02,z-.14,.58,.34,.05,0x0a1728);box('monitor-screen',x,1.02,z-.109,.52,.28,.015,0x498cc2);
  for(let j=0;j<3;j++)box('screen-content',x-.1,1.09-j*.055,z-.095,.25-j*.045,.012,.004,0x8edee8);
  box('keyboard',x,.733,z+.15,.42,.018,.15,0x243c52);box('mouse',x+.36,.74,z+.16,.065,.025,.1,0x93a8bc);
  box('coffee-mug',x-.48,.79,z+.12,.08,.13,.08,0xc6d5dd);
  box('chair-seat',x,.39,z+.6,.4,.08,.38,0x28435c);box('chair-back',x,.68,z+.79,.4,.5,.06,0x2b526c);
  box('chair-base',x,.17,z+.6,.05,.34,.05,0x16283b);box('chair-feet',x,.025,z+.6,.5,.035,.05,0x16283b);
 }
 desk(-1.7,-2.1);desk(1.8,-2.5);
 box('bookshelf-back',3.5,.8,-3.04,1.05,1.6,.08,0x1a2a40);
 for(const y of [.07,.55,1.05,1.55])box('shelf',3.5,y,-2.85,1.05,.045,.38,0x8795a1);
 for(let i=0;i<12;i++)box('book',3.08+(i%6)*.15,.28+Math.floor(i/6)*.52,-2.85,.1,.33-(i%3)*.03,.22,[0x5689a6,0xa780aa,0xbd956b][i%3]);
 function plant(x,z){box('planter',x,.14,z,.3,.28,.3,0xb6a495);box('stem',x,.52,z,.025,.6,.025,0x34594c);
  for(let i=0;i<7;i++){const leaf=new T.Mesh(new T.CircleGeometry(.17,7),new T.MeshBasicMaterial({color:i%2?0x438675:0x65a48b,side:2}));leaf.name='plant-leaf';leaf.scale.set(.5,1,1);leaf.position.set(x+Math.sin(i*2)*.13,F+.4+i*.06,z+Math.cos(i*2)*.1);leaf.rotation.set(.4,i*1.3,i*.7);scene.add(leaf);}}
 plant(-3,-1.7);plant(3.1,-1.5);
 box('wall-art-frame',-3.5,1.25,-3.38,.65,.8,.03,0x162c40);box('wall-art',-3.5,1.25,-3.35,.56,.7,.015,0x7595a2);
 box('ceiling-light',0,2.5,-1.8,1.5,.025,.5,0xc4e4eb);
 // Dedicated foreground play area: nothing taller than the floor enters z > -1.
 box('dance-pad-base',0,-.025,0,.94,.045,.94,0x101d32);w.padTiles=[];
 for(let row=0;row<3;row++)for(let col=0;col<3;col++){
  const x=(col-1)*.3,z=(row-1)*.3,index=row*3+col;
  const tile=box('dance-tile-'+index,x,.005,z,.282,.018,.282,index===4?0x5672a1:0x263f60);w.padTiles.push(tile);
  if(index!==4){const arrow=new T.Mesh(new T.CircleGeometry(.065,3),new T.MeshBasicMaterial({color:index%2?0x7ce7ed:0xbc9cff,side:2}));arrow.name='dance-arrow';arrow.rotation.x=-Math.PI/2;arrow.rotation.z=-Math.atan2(col-1,1-row);arrow.position.set(x,F+.017,z);scene.add(arrow);}
 }
 for(const offset of [-.45,-.15,.15,.45]){box('dance-pad-grid',offset,.02,0,.006,.002,.91,0x7099b4);box('dance-pad-grid',0,.02,offset,.91,.002,.006,0x7099b4);}
 box('pad-usb-cable',0,-.002,-.8,.016,.01,.65,0x101927);
 const rim=new T.DirectionalLight(0x8acfff,1.3);rim.position.set(-2,1,-1);scene.add(rim);
 const violet=new T.DirectionalLight(0xbb91ff,.8);violet.position.set(2,.8,0);scene.add(violet);
 w.officeProps=scene.children.filter(o=>!existing.has(o)&&o.name&&!o.name.startsWith('dance-')&&o.name!=='office-floor'&&o.name!=='floor-seam'&&o.name!=='pad-usb-cable');
}

function resize(){
 if(!world||failed||home.hidden)return;
 const {renderer,camera}=world,rect=layer.getBoundingClientRect();
 if(rect.width<1||rect.height<1)return;
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact.matches?1.25:1.5));
 renderer.setSize(Math.round(rect.width),Math.round(rect.height),false);
 camera.aspect=rect.width/rect.height;camera.fov=20;camera.far=60;camera.updateProjectionMatrix();
 canvas.dataset.layout=phone.matches?'phone-background':compact.matches?'touch-panel':'desktop';
 canvas.dataset.viewWidth=String(Math.round(rect.width));canvas.dataset.viewHeight=String(Math.round(rect.height));draw();
}

function draw(){
 if(!world||failed)return;const {camera,renderer,scene}=world,p=ease(progress),mobile=compact.matches;
 // Fit the pad horizontally on a portrait full-screen background, even at closest zoom.
 const base=phone.matches?Math.max(5.6,1.25/(2*Math.tan(Math.PI/18)*camera.aspect)+.95):mobile?5.6:5.25;
 const angle=(-35+70*p)*Math.PI/180,distance=base-.95*Math.sin(Math.PI*p);
 camera.position.set(Math.sin(angle)*distance,.28+.12*Math.sin(Math.PI*p),Math.cos(angle)*distance);
 camera.lookAt(mobile?0:-.58,-.03,0);
 // Keep dancing while idle; scrolling blends the dance phase without moving the camera on its own.
 const beat=danceTime*Math.PI*1.5;
 const step=Math.sin(beat+p*Math.PI*2.5),bend=18+7*(1-Math.cos(beat*2))+5*Math.sin(p*Math.PI);
 const stance=MR.buildPose({shoulder:[28+step*8,28-step*8],elbow:[95-step*15,95+step*15],knee:[170-bend-Math.max(0,step)*15,170-bend-Math.max(0,-step)*15],liftL:Math.max(0,step)*24,liftR:Math.max(0,-step)*24,tilt:step*3,headTilt:step*4});
 for(const [side,sign,amount] of [["left",-1,Math.max(0,step)],["right",1,Math.max(0,-step)]]){stance[MR.LANDMARK_NAMES.indexOf(side+"_ankle")].x+=sign*.04*amount;stance[MR.LANDMARK_NAMES.indexOf(side+"_knee")].x+=sign*.015*amount;}
 world.render(stance,null,MR.LANDMARK_NAMES,false);
 canvas.dataset.step=step.toFixed(4);canvas.dataset.danceTime=danceTime.toFixed(4);
 if(world.padTiles)world.padTiles.forEach((tile,i)=>tile.material.forEach(m=>m.color.set(i===(step>.1?3:step<-.1?5:4)?0x638fe1:i===4?0x5672a1:0x263f60)));
 canvas.dataset.officeProps=String(world.officeProps.length);
 canvas.dataset.foregroundClear=String(world.officeProps.every(o=>o.position.z<=-1));
 renderer.render(scene,camera);
 canvas.dataset.progress=progress.toFixed(5);canvas.dataset.angle=(-35+70*p).toFixed(3);canvas.dataset.distance=distance.toFixed(4);
}
function tick(now){
 raf=0;if(!canMove()||!world)return;
 if(last&&now-last<1000/30){raf=requestAnimationFrame(tick);return;}
 const dt=last?Math.min((now-last)/1000,.1):1/30;last=now;danceTime+=dt;
 progress+=(target-progress)*(1-Math.exp(-dt/.16));if(Math.abs(progress-target)<.0001)progress=target;
 draw();raf=requestAnimationFrame(tick);
}

async function fallback(manual=false){
 if(failed)return;failed=true;generation++;clearTimeout(initTimer);cancelAnimationFrame(raf);video.pause();
 const fallbackDone=sceneSettled&&window.MRLoading?MRLoading.begin('กำลังเตรียมฉาก 2D สำหรับอุปกรณ์นี้…'):()=>{};
 home.classList.remove('lobby-webgl-ready');layer.hidden=true;canvas.hidden=true;
 loadStatus.hidden=false;loadStatus.textContent=manual?'ใช้ฉาก 2D ตามการตั้งค่า':'อุปกรณ์นี้ใช้ฉาก 2D สำรอง คุณยังเลือกเล่นเกมได้ตามปกติ';button.textContent='ฉาก 2D สำรอง';button.disabled=true;
 const picture=document.createElement('picture');picture.className='lobby-fallback';
 const source=document.createElement('source');source.media='(max-width:760px) and (orientation:portrait)';source.srcset='assets/office-fallback-portrait.png';
 const img=document.createElement('img');img.alt='';img.src='assets/office-fallback-wide.png';picture.append(source,img);layer.append(picture);
 try{
  await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('2D timeout')),15000))]);
  fallbackReady=true;home.classList.add('lobby-2d-ready');layer.hidden=home.hidden;
  canvas.dataset.fallback='2d';finishScene();fallbackDone();
 }catch(e){window.MRLoading?.fail('โหลดฉากสำรองไม่สำเร็จ กรุณาลองโหลดใหม่');}
}

async function init(){
 if(loaded||failed)return;if(sceneSettled){sceneSettled=false;sceneDone=window.MRLoading?MRLoading.begin('กำลังเตรียมฉาก 3D…'):()=>{};}loaded=true;const ticket=++generation;initTimer=setTimeout(()=>fallback(),20000);
 try{
  if(!window.MRTeacher3D||!window.MR_TEACHER_B64)throw new Error('No model');
  const result=await MRTeacher3D.create(canvas,Uint8Array.from(atob(MR_TEACHER_B64),c=>c.charCodeAt(0)));
  if(failed||ticket!==generation){result.dispose();return;}world=result;
  environment(world);home.classList.add('lobby-webgl-ready');video.pause();resize();readScroll();sync();loadStatus.hidden=true;clearTimeout(initTimer);finishScene();
 }catch(e){if(ticket!==generation)return;console.warn('Lobby 3D fallback:',e);fallback();}
}
function sync(){
 if(home.hidden&&!loaded&&!failed)finishScene();
 cancelAnimationFrame(raf);raf=0;last=0;layer.hidden=home.hidden||(failed&&!fallbackReady);
 const stopped=paused||reduced.matches;home.classList.toggle('lobby-motion-off',stopped||document.hidden||home.hidden);
 if(!failed){button.textContent=reduced.matches?'ใช้มุมคงที่ตามการตั้งค่าเครื่อง':paused?'เปิดการเคลื่อนไหว':'หยุดการเคลื่อนไหว';button.setAttribute('aria-pressed',String(stopped));button.disabled=reduced.matches;}
 if(world)video.pause();
 if(!home.hidden&&!failed){readScroll();if(reduced.matches)progress=0;if(world)resize();draw();if(!world)init();if(world&&canMove())raf=requestAnimationFrame(tick);}
}
button.onclick=()=>{paused=!paused;try{localStorage.setItem('pose-hero-lobby-motion',paused?'paused':'animated');}catch(e){}sync();};
new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['hidden']});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);fallback();});
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
window.addEventListener('scroll',()=>{readScroll();if(world&&canMove()&&!raf)raf=requestAnimationFrame(tick);},{passive:true});
let resizeFrame=0;
function scheduleResize(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{readScroll();resize();if(world&&canMove()&&!raf)raf=requestAnimationFrame(tick);});}
window.addEventListener('resize',scheduleResize,{passive:true});
if(window.visualViewport)visualViewport.addEventListener('resize',scheduleResize,{passive:true});
compact.addEventListener('change',scheduleResize);
phone.addEventListener('change',scheduleResize);
if(window.ResizeObserver)new ResizeObserver(scheduleResize).observe(layer);
window.addEventListener('mr-config-change',()=>{
 const next=!!cfg.lobbyBackground2d;if(next===preferred2d)return;preferred2d=next;
 clearTimeout(initTimer);cancelAnimationFrame(raf);generation++;
 if(world){world.dispose();world=null;}loaded=false;failed=false;fallbackReady=false;
 layer.querySelector('.lobby-fallback')?.remove();home.classList.remove('lobby-2d-ready','lobby-webgl-ready');
 sceneSettled=false;sceneDone=window.MRLoading?MRLoading.begin(next?'กำลังเตรียมฉาก 2D…':'กำลังเตรียมฉาก 3D…'):()=>{};
 if(next)fallback(true);else{canvas.hidden=false;init();}
});
if(preferred2d)fallback(true);else sync();
})();
