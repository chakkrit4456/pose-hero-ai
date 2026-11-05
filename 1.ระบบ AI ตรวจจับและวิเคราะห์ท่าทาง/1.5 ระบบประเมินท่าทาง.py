"""
1.5 ระบบประเมินท่าทาง.py
========================
ระบบ 1.5 : ประเมินท่าทาง

รับ  : ผลวิเคราะห์จากระบบ 1.4 + เกณฑ์ประเมิน (criteria) ของท่านั้นใน exercises.json
ส่ง  : ผลประเมิน (dict)
         live_score     - คะแนนท่าทางขณะนี้ 0-100 (None ถ้ายังประเมินไม่ได้)
         live_feedback  - คำแนะนำสด ๆ ให้ผู้เล่นปรับท่า (ข้อความภาษาไทย)
         rep_completed  - เฟรมนี้เพิ่งครบ 1 ครั้งหรือไม่
         rep_score      - คะแนนของครั้งที่เพิ่งทำเสร็จ 0-100
         rep_feedback   - ข้อที่ควรปรับของครั้งนั้น
         rep_grade      - ระดับ เช่น "ยอดเยี่ยม"
         rep_scores     - คะแนนทุกครั้งที่ผ่านมา
         average_score  - คะแนนเฉลี่ยทั้งหมด

รูปแบบเกณฑ์ (criteria) แต่ละข้อ:
  {"angle": "left_elbow", "min": 150, "max": 180, "when": "always" หรือ "target",
   "feedback": "...", "feedback_low": "...(มุมน้อยกว่า min)", "feedback_high": "...(มุมมากกว่า max)"}
  when = "target" : ตรวจตอนทำท่าได้สูงสุดของแต่ละครั้ง
  when = "always" : ตรวจต่อเนื่องตลอดการทำท่า (โหมดค้างท่า ตรวจเฉพาะช่วงค้าง)

การให้คะแนนแต่ละข้อ: อยู่ในช่วง min-max = เต็ม ถ้าเกินช่วงจะลดลงเป็นเส้นตรง
จนเป็น 0 เมื่อพลาดไป margin องศา (ค่าเริ่มต้น 30)
"""

from collections import Counter


def grade_for(score):
    if score >= 85:
        return "ยอดเยี่ยม"
    if score >= 70:
        return "ดี"
    if score >= 50:
        return "พอใช้"
    return "ต้องปรับปรุง"


class PoseEvaluator:
    """ประเมินท่าทางของผู้เล่นสำหรับท่าบริหาร 1 ท่า"""

    def __init__(self, exercise, pass_threshold=0.7):
        self.criteria = exercise.get("criteria", [])
        self.mode = exercise["counter"].get("mode", "reps")
        self.pass_threshold = pass_threshold  # คะแนนข้อใดต่ำกว่านี้ ถือว่าต้องแก้
        self.rep_scores = []
        self._all_feedback = []
        self._reset_accumulators()

    def reset(self):
        self.rep_scores = []
        self._all_feedback = []
        self._reset_accumulators()

    def _reset_accumulators(self):
        # สำหรับเกณฑ์แบบ "always": เก็บผลรวมคะแนนระหว่างทำท่า และข้อความล่าสุดที่ยังไม่ผ่าน
        self._sum = [0.0] * len(self.criteria)
        self._count = [0] * len(self.criteria)
        self._last_message = [None] * len(self.criteria)

    # ------------------------------------------------------------------
    @staticmethod
    def _score_one(angle, criterion):
        low = criterion.get("min")
        high = criterion.get("max")
        margin = float(criterion.get("margin", 30))
        if low is not None and angle < low:
            deviation = low - angle
        elif high is not None and angle > high:
            deviation = angle - high
        else:
            return 1.0
        return max(0.0, 1.0 - deviation / margin)

    @staticmethod
    def _message(criterion, angle):
        low, high = criterion.get("min"), criterion.get("max")
        if angle is not None and low is not None and angle < low and criterion.get("feedback_low"):
            return criterion["feedback_low"]
        if angle is not None and high is not None and angle > high and criterion.get("feedback_high"):
            return criterion["feedback_high"]
        return criterion.get("feedback", "ปรับท่าทางให้ตรงตามตัวอย่าง")

    # ------------------------------------------------------------------
    def evaluate(self, analysis):
        """ประเมิน 1 เฟรม รับผลจากระบบ 1.4"""
        result = {
            "live_score": None, "live_feedback": [], "rep_completed": False,
            "rep_score": None, "rep_feedback": [], "rep_grade": None,
            "rep_scores": list(self.rep_scores), "average_score": self.average_score(),
        }
        if not analysis.get("valid") and not analysis.get("rep_completed"):
            return result

        angles = analysis["angles"]
        phase = analysis["phase"]
        collecting = analysis["hold_time"] > 0 if self.mode == "hold" else True

        live_scores, live_messages = [], []
        for i, criterion in enumerate(self.criteria):
            angle = angles.get(criterion["angle"])
            if angle is None:
                continue
            when = criterion.get("when", "always")
            score = self._score_one(angle, criterion)

            if when == "always":
                if collecting:
                    self._sum[i] += score
                    self._count[i] += 1
                    if score < self.pass_threshold:
                        self._last_message[i] = self._message(criterion, angle)
                live_scores.append(score)
                if score < self.pass_threshold:
                    live_messages.append(self._message(criterion, angle))
            elif phase == "target":
                live_scores.append(score)
                if score < self.pass_threshold:
                    live_messages.append(self._message(criterion, angle))

        if live_scores:
            result["live_score"] = round(100 * sum(live_scores) / len(live_scores))
        result["live_feedback"] = list(dict.fromkeys(live_messages))[:2]

        if analysis.get("rep_completed"):
            self._finish_rep(analysis["rep_snapshot"], result)
        return result

    def _finish_rep(self, snapshot, result):
        scores, feedback = [], []
        for i, criterion in enumerate(self.criteria):
            when = criterion.get("when", "always")
            snap_angle = (snapshot or {}).get(criterion["angle"])
            if when == "always" and self._count[i] > 0:
                score = self._sum[i] / self._count[i]
                message = self._last_message[i]
            elif snap_angle is not None:
                score = self._score_one(snap_angle, criterion)
                message = self._message(criterion, snap_angle)
            else:
                continue
            scores.append(score)
            if score < self.pass_threshold and message:
                feedback.append(message)

        rep_score = round(100 * sum(scores) / len(scores)) if scores else 100
        feedback = list(dict.fromkeys(feedback))

        self.rep_scores.append(rep_score)
        self._all_feedback.extend(feedback)
        self._reset_accumulators()

        result["rep_completed"] = True
        result["rep_score"] = rep_score
        result["rep_feedback"] = feedback
        result["rep_grade"] = grade_for(rep_score)
        result["rep_scores"] = list(self.rep_scores)
        result["average_score"] = self.average_score()

    # ------------------------------------------------------------------
    def average_score(self):
        if not self.rep_scores:
            return None
        return round(sum(self.rep_scores) / len(self.rep_scores))

    def summary(self):
        """สรุปผลทั้งท่า (ใช้ตอนจบท่า)"""
        average = self.average_score()
        common = [text for text, _ in Counter(self._all_feedback).most_common(2)]
        return {
            "reps": len(self.rep_scores),
            "scores": list(self.rep_scores),
            "average": average,
            "grade": grade_for(average) if average is not None else None,
            "advice": common,  # ข้อที่พลาดบ่อยที่สุด
        }
