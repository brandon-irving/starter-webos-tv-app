---
name: webos-dev-loop
description: Build, deploy, live-reload and debug an LG webOS TV app on a paired TV. Use when the user wants to run, deploy, install, launch, test, inspect or debug their webOS app on the TV, add Luna service calls or permissions (ACG), or handle remote control keys.
---

# webOS dev loop

Run these from a project made from `starter-webos-tv-app` (it has `app/` and `scripts/`). They assume the TV is paired as device `tv`. If `npm run doctor` fails, use the **webos-tv-setup** skill first.

## Commands

| Goal | Command |
|---|---|
| Full install and launch | `npm run deploy` |
| Fast iteration, no install, reloads on save | `npm run dev` (long-running; start it in the background) |
| DevTools for the app on the TV | `npm run inspect` (opens a Chrome DevTools URL) |
| Close / uninstall / list apps | `npm run close` / `uninstall` / `list` |
| TV model and SDK | `npm run tv-info` |

Before each `deploy` for a release, bump `version` in `app/appinfo.json`. The .ipk name comes from id and version.

After a deploy, you can't see the TV. Ask the user to confirm what's on screen, or use `npm run inspect` to read console errors.

## Writing TV app code

- **Keys:** Left 37, Up 38, Right 39, Down 40, OK 13, **Back 461**. The template sets `disableBackHistoryAPI: true`, so Back reaches the app as a keydown; call `webOS.platformBack()` to exit. Without that flag, the platform maps Back to `history.back()`.
- **Focus:** there's no Tab key. Do D-pad focus yourself (see `setFocus` in `app/index.html`), and make focus visible from across the room (thick border, scale).
- **Magic Remote** is also a pointer. Make sure `mouseover` moves focus and `click` selects.
- **Layout:** 1920×1080 (no 4K for web apps). Keep about 5% overscan margins.
- **Platform APIs** come from `webOSTVjs-1.2.13/webOSTV.js`: `webOS.deviceInfo(cb)` (fields: modelName, version, sdkVersion, uhd, oled...), `webOS.service.request("luna://<service>", {method, parameters, onSuccess, onFailure})`, `webOS.platformBack()`, `webOS.systemInfo()`. Guard them with `if (window.webOS)`.

## ACG (permissions for Luna calls)

Every `luna://` call needs its group listed in `app/appinfo.json` → `requiredACG`. Find the group in https://webostv.developer.lge.com/develop/guides/acg-guide (service → method → group). Examples:

- `com.palm.systemservice` `time/getSystemTime` → `time.query`
- `com.webos.service.tv.systemproperty` `getSystemInfo` → `systemconfig.query`

Use documented methods only. For example, `clock/getTime` from LG's own sample isn't in the ACG table, so the template uses `time/getSystemTime`. If a call fails only on the TV, check `requiredACG` first.
