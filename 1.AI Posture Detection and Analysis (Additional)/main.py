"""
main.py
=======
ตัวรันหลักของ "ระบบ AI ตรวจจับและวิเคราะห์ท่าทาง" เชื่อมทุกระบบเข้าด้วยกัน

    กล้อง (1.1) -> ตรวจจับร่างกาย (1.2) -> ตรวจจับข้อต่อ (1.3)
                -> วิเคราะห์ท่าทาง (1.4) -> ประเมินท่าทาง (1.5) -> แสดงผลบนหน้าจอ

ข้อมูลท่าบริหารมาจาก exercises.json (รูปแบบเดียวกับที่ระบบจัดการท่าบริหารบันทึก)

วิธีรัน:
    python main.py                 เลือกหมวดหมู่และท่าจากเมนู
    python main.py --all           ทำทุกท่าต่อกัน
    python main.py --exercise arm_01
    python main.py --camera 1      ใช้กล้องหมายเลข 1 (ไม่ระบุ ระบบจะค้นหากล้องให้)
ปุ่มระหว่างเล่น:  n = ข้ามท่านี้ (หรือข้ามช่วงพัก) | q หรือ ESC = ออก
"""

import argparse
import sys
import time
from pathlib import Path

import cv2

from exercise_loader import VALID_CATEGORIES, load_exercises, required_joints
from overlay import TextPainter, draw_panel, draw_progress_bar
from system_loader import load_system

camera_system = load_system("1.1")       # ระบบรับภาพจากกล้อง
body_system = load_system("1.2")         # ระบบตรวจจับร่างกาย
joint_system = load_system("1.3")        # ระบบตรวจจับข้อต่อ
analyzer_system = load_system("1.4")     # ระบบวิเคราะห์ท่าทาง
evaluator_system = load_system("1.5")    # ระบบประเมินท่าทาง

WINDOW_NAME = "Move & Relieve AI"
KEY_ESC, KEY_Q, KEY_N = 27, ord("q"), ord("n")
DEFAULT_MUSIC_PATH = (
    Path(__file__).resolve().parents[1] / "Music" / "POSE AI – โยกให้สุด.mp3"
)

WHITE, GREEN, YELLOW, RED, GRAY = (255, 255, 255), (80, 220, 80), (0, 220, 255), (60, 60, 255), (200, 200, 200)


def start_default_music():
    """เล่นเพลงเริ่มต้นวนซ้ำระหว่างเซสชัน ถ้าไม่มีไฟล์หรืออุปกรณ์เสียงให้แจ้งเตือน"""
    if not DEFAULT_MUSIC_PATH.is_file():
        print("ไม่พบไฟล์เพลงเริ่มต้น:", DEFAULT_MUSIC_PATH)
        return None

    try:
        import pygame
    except ImportError as error:
        print("เล่นเพลงไม่ได้ กรุณาติดตั้งแพ็กเกจจาก requirements.txt:", error)
        return None

    try:
        pygame.mixer.init()
        pygame.mixer.music.load(str(DEFAULT_MUSIC_PATH))
        pygame.mixer.music.set_volume(0.35)
        pygame.mixer.music.play(-1)
    except pygame.error as error:
        pygame.mixer.quit()
        print("เปิดเพลงเริ่มต้นไม่ได้:", error)
        return None
    return pygame


class SessionAbort(Exception):
    """ผู้เล่นกดออกจากโปรแกรม"""


class WorkoutApp:
    """ควบคุมการเล่น: นับถอยหลัง -> ทำท่า -> พัก -> สรุปผล"""

    def __init__(self, camera, detector, tracker, show=None, clock=time.time,
                 painter=None, ready_sec=3, summary_sec=20):
        self.camera = camera
        self.detector = detector
        self.tracker = tracker
        self.show = show or self._default_show
        self.clock = clock
        self.painter = painter or TextPainter()
        self.ready_sec = ready_sec
        self.summary_sec = summary_sec
        self.current = None  # ท่าที่กำลังเล่น (ใช้ตอนทดสอบด้วย)

    # ------------------------------------------------------------------
    @staticmethod
    def _default_show(frame):
        cv2.imshow(WINDOW_NAME, frame)
        key = cv2.waitKey(1)
        return -1 if key == -1 else key & 0xFF

    def _present(self, frame, texts):
        """วาดข้อความ แสดงภาพ และคืนปุ่มที่กด (-1 = ไม่มีปุ่ม)"""
        key = self.show(self.painter.paint(frame, texts))
        if key in (KEY_Q, KEY_ESC):
            raise SessionAbort()
        return key

    def _centered(self, text, size, y, width, color):
        return (text, ((width - self.painter.measure(text, size)) // 2, y), size, color)

    # ------------------------------------------------------------------
    def run_exercise(self, ex):
        """เล่น 1 ท่า คืนสรุปผล"""
        self.current = ex
        analyzer = analyzer_system.PoseAnalyzer(ex)
        evaluator = evaluator_system.PoseEvaluator(ex)
        required = required_joints(ex)
        target_reps = int(ex.get("reps", 0))
        duration = float(ex.get("duration_sec", 0))
        hold_sec = float(ex["counter"].get("hold_sec", 0))
        self.tracker.reset()

        ready_start = None
        start_time = None
        last_rep = None       # (ข้อความ, เวลาที่แสดง)
        skipped = False
        analysis = {"valid": False, "reps": 0, "progress": 0.0, "hold_time": 0.0, "phase": "unknown"}

        while True:
            frame = self.camera.read()
            now = self.clock()
            body = self.detector.detect(frame, required)
            joints = self.tracker.update(body, frame.shape)
            in_view = body["detected"] and body["in_frame"]
            height, width = frame.shape[:2]
            scale = max(0.6, width / 1280)
            big, mid, small = int(40 * scale), int(30 * scale), int(24 * scale)

            evaluation = None
            if start_time is None:                         # ช่วงเตรียมตัว
                analyzer.analyze({}, now)
                if in_view:
                    ready_start = now if ready_start is None else ready_start
                    if now - ready_start >= self.ready_sec:
                        start_time = now
                else:
                    ready_start = None
            else:                                           # ช่วงทำท่า
                analysis = analyzer.analyze(joints if in_view else {}, now)
                evaluation = evaluator.evaluate(analysis)
                if evaluation["rep_completed"]:
                    text = f"ครั้งที่ {analysis['reps']}: {evaluation['rep_score']} คะแนน ({evaluation['rep_grade']})"
                    if evaluation["rep_feedback"]:
                        text += " - " + evaluation["rep_feedback"][0]
                    last_rep = (text, now, GREEN if evaluation["rep_score"] >= 70 else YELLOW)

            # --- วาดภาพ ---
            draw_panel(frame, 0, 0, width, int(110 * scale))
            draw_panel(frame, 0, height - int(150 * scale), width, int(150 * scale))
            joint_system.draw_skeleton(frame, joints, tracked=required)

            texts = [(ex["name"], (20, 10), big, WHITE)]
            if target_reps:
                counter_text = f"จำนวนครั้ง {analysis['reps']} / {target_reps}"
            else:
                counter_text = f"ทำแล้ว {analysis['reps']} ครั้ง"
            texts.append((counter_text, (20, 10 + big + 4), mid, YELLOW))

            if start_time is None:
                if in_view and ready_start is not None:
                    remain = int(self.ready_sec - (now - ready_start)) + 1
                    texts.append(self._centered(str(remain), big * 3, height // 3, width, YELLOW))
                    texts.append(self._centered("เตรียมตัว ยืนในท่าเริ่มต้น", mid, height // 3 + big * 3 + 10, width, WHITE))
                else:
                    texts.append(self._centered(body["message"], mid, height // 3, width, RED))
            else:
                if not in_view:
                    texts.append(self._centered(body["message"], mid, height // 3, width, RED))
                if analysis["valid"]:
                    draw_progress_bar(frame, 20, height - int(135 * scale), width - 40, int(24 * scale),
                                      analysis["progress"], GREEN if analysis["phase"] == "target" else YELLOW)
                if hold_sec and analysis.get("hold_time", 0) > 0:
                    texts.append(self._centered(f"ค้างไว้ {analysis['hold_time']:.1f} / {hold_sec:.0f} วินาที",
                                                big, height // 3, width, GREEN))
                row = height - int(100 * scale)
                if evaluation and evaluation["live_feedback"]:
                    texts.append((" / ".join(evaluation["live_feedback"]), (20, row), mid, YELLOW))
                elif evaluation and evaluation["live_score"] is not None:
                    texts.append((f"ท่าทางดี ({evaluation['live_score']} คะแนน)", (20, row), mid, GREEN))
                if last_rep and now - last_rep[1] < 4:
                    texts.append((last_rep[0], (20, row + mid + 8), small, last_rep[2]))

            key = self._present(frame, texts)

            # --- เงื่อนไขจบท่า ---
            if key == KEY_N:
                skipped = True
                break
            if start_time is not None:
                if target_reps and analysis["reps"] >= target_reps:
                    break
                if duration and now - start_time >= duration:
                    break

        summary = evaluator.summary()
        return {
            "id": ex["id"], "name": ex["name"], "category": ex["category"],
            "reps_done": analysis["reps"], "target_reps": target_reps,
            "scores": summary["scores"], "average": summary["average"],
            "grade": summary["grade"], "advice": summary["advice"], "skipped": skipped,
        }

    # ------------------------------------------------------------------
    def rest(self, seconds, next_name):
        """ช่วงพักระหว่างท่า"""
        if seconds <= 0:
            return
        start = self.clock()
        while True:
            frame = self.camera.read()
            now = self.clock()
            remain = seconds - (now - start)
            if remain <= 0:
                return
            height, width = frame.shape[:2]
            scale = max(0.6, width / 1280)
            draw_panel(frame, 0, 0, width, height, alpha=0.45)
            texts = [
                self._centered("พักผ่อน", int(60 * scale), height // 5, width, GREEN),
                self._centered(str(int(remain) + 1), int(120 * scale), height // 3, width, WHITE),
                self._centered(f"ท่าถัดไป: {next_name}", int(32 * scale), int(height * 0.7), width, YELLOW),
                self._centered("กด n เพื่อข้ามช่วงพัก", int(24 * scale), int(height * 0.8), width, GRAY),
            ]
            if self._present(frame, texts) == KEY_N:
                return

    def show_summary(self, results):
        """หน้าสรุปผลตอนจบ (ปิดเมื่อกดปุ่มใดก็ได้ หรือครบเวลา)"""
        start = self.clock()
        scored = [r["average"] for r in results if r["average"] is not None]
        overall = round(sum(scored) / len(scored)) if scored else None
        while self.clock() - start < self.summary_sec:
            frame = self.camera.read()
            height, width = frame.shape[:2]
            scale = max(0.6, width / 1280)
            draw_panel(frame, 0, 0, width, height, alpha=0.7)
            texts = [self._centered("สรุปผลการออกกำลังกาย", int(48 * scale), int(30 * scale), width, GREEN)]
            y = int(110 * scale)
            for r in results:
                score_text = f"{r['average']} คะแนน ({r['grade']})" if r["average"] is not None else "ไม่มีคะแนน"
                line = f"{r['name']}   {r['reps_done']}/{r['target_reps'] or '-'} ครั้ง   {score_text}"
                texts.append((line, (int(60 * scale), y), int(28 * scale), WHITE))
                y += int(40 * scale)
                if r["advice"]:
                    texts.append(("ข้อแนะนำ: " + r["advice"][0], (int(90 * scale), y - int(6 * scale)), int(22 * scale), YELLOW))
                    y += int(30 * scale)
            if overall is not None:
                texts.append(self._centered(f"คะแนนรวม {overall} ({evaluator_system.grade_for(overall)})",
                                            int(44 * scale), height - int(130 * scale), width, YELLOW))
            texts.append(self._centered("กดปุ่มใดก็ได้เพื่อออก", int(24 * scale), height - int(60 * scale), width, GRAY))
            if self._present(frame, texts) != -1:
                return

    # ------------------------------------------------------------------
    def run_session(self, exercises):
        """เล่นหลายท่าต่อกัน คืนรายการผลสรุปของแต่ละท่า"""
        results = []
        try:
            for i, ex in enumerate(exercises):
                results.append(self.run_exercise(ex))
                if i < len(exercises) - 1:
                    self.rest(float(ex.get("rest_sec", 0)), exercises[i + 1]["name"])
            self.show_summary(results)
        except SessionAbort:
            print("ออกจากโปรแกรมตามที่ผู้เล่นสั่ง")
        return results


# ----------------------------------------------------------------------
# เมนูเลือกท่า (ในคอนโซล)
# ----------------------------------------------------------------------
def _ask_number(prompt, low, high):
    while True:
        text = input(prompt).strip()
        if text.isdigit() and low <= int(text) <= high:
            return int(text)
        print(f"  กรุณาพิมพ์ตัวเลข {low} ถึง {high}")


def choose_exercises(exercises):
    """เลือกหมวดหมู่ แล้วเลือกท่า (หรือทำทุกท่าในหมวด)"""
    categories = [c for c in VALID_CATEGORIES if any(e["category"] == c for e in exercises)]
    print("\n=== เลือกหมวดหมู่ ===")
    for i, c in enumerate(categories, start=1):
        print(f"  {i}. {c}")
    print("  0. ทำทุกท่า")
    pick = _ask_number("เลือก: ", 0, len(categories))
    if pick == 0:
        return list(exercises)

    in_category = [e for e in exercises if e["category"] == categories[pick - 1]]
    print(f"\n=== {categories[pick - 1]} ===")
    for i, e in enumerate(in_category, start=1):
        amount = f"{e.get('reps')} ครั้ง" if e.get("reps") else f"{e.get('duration_sec')} วินาที"
        print(f"  {i}. {e['name']} ({amount})")
    print("  0. ทำทุกท่าในหมวดนี้")
    pick = _ask_number("เลือก: ", 0, len(in_category))
    return in_category if pick == 0 else [in_category[pick - 1]]


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Move & Relieve AI - ระบบตรวจจับท่าทาง")
    parser.add_argument("--camera", type=int, default=None, help="หมายเลขกล้อง (ไม่ระบุ = ค้นหาและเลือกให้)")
    parser.add_argument("--file", help="พาธไฟล์ exercises.json")
    parser.add_argument("--exercise", help="รหัสท่า เช่น arm_01")
    parser.add_argument("--all", action="store_true", help="ทำทุกท่าต่อกัน")
    parser.add_argument("--no-mirror", action="store_true", help="ไม่กลับภาพซ้าย-ขวา")
    args = parser.parse_args()

    try:
        exercises, warnings, path = load_exercises(args.file)
    except (FileNotFoundError, ValueError) as error:
        print("โหลดข้อมูลท่าบริหารไม่ได้:", error)
        return 1
    for message in warnings:
        print("คำเตือน:", message)
    if not exercises:
        print("ไม่มีท่าบริหารที่ใช้งานได้ในไฟล์", path)
        return 1
    print(f"โหลดท่าบริหาร {len(exercises)} ท่า จาก {path}")

    if args.exercise:
        chosen = [e for e in exercises if e["id"] == args.exercise]
        if not chosen:
            print("ไม่พบท่ารหัส", args.exercise, "รหัสที่มี:", ", ".join(e["id"] for e in exercises))
            return 1
    elif args.all:
        chosen = exercises
    else:
        chosen = choose_exercises(exercises)

    mirror = not args.no_mirror
    try:
        detector = body_system.BodyDetectionSystem(mirrored_input=mirror)
    except body_system.BodyDetectionError as error:
        print("เริ่มระบบตรวจจับร่างกายไม่ได้:", error)
        return 1
    tracker = joint_system.JointTracker()

    camera = camera_system.CameraSystem(mirror=mirror)
    opened = camera.open_index(args.camera) if args.camera is not None else camera.select_camera()
    if not opened:
        detector.close()
        return 1

    music_player = start_default_music()
    try:
        print("เริ่มเล่น! ยืนให้เห็นทั้งตัวในกล้อง (กด n ข้ามท่า, q ออก)")
        WorkoutApp(camera, detector, tracker).run_session(chosen)
    except camera_system.CameraError as error:
        print("เกิดข้อผิดพลาดเกี่ยวกับกล้อง:\n", error)
        return 1
    finally:
        if music_player is not None:
            music_player.mixer.music.stop()
            music_player.mixer.quit()
        detector.close()
        camera.close_camera()
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    sys.exit(main())
