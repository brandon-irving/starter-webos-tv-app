#!/usr/bin/env bash
# One command from zero to the app running on the TV, driven by .env:
#
#   npm run tv        install CLI if missing, pair if needed, package, install, launch
#   npm run tv:dev    live reload: serves app/ from this machine and installs a small
#                     "<Title> (dev)" shell that loads it; saving a file reloads the TV
#
# .env needs TV_IP and TV_PASSPHRASE (from the TV's Developer Mode app).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEV=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    *) echo "Unknown option: $arg (use --dev)" >&2; exit 1 ;;
  esac
done

source scripts/lib.sh

# Read KEY=VALUE from .env without executing it; strips optional quotes
env_get() {
  [[ -f .env ]] || return 0
  sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\1/p" .env | tail -1
}

TV_IP="${TV_IP:-$(env_get TV_IP)}"
TV_PASSPHRASE="${TV_PASSPHRASE:-$(env_get TV_PASSPHRASE)}"
DEV_PORT="${DEV_PORT:-5500}"
[[ -n "$TV_IP" ]] || die "TV_IP is not set. Copy .env.example to .env and fill it in."

# 1. CLI
command -v ares >/dev/null 2>&1 || bash scripts/install-cli.sh

# 2. Pair only when the registered device is missing, points elsewhere, or can't authenticate
if device_exists "$DEVICE" && [[ "$(device_host "$DEVICE")" == "$TV_IP" ]] && ares-device -d "$DEVICE" -i >/dev/null 2>&1; then
  say "Already paired with '$DEVICE' at $TV_IP"
else
  [[ -n "$TV_PASSPHRASE" ]] || die "Not paired yet and TV_PASSPHRASE is not set in .env"
  say "Pairing with $TV_IP (Key Server must be ON in the Developer Mode app)"
  bash scripts/pair-tv.sh "$TV_IP" "$TV_PASSPHRASE" "$DEVICE"
fi

if (( ! DEV )); then
  bash scripts/deploy.sh
  exit 0
fi

# 3. Live reload. LG's `ares-launch --hosted` loads the app in an iframe inside a generic shell
# whose manifest lacks disableBackHistoryAPI, so the Back key and launch params never reach the
# app. Instead, install a shell with this app's own manifest (under a separate .dev id, next to
# the real app) that hands its whole window to the dev server on this machine.
IFACE="$(route -n get "$TV_IP" 2>/dev/null | awk '/interface:/ {print $2}')"
LAN_IP="$(ipconfig getifaddr "${IFACE:-en0}" 2>/dev/null || true)"
[[ -n "$LAN_IP" ]] || die "Couldn't work out this machine's IP on the TV's network"
URL="http://$LAN_IP:$DEV_PORT/"

say "Serving app/ at $URL"
node scripts/dev-server.mjs "$DEV_PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "$URL" && break; sleep 0.25; done
curl -s -o /dev/null "$URL" || die "Dev server didn't come up on port $DEV_PORT"

SHELL_DIR="$DIST_DIR/devshell"
rm -rf "$SHELL_DIR" && mkdir -p "$SHELL_DIR"
node -e '
  const fs = require("fs"), path = require("path");
  const [appDir, out, url] = process.argv.slice(1);
  const info = JSON.parse(fs.readFileSync(path.join(appDir, "appinfo.json"), "utf8"));
  for (const k of ["icon", "largeIcon"]) if (info[k]) fs.copyFileSync(path.join(appDir, info[k]), path.join(out, path.basename(info[k])));
  info.id += ".dev";
  info.title += " (dev)";
  fs.writeFileSync(path.join(out, "appinfo.json"), JSON.stringify(info, null, 2));
  // Retries until the dev server answers, then navigates the whole window to it (no iframe)
  fs.writeFileSync(path.join(out, "index.html"), `<!DOCTYPE html><html><body style="background:#000;color:#888;font:28px sans-serif;padding:96px">
Waiting for the dev server at ${url}…<br>Run <b>npm run tv:dev</b> on your machine.
<script>
  var url = ${JSON.stringify(url)};
  function go() { fetch(url, { mode: "no-cors" }).then(function () { location.replace(url); }, function () { setTimeout(go, 2000); }); }
  go();
</script></body></html>`);
' "$APP_DIR" "$SHELL_DIR" "$URL"

DEV_ID="$APP_ID.dev"
ares-package "$SHELL_DIR" -o "$DIST_DIR" >/dev/null
say "Installing $DEV_ID on '$DEVICE'"
ares-install -d "$DEVICE" "$DIST_DIR/${DEV_ID}_${APP_VERSION}_all.ipk"
ares-launch -d "$DEVICE" "$DEV_ID"
say "Running on the TV with live reload. Edit app/ and save. Ctrl+C to stop."
wait "$SERVER_PID"
