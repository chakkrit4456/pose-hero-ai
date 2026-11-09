"""
1.1 Camera Input System.py
=========================
ระบบ 1.1 : ระบบรับภาพจากกล้อง (CameraSystem)

หน้าที่:
  - ค้นหากล้อง เลือกกล้อง เปิด/ปิดกล้อง
  - ส่งภาพทีละเฟรมให้ระบบอื่น ผ่าน get_frame() (คืน None ถ้าอ่านไม่ได้)
    หรือ read() (แจ้ง CameraError ถ้าอ่านไม่ได้ ใช้ใน main.py)
  - กลับภาพซ้าย-ขวา (โหมดกระจก) ให้ผู้เล่นขยับตามได้ง่าย

วิธีรัน (เมนูทดสอบ):   python "1.1 Camera Input System.py"
วิธีเล่นจริงครบทุกระบบ:  python main.py
"""

import importlib.util
import os
import sys
import time
from pathlib import Path

import cv2


class CameraError(Exception):
    """ข้อผิดพลาดที่เกี่ยวกับกล้อง"""


class CameraSystem:

    def __init__(self, width=1280, height=720, mirror=True):
        self.camera = None
        self.camera_index = None
        self.backend_name = None

        self.width = width
        self.height = height
        self.mirror = mirror  # True = กลับซ้าย-ขวาเหมือนส่องกระจก

        # Windows ใช้ DirectShow / Media Foundation ส่วนระบบอื่นใช้ค่าเริ่มต้น
        if os.name == "nt":
            self.backends = [
                ("DirectShow", cv2.CAP_DSHOW),
                ("Media Foundation", cv2.CAP_MSMF),
            ]
        else:
            self.backends = [("Default", cv2.CAP_ANY)]

    # ค้นหากล้อง
    def detect_cameras(self, max_cameras=5):

        available = []

        print("\nกำลังค้นหากล้อง...")

        for index in range(max_cameras):

            for name, backend in self.backends:

                cap = cv2.VideoCapture(index, backend)

                if cap.isOpened():
                    success, frame = cap.read()

                    if success and frame is not None:
                        available.append({
                            "index": index,
                            "backend": backend,
                            "name": name
                        })

                        print(f"พบกล้อง {index} ({name})")

                        cap.release()
                        break

                cap.release()

        return available

    # เลือกกล้อง (ถ้ามีกล้องเดียว เปิดให้เลย ไม่ต้องถาม)
    def select_camera(self):

        cameras = self.detect_cameras()

        if not cameras:
            print("ไม่พบกล้องที่ใช้งานได้")
            return False

        if len(cameras) == 1:
            item = cameras[0]
            return self.open_camera(item["index"], item["backend"], item["name"])

        print("\n========== เลือกกล้อง ==========")

        for number, camera in enumerate(cameras):
            print(
                f"{number} : กล้องหมายเลข "
                f"{camera['index']} ({camera['name']})"
            )

        while True:

            try:
                selected = int(input("\nเลือกหมายเลขกล้อง: "))

                if 0 <= selected < len(cameras):

                    item = cameras[selected]

                    return self.open_camera(
                        item["index"],
                        item["backend"],
                        item["name"]
                    )

                print("หมายเลขกล้องไม่ถูกต้อง")

            except ValueError:
                print("กรุณากรอกเป็นตัวเลข")

    # เปิดกล้องตามหมายเลขที่ระบุ (ใช้กับ main.py --camera N)
    def open_index(self, index):

        if not isinstance(index, int) or index < 0:
            print("หมายเลขกล้องต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป")
            return False

        for name, backend in self.backends:
            if self.open_camera(index, backend, name):
                return True

        print(
            f"เปิดกล้องหมายเลข {index} ไม่ได้ ลองตรวจสอบ: "
            "1) กล้องเสียบอยู่ 2) Zoom/Line/Teams ใช้กล้องอยู่หรือไม่ "
            "3) Windows อนุญาตให้แอปใช้กล้องหรือไม่ 4) ลองเปลี่ยนหมายเลขกล้อง"
        )
        return False

    # เปิดกล้อง
    def open_camera(self, index, backend, backend_name):

        self.camera = cv2.VideoCapture(index, backend)

        if not self.camera.isOpened():
            print("ไม่สามารถเปิดกล้องได้")
            self.close_camera(silent=True)
            return False

        self.camera_index = index
        self.backend_name = backend_name

        self.camera.set(
            cv2.CAP_PROP_FRAME_WIDTH,
            self.width
        )

        self.camera.set(
            cv2.CAP_PROP_FRAME_HEIGHT,
            self.height
        )

        time.sleep(0.5)

        success, frame = self.camera.read()

        if not success or frame is None:
            print("ไม่สามารถรับภาพจากกล้องได้")
            self.close_camera(silent=True)
            return False

        print("\nเปิดกล้องสำเร็จ")
        print(f"กล้องหมายเลข: {index}")
        print(f"ระบบ: {backend_name}")

        return True

    def is_opened(self):
        return self.camera is not None and self.camera.isOpened()

    # รับภาพจากกล้อง (คืน None ถ้าอ่านไม่ได้)
    def get_frame(self):

        if self.camera is None:
            return None

        success, frame = self.camera.read()

        if not success or frame is None:
            return None

        if self.mirror:
            frame = cv2.flip(frame, 1)

        return frame

    # รับภาพจากกล้อง (แจ้ง CameraError ถ้าอ่านไม่ได้) ใช้ใน main.py
    def read(self):

        if not self.is_opened():
            raise CameraError("ยังไม่ได้เปิดกล้อง")

        frame = self.get_frame()

        if frame is None:
            raise CameraError("อ่านภาพจากกล้องไม่ได้ (กล้องอาจถูกถอดหรือหยุดทำงาน)")

        return frame

    # ทดสอบกล้องปกติ
    def show_camera(self):

        window = "MOVE & RELIEVE AI - Camera Test"

        try:
            cv2.namedWindow(window, cv2.WINDOW_NORMAL)

            while True:

                frame = self.get_frame()

                if frame is None:
                    print("ไม่สามารถรับภาพจากกล้องได้")
                    break

                cv2.putText(
                    frame,
                    "CAMERA TEST",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 255, 0),
                    2
                )

                cv2.imshow(window, frame)

                key = cv2.waitKey(1) & 0xFF

                if key == ord("q") or key == 27:
                    break

        finally:
            cv2.destroyAllWindows()

    # โหลดไฟล์ 1.2 ที่อยู่โฟลเดอร์เดียวกับไฟล์นี้ (ไม่ต้องพึ่งไฟล์อื่น)
    @staticmethod
    def load_body_module():

        folder = Path(__file__).resolve().parent
        matches = sorted(folder.glob("1.2 *.py"))

        if not matches:
            raise FileNotFoundError(
                f"ไม่พบไฟล์ \"1.2 Body Detection System.py\" ในโฟลเดอร์ {folder}\n"
                "ต้องวางไฟล์ 1.1 และ 1.2 ไว้ในโฟลเดอร์เดียวกัน"
            )

        spec = importlib.util.spec_from_file_location("body_detection_module", matches[0])

        if spec is None or spec.loader is None:
            raise ImportError(f"ไม่สามารถโหลดไฟล์ {matches[0].name} ได้")

        module = importlib.util.module_from_spec(spec)
        sys.modules["body_detection_module"] = module
        spec.loader.exec_module(module)

        return module

    # เปิดระบบตรวจจับร่างกายจากไฟล์ 1.2
    # backend ใช้ตอนทดสอบเท่านั้น (ไม่ระบุ = ใช้ MediaPipe จริง)
    def run_body_detection(self, backend=None):

        try:
            module = self.load_body_module()
        except Exception as error:
            print("\nโหลดระบบ 1.2 ตรวจจับร่างกายไม่ได้:", error)
            return

        try:
            # ตั้งโหมดกระจกของระบบตรวจจับให้ตรงกับกล้อง
            body_system = module.BodyDetectionSystem(
                backend=backend,
                mirrored_input=self.mirror
            )
        except Exception as error:
            print("\nเริ่มระบบตรวจจับร่างกายไม่ได้:", error)
            return

        # ส่งกล้องที่เปิดอยู่ให้ระบบ 1.2
        body_system.run(self)

    # ปิดกล้อง
    def close_camera(self, silent=False):

        was_open = self.camera is not None

        if self.camera is not None:
            self.camera.release()
            self.camera = None

        self.camera_index = None
        self.backend_name = None

        cv2.destroyAllWindows()

        if was_open and not silent:
            print("ปิดกล้องเรียบร้อย")

    # รองรับคำสั่ง with
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close_camera()
        return False


# ==========================================
# เมนูหลักของระบบ
# ==========================================

def main():

    camera_system = CameraSystem()

    print("\n================================")
    print("       MOVE & RELIEVE AI")
    print("================================")
    print("1. ทดสอบรับภาพจากกล้อง")
    print("2. ทดสอบ AI ตรวจจับร่างกาย")
    print("0. ออกจากโปรแกรม")
    print("(เล่นจริงครบทุกระบบ: python main.py)")

    choice = input("\nเลือกเมนู: ").strip()

    if choice == "0":
        print("ออกจากโปรแกรม")
        return

    if choice not in ("1", "2"):
        print("ไม่พบเมนูที่เลือก")
        return

    # เปิดกล้องเพียงครั้งเดียว
    if not camera_system.select_camera():
        return

    try:

        if choice == "1":
            camera_system.show_camera()

        elif choice == "2":
            camera_system.run_body_detection()

    except Exception as error:
        print(f"\nเกิดข้อผิดพลาด: {error}")

    finally:
        camera_system.close_camera()


if __name__ == "__main__":
    main()