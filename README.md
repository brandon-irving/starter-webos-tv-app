# starter-webos-tv-app

A template for LG webOS TV web apps. It includes an HTML/JS app that works with the TV remote, plus scripts to install the CLI, pair a TV, deploy and debug.

Verified on an LG 65NU700BPUA (webOS SDK 11.2) with webOS CLI 3.2.6 on Node 25, October 2026.

## Layout

```
app/                 the webOS app (this folder is what gets packaged)
  appinfo.json       manifest: id, version, title, icons, ACG permissions
  index.html         starter UI: D-pad focus, Back key, device info, Luna call
  webOSTVjs-1.2.13/  LG's webOSTV.js library (webOS.service, deviceInfo, platformBack)
scripts/             bash helpers behind the npm scripts
dist/                built .ipk packages (gitignored)
```

## Quick start

```bash
npm run setup:cli                          # installs @webos-tools/cli globally if missing
npm run new -- ../my-app com.me.myapp "My App"   # make a copy with a new app ID
cd ../my-app
npm run pair -- 192.168.1.50 AB12CD        # TV IP + passphrase from the Developer Mode app
npm run deploy                             # package, install and launch on the TV
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
| `npm run doctor` | Checks the CLI, the manifest, the device registration, TV reachability and SSH auth |
| `npm run pair -- <IP> <PASS> [name]` | Registers the TV, downloads its SSH key and makes it the default device |
| `npm run deploy` | Packages, installs and launches the app |
| `npm run dev` | Runs `app/` from your machine without installing; reloads on save |
| `npm run inspect` | Opens Chrome DevTools connected to the app running on the TV |
| `npm run launch` / `close` / `uninstall` / `list` | App lifecycle on the TV |
| `npm run tv-info` | Model, SDK and firmware |
| `npm run sim` | Runs the app in the webOS TV Simulator (download it separately from LG; set `WEBOS_SIM_VERSION`) |

The scripts use the device named `tv`. To target another TV, set `WEBOS_DEVICE=bedroom npm run deploy`.

## Problems we hit and how the scripts handle them

- **`ares-setup-device -i "ip=..."` silently saves 127.0.0.1.** The option is `host=`. `pair-tv.sh` uses `host`.
- **`ares-novacom --getkey` fails with "Failed to get ssh private key".** Key Server is off. It serves the key on port 9991, and `pair` checks that port first.
- **"All configured authentication methods failed" after getkey.** The passphrase prompt doesn't read piped input, so the passphrase never got saved. `pair` writes `passphrase=` into the device entry directly.
- **The TV's IP changed.** Give the TV a fixed IP (DHCP reservation) in your router, or run `pair` again with the new IP.
- **Node version.** LG recommends Node 14–16; CLI 3.x works on 25. Under nvm, global packages are per Node version, so switching versions means running `setup:cli` again.

## Building on the app

- **Resolution:** web apps render at 1920×1080. 4K isn't supported for web apps; the TV scales up.
- **Overscan:** keep content about 5% in from the screen edges (the body has 54px/96px padding).
- **Remote keys:** Left 37, Up 38, Right 39, Down 40, OK 13, Back 461. With `disableBackHistoryAPI: true` the app receives Back itself; call `webOS.platformBack()` to exit.
- **Magic Remote** also works as a mouse pointer, so handle `mouseover`/`click` as well as keys.
- **Luna Service calls** (`webOS.service.request("luna://...")`) need the matching group in `requiredACG`. Look it up in the [ACG guide](https://webostv.developer.lge.com/develop/guides/acg-guide). `ares-package` warns when `requiredACG` is missing.
- `index.html` checks for `window.webOS`, so the page also opens in a desktop browser for quick UI work.

## Docs

- Getting started: <https://webostv.developer.lge.com/develop/getting-started/build-your-first-web-app>
- Developer Mode: <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>
- CLI guide: <https://webostv.developer.lge.com/develop/tools/cli-dev-guide>
- appinfo.json: <https://webostv.developer.lge.com/develop/references/appinfo-json>
