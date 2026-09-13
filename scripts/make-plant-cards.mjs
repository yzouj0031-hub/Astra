/**
 * 画烟雨渡要用的 alpha 镂空植物卡片 -> assets/trees/cards/
 *
 *   node scripts/make-plant-cards.mjs
 *
 * 为什么要自己画：现成的 CC0 模型里，柳树没有、竹子只有光竿没有叶、
 * 层叠松（迎客松那种一盘一盘分层的）根本没有。这三样都走同一条路子 ——
 * 枝干用真模型，叶子用卡片按规则挂上去，卡片的内容就是这里画的。
 *
 * 约定：**每张图横向切成 4 条**，代码那边按实例挑一列（见 watertown.js 的 aCol），
 * 一张贴图就能让同一棵树上的卡片互不重样，不用做四份材质。
 * 三张图的列数必须一致，着色器里那个 0.25 是写死的。
 *
 * 输出目录和 prepare-tree-assets.mjs 的 tex/ 分开：那个脚本每次会把自己的
 * 输出目录整个清掉，混在一起的话跑一次重打包就把这些手画的卡片删了。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'assets', 'trees', 'cards');
const COLS = 4;

// 烟雨渡的绿：压过饱和度往灰里走，跟 watertown.js 里原有的柳树色是一套。
// 不用 Quaternius 原包那种鲜绿 —— 江南烟雨不是那个调子。
const WILLOW_GREENS = ['#7d9c5c', '#6f8f52', '#86a86b', '#5f8a4c', '#8faa6a'];
const BAMBOO_GREENS = ['#6f9153', '#7ea364', '#5d7f45', '#89ad6f', '#668a4c'];
const PINE_GREENS = ['#4a6b45', '#3f5c3b', '#567a4e', '#456540', '#5f8555'];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
await page.goto('data:text/html,<body>');

const draw = (w, h, fn, args) => page.evaluate(({ w, h, src, args, COLS }) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  // 固定种子：每次生成同一张图，免得重跑一次贴图就变了
  let s = args.seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  // 一片披针形的叶子：根部收窄、中段最宽、尖端收尖
  const leaf = (cx, cy, len, wid, ang, fill) => {
    x.save(); x.translate(cx, cy); x.rotate(ang); x.fillStyle = fill;
    x.beginPath(); x.moveTo(0, 0);
    x.quadraticCurveTo(len * 0.45, -wid, len, 0);
    x.quadraticCurveTo(len * 0.45, wid, 0, 0);
    x.fill(); x.restore();
  };
  new Function('x', 'w', 'h', 'COLS', 'rnd', 'rr', 'pick', 'leaf', 'args', src)(x, w, h, COLS, rnd, rr, pick, leaf, args);
  return c.toDataURL('image/png');
}, { w, h, src: fn, args, COLS });

/* ---------- 柳条：一条垂下来的细茎，叶子紧贴着茎往下垂 ---------- */
const WILLOW = `
const colW = w / COLS;
for (let col = 0; col < COLS; col++) {
  const cx0 = col * colW + colW / 2;
  const sway = rr(7, 13), phase = rr(0, 6.283), curve = rr(-1, 1) * 9;
  const stemAt = t => cx0 + Math.sin(t * 2.2 + phase) * sway * t + curve * t * t;
  x.beginPath();
  for (let i = 0; i <= 60; i++) { const t = i / 60; const px = stemAt(t), py = t * h; i ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.strokeStyle = '#4e6b3c'; x.lineWidth = 1.8; x.lineCap = 'round'; x.stroke();
  // 角度收到 ±9°~23°：张得开就成了一根瓶刷，柳叶是顺着条子垂的
  const n = Math.round(rr(44, 56));
  for (let i = 0; i < n; i++) {
    const t = (i + rr(0.2, 0.8)) / n, side = i % 2 ? 1 : -1;
    const len = rr(30, 52) * (1 - t * 0.30), wid = rr(2.6, 4.0) * (1 - t * 0.25);
    leaf(stemAt(t), t * h, len, wid, side * rr(0.16, 0.40) * (1 - t * 0.35) + Math.PI / 2, pick(args.colors));
  }
}`;

/* ---------- 竹叶：一簇从节上散开的窄长叶，末端下垂 ---------- */
const BAMBOO = `
const colW = w / COLS;
for (let col = 0; col < COLS; col++) {
  const cx0 = col * colW + colW / 2;
  // 每列四五个小节，每节抽出一把叶子。第一版只画两三节、叶子也短，
  // 整张图一大半是空的，挂上去根本看不出是竹 —— 所以加密、加长、左右都铺开。
  const nodes = Math.round(rr(4, 5.4));
  for (let k = 0; k < nodes; k++) {
    const baseY = h * (0.12 + k * 0.19 + rr(-0.03, 0.03));
    const anchor = cx0 + rr(-0.22, 0.22) * colW;
    const fan = Math.round(rr(7, 11));
    for (let i = 0; i < fan; i++) {
      const side = i % 2 ? 1 : -1;
      // 从近乎水平到斜向下：竹叶是外张再垂，不是直立
      const ang = side * rr(0.10, 1.25) + (i % 3 === 0 ? Math.PI : 0);
      const len = rr(42, 86), wid = rr(2.6, 4.2);
      leaf(anchor + side * rr(0, 6), baseY + rr(-5, 5), len, wid, ang, pick(args.colors));
    }
    x.beginPath(); x.moveTo(anchor, baseY + 12); x.lineTo(anchor + rr(-5, 5), baseY - 16);
    x.strokeStyle = '#59733f'; x.lineWidth = 1.4; x.stroke();
  }
}`;

/* ---------- 松针盘：一根横枝，两侧长满短针簇，边缘故意不齐 ---------- */
const PINE = `
const colW = w / COLS;
for (let col = 0; col < COLS; col++) {
  const x0 = col * colW + 6, cy = h / 2;
  const span = colW - 12;
  // 主枝：略微起伏地往外伸
  const droop = rr(-0.10, 0.10);
  const branchAt = t => cy + Math.sin(t * 2.0) * 6 + t * t * span * droop;
  x.beginPath();
  for (let i = 0; i <= 40; i++) { const t = i / 40; i ? x.lineTo(x0 + t * span, branchAt(t)) : x.moveTo(x0, branchAt(0)); }
  x.strokeStyle = '#4a3b2a'; x.lineWidth = 3.2; x.lineCap = 'round'; x.stroke();
  // 针簇：沿主枝分布，越靠外越密，长度随机 —— 剪影不齐才像松
  // 针数和粗细都往上提过一轮：第一版太细太疏，缩到游戏里的盘尺寸就成了一层绒毛，
  // 参考图里的松盘是成团的实体。
  const tufts = Math.round(rr(34, 44));
  for (let i = 0; i < tufts; i++) {
    const t = Math.pow((i + rr(0.1, 0.9)) / tufts, 0.75);
    const bx = x0 + t * span, by = branchAt(t);
    const needles = Math.round(rr(11, 16));
    const reach = rr(16, 30) * (0.45 + t * 0.75);
    for (let j = 0; j < needles; j++) {
      const side = j % 2 ? 1 : -1;
      const ang = side * (Math.PI / 2) * rr(0.35, 1.0) - rr(0.1, 0.5);
      x.save(); x.translate(bx, by); x.rotate(ang);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(reach * rr(0.7, 1.15), 0);
      x.strokeStyle = pick(args.colors); x.lineWidth = rr(1.5, 2.5); x.lineCap = 'round'; x.stroke();
      x.restore();
    }
  }
}`;

const JOBS = [
  ['willow_frond.png', 256, 512, WILLOW, { seed: 0x5eed1, colors: WILLOW_GREENS }],
  ['bamboo_leaf.png', 512, 256, BAMBOO, { seed: 0x1a2b3c, colors: BAMBOO_GREENS }],
  ['pine_pad.png', 1024, 256, PINE, { seed: 0x7f00d, colors: PINE_GREENS }],
];

await mkdir(OUT, { recursive: true });
for (const [name, w, h, fn, args] of JOBS) {
  const url = await draw(w, h, fn, args);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  await writeFile(resolve(OUT, name), buf);
  console.log(`${name.padEnd(20)} ${w}x${h}  ${(buf.length / 1024).toFixed(0)}KB  ${COLS} 列`);
}
await browser.close();
