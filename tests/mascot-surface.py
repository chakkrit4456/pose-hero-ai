"""Render the repaired head from both camera endpoints and verify its rigid skinning."""
from pathlib import Path
from playwright.sync_api import sync_playwright

url=(Path(__file__).resolve().parents[1]/'3.Game Control System'/'Game Start.html').as_uri()
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    page=browser.new_page(viewport={'width':1000,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.add_init_script('localStorage.setItem("move-relieve-settings",JSON.stringify({muted:true}));localStorage.setItem("pose-hero-lobby-motion","paused")')
    page.goto(url);page.locator('#notice-ok').click()
    page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
    result=page.evaluate('''async()=>{
      const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;
      const m=await MRTeacher3D.create(canvas,Uint8Array.from(atob(MR_TEACHER_B64),c=>c.charCodeAt(0)),{cleanFace:true});
      const head=m.model.getObjectByName('smooth-head');
      if(!head)throw Error('Missing repaired head');
      const g=head.geometry,headIndex=head.skeleton.bones.findIndex(b=>b.name==='head');
      for(let i=0;i<g.attributes.position.count;i++){
        const n=g.attributes.normal;
        if(!Number.isFinite(g.attributes.position.getX(i))||Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)>.0001)throw Error('Invalid surface');
        if(g.attributes.skinIndex.getX(i)!==headIndex||g.attributes.skinWeight.getX(i)!==1)throw Error('Head must stay rigid while dancing');
      }
      for(const angle of [-35,0,35]){
        m.render(MR.buildPose({shoulder:[28,28],elbow:[95,95],knee:[150,150]}),null,MR.LANDMARK_NAMES,false);
        const a=angle*Math.PI/180;m.camera.position.set(Math.sin(a)*2.1,.23,Math.cos(a)*2.1);
        m.camera.lookAt(0,.23,0);m.renderer.render(m.scene,m.camera);
      }
      const count=g.attributes.position.count;m.dispose();return count;
    }''')
    assert not errors,errors
    print('PASS smooth head:',result,'vertices, unit normals, rigid head weights, three camera angles, no renderer errors')
    browser.close()
