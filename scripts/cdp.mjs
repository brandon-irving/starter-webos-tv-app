// Look at and drive the app running on the TV from the terminal, over the Chrome DevTools Protocol.
// It opens an ares-inspect tunnel, does one thing and closes it, so it works from scripts and Claude Code.
//
//   npm run shot [-- out.jpg]          screenshot of the app (default dist/shot.jpg)
//   npm run eval -- '<js>'             run JS in the page, print the result as JSON (promises are awaited)
//   npm run key -- down down ok back   send remote keys (left right up down ok back red green yellow blue
//                                      play pause stop, or a numeric keyCode); 250 ms apart
//   npm run logs [-- 10]               print the page's console output for N seconds (default 10)
//
// Launches the app first if it isn't running. Device: WEBOS_DEVICE (default "tv"). Needs Node 22+ (WebSocket).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP_ID = JSON.parse(fs.readFileSync(path.join(ROOT, "app/appinfo.json"), "utf8")).id;
const DEVICE = process.env.WEBOS_DEVICE || "tv";
const KEYS = {
  left: 37, up: 38, right: 39, down: 40, ok: 13, enter: 13, back: 461,
  red: 403, green: 404, yellow: 405, blue: 406, play: 415, pause: 19, stop: 413, rewind: 412, forward: 417,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => { console.error(`xx  ${msg}`); process.exit(1); };

const [cmd, ...args] = process.argv.slice(2);
if (!["shot", "eval", "key", "logs"].includes(cmd)) die("Usage: cdp.mjs shot [out.jpg] | eval '<js>' | key <name...> | logs [seconds]");
if (typeof WebSocket === "undefined") die(`Node ${process.version} has no WebSocket; use Node 22 or newer.`);

function ensureRunning() {
  const running = execFileSync("ares-launch", ["-d", DEVICE, "-r"], { encoding: "utf8" });
  if (running.includes(APP_ID)) return false;
  console.error(`==> ${APP_ID} isn't running; launching it`);
  execFileSync("ares-launch", ["-d", DEVICE, APP_ID], { stdio: "ignore" });
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
      if (m) resolve({ child, port: Number(m[1]) });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => reject(new Error(`ares-inspect exited: ${out.trim() || "no output"}`)));
    setTimeout(() => reject(new Error("ares-inspect gave no port within 20 s")), 20000);
  });
}

async function connect(port) {
  // The tunnel can take a moment before /json answers
  for (let i = 0; i < 20; i++) {
    try {
      const pages = await (await fetch(`http://localhost:${port}/json`)).json();
      const page = pages.find((p) => p.webSocketDebuggerUrl);
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("DevTools WebSocket failed")); });
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
    send: (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); }),
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
    const out = path.resolve(args[0] || path.join(ROOT, "dist/shot.jpg"));
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
