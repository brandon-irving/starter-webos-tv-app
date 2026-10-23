# starter-webos-tv-app

Template for LG webOS TV web apps, plus Claude Code skills for the workflow.

- `app/`: the packaged web app (`appinfo.json` manifest, `index.html`, `styles.css`, `js/tv.js`). Everything in it ships in the `.ipk`. `js/tv.js` is the shared plumbing (`window.TV`: `nav` focus layers, `input` for remote/pointer/gamepad, `luna`, `appInstalled`/`launchApp`, `toast`/`systemToast`, `idle`); build on it rather than writing key handling again.
- `scripts/`: bash behind the npm scripts. `lib.sh` holds shared helpers; `pair-tv.sh` encodes the CLI workarounds documented in the README. `tv-up.sh` is the one-command flow (`npm run tv`, `npm run tv:dev`); `dev-server.mjs` serves `app/` with live reload for `tv:dev`. `cdp.mjs` is behind `npm run shot` / `eval` / `key` / `logs`.
- `.env` (gitignored, from `.env.example`): `TV_IP` and `TV_PASSPHRASE`, read by `tv-up.sh` to pair when needed. `npm run new` never copies it.
- `docs/performance.md` and `docs/platform.md`: read before writing UI or platform code; add what you learn on the TV.
- `.claude/skills/`: `webos-bootstrap` (new app and CLI), `webos-tv-setup` (Developer Mode and pairing), `webos-dev-loop` (deploy, dev, inspect, ACG).

Conventions:
- The target device name defaults to `tv`; override with `WEBOS_DEVICE`.
- Every `luna://` call needs its ACG group in `app/appinfo.json` → `requiredACG`.
- Classic scripts only (no ES modules): packaged apps load from `file://`. No CSS `filter: blur()` on large areas (see `docs/performance.md`).
- After changing `app/`, run `npm run package` to confirm it still builds. On a paired TV, verify with `npm run deploy`, then `npm run shot` (and read the image), `npm run eval`, `npm run key` instead of assuming. Deploying needs a paired TV, so ask the user before assuming one exists.
- Never commit device-specific values (TV IPs, passphrases, `.env`, `~/.webos` contents).
- Don't use `ares-launch --hosted` for dev; it puts the app in an iframe where Back never arrives. Use `npm run tv:dev`.
