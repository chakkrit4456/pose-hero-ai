"""
overlay.py
==========
ตัวช่วยวาดข้อความและแถบต่าง ๆ ลงบนภาพกล้อง

ทำไมต้องมี?  cv2.putText วาดภาษาไทยไม่ได้ (ขึ้นเป็น ???) จึงใช้ไลบรารี Pillow
วาดข้อความแทน ต้องมีไฟล์ฟอนต์ไทยในเครื่อง ระบบจะหาให้เองจากที่มาตรฐานของ
Windows / macOS / Linux หรือจะวางไฟล์ .ttf ไว้ในโฟลเดอร์ fonts ข้างไฟล์นี้ก็ได้
ถ้าหาฟอนต์ไม่พบ จะแสดงเฉพาะตัวอักษรอังกฤษและแจ้งเตือนหนึ่งครั้ง
"""

from pathlib import Path

import cv2
import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # ยังไม่ได้ติดตั้ง pillow
    Image = ImageDraw = ImageFont = None

_HERE = Path(__file__).resolve().parent

FONT_CANDIDATES = [
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/leelawad.ttf",
    "C:/Windows/Fonts/LeelawUI.ttf",
    "C:/Windows/Fonts/cordia.ttf",
    "/System/Library/Fonts/Supplemental/Ayuthaya.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    "/usr/share/fonts/opentype/tlwg/Loma.otf",
    "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
]


def find_thai_font():
    """หาไฟล์ฟอนต์ไทย คืนพาธ หรือ None ถ้าไม่พบ"""
    local = sorted((_HERE / "fonts").glob("*.ttf")) + sorted((_HERE / "fonts").glob("*.otf"))
    for path in [str(p) for p in local] + FONT_CANDIDATES:
        if Path(path).is_file():
            return path
    return None


class TextPainter:
    """วาดข้อความหลายบรรทัดลงภาพในครั้งเดียว (เร็วกว่าแปลงภาพทีละข้อความ)"""

    def __init__(self, font_path=None):
        self.font_path = font_path or find_thai_font()
        self._fonts = {}
        self._warned = False

    @property
    def thai_ok(self):
        return self.font_path is not None and ImageFont is not None

    def _font(self, size):
        if size not in self._fonts:
            self._fonts[size] = ImageFont.truetype(self.font_path, size)
        return self._fonts[size]

    def measure(self, text, size):
        """ความกว้างของข้อความ (พิกเซล) ใช้จัดกึ่งกลาง"""
        if self.thai_ok:
            return int(self._font(size).getlength(text))
        return int(len(text) * size * 0.55)

    def paint(self, frame, items):
        """
        items = [(ข้อความ, (x, y), ขนาดตัวอักษร, สี BGR), ...]  (x, y คือมุมซ้ายบนของข้อความ)
        คืนภาพใหม่ที่มีข้อความแล้ว
        """
        if not items:
            return frame

        if self.thai_ok:
            image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            draw = ImageDraw.Draw(image)
            for text, (x, y), size, (b, g, r) in items:
                draw.text((int(x), int(y)), text, font=self._font(size), fill=(r, g, b),
                          stroke_width=2, stroke_fill=(0, 0, 0))
            return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        if not self._warned:
            print("คำเตือน: ไม่พบฟอนต์ภาษาไทยหรือยังไม่ได้ติดตั้ง pillow (pip install pillow) "
                  "ข้อความไทยบนหน้าจอจะไม่แสดง วางไฟล์ .ttf ไทยไว้ในโฟลเดอร์ fonts ได้")
            self._warned = True
        for text, (x, y), size, color in items:
            ascii_text = "".join(ch for ch in text if ord(ch) < 128).strip()
            if ascii_text:
                cv2.putText(frame, ascii_text, (int(x), int(y) + size), cv2.FONT_HERSHEY_SIMPLEX,
                            size / 36, color, 2)
        return frame


def draw_panel(frame, x, y, w, h, color=(0, 0, 0), alpha=0.55):
    """วาดกล่องสี่เหลี่ยมโปร่งแสงเป็นพื้นหลังข้อความ"""
    x1, y1 = max(0, int(x)), max(0, int(y))
    x2, y2 = min(frame.shape[1], int(x + w)), min(frame.shape[0], int(y + h))
    if x2 <= x1 or y2 <= y1:
        return frame
    region = frame[y1:y2, x1:x2]
    overlay = np.full_like(region, color)
    frame[y1:y2, x1:x2] = cv2.addWeighted(overlay, alpha, region, 1 - alpha, 0)
    return frame


def draw_progress_bar(frame, x, y, w, h, value, color=(0, 200, 0)):
    """แถบความคืบหน้า value อยู่ระหว่าง 0.0 ถึง 1.0"""
    value = max(0.0, min(1.0, value))
    cv2.rectangle(frame, (int(x), int(y)), (int(x + w), int(y + h)), (60, 60, 60), -1)
    cv2.rectangle(frame, (int(x), int(y)), (int(x + w * value), int(y + h)), color, -1)
    cv2.rectangle(frame, (int(x), int(y)), (int(x + w), int(y + h)), (255, 255, 255), 2)
    return frame
