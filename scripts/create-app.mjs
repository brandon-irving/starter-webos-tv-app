// Copy this template into a new project with its own app ID and title.
//
//   npm run new -- <TARGET_DIR> <APP_ID> "<TITLE>"
//   e.g. npm run new -- ../my-tv-app com.yourname.mytvapp "My TV App"
import fs from "node:fs";
import path from "node:path";
import { ROOT, appIdProblem } from "./lib.mjs";

const SKIP = new Set([".git", "dist", "node_modules", ".DS_Store", ".env", "test-results"]);
const die = (msg) => { console.error(msg); process.exit(1); };

const [targetArg, id, title] = process.argv.slice(2);
if (!targetArg || !id || !title) die('Usage: npm run new -- <TARGET_DIR> <APP_ID> "<TITLE>"');
const idProblem = appIdProblem(id);
if (idProblem) die(`Invalid ${idProblem}`);

// npm runs scripts from the template's folder; resolve relative targets against where the user typed the command
const target = path.resolve(process.env.INIT_CWD || process.cwd(), targetArg);
if (fs.existsSync(target)) die(`Target '${target}' already exists`);
if (target === ROOT || target.startsWith(ROOT + path.sep)) die("Target must be outside the template folder");

fs.cpSync(ROOT, target, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });

const json = (f, edit) => {
  const file = path.join(target, f);
  const data = edit(JSON.parse(fs.readFileSync(file, "utf8")));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};
json("app/appinfo.json", (info) => Object.assign(info, { id, title, version: "0.0.1" }));
json("package.json", (pkg) => Object.assign(pkg, {
  name: path.basename(target).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
  description: `${title} (webOS TV app)`,
}));
const html = path.join(target, "app/index.html");
const escaped = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
fs.writeFileSync(html, fs.readFileSync(html, "utf8").replace(/<title>.*<\/title>/, () => `<title>${escaped}</title>`));

console.log(`Created ${target} (${id}, "${title}")`);
console.log(`Next: cd "${target}" && npm run doctor && npm run deploy`);
