/* Runs in the head, before app scripts: no page is exposed until its tasks settle. */
(() => {
  const tasks=new Map();let next=0,boot=true,failed=false,lastFocus=null;
  const el=id=>document.getElementById(id);
  function paint(){
    const busy=boot||tasks.size>0||failed;
    document.documentElement.classList.toggle('app-loading',busy);
    const main=document.querySelector('main');if(main)main.inert=busy;
    const screen=el('app-loading');if(!screen)return;screen.hidden=!busy;screen.setAttribute('aria-busy',String(busy));
    if(!failed){el('loading-message').textContent=[...tasks.values()].pop()||'กำลังเตรียมหน้าเกม…';el('loading-detail').textContent=tasks.size?'กำลังโหลดทรัพยากร '+tasks.size+' รายการ':'กำลังตรวจความพร้อม';}
    if(!busy&&lastFocus?.isConnected){lastFocus.focus({preventScroll:true});lastFocus=null;}
  }
  function fail(message){failed=true;document.documentElement.classList.add('loading-error');paint();if(el('loading-message')){el('loading-message').textContent=message;el('loading-detail').textContent='ตรวจการเชื่อมต่อ แล้วกดลองโหลดใหม่';el('loading-retry').hidden=false;}}
  window.MRLoading={begin(label){if(!boot&&!tasks.size)lastFocus=document.activeElement;const id=++next;tasks.set(id,label);paint();let done=false;return()=>{if(done)return;done=true;tasks.delete(id);paint();};},fail};
  window.MRLoading.watchMedia=(media,label)=>{
    let done=null,timer=0;
    const finish=()=>{clearTimeout(timer);if(done){done();done=null;}};
    media.addEventListener('loadstart',()=>{finish();if(!media.getAttribute('src'))return;done=MRLoading.begin(label);timer=setTimeout(finish,12000);});
    ['canplay','error','emptied','abort'].forEach(event=>media.addEventListener(event,finish));
  };
  const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
  document.addEventListener('DOMContentLoaded',async()=>{
    el('loading-retry').onclick=()=>location.reload();paint();
    try{
      if(!window.MRBeginner||!window.MR)throw new Error('scripts');
      // Fonts have a usable local system fallback; critical image/script failures do not.
      if(document.fonts)await timeout(document.fonts.ready,5000).catch(()=>{});
      await timeout(Promise.all([...document.images].filter(i=>!i.closest('[hidden]')).map(i=>i.decode())),15000);
      boot=false;paint();
    }catch(e){fail('โหลดข้อมูลหน้าเกมไม่สำเร็จ');}
  });
  window.addEventListener('error',event=>{
    if(boot&&(event.target?.tagName==='SCRIPT'||event.error))fail('โหลดระบบเกมไม่สำเร็จ');
  },true);
  setTimeout(()=>{if(boot&&!failed)fail('การโหลดหน้าเกมใช้เวลานานเกินไป');},25000);
})();
