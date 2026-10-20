#!/usr/bin/env bash
# Copy this template into a new project with its own app ID and title.
#
#   npm run new -- <TARGET_DIR> <APP_ID> "<TITLE>"
#   e.g. npm run new -- ../my-tv-app com.yourname.mytvapp "My TV App"
set -euo pipefail
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)"

TARGET="${1:-}"; ID="${2:-}"; TITLE="${3:-}"
[[ -n "$TARGET" && -n "$ID" && -n "$TITLE" ]] || { echo "Usage: npm run new -- <TARGET_DIR> <APP_ID> \"<TITLE>\"" >&2; exit 1; }

# Resolve relative targets against the caller's directory, not the template
[[ "$TARGET" = /* ]] || TARGET="${INIT_CWD:-$PWD}/$TARGET"

# webOS app IDs: lowercase reverse-domain; LG reserves some prefixes
[[ "$ID" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ && "$ID" == *.* ]] || { echo "Invalid app ID '$ID' (use lowercase reverse-domain, e.g. com.yourname.app)" >&2; exit 1; }
for reserved in com.palm com.webos com.lge com.palmdts; do
  [[ "$ID" == "$reserved" || "$ID" == "$reserved".* ]] && { echo "App ID prefix '$reserved' is reserved by LG" >&2; exit 1; }
done

[[ ! -e "$TARGET" ]] || { echo "Target '$TARGET' already exists" >&2; exit 1; }

rsync -a --exclude .git --exclude dist --exclude node_modules --exclude .DS_Store --exclude .env "$TEMPLATE/" "$TARGET/"

ID="$ID" TITLE="$TITLE" NAME="$(basename "$TARGET")" node -e '
const fs = require("fs"), path = require("path"), dir = process.argv[1];
const write = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o, null, 2) + "\n");
const info = require(path.join(dir, "app/appinfo.json"));
Object.assign(info, { id: process.env.ID, title: process.env.TITLE, version: "0.0.1" });
write("app/appinfo.json", info);
const pkg = require(path.join(dir, "package.json"));
pkg.name = process.env.NAME.toLowerCase().replace(/[^a-z0-9-]/g, "-");
pkg.description = process.env.TITLE + " (webOS TV app)";
write("package.json", pkg);
const html = path.join(dir, "app/index.html");
fs.writeFileSync(html, fs.readFileSync(html, "utf8").replace(/<title>.*<\/title>/, "<title>" + process.env.TITLE + "</title>"));
' "$TARGET"

echo "Created $TARGET ($ID, \"$TITLE\")"
echo "Next: cd \"$TARGET\" && npm run doctor && npm run deploy"
