"""
1.2 ระบบตรวจจับร่างกาย.py
=========================
ระบบ 1.2 : ตรวจจับร่างกาย (BodyDetectionSystem)

มี 2 หน้าที่:
  1) detect(frame, required_joints)  -> ส่งตำแหน่งข้อต่อให้ระบบ 1.3 (dict)
        detected   - พบร่างกายหรือไม่
        in_frame   - ข้อต่อที่ท่านี้ต้องใช้อยู่ในกรอบภาพครบหรือไม่
        landmarks  - {ชื่อ: (x, y, z, visibility)} พิกัด x,y เป็นสัดส่วน 0-1
        missing    - ข้อต่อที่มองไม่เห็น
        message    - ข้อความภาษาไทยบอกผู้เล่น เช่น "ถอยห่างจากกล้องอีกเล็กน้อย"
  2) process_frame(frame) / run(camera_system) -> วาดโครงกระดูกลงภาพ ใช้ทดสอบระบบนี้เดี่ยว ๆ

รองรับ MediaPipe ทั้งรุ่นเก่า (mp.solutions) และรุ่นใหม่ (Tasks API ต้องมีไฟล์โมเดล
ซึ่งระบบจะดาวน์โหลดให้อัตโนมัติครั้งแรกครั้งเดียว)

เรื่องภาพกระจก: ระบบ 1.1 กลับภาพซ้าย-ขวาให้ผู้เล่นดู แต่โมเดล AI ถูกฝึกกับภาพปกติ
ระบบนี้จึงกลับภาพกลับก่อนส่งให้ AI (ซ้าย/ขวาจะถูกต้องตามร่างกายจริง) แล้วกลับค่า x
ของผลลัพธ์ให้ตรงกับภาพที่แสดงบนจอ ตั้ง mirrored_input ให้ตรงกับ CameraSystem.mirror
"""

import shutil
import time
import traceback
import urllib.request
from pathlib import Path

import cv2
import numpy as np

# ชื่อจุดทั้ง 33 จุดของ MediaPipe Pose เรียงตามลำดับมาตรฐาน
LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# ชื่อภาษาไทยของข้อต่อหลัก (ใช้แสดงข้อความให้ผู้เล่น)
JOINT_NAMES_TH = {
    "nose": "จมูก",
    "left_shoulder": "ไหล่ซ้าย", "right_shoulder": "ไหล่ขวา",
    "left_elbow": "ศอกซ้าย", "right_elbow": "ศอกขวา",
    "left_wrist": "ข้อมือซ้าย", "right_wrist": "ข้อมือขวา",
    "left_hip": "สะโพกซ้าย", "right_hip": "สะโพกขวา",
    "left_knee": "เข่าซ้าย", "right_knee": "เข่าขวา",
    "left_ankle": "ข้อเท้าซ้าย", "right_ankle": "ข้อเท้าขวา",
}

# ข้อต่อที่ต้องเห็นเป็นอย่างน้อย ถ้าท่าบริหารไม่ได้ระบุมา
DEFAULT_REQUIRED = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]

# ข้อต่อส่วนล่างของร่างกาย (ถ้าหายไป แปลว่าผู้เล่นยืนใกล้กล้องเกินไป)
_LOWER_BODY = ("hip", "knee", "ankle", "heel", "foot")

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)
MODEL_PATH = Path(__file__).resolve().parent / "models" / "pose_landmarker_lite.task"


class BodyDetectionError(Exception):
    """ข้อผิดพลาดของระบบตรวจจับร่างกาย"""


def ensure_model(path=MODEL_PATH, url=MODEL_URL):
    """ตรวจว่ามีไฟล์โมเดลหรือยัง ถ้าไม่มีจะดาวน์โหลดให้อัตโนมัติ (ครั้งแรกครั้งเดียว)"""
    path = Path(path)
    if path.exists() and path.stat().st_size > 0:
        return path

    path.parent.mkdir(parents=True, exist_ok=True)
    print("กำลังดาวน์โหลดโมเดลตรวจจับท่าทาง (ครั้งแรกครั้งเดียว ประมาณ 6 MB)...")
    temp = path.with_suffix(".download")
    try:
        with urllib.request.urlopen(url, timeout=30) as response, open(temp, "wb") as out:
            shutil.copyfileobj(response, out)
        temp.replace(path)
    except Exception as error:  # ไม่มีอินเทอร์เน็ต / ถูกบล็อก ฯลฯ
        if temp.exists():
            temp.unlink()
        raise BodyDetectionError(
            f"ดาวน์โหลดโมเดลไม่สำเร็จ: {error}\n"
            f"วิธีแก้: เปิดลิงก์นี้ในเบราว์เซอร์เพื่อดาวน์โหลดไฟล์\n  {url}\n"
            f"แล้วนำไฟล์ไปวางที่\n  {path}"
        )
    return path


# ==========================================
# ตัวเชื่อมกับ MediaPipe
# ==========================================

class MediaPipeBackend:
    """รองรับทั้ง MediaPipe รุ่นเก่า (mp.solutions) และรุ่นใหม่ (Tasks API)"""

    def __init__(self, min_confidence=0.6, model_path=MODEL_PATH):
        try:
            import mediapipe as mp
        except ImportError:
            raise BodyDetectionError("ยังไม่ได้ติดตั้ง mediapipe  ติดตั้งด้วย: pip install mediapipe")

        self._mp = mp
        self._legacy = None
        self._landmarker = None
        self._last_ts = 0

        if hasattr(mp, "solutions"):
            # MediaPipe รุ่นเก่า มีโมเดลมาในแพ็กเกจ
            self._legacy = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                enable_segmentation=False,
                min_detection_confidence=min_confidence,
                min_tracking_confidence=min_confidence,
            )
        else:
            # MediaPipe รุ่นใหม่ ใช้ Tasks API และต้องมีไฟล์โมเดล
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision

            # อ่านไฟล์เป็น bytes เอง เพื่อเลี่ยงปัญหาพาธภาษาไทยบน Windows
            model_bytes = ensure_model(model_path).read_bytes()
            options = vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_buffer=model_bytes),
                running_mode=vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=min_confidence,
                min_pose_presence_confidence=min_confidence,
                min_tracking_confidence=min_confidence,
            )
            self._landmarker = vision.PoseLandmarker.create_from_options(options)

    @staticmethod
    def _to_tuple(landmark, use_presence):
        visibility = getattr(landmark, "visibility", None)
        value = 0.0 if visibility is None else float(visibility)
        if use_presence:
            # รุ่นใหม่มีค่า presence จริง จึงรวมเข้ากับความมั่นใจ
            # (รุ่นเก่า presence เป็น 0 เสมอ ห้ามนำมาตัดสิน ไม่เช่นนั้นจะไม่เห็นข้อต่อเลย)
            presence = getattr(landmark, "presence", None)
            if presence is not None:
                value = min(value, float(presence))
        return (landmark.x, landmark.y, landmark.z, value)

    def process(self, rgb_image):
        """คืนรายการ 33 จุด [(x, y, z, ความมั่นใจ), ...] หรือ None ถ้าไม่พบคน"""
        if self._legacy is not None:
            rgb_image.flags.writeable = False
            result = self._legacy.process(rgb_image)
            if not result.pose_landmarks:
                return None
            return [self._to_tuple(lm, False) for lm in result.pose_landmarks.landmark]

        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_image)
        timestamp = int(time.monotonic() * 1000)
        if timestamp <= self._last_ts:  # MediaPipe ต้องการเวลาที่เพิ่มขึ้นเสมอ
            timestamp = self._last_ts + 1
        self._last_ts = timestamp

        result = self._landmarker.detect_for_video(image, timestamp)
        if not result.pose_landmarks:
            return None
        return [self._to_tuple(lm, True) for lm in result.pose_landmarks[0]]

    def close(self):
        if self._legacy is not None:
            self._legacy.close()
            self._legacy = None
        if self._landmarker is not None:
            self._landmarker.close()
            self._landmarker = None


# ==========================================
# ระบบตรวจจับร่างกาย
# ==========================================

class BodyDetectionSystem:

    def __init__(self, backend=None, mirrored_input=True,
                 min_confidence=0.6, visibility_threshold=0.5,
                 upper_body_only=True):

        # backend เปลี่ยนได้ (เช่น ใช้ตัวจำลองตอนทดสอบ) ถ้าไม่ระบุจะใช้ MediaPipe
        self.backend = backend if backend is not None else MediaPipeBackend(min_confidence)
        self.mirrored_input = mirrored_input

        # จุดข้อต่อที่ต้องการตรวจจับ (ครึ่งตัวบน)
        self.joint_ids = [
            11, 12,       # ไหล่
            13, 14,       # ข้อศอก
            15, 16,       # ข้อมือ
            23, 24        # สะโพก
        ]

        # เส้นเชื่อมโครงกระดูก (ครึ่งตัวบน)
        self.connections = [
            ("neck", 11),
            ("neck", 12),

            (11, 12),
            (11, 23),
            (12, 24),
            (23, 24),

            (11, 13),
            (13, 15),

            (12, 14),
            (14, 16)
        ]

        # ตั้ง upper_body_only=False ถ้าต้องการวาดส่วนขาด้วย (ท่าที่ต้องเห็นทั้งตัว)
        if not upper_body_only:

            self.joint_ids += [
                25, 26,   # เข่า
                27, 28,   # ข้อเท้า
                29, 30,   # ส้นเท้า
                31, 32    # ปลายเท้า
            ]

            self.connections += [
                (23, 25), (25, 27), (27, 29), (29, 31),
                (24, 26), (26, 28), (28, 30), (30, 32)
            ]

        # ค่าความมั่นใจขั้นต่ำ
        self.visibility_threshold = visibility_threshold

        # สี BGR
        self.line_color = (0, 255, 255)
        self.joint_color = (0, 0, 255)
        self.neck_color = (255, 0, 255)

        # FPS
        self.previous_time = time.perf_counter()
        self.fps = 0.0

        # ป้องกันการปิดระบบซ้ำ
        self.closed = False

    # =====================================
    # ตรวจสอบความมั่นใจของข้อต่อ
    # landmark = (x, y, z, ความมั่นใจ)
    # =====================================

    def is_landmark_visible(self, landmark):

        return landmark[3] >= self.visibility_threshold

    # =====================================
    # แปลงตำแหน่งข้อต่อเป็นพิกัดภาพ
    # =====================================

    def get_point(self, landmarks, index, width, height):

        if index < 0 or index >= len(landmarks):
            return None

        landmark = landmarks[index]

        if not self.is_landmark_visible(landmark):
            return None

        x = int(landmark[0] * width)
        y = int(landmark[1] * height)

        # ไม่แสดงจุดที่อยู่นอกภาพ
        if not (0 <= x < width and 0 <= y < height):
            return None

        return (x, y)

    # =====================================
    # คำนวณตำแหน่งคอ
    # =====================================

    def get_neck_position(self, landmarks, width, height):

        left_shoulder = self.get_point(landmarks, 11, width, height)
        right_shoulder = self.get_point(landmarks, 12, width, height)
        left_hip = self.get_point(landmarks, 23, width, height)
        right_hip = self.get_point(landmarks, 24, width, height)

        required_points = [
            left_shoulder,
            right_shoulder,
            left_hip,
            right_hip
        ]

        if any(point is None for point in required_points):
            return None

        shoulder_center = (
            (left_shoulder[0] + right_shoulder[0]) // 2,
            (left_shoulder[1] + right_shoulder[1]) // 2
        )

        hip_center = (
            (left_hip[0] + right_hip[0]) // 2,
            (left_hip[1] + right_hip[1]) // 2
        )

        torso_length = np.linalg.norm(
            np.array(shoulder_center) -
            np.array(hip_center)
        )

        neck_length = int(torso_length * 0.12)

        neck_x = shoulder_center[0]
        neck_y = shoulder_center[1] - neck_length

        if not (0 <= neck_x < width and 0 <= neck_y < height):
            return None

        return (neck_x, neck_y)

    # =====================================
    # วาดโครงกระดูก
    # =====================================

    def draw_skeleton(self, frame, landmarks):

        height, width = frame.shape[:2]

        points = {}

        # ตรวจจับตำแหน่งข้อต่อ
        for joint_id in self.joint_ids:

            points[joint_id] = self.get_point(
                landmarks,
                joint_id,
                width,
                height
            )

        # คำนวณตำแหน่งคอ
        points["neck"] = self.get_neck_position(
            landmarks,
            width,
            height
        )

        # วาดเส้นเชื่อม
        for start_id, end_id in self.connections:

            start_point = points.get(start_id)
            end_point = points.get(end_id)

            if start_point is None or end_point is None:
                continue

            cv2.line(
                frame,
                start_point,
                end_point,
                self.line_color,
                3,
                cv2.LINE_AA
            )

        # วาดจุดข้อต่อ
        for joint_id in self.joint_ids:

            point = points.get(joint_id)

            if point is None:
                continue

            cv2.circle(
                frame,
                point,
                6,
                self.joint_color,
                -1,
                cv2.LINE_AA
            )

            cv2.circle(
                frame,
                point,
                6,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

        # วาดจุดคอ
        neck = points.get("neck")

        if neck is not None:

            cv2.circle(
                frame,
                neck,
                7,
                self.neck_color,
                -1,
                cv2.LINE_AA
            )

        return frame

    # =====================================
    # แสดงสถานะ
    # =====================================

    def draw_status(self, frame, status, color):

        cv2.rectangle(
            frame,
            (10, 10),
            (330, 55),
            (30, 30, 30),
            -1
        )

        cv2.putText(
            frame,
            status,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            color,
            2,
            cv2.LINE_AA
        )

        return frame

    # =====================================
    # คำนวณ FPS
    # =====================================

    def calculate_fps(self):

        current_time = time.perf_counter()
        delta_time = current_time - self.previous_time

        if delta_time > 0:

            current_fps = 1.0 / delta_time

            if self.fps == 0:
                self.fps = current_fps
            else:
                self.fps = (
                    self.fps * 0.8
                    + current_fps * 0.2
                )

        self.previous_time = current_time

        return self.fps

    # =====================================
    # ตรวจจับร่างกาย (ส่งผลให้ระบบ 1.3)
    # =====================================

    def detect(self, frame_bgr, required_joints=None):

        result = {"detected": False, "in_frame": False, "landmarks": {}, "missing": [], "message": ""}

        if self.closed:
            raise RuntimeError("ระบบตรวจจับร่างกายถูกปิดแล้ว")

        if frame_bgr is None or getattr(frame_bgr, "size", 0) == 0:
            result["message"] = "ไม่ได้รับภาพจากกล้อง"
            return result

        image = cv2.flip(frame_bgr, 1) if self.mirrored_input else frame_bgr
        rgb = np.ascontiguousarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        raw = self.backend.process(rgb)

        if raw is None or len(raw) < len(LANDMARK_NAMES):
            result["message"] = "ไม่พบร่างกาย กรุณายืนให้อยู่ในกล้อง"
            return result

        landmarks = {}
        for name, (x, y, z, visibility) in zip(LANDMARK_NAMES, raw):
            if self.mirrored_input:
                x = 1.0 - x  # ให้ตรงกับภาพกระจกที่แสดงบนจอ
            landmarks[name] = (x, y, z, visibility)

        required = [n for n in (required_joints or DEFAULT_REQUIRED) if n in landmarks]
        missing = [n for n in required if not self._joint_ok(landmarks[n])]
        outside = [n for n in missing if not (0.0 <= landmarks[n][0] <= 1.0 and 0.0 <= landmarks[n][1] <= 1.0)]

        result["detected"] = True
        result["landmarks"] = landmarks
        result["missing"] = missing
        result["in_frame"] = not missing

        if not missing:
            result["message"] = "พร้อม"
        elif outside or any(part in name for name in missing for part in _LOWER_BODY):
            # ส่วนของร่างกายออกนอกภาพ หรือขาล่างหาย = ยืนใกล้กล้องเกินไป
            result["message"] = "ถอยห่างจากกล้องอีกเล็กน้อย ให้เห็นทั้งตัว"
        else:
            names = [JOINT_NAMES_TH.get(n, n) for n in missing[:3]]
            result["message"] = "มองไม่เห็น: " + ", ".join(names) + " ปรับตำแหน่งให้เห็นชัด"
        return result

    def _joint_ok(self, landmark):
        x, y, _, _ = landmark
        return self.is_landmark_visible(landmark) and 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0

    # =====================================
    # วิเคราะห์ภาพและวาดโครงกระดูก (สำหรับทดสอบระบบนี้เดี่ยว ๆ)
    # =====================================

    def process_frame(self, frame):

        if frame is None or frame.size == 0:
            return None

        if self.closed:
            raise RuntimeError("ระบบตรวจจับร่างกายถูกปิดแล้ว")

        # ทำสำเนาภาพ ป้องกันแก้ไขภาพต้นฉบับจากกล้อง
        output = frame.copy()

        body = self.detect(frame)

        if body["detected"]:

            landmark_list = [body["landmarks"][name] for name in LANDMARK_NAMES]
            output = self.draw_skeleton(output, landmark_list)

            status = "BODY DETECTED"
            status_color = (0, 255, 0)

        else:

            status = "BODY NOT DETECTED"
            status_color = (0, 0, 255)

        self.draw_status(
            output,
            status,
            status_color
        )

        # แสดง FPS
        fps = self.calculate_fps()

        cv2.putText(
            output,
            f"FPS: {fps:.1f}",
            (20, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA
        )

        return output

    # =====================================
    # เริ่มระบบตรวจจับร่างกาย
    # รับกล้องจากระบบ 1.1
    # =====================================

    def run(self, camera_system):

        window_name = "MOVE & RELIEVE AI - Body Detection"
        window_created = False

        # ใช้โหมดกระจกให้ตรงกับกล้องที่ส่งมา
        self.mirrored_input = getattr(camera_system, "mirror", self.mirrored_input)

        print("\n================================")
        print("เริ่มระบบตรวจจับร่างกาย")
        print("กด Q หรือ ESC เพื่อออกจากระบบ")
        print("================================")

        try:

            cv2.namedWindow(
                window_name,
                cv2.WINDOW_NORMAL
            )

            window_created = True

            while True:

                # รับภาพจากกล้องระบบ 1.1
                frame = camera_system.get_frame()

                if frame is None:
                    print("ไม่สามารถรับภาพจากกล้องได้")
                    break

                # วิเคราะห์ภาพ
                output = self.process_frame(frame)

                if output is None:
                    continue

                cv2.imshow(
                    window_name,
                    output
                )

                key = cv2.waitKey(1) & 0xFF

                if key == ord("q") or key == 27:
                    break

        except Exception:

            print("\nเกิดข้อผิดพลาดในระบบตรวจจับร่างกาย")
            traceback.print_exc()

        finally:

            self.close()

            if window_created:
                try:
                    cv2.destroyWindow(window_name)
                except cv2.error:
                    pass

            print("ออกจากระบบตรวจจับร่างกายแล้ว")

    # =====================================
    # ปิดระบบ MediaPipe
    # =====================================

    def close(self):

        if self.closed:
            return

        self.closed = True

        if hasattr(self.backend, "close"):
            self.backend.close()


# ชื่อเดิมที่ใช้ในรุ่นก่อน (เก็บไว้เพื่อความเข้ากันได้)
BodyDetector = BodyDetectionSystem