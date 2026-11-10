/* Presentation and help for the existing modes. No scoring/detection rules here. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  if(window.S2)S2.bus.on('storage-error',()=>notify('บันทึกท่าลงเครื่องไม่ได้ ท่านี้อยู่ชั่วคราวจนปิดหน้า กรุณาตรวจพื้นที่หรือการอนุญาตเก็บข้อมูล','warn',true));
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const descriptions = {
    level: 'เลือกระดับที่เหมาะกับคุณ ระดับนี้ใช้กับท่าบริหาร โดยปรับจำนวนครั้ง เวลาทำท่า และเวลาพักตามค่าที่แสดง โหมดเต้นเลือกระดับในหน้าของแต่ละโหมด',
    settings: 'ปรับกล้อง เสียง และการเล่นตามต้องการ แล้วกด “บันทึก” ด้านล่าง การตั้งค่าเก็บในเบราว์เซอร์เครื่องนี้',
    manage: 'สร้างหรือแก้ไขท่าของคุณเอง เลือกท่าต้นแบบจากรายการ แล้วปรับข้อต่อและคำอธิบาย ท่าที่สร้างเองต้องกดนับครั้งเองในเกม',
    stats: 'ดูผลการบริหารที่ผ่านมาและความต่อเนื่อง กราฟแสดงคะแนน 0–100 ตามวันที่เล่น ข้อมูลอยู่ในเบราว์เซอร์นี้และไม่ย้ายเครื่องอัตโนมัติ',
    dance: 'ไม่ใช้กล้อง เหยียบแผ่นที่สว่างให้ตรงจังหวะ หรือใช้คีย์บอร์ดและแตะหน้าจอ ตั้งค่าแผ่นครั้งแรกก่อนเลือกความยากเพื่อเริ่ม',
    fire: 'ใช้แผ่น USB เท่านั้น ยืนกลางแผ่น แล้วเหยียบเมื่อไอคอนเดินทางถึงแผ่น เล่นรอบละ 3 นาที เลือกระดับเพื่อเริ่มหลังตั้งค่าแผ่นครบ',
    done: 'ผลรอบนี้แสดงจำนวนครั้ง เวลา และคะแนนของคุณ คะแนนเป็นผลในเกม ไม่ใช่การวินิจฉัยสุขภาพ',
    next: 'ชุดบริหารจบแล้ว ระบบจะต่อโหมดเหยียบเมื่อหมดเวลานับถอยหลัง คุณเลือกเริ่มเลย ดูผล หรือข้ามได้ ปิดการต่อเนื่องได้ในตั้งค่า',
  };
  Object.entries(descriptions).forEach(([id,text]) => {
    const section=byId(id), heading=section.querySelector('h2');
    const p=document.createElement('p');p.className='page-intro';p.textContent=text;heading.after(p);
  });
  document.querySelectorAll('.back').forEach(b=>{b.textContent='กลับหน้าหลัก';});
  ['err','camerr','cs-msg','s-err','s-bk-msg','s-rem-msg','pa-msg'].forEach(id=>{const el=byId(id);if(el){el.setAttribute('role','status');el.setAttribute('aria-live','polite');}});
  byId('sel-sum').setAttribute('aria-live','polite');
  byId('s-camid').setAttribute('aria-describedby','camera-permission-help');

  function box(parent,html,atStart=false){const node=document.createElement('div');node.className='guide-box';node.innerHTML=html;if(atStart)parent.prepend(node);else parent.append(node);return node;}
  box(byId('settings'),'<p id="camera-permission-help">หากรายชื่อกล้องไม่แสดง ให้กดทดสอบกล้องและอนุญาตก่อน เสียงพูดภาษาไทยขึ้นอยู่กับเสียงที่ติดตั้งในเครื่อง</p><p>ข้อมูลจะไม่ย้ายไปอีกเครื่องเอง ใช้สำรองข้อมูลเพื่อดาวน์โหลดไฟล์ แล้วนำเข้าบนเครื่องใหม่ การนำเข้าจะเขียนทับเฉพาะชุดข้อมูลที่มีในไฟล์</p>');
  box(byId('stats'),'<p>ปฏิทิน: วางเมาส์หรือแตะช่องที่โฟกัสเพื่อดูจำนวนรอบและคะแนนสูงสุด ดูวันที่และคะแนนแบบข้อความได้ในตารางรอบล่าสุด</p>');
  const empty=document.createElement('div');empty.id='stats-empty';empty.className='empty-action';empty.innerHTML='<p>ยังไม่มีประวัติสำหรับผู้เล่นที่เลือก เล่นจบหนึ่งรอบแล้วกลับมาดูผลได้ที่นี่</p><button type="button" class="p">เริ่มบริหารร่างกาย</button>';byId('st-body').after(empty);empty.querySelector('button').onclick=()=>byId('m-start').click();
  const tableWrap=document.createElement('div');tableWrap.className='stats-table-wrap';byId('st-recent').before(tableWrap);tableWrap.append(byId('st-recent'));byId('st-recent').setAttribute('aria-label','ประวัติการบริหารร่างกายล่าสุด');
  box(byId('done'),'<details><summary>คะแนนและเกรดหมายถึงอะไร?</summary><p>คะแนนรวมคิดจากการทำครบ ความถูกต้องเมื่อมีข้อมูลจากกล้อง โบนัสเวลา และตัวคูณระดับความยาก สูงสุด 100 คะแนน ท่าที่ข้ามหรือยังไม่ได้เล่นมีผลต่อคะแนน</p><p>A: 85 ขึ้นไป · B: 70–84 · C: 50–69 · D: ต่ำกว่า 50 หากออกกลางคันจะแสดงว่าเล่นยังไม่จบ</p></details>');
  ['d','ff'].forEach(prefix=>{
    const menu=byId(prefix==='d'?'d-menu':'ff-menu');
    const content=prefix==='d'?'<p>กด Q ↑ E / ← → / Z ↓ C ตามตำแหน่ง หรือแตะแผ่นบนจอ</p><div class="key-layout" aria-label="ผังคีย์บอร์ด"><kbd>Q</kbd><kbd>↑</kbd><kbd>E</kbd><kbd>←</kbd><kbd>·</kbd><kbd>→</kbd><kbd>Z</kbd><kbd>↓</kbd><kbd>C</kbd></div><p>PERFECT = ตรงจังหวะมาก · GREAT = ใกล้จังหวะ · GOOD = ยังทัน · MISS = พลาด กดระดับความยากเพื่อเริ่มรอบจริง</p>':'<p>1. เสียบแผ่น USB และเหยียบหนึ่งครั้งให้เบราว์เซอร์พบแผ่น<br>2. กดตั้งค่าแผ่น แล้วเหยียบตามตำแหน่งที่ระบบบอก<br>3. เลือกเพลงและระดับเพื่อเริ่มรอบ 3 นาที</p><p>เหยียบแม่นเพิ่มเกจความร้อน เกจเต็มเข้าช่วงไฟลุก 8 วินาที คะแนน ×2 คอมโบคือจำนวนก้าวถูกต่อเนื่อง หากแผ่นหลุด เกมจะหยุดรอจนเชื่อมต่อใหม่</p>';
    const help=box(menu,'<details><summary>วิธีเล่นและตั้งค่าอุปกรณ์</summary>'+content+'</details><button class="practice-launch" type="button">ลองเล่นก่อน (ไม่คิดคะแนน)</button>');
    help.querySelector('button').onclick=()=>openPractice(prefix==='d'?'dance':'fire');
  });

  // Fieldsets preserve the existing input IDs and save handlers.
  const groups=[
    ['หน้าตาและผู้เล่น',['s-theme','s-name']],
    ['เวลาและการเล่น',['s-cd','s-demo','s-rest','s-chain']],
    ['เสียงและคำบรรยาย',['s-vol','s-read','s-lobby-music','s-lobby-vol','s-game-vol']],
    ['กล้องและตัวอย่างท่า',['s-cam','s-camid','s-lobby-2d','s-3d','s-ai','s-camtest','s-prev']],
    ['เตือนให้พัก',['s-rem','s-rem-int','s-rem-msg']],
    ['ข้อมูลและความปลอดภัย',['s-bk','s-bk-msg']],
    ['ขั้นสูง: สำหรับปรับระบบ',['s-ang']],
  ];
  const setting=byId('settings'),anchor=document.createComment('settings groups');setting.querySelector('.f').before(anchor);
  groups.forEach(([title,ids])=>{
    const field=document.createElement('fieldset');field.className='settings-group';const legend=document.createElement('legend');legend.textContent=title;field.append(legend);anchor.before(field);
    ids.forEach(id=>{const input=byId(id);const row=input.closest('.f')||input.closest('.row')||input;if(!field.contains(row))field.append(row);});
  });
  const fieldHints={
    's-name':'ชื่อนี้ใช้แยกประวัติการเล่นในเครื่องเดียวกัน',
    's-cd':'เวลาสำหรับเตรียมตัวก่อนเริ่มรอบ',
    's-demo':'0 = เริ่มท่าเลย ตัวอย่างใต้กล้องยังแสดงระหว่างทำท่า',
    's-rest':'เวลาพักพื้นฐานจะปรับตามระดับความยากที่เลือก',
    's-chain':'เปิดไว้: จบชุดบริหารแล้วนับถอยหลังต่อโหมดเหยียบ คะแนนแยกกัน',
    's-read':'อ่านขั้นตอนระหว่างดูตัวอย่าง เพลงจะเบาลง หากเครื่องไม่มีเสียงไทยจะใช้ข้อความแทน',
    's-ai':'เปิดเพื่อวิเคราะห์ท่าจากข้อต่อ หากปิด การนับจากกล้องใช้การเคลื่อนไหว ไม่ประเมินความถูกต้องของท่า',
    's-ang':'แสดงข้อมูลมุมสำหรับปรับระบบ ผู้เล่นทั่วไปไม่จำเป็นต้องเปิด',
    's-rem':'เตือนเฉพาะเมื่อเปิดหน้าเกมค้างไว้ และไม่รบกวนขณะเล่น',
  };
  Object.entries(fieldHints).forEach(([id,text])=>{const label=setting.querySelector('label[for="'+id+'"]');if(label){const hint=document.createElement('small');hint.className='field-help';hint.id=id+'-help';hint.textContent=text;label.append(hint);byId(id).setAttribute('aria-describedby',hint.id);}});
  ['s-lobby-vol','s-game-vol'].forEach(id=>{byId(id).oninput=()=>byId(id+'v').textContent=byId(id).value+'%';});
  const sound=document.createElement('div');sound.className='row';sound.innerHTML='<button type="button">ทดสอบเสียงเตือน</button><button type="button">ทดสอบเสียงพูด</button>';byId('s-read').closest('fieldset').append(sound);sound.children[0].onclick=()=>beep(660,200);sound.children[1].onclick=()=>{speak('ยินดีต้อนรับ ทำท่าตามตัวอย่างได้เลย',660);notify('หากไม่ได้ยินเสียงพูด ให้ตรวจระดับเสียงและเสียงภาษาไทยในเครื่อง','info',true);};
  const state=document.createElement('p');state.id='play-state';state.className='play-state';state.setAttribute('role','status');byId('big').before(state);
  const review=document.createElement('button');review.type='button';review.textContent='ดูวิธีทำอีกครั้ง';byId('end').after(review);review.onclick=()=>{if(!st.current)return;const playing=st.status==='playing';if(playing)byId('pause').click();openPreview(st.current.exercise);};
  const retry=document.createElement('p');retry.className='field-help';retry.textContent='หากเปิดกล้องไม่ได้ ให้ตรวจสิทธิ์กล้องของเบราว์เซอร์ ปิดโปรแกรมอื่นที่ใช้กล้อง แล้วกดลองอีกครั้ง';byId('camerr').after(retry);
  const loading=document.createElement('p');loading.className='field-help';loading.textContent='ภาพกล้องใช้ตรวจท่าบนเครื่อง หากกล้องช่วยนับไม่ทำงาน สามารถใช้ปุ่ม +1 โดยการกดเองได้';byId('camtog').closest('.row').after(loading);
  byId('setup-routines').onclick=()=>byId('m-routines').click();byId('setup-level').onclick=()=>byId('m-level').click();

  // A native dialog supplies Escape, focus trapping and focus restoration.
  const dialog=document.createElement('dialog');dialog.className='ui-dialog';dialog.setAttribute('aria-labelledby','ui-dialog-title');dialog.innerHTML='<div class="dialog-top"><h2 id="ui-dialog-title"></h2><button type="button" aria-label="ปิดหน้าช่วยเหลือ">ปิด</button></div><div id="ui-dialog-body"></div>';document.body.append(dialog);
  let previewExercise=null,previewMode='motion',previewTime=0,previewStart=0,previewRunning=true,dialogKind='',practice=null,dialogReturn=null;
  dialog.querySelector('button').onclick=()=>dialog.close();
  function openDialog(title,html,kind){if(dialog.open)dialog.close();dialogReturn=document.activeElement;dialogKind=kind;byId('ui-dialog-title').textContent=title;byId('ui-dialog-body').innerHTML=html;dialog.showModal();}
  dialog.addEventListener('close',()=>{practice=null;previewExercise=null;dialogKind='';if(dialogReturn&&dialogReturn.isConnected)dialogReturn.focus();});
  function help(){
    if(st.status==='playing'||st.status==='countdown')byId('pause').click();
    openDialog('เริ่มเล่นอย่างไร?','<p class="page-intro">เลือกโหมดที่เหมาะกับอุปกรณ์ของคุณ แต่ละโหมดมีคะแนนและวิธีเล่นของตัวเอง</p><ol class="steps-strip"><li><b>1. เลือกเกม</b><small>กล้องสำหรับบริหาร แผ่นสำหรับก้าวเต้น</small></li><li><b>2. เตรียมอุปกรณ์</b><small>อนุญาตกล้อง หรือตั้งค่าปุ่มแผ่นตามภาพ</small></li><li><b>3. ดูตัวอย่างแล้วเล่น</b><small>อ่านคำสั่งบนจอ พักหรือจบได้จากปุ่มในเกม</small></li></ol><details class="guide-box" open><summary>บริหารร่างกายด้วยกล้อง</summary><p>เลือกท่าหรือชุดท่าด่วน → ตรวจกล้อง → เริ่มเกม → ดูตัวอย่างและทำตาม ป้าย “กล้องช่วยนับ” หมายถึงระบบนับให้ ส่วน “ท่าของฉัน” ต้องกด +1 เอง</p></details><details class="guide-box"><summary>แผ่นเต้นและนักเต้นเท้าไฟ</summary><p>แผ่นเต้น: เหยียบช่องที่สว่าง ใช้ USB คีย์บอร์ด หรือแตะจอได้ นักเต้นเท้าไฟ: USB เท่านั้น เหยียบเมื่อไอคอนถึงแผ่น รอบละ 3 นาที มีปุ่มลองเล่นก่อนในหน้าของแต่ละโหมด</p></details><details class="guide-box"><summary>กล้องไม่เปิดหรือไม่นับ ต้องทำอย่างไร?</summary><p>อนุญาตกล้องในเบราว์เซอร์ ปิดโปรแกรมอื่นที่ใช้กล้อง และตรวจว่าเปิดผ่านไฟล์ในเครื่อง localhost หรือ HTTPS ใช้ตัวช่วยตรวจตำแหน่ง ยืนกลางภาพให้เห็นส่วนร่างกายที่ใช้ทำท่าและมีแสงด้านหน้า</p></details><details class="guide-box"><summary>ข้อมูลของฉันอยู่ที่ไหน?</summary><p>ตั้งค่า ประวัติ และท่าที่สร้างเก็บในเบราว์เซอร์เครื่องนี้ ล้างข้อมูลเว็บหรือเปลี่ยนเบราว์เซอร์อาจทำให้ไม่พบข้อมูล สำรองไฟล์ JSON จากตั้งค่าก่อนย้ายเครื่อง</p></details><p>หากเจ็บ ชา หรือเวียนศีรษะ ให้หยุดเล่น อ่านข้อควรระวังด้านสุขภาพซ้ำได้ที่ตั้งค่า</p><div class="row"><button id="help-done" class="p" type="button">เข้าใจแล้ว เลือกเกมได้เลย</button></div>','help');
    byId('help-done').onclick=()=>{try{localStorage.setItem('pose-hero-help-seen','1');}catch(e){}dialog.close();};
  }
  document.querySelectorAll('.help-launch').forEach(b=>b.onclick=help);

  let cardTeacher=null,cardTeacherPromise=null;
  const teacherCanvas=document.createElement('canvas');teacherCanvas.width=480;teacherCanvas.height=480;
  function prepareTeacher(){
    if(cardTeacherPromise||cfg.teacher3d===false||!window.MRTeacher3D||!window.MR_TEACHER_B64)return;
    const done=window.MRLoading?MRLoading.begin('กำลังเตรียมภาพตัวอย่างท่า…'):()=>{};
    try{cardTeacherPromise=MRTeacher3D.create(teacherCanvas,Uint8Array.from(atob(MR_TEACHER_B64),c=>c.charCodeAt(0))).then(t=>{cardTeacher=t;if(!byId('setup').hidden)cardsChanged();}).catch(()=>{}).finally(done);}catch(e){done();}
  }
  function poseFrame(cv,ex,t,skeleton=false){
    if(!cv||!AI||!aiEx[ex.id]){if(cv)drawThumb(cv,ex);return;}
    const e=aiEx[ex.id],g=cv.getContext('2d'),W=cv.width,H=cv.height;
    const lm=previewMode==='start'&&dialogKind==='pose'?MR.poseFromAngles(MR.teachAngles(e,0),[]):previewMode==='end'&&dialogKind==='pose'?MR.poseFromAngles(MR.teachAngles(e,1),[]):MR.teachPose(e,t);
    if(!skeleton&&cardTeacher&&cfg.teacher3d!==false){try{cardTeacher.render(lm,null,MR.LANDMARK_NAMES);g.fillStyle='#101418';g.fillRect(0,0,W,H);g.drawImage(teacherCanvas,0,0,W,H);return;}catch(e){cardTeacher=null;}}
    const joints=MR.ghostJoints(lm,MR.SIM_W,MR.SIM_H);
    // Fit the whole character including hands and head at every pose.
    const pts=Object.values(joints).filter(p=>Number.isFinite(p.px)&&Number.isFinite(p.py));
    const minX=Math.min(...pts.map(p=>p.px))-45,maxX=Math.max(...pts.map(p=>p.px))+45,minY=Math.min(...pts.map(p=>p.py))-55,maxY=Math.max(...pts.map(p=>p.py))+35;
    const scale=Math.min((W-36)/(maxX-minX),(H-36)/(maxY-minY),W/440);
    g.fillStyle='#101418';g.fillRect(0,0,W,H);g.save();g.translate(W/2,H/2);g.scale(scale,scale);g.translate(-(minX+maxX)/2,-(minY+maxY)/2);
    if(skeleton)MR.drawPlayerSkeleton(g,joints,MR.requiredJoints(e),2);else MR.drawTeacher(g,joints,MR.teachMoving(e),1);g.restore();
  }
  function openPreview(ex){
    const info=demoInfo(ex);prepareTeacher();previewMode=reduced.matches?'end':'motion';previewTime=0;previewStart=performance.now();previewRunning=!reduced.matches;
    openDialog(ex.name,'<div class="pose-detail-grid"><div><canvas id="pose-detail-canvas" width="480" height="480" role="img" aria-label="'+escape('ตัวละครสาธิต '+ex.name)+'"></canvas><p class="pose-state" id="pose-state"></p></div><div><p>'+escape(ex.target)+'</p><ol>'+info.list.map(t=>'<li>'+escape(t)+'</li>').join('')+'</ol><p>'+escape(info.pc)+'</p><p class="field-help">ภาพเป็นตัวอย่างการเคลื่อนไหว ทำช้า ๆ ในช่วงที่สบาย ไม่ฝืนให้เจ็บ</p></div></div><div class="demo-controls"><button id="pose-start" type="button">ดูท่าเริ่ม</button><button id="pose-end" type="button">ดูท่าเป้าหมาย</button><button id="pose-motion" type="button">เล่น / หยุดตัวอย่าง</button><button id="pose-replay" type="button">ดูอีกครั้ง</button><button id="pose-skeleton" type="button" aria-pressed="false">ดูแนวข้อต่อ</button></div><div class="row" style="margin-top:18px"><button id="pose-choose" class="p" type="button">เลือกท่านี้</button></div>','pose');
    previewExercise=ex;let skeleton=false;
    const draw=()=>{poseFrame(byId('pose-detail-canvas'),ex,previewTime,skeleton);byId('pose-state').textContent=previewMode==='start'?'ท่าเริ่มต้น':previewMode==='end'?'ท่าเป้าหมาย':previewRunning?'ดูตัวอย่าง: เริ่ม → เคลื่อนไหว → กลับ':'ตัวอย่างหยุดอยู่';};
    byId('pose-start').onclick=()=>{previewMode='start';previewRunning=false;draw();};byId('pose-end').onclick=()=>{previewMode='end';previewRunning=false;draw();};
    byId('pose-motion').onclick=()=>{previewMode='motion';previewRunning=!previewRunning;previewStart=performance.now()-previewTime*1000;draw();};
    byId('pose-replay').onclick=()=>{previewMode='motion';previewTime=0;previewStart=performance.now();previewRunning=true;draw();};
    byId('pose-skeleton').onclick=()=>{skeleton=!skeleton;byId('pose-skeleton').setAttribute('aria-pressed',String(skeleton));draw();};
    const select=byId('pose-choose');select.hidden=byId('setup').hidden;select.textContent=st.queue.some(q=>q.id===ex.id)?'เลือกแล้ว กลับไปเลือกท่า':'เลือกท่านี้';select.onclick=()=>{if(!st.queue.some(q=>q.id===ex.id)){const card=[...document.querySelectorAll('.xc')].find(c=>c.dataset.exerciseId===ex.id);if(card)card.querySelector('.pose-select').click();}dialog.close();};
    dialog._drawPose=draw;draw();
  }
  let cardMotion=false,visibleCards=new Set(),observer;
  if('IntersectionObserver' in window)observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)visibleCards.add(e.target);else visibleCards.delete(e.target);}));
  byId('thumb-motion').onclick=()=>{cardMotion=!cardMotion;byId('thumb-motion').setAttribute('aria-pressed',String(cardMotion));byId('thumb-motion').textContent=cardMotion?'หยุดภาพตัวอย่างเคลื่อนไหว':'เปิดภาพตัวอย่างเคลื่อนไหว';if(!cardMotion)cardsChanged();};
  function cardsChanged(){prepareTeacher();visibleCards.clear();if(observer)observer.disconnect();document.querySelectorAll('.xc').forEach(card=>{const ex=S.getCatalog().find(e=>e.id===card.dataset.exerciseId);if(ex)poseFrame(card.querySelector('canvas'),ex,1.5);if(observer)observer.observe(card);else visibleCards.add(card);});}

  // Isolated rehearsal: no game state, history, difficulty ladder or scores are touched.
  const positions=['x','u','o','l',null,'r','tri','d','sq'];
  const keys=['q','arrowup','e','arrowleft','','arrowright','z','arrowdown','c'];
  const arrows=['↖','↑','↗','←','·','→','↙','↓','↘'];
  function openPractice(mode){
    openDialog('ลอง'+(mode==='dance'?'แผ่นเต้น':'นักเต้นเท้าไฟ')+' — ไม่คิดคะแนน','<p>ทดลอง 4 ก้าว ไม่มีการบันทึกผล '+(mode==='dance'?'กดคีย์บอร์ด แตะ หรือเหยียบช่องที่มีกรอบ':'ใช้แผ่น USB ที่ตั้งค่าครบ เหยียบเมื่อไอคอนถึงช่องเป้าหมาย')+'</p><div id="practice-board" class="practice-board"></div><p id="practice-message" class="inline-status" role="status"></p><button id="practice-again" type="button">เริ่มลองใหม่</button>','practice');
    practice={mode,index:0,sequence:[1,3,5,7],since:performance.now(),done:false};
    const board=byId('practice-board');arrows.forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label','ทดลองก้าว '+label);b.disabled=i===4||mode==='fire';b.onclick=()=>practiceHit(i);board.append(b);});byId('practice-again').onclick=()=>openPractice(mode);practiceDraw();
  }
  function practiceDraw(){if(!practice)return;[...byId('practice-board').children].forEach((b,i)=>{b.classList.toggle('target',!practice.done&&i===practice.sequence[practice.index]);});byId('practice-message').textContent=practice.done?'✓ ทำครบแล้ว ปิดหน้านี้แล้วเลือกระดับเพื่อเล่นจริง':practice.mode==='fire'&&(!DPAD||!DPAD.gamepad||!DPAD.isMapped)?'เสียบแผ่น USB และตั้งค่าแผ่นให้ครบก่อนทดลอง':'ก้าว '+(practice.index+1)+' / 4: '+(practice.mode==='fire'?'รอไอคอนถึงช่อง แล้วเหยียบ':'กดช่องที่มีกรอบ');}
  function practiceHit(i){if(!practice||practice.done)return;if(practice.mode==='fire'&&(!DPAD||!DPAD.gamepad||!DPAD.isMapped||performance.now()-practice.since<1500))return;if(i!==practice.sequence[practice.index]){byId('practice-message').textContent='ลองใหม่ เลือกช่องที่มีกรอบ';return;}practice.index++;practice.since=performance.now();practice.done=practice.index>=4;practiceDraw();}
  document.addEventListener('keydown',e=>{if(dialogKind!=='practice'||!practice||practice.mode==='fire')return;const i=keys.indexOf(e.key.toLowerCase());if(i>=0){e.preventDefault();practiceHit(i);}},true);
  if(typeof DPAD!=='undefined'&&DPAD)DPAD.on('press',e=>{if(dialogKind==='practice')practiceHit(positions.indexOf(typeof e==='string'?e:e.id));});
  // Do not let tutorial keyboard input trigger the existing dance board underneath.
  dialog.addEventListener('keydown',e=>{if(e.key!=='Escape')e.stopPropagation();});

  let lastFeedback='',feedbackAt=0,lastFrame=0;
  function pageChanged(page){document.title=(byId(page).querySelector('h2')?.textContent||'เล่นบริหารร่างกาย')+' | Pose Hero AI';const title=byId(page).querySelector('h2');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}if(page==='stats')empty.hidden=!byId('st-body').hidden;if(page==='setup')cardsChanged();if(page!=='play')window.scrollTo({top:0,behavior:'instant'});}
  function playStatus(p){
    const text=st.status==='countdown'?'เตรียมตัว เริ่มหลังนับถอยหลัง':st.status==='paused'?'พักการเล่นอยู่ กดเล่นต่อเมื่อพร้อม':p.resting?'ช่วงพัก เตรียมท่าถัดไป':demoLeft>0?'ดูตัวอย่างก่อน ยังไม่นับครั้ง':p.exercise?'กำลังทำท่า · '+(isAi(p.exercise.id)&&aiOn?'กล้องช่วยนับ':C.isCameraOn()?'กล้องนับจากการเคลื่อนไหว ไม่ตรวจความถูกต้อง':'ใช้ปุ่ม +1 เพื่อนับเอง'):'';
    if(state.textContent!==text)state.textContent=text;
    if(p.exercise){byId('rep').hidden=!!(isAi(p.exercise.id)&&aiOn);byId('rep').textContent='+1 ครั้ง (กดนับเอง)';}
    const pauseText=st.status==='paused'?'เล่นต่อ':'พักการเล่น';if(byId('pause').textContent!==pauseText)byId('pause').textContent=pauseText;
  }
  window.MRBeginner={preview:openPreview,cardsChanged,selectionChanged(){},pageChanged,playStatus,
    feedback(text,urgent){const now=performance.now();if(text===lastFeedback)return;if(urgent||now-feedbackAt>1400){lastFeedback=text;feedbackAt=now;byId('aimsg').textContent=text;}},
    cameraStatus(ready,text){byId('cs-status').textContent=text||(ready?'✓ พร้อมแล้ว กลับไปเลือกท่าและเริ่มเล่นได้':'จัดตำแหน่งตามรายการด้านล่าง');document.querySelector('.camera-guide-frame').classList.toggle('ready',ready);},
  };
  function frame(now){requestAnimationFrame(frame);if(document.hidden||now-lastFrame<80)return;lastFrame=now;
    if(dialogKind==='pose'&&previewExercise&&previewRunning){previewTime=(now-previewStart)/1000;dialog._drawPose();}
    if(cardMotion&&!reduced.matches&&!byId('setup').hidden&&!dialog.open){visibleCards.forEach(card=>{const ex=S.getCatalog().find(e=>e.id===card.dataset.exerciseId);if(ex)poseFrame(card.querySelector('canvas'),ex,now/1000);});}
    if(dialogKind==='practice'&&practice&&practice.mode==='fire'&&!practice.done){const b=byId('practice-board').children[practice.sequence[practice.index]],elapsed=now-practice.since;b.textContent=elapsed<1500?'·':arrows[practice.sequence[practice.index]];}
  }
  requestAnimationFrame(frame);
  pageChanged(PAGES.find(p=>!byId(p).hidden)||'home');
})();
