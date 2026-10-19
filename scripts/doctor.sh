#!/usr/bin/env bash
# Health check: tooling, app manifest, device registration and TV reachability.
source "$(dirname "$0")/lib.sh"

ok=1
check() { if eval "$2" >/dev/null 2>&1; then say "ok    $1"; else warn "FAIL  $1  ->  $3"; ok=0; fi; }

check "node installed ($(node -v 2>/dev/null))" "command -v node" "install Node.js"
check "webOS CLI installed" "command -v ares" "npm run setup:cli"
check "app/appinfo.json valid ($APP_ID $APP_VERSION)" "node -e \"require('$APP_DIR/appinfo.json')\"" "fix JSON syntax"

if command -v ares >/dev/null 2>&1; then
  if device_exists "$DEVICE"; then
    HOST="$(device_host "$DEVICE")"
    say "ok    device '$DEVICE' registered -> $HOST"
    if [[ "$HOST" == "127.0.0.1" ]]; then
      warn "FAIL  '$DEVICE' points at 127.0.0.1  ->  re-pair: npm run pair -- <TV_IP> <PASSPHRASE>"; ok=0
    else
      check "TV reachable on 9922 (Dev Mode on)" "port_open $HOST 9922" "turn TV on / Dev Mode on / IP changed? re-pair"
      check "SSH auth works" "ares-device -d $DEVICE -i" "re-pair: npm run pair -- $HOST <PASSPHRASE>"
    fi
  else
    warn "FAIL  device '$DEVICE' not registered  ->  npm run pair -- <TV_IP> <PASSPHRASE>"; ok=0
  fi
fi

(( ok )) && say "All good." || { warn "Some checks failed."; exit 1; }
