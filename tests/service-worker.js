// A working network response must survive unavailable/full Cache Storage.
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../dist/sw.js'),'utf8');
async function scenario(storage,online){
  const listeners={};
  vm.runInNewContext(source,{
    self:{addEventListener:(name,fn)=>listeners[name]=fn},
    location:{origin:'https://game.test'},URL,Response,
    caches:{open:async()=>{
      if(storage==='unavailable')throw Error('Storage disabled');
      return {put:async()=>{throw Error('Quota exceeded');},match:async()=>undefined};
    }},
    fetch:async()=>{if(!online)throw Error('Offline');return new Response('real script',{headers:{'Content-Type':'application/javascript'}});}
  });
  let response;
  listeners.fetch({request:{method:'GET',url:'https://game.test/ai/core.js?v=123',headers:new Headers(),mode:'cors'},respondWith:p=>response=p});
  const result=await response;
  if(online)assert.strictEqual(await result.text(),'real script');
  else assert.strictEqual(result.type,'error');
}
(async()=>{
  for(const storage of ['full','unavailable'])for(const online of [true,false])await scenario(storage,online);
  console.log('PASS service worker: full/disabled storage preserves network; missing offline scripts fail without HTML');
})().catch(e=>{console.error(e);process.exitCode=1;});
