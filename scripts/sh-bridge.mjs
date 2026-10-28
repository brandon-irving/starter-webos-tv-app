// Gives the bash scripts the values defined in lib.mjs, so nothing is worked out twice.
//
//   node scripts/sh-bridge.mjs env              shell assignments, read by lib.sh (eval)
//   node scripts/sh-bridge.mjs host-ip <TV_IP>  this machine's address on the route to the TV
//   node scripts/sh-bridge.mjs dev-shell <dir> <url>   write the tv:dev shell app, print its id
import { loadSettings, readManifest, nodeMinMajor, hostIpFor, writeDevShell, DEV_SUFFIX } from "./lib.mjs";

const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "env") {
  const s = loadSettings();
  const vars = {
    DEVICE: s.WEBOS_DEVICE,
    TV_IP: s.TV_IP,
    TV_PASSPHRASE: s.TV_PASSPHRASE,
    DEV_PORT: s.DEV_PORT,
    HOST_IP: s.HOST_IP,
    WEBOS_DEV: s.WEBOS_DEV,
    NODE_MIN: nodeMinMajor(),
    APP_ID: "",
    APP_VERSION: "",
    DEV_ID: "",
    MANIFEST_ERROR: "",
  };
  try {
    const info = readManifest();
    Object.assign(vars, { APP_ID: info.id, APP_VERSION: info.version, DEV_ID: info.id + DEV_SUFFIX });
  } catch (e) {
    vars.MANIFEST_ERROR = e.message;
  }
  for (const [k, v] of Object.entries(vars)) console.log(`${k}=${q(v)}`);
} else if (cmd === "host-ip" && args[0]) {
  hostIpFor(args[0]).then(console.log, (e) => { console.error(e.message); process.exit(1); });
} else if (cmd === "dev-shell" && args[1]) {
  console.log(writeDevShell(args[0], args[1]));
} else {
  console.error("Usage: sh-bridge.mjs env | host-ip <TV_IP> | dev-shell <dir> <url>");
  process.exit(1);
}
