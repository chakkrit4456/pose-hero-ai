# -*- coding: utf-8 -*-
"""seed_poses.py - เพิ่ม/อัปเดต 8 ท่าบริหารเข้าระบบ (วางไฟล์นี้โฟลเดอร์เดียวกับ pose_core.py แล้วรัน)
   python seed_poses.py
- ใช้ฟังก์ชันหมุนข้อต่อแบบเดียวกับหน้า 4.2 (ความยาวกระดูกคงที่)
- ถ้าชื่อท่าซ้ำจะบันทึกทับ ไม่ซ้ำก็เพิ่มใหม่ (รันซ้ำได้ปลอดภัย)
- มุม: 0°=ชี้ลง, 90°=ขวาจอ, 180°=ชี้ขึ้น  (ซ้ายจอ = ซ้ายของผู้ทำท่า)
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose_core as pc

# ---------- หาชื่อข้อต่อจริงอัตโนมัติ (ชนิดจากชื่อ, ซ้าย/ขวาจากตำแหน่ง x ของท่ายืนตรง)
KINDS = {"head": ("head",), "sh": ("shoulder", "sho"), "el": ("elbow", "elb"),
         "wr": ("wrist", "hand")}

def resolve():
    n = pc.neutral()
    hx = n["hip"][0]
    m = {}
    for kind, keys in KINDS.items():
        for key in keys:
            cand = [j for j in pc.JOINTS if key in j.lower()]
            if cand:
                break
        for j in cand:
            side = "L" if n[j][0] < hx else "R"
            if kind == "head":
                side = "C"
            m.setdefault((kind, side), j)
    need = [("head", "C")] + [(k, s) for k in ("sh", "el", "wr") for s in "LR"]
    miss = [x for x in need if x not in m]
    if miss:
        print("หาข้อต่อไม่เจอ:", miss)
        print("JOINTS =", list(pc.JOINTS))
        print("-> แก้ KINDS ด้านบนให้ตรงกับชื่อข้อต่อ แล้วรันใหม่")
        sys.exit(1)
    return m

def ang_of(J, j):
    p = J[pc.PARENT[j]]
    return math.degrees(math.atan2(J[j][0] - p[0], J[j][1] - p[1]))

def set_angle(J, j, deg):
    """หมุนข้อต่อ j รอบจุดแม่ให้ชี้ที่มุม deg (ลูกหลานหมุนตาม) - ตรรกะเดียวกับ on_move"""
    par = J[pc.PARENT[j]]
    ang = math.radians(deg)
    old = math.atan2(J[j][0] - par[0], J[j][1] - par[1])
    phi = -(ang - old)
    c, s = math.cos(phi), math.sin(phi)
    new = dict(J)
    for k in pc.subtree(j):
        vx, vy = J[k][0] - par[0], J[k][1] - par[1]
        new[k] = [par[0] + vx * c - vy * s, par[1] + vx * s + vy * c]
    return new

# ---------- นิยามท่า: ("d", องศา) = หมุนเพิ่มจากท่ายืนตรง, ("a", องศา) = มุมสัมบูรณ์
# L = ซ้ายจอ (ซ้ายของผู้ทำ)  R = ขวาจอ ; ทำตามลำดับ (ไหล่ก่อนแขน)
POSES = [
 dict(name="เอียงคอซ้าย–ขวา", cat="คอ",
      steps=["ยืน/นั่ง หลังตรง มองตรง",
             "ค่อยๆ เอียงหูไปแตะไหล่ซ้าย ค้าง 8–10 วินาที",
             "กลับมาตรงกลาง",
             "เอียงหูไปแตะไหล่ขวา ค้าง 8–10 วินาที",
             "ทำ 2 รอบ"],
      ops=[(("head", "C"), "d", 20)]),
 dict(name="หมุนไหล่", cat="ไหล่",
      steps=["ยืน/นั่ง หลังตรง",
             "ยกไหล่ขึ้น → หมุนไปหลัง → ลง → มาหน้า เป็นวงกลม",
             "10 ครั้ง × 2 รอบ"],
      ops=[(("sh", "L"), "d", -20), (("sh", "R"), "d", 20)]),
 dict(name="ยืดกล้ามเนื้อเบื้องบน", cat="แขน/ไหล่",
      steps=["ดึงแขนข้ามลำตัว",
             "ใช้มืออีกข้างประคองข้อศอก ดึงเบาๆ เข้าหาตัว",
             "ค้าง 8–10 วินาที แล้วเปลี่ยนข้าง",
             "ทำ 2 รอบ"],
      ops=[(("el", "R"), "a", -80), (("wr", "R"), "a", -95),
           (("el", "L"), "a", -20), (("wr", "L"), "a", 115)]),
 dict(name="ยืดแขนเหนือศีรษะ", cat="แขน/ไหล่",
      steps=["ประสานมือ พลิกฝ่ามือออก",
             "ยกแขนขึ้นเหนือศีรษะ ดึงสูงขึ้นเล็กน้อย",
             "ค้าง 8–10 วินาที × 2 รอบ"],
      ops=[(("el", "L"), "a", -172), (("wr", "L"), "a", -178),
           (("el", "R"), "a", 172), (("wr", "R"), "a", 178)]),
 dict(name="หมุนข้อมือ", cat="ข้อมือ",
      steps=["กำมือหลวมๆ",
             "หมุนข้อมือไปขวา → ไปซ้าย",
             "10 ครั้ง × 2 รอบ"],
      ops=[(("el", "L"), "a", -15), (("wr", "L"), "a", 160),
           (("el", "R"), "a", 15), (("wr", "R"), "a", -160)]),
 dict(name="ยกแขนแกว่งข้าง", cat="แขน/ไหล่",
      steps=["แขนข้างลำตัว",
             "ยกแขนออกข้างลำตัวจนระดับไหล่",
             "ค่อยๆ ลดลง",
             "10 ครั้ง × 2 รอบ"],
      ops=[(("el", "L"), "a", -90), (("wr", "L"), "a", -90),
           (("el", "R"), "a", 90), (("wr", "R"), "a", 90)]),
 dict(name="ยกไหล่ขึ้น–ลง", cat="ไหล่",
      steps=["หายใจเข้า ยกไหล่ขึ้นใกล้หู",
             "หายใจออก ผ่อนไหล่ลง",
             "10 ครั้ง × 2 รอบ"],
      ops=[(("sh", "L"), "d", -45), (("sh", "R"), "d", 45)]),
 dict(name="บิดลำตัว", cat="ลำตัว",
      steps=["ยืน ขาแยกเล็กน้อย มือวางเอว",
             "บิดเอวไปซ้าย ค้าง 8–10 วินาที",
             "กลับมาตรงกลาง",
             "บิดเอวไปขวา ค้าง 8–10 วินาที",
             "ทำ 2 รอบ"],
      ops=[(("sh", "L"), "d", 10), (("sh", "R"), "d", 10),
           (("el", "L"), "a", -35), (("wr", "L"), "a", 40),
           (("el", "R"), "a", 35), (("wr", "R"), "a", -40)]),
]

def build(p, m):
    base = pc.neutral()
    J = {k: list(v) for k, v in base.items()}
    for key, mode, val in p["ops"]:
        j = m[key]
        deg = val if mode == "a" else ang_of(base, j) + val
        J = set_angle(J, j, deg)
    return J

def main():
    m = resolve()
    print("แมปข้อต่อ:", {f"{k[0]}{k[1]}": v for k, v in m.items()})
    for p in POSES:
        J = build(p, m)
        desc = "\n".join(p["steps"])
        dup = pc.store.find_by_name(p["name"])
        if dup:
            pc.store.overwrite(dup["id"], p["name"], p["cat"], desc, J)
            print("อัปเดต :", p["name"])
        else:
            pc.store.add(p["name"], p["cat"], desc, J)
            print("เพิ่มใหม่:", p["name"])
    print("เสร็จแล้ว - เปิดหน้า 4.2 เพื่อดูท่า")

if __name__ == "__main__":
    main()