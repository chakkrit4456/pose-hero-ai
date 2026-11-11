# Deploy Pose Hero AI on Debian 13

Upload or clone the **complete project**, including `Web Testing System`, media,
and `3.Game Control System/assets`. Run as root from the project directory:

```bash
bash install.sh --domain play.example.com --email admin@example.com
```

The email option authorizes acceptance of the Let's Encrypt terms. Before running,
point the domain's A record (and AAAA if present) to this server and allow inbound
TCP ports 80 and 443 in the server/provider firewall. The installer does not change
firewall rules. A public domain is required for automatic trusted HTTPS.

The script installs Debian packages, builds the page, runs the existing Node tests,
and serves static files with Nginx. There is no Node/Python application service.
Node is used only for building and tests. The camera runs in the visitor's browser.
Nginx/Certbot integration is available in [Debian 13's package repository](https://packages.debian.org/trixie/python3-certbot-nginx).

## Options

```bash
# Include the Music folder (only distribute music you have permission to use).
bash install.sh --domain play.example.com --email admin@example.com --with-music

# For testing or when an existing proxy supplies HTTPS.
bash install.sh --domain play.example.com --http

# Display options without installing anything.
bash install.sh --help
```

Remote browsers require **HTTPS** for camera access; HTTP by IP alone cannot enable
the camera. In proxy mode, route the named host to Nginx port 80 and keep the public
URL on HTTPS. Existing Nginx sites and the default site are not deleted. An existing
site using the same hostname must be resolved by the operator before deployment.

## Updates and rollback

Update the source checkout and rerun the same command with the same hostname.
The installer does not pull Git or replace your source files from the network.
Project music is included by default so home ambience works after deployment. Use `--without-music` on updates to omit it.

- Releases: `/var/www/pose-hero-ai/releases/<timestamp>`
- Active symlink: `/var/www/pose-hero-ai/current`
- Nginx config: `/etc/nginx/sites-available/pose-hero-ai`
- Previous config backups: `/var/www/pose-hero-ai/backups/<timestamp>/nginx.conf`
- Certificates: `/etc/letsencrypt/live/<domain>/`

The installer retains previous releases. If activation, certificate issuance, or the
local HTTP check fails, it restores the prior symlink and Nginx configuration.
Installed packages and issued certificates remain installed. On first installation,
there is no previous site to restore. Never reuse this installer's dedicated paths
for unrelated sites. Run with the same hostname on subsequent updates; changing
hostnames also changes the browser origin, so browser-stored history does not move.

For manual rollback, use the **previous release path printed by the installer**:

```bash
ln -s /var/www/pose-hero-ai/releases/PREVIOUS_TIMESTAMP /var/www/pose-hero-ai/rollback-link
mv -Tf /var/www/pose-hero-ai/rollback-link /var/www/pose-hero-ai/current
nginx -t && systemctl reload nginx
```

If configuration changed, restore the corresponding backed-up `nginx.conf` before
testing/reloading. Reopen the site and reload once online so its service worker can
update. Browser history stays on the visitor's device; use in-game JSON backup to
transfer it.

## Verification

If installation reports an asset `404` and then `restoring previous site`, the
release was rolled back; the Nginx welcome page can still be visible. Update the
checkout and rerun the installer. Release checks now wait for new Nginx workers
and compare both the page and logo with the deployed release. A persistent wrong
hostname/root still fails rather than treating the welcome page as success.
The installer also downloads and compares every bootstrap JavaScript file listed
in `release-manifest.json`; missing/stale scripts trigger rollback.

The loading screen waits for core initialization and bounded resource tasks.
Unavailable 3D assets fall back to 2D; if that image also fails, menus remain
usable on a plain background. Images, fonts and optional script failures cannot
permanently lock a working game. Slow script downloads show a retry option
without marking the session permanently failed. A real core initialization
failure stays on the error screen: **ลองโหลดใหม่** clears this game's offline
cache and service worker before requesting the latest release. It preserves
settings and play history. On the first update from an older deployment, use
Ctrl+Shift+R if the old loading screen remains cached.

Web releases version script URLs by content, keep script order when Cloudflare
Rocket Loader is enabled, and use network-first service-worker updates with an
offline fallback limited to the current release. HTML is never returned as a
replacement for a failed JavaScript request. Run `python tests/loading.py` and
`python tests/deploy-cache.py` after building `dist` to verify recovery.

For Cloudflare Tunnel on another machine, use `--domain YOUR_PUBLIC_HOST --http`,
set the tunnel service to `http://WEB_SERVER_LAN_IP:80`, and set its HTTP Host
Header to the same public hostname. Test from the tunnel host with
`curl -I -H 'Host: YOUR_PUBLIC_HOST' http://WEB_SERVER_LAN_IP:80/`.
If the check still fails, inspect duplicate `server_name` entries and confirm
`/etc/nginx/nginx.conf` includes `/etc/nginx/sites-enabled/*`.

```bash
nginx -t
systemctl status nginx --no-pager
systemctl status certbot.timer --no-pager
certbot renew --dry-run
curl -I https://play.example.com/
```

Then open the public URL, check the logo and all three menus, permit camera access,
and test the actual camera and USB pad. Automated tests do not prove real hardware
accuracy. No remote Debian server is accessed by the development checks.
