# starter-webos-tv-app

A template for LG webOS TV web apps. It includes an HTML/JS app that works with the TV remote, plus scripts to install the CLI, pair a TV, deploy and debug.

Verified on an LG 65NU700BPUA (webOS SDK 11.2) with webOS CLI 3.2.6 on Node 25, October 2026.

## Layout

```
app/                 the webOS app (this folder is what gets packaged)
  appinfo.json       manifest: id, version, title, icons, ACG permissions
  index.html         demo UI: two focus rows (one scrolls), an overlay, toasts, app launch, device info
  styles.css
  js/tv.js           focus, input (remote, pointer, gamepad), Luna helpers, toasts, idle
  webOSTVjs-1.2.13/  LG's webOSTV.js library (webOS.service, deviceInfo, platformBack)
scripts/             helpers behind the npm scripts (cdp.mjs: shot/eval/key/logs)
docs/                performance.md and platform.md: what we learned on a real TV
dist/                built .ipk packages (gitignored)
```

## Quick start

```bash
npm run setup:cli                          # installs @webos-tools/cli globally if missing
npm run new -- ../my-app com.me.myapp "My App"   # make a copy with a new app ID
cd ../my-app
cp .env.example .env                       # add TV_IP + TV_PASSPHRASE from the Developer Mode app
npm run tv                                 # pairs if needed, then packages, installs and launches
npm run tv:dev                             # live reload on the TV while you edit app/
```

## Claude Code skills

`.claude/skills/` contains three [Claude Code](https://claude.com/claude-code) skills that load when you run `claude` inside this repo or inside a project created from it (`npm run new` copies them):

| Skill | Handles |
|---|---|
| `webos-bootstrap` | Installing the CLI, creating a new app from this template, checking that it packages |
| `webos-tv-setup` | Walking you through Developer Mode on the TV, pairing, and troubleshooting every pairing error we've seen |
| `webos-dev-loop` | Deploy, live reload, DevTools, remote and focus handling, ACG permissions for Luna calls |

For example, "set up my LG TV for development" or "make a new TV app called Weather" will pick up the right skill.

## Turning on Developer Mode (one time per TV)

1. Create an account at <https://webostv.developer.lge.com> (SIGN IN, top right).
2. On the TV, open the **LG Content Store**, search for **Developer Mode** and install it.
3. Open the app and sign in with that account.
4. Turn **Dev Mode Status** ON. The TV reboots.
5. Open the app again. Turn **Key Server** ON and note the **IP address** and **Passphrase** on screen.
6. On your machine, run `npm run pair -- <IP> <PASSPHRASE>`. After it succeeds you can turn Key Server off.

**The session expires.** "Dev Mode Session" counts down. Press EXTEND before it runs out: once it expires, Developer Mode turns off and **your dev apps are uninstalled**. Developer Mode also turns off after 10 reboots without a network connection.

## Commands

| Command | What it does |
|---|---|
| `npm run tv` | One command: installs the CLI if missing, pairs using `.env` if needed, then packages, installs and launches |
| `npm run tv:dev` (or `dev`) | Live reload on the TV: serves `app/` from your machine and reloads the TV on every save. Ctrl+C stops |
| `npm run doctor` | Checks the CLI, the manifest, the device registration, TV reachability and SSH auth |
| `npm run pair -- <IP> <PASS> [name]` | Registers the TV, downloads its SSH key and makes it the default device |
| `npm run deploy` | Packages, installs and launches the app |
| `npm run inspect` | Opens Chrome DevTools connected to the app running on the TV |
| `npm run shot [-- out.jpg]` | Screenshot of the app on the TV (default `dist/shot.jpg`) |
| `npm run eval -- '<js>'` | Runs JS in the app on the TV and prints the result as JSON |
| `npm run key -- down ok back` | Sends remote keys to the app (arrows, ok, back, color keys, media keys) |
| `npm run logs [-- 10]` | Prints the app's console output for N seconds |
| `npm run launch` / `close` / `uninstall` / `list` | App lifecycle on the TV |
| `npm run tv-info` | Model, SDK and firmware |
| `npm run sim` | Runs the app in the webOS TV Simulator (download it separately from LG; set `WEBOS_SIM_VERSION`) |

The scripts use the device named `tv`. To target another TV, set `WEBOS_DEVICE=bedroom npm run deploy`.

## Problems we hit and how the scripts handle them

- **`ares-setup-device -i "ip=..."` silently saves 127.0.0.1.** The option is `host=`. `pair-tv.sh` uses `host`.
- **`ares-novacom --getkey` fails with "Failed to get ssh private key".** Key Server is off. It serves the key on port 9991, and `pair` checks that port first.
- **"All configured authentication methods failed" after getkey.** The passphrase prompt doesn't read piped input, so the passphrase never got saved. `pair` writes `passphrase=` into the device entry directly.
- **`ares-launch --hosted` (LG's no-install mode) breaks the Back key.** It loads your app in an iframe inside LG's generic `com.sdk.ares.hostedapp`, whose manifest lacks `disableBackHistoryAPI`, so Back and launch params never reach your app. It also relaunches the whole app on every file event. `tv:dev` instead installs a `<id>.dev` shell that carries your own manifest and sends its whole window to `scripts/dev-server.mjs`, a dependency-free server with live reload. Remove the shell with `ares-install -d tv -r <id>.dev`.
- **The TV's IP changed.** Give the TV a fixed IP (DHCP reservation) in your router, or run `pair` again with the new IP.
- **Node version.** LG recommends Node 14–16; CLI 3.x works on 25. Under nvm, global packages are per Node version, so switching versions means running `setup:cli` again.

## Building on the app

`app/js/tv.js` handles the TV-specific plumbing; `index.html` shows each part in use.

```js
// Rows of focusable elements. OK, Enter or a click runs el._select.
tile._select = function () { TV.toast("Selected"); };
TV.nav.push({ rows: [{ items: tiles }, { items: more, track: trackEl, viewport: viewportEl }] });
TV.nav.push({ rows: [{ items: dialogButtons }], onClose: hideDialog }); // overlay: traps focus, Back pops it

TV.onInput = function (action) { if (action === "red") { /* ... */ return true; } }; // see every input first
TV.luna("com.palm.systemservice", "time/getSystemTime").then(...);                 // luna:// as a promise
TV.appInstalled("netflix").then(function (yes) { if (yes) TV.launchApp("netflix"); });
TV.idle(5 * 60 * 1000, startScreensaver);
```

- **Input:** D-pad, the Magic Remote pointer (hover focuses, click selects) and Bluetooth gamepads (Cross/A = OK, Circle/B = Back) all arrive as the same actions. Back closes the top overlay, then calls `onBack` or exits the app.
- **Resolution:** web apps render at 1920×1080. 4K isn't supported for web apps; the TV scales up.
- **Overscan:** keep content about 5% in from the screen edges (the body has 54px/96px padding).
- **Luna Service calls** need the matching group in `requiredACG`. Look it up in the [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide). `ares-package` warns when `requiredACG` is missing.
- The page also opens in a desktop browser for quick UI work (`TV.onWebOS` is false there; Esc/Backspace act as Back).
- **Before building something big, read [`docs/performance.md`](docs/performance.md)** (what's slow on a TV and what to do instead) and [`docs/platform.md`](docs/platform.md) (keys, permissions, what apps can and can't do).

## Docs

- Getting started: <https://webostv.developer.lge.com/develop/getting-started/build-your-first-web-app>
- Developer Mode: <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>
- CLI guide: <https://webostv.developer.lge.com/develop/tools/cli-dev-guide>
- appinfo.json: <https://webostv.developer.lge.com/develop/references/appinfo-json>
