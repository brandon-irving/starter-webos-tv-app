---
name: webos-tv-setup
description: Turn on Developer Mode on an LG webOS TV and pair it with this machine (ares-setup-device, ares-novacom --getkey). Use when the user wants to connect, pair, or set up a TV, enable dev mode, or when ares commands fail with "Failed to get ssh private key", "All configured authentication methods failed", connection refused, or an expired dev mode session.
---

# Developer Mode and TV pairing

Pairing means registering the TV as an `ares` device. After that, every CLI command is SSH to `prisoner@<TV_IP>:9922`, using a key downloaded from the TV's key server on port 9991.

## 1. On the TV (only the user can do this)

Walk the user through these steps and wait for them:

1. Create an account at https://webostv.developer.lge.com if they don't have one.
2. On the TV, open the **LG Content Store**, search for **Developer Mode**, install it and open it. Sign in.
3. Turn **Dev Mode Status** ON. The TV reboots. Then open the app again.
4. Turn **Key Server** ON and keep the app on screen.
5. Ask for the **IP address** and the 6-character **Passphrase** (case-sensitive). A photo of the screen works.

When reading a photo of the screen: an ON toggle has a teal tint, and an OFF toggle is plain white. Users often think Key Server is on when it isn't.

## 2. Pair (you run this)

```bash
cd <this repo, or a project created from it>
npm run pair -- <TV_IP> <PASSPHRASE> [device-name, default "tv"]
```

Or put `TV_IP` and `TV_PASSPHRASE` in `.env` (copy `.env.example`) and run `npm run tv`: it pairs only when needed, then installs and launches.

`scripts/pair-tv.sh` checks ports 9922 and 9991 first, adds or updates the device, downloads the key, stores the passphrase, makes it the default device and runs `ares-device -i`. Success prints modelName / sdkVersion / firmwareVersion. Then tell the user they can turn Key Server off.

## Troubleshooting (all seen on a real TV)

| Symptom | Cause | Fix |
|---|---|---|
| Device listed as `prisoner@127.0.0.1:9922` | Used `-i "ip=..."`; the option is `host=` | `ares-setup-device -m tv -i "host=<IP>"` |
| `Failed to get ssh private key` | Key Server OFF, so port 9991 is closed | Turn Key Server ON (teal), keep the app open, retry |
| `All configured authentication methods failed` | Passphrase not saved: the getkey prompt ignores piped stdin | `ares-setup-device -m tv -i "privatekey=tv_webos" -i "passphrase=<PASS>"` |
| Port 9922 closed | Dev Mode off, TV asleep, or on a different network | Check Dev Mode Status; same LAN as the Mac |
| Worked yesterday, fails now | TV got a new IP from DHCP | Run `npm run pair` again with the new IP; suggest a DHCP reservation |
| Dev apps gone, app shows the login screen | Session expired (or 10 reboots offline). Expiry uninstalls dev apps | Sign in, turn Dev Mode on, pair again, redeploy. Remind the user to press EXTEND |

Run `npm run doctor` any time to check every link in the chain.

## Facts

- Port 9922: dev SSH, user `prisoner`, no password.
- Port 9991: key server, `GET /webos_rsa`. The key is saved to `~/.ssh/<device>_webos`.
- The device list lives in `~/.webos/`. `ares-setup-device -l` shows it, including the stored passphrase.
- Multiple TVs: pair each under its own name and target one with `WEBOS_DEVICE=<name> npm run deploy`.
