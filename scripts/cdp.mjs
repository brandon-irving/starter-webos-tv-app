// Look at and drive the app running on the TV from the terminal, over the Chrome DevTools Protocol.
// It opens an ares-inspect tunnel, does one thing and closes it, so it works from scripts and Claude Code.
//
//   npm run shot [-- out.jpg]          screenshot of the app (default dist/shot.jpg)
//   npm run eval -- '<js>'             run JS in the page, print the result as JSON (promises are awaited)
//   npm run key -- down down ok back   send remote keys (left right up down ok back red green yellow blue
//                                      play pause stop, or a numeric keyCode); 250 ms apart
//   npm run logs [-- 10]               print the page's console output for N seconds (default 10)
//   node scripts/cdp.mjs target        print the app id these commands act on
//
// Add --dev (or set WEBOS_DEV=1) to act on the tv:dev live-reload app (<id>.dev) instead of the packaged one.
// Launches the app first if it isn't running. Device: WEBOS_DEVICE (default "tv"). Each DevTools command
// times out after CDP_TIMEOUT_MS (default 30000).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DIST_DIR, appTarget, isRunning, loadSettings, nodeMinMajor, wantsDev } from "./lib.mjs";

const KEYS = {
  left: 37, up: 38, right: 39, down: 40, ok: 13, enter: 13, back: 461,
  red: 403, green: 404, yellow: 405, blue: 406, play: 415, pause: 19, stop: 413, rewind: 412, forward: 417,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(`xx  ${msg}`); process.exit(1); };

/** Reject if `promise` hasn't settled within `ms`. */
function within(ms, promise, what) {
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const settings = loadSettings();
const DEV = wantsDev(process.argv, settings);
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== "--dev");
if (!["shot", "eval", "key", "logs", "target"].includes(cmd)) die("Usage: cdp.mjs shot [out.jpg] | eval '<js>' | key <name...> | logs [seconds] | target  [--dev]");

let APP_ID;
try {
  APP_ID = appTarget({ dev: DEV });
} catch (e) {
  die(e.message);
}
if (cmd === "target") {
  console.log(APP_ID);
  process.exit(0);
}
const DEVICE = settings.WEBOS_DEVICE;
const TIMEOUT = Number(settings.CDP_TIMEOUT_MS);
if (typeof WebSocket === "undefined") die(`Node ${process.version} has no WebSocket; use Node ${nodeMinMajor()} or newer (see .nvmrc).`);

function ensureRunning() {
  const running = execFileSync("ares-launch", ["-d", DEVICE, "-r"], { encoding: "utf8", timeout: 20000 });
  if (isRunning(running, APP_ID)) return false;
  console.error(`==> ${APP_ID} isn't running; launching it`);
  try {
    execFileSync("ares-launch", ["-d", DEVICE, APP_ID], { stdio: "pipe", timeout: 20000 });
  } catch (e) {
    const hint = DEV ? "Start the live-reload app first: npm run tv:dev" : "Install it first: npm run deploy (or add --dev for the tv:dev app)";
    throw new Error(`Couldn't launch ${APP_ID}: ${(e.stderr?.toString() || e.message).trim()}\n    ${hint}`);
  }
  return true;
}

/** Start ares-inspect and resolve with the local port it forwards to the app's DevTools. */
function openTunnel() {
  return new Promise((resolve, reject) => {
    const child = spawn("ares-inspect", ["-d", DEVICE, "-a", APP_ID], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (d) => {
      out += d;
      const m = out.match(/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => { clearTimeout(timer); reject(new Error(`ares-inspect exited: ${out.trim() || "no output"}`)); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("ares-inspect gave no port within 20 s")); }, 20000);
  });
}

async function connect(port) {
  // The tunnel can take a moment before /json answers
  for (let i = 0; i < 20; i++) {
    try {
      const pages = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(3000) })).json();
      const page = pages.find((p) => p.webSocketDebuggerUrl);
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await within(10000, new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("DevTools WebSocket failed")); }), "DevTools connection");
        return ws;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error("No inspectable page; is the app in the foreground?");
}

function client(ws) {
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) listeners.forEach((fn) => fn(msg));
  };
  return {
    send: (method, params = {}) => {
      const n = ++id;
      const reply = new Promise((res) => { pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
      return within(TIMEOUT, reply, method).finally(() => pending.delete(n));
    },
    on: (fn) => listeners.push(fn),
  };
}

let tunnel;
try {
  if (ensureRunning()) await sleep(3000);
  tunnel = await openTunnel();
  const ws = await connect(tunnel.port);
  const cdp = client(ws);

  if (cmd === "shot") {
    const out = path.resolve(args[0] || path.join(DIST_DIR, "shot.jpg"));
    const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
    if (!r.result) throw new Error(JSON.stringify(r.error || r));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(r.result.data, "base64"));
    console.log(out);
  } else if (cmd === "eval") {
    if (!args[0]) throw new Error("eval needs a JS expression");
    const r = await cdp.send("Runtime.evaluate", { expression: args.join(" "), returnByValue: true, awaitPromise: true });
    const ex = r.result?.exceptionDetails;
    if (ex) throw new Error(ex.exception?.description || ex.text);
    console.log(JSON.stringify(r.result?.result?.value ?? null, null, 2));
  } else if (cmd === "key") {
    if (!args.length) throw new Error("key needs at least one key name");
    for (const name of args) {
      const code = KEYS[name.toLowerCase()] ?? Number(name);
      if (!Number.isInteger(code)) throw new Error(`Unknown key '${name}'. One of: ${Object.keys(KEYS).join(" ")}, or a keyCode`);
      // Real key events (not synthetic DOM events), so they reach the page exactly like the remote's
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
      console.log(`key ${name} (${code})`);
      await sleep(250);
    }
  } else if (cmd === "logs") {
    const seconds = Number(args[0] || 10);
    cdp.on((msg) => {
      if (msg.method === "Runtime.consoleAPICalled") {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
        console.log(`[${msg.params.type}] ${text}`);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        console.log(`[exception] ${d.exception?.description || d.text}`);
      }
    });
    await cdp.send("Runtime.enable"); // replays recent console messages, then streams new ones
    console.error(`==> listening for ${seconds} s`);
    await sleep(seconds * 1000);
  }
  ws.close();
} catch (e) {
  console.error(`xx  ${e.message}`);
  process.exitCode = 1;
} finally {
  tunnel?.child.kill();
  process.exit();
}
