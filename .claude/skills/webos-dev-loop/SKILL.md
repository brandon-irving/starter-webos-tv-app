---
name: webos-dev-loop
description: Build, deploy, live-reload and debug an LG webOS TV app on a paired TV. Use when the user wants to run, deploy, install, launch, test, inspect or debug their webOS app on the TV, add Luna service calls or permissions (ACG), or handle remote control keys.
---

# webOS dev loop

Run these from a project made from `starter-webos-tv-app` (it has `app/` and `scripts/`). They assume the TV is paired as device `tv`. If `npm run doctor` fails, use the **webos-tv-setup** skill first.

## Commands

| Goal | Command |
|---|---|
| Pair if needed, then install and launch (reads `.env`) | `npm run tv` |
| Full install and launch on an already-paired TV | `npm run deploy` |
| Live reload on the TV while editing `app/` | `npm run tv:dev` (long-running; start it in the background). It installs a `<id>.dev` app next to the real one; remove it with `ares-install -d tv -r <id>.dev` |
| DevTools for the app on the TV | `npm run inspect` (opens a Chrome DevTools URL) |
| Screenshot of the app on the TV | `npm run -s shot` (prints the path, default `dist/shot.jpg`; read the image) |
| Run JS in the app, print JSON | `npm run -s eval -- '<js>'` (promises are awaited; exit 1 on exceptions) |
| Press remote keys | `npm run -s key -- down right ok back` (also red/green/yellow/blue, play/pause, or a keyCode) |
| Console output | `npm run -s logs -- 10` (recent messages, then N seconds of new ones) |
| Close / uninstall / list apps | `npm run close` / `uninstall` / `list` |
| TV model and SDK | `npm run tv-info` |

Before each `deploy` for a release, bump `version` in `app/appinfo.json`. The .ipk name comes from id and version.

After a deploy, check the result yourself: `npm run -s shot` and read the image, `npm run -s eval` to read state (for example `TV.nav.focused().textContent`), `npm run -s key` to navigate, `npm run -s logs` for errors. These launch the app if it isn't running. Ask the user only about things a screenshot can't show (sound, the system toast, other apps). With `tv:dev`, the dev server logs `client connected (<TV IP>)` when the TV has loaded the page, and logs each reload.

Don't use `ares-launch --hosted`: it wraps the app in an iframe inside LG's generic hosted app, so the Back key and launch params never reach it.

## Writing TV app code

- **Use `app/js/tv.js`** for focus and input: set `el._select` on focusable elements, `TV.nav.push({ rows: [{ items }] })` for a screen, push another layer for an overlay (Back pops it), `TV.onInput` for extra keys. It already covers the D-pad, the Magic Remote pointer and gamepads. Make focus visible from across the room (thick border, scale).
- **Keys:** Left 37, Up 38, Right 39, Down 40, OK 13, **Back 461**; color keys 403–406. The template sets `disableBackHistoryAPI: true`, so Back reaches the app as a keydown; `TV.exit()` (`webOS.platformBack()`) leaves the app.
- **Performance and platform limits:** read `docs/performance.md` (no CSS blur on large areas, decode images before fading, rebuild only what changed, ~1 GB RAM) and `docs/platform.md` (what Luna calls third-party apps may make) before building UI. Packaged apps load from `file://`, so no ES modules.
- **Layout:** 1920×1080 (no 4K for web apps). Keep about 5% overscan margins.
- **Platform APIs** come from `webOSTVjs-1.2.13/webOSTV.js`: `webOS.deviceInfo(cb)` (fields: modelName, version, sdkVersion, uhd, oled...), `webOS.service.request("luna://<service>", {method, parameters, onSuccess, onFailure})`, `webOS.platformBack()`, `webOS.systemInfo()`. Guard them with `if (window.webOS)`.

## ACG (permissions for Luna calls)

Every `luna://` call needs its group listed in `app/appinfo.json` → `requiredACG`. Find the group in https://webostv.developer.lge.com/develop/guides/acg-guide (service → method → group). Examples:

- `com.palm.systemservice` `time/getSystemTime` → `time.query`
- `com.webos.service.tv.systemproperty` `getSystemInfo` → `systemconfig.query`

- `com.webos.applicationManager` `getAppLoadStatus` → `application.query`; `launch` → `application.launcher`

Use documented methods only. For example, `clock/getTime` from LG's own sample isn't in the ACG table, so the template uses `time/getSystemTime`. If a call fails only on the TV, check `requiredACG` first.
