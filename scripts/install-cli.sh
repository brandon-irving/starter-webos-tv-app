#!/usr/bin/env bash
# Install the webOS CLI (@webos-tools/cli) globally if it is missing.
source "$(dirname "$0")/lib.sh"

command -v node >/dev/null 2>&1 || die "Node.js is required. Install it (nvm recommended) and re-run."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 14 )); then
  die "Node $(node -v) is too old; the webOS CLI needs Node 14+."
fi
# LG recommends Node 14-16, but CLI 3.x is verified working on Node 25.
if (( NODE_MAJOR > 16 )); then
  warn "Node $(node -v) is newer than LG's recommended 14-16. CLI 3.x works on 25; if it misbehaves: nvm use 16 && npm run setup:cli"
fi

if command -v ares >/dev/null 2>&1; then
  say "webOS CLI already installed: $(ares -V 2>&1 | tail -1)"
else
  say "Installing @webos-tools/cli globally"
  npm install -g @webos-tools/cli
  say "Installed: $(ares -V 2>&1 | tail -1)"
fi
warn "Global npm packages are per Node version under nvm. Switching Node means reinstalling the CLI."
