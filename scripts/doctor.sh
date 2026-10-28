#!/usr/bin/env bash
# Health check: tooling, app manifest, device registration and TV reachability.
ALLOW_BAD_MANIFEST=1
source "$(dirname "$0")/lib.sh"

ok=1
check() { if eval "$2" >/dev/null 2>&1; then say "ok    $1"; else warn "FAIL  $1  ->  $3"; ok=0; fi; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
check "node $(node -v) (needs $NODE_MIN+)" "(( NODE_MAJOR >= NODE_MIN ))" "install the LTS version in .nvmrc (nvm install)"
check "webOS CLI installed" "command -v ares" "npm run setup:cli"
if [[ -n "$MANIFEST_ERROR" ]]; then
  warn "FAIL  app/appinfo.json  ->  fix the following:"
  printf '%s\n' "$MANIFEST_ERROR" >&2
  ok=0
else
  say "ok    app/appinfo.json ($APP_ID $APP_VERSION)"
fi

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
