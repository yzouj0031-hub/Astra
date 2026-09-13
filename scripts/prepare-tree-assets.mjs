/**
 * 把 assets/_src/ 里的 CC0 树原件重新打包成能上线的 assets/trees/。
 *
 *   node scripts/fetch-tree-sources.mjs      # 先下原件
 *   node scripts/prepare-tree-assets.mjs     # 再打包
 *
 * 原件直接用是 8.9MB（实测），其中 6.6MB 是贴图：1024² PNG，树皮 diffuse 和 normal
 * 各接近 1MB，而 trees 和 deadtrees 用的是同一张 NormalTree_Bark —— 各自存一遍。
 * 这些 GLB 还要 base64 内嵌进 dist 单文件版，每一 KB 都要乘 4/3。
 *
 * 所以：把贴图整个从 GLB 里摘出来，去重、降到 512、不带 alpha 的转 JPEG，
 * 单独存成文件；GLB 只留几何和材质名，由 journeys/assets.js 按材质名把贴图接回去。
 * 这样同一张树皮在磁盘上只有一份，四个 GLB 也不用合并。
 *
 * 先试过 Blender（--background）干这件事：它那边 image.has_data 是 false，
 * scale() 静默不生效，导出还会因为「图里有一条全不透明的 alpha」坚持写 PNG，
 * 并且把同一张树皮存了两份。这里自己动字节，结果是确定的。
 *
 * 图像的解码和重编码借 headless chromium 的 canvas 做（playwright 已是 devDependency），
 * 省一个原生图像库依赖。
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'assets', '_src');
const OUT = resolve(root, 'assets', 'trees');
const SIZE = 512;

// 叶片和花的 alpha 是镂空用的，必须留 PNG。其余（树皮 diffuse / normal）一律 JPEG。
const NEEDS_ALPHA = /leaves|flowers/i;

// 每个包里留哪几个变体。原件一个包塞五个，烟雨渡只有 80 棵树，
// 主力杂树要变化所以五个全留，其余各留够用的数量 —— 几何是现在的大头。
// DeadTree 是垂柳的枝干骨架：裸枝比带叶树冠更像柳，叶子由柳条卡片挂上去。
const SOURCES = [
  ['trees.glb',      ['NormalTree_1', 'NormalTree_2', 'NormalTree_3', 'NormalTree_4', 'NormalTree_5']],
  // 红枫：照参考图补的主力树，低处分叉、冠散成片，五个变体全留。
  ['maple.glb',      ['MapleTree_1', 'MapleTree_2', 'MapleTree_3', 'MapleTree_4', 'MapleTree_5']],
  ['birch.glb',      ['BirchTree_1', 'BirchTree_2']],
  // DeadTree 一身两用：垂柳的枝干骨架，以及层叠松那棵斜干。
  ['deadtrees.glb',  ['DeadTree_1', 'DeadTree_2', 'DeadTree_3']],
  ['bushes.glb',     ['Bush']],
  ['bamboo.glb',     ['Bamboo']],
  ['bamboo_mid.glb', ['Bamboo_Mid']],
  ['palm.glb',       ['PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'PalmTree_4', 'PalmTree_5']],
  ['pine.glb',       ['PineTree_1', 'PineTree_2', 'PineTree_4']],
];

/* ---------- GLB 读写 ---------- */
function parseGLB(buf) {
  if (buf.slice(0, 4).toString() !== 'glTF') throw new Error('不是 GLB');
  let at = 12, json = null, bin = Buffer.alloc(0);
  while (at < buf.length) {
    const len = buf.readUInt32LE(at), type = buf.slice(at + 4, at + 8).toString();
    const data = buf.slice(at + 8, at + 8 + len);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
    else if (type.startsWith('BIN')) bin = data;
    at += 8 + len;
  }
  return { json, bin };
}

function buildGLB(json, bin) {
  const pad = (b, to, fill) => {
    const extra = (to - (b.length % to)) % to;
    return extra ? Buffer.concat([b, Buffer.alloc(extra, fill)]) : b;
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 4, 0x20);
  const binChunk = pad(bin, 4, 0);
  const head = Buffer.alloc(12);
  head.write('glTF', 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0), 8);
  const parts = [head];
  const j = Buffer.alloc(8); j.writeUInt32LE(jsonChunk.length, 0); j.write('JSON', 4);
  parts.push(j, jsonChunk);
  if (binChunk.length) {
    const b = Buffer.alloc(8); b.writeUInt32LE(binChunk.length, 0); b.write('BIN\0', 4);
    parts.push(b, binChunk);
  }
  return Buffer.concat(parts);
}

/* ---------- 贴图：解码 -> 缩放 -> 重编码 ---------- */
async function reencode(page, bytes, mime, wantPNG) {
  const src = `data:${mime};base64,${bytes.toString('base64')}`;
  const out = await page.evaluate(async ({ src, size, wantPNG }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode failed')); img.src = src; });
    const w = Math.min(size, img.naturalWidth), h = Math.min(size, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d');
    // 缩小 alpha 镂空图时不要让边缘被预乘背景污染：canvas 默认就是直通 alpha，
    // 但先清成全透明，避免某些实现留下上一次的内容。
    cx.clearRect(0, 0, w, h);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, w, h);
    return { url: wantPNG ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88), w, h };
  }, { src, size: SIZE, wantPNG });
  return { buf: Buffer.from(out.url.split(',')[1], 'base64'), w: out.w, h: out.h };
}

/* ---------- 主流程 ---------- */
// 只清掉**这个脚本自己的产物**：tex/ 和它写的 glb/json。
// cards/ 是 make-plant-cards.mjs 手画的，整个目录一起 rm 会把它们也删掉
// —— 之前就踩过一次，重打包一次柳条贴图就没了。
await rm(resolve(OUT, 'tex'), { recursive: true, force: true });
await mkdir(resolve(OUT, 'tex'), { recursive: true });
for (const [name] of SOURCES) await rm(resolve(OUT, name), { force: true });
await rm(resolve(OUT, 'manifest.json'), { force: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
await page.goto('data:text/html,<body>');

const textures = new Map();  // 原始字节的 sha1 -> {file, bytes}
const materials = {};        // 材质名 -> {map, normalMap}
let totalGeo = 0;

for (const [name, keepMeshes] of SOURCES) {
  const { json, bin } = parseGLB(await readFile(resolve(SRC, name)));

  // 0. 先扔掉不要的变体，再算引用 —— 顺序反了的话它们的 accessor 还会被当成有用的留下。
  const dropped = (json.meshes || []).map((m, i) => [i, m.name]).filter(([, n]) => !keepMeshes.includes(n));
  if (dropped.length) {
    const gone = new Set(dropped.map(([i]) => i));
    const meshRemap = new Map();
    json.meshes = (json.meshes || []).filter((m, i) => { if (!gone.has(i)) meshRemap.set(i, meshRemap.size); return !gone.has(i); });
    // 节点指向被删的 mesh 就把这个节点也摘掉，其余节点的 mesh 下标重映射。
    const nodeGone = new Set();
    (json.nodes || []).forEach((n, i) => { if (n.mesh !== undefined && gone.has(n.mesh)) nodeGone.add(i); });
    const nodeRemap = new Map();
    json.nodes = (json.nodes || []).filter((n, i) => { if (!nodeGone.has(i)) nodeRemap.set(i, nodeRemap.size); return !nodeGone.has(i); });
    for (const n of json.nodes) {
      if (n.mesh !== undefined) n.mesh = meshRemap.get(n.mesh);
      if (n.children) { n.children = n.children.filter(c => !nodeGone.has(c)).map(c => nodeRemap.get(c)); if (!n.children.length) delete n.children; }
    }
    for (const s of json.scenes || []) s.nodes = s.nodes.filter(c => !nodeGone.has(c)).map(c => nodeRemap.get(c));
    // 只留还被 primitive 引用的 accessor。
    const used = new Set();
    for (const m of json.meshes) for (const p of m.primitives) { for (const a of Object.values(p.attributes)) used.add(a); if (p.indices !== undefined) used.add(p.indices); }
    const accRemap = new Map();
    json.accessors = (json.accessors || []).filter((a, i) => { if (used.has(i)) accRemap.set(i, accRemap.size); return used.has(i); });
    for (const m of json.meshes) for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accRemap.get(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accRemap.get(p.indices);
    }
    console.log(`  ${name} 丢掉变体 ${dropped.map(([, n]) => n).join(', ')}`);
  }

  // 1. 材质名 -> 用到哪几张图。摘出来之前先把对应关系记下来。
  // 只记还被留下的 primitive 用到的材质 —— 否则会为已丢掉的变体白写一张贴图。
  const liveMats = new Set();
  for (const m of json.meshes || []) for (const p of m.primitives) if (p.material !== undefined) liveMats.add(p.material);
  const imageOfTexture = i => json.textures[i].source;
  for (const [mi, mat] of (json.materials || []).entries()) {
    if (!liveMats.has(mi)) continue;
    const entry = materials[mat.name] || (materials[mat.name] = {});
    const base = mat.pbrMetallicRoughness?.baseColorTexture;
    if (base) entry.map = imageOfTexture(base.index);
    if (mat.normalTexture) entry.normalMap = imageOfTexture(mat.normalTexture.index);
    entry.alpha = mat.alphaMode && mat.alphaMode !== 'OPAQUE';
    entry._src = name;
  }

  // 2. 图按原始字节去重。同一张树皮在两个包里字节完全一致，只落一份文件。
  const localFile = new Map();  // 该文件内的 image 下标 -> 输出文件名
  const liveImages = new Set();
  for (const entry of Object.values(materials)) {
    if (entry._src !== name) continue;
    if (typeof entry.map === 'number') liveImages.add(entry.map);
    if (typeof entry.normalMap === 'number') liveImages.add(entry.normalMap);
  }
  for (const [i, im] of (json.images || []).entries()) {
    if (!liveImages.has(i)) continue;
    const bv = json.bufferViews[im.bufferView];
    const bytes = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const key = createHash('sha1').update(bytes).digest('hex');
    if (!textures.has(key)) {
      const wantPNG = NEEDS_ALPHA.test(im.name || '');
      const { buf, w, h } = await reencode(page, bytes, im.mimeType || 'image/png', wantPNG);
      const slug = (im.name || 'tex_' + i).replace(/\.(png|jpe?g)$/i, '').replace(/[^\w-]/g, '_').toLowerCase();
      const file = `${slug}.${wantPNG ? 'png' : 'jpg'}`;
      await writeFile(resolve(OUT, 'tex', file), buf);
      textures.set(key, { file });
      console.log(`  贴图 ${file.padEnd(28)} ${(bytes.length / 1024).toFixed(0)}KB -> ${(buf.length / 1024).toFixed(0)}KB  ${w}x${h}`);
    }
    localFile.set(i, textures.get(key).file);
  }
  // 材质记录里把 image 下标换成文件名
  for (const entry of Object.values(materials)) {
    if (entry._src !== name) continue;
    if (typeof entry.map === 'number') entry.map = localFile.get(entry.map);
    if (typeof entry.normalMap === 'number') entry.normalMap = localFile.get(entry.normalMap);
    delete entry._src;
  }

  // 3. 从 GLB 里摘掉贴图，并删掉没人用的第二层 UV。
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives) {
      for (const key of Object.keys(prim.attributes)) {
        if (/^TEXCOORD_([1-9])/.test(key)) delete prim.attributes[key];
      }
    }
  }
  for (const mat of json.materials || []) {
    delete mat.pbrMetallicRoughness?.baseColorTexture;
    delete mat.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete mat.normalTexture;
    delete mat.occlusionTexture;
    delete mat.emissiveTexture;
  }
  delete json.images; delete json.textures; delete json.samplers;

  // 4. 只留还被 accessor 引用的 bufferView，重排 BIN 并改下标。
  const keep = [...new Set((json.accessors || []).map(a => a.bufferView).filter(v => v !== undefined))].sort((a, b) => a - b);
  const remap = new Map(), chunks = [];
  let offset = 0;
  const views = [];
  for (const old of keep) {
    const bv = json.bufferViews[old];
    const bytes = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const padding = (4 - (offset % 4)) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
    remap.set(old, views.length);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bv.byteLength, ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), ...(bv.target ? { target: bv.target } : {}) });
    chunks.push(bytes); offset += bytes.length;
  }
  for (const a of json.accessors || []) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
  json.bufferViews = views;
  const newBin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: newBin.length }];

  const out = buildGLB(json, newBin);
  await writeFile(resolve(OUT, name), out);
  totalGeo += out.length;
  const tris = (json.meshes || []).flatMap(m => m.primitives).reduce((s, p) => s + json.accessors[p.indices].count / 3, 0);
  console.log(`${name.padEnd(16)} ${(out.length / 1024).toFixed(0).padStart(5)}KB  ${Math.round(tris)} tris  ${(json.meshes || []).map(m => m.name).join(', ')}`);
}

await browser.close();

const texBytes = [...textures.values()].reduce((s, t) => s + 0, 0);
await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify({ materials }, null, 1) + '\n');
const { readdir, stat } = await import('node:fs/promises');
let texTotal = 0;
for (const f of await readdir(resolve(OUT, 'tex'))) texTotal += (await stat(resolve(OUT, 'tex', f))).size;
const total = totalGeo + texTotal;
console.log(`\n几何 ${(totalGeo / 1024).toFixed(0)}KB + 贴图 ${(texTotal / 1024).toFixed(0)}KB = ${(total / 1048576).toFixed(2)}MB（base64 内嵌进 dist 约 ${(total * 4 / 3 / 1048576).toFixed(2)}MB）`);
console.log('材质 -> 贴图:', JSON.stringify(materials, null, 1));
