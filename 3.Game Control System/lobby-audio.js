/* Home ambience has its own player, enabled flag and gain, separate from game music. */
(() => {
  const home=document.getElementById('home');if(!home)return;
  const audio=new Audio();audio.preload='auto';audio.dataset.player='lobby';
  const bar=document.createElement('div');bar.className='lobby-audio';
  bar.innerHTML='<button id="lobby-music-toggle" type="button" aria-label="ปิดเพลงหน้าหลัก" aria-pressed="true"></button><label for="lobby-music-volume">เสียงเพลงหน้าหลัก <output id="lobby-music-value">25%</output><input id="lobby-music-volume" type="range" min="0" max="100" step="1"></label><span id="lobby-music-status" role="status"></span>';
  home.querySelector('.lobby-profile').after(bar);
  const button=document.getElementById('lobby-music-toggle'),slider=document.getElementById('lobby-music-volume'),value=document.getElementById('lobby-music-value'),status=document.getElementById('lobby-music-status');
  const urls=(window.MR_MUSIC||[]).map(t=>typeof t==='string'?t:t.u).filter(Boolean),bad=new Set();
  let current='',blocked=false,playing=false,attempt=0,loadingDone=null,timer=0;
  const gain=()=>Math.max(0,Math.min(100,Number(cfg.lobbyMusicVolume)||0));
  const allowed=()=>!home.hidden&&!document.hidden&&cfg.lobbyMusicEnabled!==false&&!cfg.muted&&Number(cfg.volume)>0&&gain()>0;
  function stopLoading(){clearTimeout(timer);if(loadingDone){loadingDone();loadingDone=null;}}
  function paint(){
    slider.value=gain();value.textContent=gain()+'% ของเสียงหลัก';
    const label=cfg.lobbyMusicEnabled===false?'เปิดเพลงหน้าหลัก':blocked?'แตะเพื่อเปิดเพลงหน้าหลัก':'ปิดเพลงหน้าหลัก';
    button.setAttribute('aria-label',label);button.title=label;
    const quiet=cfg.lobbyMusicEnabled===false||blocked||cfg.muted||gain()===0||Number(cfg.volume)<=0;
    button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/>'+(quiet?'<path d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>')+'</svg>';
    button.setAttribute('aria-pressed',String(cfg.lobbyMusicEnabled!==false));button.disabled=!urls.length;
    if(!urls.length)status.textContent='ยังไม่มีเพลงในชุดเว็บนี้';
    else if(cfg.lobbyMusicEnabled===false)status.textContent='ปิดเพลงหน้าหลักแล้ว';
    else if(blocked)status.textContent='เบราว์เซอร์รอการแตะเพื่อเริ่มเสียง';
    else if(playing)status.textContent='♪ '+trackName(current);
    else if(bad.size===urls.length)status.textContent='โหลดเพลงไม่ได้ คุณยังเลือกเกมได้ตามปกติ';
    else status.textContent='สุ่มเพลงคลอเฉพาะหน้าหลัก · แยกจากเพลงในเกม';
  }
  function choose(){
    const pool=urls.filter(u=>!bad.has(u)&&u!==current);const candidates=pool.length?pool:urls.filter(u=>!bad.has(u));
    if(!candidates.length)return false;
    current=candidates[Math.floor(Math.random()*candidates.length)];audio.src=current;return true;
  }
  function pause(){attempt++;playing=false;audio.pause();stopLoading();paint();}
  async function start(showLoading=false){
    if(!allowed()){pause();return;}
    audio.volume=cfg.muted?0:Math.max(0,Math.min(1,(Number(cfg.volume)||0)/100*gain()/100));
    if(!current&&!choose()){paint();return;}
    const token=++attempt;
    if(showLoading&&audio.readyState<3&&window.MRLoading){stopLoading();loadingDone=MRLoading.begin('กำลังเตรียมเพลงหน้าหลัก…');timer=setTimeout(stopLoading,12000);}
    try{await audio.play();if(token!==attempt||!allowed()){if(!allowed())audio.pause();return;}blocked=false;playing=true;stopLoading();paint();}
    catch(e){if(token!==attempt)return;playing=false;stopLoading();if(e.name==='NotAllowedError')blocked=true;paint();}
  }
  function sync(){audio.volume=cfg.muted?0:Math.max(0,Math.min(1,(Number(cfg.volume)||0)/100*gain()/100));paint();if(allowed())start(true);else pause();}
  button.onclick=()=>{
    if(blocked){blocked=false;cfg.lobbyMusicEnabled=true;}else cfg.lobbyMusicEnabled=cfg.lobbyMusicEnabled===false;
    if(cfg.lobbyMusicEnabled)bad.clear();saveCfg();start(true);
  };
  slider.oninput=()=>{cfg.lobbyMusicVolume=Number(slider.value);saveCfg();sync();};
  audio.addEventListener('canplay',stopLoading);
  audio.addEventListener('ended',()=>{playing=false;if(allowed()&&choose())start();else paint();});
  audio.addEventListener('error',()=>{stopLoading();playing=false;if(current)bad.add(current);if(allowed()&&choose())start();else paint();});
  new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',sync);window.addEventListener('mr-config-change',sync);
  document.addEventListener('click',()=>{if(blocked&&allowed())setTimeout(()=>start(),0);});
  // Wait for the initial loading gate; autoplay may still need the user's first click.
  const observer=new MutationObserver(()=>{if(!document.documentElement.classList.contains('app-loading')){observer.disconnect();sync();}});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  // Buffer only the selected first track under the initial gate, never the whole library.
  if(allowed()&&urls.length&&window.MRLoading){loadingDone=MRLoading.begin('กำลังเตรียมเพลงหน้าหลัก…');timer=setTimeout(stopLoading,12000);choose();}
  paint();if(!document.documentElement.classList.contains('app-loading')){observer.disconnect();sync();}
  // Read-only diagnostics for integration tests and support.
  window.MRLobbyAudio={get audio(){return audio;},get current(){return current;}};
})();
