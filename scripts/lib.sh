# Shared helpers, sourced by the other scripts. Not meant to be run directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/app"
DIST_DIR="$ROOT/dist"
# Name the TV is registered under in ares-setup-device. Override per command: WEBOS_DEVICE=bedroom npm run deploy
DEVICE="${WEBOS_DEVICE:-tv}"

app_field() { node -p "require('$APP_DIR/appinfo.json').$1"; }

APP_ID="$(app_field id)"
APP_VERSION="$(app_field version)"
IPK="$DIST_DIR/${APP_ID}_${APP_VERSION}_all.ipk"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

require_ares() {
  command -v ares >/dev/null 2>&1 || die "webOS CLI not found. Run: npm run setup:cli"
}

device_exists() {
  ares-setup-device -l 2>/dev/null | awk 'NR>2 {print $1}' | grep -qx "$1"
}

# Print the host (IP) a registered device points at.
device_host() {
  ares-setup-device -l 2>/dev/null | awk -v n="$1" 'NR>2 && $1==n {for(i=2;i<=NF;i++) if ($i ~ /@/) {split($i,a,"[@:]"); print a[2]; exit}}'
}

port_open() { nc -z -G 3 "$1" "$2" >/dev/null 2>&1 || nc -z -w 3 "$1" "$2" >/dev/null 2>&1; }
