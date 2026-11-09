# -*- coding: utf-8 -*-
"""
ติดโครงกระดูกให้โมเดล 3D ของหุ่นสอน (โมเดลท่า T-pose ที่ไม่มีกระดูก) แล้วส่งออกเป็น .glb ที่เบาพอใช้ในเกม

ใช้:  blender -b --python tools/rig_teacher.py -- <input.glb> <output.glb> [จำนวนสามเหลี่ยม]

ขั้นตอน: ลดความละเอียด -> ลดขนาดลาย -> สร้างกระดูกตามตำแหน่งข้อต่อในตาราง JOINTS -> คำนวณน้ำหนักผิวจากระยะถึงกระดูก -> ส่งออก
ตำแหน่งใน JOINTS เป็นพิกัดของโมเดล (glTF: x = ขวาบนจอ, y = ขึ้น, z = เข้าหากล้อง) ถ้าเปลี่ยนโมเดลต้องแก้ตารางนี้
"""
import sys
import bpy
import numpy as np
from mathutils import Vector, kdtree

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
TARGET_TRIS = int(argv[2]) if len(argv) > 2 else 30000
TEXTURE_SIZE = 1024

# (ชื่อกระดูก, พ่อ, จุดเริ่ม, จุดจบ) พิกัด glTF  L = ซ้ายบนจอ (x ติดลบ), R = ขวาบนจอ
Y_HIP, Y_SHOULDER = -0.165, 0.03
JOINTS = [
    ("hips",      None,    (0, Y_HIP, 0),            (0, -0.08, 0)),
    ("spine",     "hips",  (0, -0.08, 0),            (0, -0.02, 0)),
    ("chest",     "spine", (0, -0.02, 0),            (0, 0.07, 0)),
    ("neck",      "chest", (0, 0.07, 0),             (0, 0.115, 0)),
    ("head",      "neck",  (0, 0.115, 0),            (0, 0.42, 0)),
]
for side, s in (("L", -1), ("R", 1)):
    JOINTS += [
        ("clavicle" + side, "chest",            (s * 0.03, 0.05, 0),          (s * 0.165, Y_SHOULDER, 0)),
        ("upperarm" + side, "clavicle" + side,  (s * 0.165, Y_SHOULDER, 0),   (s * 0.29, 0.005, 0)),
        ("forearm" + side,  "upperarm" + side,  (s * 0.29, 0.005, 0),         (s * 0.41, -0.002, 0)),
        ("hand" + side,     "forearm" + side,   (s * 0.41, -0.002, 0),        (s * 0.5, -0.004, 0)),
        ("thigh" + side,    "hips",             (s * 0.075, Y_HIP, 0),        (s * 0.11, -0.325, 0)),
        ("shin" + side,     "thigh" + side,     (s * 0.11, -0.325, 0),        (s * 0.125, -0.455, 0)),
        ("foot" + side,     "shin" + side,      (s * 0.125, -0.455, 0),       (s * 0.125, -0.49, 0.1)),
    ]


def to_blender(p):
    return Vector((p[0], -p[2], p[1]))  # glTF (y ขึ้น) -> Blender (z ขึ้น)


# ---- นำเข้าและรวมการแปลงของโมเดล
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("หลังนำเข้า: สามเหลี่ยม", sum(len(p.vertices) - 2 for p in mesh.data.polygons), "bounds", [tuple(round(v, 3) for v in c) for c in (mesh.bound_box[0], mesh.bound_box[6])])

# ---- ลดความละเอียด
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0002, use_unselected=False)
bpy.ops.object.mode_set(mode="OBJECT")
tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
mod = mesh.modifiers.new("decimate", "DECIMATE")
mod.decimate_type = "COLLAPSE"
mod.ratio = min(1.0, TARGET_TRIS / max(1, tris))
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=mod.name)
mesh.data.shade_smooth()  # หลังลดความละเอียดต้องตั้งแสงเงาเรียบใหม่ มิฉะนั้นผิวแตกเป็นเหลี่ยม
print("หลังลดความละเอียด: สามเหลี่ยม", sum(len(p.vertices) - 2 for p in mesh.data.polygons), "จุด", len(mesh.data.vertices))

# ---- แต่งใบหน้าลงบนลายผิวให้ดูเป็นมิตร: ต้นฉบับคิ้วขมวด ตาเป็นร่องดำ ฟันเทา ปากฉีกกว้าง (พิกัด glTF ดูจากภาพใบหน้าที่ตีเส้นพิกัด ถ้าเปลี่ยนโมเดลต้องแก้)
EYES = [(-0.076, 0.226), (0.076, 0.226)]
EYE_RX, EYE_RY = 0.036, 0.027        # ตากลม ไม่เป็นตาเรียวดุ
TEETH_X, TEETH_Y = 0.082, (0.128, 0.186)  # ปากแคบลงจากเดิม รอยยิ้มจึงไม่ฉีกกว้าง
SKIN = [0.86, 0.66, 0.50]            # แทนด้วยสีผิวจริงจากหน้าผาก (ดู paint_face)
SOFT = lambda t: max(0.0, min(1.0, t))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def face_paint(x, y, rgb):
    """คืนสีใหม่ของจุด (x, y) บนใบหน้า หรือ None = คงสีเดิม"""
    hi, lo = max(rgb), min(rgb)
    ax = abs(x)
    for ex, ey in EYES:
        dx, dy = (x - ex) / EYE_RX, (y - ey) / EYE_RY
        e = dx * dx + dy * dy
        if e > 1:
            continue
        if e > 0.86 and y > ey - 0.008:
            return (0.16, 0.10, 0.08)  # เส้นขอบตาด้านบนเท่านั้น ดูนุ่มกว่าขอบรอบตา
        d = ((x - ex) ** 2 + (y - (ey - 0.002)) ** 2) ** 0.5
        h1 = ((x - (ex - 0.0075)) ** 2 + (y - (ey + 0.0075)) ** 2) ** 0.5
        h2 = ((x - (ex + 0.0065)) ** 2 + (y - (ey - 0.0085)) ** 2) ** 0.5
        if h1 < 0.0068:
            return (1.0, 1.0, 1.0)     # จุดสะท้อนแสงใหญ่ ทำให้ตาดูสดใส
        if h2 < 0.0032:
            return (0.92, 0.95, 1.0)
        if d < 0.0125:
            return (0.05, 0.03, 0.03)  # รูม่านตาใหญ่
        if d < 0.0225:
            return (0.34, 0.20, 0.09)  # ตาดำโต จึงแทบไม่เห็นตาขาวรอบตา
        return (0.98, 0.98, 0.96)
    # คิ้วใหม่: โค้งบาง สีน้ำตาลเข้ม ไม่ขมวดชี้ลง
    if 0.036 < ax < 0.116:
        arc = 0.268 + 0.009 * (1 - ((ax - 0.076) / 0.04) ** 2)
        if abs(y - arc) < 0.0042:
            return (0.22, 0.14, 0.10)
    # ลบคิ้วเดิม ร่องตาเดิม และเส้นดำที่แก้ม ด้วยสีผิว
    if (hi < 0.42 or hi - lo < 0.16) and ((0.015 < ax < 0.145 and 0.205 < y < 0.285) or (ax > 0.085 and 0.125 < y < 0.195)):  # รวมเศษสีเทาของคิ้วเดิม สีผิวอิ่มตัวกว่าจึงไม่โดนลบ
        return tuple(SKIN)
    # ปาก: เหลือช่วงกลาง สีขาวนวล ไม่มีร่องซี่ฟัน
    if 0.125 < y < 0.19 and hi > 0.33 and hi - lo < 0.13:
        if ax < TEETH_X:
            return (0.96, 0.95, 0.91)
        if ax < 0.125:
            return tuple(SKIN)          # ปลายฟันเดิมที่ยาวเกินกลายเป็นแก้ม รอยยิ้มจึงแคบลง
    if ax > 0.08 and 0.125 < y < 0.19 and hi < 0.42:
        return tuple(SKIN)
    # แก้มชมพูอ่อน
    d = (((ax - 0.112) / 0.03) ** 2 + ((y - 0.183) / 0.019) ** 2) ** 0.5
    if d < 1:
        return mix(rgb, (0.97, 0.56, 0.52), 0.42 * (1 - d))
    return None


def paint_face():
    mat = mesh.data.materials[0]
    node = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    img = node.inputs["Base Color"].links[0].from_node.image
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    mesh.data.calc_loop_triangles()
    uvs = mesh.data.uv_layers.active.data
    # สีผิวจริงจากกลางหน้าผาก ใช้กลบคิ้วและเส้นเดิมให้กลืนกับหน้า
    samples = []
    for tri in mesh.data.loop_triangles:
        c = sum((mesh.data.vertices[v].co for v in tri.vertices), Vector()) / 3
        if c[1] < -0.05 and abs(c[0]) < 0.05 and 0.272 < c[2] < 0.292:
            a = uvs[tri.loops[0]].uv
            samples.append(px[min(h - 1, int(a.y * h)), min(w - 1, int(a.x * w)), :3])
    if samples:
        SKIN[:] = [float(v) for v in np.median(np.array(samples), axis=0)]
    print("สีผิวจากหน้าผาก", [round(v, 2) for v in SKIN])
    count = 0
    for tri in mesh.data.loop_triangles:
        co = [mesh.data.vertices[v].co for v in tri.vertices]
        # glTF: x = x, y = z ของ Blender, ด้านหน้าคือ y ของ Blender ติดลบ
        if max(c[1] for c in co) > -0.05 or max(c[2] for c in co) < 0.12 or min(c[2] for c in co) > 0.295 or min(abs(c[0]) for c in co) > 0.15:
            continue
        uv = [uvs[l].uv for l in tri.loops]
        p = [(a.x * w, a.y * h) for a in uv]
        x0, x1 = int(min(q[0] for q in p)), int(max(q[0] for q in p)) + 1
        y0, y1 = int(min(q[1] for q in p)), int(max(q[1] for q in p)) + 1
        den = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1])
        if abs(den) < 1e-9:
            continue
        for ty in range(max(0, y0), min(h, y1 + 1)):
            for tx in range(max(0, x0), min(w, x1 + 1)):
                l0 = ((p[1][1] - p[2][1]) * (tx + 0.5 - p[2][0]) + (p[2][0] - p[1][0]) * (ty + 0.5 - p[2][1])) / den
                l1 = ((p[2][1] - p[0][1]) * (tx + 0.5 - p[2][0]) + (p[0][0] - p[2][0]) * (ty + 0.5 - p[2][1])) / den
                l2 = 1 - l0 - l1
                if min(l0, l1, l2) < -0.02:  # เผื่อขอบ ไม่ให้เกิดรอยต่อระหว่างสามเหลี่ยม
                    continue
                gx = l0 * co[0][0] + l1 * co[1][0] + l2 * co[2][0]
                gy = l0 * co[0][2] + l1 * co[1][2] + l2 * co[2][2]
                c = face_paint(gx, gy, px[ty, tx, :3])
                if c is not None:
                    px[ty, tx, :3] = c
                    count += 1
    img.pixels.foreach_set(px.ravel())
    img.update()
    print("วาดตาและฟัน:", count, "จุดบนลาย", w, "x", h)


paint_face()

# ---- ลดขนาดลาย
for im in bpy.data.images:
    if im.size[0] > TEXTURE_SIZE:
        im.scale(TEXTURE_SIZE, TEXTURE_SIZE)
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    print("วัสดุ", mat.name, [n.bl_idname for n in mat.node_tree.nodes])
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            print("  ลายที่ต่อ:", [(i.name, i.links[0].from_node.bl_idname) for i in n.inputs if i.is_linked])

# ---- สร้างกระดูก
arm_data = bpy.data.armatures.new("TeacherRig")
arm = bpy.data.objects.new("TeacherRig", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name, parent, head, tail in JOINTS:
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = to_blender(head), to_blender(tail)
    if parent:
        b.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

# ---- น้ำหนักผิว: ยิ่งใกล้กระดูกยิ่งขยับตาม กระดูกแขน/ขาข้างหนึ่งไม่ดึงผิวอีกข้าง เพื่อไม่ให้ขาสองข้างติดกัน
names = [j[0] for j in JOINTS]
heads = np.array([list(to_blender(j[2])) for j in JOINTS])
tails = np.array([list(to_blender(j[3])) for j in JOINTS])
verts = np.array([list(v.co) for v in mesh.data.vertices])
axis = tails - heads
len2 = np.maximum((axis * axis).sum(1), 1e-9)
weights = np.zeros((len(verts), len(names)))
for i in range(len(names)):
    rel = verts - heads[i]
    t = np.clip((rel * axis[i]).sum(1) / len2[i], 0, 1)
    d = np.linalg.norm(rel - t[:, None] * axis[i], axis=1)
    w = 1.0 / np.power(d + 0.015, 4)
    if names[i][-1] in "LR" and names[i] != "hips":
        s = -1 if names[i].endswith("L") else 1
        w[verts[:, 0] * s < -0.005] = 0
    weights[:, i] = w
weights /= np.maximum(weights.sum(1, keepdims=True), 1e-12)
# เกลี่ยน้ำหนักตามระยะทางในพื้นที่: โมเดลจาก AI มักแยกเป็นชิ้นเล็กจำนวนมาก จึงเกลี่ยตามเส้นเชื่อมผิวไม่ได้
# จุดที่อยู่ใกล้กันต้องมีน้ำหนักใกล้กันแม้เป็นคนละชิ้น ผิวจึงยืดนุ่มนวลแทนที่จะฉีกตรงรอยต่อกระดูก
SMOOTH_RADIUS = float(argv[3]) if len(argv) > 3 else 0.035
SMOOTH_ROUNDS = int(argv[4]) if len(argv) > 4 else 12
CROTCH_Y = -0.22       # ใต้เป้า: ไม่เกลี่ยข้ามขาซ้าย-ขวา ขาจึงไม่ติดกัน
RIGID_HEAD_Y = 0.135   # เหนือคางขึ้นไปหัวแข็งทั้งชิ้น ใบหน้าจึงไม่บิดเบี้ยว ส่วนคอรับการยืดแทน
kd = kdtree.KDTree(len(verts))
for i, v in enumerate(verts):
    kd.insert(v, i)
kd.balance()
rows, cols, vals = [], [], []
for i, v in enumerate(verts):
    for _, j, d in kd.find_range(v, SMOOTH_RADIUS):
        if v[2] < CROTCH_Y and v[0] * verts[j][0] < 0:
            continue
        rows.append(i); cols.append(j); vals.append(np.exp(-(d / (SMOOTH_RADIUS * 0.6)) ** 2))
rows, cols, vals = np.array(rows), np.array(cols), np.array(vals)
norm = np.bincount(rows, weights=vals, minlength=len(verts))
print("เกลี่ยน้ำหนัก: เฉลี่ยจุดข้างเคียง", round(len(rows) / len(verts), 1), "จุดต่อจุด")
rigid = verts[:, 2] > RIGID_HEAD_Y
one_head = np.zeros(len(names)); one_head[names.index("head")] = 1
for _ in range(SMOOTH_ROUNDS):
    weights[rigid] = one_head
    total = np.zeros_like(weights)
    np.add.at(total, rows, weights[cols] * vals[:, None])
    weights = total / norm[:, None]
weights[rigid] = one_head
# เสื้อและผิวเหนือแนวสะโพกไม่ตามต้นขา: ยกเข่าแล้วเสื้อไม่ถูกดึงจนฉีก ค่อย ๆ เพิ่มผลของต้นขาจากแนวสะโพกลงไป
ramp = np.clip((Y_HIP - 0.015 - verts[:, 2]) / 0.06, 0, 1)
for side in "LR":
    weights[:, names.index("thigh" + side)] *= ramp
    weights[:, names.index("shin" + side)] *= ramp
# เหลือกระดูกที่มีน้ำหนักมากสุด 4 ตัวต่อจุด (ข้อจำกัดของ glTF)
order = np.argsort(-weights, axis=1)
for v in range(len(verts)):
    weights[v, order[v, 4:]] = 0
weights /= np.maximum(weights.sum(1, keepdims=True), 1e-12)
groups = [mesh.vertex_groups.new(name=n) for n in names]
for v in range(len(verts)):
    for i in np.nonzero(weights[v] > 0.003)[0]:
        groups[i].add([v], float(weights[v, i]), "REPLACE")
mesh.parent = arm
m = mesh.modifiers.new("Armature", "ARMATURE")
m.object = arm
print("น้ำหนักเสร็จ: ไม่มีกระดูกคุม", int((weights.sum(1) < 0.5).sum()), "จุด")

# ---- ส่งออก
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True,
                          export_image_format="JPEG", export_jpeg_quality=82, export_animations=False, export_morph=False,
                          export_tangents=False, export_yup=True, export_apply=False)
print("ส่งออก:", OUT)
