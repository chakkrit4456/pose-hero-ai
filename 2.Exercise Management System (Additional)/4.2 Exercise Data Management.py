# -*- coding: utf-8 -*-
"""4.2 ระบบจัดการข้อมูลท่าบริหาร - สร้าง/แก้ไขท่าด้วยโครงกระดูก
ลากข้อต่อเพื่อกำหนดท่า (ข้อต่อหมุนรอบจุดแม่ ความยาวกระดูกคงที่) แล้วเลือก
  - บันทึกเป็นท่าใหม่ (เพิ่มเข้าไป)   หรือ   - บันทึกทับท่าที่เลือก
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tkinter as tk
from tkinter import ttk, messagebox
import pose_core as pc


class Frame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=8)
        self.cur_id = None
        self.joints = pc.neutral()
        self.drag = None
        self.active = None

        # ซ้าย: รายการท่า
        left = ttk.Frame(self)
        left.pack(side="left", fill="y")
        ttk.Label(left, text="ท่าทั้งหมด", font=pc.FONT_B).pack(anchor="w")
        self.tree = ttk.Treeview(left, columns=("name", "cat"), show="headings",
                                 selectmode="browse", height=20)
        self.tree.heading("name", text="ชื่อท่า")
        self.tree.heading("cat", text="หมวด")
        self.tree.column("name", width=190)
        self.tree.column("cat", width=95)
        self.tree.pack(fill="y", expand=True)
        self.tree.bind("<<TreeviewSelect>>", lambda e: self.on_pick())

        # กลาง: แคนวาสแก้ไข
        mid = ttk.Frame(self)
        mid.pack(side="left", padx=10)
        self.cv = tk.Canvas(mid, width=460, height=460, bg="white",
                            highlightthickness=1, highlightbackground="#bbb")
        self.cv.pack()
        self.cv.bind("<Button-1>", self.on_press)
        self.cv.bind("<B1-Motion>", self.on_move)
        self.cv.bind("<ButtonRelease-1>", self.on_release)
        self.info = ttk.Label(mid, text="ลากจุดเพื่อหมุนข้อต่อ • จุดแดง(สะโพก) = เลื่อนทั้งตัว",
                              foreground="#555")
        self.info.pack(pady=4)
        self.snap = tk.BooleanVar(value=True)
        ttk.Checkbutton(mid, text="ล็อกมุมทีละ 5° (ทำซ้ำให้ตรงเป๊ะ)",
                        variable=self.snap).pack()
        ttk.Label(mid, text="ภาพแบบส่องกระจก: ซ้ายของจอ = ซ้ายของผู้ทำท่า",
                  foreground="#888").pack(pady=2)

        # ขวา: ฟอร์ม
        right = ttk.Frame(self)
        right.pack(side="left", fill="y")
        ttk.Label(right, text="ชื่อท่า", font=pc.FONT_B).pack(anchor="w")
        self.name = tk.StringVar()
        ttk.Entry(right, textvariable=self.name, width=34).pack(anchor="w", pady=(0, 6))
        ttk.Label(right, text="หมวด", font=pc.FONT_B).pack(anchor="w")
        self.cat = tk.StringVar(value=pc.CATEGORIES[-1])
        self.cb = ttk.Combobox(right, textvariable=self.cat, width=32,
                               values=pc.store.categories())
        self.cb.pack(anchor="w", pady=(0, 6))
        ttk.Label(right, text="วิธีทำ (หนึ่งบรรทัด = หนึ่งขั้นตอน)",
                  font=pc.FONT_B).pack(anchor="w")
        self.desc = tk.Text(right, width=34, height=9, wrap="word", font=pc.FONT)
        self.desc.pack(anchor="w", pady=(0, 8))

        self.status = ttk.Label(right, text="", foreground="#0a7d2c", wraplength=270)
        self.status.pack(anchor="w", pady=(0, 6))

        for text, cmd, st in (
                ("＋ ท่าใหม่ (เริ่มจากท่ายืนตรง)", self.new_pose, None),
                ("คัดลอกท่านี้เป็นฉบับร่าง", self.dup_pose, None),
                ("สลับซ้าย ↔ ขวา", self.mirror, None),
                ("รีเซ็ตเป็นท่ายืนตรง", self.reset_pose, None),
                ("บันทึกเป็นท่าใหม่ (เพิ่มเข้าไป)", self.save_new, "Accent.TButton"),
                ("บันทึกทับท่าที่เลือก", self.save_over, "Accent.TButton"),
                ("ลบท่าที่เลือก", self.delete, None)):
            b = ttk.Button(right, text=text, command=cmd, width=34)
            if st:
                b.configure(style=st)
            b.pack(pady=2, anchor="w")

        pc.bus.on("changed", self.refresh)
        pc.bus.on("edit_pose", self.load_id)
        self.refresh()
        self.redraw()

    # ---------- รายการ
    def refresh(self):
        self.tree.delete(*self.tree.get_children())
        for p in pc.store.poses:
            self.tree.insert("", "end", iid=p["id"], values=(p["name"], p["category"]))
        self.cb.configure(values=pc.store.categories())
        if self.cur_id and self.tree.exists(self.cur_id):
            self.tree.selection_set(self.cur_id)
        elif self.cur_id:
            self.cur_id = None

    def on_pick(self):
        s = self.tree.selection()
        if s and s[0] != self.cur_id:
            self.load_id(s[0])

    def load_id(self, pid):
        p = pc.store.get(pid)
        if not p:
            return
        self.cur_id = pid
        self.joints = {k: list(v) for k, v in p["joints"].items()}
        self.name.set(p["name"])
        self.cat.set(p["category"])
        self.desc.delete("1.0", "end")
        self.desc.insert("1.0", p["description"])
        if self.tree.exists(pid):
            self.tree.selection_set(pid)
        self.status.configure(text=f'กำลังแก้ไข: {p["name"]}')
        self.redraw()

    # ---------- วาด / ลาก
    def redraw(self):
        self.cv.delete("all")
        pc.draw_pose(self.cv, self.joints, handles=True, active=self.active)

    def nearest(self, x, y):
        w, h = pc.canvas_size(self.cv)
        best, bd = None, 18
        for k in pc.JOINTS:
            px, py = pc.to_px(self.joints[k], w, h)
            d = math.hypot(px - x, py - y)
            if d < bd:
                best, bd = k, d
        return best

    def on_press(self, e):
        self.drag = self.nearest(e.x, e.y)
        self.active = self.drag
        self.redraw()

    def on_release(self, e):
        self.drag = None
        self.active = None
        self.redraw()

    def on_move(self, e):
        j = self.drag
        if not j:
            return
        w, h = pc.canvas_size(self.cv)
        m = pc.from_px(e.x, e.y, w, h)
        J = self.joints
        if j == "hip":
            dx, dy = m[0] - J["hip"][0], m[1] - J["hip"][1]
            new = {k: [v[0] + dx, v[1] + dy] for k, v in J.items()}
            msg = "เลื่อนทั้งตัว"
        else:
            par = J[pc.PARENT[j]]
            ang = math.atan2(m[0] - par[0], m[1] - par[1])
            if self.snap.get():
                ang = math.radians(round(math.degrees(ang) / 5.0) * 5.0)
            old = math.atan2(J[j][0] - par[0], J[j][1] - par[1])
            phi = -(ang - old)
            c, s = math.cos(phi), math.sin(phi)
            new = dict(J)
            for k in pc.subtree(j):
                vx, vy = J[k][0] - par[0], J[k][1] - par[1]
                new[k] = [par[0] + vx * c - vy * s, par[1] + vx * s + vy * c]
            deg = math.degrees(ang)
            msg = f"{pc.JOINT_TH[j]}: {deg:.0f}°  (0°=ชี้ลง, 90°=ขวาจอ, 180°=ชี้ขึ้น)"
        if all(0.01 <= v[0] <= 0.99 and 0.01 <= v[1] <= 0.99 for v in new.values()):
            self.joints = new
            self.info.configure(text=msg)
            self.redraw()

    # ---------- คำสั่ง
    def _form(self):
        name = self.name.get().strip()
        if not name:
            messagebox.showwarning("ยังไม่มีชื่อท่า", "กรุณาตั้งชื่อท่าก่อนบันทึก")
            return None
        return (name, self.cat.get().strip() or pc.CATEGORIES[-1],
                self.desc.get("1.0", "end").strip(), self.joints)

    def new_pose(self):
        self.cur_id = None
        self.tree.selection_remove(*self.tree.selection())
        self.joints = pc.neutral()
        self.name.set("")
        self.desc.delete("1.0", "end")
        self.status.configure(text="ท่าใหม่ (ยังไม่ได้บันทึก)")
        self.redraw()

    def dup_pose(self):
        old = self.name.get().strip()
        self.cur_id = None
        self.tree.selection_remove(*self.tree.selection())
        self.name.set((old + " (สำเนา)") if old else "")
        self.status.configure(text="ฉบับร่างจากสำเนา (ยังไม่ได้บันทึก)")

    def mirror(self):
        self.joints = pc.mirror_joints(self.joints)
        self.redraw()

    def reset_pose(self):
        self.joints = pc.neutral()
        self.redraw()

    def save_new(self):
        f = self._form()
        if not f:
            return
        dup = pc.store.find_by_name(f[0])
        if dup:
            r = messagebox.askyesnocancel(
                "ชื่อท่าซ้ำ",
                f'มีท่า "{dup["name"]}" อยู่แล้ว\n\nใช่ = บันทึกทับท่าเดิม\nไม่ = เพิ่มเป็นท่าใหม่อีกท่า\nยกเลิก = ไม่บันทึก')
            if r is None:
                return
            if r:
                p = pc.store.overwrite(dup["id"], *f)
                self.cur_id = p["id"]
                self.status.configure(text=f'บันทึกทับ "{p["name"]}" แล้ว')
                return
        p = pc.store.add(*f)
        self.cur_id = p["id"]
        self.tree.selection_set(p["id"])
        self.status.configure(text=f'เพิ่มท่าใหม่ "{p["name"]}" แล้ว')

    def save_over(self):
        if not self.cur_id or not pc.store.get(self.cur_id):
            messagebox.showinfo("ยังไม่ได้เลือกท่า",
                                "เลือกท่าจากรายการด้านซ้ายก่อน หรือใช้ \"บันทึกเป็นท่าใหม่\"")
            return
        f = self._form()
        if not f:
            return
        old = pc.store.get(self.cur_id)["name"]
        if messagebox.askyesno("ยืนยันบันทึกทับ", f'บันทึกทับท่า "{old}" ด้วยท่าที่กำลังแก้ไข?\n(ระบบสำรองไฟล์เดิมไว้ใน data/poses.bak.json)'):
            p = pc.store.overwrite(self.cur_id, *f)
            self.status.configure(text=f'บันทึกทับ "{p["name"]}" แล้ว')

    def delete(self):
        p = pc.store.get(self.cur_id) if self.cur_id else None
        if not p:
            return
        if messagebox.askyesno("ยืนยันการลบ", f'ลบท่า "{p["name"]}" ?'):
            pc.store.delete(p["id"])
            self.new_pose()
            self.status.configure(text="ลบท่าแล้ว")


if __name__ == "__main__":
    pc.run_standalone(Frame, "4.2 ระบบจัดการข้อมูลท่าบริหาร", "1150x640")
