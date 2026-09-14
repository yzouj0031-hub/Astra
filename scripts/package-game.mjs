import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { Script } from 'node:vm';

// Bundle all local assets so the game can be opened directly from a single file.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || resolve(root, 'dist'));
const read = name => readFile(resolve(root, name), 'utf8');
const script = source => '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>';
let html = await read('index.html');
const css = await read('journeys/journeys.css');
html = html.replace(/<link[^>]*href="journeys\/journeys.css"[^>]*>/, () => '<style>\n' + css + '\n</style>');
// 六个地区的树都是外部 glTF。单文件版要能双击打开，而 file:// 会把 XHR 按跨域拦掉，
// 所以把 GLB、贴图和清单全 base64 成 data URI 挂在 window.AstraTreeAssetData 上；
// journeys/assets.js 看到它就不再发网络请求（见那边的 urlOf）。
// 代价是单文件体积按 4/3 涨 —— 打包结束会把实际数字打出来。
const MIME = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
async function embedTreeAssets() {
  const dir = resolve(root, 'assets', 'trees');
  const entry = {};
  let raw = 0;
  for (const name of ['', 'tex', 'cards']) {
    const at = name ? resolve(dir, name) : dir;
    for (const file of await readdir(at, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const mime = MIME[extname(file.name)];
      if (!mime) continue;
      const bytes = await readFile(resolve(at, file.name));
      raw += bytes.length;
      entry[(name ? name + '/' : '') + file.name] = `data:${mime};base64,${bytes.toString('base64')}`;
    }
  }
  if (!Object.keys(entry).length) throw new Error('assets/trees 是空的 —— 先跑 node scripts/prepare-tree-assets.mjs');
  return { source: 'window.AstraTreeAssetData=' + JSON.stringify(entry) + ';', raw };
}
const treeAssets = await embedTreeAssets();
// 玩家角色同理：模型 + 动画两个 GLB，挂在 AstraPlayerAssetData 上（journeys/assets.js 的 loadPlayer）
async function embedPlayerAssets() {
  const entry = {};
  let raw = 0;
  for (const name of ['player.glb', 'anims.glb']) {
    const bytes = await readFile(resolve(root, 'assets', 'player', name)).catch(() => {
      throw new Error('assets/player/' + name + ' 不存在 —— 先跑 node scripts/prepare-player-assets.mjs');
    });
    raw += bytes.length;
    entry[name] = `data:${MIME['.glb']};base64,${bytes.toString('base64')}`;
  }
  return { source: 'window.AstraPlayerAssetData=' + JSON.stringify(entry) + ';', raw };
}
const playerAssets = await embedPlayerAssets();
// 载具：assets/vehicles/*.glb，挂在 AstraVehicleAssetData 上（journeys/assets.js 的 loadVehicle）
async function embedVehicleAssets() {
  const entry = {};
  let raw = 0;
  for (const file of await readdir(resolve(root, 'assets', 'vehicles'), { withFileTypes: true })) {
    if (!file.isFile() || extname(file.name) !== '.glb') continue;
    const bytes = await readFile(resolve(root, 'assets', 'vehicles', file.name));
    raw += bytes.length;
    entry[file.name] = `data:${MIME['.glb']};base64,${bytes.toString('base64')}`;
  }
  if (!Object.keys(entry).length) throw new Error('assets/vehicles 是空的 —— 先跑 blender/tools/build_roadster.py');
  return { source: 'window.AstraVehicleAssetData=' + JSON.stringify(entry) + ';', raw };
}
const vehicleAssets = await embedVehicleAssets();

for (const name of ['core', 'regions', 'runtime']) {
  let source = await read('journeys/' + name + '.js');
  if (name === 'runtime') {
    const factories = await Promise.all(['combat', 'foliage', 'assets', 'rainport', 'watertown', 'temple'].map(n => read('journeys/' + n + '.js')));
    // GLTFLoader 顶层就写了 `class GLTFLoader extends THREE.Loader`，执行时就要全局 THREE。
    // 可这几个 journeys 脚本的标签在 <head> 里，比内嵌的 three 更早 —— 直接铺进来会
    // 抛 "THREE is not defined"，而且会把同一个 <script> 里后面的区域工厂全带塌。
    // 所以包成一个函数存着，等 assets.js 真要用的时候再调（那时 three 早就在了）。
    const loader = await read('journeys/vendor/GLTFLoader.js');
    const deferred = 'window.AstraDefineGLTFLoader=function(){\n' + loader + '\n};';
    source = [treeAssets.source, playerAssets.source, vehicleAssets.source, deferred, ...factories, source].join('\n');
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
const total = (await readFile(target)).length;
console.log(target);
console.log(`单文件 ${(total / 1048576).toFixed(2)}MB —— 其中六地的树 ${(treeAssets.raw / 1048576).toFixed(2)}MB（base64 后 ${(treeAssets.raw * 4 / 3 / 1048576).toFixed(2)}MB），`
  + `玩家角色 ${(playerAssets.raw / 1048576).toFixed(2)}MB（base64 后 ${(playerAssets.raw * 4 / 3 / 1048576).toFixed(2)}MB）`);
