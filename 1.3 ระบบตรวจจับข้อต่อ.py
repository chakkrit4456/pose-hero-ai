"""
1.3 ระบบตรวจจับข้อต่อ.py
========================
ระบบ 1.3 : ตรวจจับข้อต่อ

รับ  : ผลจากระบบ 1.2 (body) + ขนาดภาพ
ส่ง  : พจนานุกรมข้อต่อ ให้ระบบ 1.4 วิเคราะห์ท่าทาง
         {ชื่อข้อต่อ: {"px","py" (พิกเซล), "x","y","z", "visibility", "visible"}}

หน้าที่:
  - แปลงพิกัดสัดส่วน (0-1) เป็นพิกเซลตามขนาดภาพ
  - ทำให้ตำแหน่งนิ่งขึ้น (ลดอาการสั่นของจุด) ด้วยค่าเฉลี่ยถ่วงน้ำหนัก
  - สร้างข้อต่อเสมือนที่ท่าบริหารใช้ เช่น กึ่งกลางไหล่ กึ่งกลางสะโพก
  - วาดโครงกระดูกลงบนภาพ
"""

import cv2

from system_loader import load_system

LANDMARK_NAMES = load_system("1.2").LANDMARK_NAMES

# ข้อต่อเสมือน (คำนวณจากข้อต่อจริง) ใช้ในไฟล์ exercises.json ได้เหมือนข้อต่อปกติ
VIRTUAL_JOINTS = ["mid_shoulder", "mid_hip", "below_mid_hip"]
# below_mid_hip = จุดที่อยู่ใต้กึ่งกลางสะโพกลงไปตรง ๆ ใช้วัดการเอียงลำตัวจากแนวดิ่ง
VIRTUAL_SOURCES = {
    "mid_shoulder": ["left_shoulder", "right_shoulder"],
    "mid_hip": ["left_hip", "right_hip"],
    "below_mid_hip": ["left_hip", "right_hip"],
}

SKELETON_LINES = [
    ("left_shoulder", "right_shoulder"), ("left_hip", "right_hip"),
    ("left_shoulder", "left_hip"), ("right_shoulder", "right_hip"),
    ("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"), ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
]

SKELETON_JOINTS = {name for pair in SKELETON_LINES for name in pair}
LEG_JOINTS = {"left_knee", "right_knee", "left_ankle", "right_ankle"}


class JointTracker:
    """แปลงผลตรวจจับร่างกายเป็นข้อต่อพร้อมใช้งาน"""

    def __init__(self, smoothing=0.5, min_visibility=0.5):
        if not 0.0 <= smoothing < 1.0:
            raise ValueError("smoothing ต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 1")
        self.smoothing = smoothing  # ยิ่งมาก ยิ่งนิ่งแต่ตอบสนองช้าลง
        self.min_visibility = min_visibility
        self._previous = {}

    def reset(self):
        """ล้างค่าเดิม (เรียกเมื่อเริ่มท่าใหม่ หรือผู้เล่นหายจากภาพ)"""
        self._previous = {}

    def update(self, body, frame_shape):
        """รับผลจากระบบ 1.2 คืนค่าพจนานุกรมข้อต่อ (ว่างถ้าไม่พบร่างกาย)"""
        if not body or not body.get("detected"):
            self.reset()
            return {}

        height, width = frame_shape[:2]
        joints = {}
        for name, (x, y, z, visibility) in body["landmarks"].items():
            px, py = x * width, y * height
            previous = self._previous.get(name)
            if previous is not None:
                keep = self.smoothing
                px = keep * previous[0] + (1 - keep) * px
                py = keep * previous[1] + (1 - keep) * py
            self._previous[name] = (px, py)
            joints[name] = {
                "x": x, "y": y, "z": z, "px": px, "py": py,
                "visibility": visibility,
                "visible": visibility >= self.min_visibility,
            }

        self._add_virtual_joints(joints)
        return joints

    @staticmethod
    def _add_virtual_joints(joints):
        for name, sources in VIRTUAL_SOURCES.items():
            a, b = joints.get(sources[0]), joints.get(sources[1])
            if a is None or b is None:
                continue
            px = (a["px"] + b["px"]) / 2
            py = (a["py"] + b["py"]) / 2
            if name == "below_mid_hip":
                py += 100  # ลงไปตรง ๆ ในแนวดิ่ง
            joints[name] = {
                "x": 0.0, "y": 0.0, "z": 0.0, "px": px, "py": py,
                "visibility": min(a["visibility"], b["visibility"]),
                "visible": a["visible"] and b["visible"],
            }


def draw_skeleton(frame, joints, tracked=None, line_color=(80, 200, 80), joint_color=(0, 200, 255)):
    """
    วาดโครงกระดูกลงบนภาพ ข้อต่อที่ท่านี้ใช้ตรวจ (tracked) จะวาดจุดใหญ่และสีเด่น
    วาดครึ่งตัวบนเป็นหลัก ส่วนขาจะวาดเฉพาะเมื่อท่านั้นต้องใช้ขา (อยู่ใน tracked)
    """
    if not joints:
        return frame
    tracked = set(tracked or [])

    def drawable(name):
        joint = joints.get(name)
        if not joint or not joint["visible"]:
            return False
        return name not in LEG_JOINTS or name in tracked

    for a, b in SKELETON_LINES:
        if drawable(a) and drawable(b):
            ja, jb = joints[a], joints[b]
            cv2.line(frame, (int(ja["px"]), int(ja["py"])), (int(jb["px"]), int(jb["py"])), line_color, 3)

    for name in LANDMARK_NAMES:
        if name not in SKELETON_JOINTS or not drawable(name):
            continue
        joint = joints[name]
        is_tracked = name in tracked
        cv2.circle(
            frame, (int(joint["px"]), int(joint["py"])),
            9 if is_tracked else 5, joint_color if is_tracked else (200, 200, 200), -1,
        )
    return frame