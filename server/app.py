#!/usr/bin/env python3
"""Pose Hero AI server: serves the built game and a small JSON API for players,
scores and the leaderboard. Standard library only (Python 3.11+, sqlite3)."""
import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
TOKEN_DAYS = 90
NAME_RE = re.compile(r"^[\w฀-๿ .\-]{2,20}$")
PIN_RE = re.compile(r"^\d{4}$")
MODES = {"hero", "camera", "dance", "fire", "routine"}
TIERS = [(5000, "Diamond"), (2500, "Platinum"), (1000, "Gold"), (300, "Silver"), (0, "Bronze")]
MIN_GAP_S = 60  # one score per player per minute

_lock = threading.Lock()


def tier(points):
    for floor, name in TIERS:
        if points >= floor:
            return name
    return "Bronze"


def next_tier(points):
    for floor, name in reversed(TIERS):
        if floor > points:
            return {"name": name, "at": floor}
    return None


class Store:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
        key_file = DATA / "secret.key"
        if not key_file.exists():
            key_file.write_bytes(secrets.token_bytes(32))
            try:
                os.chmod(key_file, 0o600)
            except OSError:
                pass
        self.key = key_file.read_bytes()

    # ---- auth ----
    @staticmethod
    def hash_pin(pin, salt=None):
        salt = salt or secrets.token_bytes(16)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 200_000)
        return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()

    @staticmethod
    def check_pin(pin, stored):
        salt_b64, _ = stored.split("$", 1)
        return hmac.compare_digest(Store.hash_pin(pin, base64.b64decode(salt_b64)), stored)

    def token(self, pid):
        exp = int(time.time()) + TOKEN_DAYS * 86400
        body = f"{pid}.{exp}"
        sig = hmac.new(self.key, body.encode(), hashlib.sha256).hexdigest()
        return f"{body}.{sig}"

    def verify(self, tok):
        try:
            pid, exp, sig = tok.split(".")
            good = hmac.new(self.key, f"{pid}.{exp}".encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(good, sig) and int(exp) > time.time():
                return int(pid)
        except (ValueError, AttributeError):
            pass
        return None

    # ---- players ----
    def create_player(self, name, pin):
        with _lock:
            try:
                cur = self.db.execute("INSERT INTO players(name,pin_hash,created_at) VALUES(?,?,?)",
                                      (name, self.hash_pin(pin), int(time.time())))
                self.db.commit()
            except sqlite3.IntegrityError:
                return None
        return cur.lastrowid

    def login(self, name, pin):
        row = self.db.execute("SELECT id,pin_hash FROM players WHERE name=?", (name,)).fetchone()
        if row and self.check_pin(pin, row["pin_hash"]):
            return row["id"]
        return None

    def profile(self, pid):
        p = self.db.execute("SELECT id,name,created_at FROM players WHERE id=?", (pid,)).fetchone()
        if not p:
            return None
        s = self.db.execute("SELECT COALESCE(SUM(score),0) pts, COALESCE(MAX(score),0) best, COUNT(*) n FROM scores WHERE player_id=?",
                            (pid,)).fetchone()
        recent = [dict(r) for r in self.db.execute(
            "SELECT mode,score,reps,step_acc,duration_s,created_at FROM scores WHERE player_id=? ORDER BY created_at DESC LIMIT 20", (pid,))]
        pts = s["pts"]
        return {"id": p["id"], "name": p["name"], "points": pts, "best": s["best"], "rounds": s["n"],
                "tier": tier(pts), "next": next_tier(pts), "rank": self.rank_of(pid), "recent": recent}

    # ---- scores ----
    def add_score(self, pid, mode, score, reps, step_acc, duration):
        now = int(time.time())
        with _lock:
            last = self.db.execute("SELECT MAX(created_at) t FROM scores WHERE player_id=?", (pid,)).fetchone()["t"]
            if last and now - last < MIN_GAP_S:
                return False
            self.db.execute("INSERT INTO scores(player_id,mode,score,reps,step_acc,duration_s,created_at) VALUES(?,?,?,?,?,?,?)",
                            (pid, mode, score, reps, step_acc, duration, now))
            self.db.commit()
        return True

    def leaderboard(self, period="all", mode=None, limit=50):
        where, args = [], []
        if period == "week":
            where.append("s.created_at >= ?")
            args.append(int(time.time()) - 7 * 86400)
        if mode:
            where.append("s.mode = ?")
            args.append(mode)
        cond = ("WHERE " + " AND ".join(where)) if where else ""
        rows = self.db.execute(
            f"""SELECT p.id, p.name, SUM(s.score) pts, MAX(s.score) best, COUNT(*) n
                FROM scores s JOIN players p ON p.id = s.player_id {cond}
                GROUP BY p.id ORDER BY pts DESC, best DESC, p.name LIMIT ?""", (*args, limit)).fetchall()
        return [{"rank": i + 1, "id": r["id"], "name": r["name"], "points": r["pts"], "best": r["best"],
                 "rounds": r["n"], "tier": tier(self.total_points(r["id"]))} for i, r in enumerate(rows)]

    def total_points(self, pid):
        return self.db.execute("SELECT COALESCE(SUM(score),0) FROM scores WHERE player_id=?", (pid,)).fetchone()[0]

    def rank_of(self, pid):
        mine = self.total_points(pid)
        if not mine:
            return None
        ahead = self.db.execute(
            "SELECT COUNT(*) FROM (SELECT player_id, SUM(score) pts FROM scores GROUP BY player_id) WHERE pts > ?", (mine,)).fetchone()[0]
        return ahead + 1


class Handler(SimpleHTTPRequestHandler):
    store: Store = None

    def log_message(self, fmt, *args):  # quieter logs
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 10_000:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return None

    def _pid(self):
        auth = self.headers.get("Authorization", "")
        return self.store.verify(auth[7:]) if auth.startswith("Bearer ") else None

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/health":
            return self._json(200, {"ok": True})
        if u.path == "/api/leaderboard":
            q = parse_qs(u.query)
            period = (q.get("period") or ["all"])[0]
            mode = (q.get("mode") or [None])[0]
            if mode and mode not in MODES:
                mode = None
            return self._json(200, {"period": period, "rows": self.store.leaderboard("week" if period == "week" else "all", mode)})
        if u.path == "/api/players/me":
            pid = self._pid()
            prof = pid and self.store.profile(pid)
            return self._json(200, prof) if prof else self._json(401, {"error": "กรุณาเข้าสู่ระบบ"})
        if u.path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        data = self._body()
        if data is None:
            return self._json(400, {"error": "ข้อมูลไม่ถูกต้อง"})
        if u.path in ("/api/players", "/api/login"):
            name = str(data.get("name", "")).strip()
            pin = str(data.get("pin", ""))
            if not NAME_RE.match(name):
                return self._json(400, {"error": "ชื่อต้องยาว 2-20 ตัวอักษร (ไทย/อังกฤษ/ตัวเลข)"})
            if not PIN_RE.match(pin):
                return self._json(400, {"error": "PIN ต้องเป็นตัวเลข 4 หลัก"})
            if u.path == "/api/players":
                pid = self.store.create_player(name, pin)
                if not pid:
                    return self._json(409, {"error": "ชื่อนี้มีผู้เล่นใช้แล้ว"})
            else:
                pid = self.store.login(name, pin)
                if not pid:
                    return self._json(401, {"error": "ชื่อหรือ PIN ไม่ถูกต้อง"})
            return self._json(200, {"token": self.store.token(pid), "player": self.store.profile(pid)})
        if u.path == "/api/scores":
            pid = self._pid()
            if not pid:
                return self._json(401, {"error": "กรุณาเข้าสู่ระบบ"})
            try:
                mode = str(data["mode"])
                score = int(data["score"])
                reps = int(data.get("reps") or 0)
                acc = data.get("stepAccuracy")
                acc = None if acc is None else int(acc)
                dur = int(data["durationSec"])
            except (KeyError, TypeError, ValueError):
                return self._json(400, {"error": "ข้อมูลคะแนนไม่ครบ"})
            if mode not in MODES or not (0 <= score <= 100) or not (0 <= reps <= 5000) \
                    or (acc is not None and not 0 <= acc <= 100) or not (30 <= dur <= 1500) or not data.get("completed"):
                return self._json(400, {"error": "คะแนนไม่ถูกต้อง"})
            if not self.store.add_score(pid, mode, score, reps, acc, dur):
                return self._json(429, {"error": "บันทึกคะแนนถี่เกินไป"})
            return self._json(200, {"saved": True, "player": self.store.profile(pid)})
        return self._json(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser(description="Pose Hero AI game + leaderboard server")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--site", default=str(HERE.parent / "dist"), help="folder of the built game (build-web.js output)")
    ap.add_argument("--db", default=str(DATA / "pose-hero.db"))
    a = ap.parse_args()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("audio/mpeg", ".mp3")
    mimetypes.add_type("video/webm", ".webm")
    Handler.store = Store(Path(a.db))
    site = os.path.abspath(a.site)
    handler = lambda *args, **kw: Handler(*args, directory=site, **kw)  # noqa: E731
    srv = ThreadingHTTPServer((a.host, a.port), handler)
    print(f"Pose Hero AI: http://{a.host}:{a.port}/  (site: {site}, db: {a.db})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
