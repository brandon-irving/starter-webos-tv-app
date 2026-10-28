# starter-webos-tv-app

A template for LG webOS TV web apps. It includes an HTML/JS app that works with the TV remote, plus scripts to install the CLI, pair a TV, deploy, live-reload and inspect the app on the TV from your terminal.

**Targets webOS TV 22+; hardware-tested on webOS TV 26 only.** The code sticks to what Chromium 87 (webOS TV 22's engine) supports, but a Chromium version doesn't establish platform compatibility, so older webOS versions stay unverified until someone runs them.

## Support

| | Status |
|---|---|
| **Targeted** | webOS TV 22 and newer (Chromium 87+). LG TV web apps only, not other webOS products (signage, webOS OSE). |
| **Tested on hardware** | LG 65NU700BPUA (UHD), webOS TV 26 (SDK 11.2, Chromium 132), October 2026. |
| **Unverified** | webOS TV 22–25 on hardware; Full HD (1280×720) models; the webOS TV Simulator; lower-memory TVs other than the one above. |
| **Host machines** | macOS: tested with a TV, and in CI. Linux: CI only (no TV). Windows: unverified; the scripts need bash, `curl` and `nc` (WSL untested). |
| **Node and CLI** | Node 22+ (the `engines` minimum); `.nvmrc` pins 24 LTS. `@webos-tools/cli` 3.2.6, validated on Node 22.12, 24.20 and 25.6. LG's docs still list Node 14–16 for the CLI; those releases are end-of-life. |

The demo is a **1080p layout tested on a UHD TV**. It hasn't been laid out for 720p yet (see [Resolution](#resolution)).

## Layout

```
app/                 the webOS app (this folder is what gets packaged)
  appinfo.json       manifest: id, version, title, icons, ACG permissions
  index.html         demo UI: focus rows (one scrolls), a search field, an overlay, toasts, app launch, device info
  styles.css
  js/tv.js           focus, text editing, input (remote, pointer, gamepad), Luna helpers, toasts, idle
  webOSTVjs-1.2.13/  LG's webOSTV.js library (webOS.service, deviceInfo, platformBack)
scripts/             helpers behind the npm scripts; lib.mjs holds the shared settings and manifest checks
test/                tv.js interaction tests (headless Chromium) and tooling tests; npm test
docs/                performance.md and platform.md: what we learned on a real TV
dist/                built .ipk packages (gitignored)
```

## Quick start

On GitHub, press **Use this template** to make your own repository, then clone it. Or clone this repo and copy it with `npm run new`:

```bash
nvm install                                # Node from .nvmrc (or any Node 22+)
npm run setup:cli                          # installs @webos-tools/cli globally if missing
npm run new -- ../my-app com.me.myapp "My App"   # a copy with a new app ID (skip if you used the template button)
cd ../my-app
cp .env.example .env                       # add TV_IP + TV_PASSPHRASE from the Developer Mode app
npm run tv                                 # pairs if needed, then packages, installs and launches
npm run tv:dev                             # live reload on the TV while you edit app/
```

No TV yet? Open `app/index.html` in a desktop browser: the UI works with the keyboard (arrows, Enter, Esc as Back) and the mouse.

## Claude Code skills

`.claude/skills/` contains three [Claude Code](https://claude.com/claude-code) skills that load when you run `claude` inside this repo or inside a project created from it (`npm run new` copies them). They're a convenience: every step they take is an npm script documented here.

| Skill | Handles |
|---|---|
| `webos-bootstrap` | Installing the CLI, creating a new app from this template, checking that it packages |
| `webos-tv-setup` | Walking you through Developer Mode on the TV, pairing, and troubleshooting every pairing error we've seen |
| `webos-dev-loop` | Deploy, live reload, DevTools, remote and focus handling, ACG permissions for Luna calls |

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
| `npm run tv:dev` (or `dev`) | Live reload on the TV: serves `app/` from your machine to a `<id>.dev` shell app and reloads it on every save. Ctrl+C stops |
| `npm run tv -- --dev --config` | Prints the settings those would use (from the environment and `.env`), without touching the TV |
| `npm run doctor` | Checks Node, the CLI, the manifest, the device registration, TV reachability and SSH auth |
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
| `npm test` | Interaction and tooling tests, no TV needed (run `npm install` and `npx playwright install chromium` once) |

**Packaged app or live-reload app:** `shot`, `eval`, `key`, `logs`, `inspect`, `launch`, `close` and `uninstall` act on the packaged app. Add `--dev` (`npm run logs -- --dev`) or set `WEBOS_DEV=1` to act on the `tv:dev` app instead. The two have different ids (`<id>` and `<id>.dev`) and the scripts match them exactly.

**Settings** come from the environment first, then `.env`, then defaults: `TV_IP`, `TV_PASSPHRASE`, `WEBOS_DEVICE` (default `tv`), `DEV_PORT` (5500), `HOST_IP` (detected), `WEBOS_DEV`, `CDP_TIMEOUT_MS`. See `.env.example`.

## Live reload vs. the packaged app

`tv:dev` is for fast UI work. It isn't the same environment as the app you ship, so **test the packaged app (`npm run deploy`) before you rely on anything involving network, login or storage.**

| | Desktop browser | `tv:dev` | Simulator | Installed (`npm run deploy`) |
|---|---|---|---|---|
| Page origin | `file://` | `http://<your machine>:5500` | `file://` | `file://` |
| Cookies | yes | yes | not checked | **no**: LG doesn't support cookies in packaged apps |
| `localStorage` | separate per origin | separate from the installed app | not checked | the app's own store |
| CORS | as your browser | requests come from your machine's origin | not checked | `file://` origin |
| Luna services, Back key, launch params | no | yes (the shell has your manifest) | not checked | yes |
| Remote, pointer, TV keyboard | keyboard and mouse | yes | emulated | yes |
| Video and DRM | desktop codecs | TV | differs from TV, no DRM | TV |

A login that works under `tv:dev` because a cookie was set can fail once packaged. Prefer token-based auth stored by the app.

## Building on the app

`app/js/tv.js` handles the TV-specific plumbing; `index.html` shows each part in use.

```js
// Rows of focusable elements. OK, Enter or a click runs el._select.
tile._select = function () { TV.toast("Selected"); };
TV.nav.push({ rows: [{ items: tiles }, { items: [searchInput] }, { items: more, track: trackEl, viewport: viewportEl }] });
TV.nav.push({ rows: [{ items: dialogButtons }], onClose: hideDialog }); // overlay: traps focus, Back pops it
TV.nav.update(layer, newRows);                     // rows changed: focus stays on the same element if it's still there

TV.onInput = function (action) { if (action === "red") { /* ... */ return true; } }; // see every input first
TV.luna("com.palm.systemservice", "time/getSystemTime").then(...);                 // luna:// as a promise
TV.appInstalled("netflix").then(function (yes) { if (yes) TV.launchApp("netflix"); }, showError);
TV.idle(5 * 60 * 1000, startScreensaver);
```

- **Input:** D-pad, the Magic Remote pointer (hover focuses, click focuses then selects) and Bluetooth gamepads (Cross/A = OK, Circle/B = Back) all arrive as the same actions in `TV.input`, and `TV.onInput` sees each one once. Back closes the top overlay, then calls `onBack` or exits the app.
- **Text fields:** put an `<input>`, `<textarea>` or `contenteditable` element (or an element containing one) in a row without a `_select`. Navigating onto it only highlights it; selecting it gives it focus and opens the TV keyboard. While typing, keys go to the field (Backspace deletes, arrows move the caret). Back, or Enter in a one-line input, leaves the field and navigation resumes on it. Listen for `input` (each keystroke) or `change` (on leaving).
- **Semantics:** use `<button>` for actions; the focused item also gets browser focus, so it's what assistive technology reads. Mark overlays `role="dialog" aria-modal="true"`. The `.focused` class is the visible indicator.
- **Overscan:** keep content about 5% in from the screen edges (the body has 54px/96px padding).
- **Luna Service calls** need the matching group in `requiredACG`. Look it up in the [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide). Errors carry the service's `errorCode` and `errorText`.
- **Before building something big, read [`docs/performance.md`](docs/performance.md)** (what's slow on a TV and what to do instead) and [`docs/platform.md`](docs/platform.md) (keys, permissions, what apps can and can't do).

### Resolution

LG renders web app graphics at **1920×1080 on UHD models and 1280×720 on Full HD models**. Video can play at a higher resolution than the UI (4K on UHD models). `"resolution"` in `appinfo.json` is `1920x1080` by default; LG suggests submitting a separate 1280×720 package for Full HD models ([app resolution spec](https://webostv.developer.lge.com/develop/specifications/app-resolution)). Check what you got with `window.innerWidth`.

This demo is laid out for 1920×1080 only. At 720p its rows don't fit. A layout that scales to both is planned, not done.

## Testing and releasing

`npm test` runs in headless Chromium and plain Node, with no TV. It covers:
- reopening overlays, pointer/D-pad switching, reordered and removed items, and elements moving between layers;
- text editing, and pointer clicks reaching `TV.onInput` exactly once;
- dev vs. packaged app ids, paths with spaces, malformed dev-server URLs, invalid manifests, and `.env` settings;
- generating and packaging a project.

CI (`.github/workflows/ci.yml`) runs it on macOS and Linux with Node 22 and 24.

The automated tests don't replace the TV. Before tagging a release, on at least one real TV:
1. `npm run deploy`, then `npm run shot` and look at it.
2. Use the D-pad, the Magic Remote pointer, the search field with the TV keyboard, the overlay and Back with a physical remote.
3. `npm run tv:dev`, edit a file, and check that it reloads. Then `npm run eval -- --dev 'location.href'`.
4. Record the TV model, webOS version and result in the Support table.

## Problems we hit and how the scripts handle them

- **`ares-setup-device -i "ip=..."` silently saves 127.0.0.1.** The option is `host=`. `pair-tv.sh` uses `host`.
- **`ares-novacom --getkey` fails with "Failed to get ssh private key".** Key Server is off. It serves the key on port 9991, and `pair` checks that port first.
- **"All configured authentication methods failed" after getkey.** The passphrase prompt doesn't read piped input, so the passphrase never got saved. `pair` writes `passphrase=` into the device entry directly.
- **`ares-launch --hosted` (LG's no-install mode) breaks the Back key.** It loads your app in an iframe inside LG's generic `com.sdk.ares.hostedapp`, whose manifest lacks `disableBackHistoryAPI`, so Back and launch params never reach your app. It also relaunches the whole app on every file event. `tv:dev` instead installs a `<id>.dev` shell that carries your own manifest and sends its whole window to `scripts/dev-server.mjs`, a dependency-free server with live reload. Remove the shell with `npm run uninstall -- --dev`.
- **The TV's IP changed.** Give the TV a fixed IP (DHCP reservation) in your router, or run `pair` again with the new IP.
- **`tv:dev` picks the wrong address for your machine** (VPN, several network interfaces). Set `HOST_IP` in `.env`.
- **Node version.** Under nvm, global packages are per Node version, so switching versions means running `setup:cli` again.

## Docs

- Getting started: <https://webostv.developer.lge.com/develop/getting-started/build-your-first-web-app>
- Developer Mode: <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>
- CLI guide: <https://webostv.developer.lge.com/develop/tools/cli-dev-guide>
- appinfo.json: <https://webostv.developer.lge.com/develop/references/appinfo-json>
- Web engine versions and cookies: <https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine>
