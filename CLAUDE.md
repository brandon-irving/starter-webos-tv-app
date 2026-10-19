# starter-webos-tv-app

Template for LG webOS TV web apps, plus Claude Code skills for the workflow.

- `app/`: the packaged web app (`appinfo.json` manifest + `index.html`). Everything in it ships in the `.ipk`.
- `scripts/`: bash behind the npm scripts. `lib.sh` holds shared helpers; `pair-tv.sh` encodes the CLI workarounds documented in the README.
- `.claude/skills/`: `webos-bootstrap` (new app and CLI), `webos-tv-setup` (Developer Mode and pairing), `webos-dev-loop` (deploy, dev, inspect, ACG).

Conventions:
- The target device name defaults to `tv`; override with `WEBOS_DEVICE`.
- Every `luna://` call needs its ACG group in `app/appinfo.json` → `requiredACG`.
- After changing `app/`, run `npm run package` to confirm it still builds. Deploying needs a paired TV, so ask the user before assuming one exists.
- Never commit device-specific values (TV IPs, passphrases, `~/.webos` contents).
