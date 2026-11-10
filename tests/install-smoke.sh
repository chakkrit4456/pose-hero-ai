#!/usr/bin/env bash
# Safe checks: render Nginx config into a temporary directory, never install.
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
bash -n "$ROOT/install.sh"
bash "$ROOT/install.sh" --help >/dev/null
if bash "$ROOT/install.sh" --unknown >/dev/null 2>&1; then
  printf 'Unknown flags must fail\n' >&2; exit 1
fi
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
DOMAIN=play.example.com
BASE=/var/www/pose-hero-ai
BACKUP=/var/www/pose-hero-ai/backups/test
CONF=$WORK/nginx.conf
# Extract only the pure config renderer; no package/service commands are run.
source <(sed -n '/^write_config() {/,/^# Keep HTTPS/{ /^# Keep HTTPS/!p; }' "$ROOT/install.sh")
write_config 0
grep -q 'server_name play.example.com;' "$CONF"
grep -q 'try_files $uri $uri/ =404;' "$CONF"
grep -q 'location = /sw.js { expires -1; }' "$CONF"
grep -q 'camera=(self)' "$CONF"
if grep -q 'listen 443' "$CONF"; then exit 1; fi
write_config 1
grep -q 'listen 443 ssl;' "$CONF"
grep -q 'return 301 https://$host$request_uri;' "$CONF"
grep -q 'ssl_certificate /etc/letsencrypt/live/play.example.com/fullchain.pem;' "$CONF"
[[ $(grep -c '^server {' "$CONF") -eq 2 ]]
printf 'PASS installer syntax, help, flag rejection, HTTP and HTTPS config rendering\n'

# Reproduce the old-worker response after reload without touching system Nginx.
source <(sed -n '/^# BEGIN RELEASE CHECK/,/^# END RELEASE CHECK/p' "$ROOT/install.sh")
RELEASE=$WORK/release; BACKUP=$WORK/checks
mkdir -p "$RELEASE/assets" "$BACKUP"
printf 'new game page' > "$RELEASE/index.html"
printf 'new mascot logo' > "$RELEASE/assets/pose-hero-logo-mascot-v3.png"
MODE=warming; CALLS=0
sleep() { :; }
curl() {
  local out='' url=''
  while (($#)); do
    case "$1" in -o) out=$2; shift 2;; *) url=$1; shift;; esac
  done
  CALLS=$((CALLS+1))
  if [[ $MODE == missing || ( $MODE == warming && $CALLS -le 2 ) ]]; then return 22; fi
  if [[ $MODE == wrong ]]; then printf 'Welcome to nginx!' > "$out"; return 0; fi
  if [[ $url == */index.html ]]; then cp "$RELEASE/index.html" "$out";
  elif [[ $MODE == wrong-logo ]]; then printf 'old logo' > "$out";
  else cp "$RELEASE/assets/pose-hero-logo-mascot-v3.png" "$out"; fi
}
wait_for_release http
[[ $CALLS -eq 4 ]]
MODE=ready; CALLS=0; wait_for_release https; [[ $CALLS -eq 2 ]]
for MODE in wrong wrong-logo missing; do
  CALLS=0
  if wait_for_release http > /dev/null 2>&1; then
    printf 'Release check accepted invalid response: %s\n' "$MODE" >&2; exit 1
  fi
done
printf 'PASS reload delay, HTTPS check, default-page rejection, wrong-logo rejection, persistent 404 rejection\n'
