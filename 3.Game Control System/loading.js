/* Runs in the head, before app scripts: no page is exposed until its tasks settle. */
(() => {
  const tasks=new Map(),issues=[];let next=0,boot=true,failed=false,lastFocus=null,ready=false,slow=false;
  const el=id=>document.getElementById(id);
  function paint(){
    const busy=boot||tasks.size>0||failed;
    document.documentElement.classList.toggle('app-loading',busy);
    const main=document.querySelector('main');if(main)main.inert=busy;
    const screen=el('app-loading');if(!screen)return;screen.hidden=!busy;screen.setAttribute('aria-busy',String(busy));
    if(!failed){el('loading-message').textContent=slow&&boot?'การเชื่อมต่อช้า กำลังโหลดระบบเกม…':[...tasks.values()].pop()||'กำลังเตรียมหน้าเกม…';el('loading-detail').textContent=slow&&boot?'รอต่อได้ หรือกดลองโหลดใหม่เพื่อรับไฟล์ล่าสุด':tasks.size?'กำลังโหลดทรัพยากร '+tasks.size+' รายการ':'กำลังตรวจความพร้อม';}
    el('loading-retry').hidden=!(failed||(slow&&boot));
    if(!busy&&lastFocus?.isConnected){lastFocus.focus({preventScroll:true});lastFocus=null;}
  }
  function warn(message){issues.push(message);console.warn('[MRLoading]',message);}
  function fail(message){failed=true;document.documentElement.classList.add('loading-error');paint();if(el('loading-message')){el('loading-message').textContent=message;el('loading-detail').textContent='กดลองโหลดใหม่เพื่อล้างแคชเกมเก่าและรับไฟล์ล่าสุด';el('loading-retry').hidden=false;}}
  window.MRLoading={ready(){ready=true;},issues,warn,begin(label,maxMs=45000){if(!boot&&!tasks.size)lastFocus=document.activeElement;const id=++next;tasks.set(id,label);paint();let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);tasks.delete(id);paint();};
    const timer=setTimeout(()=>{warn('โหลดเกินเวลา: '+label);finish();},maxMs);return finish;},fail};
  window.MRLoading.watchMedia=(media,label)=>{
    let done=null,timer=0;
    const finish=()=>{clearTimeout(timer);if(done){done();done=null;}};
    media.addEventListener('loadstart',()=>{finish();if(!media.getAttribute('src'))return;done=MRLoading.begin(label);timer=setTimeout(finish,12000);});
    ['canplay','error','emptied','abort'].forEach(event=>media.addEventListener(event,finish));
  };
  const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
  async function retry(){
      el('loading-retry').disabled=true;
      // Clear this game's worker/cache only; avoid repeatedly serving a broken old release.
      await timeout((async()=>{
        const scope=new URL('./',location.href).href;
        if(navigator.serviceWorker){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.filter(r=>r.scope===scope).map(r=>r.unregister()));}
        if(window.caches){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mr-')).map(k=>caches.delete(k)));}
      })(),3000).catch(()=>{});
      const url=new URL(location.href);url.searchParams.set('mr-retry',Date.now());location.replace(url.href);
  }
  document.addEventListener('click',event=>{if(event.target.closest?.('#loading-retry'))retry();});
  document.addEventListener('DOMContentLoaded',async()=>{
    paint();
    try{
      if(!ready||!window.MR)throw new Error('scripts');
      // Decorative images/fonts must never permanently block a working game.
      await Promise.all([
        document.fonts?timeout(document.fonts.ready,3000).catch(()=>warn('ใช้ฟอนต์สำรอง')):Promise.resolve(),
        timeout(Promise.allSettled([...document.images].filter(i=>!i.closest('[hidden]')).map(i=>i.decode().catch(()=>warn('โหลดภาพไม่ได้: '+i.getAttribute('src'))))),8000).catch(()=>warn('โหลดภาพเกินเวลา'))
      ]);
      boot=false;paint();
    }catch(e){fail('โหลดระบบเกมหลักไม่สำเร็จ');}
  });
  window.addEventListener('error',event=>{
    // External AI/3D/music helpers have their own fallbacks. Check core readiness
    // after parsing instead of turning every optional resource error into a fatal gate.
    if(event.target?.tagName==='SCRIPT')warn('โหลดสคริปต์ไม่ได้: '+event.target.getAttribute('src'));
    else if(event.error)warn(event.message||String(event.error));
  },true);
  // Do not permanently fail while the parser is still downloading scripts on a slow link.
  // DOMContentLoaded owns the core check; every asynchronous task has its own deadline.
  setTimeout(()=>{if(boot&&!failed){slow=true;paint();}},30000);
})();
