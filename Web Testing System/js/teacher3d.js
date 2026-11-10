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

  /** สร้างหุ่นบน canvas คืน Promise ของ { render(lm, dt), dispose() } */
  function create(canvas, bytes) {
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
          if (o.isMesh || o.isSkinnedMesh) { o.frustumCulled = false; if (o.material) { o.material.metalness = 0; o.material.roughness = 0.75; } }
        });
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
        resolve({ render, model, scene, camera, renderer, floorY: footY - 0.052, dispose() { renderer.dispose(); } });
      }, (e) => reject(e instanceof Error ? e : new Error("โหลดโมเดลไม่สำเร็จ")));
    });
  }

  const api = { teacherBoneDirs, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MRTeacher3D = api;
})(typeof self !== "undefined" ? self : this);
