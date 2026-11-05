# -*- coding: utf-8 -*-
"""MOVE & RELIEVE ขยับกาย ทลายเมื่อย - 2.ระบบจัดการท่าบริหารร่างกาย
ตัวเปิดโปรแกรมรวม 4 ระบบเป็นแท็บเดียว (ดับเบิลคลิก run.bat หรือรัน: py main.py)"""
import importlib.util
import os
import sys
import tkinter as tk
from tkinter import ttk

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import pose_core as pc

TABS = [
    ("list", "4.1 รายการท่า", "4.1 ระบบแสดงรายการท่าบริหาร.py"),
    ("edit", "4.2 สร้าง/แก้ไขท่า", "4.2 ระบบจัดการข้อมูลท่าบริหาร.py"),
    ("detail", "4.3 รายละเอียด/ทำตามท่า", "4.3 ระบบแสดงรายละเอียดท่าบริหาร.py"),
    ("settings", "4.4 ตั้งค่า/ฝึกตามเวลา", "4.4 ระบบตั้งค่าจำนวนครั้งและเวลา.py"),
]


def load_module(i, filename):
    spec = importlib.util.spec_from_file_location(f"pose_mod_{i}", os.path.join(BASE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    root = tk.Tk()
    root.title("MOVE & RELIEVE ขยับกาย ทลายเมื่อย — ระบบจัดการท่าบริหารร่างกาย")
    root.geometry("1180x720")
    pc.setup_style(root)
    nb = ttk.Notebook(root)
    nb.pack(fill="both", expand=True)
    index = {}
    for i, (key, title, fn) in enumerate(TABS):
        mod = load_module(i, fn)
        nb.add(mod.Frame(nb), text=f"  {title}  ")
        index[key] = i
    pc.bus.on("goto", lambda key: nb.select(index[key]))
    root.mainloop()


if __name__ == "__main__":
    main()
