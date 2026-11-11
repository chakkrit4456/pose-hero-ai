/* teacher3d.js - หุ่นสอน 3D: ขยับตามท่าชุดเดียวกับที่ AI ตรวจ (MR.teachPose) จึงทำตามแล้วถูกนับเหมือนหุ่น 2D
 * teacherBoneDirs แปลงจุด 33 จุดเป็นทิศทางของกระดูก (คำนวณล้วน ทดสอบได้) ส่วน create วาดด้วย Three.js (vendor/three-teacher.js)
 * โมเดลมาจาก models/teacher.glb ฝังใน vendor/teacher-data.js เพราะหน้าที่เปิดจากไฟล์ในเครื่องโหลดไฟล์อื่นเองไม่ได้ */
(function (root) {
  "use strict";
  const K = 0.75; // ตัวคูณขนาดของ buildPose ใน core.js: ความยาวกระดูกเต็มของคนจำลองตรงกับค่าด้านล่าง (px ในภาพ 1280 x 720)
  const LEN = { spine: 170 * K, neck: 60 * K, clavicle: 80 * K, upperarm: 120 * K, forearm: 110 * K, hand: 48 * K, thigh: 130 * K, shin: 130 * K };

  /** ทิศจาก p ไป q ในพื้นที่โมเดล (x ขวา, y ขึ้น, z เข้าหากล้อง) ภาพ 2 มิติสั้นกว่าความยาวเต็ม = กระดูกชี้เข้า/ออกจากกล้อง */
  function dir3(p, q, len, zSign) {
    let x = (q[0] - p[0]) / len, y = -(q[1] - p[1]) / len;
    const d2 = x * x + y * y;
    if (d2 > 1 || !zSign) { const s = 1 / (Math.sqrt(d2) || 1); return [x * s, y * s, 0]; } // zSign 0 = อยู่ในระนาบภาพเสมอ
    return [x, y, Math.sqrt(1 - d2) * zSign];
  }
  /** lm = จุด 33 จุด (สัดส่วน 0-1 ของภาพ 1280 x 720) names = LANDMARK_NAMES  คืน { ทิศของแต่ละกระดูก, yaw = การบิดลำตัว (เรเดียน) } */
  function teacherBoneDirs(lm, names) {
    const P = (n) => { const q = lm[names.indexOf(n)]; return [q.x * 1280, q.y * 720]; };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const LS = P("left_shoulder"), RS = P("right_shoulder"), LH = P("left_hip"), RH = P("right_hip");
    const midSh = mid(LS, RS), midHip = mid(LH, RH);
    const dirs = {};
    dirs.spine = dirs.chest = dir3(midHip, midSh, LEN.spine, 1); // ก้มตัว: ไหล่ลงมาใกล้สะโพก = โน้มเข้าหากล้อง
    dirs.neck = dirs.head = dir3(midSh, P("nose"), LEN.neck, 0); // ยกไหล่ทำให้คอดูสั้นลงในภาพ ไม่ได้แปลว่าก้มหัว จึงไม่คิดความลึก
    const width = Math.hypot(RS[0] - LS[0], RS[1] - LS[1]);
    const yaw = Math.acos(Math.max(-1, Math.min(1, width / (2 * LEN.clavicle))));
    [["L", "left", 1], ["R", "right", -1]].forEach(([s, n, twist]) => {
      const S = P(n + "_shoulder"), E = P(n + "_elbow"), W = P(n + "_wrist"), I = P(n + "_index"), H = P(n + "_hip"), Kn = P(n + "_knee"), A = P(n + "_ankle");
      dirs["clavicle" + s] = dir3(midSh, S, LEN.clavicle, twist); // บิดตัว: ไหล่แคบลงในภาพ ข้างหนึ่งออกหน้า อีกข้างไปหลัง
      dirs["upperarm" + s] = dir3(S, E, LEN.upperarm, 1);
      dirs["forearm" + s] = dir3(E, W, LEN.forearm, 1);
      dirs["hand" + s] = dir3(W, I, LEN.hand, 1);
      dirs["thigh" + s] = dir3(H, Kn, LEN.thigh, 1);  // ยกเข่า: เข่าออกหน้า
      dirs["shin" + s] = dir3(Kn, A, LEN.shin, -1);   // แข้งพับกลับ
    });
    return { dirs, yaw };
  }

  // ลำดับต้องเริ่มจากกระดูกต้นทาง เพราะกระดูกลูกคิดจากตำแหน่งกระดูกพ่อ
  const ORDER = ["spine", "chest", "neck", "head", "clavicleL", "upperarmL", "forearmL", "handL", "clavicleR", "upperarmR", "forearmR", "handR", "thighL", "shinL", "thighR", "shinR"];

  // Replace the damaged facial shell and bandana with smooth surfaces on the original rig.
  function cleanHeadSurface(model) {
    const meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    meshes.forEach(source=>{
      const old=source.geometry,pos=old.attributes.position,mat=Array.isArray(source.material)?source.material[0]:source.material;
      const keep=[],indices=old.index.array;
      for(let i=0;i<indices.length;i+=3){
        const a=indices[i],b=indices[i+1],c=indices[i+2],y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
        if(y<=.09)keep.push(a,b,c);
      }
      const geometry=old.clone();geometry.setIndex(keep);source.geometry=geometry;old.dispose();
      const headIndex=source.skeleton.bones.findIndex(b=>b.name==='head');if(headIndex<0)return;
      const material=mat.clone();material.map=null;material.color.setRGB(.55,.30,.16);material.roughnessMap=null;material.metalnessMap=null;
      material.onBeforeCompile=mat.onBeforeCompile;material.customProgramCacheKey=mat.customProgramCacheKey;
      const cloth=material.clone();cloth.color.setRGB(.52,.018,.024);cloth.roughness=.95;
      cloth.customProgramCacheKey=()=> 'mascot-bandana-v1';
      cloth.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vClothRest;').replace('#include <begin_vertex>','#include <begin_vertex>\nvClothRest=position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vClothRest;').replace('#include <map_fragment>',`#include <map_fragment>
vec2 cell=vec2(atan(vClothRest.x,vClothRest.z)*2.8,vClothRest.y*18.0);
vec2 f=fract(cell)-.5;
float petals=min(min(length(f-vec2(.085,0.0)),length(f+vec2(.085,0.0))),min(length(f-vec2(0.0,.085)),length(f+vec2(0.0,.085))));
float flower=1.0-smoothstep(.058,.072,petals);
float diamond=(1.0-smoothstep(.14,.155,abs(f.x)+abs(f.y)))*smoothstep(.08,.095,abs(f.x)+abs(f.y));
float pattern=mix(flower,diamond,mod(floor(cell.x)+floor(cell.y),2.0));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.91,.89,.83),pattern*.95);
`);
      };
      function ellipsoid(name,cx,cy,cz,rx,ry,rz,lat=32,lon=64,skinMaterial=material,minLat=-Math.PI/2){
        const p=[],n=[],j=[],weights=[],ix=[];
        for(let a=0;a<=lat;a++)for(let b=0;b<=lon;b++){
          const v=minLat+(Math.PI/2-minLat)*a/lat,u=2*Math.PI*b/lon,x=Math.cos(v)*Math.cos(u),y=Math.sin(v),z=Math.cos(v)*Math.sin(u);
          const breadth=name==='smooth-head'?Math.pow(Math.max(0,Math.cos(v)),.55):Math.cos(v);
          const px=cx+Math.cos(u)*breadth*rx,py=cy+y*ry,pz=cz+Math.sin(u)*breadth*rz;
          const nose=name==='smooth-head'&&z>0?.012*Math.exp(-Math.pow(px/.025,2)-Math.pow((py-.205)/.03,2)):0;
          p.push(px,py,pz+nose);const q=name==='smooth-head'?.55:1,factor=Math.pow(Math.max(1e-12,breadth),2/q-2)/q,nz=Math.sin(u)*breadth*factor/rz,nx=Math.cos(u)*breadth*factor/rx+nz*2*px*nose/(.025*.025),ny=y/ry+nz*2*(py-.205)*nose/(.03*.03),len=Math.hypot(nx,ny,nz);n.push(nx/len,ny/len,nz/len);j.push(headIndex,0,0,0);weights.push(1,0,0,0);
          if(a<lat&&b<lon){const i=a*(lon+1)+b;ix.push(i,i+lon+1,i+1,i+1,i+lon+1,i+lon+2);}
        }
        const g=new geometry.constructor(),Attribute=geometry.attributes.position.constructor;
        g.setAttribute('position',new Attribute(new Float32Array(p),3));g.setAttribute('normal',new Attribute(new Float32Array(n),3));
        g.setAttribute('skinIndex',new geometry.attributes.skinIndex.constructor(new Uint16Array(j),4));
        g.setAttribute('skinWeight',new geometry.attributes.skinWeight.constructor(new Float32Array(weights),4));g.setIndex(ix);g.computeBoundingSphere();
        const mesh=source.clone(false);mesh.name=name;mesh.geometry=g;mesh.material=skinMaterial;source.parent.add(mesh);
      }
      ellipsoid('smooth-head',0,.207,.015,.182,.139,.182);
      ellipsoid('smooth-ear-left',-.173,.205,.005,.029,.042,.035,16,24);
      ellipsoid('smooth-ear-right',.173,.205,.005,.029,.042,.035,16,24);
      ellipsoid('smooth-neck',0,.095,.015,.045,.065,.05,16,24);
      ellipsoid('smooth-bandana',0,.20,.015,.195,.225,.195,24,64,cloth,.43);
      ellipsoid('bandana-knot',.165,.325,-.09,.055,.05,.05,16,24,cloth);
      ellipsoid('bandana-tie-upper',.21,.345,-.10,.095,.027,.035,16,32,cloth);
      ellipsoid('bandana-tie-lower',.205,.287,-.13,.08,.06,.025,16,32,cloth);
    });
  }

  /** สร้างหุ่นบน canvas คืน Promise ของ { render(lm, dt), dispose() } */
  function create(canvas, bytes, options = {}) {
    const T = root.MR_THREE;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    // กล้องไกลและมุมแคบ ท่าทางจึงดูตรงกับภาพ 2 มิติของคนจำลอง กรอบภาพพอดีทั้งท่ายืนและท่าชูแขน
    const camera = new T.PerspectiveCamera(16, canvas.width / canvas.height, 0.1, 20);
    camera.position.set(0, 0.03, 4.3);
    camera.lookAt(0, 0.03, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0x445066, 2.1));
    const key = new T.DirectionalLight(0xffffff, 1.7); key.position.set(0.7, 1.2, 2); scene.add(key);
    return new Promise((resolve, reject) => {
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      new T.GLTFLoader().parse(buf, "", (gltf) => {
        const model = gltf.scene;
        scene.add(model);
        const shadow = new T.Mesh(new T.CircleGeometry(0.3, 40), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.z = 0.5; scene.add(shadow);
        const bones = {};
        model.traverse((o) => {
          if (o.isBone) bones[o.name] = o;
          if (o.isMesh || o.isSkinnedMesh) {
            o.frustumCulled = false;
            const materials=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
            materials.forEach(material=>{
              material.metalness=0;material.roughness=options.cleanFace?0.88:0.75;material.flatShading=false;
              if(options.cleanFace){
                // The source atlas contains painted triangle seams and duplicated facial marks.
                // A coherent face in bind-space follows the rigid head without stretching UVs.
                material.roughnessMap=null;material.metalnessMap=null;
                material.customProgramCacheKey=()=> 'mascot-clean-face-v1';
                material.onBeforeCompile=shader=>{
                  const varying='\nvarying vec3 vMascotRest;\n';
                  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>'+varying).replace('#include <begin_vertex>','#include <begin_vertex>\nvMascotRest=position;');
                  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>'+varying+`
float mascotOval(vec2 p,vec2 c,vec2 r){return 1.0-smoothstep(.93,1.0,length((p-c)/r));}
`);
                  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
vec3 rp=vMascotRest;vec2 fp=rp.xy;float ax=abs(rp.x);
float faceMask=smoothstep(.105,.12,rp.y)*(1.0-smoothstep(.285,.30,rp.y))*(1.0-smoothstep(.18,.21,ax))*smoothstep(-.01,.035,rp.z);
vec3 skin=vec3(.55,.30,.16)*(1.0-.10*smoothstep(.07,.17,ax));
// Replace baked skin noise with a consistent matte skin material. Lighting now
// describes the muscles; the green costume, shoes and silver pendant keep their atlas.
float skinTone=step(.055,diffuseColor.r)*step(diffuseColor.g*1.1,diffuseColor.r)*step(diffuseColor.b*1.15,diffuseColor.g);
float armSkin=step(.185,ax)*step(-.07,rp.y)*(1.0-step(.075,rp.y));
float legSkin=step(-.425,rp.y)*(1.0-step(-.24,rp.y));
float bodySkin=skinTone*(1.0-step(.105,rp.y));
diffuseColor.rgb=mix(diffuseColor.rgb,skin,max(bodySkin,max(armSkin,legSkin)));
float greenTone=step(diffuseColor.r*1.3,diffuseColor.g)*step(diffuseColor.b*1.1,diffuseColor.g)*step(.01,diffuseColor.g);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.014,.16,.035),greenTone);
vec3 face=skin;
for(int side=0;side<2;side++){
 float ex=side==0?-.076:.076;
 float eye=mascotOval(fp,vec2(ex,.226),vec2(.038,.025));
 face=mix(face,vec3(.025,.012,.007),eye);
 face=mix(face,vec3(.83,.85,.81),mascotOval(fp,vec2(ex,.226),vec2(.034,.021)));
 face=mix(face,vec3(.16,.064,.02),mascotOval(fp,vec2(ex,.225),vec2(.014,.017)));
 face=mix(face,vec3(.008,.005,.003),mascotOval(fp,vec2(ex,.225),vec2(.007,.012)));
 face=mix(face,vec3(1.0),mascotOval(fp,vec2(ex-.004,.232),vec2(.0035,.004)));
 float cheek=mascotOval(fp,vec2(ex*1.5,.185),vec2(.024,.013));face=mix(face,vec3(.7,.22,.16),cheek*.12);
}
float browX=(ax-.076)/.042;float browY=.268+.007*(1.0-browX*browX);
float brow=(1.0-smoothstep(.002,.004,abs(rp.y-browY)))*smoothstep(.031,.038,ax)*(1.0-smoothstep(.113,.122,ax));
face=mix(face,vec3(.035,.014,.007),brow);
float upper=.172+.012*pow(ax/.092,2.0),lower=.136+.043*pow(ax/.092,2.0);
float mouth=smoothstep(lower-.002,lower+.001,rp.y)*(1.0-smoothstep(upper,upper+.003,rp.y))*(1.0-smoothstep(.088,.095,ax));
face=mix(face,vec3(.07,.018,.012),mouth);
float teeth=smoothstep(lower+.003,lower+.005,rp.y)*(1.0-smoothstep(upper-.004,upper-.002,rp.y))*(1.0-smoothstep(.083,.089,ax));
face=mix(face,vec3(.86,.83,.74),teeth);
diffuseColor.rgb=mix(diffuseColor.rgb,face,faceMask);
`);
                };
              }
              material.needsUpdate=true;
            });
          }
        });
        if(options.cleanFace)cleanHeadSurface(model);
        const missing = ORDER.concat(["hips", "footL", "footR"]).filter((n) => !bones[n]);
        if (missing.length) return reject(new Error("โมเดลขาดกระดูก: " + missing.join(", ")));
        model.updateMatrixWorld(true);
        const v = () => new T.Vector3(), q = () => new T.Quaternion();
        // ท่าเริ่มต้น (T-pose) ของแต่ละกระดูก: ทิศในโลก และการหมุนในโลก
        const bind = {};
        const childOf = { spine: "chest", chest: "neck", neck: "head", clavicleL: "upperarmL", upperarmL: "forearmL", forearmL: "handL", clavicleR: "upperarmR", upperarmR: "forearmR", forearmR: "handR", thighL: "shinL", shinL: "footL", thighR: "shinR", shinR: "footR" };
        Object.keys(bones).forEach((n) => {
          const b = bones[n], pos = b.getWorldPosition(v()), rot = b.getWorldQuaternion(q());
          let d = new T.Vector3(0, 1, 0);
          if (childOf[n]) d = bones[childOf[n]].getWorldPosition(v()).sub(pos).normalize();
          else if (n === "head") d = new T.Vector3(0, 1, 0);
          else if (n === "handL") d = new T.Vector3(-1, 0, 0);
          else if (n === "handR") d = new T.Vector3(1, 0, 0);
          bind[n] = { dir: d, rot, local: b.quaternion.clone() };
        });
        const footY = bones.footL.getWorldPosition(v()).y;
        const baseModelY = model.position.y;
        const goal = {}, tmpQ = q(), parentQ = q(), want = v(), yawAxis = new T.Vector3(0, 1, 0), yawQ = q();
        Object.keys(bones).forEach((n) => { goal[n] = bones[n].quaternion.clone(); });
        /** จัดท่าทันที (เรียก settle) หรือเกลี่ยไปหาท่าเป้าหมายตามเวลา dt วินาที */
        function render(lm, dt, names, draw = true) {
          const { dirs, yaw } = teacherBoneDirs(lm, names);
          // คำนวณท่าเป้าหมาย: หมุนจากท่า T ให้กระดูกชี้ตามทิศที่ต้องการ (ตัวละครสัดส่วนต่างจากคนจำลอง จึงใช้ทิศ ไม่ใช้ตำแหน่ง)
          Object.keys(bones).forEach((n) => bones[n].quaternion.copy(bind[n].local));
          model.position.y = baseModelY;
          model.updateMatrixWorld(true);
          ORDER.forEach((n) => {
            const b = bones[n], d = dirs[n];
            want.set(d[0], d[1], d[2]).normalize();
            tmpQ.setFromUnitVectors(bind[n].dir, want).multiply(bind[n].rot);
            if (yaw > 0.02 && (n === "spine" || n === "chest")) tmpQ.premultiply(yawQ.setFromAxisAngle(yawAxis, yaw * 0.5));
            b.parent.getWorldQuaternion(parentQ);
            b.quaternion.copy(parentQ.invert().multiply(tmpQ));
            b.updateMatrixWorld(true);
          });
          // เท้าวางราบเสมอ
          ["footL", "footR"].forEach((n) => { bones[n].parent.getWorldQuaternion(parentQ); bones[n].quaternion.copy(parentQ.invert().multiply(bind[n].rot)); });
          // เกลี่ยจากท่าที่แสดงอยู่ไปท่าเป้าหมาย: ขยับลื่นแม้เฟรมเรตแกว่ง และเปลี่ยนท่าไม่กระโดด
          const f = dt == null ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.06);
          Object.keys(bones).forEach((n) => { goal[n].slerp(bones[n].quaternion, f); bones[n].quaternion.copy(goal[n]); });
          model.updateMatrixWorld(true);
          // เท้าข้างที่ต่ำสุดอยู่บนพื้นเสมอ (ย่อเข่าแล้วตัวลง ไม่ใช่เท้าลอย)
          const low = Math.min(bones.footL.getWorldPosition(v()).y, bones.footR.getWorldPosition(v()).y);
          model.position.y = baseModelY + (footY - low);
          shadow.position.set(0, footY - 0.052, 0);
          if (draw) renderer.render(scene, camera);
        }
        resolve({ render, model, scene, camera, renderer, floorY: footY - 0.052, dispose() {
          const freed = new Set();
          const release = resource => { if (resource && resource.dispose && !freed.has(resource)) { freed.add(resource); resource.dispose(); } };
          scene.traverse(object => {
            release(object.geometry);
            const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            materials.forEach(material => { Object.values(material).forEach(value => { if (value && value.isTexture) release(value); }); release(material); });
            if (object.skeleton) release(object.skeleton);
          });
          renderer.dispose();
        } });
      }, (e) => reject(e instanceof Error ? e : new Error("โหลดโมเดลไม่สำเร็จ")));
    });
  }

  const api = { teacherBoneDirs, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MRTeacher3D = api;
})(typeof self !== "undefined" ? self : this);
