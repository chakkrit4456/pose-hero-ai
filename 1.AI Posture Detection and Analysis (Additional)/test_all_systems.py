"""
test_all_systems.py
===================
ทดสอบว่าทุกระบบ (1.1 - 1.5 + main) ทำงานร่วมกันได้ โดยไม่ต้องใช้กล้องจริง

วิธีทำงาน: จำลอง "คนที่ขยับท่าบริหาร" ด้วยตำแหน่งข้อต่อสังเคราะห์ ส่งเข้าสายงานเดียวกับของจริง
    ตัวจำลองกล้อง -> 1.2 -> 1.3 -> 1.4 -> 1.5 -> main.WorkoutApp
(ตัวที่ถูกจำลองมีแค่กล้องและโมเดล MediaPipe ส่วนที่เหลือเป็นโค้ดจริงทั้งหมด)

วิธีรัน:  python test_all_systems.py
"""

import copy
import math
import sys

import numpy as np

from exercise_loader import load_exercises, required_joints
from system_loader import load_system

camera_system = load_system("1.1")
body_system = load_system("1.2")
joint_system = load_system("1.3")
analyzer_system = load_system("1.4")
evaluator_system = load_system("1.5")
import main as main_module  # noqa: E402

W, H = 1280, 720
FPS = 30
passed = 0


def check(condition, text):
    """บันทึกผลการทดสอบ ถ้าไม่ผ่านให้หยุดทันทีพร้อมบอกข้อที่ผิด"""
    global passed
    if not condition:
        print("ไม่ผ่าน:", text)
        sys.exit(1)
    passed += 1
    print("  ผ่าน:", text)


# ----------------------------------------------------------------------
# ตัวสร้างท่าทางสังเคราะห์ (หน่วยพิกเซล แล้วแปลงเป็นสัดส่วน 0-1)
# ----------------------------------------------------------------------
def rotate(vec, degrees):
    r = math.radians(degrees)
    return (vec[0] * math.cos(r) - vec[1] * math.sin(r), vec[0] * math.sin(r) + vec[1] * math.cos(r))


def build_pose(shoulder=15.0, elbow=175.0, knee=175.0, tilt=0.0, hidden=()):
    """สร้างตำแหน่ง 33 จุด: shoulder=มุมยกแขน, elbow=มุมศอก, knee=มุมเข่า, tilt=เอียงลำตัว(องศา)"""
    k = 0.75  # ย่อสัดส่วนคนจำลอง ให้ยกแขนเหนือศีรษะแล้วยังอยู่ในกรอบภาพ
    hip_c = (640.0, 370.0)
    t = math.radians(tilt)
    up, right = (math.sin(t), -math.cos(t)), (math.cos(t), math.sin(t))
    mid_sh = (hip_c[0] + 170 * k * up[0], hip_c[1] + 170 * k * up[1])
    pts = {"nose": (mid_sh[0] + 60 * k * up[0], mid_sh[1] + 60 * k * up[1])}

    for side, s in (("left", -1), ("right", 1)):
        sh = (mid_sh[0] + s * 80 * k * right[0], mid_sh[1] + s * 80 * k * right[1])
        hip = (640 + s * 80 * k, hip_c[1])
        d = (s * math.sin(math.radians(shoulder)), math.cos(math.radians(shoulder)))
        el = (sh[0] + 120 * k * d[0], sh[1] + 120 * k * d[1])
        w_dir = rotate(d, s * (180 - elbow))
        wr = (el[0] + 110 * k * w_dir[0], el[1] + 110 * k * w_dir[1])
        base = 2 * 130 * k * math.sin(math.radians(knee) / 2)
        ankle = (hip[0], hip[1] + base)
        kn = (hip[0] + s * 130 * k * math.cos(math.radians(knee) / 2), hip[1] + base / 2)
        pts.update({f"{side}_shoulder": sh, f"{side}_elbow": el, f"{side}_wrist": wr,
                    f"{side}_hip": hip, f"{side}_knee": kn, f"{side}_ankle": ankle})

    landmarks = []
    for name in body_system.LANDMARK_NAMES:
        x, y = pts.get(name, pts["nose"])
        visibility = 0.1 if name in hidden else 0.99
        landmarks.append((x / W, y / H, 0.0, visibility))
    return landmarks


def params_for(ex_id, phi, form="good"):
    """phi 0 = ท่าเริ่มต้น, 1 = ท่าเป้าหมาย; form='bad' = จำลองท่าผิด"""
    if ex_id == "arm_01":
        return dict(shoulder=15 + phi * 75, elbow=175 if form == "good" else 120)
    if ex_id == "arm_02":
        return dict(shoulder=10 if form == "good" else 60, elbow=165 + phi * (50 - 165))
    if ex_id == "torso_01":
        return dict(tilt=phi * 20, knee=175 if form == "good" else 120)
    if ex_id == "leg_01":
        depth = {"good": 100, "bad": 60, "shallow": 150}[form]  # bad = ย่อลึกเกินไป, shallow = ย่อตื้นเกินไป
        return dict(knee=170 + phi * (depth - 170))
    if ex_id == "stretch_01":
        return dict(shoulder=20 + phi * 145, elbow=175 if form == "good" else 110)
    raise KeyError(ex_id)


def phi_sequence(peak_hold_frames):
    """ลำดับความคืบหน้าของ 1 รอบ: นิ่งที่เริ่ม -> ขึ้น -> ค้างที่เป้าหมาย -> ลง"""
    seq = [0.0] * 10
    seq += [i / 15 for i in range(1, 16)]
    seq += [1.0] * peak_hold_frames
    seq += [1 - i / 15 for i in range(1, 16)]
    return seq


class FakeBackend:
    """แทน MediaPipe: คืนตำแหน่งข้อต่อที่ตั้งไว้"""
    def __init__(self):
        self.landmarks = None
    def process(self, rgb):
        return self.landmarks
    def close(self):
        pass


class Clock:
    def __init__(self):
        self.t = 1000.0
    def __call__(self):
        return self.t


# ----------------------------------------------------------------------
def run_pipeline(ex, reps, form="good"):
    """ส่งท่าสังเคราะห์ผ่าน 1.2 -> 1.3 -> 1.4 -> 1.5 ทีละเฟรม คืนผลเฟรมสุดท้ายและผลสรุป"""
    backend = FakeBackend()
    detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
    tracker = joint_system.JointTracker()
    analyzer = analyzer_system.PoseAnalyzer(ex)
    evaluator = evaluator_system.PoseEvaluator(ex)
    required = required_joints(ex)
    hold = int(ex["counter"].get("hold_sec", 0) * FPS) + 30
    frame = np.zeros((H, W, 3), dtype=np.uint8)

    now, completed, feedback = 0.0, 0, []
    seq = [0.0] * 20 + phi_sequence(hold if ex["counter"].get("mode") == "hold" else 8) * (reps + 1)
    for phi in seq:
        backend.landmarks = build_pose(**params_for(ex["id"], phi, form))
        body = detector.detect(frame, required)
        joints = tracker.update(body, frame.shape)
        analysis = analyzer.analyze(joints, now)
        evaluation = evaluator.evaluate(analysis)
        if evaluation["rep_completed"]:
            completed += 1
            feedback.extend(evaluation["rep_feedback"])
        now += 1 / FPS
        if completed >= reps:
            break
    return completed, evaluator.summary(), feedback


def test_data_and_math():
    print("\n[1] ข้อมูลท่าบริหารและการคำนวณพื้นฐาน")
    exercises, warnings, _ = load_exercises()
    check(len(exercises) == 5 and not warnings, "โหลดท่าบริหารตัวอย่างได้ครบ 5 ท่า ผ่านการตรวจสอบทั้งหมด")
    check(abs(analyzer_system.calculate_angle((0, 1), (0, 0), (1, 0)) - 90) < 1e-6, "คำนวณมุม 90 องศาถูกต้อง")
    check(analyzer_system.calculate_angle((0, 0), (0, 0), (1, 0)) is None, "จุดซ้อนกัน คืน None ไม่ล้ม")

    broken = copy.deepcopy(exercises[0])
    broken["counter"]["angle"] = "angle_that_does_not_exist"
    broken["category"] = "หมวดที่ไม่มี"
    from exercise_loader import validate_exercise
    errors = validate_exercise(broken)
    check(len(errors) >= 2, "ข้อมูลท่าที่ผิดถูกตรวจพบ (" + str(len(errors)) + " ข้อผิดพลาด)")
    return exercises


def test_camera_and_mirror():
    print("\n[2] ระบบ 1.1 กล้อง และการกลับซ้าย-ขวา (1.2)")
    cam = camera_system.CameraSystem()
    try:
        cam.read()
        check(False, "อ่านภาพก่อนเปิดกล้องควรแจ้งข้อผิดพลาด")
    except camera_system.CameraError:
        check(True, "อ่านภาพก่อนเปิดกล้อง -> แจ้ง CameraError ไม่ล้มแบบงง ๆ")
    check(cam.get_frame() is None, "get_frame() ก่อนเปิดกล้องคืน None")
    check(cam.open_index(-1) is False, "หมายเลขกล้องที่ไม่ถูกต้อง ถูกปฏิเสธ")
    check(cam.open_index(98) is False, "ไม่พบกล้อง -> open_index คืน False พร้อมคำแนะนำภาษาไทย")
    cam.close_camera()

    backend = FakeBackend()
    backend.landmarks = build_pose()
    frame = np.zeros((H, W, 3), dtype=np.uint8)
    raw_x = backend.landmarks[11][0]
    body = body_system.BodyDetectionSystem(backend=backend, mirrored_input=True).detect(frame)
    check(abs(body["landmarks"]["left_shoulder"][0] - (1 - raw_x)) < 1e-9, "โหมดกระจก: กลับค่า x ให้ตรงกับภาพบนจอ")


def test_visibility_messages():
    print("\n[3] ระบบ 1.2 แจ้งผู้เล่นเมื่อมองไม่เห็นตัว")
    backend = FakeBackend()
    detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
    frame = np.zeros((H, W, 3), dtype=np.uint8)

    backend.landmarks = None
    check(not detector.detect(frame)["detected"], "ไม่มีคนในภาพ -> detected = False")

    backend.landmarks = build_pose(hidden=("left_ankle", "right_ankle"))
    result = detector.detect(frame, ["left_ankle", "left_hip"])
    check(result["detected"] and not result["in_frame"] and "ถอยห่าง" in result["message"],
          "มองไม่เห็นข้อเท้า -> แนะนำให้ถอยห่างกล้อง")

    backend.landmarks = build_pose(hidden=("left_wrist",))
    result = detector.detect(frame, ["left_wrist"])
    check("ข้อมือซ้าย" in result["message"], "มองไม่เห็นข้อมือ -> บอกชื่อข้อต่อเป็นภาษาไทย")

    # ซ่อนศอกซ้าย ซึ่งเป็นข้อต่อที่ใช้คำนวณมุมไหล่ที่ใช้นับครั้ง
    backend.landmarks = build_pose(hidden=("left_elbow",))
    result = detector.detect(frame, ["left_elbow"])
    tracker = joint_system.JointTracker()
    analyzer = analyzer_system.PoseAnalyzer(load_exercises()[0][0])
    analysis = analyzer.analyze(tracker.update(result, frame.shape), 0.0)
    check(not analysis["valid"], "ข้อต่อหายไป -> 1.4 ไม่คำนวณมุมมั่ว (valid = False)")


def test_all_exercises(exercises):
    print("\n[4] สายงาน 1.2 -> 1.3 -> 1.4 -> 1.5 ทุกท่า (ท่าถูก / ท่าผิด)")
    for ex in exercises:
        reps = 2
        completed, summary, _ = run_pipeline(ex, reps, "good")
        check(completed == reps, f"{ex['name']}: นับครบ {reps} ครั้ง")
        check(summary["average"] is not None and summary["average"] >= 90,
              f"{ex['name']}: ท่าถูกต้องได้คะแนนสูง ({summary['average']})")

        _, bad_summary, feedback = run_pipeline(ex, reps, "bad")
        check(bad_summary["average"] is not None and bad_summary["average"] <= 75 and feedback,
              f"{ex['name']}: ท่าผิดได้คะแนนต่ำ ({bad_summary['average']}) พร้อมคำแนะนำ: {feedback[0] if feedback else '-'}")


def test_not_counting_early():
    print("\n[5] ไม่นับครั้งผิดพลาด")
    squat = [e for e in load_exercises()[0] if e["id"] == "leg_01"][0]
    completed, _, _ = run_pipeline(squat, 2, "shallow")
    check(completed == 0, "ย่อเข่าตื้นเกินไป ไม่ถึงเป้าหมาย -> ไม่นับเป็นครั้ง")
    ex = load_exercises()[0][0]
    backend = FakeBackend()
    detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
    tracker, analyzer = joint_system.JointTracker(), analyzer_system.PoseAnalyzer(ex)
    frame = np.zeros((H, W, 3), dtype=np.uint8)
    for i in range(60):  # ยกแขนค้างตั้งแต่เริ่ม ไม่เคยอยู่ท่าเริ่มต้น
        backend.landmarks = build_pose(shoulder=90)
        analysis = analyzer.analyze(tracker.update(detector.detect(frame, required_joints(ex)), frame.shape), i / FPS)
    check(analysis["reps"] == 0, "ยกแขนค้างตั้งแต่ต้น ไม่นับเป็นครั้ง")


# ----------------------------------------------------------------------
class FakeCamera:
    """กล้องจำลอง: ทุกครั้งที่อ่านภาพ เวลาเดินไป 1 เฟรม และผู้เล่นขยับต่อตามท่าที่กำลังเล่น"""
    mirror = False

    def __init__(self, backend, clock, app_ref, form="good"):
        self.backend, self.clock, self.app_ref, self.form = backend, clock, app_ref, form
        self.index, self.current_id, self.reads = 0, None, 0

    def read(self):
        self.reads += 1
        if self.reads > 6000:
            raise camera_system.CameraError("ทดสอบวนไม่จบ")
        self.clock.t += 1 / FPS
        ex = self.app_ref["app"].current
        if ex is not None:
            if ex["id"] != self.current_id:
                self.current_id, self.index = ex["id"], 0
                hold = int(ex["counter"].get("hold_sec", 0) * FPS) + 30
                self.seq = phi_sequence(hold if ex["counter"].get("mode") == "hold" else 8)
            phi = self.seq[self.index % len(self.seq)]
            self.index += 1
            self.backend.landmarks = build_pose(**params_for(ex["id"], phi, self.form))
        else:
            self.backend.landmarks = build_pose()
        return np.zeros((H, W, 3), dtype=np.uint8)


def test_full_app(exercises):
    print("\n[6] main.WorkoutApp ทั้งโปรแกรม (นับถอยหลัง -> ทำท่า -> พัก -> สรุปผล)")
    chosen = [copy.deepcopy(exercises[0]), copy.deepcopy(exercises[4])]
    chosen[0]["reps"], chosen[0]["rest_sec"] = 2, 3
    chosen[1]["reps"], chosen[1]["counter"]["hold_sec"] = 1, 2

    backend, clock, ref = FakeBackend(), Clock(), {}
    detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
    shown = {"frames": 0, "last": None}

    def fake_show(frame):
        shown["frames"] += 1
        shown["last"] = frame
        return -1

    app = main_module.WorkoutApp(FakeCamera(backend, clock, ref), detector, joint_system.JointTracker(),
                                 show=fake_show, clock=clock, summary_sec=2)
    ref["app"] = app
    results = app.run_session(chosen)

    check(len(results) == 2, "เล่นครบ 2 ท่าติดต่อกัน")
    check(results[0]["reps_done"] == 2 and results[0]["average"] >= 90, f"ท่า '{results[0]['name']}' ได้ {results[0]['reps_done']} ครั้ง {results[0]['average']} คะแนน")
    check(results[1]["reps_done"] == 1 and results[1]["average"] >= 90, f"ท่า '{results[1]['name']}' (ค้างท่า) ได้ {results[1]['reps_done']} ครั้ง {results[1]['average']} คะแนน")
    check(shown["frames"] > 100 and shown["last"].shape == (H, W, 3), f"แสดงผลบนหน้าจอแล้ว {shown['frames']} เฟรม")
    return app, shown


def test_abort_and_skip(exercises):
    print("\n[7] ปุ่มข้ามท่า และปุ่มออก")
    ex = copy.deepcopy(exercises[0])
    for key, expect in ((main_module.KEY_N, "skip"), (main_module.KEY_Q, "abort")):
        backend, clock, ref = FakeBackend(), Clock(), {}
        detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
        app = main_module.WorkoutApp(FakeCamera(backend, clock, ref), detector, joint_system.JointTracker(),
                                     show=lambda frame, k=key: k, clock=clock)
        ref["app"] = app
        results = app.run_session([ex])
        if expect == "skip":
            check(results and results[0]["skipped"], "กด n ข้ามท่าได้")
        else:
            check(results == [], "กด q ออกจากโปรแกรมได้อย่างปลอดภัย")


class FakeCameraSystem:
    """จำลอง CameraSystem ของระบบ 1.1 (มีแค่ get_frame และ mirror)"""
    def __init__(self, max_frames=20):
        self.mirror, self.count, self.max_frames = False, 0, max_frames
    def get_frame(self):
        self.count += 1
        return np.zeros((H, W, 3), dtype=np.uint8) if self.count <= self.max_frames else None


def test_system_1_1_with_1_2():
    print("\n[8] ระบบ 1.1 (CameraSystem) ทำงานร่วมกับ 1.2 (BodyDetectionSystem).run()")
    import cv2
    shown = []
    saved = (cv2.namedWindow, cv2.imshow, cv2.waitKey, cv2.destroyWindow)
    cv2.namedWindow = lambda *a, **k: None
    cv2.imshow = lambda name, img: shown.append(img.copy())
    cv2.waitKey = lambda ms: -1
    cv2.destroyWindow = lambda name: None
    try:
        backend = FakeBackend()
        backend.landmarks = build_pose(shoulder=90)
        system = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
        camera = FakeCameraSystem(max_frames=20)
        system.run(camera)  # วนจนกล้องไม่ส่งภาพ แล้วปิดตัวเองอย่างเรียบร้อย
    finally:
        cv2.namedWindow, cv2.imshow, cv2.waitKey, cv2.destroyWindow = saved

    check(len(shown) == 20, f"run() รับภาพจาก get_frame() ของกล้องและแสดงผลครบ {len(shown)} เฟรม")
    check(shown[-1].any(), "วาดโครงกระดูกและสถานะลงบนภาพแล้ว")
    check(system.closed, "ปิดระบบตรวจจับเรียบร้อยเมื่อกล้องหยุดส่งภาพ")
    cv2.imwrite("test_skeleton_preview.png", shown[-1])

    # ข้อมูลที่ระบบ 1.2 วาด ต้องเป็นชุดเดียวกับที่ส่งต่อให้ 1.3
    backend.landmarks = build_pose(shoulder=90)
    detector = body_system.BodyDetectionSystem(backend=backend, mirrored_input=False)
    body = detector.detect(np.zeros((H, W, 3), dtype=np.uint8))
    joints = joint_system.JointTracker().update(body, (H, W, 3))
    check(body["detected"] and "left_shoulder" in joints, "ผลจาก 1.2 ส่งต่อให้ 1.3 ได้ตรง ๆ")

    # presence ของ MediaPipe รุ่นเก่าเป็น 0 เสมอ ต้องไม่ทำให้ข้อต่อหายหมด
    class Lm:  # ข้อต่อในรูปแบบของ MediaPipe รุ่นเก่า
        x, y, z, visibility, presence = 0.5, 0.5, 0.0, 0.9, 0.0
    legacy = body_system.MediaPipeBackend._to_tuple(Lm, use_presence=False)
    check(legacy[3] == 0.9, "MediaPipe รุ่นเก่า: ไม่นำ presence=0 มาตัดข้อต่อทิ้ง")
    modern = body_system.MediaPipeBackend._to_tuple(Lm, use_presence=True)
    check(modern[3] == 0.0, "MediaPipe รุ่นใหม่: นำ presence มารวมกับความมั่นใจ")


if __name__ == "__main__":
    exercises = test_data_and_math()
    test_camera_and_mirror()
    test_visibility_messages()
    test_all_exercises(exercises)
    test_not_counting_early()
    app, shown = test_full_app(exercises)
    test_abort_and_skip(exercises)
    test_system_1_1_with_1_2()

    try:
        import cv2
        cv2.imwrite("test_preview.png", shown["last"])
    except Exception:
        pass
    print(f"\nผ่านทั้งหมด {passed} รายการ: ทุกระบบทำงานร่วมกันได้")
