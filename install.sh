#!/usr/bin/env bash
# Debian 13 / root. Deploy only this project's static files; keep existing sites.
set -Eeuo pipefail
umask 022

usage() {
  cat <<'HELP'
Pose Hero AI — Debian 13 installer (run as root; no sudo)

  bash install.sh --domain play.example.com --email admin@example.com
  bash install.sh --domain play.example.com --email admin@example.com --with-music
  bash install.sh --domain play.example.com --http

Default: HTTPS using Let's Encrypt. --email accepts the Let's Encrypt terms.
Point the domain's A/AAAA records to this server and allow inbound TCP 80/443.
--http is for an existing HTTPS reverse proxy or testing: remote camera access
requires HTTPS. For IP-only HTTP testing use --domain SERVER_IP --http; open
the supplied host URL (an existing default Nginx site is left untouched).

Run from a complete project checkout. Files deploy to /var/www/pose-hero-ai.
Re-run to update; old releases and previous configuration are retained.
HELP
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
DOMAIN=''; EMAIL=''; HTTP=0; MUSIC=0
while (($#)); do
  case "$1" in
    --domain) (($# >= 2)) || die '--domain needs a value'; DOMAIN=$2; shift 2 ;;
    --email) (($# >= 2)) || die '--email needs a value'; EMAIL=$2; shift 2 ;;
    --http) HTTP=1; shift ;;
    --with-music) MUSIC=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done
[[ $EUID -eq 0 ]] || die 'Run as root.'
[[ -r /etc/os-release ]] || die 'Cannot identify this system.'
. /etc/os-release
[[ ${ID:-} == debian && ${VERSION_ID:-} == 13 ]] || die 'This installer supports Debian 13 only.'
if [[ -z $DOMAIN && -t 0 ]]; then read -r -p 'Domain (example: play.example.com): ' DOMAIN; fi
[[ -n $DOMAIN && ${#DOMAIN} -le 253 ]] || die 'Provide --domain.'
[[ $DOMAIN =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && $DOMAIN != *..* ]] || die 'Domain must be a hostname or IPv4 address, without scheme, port or path.'
IFS='.' read -r -a labels <<< "$DOMAIN"
for label in "${labels[@]}"; do
  [[ ${#label} -le 63 && $label != -* && $label != *- ]] || die 'Invalid hostname label.'
done
DOMAIN=${DOMAIN,,}
if (( ! HTTP )); then
  [[ $DOMAIN == *.* && ! $DOMAIN =~ ^[0-9.]+$ ]] || die 'HTTPS needs a public domain name; use --http for IP testing.'
  if [[ -z $EMAIL && -t 0 ]]; then read -r -p "Certificate email (accepts Let's Encrypt terms): " EMAIL; fi
  [[ $EMAIL =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die 'Provide --email for HTTPS, or choose --http.'
fi

SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ -f $SOURCE/package.json && -f $SOURCE/'3.Game Control System/build-web.js' ]] || die 'Run from the full project checkout.'
BASE=/var/www/pose-hero-ai
CONF=/etc/nginx/sites-available/pose-hero-ai
ENABLED=/etc/nginx/sites-enabled/pose-hero-ai
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
RELEASE=$BASE/releases/$STAMP
BACKUP=$BASE/backups/$STAMP
[[ ! -e $BASE/current || -L $BASE/current ]] || die "$BASE/current exists and is not a symlink. Move it manually first."
[[ ! -e $ENABLED || -L $ENABLED ]] || die "$ENABLED exists and is not a symlink. Review it first."

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates nodejs nginx curl
if (( ! HTTP )); then apt-get install -y --no-install-recommends certbot python3-certbot-nginx; fi

printf '\nBuilding and testing project…\n'
cd -- "$SOURCE"
node '3.Game Control System/build.js'
node tests/run-tests.js
BUILD=(node '3.Game Control System/build-web.js')
(( ! MUSIC )) || BUILD+=(--with-music)
"${BUILD[@]}"
[[ -s dist/index.html && -s dist/assets/pose-hero-logo-mascot-v3.png ]] || die 'Build output is incomplete.'
install -d -m 0755 "$RELEASE" "$BACKUP" "$BASE/acme/.well-known/acme-challenge"
cp -a -- dist/. "$RELEASE/"
chown -R root:root "$RELEASE"
find "$RELEASE" -type d -exec chmod 0755 {} +
find "$RELEASE" -type f -exec chmod 0644 {} +
OLD_CURRENT=$(readlink "$BASE/current" || true)
OLD_ENABLED=$(readlink "$ENABLED" || true)
HAD_CONF=0
if [[ -f $CONF ]]; then cp -a -- "$CONF" "$BACKUP/nginx.conf"; HAD_CONF=1; fi
CHANGED=0
rollback() {
  local code=$?
  trap - ERR
  if (( CHANGED )); then
    printf '\nDeployment failed; restoring previous site…\n' >&2
    if (( HAD_CONF )); then cp -a -- "$BACKUP/nginx.conf" "$CONF"; else rm -f -- "$CONF"; fi
    rm -f -- "$ENABLED"
    [[ -z $OLD_ENABLED ]] || ln -s -- "$OLD_ENABLED" "$ENABLED"
    rm -f -- "$BASE/current"
    [[ -z $OLD_CURRENT ]] || ln -s -- "$OLD_CURRENT" "$BASE/current"
    if nginx -t; then systemctl reload nginx || true; fi
  fi
  printf 'Release retained at %s. Inspect the error above.\n' "$RELEASE" >&2
  exit "$code"
}
trap rollback ERR
CHANGED=1
ln -s -- "$RELEASE" "$BASE/current-$STAMP"
mv -Tf -- "$BASE/current-$STAMP" "$BASE/current"

write_config() {
  local tls=$1
  cat > "$CONF" <<NGINX
# Managed by Pose Hero AI install.sh; backup: $BACKUP
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $BASE/acme; }
NGINX
  if (( tls )); then
    cat >> "$CONF" <<NGINX
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
NGINX
  fi
  cat >> "$CONF" <<'NGINX'
    root /var/www/pose-hero-ai/current;
    index index.html;
    charset utf-8;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(self), microphone=()" always;
    gzip on;
    gzip_types text/css application/javascript application/json application/wasm image/svg+xml;
    location / { try_files $uri $uri/ =404; }
    location = /index.html { expires -1; }
    location = /sw.js { expires -1; }
    location = /manifest.webmanifest { expires -1; }
    location ~ /\. { deny all; }
}
NGINX
}

# Keep HTTPS on subsequent updates; never downgrade an installed certificate.
TLS=0
if (( ! HTTP )) && [[ -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem && -s /etc/letsencrypt/live/$DOMAIN/privkey.pem ]]; then TLS=1; fi
write_config "$TLS"
ln -sfn -- "$CONF" "$ENABLED"
nginx -t
systemctl enable --now nginx
systemctl reload nginx
if (( ! HTTP )); then
  certbot certonly --webroot -w "$BASE/acme" --cert-name "$DOMAIN" -d "$DOMAIN" \
    --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring
  write_config 1
  nginx -t
  systemctl reload nginx
  systemctl enable --now certbot.timer
  curl --fail --silent --show-error --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" -o /dev/null
  curl --fail --silent --show-error --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/assets/pose-hero-logo-mascot-v3.png" | cmp - "$RELEASE/assets/pose-hero-logo-mascot-v3.png"
  URL=https://$DOMAIN
else
  curl --fail --silent --show-error -H "Host: $DOMAIN" http://127.0.0.1/ -o /dev/null
  curl --fail --silent --show-error -H "Host: $DOMAIN" http://127.0.0.1/assets/pose-hero-logo-mascot-v3.png | cmp - "$RELEASE/assets/pose-hero-logo-mascot-v3.png"
  URL=http://$DOMAIN
fi
trap - ERR
printf '\nDeployed: %s\nRelease: %s\nPrevious release: %s\nConfig backup: %s\n' "$URL" "$RELEASE" "${OLD_CURRENT:-none}" "$BACKUP"
if (( HTTP )); then printf 'Remote camera access needs HTTPS. Put this site behind an HTTPS proxy or rerun with --email.\n'; fi
