/* 本地静态服务：node serve.mjs [端口]，然后打开 http://127.0.0.1:8777/ */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, normalize } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8777);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, '.' + normalize(path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const st = await stat(file); if (!st.isFile()) throw new Error('dir');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found: ' + path); }
});
server.listen(port, '127.0.0.1', () => console.log(`云水行 → http://127.0.0.1:${port}/`));
