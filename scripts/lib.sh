# Shared helpers, sourced by the other scripts. Not meant to be run directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"
DIST_DIR="$ROOT/dist"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js is required. Install the LTS version in .nvmrc (nvm recommended)."

# Manifest fields, the dev app id and the settings (environment > .env > default) all come from
# scripts/lib.mjs, so bash and Node agree. Sets: APP_ID APP_VERSION DEV_ID DEVICE TV_IP TV_PASSPHRASE
# DEV_PORT HOST_IP WEBOS_DEV NODE_MIN MANIFEST_ERROR.
_bridge="$(node "$ROOT/scripts/sh-bridge.mjs" env)" || die "Couldn't read the project settings (scripts/sh-bridge.mjs failed)"
eval "$_bridge"
unset _bridge
# doctor.sh sets ALLOW_BAD_MANIFEST so it can report the problem instead of stopping here
[[ -z "$MANIFEST_ERROR" || -n "${ALLOW_BAD_MANIFEST:-}" ]] || die "$MANIFEST_ERROR"
IPK="$DIST_DIR/${APP_ID}_${APP_VERSION}_all.ipk"

require_ares() {
  command -v ares >/dev/null 2>&1 || die "webOS CLI not found. Run: npm run setup:cli"
}

# The app on the TV a command acts on: the packaged app, or the tv:dev shell with --dev (or WEBOS_DEV=1)
target_id() {
  local arg
  for arg in "$@"; do [[ "$arg" == "--dev" ]] && { echo "$DEV_ID"; return; }; done
  [[ "$WEBOS_DEV" == "1" ]] && echo "$DEV_ID" || echo "$APP_ID"
}

device_exists() {
  ares-setup-device -l 2>/dev/null | awk 'NR>2 {print $1}' | grep -qx "$1"
}

# Print the host (IP) a registered device points at.
device_host() {
  ares-setup-device -l 2>/dev/null | awk -v n="$1" 'NR>2 && $1==n {for(i=2;i<=NF;i++) if ($i ~ /@/) {split($i,a,"[@:]"); print a[2]; exit}}'
}

port_open() { nc -z -G 3 "$1" "$2" >/dev/null 2>&1 || nc -z -w 3 "$1" "$2" >/dev/null 2>&1; }
