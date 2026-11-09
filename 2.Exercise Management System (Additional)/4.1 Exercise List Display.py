# -*- coding: utf-8 -*-
"""4.1 ระบบแสดงรายการท่าบริหาร - ค้นหา/กรอง/ดูตัวอย่างท่า และส่งไปดูรายละเอียด แก้ไข หรือฝึก"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tkinter as tk
from tkinter import ttk
import pose_core as pc


class Frame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=8)
        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="ค้นหา").pack(side="left")
        self.q = tk.StringVar()
        ttk.Entry(top, textvariable=self.q, width=26).pack(side="left", padx=6)
        ttk.Label(top, text="หมวด").pack(side="left", padx=(12, 0))
        self.cat = tk.StringVar(value="ทั้งหมด")
        self.cb = ttk.Combobox(top, textvariable=self.cat, state="readonly", width=16,
                               values=["ทั้งหมด"] + pc.store.categories())
        self.cb.pack(side="left", padx=6)
        self.q.trace_add("write", lambda *a: self.refresh())
        self.cb.bind("<<ComboboxSelected>>", lambda e: self.refresh())

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, pady=8)
        left = ttk.Frame(body)
        left.pack(side="left", fill="both", expand=True)
        cols = ("name", "cat", "set", "hold")
        self.tree = ttk.Treeview(left, columns=cols, show="headings", selectmode="browse")
        for c, t, w in (("name", "ชื่อท่า", 260), ("cat", "หมวด", 120),
                        ("set", "จำนวน", 130), ("hold", "ค้าง", 70)):
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor="w")
        sb = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.tree.bind("<<TreeviewSelect>>", lambda e: self.on_select())
        self.tree.bind("<Double-1>", lambda e: self.go_detail())

        right = ttk.Frame(body)
        right.pack(side="left", padx=(12, 0))
        self.cv = tk.Canvas(right, width=300, height=300, bg="white",
                            highlightthickness=1, highlightbackground="#bbb")
        self.cv.pack()
        self.title = ttk.Label(right, text="", font=pc.FONT_B, wraplength=300)
        self.title.pack(pady=6)
        for text, cmd in (("ดูรายละเอียด / ทำตามท่า", self.go_detail),
                          ("แก้ไขท่านี้", self.go_edit),
                          ("ฝึกท่านี้ (ตั้งเวลา)", self.practice_one),
                          ("ฝึกทุกท่าที่แสดงอยู่", self.practice_all)):
            ttk.Button(right, text=text, command=cmd, width=28).pack(pady=3)

        self.count = ttk.Label(self, text="")
        self.count.pack(anchor="w")
        pc.bus.on("changed", self.refresh)
        self.refresh()

    def visible(self):
        q = self.q.get().strip().lower()
        cat = self.cat.get()
        out = []
        for p in pc.store.poses:
            if cat != "ทั้งหมด" and p["category"] != cat:
                continue
            if q and q not in p["name"].lower() and q not in p["description"].lower():
                continue
            out.append(p)
        return out

    def sel_id(self):
        s = self.tree.selection()
        return s[0] if s else None

    def refresh(self):
        keep = self.sel_id()
        self.cb.configure(values=["ทั้งหมด"] + pc.store.categories())
        self.tree.delete(*self.tree.get_children())
        vis = self.visible()
        for p in vis:
            self.tree.insert("", "end", iid=p["id"], values=(
                p["name"], p["category"], f'{p["reps"]} ครั้ง × {p["sets"]} เซ็ต',
                f'{p["hold"]} วิ'))
        self.count.configure(text=f"แสดง {len(vis)} จาก {len(pc.store.poses)} ท่า")
        if keep and self.tree.exists(keep):
            self.tree.selection_set(keep)
        elif vis:
            self.tree.selection_set(vis[0]["id"])
        else:
            self.cv.delete("all")
            self.title.configure(text="")

    def on_select(self):
        pid = self.sel_id()
        p = pc.store.get(pid) if pid else None
        self.cv.delete("all")
        if p:
            pc.draw_pose(self.cv, p["joints"])
            self.title.configure(text=p["name"])
            pc.bus.emit("select", pid)

    def go_detail(self):
        if self.sel_id():
            pc.bus.emit("select", self.sel_id())
            pc.bus.emit("goto", "detail")

    def go_edit(self):
        if self.sel_id():
            pc.bus.emit("edit_pose", self.sel_id())
            pc.bus.emit("goto", "edit")

    def practice_one(self):
        if self.sel_id():
            pc.bus.emit("start_routine", [self.sel_id()])
            pc.bus.emit("goto", "settings")

    def practice_all(self):
        ids = [p["id"] for p in self.visible()]
        if ids:
            pc.bus.emit("start_routine", ids)
            pc.bus.emit("goto", "settings")


if __name__ == "__main__":
    pc.run_standalone(Frame, "4.1 ระบบแสดงรายการท่าบริหาร")
