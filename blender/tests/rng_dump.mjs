// 从 journeys/watertown.js 原文里切出随机段并执行，导出参考数值。
// 直接吃源文件而不是抄一份，避免以后 JS 改了而 Python 侧不知道。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'journeys', 'watertown.js'), 'utf8');

const start = src.indexOf('let _seed');
const end = src.indexOf('const TAU');
if (start < 0 || end < 0) throw new Error('watertown.js 里找不到随机段，源文件结构变了');
const block = src.slice(start, src.indexOf('\n', end) + 1);

const make = new Function(`${block}
  return { rnd, rr, ri, pick, clamp, lerp, smooth, seed: () => _seed };`);
const js = make();

const out = { block_sha: null, raw: [], rr: [], ri: [], pick: [], smooth: [], seed_after_1e6: null };
for (let i = 0; i < 20; i++) out.raw.push(js.rnd());
for (let i = 0; i < 10; i++) out.rr.push(js.rr(-3.5, 7.25));
for (let i = 0; i < 10; i++) out.ri.push(js.ri(0, 5));
const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
for (let i = 0; i < 10; i++) out.pick.push(js.pick(arr));
for (let i = 0; i < 10; i++) out.smooth.push(js.smooth(0.2, 0.8, js.rnd()));
for (let i = 0; i < 1e6; i++) js.rnd();
out.seed_after_1e6 = js.seed();

process.stdout.write(JSON.stringify(out));
