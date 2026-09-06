import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';

// Bundle all local assets so the game can be opened directly from a single file.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || resolve(root, 'dist'));
const read = name => readFile(resolve(root, name), 'utf8');
const script = source => '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>';
let html = await read('index.html');
const css = await read('journeys/journeys.css');
html = html.replace(/<link[^>]*href="journeys\/journeys.css"[^>]*>/, () => '<style>\n' + css + '\n</style>');
for (const name of ['core', 'regions', 'runtime']) {
  let source = await read('journeys/' + name + '.js');
  if (name === 'runtime') {
    const factories = await Promise.all(['combat', 'rainport', 'watertown', 'temple'].map(n => read('journeys/' + n + '.js')));
    source = factories.join('\n') + '\n' + source;
  }
  html = html.replace('<script src="journeys/' + name + '.js"></script>', () => script(source));
}
const online = await read('online.js');
html = html.replace('<script src="./online.js"></script>', () => script(online));
for (const [i, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) new Script(match[1], { filename: 'offline-' + i + '.js' });
if (/<script[^>]*\bsrc=|<link[^>]*href="journeys\//.test(html)) throw new Error('An asset was not bundled.');
await mkdir(output, { recursive: true });
const target = resolve(output, '星屿-六地旅行版.html');
await writeFile(target, html);
await writeFile(resolve(output, 'THREE-LICENSE.txt'), await read('journeys/THREE-LICENSE.txt'));
console.log(target);
