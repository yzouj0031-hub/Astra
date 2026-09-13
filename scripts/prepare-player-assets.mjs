/**
 * 把 assets/_src/player/ 里的原件加工成游戏用的 assets/player/：
 *
 *   node scripts/prepare-player-assets.mjs
 *
 *   player.glb  底模的头 + 农夫装（靛蓝重染）+ 分头，贴图 1024² JPEG，不带动画
 *   anims.glb   Universal Animation Library 里用得上的几条，去掉人偶网格
 *
 * Blender 路径默认是 5.2 的安装位置，别的机器用环境变量 BLENDER 指过去。
 * 先跑 node scripts/fetch-player-sources.mjs 把原件下好。
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'assets', '_src', 'player');
const out = resolve(root, 'assets', 'player');
const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';

const base = resolve(src, 'Universal Base Characters[Standard]');
const outfits = resolve(src, 'Modular Character Outfits - Fantasy[Standard]', 'Exports', 'glTF (Godot-Unreal)', 'Outfits');
const hair = resolve(base, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)');
const library = resolve(src, 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb');

/* 运行时要的动画。除了走/跑/待机/游泳，原来程序化骨架摆的姿势也都要有对应的片段，
   不然换成模型之后这些状态会僵成 T 字或者一直在跑：
   跳/落水/爬岸 → Jump_Loop；蹭车、烟雨渡坐船 → Sitting_Idle_Loop；
   山寺打斗 → Sword_Idle / Sword_Attack / Roll（闪避）/ Interact（喝药葫芦）。 */
export const CLIPS = [
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop',
  'Jump_Loop', 'Sitting_Idle_Loop', 'Sword_Idle', 'Sword_Attack', 'Roll', 'Interact',
];
/* 手指：整个动画库的手指关节都锁在离静息姿态约 77° 的弯曲上（实测每一帧都一样，
   不是第一帧的问题）。走跑时手在动看不出来，待机正面看就是一只爪子。
   待机那条把手指往静息姿态拉回一半。 */
const RELAX = { Idle_Loop: 0.5 };
const FINGER = /^(thumb|index|middle|ring|pinky)_0[123]_[lr]$/;

await mkdir(out, { recursive: true });

// ---- 模型 ----------------------------------------------------------------------------------
const playerGlb = resolve(out, 'player.glb');
execFileSync(BLENDER, [
  '-b', '--factory-startup', '-P', resolve(root, 'blender', 'tools', 'compose_player.py'), '--',
  '--body', resolve(base, 'Base Characters', 'Godot - UE', 'Superhero_Male_FullBody.gltf'),
  '--outfit', resolve(outfits, 'Male_Peasant.gltf'),
  '--hair', resolve(hair, 'Hair_SimpleParted.gltf'),
  '--skin', 'T_Superhero_Male_Dark', '--skin', 'T_Regular_Male_Dark_BaseColor',
  '--indigo', 'T_Peasant_BaseColor',
  '--out', playerGlb,
], { stdio: ['ignore', 'pipe', 'inherit'] }).toString().split('\n').filter(l => l.startsWith('[compose]')).forEach(l => console.log(l));

// ---- 动画 ----------------------------------------------------------------------------------
function readGlb(buf) {
  if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error('不是 GLB');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binOff = 20 + jsonLen + 8;
  return { json, bin: buf.subarray(binOff, binOff + buf.readUInt32LE(20 + jsonLen)) };
}
function writeGlb(json, bin) {
  const pad4 = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad4(Buffer.from(JSON.stringify(json)), 0x20), b = pad4(bin, 0);
  const h = Buffer.alloc(12); h.write('glTF', 0, 'latin1'); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + j.length + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, j, bh, b]);
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const b2 = d < 0 ? b.map(x => -x) : b; d = Math.abs(d);
  if (d > 0.9995) { const r = a.map((x, i) => x + (b2[i] - x) * t); const n = Math.hypot(...r); return r.map(x => x / n); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((x, i) => (Math.sin((1 - t) * th) * x + Math.sin(t * th) * b2[i]) / s);
}

const { json: g, bin } = readGlb(await readFile(library));
const COMP = { 5126: 4 }, NUM = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const chunks = [], accessors = [], bufferViews = [];
let offset = 0;
function take(index, transform) {
  const a = g.accessors[index], bv = g.bufferViews[a.bufferView];
  if (a.sparse || !COMP[a.componentType]) throw new Error('动画 accessor 格式出乎意料');
  const elem = COMP[a.componentType] * NUM[a.type];
  if (bv.byteStride && bv.byteStride !== elem) throw new Error('交错存储的 accessor 没处理');
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  let data = bin.subarray(start, start + elem * a.count);
  if (transform) data = transform(Buffer.from(data));
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  chunks.push(data); offset += data.length;
  const copy = { ...a, bufferView: bufferViews.length - 1 }; delete copy.byteOffset;
  accessors.push(copy);
  return accessors.length - 1;
}
/* 瘦身：动画库每条片段给 65 根骨头都写了旋转/位移/缩放三条轨道，绝大多数位移和缩放整段不变。
   整段不变、又等于骨骼静息值的轨道直接删（three 找不到轨道就用静息值，姿势一样）；
   整段不变但不等于静息值的，只留一帧。 */
const REST = { rotation: [0, 0, 0, 1], translation: [0, 0, 0], scale: [1, 1, 1] };
let dropped = 0, collapsed = 0;
function readVecs(index) {
  const a = g.accessors[index], bv = g.bufferViews[a.bufferView], n = NUM[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: a.count }, (_, k) => Array.from({ length: n }, (_, c) => bin.readFloatLE(start + (k * n + c) * 4)));
}
function takeFirst(index) {
  // 只留第一帧：拷一份 accessor，count 改成 1，min/max 跟着改
  const a = g.accessors[index], v = readVecs(index)[0];
  const data = Buffer.alloc(v.length * 4); v.forEach((x, i) => data.writeFloatLE(x, i * 4));
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  chunks.push(data); offset += data.length;
  accessors.push({ componentType: a.componentType, type: a.type, count: 1, bufferView: bufferViews.length - 1, ...(a.min ? { min: v, max: v } : {}) });
  return accessors.length - 1;
}
const same = (p, q, eps = 1e-4) => p.every((x, i) => Math.abs(x - q[i]) < eps);
const animations = CLIPS.map(name => {
  const clip = g.animations.find(a => a.name === name);
  if (!clip) throw new Error(`动画库里没有 ${name}`);
  const relax = RELAX[name];
  const samplers = [], channels = [];
  clip.channels.forEach(channel => {
    const s = clip.samplers[channel.sampler], node = g.nodes[channel.target.node], path = channel.target.path;
    const bend = relax && path === 'rotation' && FINGER.test(node.name);
    const rest = node[path] || REST[path];
    if (!bend) {
      const values = readVecs(s.output);
      if (values.every(v => same(v, values[0]))) {
        // 四元数 q 和 -q 是同一个旋转
        const atRest = same(values[0], rest) || (path === 'rotation' && same(values[0].map(x => -x), rest));
        if (atRest) { dropped++; return; }
        samplers.push({ ...s, input: takeFirst(s.input), output: takeFirst(s.output) });
        channels.push({ ...channel, sampler: samplers.length - 1 });
        collapsed++; return;
      }
    }
    samplers.push({
      ...s, input: take(s.input),
      output: take(s.output, bend ? buf => {
        for (let o = 0; o < buf.length; o += 16) {
          const q = [0, 1, 2, 3].map(k => buf.readFloatLE(o + k * 4));
          slerp(q, node.rotation || REST.rotation, relax).forEach((v, k) => buf.writeFloatLE(v, o + k * 4));
        }
        return buf;
      } : null),
    });
    channels.push({ ...channel, sampler: samplers.length - 1 });
  });
  return { name, channels, samplers };
});
console.log(`动画 ${CLIPS.length} 条：删掉 ${dropped} 条不变且等于静息值的轨道，${collapsed} 条不变的压成一帧`);
const nodes = g.nodes.map(n => { const c = { ...n }; delete c.mesh; delete c.skin; return c; });
const animsGlb = resolve(out, 'anims.glb');
await writeFile(animsGlb, writeGlb({
  asset: { ...g.asset, generator: 'scripts/prepare-player-assets.mjs' },
  scene: g.scene || 0, scenes: g.scenes, nodes, animations, accessors, bufferViews,
  buffers: [{ byteLength: offset + ((4 - (offset % 4)) % 4) }],
}, Buffer.concat(chunks)));

for (const f of [playerGlb, animsGlb]) console.log(`${f}  ${((await stat(f)).size / 1048576).toFixed(2)}MB`);
