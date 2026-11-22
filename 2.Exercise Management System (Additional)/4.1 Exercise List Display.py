# -*- coding: utf-8 -*-
"""4.1 ระบบแสดงรายการท่าบริหาร - ค้นหา/กรอง/เรียงลำดับ/ดูตัวอย่างท่า
และส่งไปดูรายละเอียด แก้ไข หรือฝึก

ปรับปรุง: ค้นหาแบบหน่วงเวลา (ไม่กระตุกขณะพิมพ์) • คลิกหัวตารางเพื่อเรียง •
แถวสลับสี • การ์ดตัวอย่างพร้อมรายละเอียดวิธีทำ • ปุ่มปิดใช้งานเมื่อยังไม่ได้เลือกท่า •
ปรับขนาดหน้าต่างได้ • ปุ่มลัดคีย์บอร์ด (Enter = ดูรายละเอียด, Esc = ล้างคำค้นหา)
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tkinter as tk
from tkinter import ttk
import pose_core as pc

ALL = "ทั้งหมด"
ZEBRA = "#f5f7fb"
MUTED = "#6b7280"
CANVAS = 320

# (คีย์คอลัมน์, หัวตาราง, ความกว้าง, ฟังก์ชันค่าที่ใช้เรียง)
COLUMNS = (
    ("name", "ชื่อท่า", 250, lambda p: p["name"].lower()),
    ("cat", "หมวด", 110, lambda p: p["category"]),
    ("set", "จำนวน", 130, lambda p: (_n(p, "sets") * _n(p, "reps"), _n(p, "reps"))),
    ("hold", "ค้าง", 70, lambda p: _n(p, "hold")),
)


def _n(p, key):
    """อ่านค่าตัวเลขของท่า (กันกรณีข้อมูลเก่าไม่มีฟิลด์)"""
    try:
        return int(p.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


class Frame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=10)
        self._after = None          # id ของ after() สำหรับหน่วงการค้นหา
        self._cur = None            # id ท่าที่กำลังแสดงตัวอย่าง
        self._sort = None           # (คีย์คอลัมน์, เรียงย้อน?)
        self._vis = []              # ท่าที่แสดงอยู่ตอนนี้
        self._style()
        self._build_top()
        self._build_body()
        self._build_footer()

        pc.bus.on("changed", self.refresh)
        self.refresh()

    # ---------- สไตล์เฉพาะหน้านี้ (ไม่กระทบธีมของหน้าอื่น)
    def _style(self):
        st = ttk.Style(self)
        st.configure("Pose.Treeview", rowheight=32, font=pc.FONT, borderwidth=0)
        st.configure("Pose.Treeview.Heading", font=pc.FONT_B, padding=(6, 6))
        st.configure("Muted.TLabel", foreground=MUTED)
        st.configure("Chip.TLabel", foreground="#1f4e8c", background="#e8f0fb",
                     padding=(8, 2), font=pc.FONT)
        st.map("Pose.Treeview", background=[("selected", "#2f6fd6")],
               foreground=[("selected", "white")])

    # ---------- แถบค้นหา/กรอง
    def _build_top(self):
        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="🔍 ค้นหา", font=pc.FONT_B).pack(side="left")
        self.q = tk.StringVar()
        self.entry = ttk.Entry(top, textvariable=self.q, width=28)
        self.entry.pack(side="left", padx=(6, 2))
        self.clear_btn = ttk.Button(top, text="✕", width=3, command=self.clear_search)
        self.clear_btn.pack(side="left")
        ttk.Label(top, text="หมวด", font=pc.FONT_B).pack(side="left", padx=(16, 0))
        self.cat = tk.StringVar(value=ALL)
        self.cb = ttk.Combobox(top, textvariable=self.cat, state="readonly", width=16,
                               values=[ALL] + pc.store.categories())
        self.cb.pack(side="left", padx=6)
        self.count = ttk.Label(top, text="", style="Muted.TLabel")
        self.count.pack(side="right")

        self.q.trace_add("write", lambda *a: self._debounce())
        self.cb.bind("<<ComboboxSelected>>", lambda e: self.refresh())
        self.entry.bind("<Escape>", lambda e: self.clear_search())

    # ---------- ตัวหน้าจอหลัก
    def _build_body(self):
        pw = ttk.PanedWindow(self, orient="horizontal")
        pw.pack(fill="both", expand=True, pady=(10, 4))

        # ซ้าย: ตารางรายการ
        left = ttk.Frame(pw)
        pw.add(left, weight=3)
        self.tree = ttk.Treeview(left, columns=[c[0] for c in COLUMNS], show="headings",
                                 selectmode="browse", style="Pose.Treeview")
        for key, title, width, _ in COLUMNS:
            self.tree.heading(key, text=title, command=lambda k=key: self.sort_by(k))
            self.tree.column(key, width=width, anchor="w", minwidth=50)
        self.tree.tag_configure("odd", background=ZEBRA)
        sb = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.empty = ttk.Label(left, text="ไม่พบท่าที่ตรงกับการค้นหา",
                               style="Muted.TLabel", font=pc.FONT_B)
        self.tree.bind("<<TreeviewSelect>>", lambda e: self.on_select())
        self.tree.bind("<Double-1>", lambda e: self.go_detail())
        self.tree.bind("<Return>", lambda e: self.go_detail())

        # ขวา: การ์ดตัวอย่าง
        right = ttk.Frame(pw, padding=(12, 0, 0, 0))
        pw.add(right, weight=0)
        self.cv = tk.Canvas(right, width=CANVAS, height=CANVAS, bg="white",
                            highlightthickness=1, highlightbackground="#cfd6e0")
        self.cv.pack()
        self.title = ttk.Label(right, text="", font=pc.FONT_B, wraplength=CANVAS,
                               justify="center")
        self.title.pack(pady=(8, 2))
        self.chips = ttk.Frame(right)
        self.chips.pack(pady=(0, 6))

        self.desc = tk.Text(right, width=38, height=6, wrap="word", font=pc.FONT,
                            relief="flat", bg="#fafbfc", padx=8, pady=6,
                            highlightthickness=1, highlightbackground="#e3e8ef",
                            state="disabled", cursor="arrow")
        self.desc.pack(fill="x")

        self.btn_detail = ttk.Button(right, text="ดูรายละเอียด / ทำตามท่า",
                                     command=self.go_detail, style="Accent.TButton")
        self.btn_detail.pack(fill="x", pady=(10, 3))
        row = ttk.Frame(right)
        row.pack(fill="x", pady=3)
        self.btn_edit = ttk.Button(row, text="แก้ไขท่านี้", command=self.go_edit)
        self.btn_edit.pack(side="left", fill="x", expand=True, padx=(0, 3))
        self.btn_one = ttk.Button(row, text="ฝึกท่านี้ (ตั้งเวลา)", command=self.practice_one)
        self.btn_one.pack(side="left", fill="x", expand=True, padx=(3, 0))
        self.btn_all = ttk.Button(right, text="ฝึกทุกท่าที่แสดงอยู่", command=self.practice_all)
        self.btn_all.pack(fill="x", pady=3)

    def _build_footer(self):
        ttk.Label(self, style="Muted.TLabel",
                  text="ดับเบิลคลิก/Enter = ดูรายละเอียด  •  คลิกหัวตาราง = เรียงลำดับ  •  Esc = ล้างคำค้นหา"
                  ).pack(anchor="w")

    # ---------- ข้อมูล
    def visible(self):
        q = self.q.get().strip().lower()
        cat = self.cat.get()
        out = []
        for p in pc.store.poses:
            if cat != ALL and p["category"] != cat:
                continue
            if q and q not in p["name"].lower() and q not in p.get("description", "").lower():
                continue
            out.append(p)
        if self._sort:
            key, rev = self._sort
            fn = next(c[3] for c in COLUMNS if c[0] == key)
            out.sort(key=fn, reverse=rev)
        return out

    def sel_id(self):
        s = self.tree.selection()
        return s[0] if s else None

    # ---------- การค้นหา/เรียง
    def _debounce(self):
        if self._after:
            self.after_cancel(self._after)
        self._after = self.after(180, self.refresh)

    def clear_search(self):
        self.q.set("")
        self.entry.focus_set()

    def sort_by(self, key):
        if self._sort and self._sort[0] == key:
            self._sort = (key, not self._sort[1])
        else:
            self._sort = (key, False)
        self.refresh()

    def _update_headings(self):
        for key, title, _, _ in COLUMNS:
            mark = ""
            if self._sort and self._sort[0] == key:
                mark = "  ▼" if self._sort[1] else "  ▲"
            self.tree.heading(key, text=title + mark)

    # ---------- รีเฟรชรายการ
    def refresh(self):
        self._after = None
        keep = self.sel_id() or self._cur
        cats = [ALL] + pc.store.categories()
        self.cb.configure(values=cats)
        if self.cat.get() not in cats:      # หมวดที่เลือกไว้ถูกลบไปแล้ว
            self.cat.set(ALL)

        self._vis = self.visible()
        self.tree.delete(*self.tree.get_children())
        for i, p in enumerate(self._vis):
            hold = _n(p, "hold")
            self.tree.insert("", "end", iid=p["id"], tags=("odd",) if i % 2 else (), values=(
                p["name"], p["category"],
                f'{_n(p, "reps")} ครั้ง × {_n(p, "sets")} เซ็ต',
                f"{hold} วิ" if hold else "-"))
        self._update_headings()
        self.count.configure(text=f"แสดง {len(self._vis)} จาก {len(pc.store.poses)} ท่า")

        if self._vis:
            self.empty.place_forget()
            ids = [p["id"] for p in self._vis]
            pid = keep if keep in ids else ids[0]
            self.tree.selection_set(pid)
            self.tree.see(pid)
            self.show(pid)
        else:
            self.empty.place(relx=0.5, rely=0.4, anchor="center")
            self.show(None)

        state = "normal" if self._vis else "disabled"
        self.btn_all.configure(
            state=state,
            text=f"ฝึกทุกท่าที่แสดงอยู่ ({len(self._vis)} ท่า)" if self._vis
            else "ฝึกทุกท่าที่แสดงอยู่")

    # ---------- การ์ดตัวอย่าง
    def show(self, pid):
        p = pc.store.get(pid) if pid else None
        self._cur = pid if p else None
        self.cv.delete("all")
        for w in self.chips.winfo_children():
            w.destroy()
        self.desc.configure(state="normal")
        self.desc.delete("1.0", "end")

        if p:
            pc.draw_pose(self.cv, p["joints"])
            self.title.configure(text=p["name"])
            hold = _n(p, "hold")
            for t in (p["category"], f'{_n(p, "reps")} ครั้ง × {_n(p, "sets")} เซ็ต',
                      f"ค้าง {hold} วิ" if hold else None):
                if t:
                    ttk.Label(self.chips, text=t, style="Chip.TLabel").pack(side="left", padx=2)
            steps = [s.strip() for s in p.get("description", "").splitlines() if s.strip()]
            self.desc.insert("1.0", "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
                             or "ยังไม่มีคำอธิบายวิธีทำ")
        else:
            self.title.configure(text="")
            self.desc.insert("1.0", "เลือกท่าจากรายการเพื่อดูตัวอย่าง")
        self.desc.configure(state="disabled")

        st = "normal" if p else "disabled"
        for b in (self.btn_detail, self.btn_edit, self.btn_one):
            b.configure(state=st)

    def on_select(self):
        pid = self.sel_id()
        if not pid:
            return
        changed = pid != self._cur
        self.show(pid)
        if changed:                      # ส่งอีเวนต์เฉพาะตอนเปลี่ยนท่าจริง
            pc.bus.emit("select", pid)

    # ---------- ส่งต่อไปหน้าอื่น
    def go_detail(self):
        pid = self.sel_id()
        if pid:
            pc.bus.emit("select", pid)
            pc.bus.emit("goto", "detail")

    def go_edit(self):
        pid = self.sel_id()
        if pid:
            pc.bus.emit("edit_pose", pid)
            pc.bus.emit("goto", "edit")

    def practice_one(self):
        pid = self.sel_id()
        if pid:
            pc.bus.emit("start_routine", [pid])
            pc.bus.emit("goto", "settings")

    def practice_all(self):
        ids = [p["id"] for p in self._vis]
        if ids:
            pc.bus.emit("start_routine", ids)
            pc.bus.emit("goto", "settings")


if __name__ == "__main__":
    pc.run_standalone(Frame, "4.1 ระบบแสดงรายการท่าบริหาร")