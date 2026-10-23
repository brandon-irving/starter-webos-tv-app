# webOS platform notes

Things that aren't obvious from LG's docs, found on a real TV (webOS TV 26, SDK 11.2). Each is labeled with how it was verified.

## Input

- **Back is keyCode 461.** It reaches your page only with `"disableBackHistoryAPI": true` in `appinfo.json` (the template sets it). Without it, the TV turns Back into `history.back()`. On your top-level screen, Back should call `webOS.platformBack()` (`TV.exit()`), which returns to the TV's launcher. (Verified.)
- **Other remote keys:** color keys 403–406 (red, green, yellow, blue), play 415, pause 19, stop 413, rewind 412, fast-forward 417, digits 48–57. `tv.js` maps them to named actions. (From LG's key code reference.)
- **The Home button can't be overridden.** It always goes to LG's launcher. No app can replace LG's home screen. (Verified.)
- **There's no Tab key.** Focus has to be managed in code (`TV.nav`). (Verified.)
- **Bluetooth gamepads work** through the standard Gamepad API with the standard mapping (DualSense: Cross = button 0, Circle = button 1, D-pad = 12–15). Polling only starts after `gamepadconnected`, which fires on the first button press. (Standard Gamepad API; check new controllers with `npm run eval -- 'navigator.getGamepads()[0]?.id'`.)

## Luna services and permissions (ACG)

- **Every `luna://` method needs its ACG group in `appinfo.json` → `requiredACG`.** A missing group fails only on the TV, not in a desktop browser. Look groups up in LG's [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide). Use documented methods: for example `time/getSystemTime` (`time.query`), not `clock/getTime` from LG's own sample, which isn't in the ACG table.
- **Apps can't list installed apps.** `listApps` and `listLaunchPoints` are denied to third-party apps. Instead, check known ids one at a time with `getAppLoadStatus` (`TV.appInstalled`, ACG `application.query`). (Verified.)
- **Apps can launch other apps** with `com.webos.applicationManager/launch` (`TV.launchApp`, ACG `application.launcher`). Useful ids: `youtube.leanback.v4`, `netflix`, `amazon`, `com.disney.disneyplus-prod`, `hulu`, `com.hbo.hbomax`, `com.apple.appletv`, `spotify-beehive`, `com.webos.app.livetv`, `com.webos.app.hdmi1`, `hdmi2`, ... (one per HDMI port), `com.webos.app.browser`, `com.palm.app.settings`. (Verified on webOS TV 26.)
- **System toasts work in Developer Mode.** `com.webos.notification/createToast` (`TV.systemToast`) shows the TV's own notification bubble, drawn by the system rather than inside your page. LG documents toasts as system-app only, so expect store review to reject it, and a firmware update could block it. It worked without an ACG entry. It only works while your app is running. (Verified on webOS TV 26.)
- **`webOS.deviceInfo` fields:** the firmware version is `version`, not `platformVersion`. Others: `modelName`, `sdkVersion`, `uhd`, `oled`. (Verified.)

## Background work

- **JS services** (Node.js; v20.12 on webOS TV 26) can run without the app on screen, but `webos-service` exits a service after 5 seconds without an active request or subscription. To keep one running, create an ActivityManager activity (`service.activityManager.create("keepAlive", ...)`). Services don't start when the TV boots; something has to call them first. (From LG's [JS service FAQ](https://webostv.developer.lge.com/develop/guides/js-service-faq), not yet tested here.)

## Developer Mode

- **The Developer Mode session expires** (the Developer Mode app shows the time left). When it runs out, the TV uninstalls every dev app. Press EXTEND in the Developer Mode app before then.
- **The TV's IP changes** with DHCP. If deploys suddenly fail, run `npm run doctor`; if the IP changed, update `.env` and run `npm run tv`, which re-pairs.
- **Don't use `ares-launch --hosted`.** It runs the app inside an iframe in LG's generic host app, where Back and launch parameters never arrive. Use `npm run tv:dev` for live reload.

## Console noise

- `webOSTV.js` logs `getSystemSettings(soundOutput) failed` and `getARCState failed` at startup when the app doesn't have the ACG for those settings. They're harmless.
