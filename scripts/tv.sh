#!/usr/bin/env bash
# One-liners that need the app ID / device name. Usage: scripts/tv.sh <command> [--dev]
# --dev (or WEBOS_DEV=1) makes launch/close/inspect/uninstall act on the tv:dev shell (<id>.dev).
source "$(dirname "$0")/lib.sh"
require_ares
TARGET="$(target_id "$@")"

case "${1:-}" in
  package)   ares-package "$APP_DIR" -o "$DIST_DIR" ;;
  install)   ares-install -d "$DEVICE" "$IPK" ;;
  launch)    ares-launch -d "$DEVICE" "$TARGET" ;;
  close)     ares-launch -d "$DEVICE" --close "$TARGET" ;;
  inspect)   ares-inspect -d "$DEVICE" -a "$TARGET" -o ;;
  uninstall) ares-install -d "$DEVICE" -r "$TARGET" ;;
  list)      ares-install -d "$DEVICE" -l ;;
  info)      ares-device -d "$DEVICE" -i ;;
  sim)       ares-launch -s "${WEBOS_SIM_VERSION:-24}" "$APP_DIR" ;;
  *) die "Unknown command '${1:-}'. One of: package install launch close inspect uninstall list info sim" ;;
esac
