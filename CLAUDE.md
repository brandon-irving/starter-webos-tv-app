# starter-webos-tv-app

Template for LG webOS TV web apps, plus Claude Code skills for the workflow.

- `app/`: the packaged web app (`appinfo.json` manifest, `index.html`, `styles.css`, `js/tv.js`). Everything in it ships in the `.ipk`. `js/tv.js` is the shared plumbing (`window.TV`: `nav` focus layers and text editing, `input` for remote/pointer/gamepad, `luna`, `appInstalled`/`launchApp`, `toast`, `idle`); build on it rather than writing key handling again.
- `scripts/`: behind the npm scripts. `lib.mjs` is the single source for settings (environment > `.env` > defaults), manifest checks, the `.dev` id and the minimum Node version; bash gets them through `sh-bridge.mjs` (sourced by `lib.sh`). `pair-tv.sh` encodes the CLI workarounds documented in the README. `tv-up.sh` is the one-command flow (`npm run tv`, `npm run tv:dev`, `--config`); `dev-server.mjs` serves `app/` with live reload for `tv:dev`. `cdp.mjs` is behind `npm run shot` / `eval` / `key` / `logs`. `create-app.mjs` is `npm run new`.
- `test/`: `npm test` (node:test; Playwright Chromium for `tv.js`). CI in `.github/workflows/ci.yml` (macOS + Linux, Node 22 + 24).
- `.env` (gitignored, from `.env.example`): `TV_IP`, `TV_PASSPHRASE` and the optional settings listed in `lib.mjs` `SETTINGS`. `npm run new` never copies it.
- `docs/performance.md` and `docs/platform.md`: read before writing UI or platform code; add what you learn on the TV.
- `.claude/skills/`: `webos-bootstrap` (new app and CLI), `webos-tv-setup` (Developer Mode and pairing), `webos-dev-loop` (deploy, dev, inspect, ACG).

Conventions:
- The target device name defaults to `tv`; override with `WEBOS_DEVICE`. TV commands act on the packaged app; `--dev` / `WEBOS_DEV=1` targets the `tv:dev` app (`<id>.dev`).
- Support claims: targets webOS TV 22+ (Chromium 87); hardware-tested on webOS TV 26 only. Keep CSS/JS within Chromium 87, and don't widen claims without a recorded hardware result. The demo is a 1080p layout (Full HD TVs render 1280×720).
- `tv.js` and the default demo use only documented third-party behavior. Developer-Mode-only tricks (system toasts) live in `docs/platform.md`.
- Every `luna://` call needs its ACG group in `app/appinfo.json` → `requiredACG`.
- Classic scripts only (no ES modules): packaged apps load from `file://`. No CSS `filter: blur()` on large areas (see `docs/performance.md`).
- After changing `app/` or `scripts/`, run `npm test` and `npm run package`. On a paired TV, verify with `npm run deploy`, then `npm run shot` (and read the image), `npm run eval`, `npm run key` instead of assuming. Deploying needs a paired TV, so ask the user before assuming one exists.
- Never commit device-specific values (TV IPs, passphrases, `.env`, `~/.webos` contents).
- Don't use `ares-launch --hosted` for dev; it puts the app in an iframe where Back never arrives. Use `npm run tv:dev`.
