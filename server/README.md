# Pose Hero AI server (Debian 13)

One Python file serves the game and the player / score / ranking API. Database: SQLite file on the server.
No Docker, no extra packages — Debian 13 ships Python 3.13 with `sqlite3`.

## 1. Build the game (on your PC)
```
cd "3.Game Control System"
node build.js
node build-web.js          # writes ../dist
```

## 2. Copy to the server
```
sudo useradd --system --home /opt/pose-hero --shell /usr/sbin/nologin posehero
sudo mkdir -p /opt/pose-hero/server/data
# copy the dist/ folder and server/app.py, server/schema.sql to /opt/pose-hero
sudo chown -R posehero:posehero /opt/pose-hero
```

## 3. Run as a service
```
sudo cp /opt/pose-hero/server/pose-hero.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pose-hero
sudo systemctl status pose-hero
```
Open `http://SERVER-IP:8080/`.

## 4. HTTPS (needed for the camera on other devices)
Browsers only allow the camera on `https://` (or localhost). Put nginx in front:
```
sudo apt install nginx certbot python3-certbot-nginx
```
`/etc/nginx/sites-available/pose-hero`:
```
server {
  server_name game.example.com;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
}
```
```
sudo ln -s /etc/nginx/sites-available/pose-hero /etc/nginx/sites-enabled/
sudo certbot --nginx -d game.example.com
```
Then change `--host 0.0.0.0` to `--host 127.0.0.1` in the service file.

## Data
- Database: `/opt/pose-hero/server/data/pose-hero.db` — back up by copying the file (`sqlite3 pose-hero.db ".backup backup.db"`).
- `secret.key` in the same folder signs login tokens; keep it private.
- Players log in with name + 4-digit PIN (stored hashed). Scores: only finished rounds, 0–100 each, max one per minute per player.
- Ranks by total points: Bronze 0, Silver 300, Gold 1000, Platinum 2500, Diamond 5000.

## API
| Method | Path | Body / query |
|---|---|---|
| POST | `/api/players` | `{name, pin}` → `{token, player}` |
| POST | `/api/login` | `{name, pin}` → `{token, player}` |
| GET | `/api/players/me` | header `Authorization: Bearer <token>` |
| POST | `/api/scores` | `{mode, score, reps, stepAccuracy, durationSec, completed}` + token |
| GET | `/api/leaderboard` | `?period=all|week&mode=hero` |
