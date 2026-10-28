#!/usr/bin/env bash
# Install the webOS CLI (@webos-tools/cli) globally if it is missing.
ALLOW_BAD_MANIFEST=1 # installing the CLI doesn't need a valid app
source "$(dirname "$0")/lib.sh"

# One Node policy for every script: the minimum is package.json "engines", the tested LTS is .nvmrc.
# (LG's docs still list Node 14-16 for the CLI; those releases are end-of-life.)
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < NODE_MIN )); then
  die "Node $(node -v) is too old; these scripts need Node $NODE_MIN+. Run: nvm install (uses .nvmrc)"
fi

if command -v ares >/dev/null 2>&1; then
  say "webOS CLI already installed: $(ares -V 2>&1 | tail -1)"
else
  say "Installing @webos-tools/cli globally"
  npm install -g @webos-tools/cli
  say "Installed: $(ares -V 2>&1 | tail -1)"
fi
warn "Global npm packages are per Node version under nvm. Switching Node means reinstalling the CLI."
