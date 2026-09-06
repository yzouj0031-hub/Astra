import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/online.js', ['online.js', 'text/javascript; charset=utf-8']],
  ['/og.png', ['og.png', 'image/png']],
]);
const port = Number(process.env.PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const regionAsset = /^\/journeys\/[a-z-]+\.(js|css|txt)$/.exec(path);
  const route = routes.get(path) || (regionAsset ? [path.slice(1), regionAsset[1] === 'css' ? 'text/css; charset=utf-8' : regionAsset[1] === 'js' ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8'] : null);
  if (!route) { response.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(resolve(root, route[0]));
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end('Could not read the game file.');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`星屿 · 海岛游乐园: http://127.0.0.1:${port}`));
