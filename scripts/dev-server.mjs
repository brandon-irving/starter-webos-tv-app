// Dependency-free dev server for `npm run tv:dev`: serves app/ over the LAN and reloads the
// page on the TV whenever a file in app/ changes. HTML responses get a tiny live-reload
// client (Server-Sent Events) injected before </body>.
//
//   node scripts/dev-server.mjs [port]        (default: DEV_PORT from the environment or .env, else 5500; 0 = any free port)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, loadSettings } from './lib.mjs';

const PORT = Number(process.argv[2] ?? loadSettings().DEV_PORT);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

const RELOAD_CLIENT = `<script>(function () {
  var es = new EventSource('/__reload');
  es.onmessage = function () { location.reload(); };
})();</script>`;

const clients = new Set();

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (e) {
    // A bad request must never take the server down mid-session
    console.error(`error serving ${req.url}: ${e.message}`);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

function handle(req, res) {
  const url = new URL(req.url, 'http://local');

  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    console.log(`client connected (${req.socket.remoteAddress?.replace(/^::ffff:/, '')})`);
    req.on('close', () => clients.delete(res));
    return;
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request: malformed URL');
    return;
  }
  if (rel.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
    return;
  }
  const file = path.join(APP_DIR, rel);
  if (!file.startsWith(APP_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    let body = data;
    if (type.startsWith('text/html')) {
      const html = data.toString('utf8');
      body = html.includes('</body>') ? html.replace('</body>', RELOAD_CLIENT + '</body>') : html + RELOAD_CLIENT;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  });
}

// Editors write files in bursts (temp file, rename, chmod); reload once per burst
let timer;
fs.watch(APP_DIR, { recursive: true }, (_event, name) => {
  if (name && /(^|\/)\.|~$/.test(name)) return; // dotfiles, editor backups
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`changed ${name ?? ''} → reloading ${clients.size} client(s)`);
    for (const c of clients) c.write('data: reload\n\n');
  }, 150);
});

// Keep proxies and the TV from timing out an idle stream
setInterval(() => {
  for (const c of clients) c.write(': ping\n\n');
}, 15000);

server.listen(PORT, '0.0.0.0', () => console.log(`Serving app/ on :${server.address().port} with live reload`));
