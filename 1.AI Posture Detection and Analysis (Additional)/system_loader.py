"""
system_loader.py
================
ตัวโหลดไฟล์ระบบตามเลขระบบ (เช่น "1.2 Body Detection System.py")

ทำไมต้องมีไฟล์นี้?
  Python ใช้คำสั่ง import กับชื่อไฟล์ที่มีเว้นวรรค จุด หรือภาษาไทยไม่ได้
  ไฟล์นี้จึงโหลดไฟล์ระบบจาก "เลขระบบ" แทน เช่น load_system("1.2")
  (ค้นหาไฟล์ในโฟลเดอร์เดียวกันที่ขึ้นต้นด้วย "1.2 ") จึงเปลี่ยนชื่อระบบต่อท้ายได้
  ก็ยังเรียกได้ตามเดิม

ตัวอย่าง:
    from system_loader import load_system
    ระบบกล้อง = load_system("1.1")
    cam = ระบบกล้อง.CameraCapture()
"""

import importlib.util
import os
import sys
from pathlib import Path

if os.name == "nt":
    try:
        os.system("chcp 65001 >nul")
    except Exception:
        pass
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))  # ให้ไฟล์ระบบ import system_loader ได้เสมอ

_cache = {}


def load_system(number):
    """โหลดไฟล์ระบบตามเลข เช่น "1.1" ถึง "1.5" แล้วคืนค่าเป็นโมดูล"""
    if number in _cache:
        return _cache[number]

    matches = sorted(BASE_DIR.glob(f"{number} *.py"))
    if not matches:
        raise FileNotFoundError(
            f"ไม่พบไฟล์ระบบ {number} ในโฟลเดอร์ {BASE_DIR}\n"
            f"(ต้องมีไฟล์ชื่อขึ้นต้นด้วย \"{number} \" เช่น \"{number} System Name.py\")"
        )

    module_name = "system_" + number.replace(".", "_")
    spec = importlib.util.spec_from_file_location(module_name, matches[0])
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    _cache[number] = module
    return module
