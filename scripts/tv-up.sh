#!/usr/bin/env bash
# One command from zero to the app running on the TV, driven by .env:
#
#   npm run tv                  install CLI if missing, pair if needed, package, install, launch
#   npm run tv:dev              live reload: serves app/ from this machine and installs a small
#                               "<Title> (dev)" shell (<id>.dev) that loads it; saving a file reloads the TV
#   npm run tv -- --config      print the settings these would use, and stop
#
# Settings (environment > .env > default): TV_IP, TV_PASSPHRASE, DEV_PORT, HOST_IP, WEBOS_DEVICE.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEV=0 CONFIG=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    --config) CONFIG=1 ;;
    *) echo "Unknown option: $arg (use --dev, --config)" >&2; exit 1 ;;
  esac
done

source scripts/lib.sh

# HOST_IP: this machine's address as the TV sees it (the TV loads the dev server from it)
if (( DEV )) && [[ -z "$HOST_IP" && -n "$TV_IP" ]]; then
  HOST_IP="$(node scripts/sh-bridge.mjs host-ip "$TV_IP" 2>/dev/null || true)"
fi
URL="http://${HOST_IP:-?}:$DEV_PORT/"

if (( CONFIG )); then
  echo "app        $APP_ID $APP_VERSION (dev shell: $DEV_ID)"
  echo "device     $DEVICE"
  echo "TV_IP      ${TV_IP:-(not set)}"
  echo "passphrase $([[ -n "$TV_PASSPHRASE" ]] && echo set || echo '(not set)')"
  (( DEV )) && echo "dev server $URL"
  exit 0
fi

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
# Live reload runs over http://, not file://: test the packaged app (npm run deploy) before you
# rely on cookies, storage or network behavior (see "Live reload vs. the packaged app" in the README).
[[ -n "$HOST_IP" ]] || die "Couldn't work out this machine's IP on the TV's network. Set HOST_IP in .env."

say "Serving app/ at $URL"
node scripts/dev-server.mjs "$DEV_PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "$URL" && break; sleep 0.25; done
curl -s -o /dev/null "$URL" || die "Dev server didn't come up at $URL (port in use? set DEV_PORT; wrong address? set HOST_IP)"

SHELL_DIR="$DIST_DIR/devshell"
node scripts/sh-bridge.mjs dev-shell "$SHELL_DIR" "$URL" >/dev/null
ares-package "$SHELL_DIR" -o "$DIST_DIR" >/dev/null
say "Installing $DEV_ID on '$DEVICE'"
ares-install -d "$DEVICE" "$DIST_DIR/${DEV_ID}_${APP_VERSION}_all.ipk"
ares-launch -d "$DEVICE" "$DEV_ID"
say "Running on the TV with live reload. Edit app/ and save. Ctrl+C to stop."
say "Inspect it with the --dev flag: npm run shot -- --dev, npm run logs -- --dev, npm run inspect -- --dev"
wait "$SERVER_PID"
