# -*- coding: utf-8 -*-
"""
pose_core.py - โมดูลกลางของระบบท่าบริหารร่างกาย (MOVE & RELIEVE ขยับกาย ทลายเมื่อย)

- เก็บท่าเป็น "โครงกระดูก 15 จุด" (พิกัด 0-1) เพื่อให้ทุกท่าแสดงผลและทำตามได้ตรงกันทุกครั้ง
- ข้อมูลเก็บที่ data/poses.json (สำรองอัตโนมัติเป็น poses.bak.json ก่อนบันทึกทุกครั้ง)
- มุมทุกมุมนับจาก "ชี้ลงล่าง = 0°", บวก = ไปทางขวาของหน้าจอ, 180° = ชี้ขึ้น
- ภาพเป็นแบบ "ส่องกระจก": ซ้ายของหน้าจอ = ซ้ายของผู้ทำท่า
"""
import json
import math
import os
import shutil
import sys
import uuid
import tkinter as tk
from tkinter import ttk

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "poses.json")
BACKUP_FILE = os.path.join(DATA_DIR, "poses.bak.json")

FONT = ("Tahoma", 11)
FONT_B = ("Tahoma", 12, "bold")
FONT_BIG = ("Tahoma", 24, "bold")
FONT_MID = ("Tahoma", 15, "bold")

CATEGORIES = ["คอ", "ไหล่และแขน", "หลังและลำตัว", "ขาและสะโพก", "ทั้งตัว"]

JOINTS = ["head", "neck", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow",
          "l_hand", "r_hand", "hip", "l_hip", "r_hip", "l_knee", "r_knee",
          "l_foot", "r_foot"]

JOINT_TH = {
    "head": "ศีรษะ", "neck": "คอ/อก", "hip": "สะโพก(กลาง)",
    "l_shoulder": "ไหล่ซ้าย", "r_shoulder": "ไหล่ขวา",
    "l_elbow": "ศอกซ้าย", "r_elbow": "ศอกขวา",
    "l_hand": "มือซ้าย", "r_hand": "มือขวา",
    "l_hip": "ข้อสะโพกซ้าย", "r_hip": "ข้อสะโพกขวา",
    "l_knee": "เข่าซ้าย", "r_knee": "เข่าขวา",
    "l_foot": "เท้าซ้าย", "r_foot": "เท้าขวา",
}

# จุดแม่ของแต่ละข้อต่อ (หมุนรอบจุดแม่ ความยาวกระดูกคงที่ -> สัดส่วนร่างกายไม่เพี้ยน)
PARENT = {
    "neck": "hip", "head": "neck",
    "l_shoulder": "neck", "r_shoulder": "neck",
    "l_elbow": "l_shoulder", "r_elbow": "r_shoulder",
    "l_hand": "l_elbow", "r_hand": "r_elbow",
    "l_hip": "hip", "r_hip": "hip",
    "l_knee": "l_hip", "r_knee": "r_hip",
    "l_foot": "l_knee", "r_foot": "r_knee",
}
CHILDREN = {}
for _c, _p in PARENT.items():
    CHILDREN.setdefault(_p, []).append(_c)

BONES = [("head", "neck"), ("neck", "l_shoulder"), ("neck", "r_shoulder"),
         ("l_shoulder", "l_elbow"), ("l_elbow", "l_hand"),
         ("r_shoulder", "r_elbow"), ("r_elbow", "r_hand"),
         ("neck", "hip"), ("hip", "l_hip"), ("hip", "r_hip"),
         ("l_hip", "l_knee"), ("l_knee", "l_foot"),
         ("r_hip", "r_knee"), ("r_knee", "r_foot")]


def subtree(j):
    """ข้อต่อ j และลูกหลานทั้งหมด"""
    out, stack = [], [j]
    while stack:
        k = stack.pop()
        out.append(k)
        stack.extend(CHILDREN.get(k, []))
    return out


def mirror_name(k):
    if k.startswith("l_"):
        return "r_" + k[2:]
    if k.startswith("r_"):
        return "l_" + k[2:]
    return k


def mirror_joints(J):
    return {mirror_name(k): [1.0 - v[0], v[1]] for k, v in J.items()}


# ---------------------------------------------------------------- สร้างท่าจากมุม
def _seg(p, ang_deg, length):
    a = math.radians(ang_deg)
    return (p[0] + length * math.sin(a), p[1] + length * math.cos(a))


def build_pose(lean=0, head_tilt=0, l_arm=(-12, -5), r_arm=(12, 5),
               l_leg=(-6, -3), r_leg=(6, 3), hip_x=0.5, hip_y=0.58):
    """lean = เอียงลำตัว (องศา, ลบ = เอียงซ้ายจอ)
    arm = (มุมต้นแขน, มุมท่อนแขน)  leg = (มุมต้นขา, มุมหน้าแข้ง)  0=ลง 90=ขวา 180=ขึ้น"""
    TR, SH, UA, FA, TH, SN, HW, HD = 0.26, 0.09, 0.15, 0.13, 0.18, 0.18, 0.05, 0.09
    hip = (hip_x, hip_y)
    t = math.radians(lean)
    up = (math.sin(t), -math.cos(t))
    perp = (math.cos(t), math.sin(t))
    neck = (hip[0] + up[0] * TR, hip[1] + up[1] * TR)
    ht = math.radians(lean + head_tilt)
    head = (neck[0] + math.sin(ht) * HD, neck[1] - math.cos(ht) * HD)
    ls = (neck[0] - perp[0] * SH, neck[1] - perp[1] * SH)
    rs = (neck[0] + perp[0] * SH, neck[1] + perp[1] * SH)
    le = _seg(ls, l_arm[0], UA)
    lh = _seg(le, l_arm[1], FA)
    re = _seg(rs, r_arm[0], UA)
    rh = _seg(re, r_arm[1], FA)
    lhp = (hip[0] - HW, hip[1])
    rhp = (hip[0] + HW, hip[1])
    lk = _seg(lhp, l_leg[0], TH)
    lf = _seg(lk, l_leg[1], SN)
    rk = _seg(rhp, r_leg[0], TH)
    rf = _seg(rk, r_leg[1], SN)
    J = {"head": head, "neck": neck, "l_shoulder": ls, "r_shoulder": rs,
         "l_elbow": le, "r_elbow": re, "l_hand": lh, "r_hand": rh,
         "hip": hip, "l_hip": lhp, "r_hip": rhp, "l_knee": lk, "r_knee": rk,
         "l_foot": lf, "r_foot": rf}
    return {k: [round(v[0], 4), round(v[1], 4)] for k, v in J.items()}


def neutral():
    return build_pose()


def _pose(pid, name, cat, desc, joints, reps=10, hold=5, sets=1, rest=10):
    return {"id": pid, "name": name, "category": cat, "description": desc,
            "joints": joints, "reps": reps, "hold": hold, "sets": sets,
            "rest": rest}


def seed_poses():
    return [
        _pose("seed-01", "ยืดแขนเหนือศีรษะ", "ไหล่และแขน",
              "ยืนตรง เท้าห่างกันเท่าช่วงไหล่\nประสานมือ ยกแขนขึ้นเหนือศีรษะ\nเหยียดแขนให้สุด ดึงตัวขึ้นสูง ค้างไว้\nหายใจเข้าออกช้า ๆ แล้วลดแขนลง",
              build_pose(l_arm=(-166, -176), r_arm=(166, 176))),
        _pose("seed-02", "ยืดข้างลำตัว (เอียงซ้าย)", "หลังและลำตัว",
              "ยืนตรง ยกสองแขนขึ้นเหนือศีรษะ\nเอียงลำตัวไปทางซ้ายช้า ๆ ให้รู้สึกตึงที่ชายโครงขวา\nสะโพกอยู่กับที่ ห้ามบิดตัว ค้างไว้แล้วกลับท่าตรง",
              build_pose(lean=-25, l_arm=(-155, -155), r_arm=(-150, -155),
                         l_leg=(-8, -4), r_leg=(8, 4))),
        _pose("seed-03", "ยืดข้างลำตัว (เอียงขวา)", "หลังและลำตัว",
              "ยืนตรง ยกสองแขนขึ้นเหนือศีรษะ\nเอียงลำตัวไปทางขวาช้า ๆ ให้รู้สึกตึงที่ชายโครงซ้าย\nสะโพกอยู่กับที่ ห้ามบิดตัว ค้างไว้แล้วกลับท่าตรง",
              build_pose(lean=25, l_arm=(150, 155), r_arm=(155, 155),
                         l_leg=(-8, -4), r_leg=(8, 4))),
        _pose("seed-04", "กางแขนหมุนไหล่", "ไหล่และแขน",
              "ยืนตรง กางแขนสองข้างระดับไหล่ ฝ่ามือคว่ำ\nหมุนแขนเป็นวงเล็ก ๆ ไปข้างหน้า แล้วหมุนกลับ\nเก็บไหล่ให้ต่ำ ไม่ยกไหล่",
              build_pose(l_arm=(-90, -90), r_arm=(90, 90))),
        _pose("seed-05", "ประสานมือหลังศีรษะ ยืดอก", "ไหล่และแขน",
              "ประสานมือหลังศีรษะ ศอกกางออกด้านข้าง\nเปิดอกดึงศอกไปด้านหลังเล็กน้อย ค้างไว้\nห้ามดึงศีรษะ ให้ใช้แรงที่หลังส่วนบน",
              build_pose(l_arm=(-80, 140), r_arm=(80, -140))),
        _pose("seed-06", "ยืนแยกเท้า ย่อเข่า", "ขาและสะโพก",
              "ยืนแยกเท้ากว้างกว่าช่วงไหล่ ปลายเท้าเฉียงออกเล็กน้อย\nย่อเข่าลง หลังตรง เข่าชี้ไปทางเดียวกับปลายเท้า\nค้างไว้ แล้วดันตัวกลับขึ้น",
              build_pose(hip_y=0.64, l_arm=(-35, -20), r_arm=(35, 20),
                         l_leg=(-55, 5), r_leg=(55, -5))),
    ]


# ---------------------------------------------------------------- เก็บข้อมูล
class Bus:
    """ระบบส่งสัญญาณระหว่างหน้าจอ (เช่น 'changed', 'select', 'goto')"""

    def __init__(self):
        self._h = {}

    def on(self, ev, fn):
        self._h.setdefault(ev, []).append(fn)

    def emit(self, ev, *a):
        for fn in list(self._h.get(ev, [])):
            try:
                fn(*a)
            except tk.TclError:
                pass  # หน้าจอถูกปิดไปแล้ว


bus = Bus()


def _clean_pose(p):
    base = neutral()
    j = p.get("joints") or {}
    p["joints"] = {k: [float(j[k][0]), float(j[k][1])] if k in j else base[k]
                   for k in JOINTS}
    p.setdefault("name", "ท่าไม่มีชื่อ")
    p.setdefault("category", "ทั้งตัว")
    p.setdefault("description", "")
    p["reps"] = int(p.get("reps", 10))
    p["hold"] = int(p.get("hold", 5))
    p["sets"] = int(p.get("sets", 1))
    p["rest"] = int(p.get("rest", 10))
    p.setdefault("id", uuid.uuid4().hex[:8])
    return p


class Store:
    def __init__(self):
        self.poses = []
        self.load()

    def load(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, encoding="utf-8") as f:
                    self.poses = [_clean_pose(p) for p in json.load(f)["poses"]]
                return
            except Exception:
                # ไฟล์เสีย: เก็บไว้เป็น .bad แล้วเริ่มใหม่ ไม่ทับของเดิม
                try:
                    os.replace(DATA_FILE, DATA_FILE + ".bad")
                except OSError:
                    pass
        self.poses = seed_poses()
        self.save(emit=False)

    def save(self, emit=True):
        os.makedirs(DATA_DIR, exist_ok=True)
        if os.path.exists(DATA_FILE):
            try:
                shutil.copyfile(DATA_FILE, BACKUP_FILE)
            except OSError:
                pass
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "poses": self.poses}, f,
                      ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
        if emit:
            bus.emit("changed")

    def get(self, pid):
        for p in self.poses:
            if p["id"] == pid:
                return p
        return None

    def find_by_name(self, name):
        for p in self.poses:
            if p["name"].strip() == name.strip():
                return p
        return None

    def add(self, name, category, description, joints):
        p = _clean_pose({"id": uuid.uuid4().hex[:8], "name": name,
                         "category": category, "description": description,
                         "joints": joints})
        self.poses.append(p)
        self.save()
        return p

    def overwrite(self, pid, name, category, description, joints):
        p = self.get(pid)
        if not p:
            return self.add(name, category, description, joints)
        p.update(name=name, category=category, description=description,
                 joints={k: list(v) for k, v in joints.items()})
        self.save()
        return p

    def update_settings(self, pid, reps, hold, sets, rest):
        p = self.get(pid)
        if p:
            p.update(reps=int(reps), hold=int(hold), sets=int(sets), rest=int(rest))
            self.save()

    def delete(self, pid):
        self.poses = [p for p in self.poses if p["id"] != pid]
        self.save()

    def categories(self):
        extra = sorted({p["category"] for p in self.poses} - set(CATEGORIES))
        return CATEGORIES + extra


store = Store()


# ---------------------------------------------------------------- วาดภาพ
def canvas_size(c):
    w, h = c.winfo_width(), c.winfo_height()
    if w < 50 or h < 50:
        w, h = int(c.cget("width")), int(c.cget("height"))
    return w, h


def to_px(p, w, h):
    s = min(w, h)
    return ((w - s) / 2 + p[0] * s, p[1] * s)


def from_px(x, y, w, h):
    s = min(w, h)
    return ((x - (w - s) / 2) / s, y / s)


def draw_pose(c, joints, color="#1f6feb", width_ratio=0.028, tag="pose",
              handles=False, active=None):
    w, h = canvas_size(c)
    s = min(w, h)
    lw = max(3, int(s * width_ratio))
    P = {k: to_px(v, w, h) for k, v in joints.items()}
    for a, b in BONES:
        c.create_line(*P[a], *P[b], fill=color, width=lw, capstyle="round",
                      tags=tag)
    r = s * 0.06
    hx, hy = P["head"]
    c.create_oval(hx - r, hy - r, hx + r, hy + r, outline=color, width=lw,
                  fill="white", tags=tag)
    if handles:
        for k in JOINTS:
            x, y = P[k]
            rr = 8 if k != "hip" else 10
            fill = "#ff7b00" if k == active else ("#e5534b" if k == "hip" else "#ffffff")
            c.create_oval(x - rr, y - rr, x + rr, y + rr, fill=fill,
                          outline="#333333", width=2, tags=tag)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp_pose(a, b, t):
    return {k: [a[k][0] + (b[k][0] - a[k][0]) * t,
                a[k][1] + (b[k][1] - a[k][1]) * t] for k in JOINTS}


def beep():
    try:
        import winsound
        winsound.Beep(880, 90)
    except Exception:
        pass


# ---------------------------------------------------------------- UI helper
def setup_style(root):
    st = ttk.Style(root)
    try:
        st.theme_use("clam")
    except tk.TclError:
        pass
    root.option_add("*Font", FONT)
    st.configure(".", font=FONT)
    st.configure("Treeview", rowheight=26, font=FONT)
    st.configure("Treeview.Heading", font=FONT_B)
    st.configure("TButton", padding=6)
    st.configure("Accent.TButton", font=FONT_B, padding=8)


def run_standalone(FrameClass, title, geometry="1100x680"):
    root = tk.Tk()
    root.title(title)
    root.geometry(geometry)
    setup_style(root)
    f = FrameClass(root)
    f.pack(fill="both", expand=True)
    root.mainloop()


def ensure_path():
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
