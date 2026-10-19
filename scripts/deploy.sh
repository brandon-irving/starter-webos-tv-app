#!/usr/bin/env bash
# Package app/ into an .ipk, install it on the TV and launch it.
source "$(dirname "$0")/lib.sh"
require_ares

say "Packaging $APP_ID $APP_VERSION"
ares-package "$APP_DIR" -o "$DIST_DIR"
say "Installing on '$DEVICE'"
ares-install -d "$DEVICE" "$IPK"
say "Launching"
ares-launch -d "$DEVICE" "$APP_ID"
