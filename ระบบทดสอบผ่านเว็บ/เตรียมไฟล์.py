# -*- coding: utf-8 -*-
"""
เตรียมไฟล์.py - เตรียมข้อมูลให้หน้าเว็บ (เปิดแบบดับเบิลคลิก index.html ได้โดยไม่ต้องมีเซิร์ฟเวอร์)

เบราว์เซอร์ไม่ยอมให้หน้าเว็บที่เปิดจากไฟล์ (file://) อ่านไฟล์อื่นในเครื่องเอง จึงต้องแปลงเป็นไฟล์ .js ที่หน้าเว็บโหลดได้:
  1) ท่าจากระบบ 2  (data\\poses.json)           ->  data\\poses-data.js
  2) models\\pose_landmarker_lite.task (โมเดลตัวเดียวที่ใช้) ->  vendor\\model-data.js   (ใช้กล้องได้ทั้งออนไลน์/ออฟไลน์)

ใช้:   py เตรียมไฟล์.py              ทำทั้งสองอย่าง
       py เตรียมไฟล์.py --poses-only ส่งออกเฉพาะข้อมูลท่า (เร็ว ใช้ทุกครั้งที่แก้ท่า)
ไม่แก้ไฟล์ของระบบ 1 / 2 (อ่านอย่างเดียว)
"""
import argparse
import base64
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("MR_ROOT") or os.path.dirname(HERE)
SYS1 = os.environ.get("MR_SYS1_DIR") or os.path.join(ROOT, "1.ระบบ AI ตรวจจับและวิเคราะห์ท่าทาง")
SYS2 = os.environ.get("MR_SYS2_DIR") or os.path.join(ROOT, "2.ระบบจัดการท่าบริหารร่างกาย")
SRC = os.path.join(HERE, "data", "src")   # ชุดท่ามาตรฐานของระบบทดสอบ (10 ท่าตามบทความ รพ.เปาโล เกษตร)
POSES_ARTICLE = os.path.join(SRC, "poses.json")
POSES_IN = os.environ.get("MR_SYS2_POSES") or os.path.join(SYS2, "data", "poses.json")
POSES_OUT = os.path.join(HERE, "data", "poses-data.js")
EXERCISES_ARTICLE = os.path.join(SRC, "exercises.json")
EXERCISES_IN = [os.environ.get("MR_EXERCISES"),
                os.path.join(SYS2, "data", "exercises.json"),   # ลำดับเดียวกับ exercise_loader.find_exercises_file
                os.path.join(SYS1, "exercises.json")]
EXERCISES_OUT = os.path.join(HERE, "data", "exercises-data.js")
MODEL_OUT = os.path.join(HERE, "vendor", "model-data.js")
MODEL_NAME = "pose_landmarker_lite.task"


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def export_exercises(src=None):
    """ส่งออกท่าของระบบ 1 (exercises.json) ให้หน้าเว็บ  ไม่แก้ไฟล์ต้นฉบับ"""
    path = src or next((p for p in EXERCISES_IN if p and os.path.isfile(p)), None)
    if not path:
        print("ไม่พบ exercises.json ของระบบ 1 ที่:", SYS1)
        return False
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("exercises") if isinstance(data, dict) else data
        if not isinstance(items, list) or not items:
            raise ValueError("ไม่มีรายการ exercises")
    except (OSError, ValueError) as e:
        print("ส่งออกท่าระบบ 1 ไม่ได้:", path, "->", e)
        return False
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    label = data.get("source") if isinstance(data, dict) and data.get("source") else f"ระบบ 1 ({os.path.basename(path)})"
    out = {"source": f"{label} ส่งออกเมื่อ {stamp}", "exercises": items}
    write_text(EXERCISES_OUT, "window.MR_EXERCISES_DATA=" + json.dumps(out, ensure_ascii=False) + ";\n")
    print(f"ส่งออกท่าจากระบบ 1 แล้ว {len(items)} ท่า จาก {path} -> {EXERCISES_OUT}")
    return True


def export_poses(src=POSES_IN):
    try:
        with open(src, encoding="utf-8") as f:
            poses = json.load(f)["poses"]
        if not isinstance(poses, list) or not poses:
            raise ValueError("ไม่มีท่าในไฟล์")
    except (OSError, ValueError, KeyError) as e:
        print("ส่งออกท่าไม่ได้:", src, "->", e)
        print("  เปิดระบบ 2 (run.bat) หนึ่งครั้งเพื่อสร้าง data\\poses.json  หรือใช้ท่าตัวอย่างที่มากับหน้าเว็บ")
        return False
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(src, encoding="utf-8") as f:
        meta = json.load(f)
    label = meta.get("source") if isinstance(meta, dict) and meta.get("source") else "ระบบ 2 (poses.json)"
    data = {"source": f"{label} ส่งออกเมื่อ {stamp}", "origin": meta.get("origin", "") if isinstance(meta, dict) else "", "poses": poses}
    write_text(POSES_OUT, "window.MR_POSES_DATA=" + json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"ส่งออกท่าจากระบบ 2 แล้ว {len(poses)} ท่า -> {POSES_OUT}")
    return True


def embed_model():
    """ฝังโมเดล models\\pose_landmarker_lite.task (ตัวเดียวที่ระบบนี้ใช้) ลงใน vendor\\model-data.js"""
    path = os.path.join(HERE, "models", MODEL_NAME)
    if not (os.path.isfile(path) and os.path.getsize(path) > 0):
        print("ไม่พบไฟล์โมเดล:", path)
        print("  วางไฟล์ pose_landmarker_lite.task ไว้ในโฟลเดอร์ models ข้างไฟล์นี้ แล้วรันใหม่")
        return False
    with open(path, "rb") as f:
        raw = f.read()
    import io, zipfile
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        print("ไฟล์โมเดลไม่ถูกต้อง (ต้องเป็นไฟล์ .task ของ MediaPipe):", path)
        return False
    write_text(MODEL_OUT, 'window.MR_MODEL_B64="' + base64.b64encode(raw).decode() + '";\n')
    print(f"ฝังโมเดล {len(raw) / 1e6:.1f} MB จาก {path} -> {MODEL_OUT}")
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description="เตรียมไฟล์ให้หน้าเว็บทดสอบ")
    ap.add_argument("--poses-only", action="store_true", help="ส่งออกเฉพาะข้อมูลท่า (ระบบ 1 + ระบบ 2) ไม่ฝังโมเดล")
    ap.add_argument("--poses", default=POSES_IN, help="poses.json ของระบบ 2 (ใช้คู่กับ --from-systems)")
    ap.add_argument("--from-systems", action="store_true", help="ส่งออกจาก exercises.json ของระบบ 1 และ poses.json ของระบบ 2 แทนชุดท่าตามบทความ")
    args = ap.parse_args(argv)
    for s in (sys.stdout, sys.stderr):
        if hasattr(s, "reconfigure"):
            s.reconfigure(encoding="utf-8", errors="replace")
    if args.from_systems:  # ใช้ไฟล์จริงของระบบ 1 / ระบบ 2 แทนชุดท่าตามบทความ
        ok = export_exercises()
        ok = export_poses(args.poses) and ok
    else:
        ok = export_exercises(EXERCISES_ARTICLE)
        ok = export_poses(POSES_ARTICLE) and ok
    if not args.poses_only:
        ok = embed_model() and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
