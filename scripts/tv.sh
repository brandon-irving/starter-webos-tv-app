#!/usr/bin/env bash
# One-liners that need the app ID / device name. Usage: scripts/tv.sh <command>
source "$(dirname "$0")/lib.sh"
require_ares

case "${1:-}" in
  package)   ares-package "$APP_DIR" -o "$DIST_DIR" ;;
  install)   ares-install -d "$DEVICE" "$IPK" ;;
  launch)    ares-launch -d "$DEVICE" "$APP_ID" ;;
  close)     ares-launch -d "$DEVICE" --close "$APP_ID" ;;
  inspect)   ares-inspect -d "$DEVICE" -a "$APP_ID" -o ;;
  uninstall) ares-install -d "$DEVICE" -r "$APP_ID" ;;
  list)      ares-install -d "$DEVICE" -l ;;
  info)      ares-device -d "$DEVICE" -i ;;
  sim)       ares-launch -s "${WEBOS_SIM_VERSION:-24}" "$APP_DIR" ;;
  *) die "Unknown command '${1:-}'. One of: package install launch close inspect uninstall list info sim" ;;
esac
