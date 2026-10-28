// The tooling, without a TV: project generation, manifest diagnostics, dev/packaged app targeting, settings from
// .env, the dev server's error handling, and packaging (when the webOS CLI is installed).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { ROOT, isRunning, parseEnv, appIdProblem } from "../scripts/lib.mjs";

const ID = "com.example.testapp";
let tmp, proj;

/** Run a command in the generated project; returns { code, out, err } instead of throwing. */
function run(cmd, args, { env = {}, cwd = proj } = {}) {
  const r = spawnSync(cmd, args, {
    cwd, encoding: "utf8", timeout: 60000,
    // A device name that can't exist keeps doctor from probing a real TV
    env: { ...process.env, WEBOS_DEVICE: "test-no-such-device", WEBOS_DEV: "", TV_IP: "", HOST_IP: "", DEV_PORT: "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const writeEnv = (text) => fs.writeFileSync(path.join(proj, ".env"), text);
const manifest = path.join("app", "appinfo.json");

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webos starter "));
  proj = path.join(tmp, "My TV App"); // spaces on purpose: paths must survive them everywhere
  execFileSync("node", [path.join(ROOT, "scripts/create-app.mjs"), proj, ID, "Test & <App>"], { env: { ...process.env, INIT_CWD: tmp } });
});
after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

// ---------- Project generation ----------

test("npm run new creates a project with the new id and title, without private or built files", () => {
  const info = JSON.parse(fs.readFileSync(path.join(proj, manifest), "utf8"));
  assert.equal(info.id, ID);
  assert.equal(info.version, "0.0.1");
  assert.match(fs.readFileSync(path.join(proj, "app/index.html"), "utf8"), /<title>Test &amp; &lt;App><\/title>/);
  for (const skipped of [".env", "node_modules", "dist", ".git"]) assert.ok(!fs.existsSync(path.join(proj, skipped)), skipped);
  assert.ok(fs.existsSync(path.join(proj, ".claude/skills")));
});

test("npm run new rejects bad and reserved ids and existing targets", () => {
  const create = (target, id) => run("node", [path.join(ROOT, "scripts/create-app.mjs"), target, id, "X"], { cwd: tmp });
  assert.match(create(path.join(tmp, "x1"), "Bad_Id").err, /reverse-domain/);
  assert.match(create(path.join(tmp, "x2"), "com.webos.mine").err, /reserved by LG/);
  assert.match(create(path.join(tmp, "x3"), "com.me.app.dev").err, /\.dev/);
  assert.match(create(proj, "com.me.other").err, /already exists/);
});

test("appIdProblem accepts normal ids", () => {
  assert.equal(appIdProblem("com.yourname.app"), null);
  assert.equal(appIdProblem("io.example.my-app2"), null);
});

// ---------- Dev vs packaged app ----------

test("cdp.mjs works from a path with spaces and targets the packaged app by default", () => {
  const r = run("node", ["scripts/cdp.mjs", "target"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trim(), ID);
});

test("--dev and WEBOS_DEV=1 target the tv:dev app, in Node and in bash", () => {
  assert.equal(run("node", ["scripts/cdp.mjs", "target", "--dev"]).out.trim(), `${ID}.dev`);
  assert.equal(run("node", ["scripts/cdp.mjs", "target"], { env: { WEBOS_DEV: "1" } }).out.trim(), `${ID}.dev`);
  assert.equal(run("bash", ["-c", "source scripts/lib.sh; target_id close --dev"]).out.trim(), `${ID}.dev`);
  assert.equal(run("bash", ["-c", "source scripts/lib.sh; target_id close"]).out.trim(), ID);
  assert.equal(run("bash", ["-c", "source scripts/lib.sh; target_id close"], { env: { WEBOS_DEV: "1" } }).out.trim(), `${ID}.dev`);
});

test("the running-app check matches ids exactly", () => {
  const out = "[Info] Set target device : tv\ncom.example.app.dev\ncom.other.app\n";
  assert.equal(isRunning(out, "com.example.app"), false); // only its .dev shell is running
  assert.equal(isRunning(out, "com.example.app.dev"), true);
  assert.equal(isRunning(out, "com.other"), false);
  assert.equal(isRunning("com.example.app\r\n", "com.example.app"), true);
});

test("the tv:dev shell is generated with the .dev id and this app's manifest", () => {
  const dir = path.join(tmp, "shell");
  const r = run("node", ["scripts/sh-bridge.mjs", "dev-shell", dir, "http://10.0.0.2:5500/"]);
  assert.equal(r.out.trim(), `${ID}.dev`);
  const info = JSON.parse(fs.readFileSync(path.join(dir, "appinfo.json"), "utf8"));
  assert.equal(info.id, `${ID}.dev`);
  assert.equal(info.disableBackHistoryAPI, true);
  assert.match(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /"http:\/\/10\.0\.0\.2:5500\/"/);
});

// ---------- Settings ----------

test(".env settings reach the dev workflow, and the environment overrides them", () => {
  writeEnv("TV_IP=10.9.8.7\nTV_PASSPHRASE='ABC123'\nDEV_PORT=6123\nHOST_IP=10.9.8.2   # this machine\nWEBOS_DEVICE=bedroom\n");
  try {
    const r = run("bash", ["scripts/tv-up.sh", "--dev", "--config"], { env: { WEBOS_DEVICE: "" } });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /dev server http:\/\/10\.9\.8\.2:6123\//);
    assert.match(r.out, /device\s+bedroom/);
    assert.match(r.out, /TV_IP\s+10\.9\.8\.7/);
    assert.match(r.out, /passphrase set/);
    assert.doesNotMatch(r.out, /ABC123/); // never printed
    const o = run("bash", ["scripts/tv-up.sh", "--dev", "--config"], { env: { DEV_PORT: "7001" } });
    assert.match(o.out, /:7001\//);
  } finally {
    fs.rmSync(path.join(proj, ".env"));
  }
});

test("HOST_IP is detected from the route to the TV when not set", () => {
  writeEnv("TV_IP=127.0.0.1\n");
  try {
    const r = run("bash", ["scripts/tv-up.sh", "--dev", "--config"]);
    assert.match(r.out, /dev server http:\/\/127\.0\.0\.1:5500\//);
  } finally {
    fs.rmSync(path.join(proj, ".env"));
  }
});

test("parseEnv handles quotes, comments and export", () => {
  assert.deepEqual(parseEnv("# c\nA=1\nexport B = 'two words'\nC=\"x # y\"\nD=v # note\n"), { A: "1", B: "two words", C: "x # y", D: "v" });
});

// ---------- Manifest diagnostics ----------

test("an invalid manifest gets an actionable message, not a crash", () => {
  const file = path.join(proj, manifest);
  const good = fs.readFileSync(file, "utf8");
  try {
    fs.writeFileSync(file, good.replace('"version"', '"version" :: '));
    const d = run("bash", ["scripts/doctor.sh"]);
    assert.notEqual(d.code, 0);
    assert.match(d.err, /appinfo\.json is not valid JSON/);
    assert.doesNotMatch(d.err, /at JSON\.parse|node:internal/); // a message, not a stack trace

    const p = run("bash", ["scripts/deploy.sh"]);
    assert.notEqual(p.code, 0);
    assert.match(p.err, /appinfo\.json is not valid JSON/);

    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(good), id: "Not An Id", version: "1.0" }));
    const f = run("bash", ["scripts/doctor.sh"]);
    assert.match(f.err, /"id": app id must be lowercase reverse-domain/);
    assert.match(f.err, /"version" must be three numbers/);
  } finally {
    fs.writeFileSync(file, good);
  }
});

// ---------- Dev server ----------

function startServer(args = ["0"]) {
  const child = spawn("node", ["scripts/dev-server.mjs", ...args], { cwd: proj, env: { ...process.env, DEV_PORT: "" } });
  const port = new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = out.match(/on :(\d+)/); if (m) resolve(Number(m[1])); });
    child.on("exit", (c) => reject(new Error(`dev server exited (${c})`)));
  });
  return { child, port };
}

test("the dev server answers a malformed URL with 400 and keeps serving", async () => {
  const { child, port } = startServer();
  try {
    const base = `http://127.0.0.1:${await port}`;
    assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
    assert.equal((await fetch(`${base}/a%00b`)).status, 400);
    assert.notEqual((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 200);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /EventSource\('\/__reload'\)/);
    assert.equal(child.exitCode, null);
  } finally {
    child.kill();
  }
});

test("the dev server takes DEV_PORT from .env", async () => {
  writeEnv("DEV_PORT=0\n");
  const { child, port } = startServer([]);
  try {
    assert.notEqual(await port, 5500); // 0 = any free port, so it read .env rather than the default
  } finally {
    child.kill();
    fs.rmSync(path.join(proj, ".env"));
  }
});

// ---------- Syntax and packaging ----------

test("every script parses", () => {
  for (const f of fs.readdirSync(path.join(proj, "scripts"))) {
    const file = path.join(proj, "scripts", f);
    if (f.endsWith(".sh")) execFileSync("bash", ["-n", file]);
    if (f.endsWith(".mjs")) execFileSync("node", ["--check", file]);
  }
});

const hasCli = spawnSync("ares-package", ["--version"], { encoding: "utf8" }).status === 0;
test("a generated project packages into an .ipk", { skip: !hasCli && "webOS CLI not installed" }, () => {
  const r = run("bash", ["scripts/tv.sh", "package"]);
  assert.equal(r.code, 0, r.err + r.out);
  assert.ok(fs.existsSync(path.join(proj, "dist", `${ID}_0.0.1_all.ipk`)));
});
