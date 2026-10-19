---
name: webos-bootstrap
description: Create a new LG webOS TV web app from the starter-webos-tv-app template and get the toolchain ready. Use when the user wants to start, scaffold, bootstrap or create a new LG / webOS TV app, or install or verify the webOS CLI (ares).
---

# Bootstrap a webOS TV app

This repo (`starter-webos-tv-app`) is the template: a known-good app plus scripts. Below, `<template>` means the root of this repo. Always copy it with `npm run new`; don't run `ares-generate` from scratch, because the template already includes the remote-key handling, ACG and appinfo fixes. The copy brings `.claude/skills/` with it, so these skills keep working inside the new project.

## Steps

1. **Toolchain:**
   ```bash
   cd <template> && npm run setup:cli
   ```
   This installs `@webos-tools/cli` globally if `ares` is missing. LG recommends Node 14–16, but CLI 3.x is verified on Node 25. Under nvm, global packages are per Node version: if `ares` disappears after a `nvm use`, run this again.

2. **Pick the app ID and title.** Ask the user if they didn't say. Rules (the script enforces them):
   - lowercase reverse-domain, e.g. `com.<name>.<app>`
   - must not start with `com.palm`, `com.webos`, `com.lge` or `com.palmdts` (reserved by LG)

3. **Create the project.** It's usually best next to the template:
   ```bash
   cd <template> && npm run new -- ../<dir-name> <app.id> "<Title>"
   ```
   This copies the template (without `dist/`) and rewrites `app/appinfo.json` id/title/version, `package.json` name and the HTML `<title>`.

4. **Check that it builds:**
   ```bash
   cd ../<dir-name> && npm run package
   ```
   You should see `Success` and `dist/<id>_0.0.1_all.ipk`. A `requiredACG` warning means appinfo lost its `requiredACG` array.

5. **Check the device.** Run `npm run doctor`. If no TV is paired, or the device points at 127.0.0.1, hand off to the **webos-tv-setup** skill. If it's paired, run `npm run deploy` and ask the user to confirm what they see on the TV.

## Notes

- `app/` is what gets packaged. Keep build tooling (bundlers, node_modules) outside it, or set the bundler's output to `app/`.
- To preview the UI without a TV, open `app/index.html` in a desktop browser. TV-only APIs are guarded by `if (window.webOS)`.
- More detail is in the repo `README.md`.
