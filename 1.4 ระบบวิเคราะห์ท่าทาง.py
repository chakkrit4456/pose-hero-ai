"""
1.4 ระบบวิเคราะห์ท่าทาง.py
==========================
ระบบ 1.4 : วิเคราะห์ท่าทาง

รับ  : ข้อต่อจากระบบ 1.3 + ข้อมูลท่าบริหาร (จาก exercises.json)
ส่ง  : ผลวิเคราะห์ (dict) ให้ระบบ 1.5 ประเมินท่าทาง
         valid          - คำนวณมุมได้ครบหรือไม่
         angles         - มุมของแต่ละข้อต่อ (องศา)
         progress       - ความคืบหน้าของท่า 0.0 (ท่าเริ่มต้น) ถึง 1.0 (ถึงเป้าหมาย)
         phase          - "start" / "moving" / "target" / "unknown"
         reps           - จำนวนครั้งที่ทำได้แล้ว
         hold_time      - เวลาที่ค้างท่า (วินาที) ใช้กับท่ายืดเหยียด
         rep_completed  - เฟรมนี้เพิ่งทำครบ 1 ครั้งหรือไม่
         rep_snapshot   - มุมต่าง ๆ ตอนที่ทำท่าได้สูงสุดของครั้งนั้น (ให้ระบบ 1.5 ตัดสินคะแนน)

หลักการนับครั้ง:
  ใช้มุมหลัก (counter.angle) วัดความคืบหน้าระหว่าง start_angle กับ target_angle
  - โหมด "reps" : เริ่มต้น -> ถึงเป้าหมาย -> กลับมาเริ่มต้น = นับ 1 ครั้ง
  - โหมด "hold" : ค้างที่เป้าหมายครบ hold_sec วินาที = นับ 1 ครั้ง (ต้องกลับมาท่าเริ่มต้นก่อนทำครั้งต่อไป)
"""

import math
import time
from collections import deque


def calculate_angle(a, b, c):
    """
    มุมที่จุด b ระหว่างเส้น b->a กับเส้น b->c (หน่วยองศา 0-180)
    a, b, c เป็นพิกัด (x, y) ถ้าคำนวณไม่ได้ (จุดซ้อนกัน) คืน None
    """
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    length1 = math.hypot(*v1)
    length2 = math.hypot(*v2)
    if length1 == 0 or length2 == 0:
        return None
    cosine = (v1[0] * v2[0] + v1[1] * v2[1]) / (length1 * length2)
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


class PoseAnalyzer:
    """วิเคราะห์ท่าทางของผู้เล่นสำหรับท่าบริหาร 1 ท่า"""

    def __init__(self, exercise, smoothing_window=5):
        counter = exercise["counter"]
        self.angle_defs = exercise["angles"]
        self.mode = counter.get("mode", "reps")

        names = counter["angle"]
        self.counter_angles = [names] if isinstance(names, str) else list(names)

        self.start_angle = float(counter["start_angle"])
        self.target_angle = float(counter["target_angle"])
        if self.start_angle == self.target_angle:
            raise ValueError("start_angle กับ target_angle ต้องไม่เท่ากัน")

        self.reach_ratio = float(counter.get("reach_ratio", 0.85))    # ถึงเป้าหมายเมื่อคืบหน้า >= ค่านี้
        self.return_ratio = float(counter.get("return_ratio", 0.15))  # กลับถึงจุดเริ่มเมื่อคืบหน้า <= ค่านี้
        self.hold_sec = float(counter.get("hold_sec", 0))
        self._window = smoothing_window
        self.reset()

    def reset(self):
        """เริ่มนับใหม่ทั้งหมด"""
        self._history = {name: deque(maxlen=self._window) for name in self.angle_defs}
        self.reps = 0
        self._armed = False        # เคยอยู่ที่ท่าเริ่มต้นแล้วหรือยัง (กันนับผิดตอนเริ่ม)
        self._in_target = False
        self._peak_progress = None
        self._peak_snapshot = None
        self._hold_start = None
        self._hold_snapshot = None

    # ------------------------------------------------------------------
    def _raw_angles(self, joints):
        angles = {}
        for name, (a_name, b_name, c_name) in self.angle_defs.items():
            a, b, c = joints.get(a_name), joints.get(b_name), joints.get(c_name)
            if not (a and b and c and a["visible"] and b["visible"] and c["visible"]):
                angles[name] = None
                continue
            angles[name] = calculate_angle((a["px"], a["py"]), (b["px"], b["py"]), (c["px"], c["py"]))
        return angles

    def _smooth(self, raw):
        """เฉลี่ยมุมย้อนหลังไม่กี่เฟรม เพื่อลดอาการสั่น"""
        smoothed = {}
        for name, value in raw.items():
            history = self._history[name]
            if value is None:
                history.clear()
                smoothed[name] = None
            else:
                history.append(value)
                smoothed[name] = sum(history) / len(history)
        return smoothed

    # ------------------------------------------------------------------
    def analyze(self, joints, now=None):
        """วิเคราะห์ท่าทาง 1 เฟรม  now = เวลาปัจจุบัน (วินาที) ไม่ระบุจะใช้เวลาของเครื่อง"""
        now = time.time() if now is None else now
        angles = self._smooth(self._raw_angles(joints))

        result = {
            "valid": False, "angles": angles, "progress": 0.0, "phase": "unknown",
            "reps": self.reps, "hold_time": 0.0, "rep_completed": False, "rep_snapshot": None,
        }

        values = [angles.get(name) for name in self.counter_angles]
        if any(v is None for v in values):
            self._hold_start = None  # มองไม่เห็นข้อต่อ ถือว่าหยุดค้างท่า
            return result

        angle = sum(values) / len(values)
        raw_progress = (angle - self.start_angle) / (self.target_angle - self.start_angle)
        at_start = raw_progress <= self.return_ratio
        at_target = raw_progress >= self.reach_ratio

        if at_start:
            self._armed = True

        if self.mode == "hold":
            snapshot, hold_time = self._step_hold(at_target, angles, now)
            result["hold_time"] = hold_time
        else:
            snapshot = self._step_reps(at_start, at_target, raw_progress, angles)

        result["valid"] = True
        result["progress"] = max(0.0, min(1.0, raw_progress))
        result["phase"] = "start" if at_start else ("target" if at_target else "moving")
        if snapshot is not None:
            self.reps += 1
            result["rep_completed"] = True
            result["rep_snapshot"] = snapshot
        result["reps"] = self.reps
        return result

    def _step_reps(self, at_start, at_target, raw_progress, angles):
        """โหมดนับครั้ง: คืนค่า snapshot เมื่อครบ 1 ครั้ง ไม่ครบคืน None"""
        if self._armed and at_target:
            self._in_target = True
            if self._peak_progress is None or raw_progress > self._peak_progress:
                self._peak_progress = raw_progress
                self._peak_snapshot = dict(angles)

        if self._in_target and at_start:
            snapshot = self._peak_snapshot
            self._in_target = False
            self._peak_progress = None
            self._peak_snapshot = None
            return snapshot
        return None

    def _step_hold(self, at_target, angles, now):
        """โหมดค้างท่า: คืน (snapshot หรือ None, เวลาที่ค้างมาแล้ว)"""
        if not (self._armed and at_target):
            self._hold_start = None
            return None, 0.0

        if self._hold_start is None:
            self._hold_start = now
        self._hold_snapshot = dict(angles)
        hold_time = now - self._hold_start

        if hold_time >= self.hold_sec:
            snapshot = self._hold_snapshot
            self._armed = False  # ต้องกลับท่าเริ่มต้นก่อนทำครั้งต่อไป
            self._hold_start = None
            return snapshot, hold_time
        return None, hold_time
