#!/usr/bin/env bash
# Pair this machine with a TV running the Developer Mode app.
#
#   npm run pair -- <TV_IP> <PASSPHRASE> [DEVICE_NAME]
#
# Before running, on the TV's Developer Mode app: Dev Mode Status ON, Key Server ON,
# and note the IP + 6-character passphrase shown on screen.
source "$(dirname "$0")/lib.sh"
require_ares

IP="${1:-}"; PASS="${2:-}"; NAME="${3:-$DEVICE}"
[[ -n "$IP" && -n "$PASS" ]] || die "Usage: npm run pair -- <TV_IP> <PASSPHRASE> [DEVICE_NAME]"

say "Checking the TV at $IP"
port_open "$IP" 9922 || die "Port 9922 (dev SSH) is closed. Is Dev Mode Status ON and the TV on the same network?"
port_open "$IP" 9991 || die "Port 9991 (key server) is closed. Turn Key Server ON in the Developer Mode app and keep the app on screen."

# The key is "host", not "ip". Using ip= silently saves 127.0.0.1.
if device_exists "$NAME"; then
  say "Updating device '$NAME'"
  ares-setup-device -m "$NAME" -i "host=$IP" -i "port=9922" -i "username=prisoner" >/dev/null
else
  say "Adding device '$NAME'"
  ares-setup-device -a "$NAME" -i "host=$IP" -i "port=9922" -i "username=prisoner" >/dev/null
fi

# getkey downloads http://<ip>:9991/webos_rsa to ~/.ssh/<name>_webos and then prompts for the
# passphrase. That prompt does not reliably read piped stdin, so we store the passphrase in the
# device entry ourselves instead of trusting the prompt.
say "Downloading SSH key from the TV"
KEY_NAME="$(echo "$NAME" | tr -s ' ' '_')_webos"
printf '%s\n' "$PASS" | ares-novacom -d "$NAME" --getkey >/dev/null 2>&1 || true
[[ -f "$HOME/.ssh/$KEY_NAME" ]] || die "Key download failed (~/.ssh/$KEY_NAME missing). Re-check Key Server is ON."

ares-setup-device -m "$NAME" -i "privatekey=$KEY_NAME" -i "passphrase=$PASS" >/dev/null
ares-setup-device -f "$NAME" >/dev/null

say "Verifying connection"
if ares-device -d "$NAME" -i; then
  say "Paired. '$NAME' is now the default device. You can turn Key Server OFF on the TV."
else
  die "SSH auth failed. The passphrase is case-sensitive; check it against the TV screen and re-run."
fi
