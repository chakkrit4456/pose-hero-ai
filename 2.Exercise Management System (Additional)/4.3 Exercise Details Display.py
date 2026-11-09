# -*- coding: utf-8 -*-
"""4.3 ระบบแสดงรายละเอียดท่าบริหาร - แอนิเมชันเข้าท่า-ค้าง-กลับ พร้อมเงาท่าเป้าหมาย
(เส้นเทา = ท่าที่ต้องไปให้ถึง, เส้นน้ำเงิน = ตัวนำ) เพื่อให้ทำตามได้ตรง"""
import os
import sys
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tkinter as tk
from tkinter import ttk
import pose_core as pc

T_IN, T_HOLD, T_OUT, T_GAP = 1.2, 1.8, 1.2, 0.6


class Frame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=8)
        self.pid = None
        self.playing = True
        self.t0 = time.monotonic()
        self.neutral = pc.neutral()

        self.cv = tk.Canvas(self, width=520, height=520, bg="white",
                            highlightthickness=1, highlightbackground="#bbb")
        self.cv.pack(side="left")

        right = ttk.Frame(self)
        right.pack(side="left", fill="both", expand=True, padx=14)
        self.title = ttk.Label(right, text="(ยังไม่ได้เลือกท่า)", font=pc.FONT_MID,
                               wraplength=420)
        self.title.pack(anchor="w")
        self.meta = ttk.Label(right, text="", foreground="#555")
        self.meta.pack(anchor="w", pady=(2, 8))
        ttk.Label(right, text="วิธีทำ", font=pc.FONT_B).pack(anchor="w")
        self.steps = tk.Text(right, width=44, height=12, wrap="word", font=pc.FONT,
                             state="disabled", bg="#f7f7f7", relief="flat")
        self.steps.pack(anchor="w", fill="x", pady=4)

        bar = ttk.Frame(right)
        bar.pack(anchor="w", pady=6)
        self.btn = ttk.Button(bar, text="⏸ หยุดแอนิเมชัน", command=self.toggle)
        self.btn.pack(side="left", padx=(0, 6))
        ttk.Button(bar, text="◀ ท่าก่อนหน้า", command=lambda: self.step(-1)).pack(side="left", padx=3)
        ttk.Button(bar, text="ท่าถัดไป ▶", command=lambda: self.step(1)).pack(side="left", padx=3)
        bar2 = ttk.Frame(right)
        bar2.pack(anchor="w", pady=4)
        ttk.Button(bar2, text="แก้ไขท่านี้", command=self.edit).pack(side="left", padx=(0, 6))
        ttk.Button(bar2, text="ฝึกท่านี้ (ตั้งเวลา)", command=self.practice).pack(side="left")
        self.phase = ttk.Label(right, text="", font=pc.FONT_B, foreground="#1f6feb")
        self.phase.pack(anchor="w", pady=10)

        pc.bus.on("select", self.show)
        pc.bus.on("changed", self.on_changed)
        if pc.store.poses:
            self.show(pc.store.poses[0]["id"])
        self.after(40, self.tick)

    def show(self, pid):
        p = pc.store.get(pid)
        if not p:
            return
        self.pid = pid
        self.title.configure(text=p["name"])
        self.meta.configure(text=f'หมวด: {p["category"]}   •   {p["reps"]} ครั้ง × {p["sets"]} เซ็ต   •   '
                                 f'ค้าง {p["hold"]} วินาที   •   พัก {p["rest"]} วินาที')
        self.steps.configure(state="normal")
        self.steps.delete("1.0", "end")
        lines = [l.strip() for l in p["description"].splitlines() if l.strip()]
        self.steps.insert("1.0", "\n".join(f"{i}. {l}" for i, l in enumerate(lines, 1))
                          or "(ยังไม่มีคำอธิบาย)")
        self.steps.configure(state="disabled")
        self.t0 = time.monotonic()

    def on_changed(self):
        if self.pid and pc.store.get(self.pid):
            self.show(self.pid)
        elif pc.store.poses:
            self.show(pc.store.poses[0]["id"])
        else:
            self.pid = None
            self.title.configure(text="(ยังไม่มีท่า)")

    def toggle(self):
        self.playing = not self.playing
        self.btn.configure(text="⏸ หยุดแอนิเมชัน" if self.playing else "▶ เล่นแอนิเมชัน")
        self.t0 = time.monotonic()

    def step(self, d):
        ids = [p["id"] for p in pc.store.poses]
        if not ids:
            return
        i = (ids.index(self.pid) + d) % len(ids) if self.pid in ids else 0
        self.show(ids[i])

    def edit(self):
        if self.pid:
            pc.bus.emit("edit_pose", self.pid)
            pc.bus.emit("goto", "edit")

    def practice(self):
        if self.pid:
            pc.bus.emit("start_routine", [self.pid])
            pc.bus.emit("goto", "settings")

    def tick(self):
        p = pc.store.get(self.pid) if self.pid else None
        self.cv.delete("all")
        if p:
            target = p["joints"]
            pc.draw_pose(self.cv, target, color="#cfd4da", width_ratio=0.05, tag="ghost")
            if self.playing:
                t = (time.monotonic() - self.t0) % (T_IN + T_HOLD + T_OUT + T_GAP)
                if t < T_IN:
                    cur, txt = pc.lerp_pose(self.neutral, target, pc.ease(t / T_IN)), "กำลังเข้าท่า…"
                elif t < T_IN + T_HOLD:
                    cur, txt = target, "ค้างไว้ในท่านี้"
                elif t < T_IN + T_HOLD + T_OUT:
                    k = (t - T_IN - T_HOLD) / T_OUT
                    cur, txt = pc.lerp_pose(target, self.neutral, pc.ease(k)), "กลับท่าเริ่มต้น"
                else:
                    cur, txt = self.neutral, "ท่ายืนตรง"
                self.phase.configure(text=txt)
            else:
                cur = target
                self.phase.configure(text="แสดงท่าเป้าหมาย")
            pc.draw_pose(self.cv, cur, color="#1f6feb")
        self.after(40, self.tick)


if __name__ == "__main__":
    pc.run_standalone(Frame, "4.3 ระบบแสดงรายละเอียดท่าบริหาร", "1100x600")
