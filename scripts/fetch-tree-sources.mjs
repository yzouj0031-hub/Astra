/**
 * 下载烟雨渡用到的 CC0 树模型原件到 assets/_src/（不入库）。
 *
 *   node scripts/fetch-tree-sources.mjs
 *
 * 全部来自 Quaternius 的 Ultimate Stylized Nature Pack，CC0，经 Poly Pizza 分发。
 * 原件是 1024² PNG 贴图、五个变体打在一个 GLB 里，直接用太重；
 * 下载完跑 scripts/prepare-tree-assets.mjs 重新打包成 assets/trees/。
 *
 * 为什么要留这个脚本：assets/trees/ 里的东西是加工过的，
 * 没有这份「从哪来、原件是哪个」的记录，CC0 的出处链就断了。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets', '_src');

// [文件名, Poly Pizza 页面, 静态 GLB 的 uuid]
// 全部来自 Quaternius，CC0。红枫和竹是照参考图补的：
// 参考图里的主角是一棵低处分叉、冠散成片的红枫，两张图里都有竹。
export const SOURCES = [
  ['trees.glb',      'https://poly.pizza/m/etFGNvsiFv', '53a83125-e16a-4024-b8f6-1e72679c7ddf'],
  ['maple.glb',      'https://poly.pizza/m/iGFtQd0PJO', 'cdfcf39f-f8c7-44a6-bb3f-82afe42fc141'],
  ['birch.glb',      'https://poly.pizza/m/R7qMWzb7nk', '457b2397-4bfb-41c4-862d-82d1592b2a5f'],
  ['deadtrees.glb',  'https://poly.pizza/m/26H2UlEtWA', '2c85ff04-7223-4ead-93eb-0f171d3bd6c5'],
  ['bushes.glb',     'https://poly.pizza/m/J2h3HrO356', '11bcb3a1-5901-402c-9863-75988b9e21d8'],
  // 竹：CC0 里只有光竿，没有叶子 —— 叶片由 make-plant-cards.mjs 画的卡片挂上去。
  ['bamboo.glb',     'https://poly.pizza/m/xBPj13w3JQ', 'f7195512-33f0-4383-ac1f-eeb6b3824b75'],
  ['bamboo_mid.glb', 'https://poly.pizza/m/z0d6CbNtrz', '140de180-733f-49ad-a7e3-cdaab84ca0b8'],
  // 棕榈：静屿的海滩用
  ['palm.glb',       'https://poly.pizza/m/VYslw9DEi6', '88fb0209-5e1e-4cb0-9d11-112e6140ab13'],
  // 松：星辉乐园和雨港的行道树里掺一些针叶
  ['pine.glb',       'https://poly.pizza/m/w8ZaiYjK8C', '42a2a958-040d-4ce3-bae5-2332c1282cb5'],
];

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('fetch-tree-sources.mjs')) {
  await mkdir(out, { recursive: true });
  for (const [name, page, uuid] of SOURCES) {
    const url = `https://static.poly.pizza/${uuid}.glb`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${url} -> HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 4).toString() !== 'glTF') throw new Error(`${name}: 不是 GLB`);
    await writeFile(resolve(out, name), buf);
    console.log(`${name}  ${(buf.length / 1048576).toFixed(2)}MB  ${page}`);
  }
  console.log(`\n原件在 ${out}\n下一步：node scripts/prepare-tree-assets.mjs`);
}
