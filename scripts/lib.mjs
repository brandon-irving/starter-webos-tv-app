// Shared helpers for the Node scripts. The bash scripts get the same values through scripts/sh-bridge.mjs,
// so the manifest checks, the dev app id and the settings are defined once, here.
import fs from "node:fs";
import path from "node:path";
import dgram from "node:dgram";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = path.join(ROOT, "app");
export const DIST_DIR = path.join(ROOT, "dist");

/** `npm run tv:dev` installs a shell under this id suffix, next to the packaged app. */
export const DEV_SUFFIX = ".dev";

/**
 * Every setting the scripts read: from the environment first, then .env, then the default.
 * Keep .env.example in step with this list.
 */
export const SETTINGS = {
  WEBOS_DEVICE: "tv", // name the TV is registered under (ares-setup-device)
  TV_IP: "", // used by npm run tv / tv:dev to pair when needed
  TV_PASSPHRASE: "",
  DEV_PORT: "5500", // tv:dev server port
  HOST_IP: "", // this machine's address as the TV sees it; detected when empty
  WEBOS_DEV: "", // "1": shot/eval/key/logs/inspect/close/uninstall target the <id>.dev app
  CDP_TIMEOUT_MS: "30000", // per DevTools command (npm run eval waits for promises up to this long)
};

// ---------- Settings ----------

/** Parse a .env file without executing it. Supports KEY=value, optional quotes, comments. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

export function loadSettings({ root = ROOT, env = process.env } = {}) {
  const file = path.join(root, ".env");
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  const out = {};
  for (const [k, def] of Object.entries(SETTINGS)) out[k] = env[k] || fromFile[k] || def;
  return out;
}

// ---------- Manifest ----------

export class ManifestError extends Error {}

const RESERVED_PREFIXES = ["com.palm", "com.webos", "com.lge", "com.palmdts"];

/** null if `id` is a usable webOS app id, else why not. Also used by create-app.mjs. */
export function appIdProblem(id) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(id) || !id.includes(".")) {
    return `app id must be lowercase reverse-domain, e.g. "com.yourname.app" (got ${JSON.stringify(id)})`;
  }
  const reserved = RESERVED_PREFIXES.find((p) => id === p || id.startsWith(p + "."));
  if (reserved) return `app id prefix "${reserved}" is reserved by LG`;
  if (id.endsWith(DEV_SUFFIX)) return `app id can't end in "${DEV_SUFFIX}"; tv:dev uses that suffix for its shell`;
  return null;
}

/** Read and check app/appinfo.json. Throws ManifestError with every problem found, phrased as a fix. */
export function readManifest(appDir = APP_DIR) {
  const file = path.join(appDir, "appinfo.json");
  const name = path.relative(process.cwd(), file) || file;
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new ManifestError(`${name} not found`);
  }
  let info;
  try {
    info = JSON.parse(text);
  } catch (e) {
    throw new ManifestError(`${name} is not valid JSON: ${e.message}`);
  }
  if (!info || typeof info !== "object" || Array.isArray(info)) throw new ManifestError(`${name} must be a JSON object`);
  const problems = [];
  const idProblem = appIdProblem(info.id);
  if (idProblem) problems.push(`"id": ${idProblem}`);
  if (typeof info.version !== "string" || !/^\d+\.\d+\.\d+$/.test(info.version)) {
    problems.push(`"version" must be three numbers like "1.0.0" (got ${JSON.stringify(info.version)})`);
  }
  for (const k of ["title", "main", "type"]) if (!info[k]) problems.push(`"${k}" is missing`);
  if (info.main && !fs.existsSync(path.join(appDir, info.main))) problems.push(`"main" is ${info.main}, which doesn't exist in ${path.basename(appDir)}/`);
  if (problems.length) throw new ManifestError(`${name} has problems:\n  - ${problems.join("\n  - ")}`);
  return info;
}

// ---------- Which app on the TV ----------

/** True when the command line or WEBOS_DEV=1 asks for the live-reload app. */
export function wantsDev(argv = process.argv, settings = loadSettings()) {
  return argv.includes("--dev") || settings.WEBOS_DEV === "1";
}

export function appTarget({ dev = false, appDir = APP_DIR } = {}) {
  const { id } = readManifest(appDir);
  return dev ? id + DEV_SUFFIX : id;
}

/** `ares-launch -r` prints one running app id per line. Exact match: "x.dev" must not count as "x". */
export function isRunning(listOutput, id) {
  return listOutput.split(/\r?\n/).some((line) => line.trim() === id);
}

// ---------- Node version policy ----------

/** The minimum Node major from package.json "engines" (the one place it's declared). */
export function nodeMinMajor(root = ROOT) {
  const range = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).engines?.node ?? "";
  return Number((range.match(/\d+/) || [0])[0]);
}

// ---------- Networking ----------

/**
 * This machine's IPv4 address on the route to `targetIp`. Connecting a UDP socket sends nothing; it only makes
 * the OS pick the outgoing interface, which works the same on macOS, Linux and Windows.
 */
export function hostIpFor(targetIp) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    sock.on("error", (e) => { sock.close(); reject(e); });
    sock.connect(9, targetIp, () => {
      const { address } = sock.address();
      sock.close();
      resolve(address);
    });
  });
}

// ---------- tv:dev shell ----------

/**
 * Write the tiny app that tv:dev installs as <id>.dev: this app's own manifest (so Back and launch params behave
 * the same) and a page that navigates its whole window to the dev server once it answers.
 */
export function writeDevShell(outDir, url, appDir = APP_DIR) {
  const info = readManifest(appDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const k of ["icon", "largeIcon"]) {
    if (info[k]) {
      fs.copyFileSync(path.join(appDir, info[k]), path.join(outDir, path.basename(info[k])));
      info[k] = path.basename(info[k]);
    }
  }
  info.id += DEV_SUFFIX;
  info.title += " (dev)";
  info.main = "index.html";
  fs.writeFileSync(path.join(outDir, "appinfo.json"), JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(outDir, "index.html"), `<!DOCTYPE html><html><body style="background:#000;color:#888;font:28px sans-serif;padding:96px">
Waiting for the dev server at ${url}…<br>Run <b>npm run tv:dev</b> on your machine.
<script>
  var url = ${JSON.stringify(url)};
  function go() { fetch(url, { mode: "no-cors" }).then(function () { location.replace(url); }, function () { setTimeout(go, 2000); }); }
  go();
</script></body></html>`);
  return info.id;
}
