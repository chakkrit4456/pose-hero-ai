"""
exercise_loader.py
==================
โหลดและตรวจสอบข้อมูลท่าบริหารจากไฟล์ exercises.json
ใช้ร่วมกันระหว่าง "ระบบจัดการท่าบริหาร" และ "ระบบ AI ตรวจจับและวิเคราะห์ท่าทาง"

ไฟล์ข้อมูลจะถูกค้นหาตามลำดับนี้:
  1) พาธที่ระบุเอง (--file)
  2) ../2.Exercise Management System (Additional)/data/exercises.json
  3) exercises.json ในโฟลเดอร์นี้                  (ไฟล์ตัวอย่าง 5 ท่า)

ท่าที่ข้อมูลไม่ถูกต้องจะถูกข้ามพร้อมแจ้งเหตุผล แทนที่จะทำให้โปรแกรมล้มทั้งระบบ
"""

import json
from pathlib import Path

from system_loader import BASE_DIR, load_system

VALID_CATEGORIES = ["แขนและไหล่", "ลำตัวและเอว", "ขาและสะโพก", "การยืดเหยียดร่างกาย"]

_body = load_system("1.2")
_joint = load_system("1.3")
REAL_JOINTS = set(_body.LANDMARK_NAMES)
VIRTUAL_JOINTS = set(_joint.VIRTUAL_JOINTS)
VALID_JOINTS = REAL_JOINTS | VIRTUAL_JOINTS


def find_exercises_file(custom_path=None):
    """คืนพาธไฟล์ข้อมูลท่าบริหารตามลำดับความสำคัญ"""
    candidates = []
    if custom_path:
        candidates.append(Path(custom_path))
    candidates.append(BASE_DIR.parent / "2.Exercise Management System (Additional)" / "data" / "exercises.json")
    candidates.append(BASE_DIR / "exercises.json")
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError("ไม่พบไฟล์ exercises.json ที่ใดเลย ลองระบุพาธด้วย --file")


def _real_joints_of(names):
    """แปลงรายชื่อข้อต่อ (รวมข้อต่อเสมือน) เป็นรายชื่อข้อต่อจริงที่กล้องต้องเห็น"""
    real = []
    for name in names:
        sources = _joint.VIRTUAL_SOURCES.get(name)
        real.extend(sources if sources else [name])
    return list(dict.fromkeys(real))


def required_joints(exercise):
    """ข้อต่อจริงที่ท่านี้ต้องการให้กล้องมองเห็น"""
    declared = exercise.get("tracked_joints")
    if declared:
        return _real_joints_of(declared)
    used = [j for triple in exercise["angles"].values() for j in triple]
    return _real_joints_of(used)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_exercise(ex):
    """ตรวจข้อมูลท่าบริหาร 1 ท่า คืนรายการข้อผิดพลาด (ว่าง = ใช้ได้)"""
    errors = []
    if not isinstance(ex, dict):
        return ["ข้อมูลท่าต้องเป็นออบเจ็กต์ { ... }"]

    for key in ("id", "name", "category", "angles", "counter"):
        if key not in ex:
            errors.append(f"ขาดข้อมูล '{key}'")
    if errors:
        return errors

    if not str(ex["name"]).strip():
        errors.append("ชื่อท่าว่างเปล่า")
    if ex["category"] not in VALID_CATEGORIES:
        errors.append(f"หมวดหมู่ '{ex['category']}' ไม่ถูกต้อง ต้องเป็นหนึ่งใน {VALID_CATEGORIES}")

    # --- มุมที่ใช้คำนวณ ---
    angles = ex["angles"]
    if not isinstance(angles, dict) or not angles:
        return errors + ["'angles' ต้องเป็นพจนานุกรมที่มีอย่างน้อย 1 มุม"]
    for name, triple in angles.items():
        if not (isinstance(triple, list) and len(triple) == 3):
            errors.append(f"มุม '{name}' ต้องระบุข้อต่อ 3 จุด [จุดแรก, จุดมุม, จุดสุดท้าย]")
            continue
        for joint in triple:
            if joint not in VALID_JOINTS:
                errors.append(f"มุม '{name}' ใช้ชื่อข้อต่อที่ไม่รู้จัก: '{joint}'")

    # --- ข้อต่อที่ต้องตรวจจับ ---
    tracked = ex.get("tracked_joints")
    if tracked is not None:
        bad = [j for j in tracked if j not in VALID_JOINTS]
        if bad:
            errors.append(f"tracked_joints มีชื่อที่ไม่รู้จัก: {bad}")
        elif not errors:
            used = set(_real_joints_of([j for t in angles.values() for j in t]))
            uncovered = used - set(_real_joints_of(tracked))
            if uncovered:
                errors.append(f"tracked_joints ไม่ครอบคลุมข้อต่อที่ใช้คำนวณมุม: {sorted(uncovered)}")

    # --- ตัวนับครั้ง ---
    counter = ex["counter"]
    if not isinstance(counter, dict):
        errors.append("'counter' ต้องเป็นออบเจ็กต์")
    else:
        mode = counter.get("mode", "reps")
        if mode not in ("reps", "hold"):
            errors.append("counter.mode ต้องเป็น 'reps' หรือ 'hold'")
        names = counter.get("angle")
        names = [names] if isinstance(names, str) else names
        if not names or any(n not in angles for n in names):
            errors.append("counter.angle ต้องอ้างถึงมุมที่มีอยู่ใน 'angles'")
        for key in ("start_angle", "target_angle"):
            if not _is_number(counter.get(key)):
                errors.append(f"counter.{key} ต้องเป็นตัวเลข")
        if _is_number(counter.get("start_angle")) and counter.get("start_angle") == counter.get("target_angle"):
            errors.append("start_angle กับ target_angle ต้องไม่เท่ากัน")
        if mode == "hold" and not (_is_number(counter.get("hold_sec")) and counter["hold_sec"] > 0):
            errors.append("โหมด hold ต้องกำหนด hold_sec มากกว่า 0")

    # --- เกณฑ์ประเมิน ---
    for i, criterion in enumerate(ex.get("criteria", []), start=1):
        if criterion.get("angle") not in angles:
            errors.append(f"เกณฑ์ข้อ {i} อ้างถึงมุมที่ไม่มีใน 'angles'")
        if criterion.get("when", "always") not in ("always", "target"):
            errors.append(f"เกณฑ์ข้อ {i}: when ต้องเป็น 'always' หรือ 'target'")
        if "min" not in criterion and "max" not in criterion:
            errors.append(f"เกณฑ์ข้อ {i} ต้องมี min หรือ max อย่างน้อยหนึ่งค่า")
        for key in ("min", "max", "margin"):
            if key in criterion and not _is_number(criterion[key]):
                errors.append(f"เกณฑ์ข้อ {i}: {key} ต้องเป็นตัวเลข")
        if _is_number(criterion.get("min")) and _is_number(criterion.get("max")) and criterion["min"] > criterion["max"]:
            errors.append(f"เกณฑ์ข้อ {i}: min ต้องไม่มากกว่า max")

    # --- จำนวนครั้ง / เวลา / เวลาพัก ---
    for key in ("reps", "duration_sec", "rest_sec"):
        value = ex.get(key, 0)
        if not _is_number(value) or value < 0:
            errors.append(f"{key} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป")
    if _is_number(ex.get("reps", 0)) and _is_number(ex.get("duration_sec", 0)):
        if ex.get("reps", 0) <= 0 and ex.get("duration_sec", 0) <= 0:
            errors.append("ต้องกำหนด reps หรือ duration_sec อย่างน้อยหนึ่งอย่าง")
    return errors


def load_exercises(custom_path=None):
    """
    โหลดท่าบริหารทั้งหมด
    คืนค่า (รายการท่าที่ใช้ได้, รายการข้อความเตือน, พาธไฟล์ที่ใช้)
    """
    path = find_exercises_file(custom_path)
    warnings = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"ไฟล์ {path} อ่านไม่ได้ (รูปแบบ JSON ผิด): {error}")

    items = data.get("exercises") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError(f"ไฟล์ {path} ต้องมีรายการ \"exercises\"")

    valid, seen_ids = [], set()
    for index, ex in enumerate(items, start=1):
        label = ex.get("name", f"ท่าที่ {index}") if isinstance(ex, dict) else f"ท่าที่ {index}"
        errors = validate_exercise(ex)
        if not errors and ex["id"] in seen_ids:
            errors.append(f"id '{ex['id']}' ซ้ำกับท่าอื่น")
        if errors:
            warnings.append(f"ข้ามท่า '{label}': " + "; ".join(errors))
            continue
        seen_ids.add(ex["id"])
        valid.append(ex)
    return valid, warnings, path
