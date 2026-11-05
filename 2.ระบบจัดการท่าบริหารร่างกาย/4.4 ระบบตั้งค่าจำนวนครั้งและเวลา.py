# -*- coding: utf-8 -*-
"""4.4 ระบบตั้งค่าจำนวนครั้งและเวลา - ตั้งจำนวนครั้ง/เซ็ต/เวลาค้าง/เวลาพัก ต่อท่า
และเล่นชุดท่าตามคิวพร้อมนับถอยหลัง (มีเสียงบี๊บบน Windows)"""
import math
import os
import sys
import time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tkinter as tk
from tkinter import ttk, messagebox
import pose_core as pc

MOVE = 1.0  # วินาทีที่ใช้เข้าท่า/กลับท่า


class Frame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=8)
        self.queue = []
        self.timeline = []
        self.running = False
        self.paused = False
        self.seg_i = 0
        self.seg_t = 0.0
        self.last = 0.0
        self.neutral = pc.neutral()

        left = ttk.Frame(self)
        left.pack(side="left", fill="y")
        ttk.Label(left, text="ตั้งค่าต่อท่า", font=pc.FONT_B).pack(anchor="w")
        self.tree = ttk.Treeview(left, columns=("name", "set"), show="headings",
                                 selectmode="browse", height=9)
        self.tree.heading("name", text="ชื่อท่า")
        self.tree.heading("set", text="ครั้ง×เซ็ต / ค้าง")
        self.tree.column("name", width=190)
        self.tree.column("set", width=130)
        self.tree.pack(fill="x")
        self.tree.bind("<<TreeviewSelect>>", lambda e: self.load_settings())

        form = ttk.Frame(left)
        form.pack(fill="x", pady=8)
        self.vars = {}
        for r, (key, label, lo, hi) in enumerate((
                ("reps", "จำนวนครั้ง / เซ็ต", 1, 200), ("sets", "จำนวนเซ็ต", 1, 30),
                ("hold", "ค้างท่า (วินาที)", 1, 300), ("rest", "พักระหว่างเซ็ต (วินาที)", 0, 300))):
            ttk.Label(form, text=label).grid(row=r, column=0, sticky="w", pady=2)
            v = tk.IntVar(value=1)
            ttk.Spinbox(form, from_=lo, to=hi, textvariable=v, width=7).grid(
                row=r, column=1, padx=8)
            self.vars[key] = (v, lo, hi)
        ttk.Button(form, text="บันทึกการตั้งค่าท่านี้", command=self.save_settings).grid(
            row=4, column=0, columnspan=2, sticky="we", pady=6)
        self.est = ttk.Label(form, text="", foreground="#555")
        self.est.grid(row=5, column=0, columnspan=2, sticky="w")

        ttk.Label(left, text="คิวฝึก", font=pc.FONT_B).pack(anchor="w", pady=(6, 0))
        self.lb = tk.Listbox(left, height=6, font=pc.FONT, exportselection=False)
        self.lb.pack(fill="x")
        qb = ttk.Frame(left)
        qb.pack(fill="x", pady=4)
        for t, c in (("เพิ่มท่าที่เลือก", self.q_add), ("เอาออก", self.q_remove),
                     ("ใช้ทุกท่า", self.q_all), ("ล้าง", self.q_clear)):
            ttk.Button(qb, text=t, command=c).pack(side="left", padx=2)

        right = ttk.Frame(self)
        right.pack(side="left", fill="both", expand=True, padx=14)
        self.cv = tk.Canvas(right, width=440, height=440, bg="white",
                            highlightthickness=1, highlightbackground="#bbb")
        self.cv.pack()
        self.lbl_name = ttk.Label(right, text="พร้อมเริ่ม", font=pc.FONT_MID)
        self.lbl_name.pack(pady=(8, 0))
        self.lbl_cnt = ttk.Label(right, text="", font=pc.FONT_BIG, foreground="#1f6feb")
        self.lbl_cnt.pack()
        self.lbl_info = ttk.Label(right, text="", font=pc.FONT)
        self.lbl_info.pack()
        self.prog = ttk.Progressbar(right, length=440, mode="determinate")
        self.prog.pack(pady=6)
        bar = ttk.Frame(right)
        bar.pack()
        self.b_start = ttk.Button(bar, text="▶ เริ่ม", style="Accent.TButton", command=self.start)
        self.b_start.pack(side="left", padx=4)
        self.b_pause = ttk.Button(bar, text="⏸ หยุดชั่วคราว", command=self.pause)
        self.b_pause.pack(side="left", padx=4)
        ttk.Button(bar, text="■ หยุด", command=self.stop).pack(side="left", padx=4)

        pc.bus.on("changed", self.refresh)
        pc.bus.on("start_routine", self.set_queue)
        self.refresh()
        self.draw_idle()

    # ---------- ตั้งค่า
    def sel_id(self):
        s = self.tree.selection()
        return s[0] if s else None

    def refresh(self):
        keep = self.sel_id()
        self.tree.delete(*self.tree.get_children())
        for p in pc.store.poses:
            self.tree.insert("", "end", iid=p["id"], values=(
                p["name"], f'{p["reps"]}×{p["sets"]} / {p["hold"]}วิ'))
        if keep and self.tree.exists(keep):
            self.tree.selection_set(keep)
        elif pc.store.poses:
            self.tree.selection_set(pc.store.poses[0]["id"])
        self.queue = [i for i in self.queue if pc.store.get(i)]
        self.show_queue()

    def load_settings(self):
        p = pc.store.get(self.sel_id()) if self.sel_id() else None
        if p:
            for k, (v, lo, hi) in self.vars.items():
                v.set(p[k])
            self.update_est(p)

    def update_est(self, p):
        tot = self.estimate([p["id"]])
        self.est.configure(text=f"ใช้เวลาประมาณ {self.fmt(tot)} ต่อท่านี้")

    @staticmethod
    def fmt(sec):
        sec = int(round(sec))
        return f"{sec // 60} นาที {sec % 60} วินาที" if sec >= 60 else f"{sec} วินาที"

    def save_settings(self):
        pid = self.sel_id()
        if not pid:
            return
        vals = {}
        for k, (v, lo, hi) in self.vars.items():
            try:
                x = int(v.get())
            except (tk.TclError, ValueError):
                messagebox.showwarning("ค่าไม่ถูกต้อง", "กรุณากรอกตัวเลขจำนวนเต็ม")
                return
            vals[k] = max(lo, min(hi, x))
            v.set(vals[k])
        pc.store.update_settings(pid, vals["reps"], vals["hold"], vals["sets"], vals["rest"])

    # ---------- คิว
    def show_queue(self):
        self.lb.delete(0, "end")
        for i, pid in enumerate(self.queue, 1):
            self.lb.insert("end", f'{i}. {pc.store.get(pid)["name"]}')

    def set_queue(self, ids):
        self.stop()
        self.queue = [i for i in ids if pc.store.get(i)]
        self.show_queue()
        self.lbl_name.configure(text=f"คิวฝึก {len(self.queue)} ท่า • กด ▶ เริ่ม")
        self.lbl_info.configure(text=f"รวมประมาณ {self.fmt(self.estimate(self.queue))}")

    def q_add(self):
        if self.sel_id():
            self.queue.append(self.sel_id())
            self.show_queue()

    def q_remove(self):
        s = self.lb.curselection()
        if s:
            del self.queue[s[0]]
            self.show_queue()

    def q_all(self):
        self.set_queue([p["id"] for p in pc.store.poses])

    def q_clear(self):
        self.queue = []
        self.show_queue()

    # ---------- ไทม์ไลน์
    def build(self, ids):
        tl = []
        for n, pid in enumerate(ids):
            p = pc.store.get(pid)
            if not p:
                continue
            S, R = p["sets"], p["reps"]
            for s in range(1, S + 1):
                for r in range(1, R + 1):
                    base = dict(pid=pid, s=s, r=r, S=S, R=R)
                    tl.append(dict(base, kind="in", dur=MOVE))
                    tl.append(dict(base, kind="hold", dur=float(p["hold"])))
                    tl.append(dict(base, kind="out", dur=MOVE))
                last = (n == len(ids) - 1 and s == S)
                if p["rest"] > 0 and not last:
                    tl.append(dict(pid=pid, s=s, r=R, S=S, R=R, kind="rest",
                                   dur=float(p["rest"])))
        return tl

    def estimate(self, ids):
        return sum(seg["dur"] for seg in self.build(ids))

    # ---------- เล่น
    def start(self):
        ids = self.queue or ([self.sel_id()] if self.sel_id() else [])
        self.timeline = self.build(ids)
        if not self.timeline:
            messagebox.showinfo("ยังไม่มีท่า", "เลือกท่าหรือเพิ่มท่าเข้าคิวก่อน")
            return
        self.total = sum(s["dur"] for s in self.timeline)
        self.seg_i, self.seg_t = 0, 0.0
        self.running, self.paused = True, False
        self.last = time.monotonic()
        self.b_pause.configure(text="⏸ หยุดชั่วคราว")
        pc.beep()
        self.tick()

    def pause(self):
        if not self.running:
            return
        self.paused = not self.paused
        self.last = time.monotonic()
        self.b_pause.configure(text="▶ เล่นต่อ" if self.paused else "⏸ หยุดชั่วคราว")

    def stop(self):
        self.running = False
        self.paused = False
        self.prog["value"] = 0
        self.lbl_cnt.configure(text="")
        self.draw_idle()

    def draw_idle(self):
        self.cv.delete("all")
        p = pc.store.get(self.sel_id()) if self.sel_id() else None
        pc.draw_pose(self.cv, p["joints"] if p else self.neutral, color="#9aa4b2")

    def tick(self):
        if not self.running:
            return
        now = time.monotonic()
        if not self.paused:
            self.seg_t += now - self.last
        self.last = now
        while self.seg_i < len(self.timeline) and self.seg_t >= self.timeline[self.seg_i]["dur"]:
            self.seg_t -= self.timeline[self.seg_i]["dur"]
            self.seg_i += 1
            if self.seg_i < len(self.timeline) and self.timeline[self.seg_i]["kind"] in ("in", "rest"):
                pc.beep()
        if self.seg_i >= len(self.timeline):
            self.running = False
            self.cv.delete("all")
            pc.draw_pose(self.cv, self.neutral)
            self.lbl_name.configure(text="เสร็จสิ้น เก่งมาก! 🎉")
            self.lbl_cnt.configure(text="")
            self.lbl_info.configure(text="")
            self.prog["value"] = 100
            pc.beep()
            return
        seg = self.timeline[self.seg_i]
        p = pc.store.get(seg["pid"])
        tgt = p["joints"]
        k = seg["kind"]
        t = self.seg_t / seg["dur"]
        if k == "in":
            cur, txt = pc.lerp_pose(self.neutral, tgt, pc.ease(t)), "เข้าท่า"
        elif k == "hold":
            cur, txt = tgt, "ค้างไว้"
        elif k == "out":
            cur, txt = pc.lerp_pose(tgt, self.neutral, pc.ease(t)), "กลับท่าเดิม"
        else:
            cur, txt = self.neutral, "พัก"
        self.cv.delete("all")
        if k != "rest":
            pc.draw_pose(self.cv, tgt, color="#cfd4da", width_ratio=0.05)
        pc.draw_pose(self.cv, cur, color="#1f6feb" if k != "rest" else "#9aa4b2")
        remain = math.ceil(seg["dur"] - self.seg_t)
        self.lbl_name.configure(text=p["name"] if k != "rest" else "พักสักครู่…")
        self.lbl_cnt.configure(text=f"{txt}  {remain}" if k in ("hold", "rest") else txt)
        self.lbl_info.configure(text=f'เซ็ต {seg["s"]}/{seg["S"]}   ครั้งที่ {seg["r"]}/{seg["R"]}')
        done = sum(s["dur"] for s in self.timeline[:self.seg_i]) + self.seg_t
        self.prog["value"] = 100 * done / self.total
        self.after(40, self.tick)


if __name__ == "__main__":
    pc.run_standalone(Frame, "4.4 ระบบตั้งค่าจำนวนครั้งและเวลา", "1050x640")
