# webOS platform notes

Things that aren't obvious from LG's docs, found on a real TV (webOS TV 26, SDK 11.2). Each is labeled with how it was verified. "Verified" means on that one TV; other webOS versions may differ.

## Input

- **Back is keyCode 461.** It reaches your page only with `"disableBackHistoryAPI": true` in `appinfo.json` (the template sets it). Without it, the TV turns Back into `history.back()`. On your top-level screen, Back should call `webOS.platformBack()` (`TV.exit()`), which returns to the TV's launcher. (Verified.)
- **Other remote keys:** color keys 403–406 (red, green, yellow, blue), play 415, pause 19, stop 413, rewind 412, fast-forward 417, digits 48–57. `tv.js` maps them to named actions. (From LG's key code reference.)
- **The Home button can't be overridden.** It always goes to LG's launcher. No app can replace LG's home screen. (Verified.)
- **There's no Tab key.** Focus has to be managed in code (`TV.nav`). (Verified.)
- **Bluetooth gamepads work** through the standard Gamepad API with the standard mapping (DualSense: Cross = button 0, Circle = button 1, D-pad = 12–15). Polling only starts after `gamepadconnected`, which fires on the first button press. (Standard Gamepad API; check new controllers with `npm run eval -- 'navigator.getGamepads()[0]?.id'`.)
- **Text fields and the TV keyboard.** Giving an `<input>` focus opens the TV's on-screen keyboard; `tv.js` only does that when the field is selected (OK or a click), never when the D-pad merely passes over it. While a field has focus, `tv.js` leaves keys to it and only takes Back (and Enter in a one-line input) to end editing. (Verified on webOS TV 26 with a physical remote: select opens the keyboard, typing filters live, and both Back and the keyboard's own close button return to navigation.)
- **Pointer clicks** are ordinary mouse clicks (`event.detail` is 1 or more). Clicks a `<button>` gets from Enter or Space have `detail` 0, and `tv.js` ignores those, because the keydown already ran the action. (Verified with the Magic Remote on webOS TV 26: each click selects exactly once.)

## Luna services and permissions (ACG)

- **ACG (`requiredACG` in `appinfo.json`) depends on the webOS version.** LG: webOS TV 25 and older don't support it (the field is ignored); webOS TV 26 supports it and can enforce it; from webOS TV 27, every app must declare it to pass Seller Lounge checks, even one that makes no Luna calls. So declare the group of every `luna://` method you call: harmless on old TVs, needed on new ones. Where it's enforced, a missing group fails only on the TV, not in a desktop browser. Look groups up in LG's [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide). Use documented methods: for example `time/getSystemTime` (`time.query`), not `clock/getTime` from LG's own sample, which isn't in the ACG table.
- **Apps can't list installed apps.** `listApps` and `listLaunchPoints` are denied to third-party apps. Instead, check known ids one at a time with `getAppLoadStatus` (`TV.appInstalled`, ACG `application.query`). (Verified.)
- **Apps can launch other apps** with `com.webos.applicationManager/launch` (`TV.launchApp`, ACG `application.launcher`). Useful ids: `youtube.leanback.v4`, `netflix`, `amazon`, `com.disney.disneyplus-prod`, `hulu`, `com.hbo.hbomax`, `com.apple.appletv`, `spotify-beehive`, `com.webos.app.livetv`, `com.webos.app.hdmi1`, `hdmi2`, ... (one per HDMI port), `com.webos.app.browser`, `com.palm.app.settings`. (Verified on webOS TV 26.)
- **`webOS.deviceInfo` fields:** the firmware version is `version`, not `platformVersion`. Others: `modelName`, `sdkVersion`, `uhd`, `oled`. (Verified.)

## Developer Mode experiments (not for store apps)

These work on a Developer Mode TV but rely on behavior LG documents as unavailable to third-party apps. They're kept out of `tv.js` and the demo on purpose.

- **System toasts.** `com.webos.notification/createToast` shows the TV's own notification bubble, drawn by the system rather than inside your page. LG documents toasts as system-app only, so expect store review to reject it, and a firmware update could block it. It worked without an ACG entry, and only while the app was running. (Verified on webOS TV 26 in Developer Mode.)
  ```js
  TV.luna("com.webos.notification", "createToast", { message: "Hello from the system toast" });
  ```

## Background work

- **JS services** (Node.js; v20.12 on webOS TV 26) can run without the app on screen, but `webos-service` exits a service after 5 seconds without an active request or subscription. To keep one running, create an ActivityManager activity (`service.activityManager.create("keepAlive", ...)`). Services don't start when the TV boots; something has to call them first. (From LG's [JS service FAQ](https://webostv.developer.lge.com/develop/guides/js-service-faq), not yet tested here.)

## Developer Mode

- **The Developer Mode session expires** (the Developer Mode app shows the time left). When it runs out, the TV uninstalls every dev app. Press EXTEND in the Developer Mode app before then.
- **The TV's IP changes** with DHCP. If deploys suddenly fail, run `npm run doctor`; if the IP changed, update `.env` and run `npm run tv`, which re-pairs.
- **Don't use `ares-launch --hosted`.** It runs the app inside an iframe in LG's generic host app, where Back and launch parameters never arrive. Use `npm run tv:dev` for live reload.

## Console noise

- `webOSTV.js` logs `getSystemSettings(soundOutput) failed` and `getARCState failed` at startup when the app doesn't have the ACG for those settings. They're harmless.
