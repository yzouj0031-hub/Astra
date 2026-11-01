/* 植被：树是 Quaternius 的 glTF 部件按地貌规则撒布、InstancedMesh 合批，
   顶点着色器里推风；柳树和层叠松是枯枝骨架 + alpha 卡片（和 Astra 烟雨渡一样的手法）。
   草是玩家周围按格子现算的草丛卡片，走远了就换一批，位置按格子哈希，不会闪。 */
import * as T from 'three';
import { WORLD, RIVER, PLACES, roadDist } from './layout.js';
import { heightAt, groundKind, slopeAt } from './terrain.js';
import { hash2, mulberry32, fbm, clamp } from '../util/rng.js';
import { grassCard, reedCard, flowerCard } from './textures.js';
import { toon } from '../toon.js';

export const WIND = { value: 0 };
const _e = new T.Euler(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3();
export function M(px, py, pz, s = 1, ry = 0, lean = 0) {
  _e.set(lean, ry, 0); _q.setFromEuler(_e); _p.set(px, py, pz); _s.set(s, s, s);
  return new T.Matrix4().compose(_p, _q, _s);
}

export const LOD = { value: 160 };   // 树在这个距离以内画真模型，以外画烘好的卡片
const mats = new Map();
function windMat(base, kind, tint) {
  const key = base.uuid + kind + (tint || '');
  if (mats.has(key)) return mats.get(key);
  const m = base.clone();
  if (tint) m.color = new T.Color(tint);
  m.onBeforeCompile = sh => {
    sh.uniforms.uWind = WIND; sh.uniforms.uLod = LOD;
    sh.vertexShader = 'uniform float uWind;\nuniform float uLod;\nattribute float aPhase;\nattribute float aSway;\nattribute float aCol;\n' + sh.vertexShader;
    if (kind === 'leaf') sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>',
      '\tif (distance(instanceMatrix[3].xyz, cameraPosition) > uLod) transformed = vec3(0.0);\n#include <project_vertex>');
    if (kind === 'card') sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv.x=(vMapUv.x+aCol)*0.25;');
    const local = kind === 'frond' ? 'max(0.0,-transformed.y)*0.075' : kind === 'leaf' ? 'max(0.0,transformed.y-1.4)*0.016'
      : kind === 'culm' ? 'max(0.0,transformed.y-0.3)*0.055' : kind === 'grass' ? 'max(0.0,transformed.y)*0.22' : kind === 'reed' ? 'max(0.0,transformed.y)*0.12' : '0.0';
    if (kind === 'grass') sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y*=1.0-smoothstep(uLod*0.22,uLod*0.29,distance(instanceMatrix[3].xyz,cameraPosition));');
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n\tfloat amp=${local}+aSway;\n\tfloat sw=uWind+aPhase;\n\ttransformed.x+=sin(sw*1.30+transformed.y*0.32)*amp;\n\ttransformed.z+=cos(sw*1.07+transformed.y*0.26)*amp*0.7;`);
  };
  m.customProgramCacheKey = () => 'wind-' + kind + (kind === 'card' ? '-card' : '');
  mats.set(key, m);
  return m;
}

function shareGeometry(src) {
  const g = new T.BufferGeometry();
  for (const n in src.attributes) g.setAttribute(n, src.attributes[n]);
  if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox; g.boundingSphere = src.boundingSphere;
  return g;
}

/* 实例按 120 米的格子分批：每批自己的包围球、开视锥裁剪，再按到玩家的距离整批隐藏。
   不分批的话全图两千多棵树每帧都画，实测 730 万三角形。 */
const CHUNK = 120;
export const chunks = [];   // {mesh, cx, cz, far}
function instance(scene, geo, mat, items, shadow, far = 420) {
  const cells = new Map();
  for (const it of items) {
    const x = it.m.elements[12], z = it.m.elements[14];
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    (cells.get(key) || cells.set(key, []).get(key)).push(it);
  }
  const out = [];
  for (const [key, list] of cells) {
    const g = shareGeometry(geo);
    const inst = new T.InstancedMesh(g, mat, list.length);
    const phase = new Float32Array(list.length), sway = new Float32Array(list.length), col = new Float32Array(list.length);
    let sx = 0, sz = 0;
    list.forEach((it, i) => { inst.setMatrixAt(i, it.m); phase[i] = it.phase || 0; sway[i] = it.sway || 0; col[i] = it.col || 0; sx += it.m.elements[12]; sz += it.m.elements[14]; });
    g.setAttribute('aPhase', new T.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aSway', new T.InstancedBufferAttribute(sway, 1));
    g.setAttribute('aCol', new T.InstancedBufferAttribute(col, 1));
    inst.castShadow = shadow; inst.receiveShadow = true;
    inst.computeBoundingSphere(); inst.frustumCulled = true;
    const [cx, cz] = key.split(',').map(Number);
    scene.add(inst); out.push(inst);
    chunks.push({ mesh: inst, cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK, far });
  }
  return out;
}
/** 每帧按距离开关整批。 */
export function cullFoliage(px, pz) {
  for (const c of chunks) { const d = Math.hypot(c.cx - px, c.cz - pz) - CHUNK * 0.71; c.mesh.visible = d < c.far; }
}

function mergeGeos(list) {
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(t.getX(i), t.getY(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    base += p.count;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); out.setIndex(idx); return out;
}
function crossStrip(width, segs) { const h = new T.PlaneGeometry(width, 1, 1, segs).translate(0, -0.5, 0); return mergeGeos([h, h.clone().applyMatrix4(M(0, 0, 0, 1, Math.PI / 2))]); }
function crossCard(w, h) { const g = new T.PlaneGeometry(w, h, 1, 1); return mergeGeos([g, g.clone().applyMatrix4(M(0, 0, 0, 1, Math.PI / 2))]); }
function pinePad() {
  const q = new T.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  return mergeGeos([q.clone().rotateX(0.3), q.clone().rotateX(-0.3)]);
}
function branchTips(geo, buckets) {
  const pos = geo.attributes.position; if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, hi = bb.min.y + (bb.max.y - bb.min.y) * 0.5, best = new Array(buckets).fill(null);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); if (y < hi) continue;
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z); if (r < 0.18) continue;
    const b = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * buckets) % buckets, score = r + y * 0.25;
    if (!best[b] || score > best[b].score) best[b] = { x, y, z, score };
  }
  return best.filter(Boolean);
}
function bandPoints(geo, count, lo, hi) {
  const pos = geo.attributes.position; if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, y0 = bb.min.y + (bb.max.y - bb.min.y) * lo, y1 = bb.min.y + (bb.max.y - bb.min.y) * hi, cand = [];
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y >= y0 && y <= y1) cand.push({ x: pos.getX(i), y, z: pos.getZ(i) }); }
  if (cand.length <= count) return cand;
  const out = [], step = cand.length / count; for (let i = 0; i < count; i++) out.push(cand[Math.floor(i * step)]); return out;
}

/* ---------------- 撒布规则 ---------------- */
function clearOf(x, z, radius) {
  if (groundKind(x, z) !== 'grass' && groundKind(x, z) !== 'bank') return false;
  if (roadDist(x, z) < radius + 3) return false;
  const v = PLACES.village; if (Math.hypot(x - v.x, z - v.z) < 70) return false;
  const p = PLACES.paddies; if (Math.hypot(x - p.x, z - p.z) < p.r + 8) return false;
  for (const id of ['camp1', 'camp2']) { const c = PLACES[id]; if (Math.hypot(x - c.x, z - c.z) < 26) return false; }
  if (Math.hypot(x - PLACES.beacon.x, z - PLACES.beacon.z) < 24) return false;
  if (Math.hypot(x - PLACES.shrine.x, z - PLACES.shrine.z) < 18) return false;
  return true;
}

/** 返回 {colliders:[{x,z,r}], lanternSpots} 供碰撞和任务用。 */
export function plantWorld(scene, assets, opts = {}) {
  const { parts, materialFor, cards } = assets.trees;
  const rnd = mulberry32(WORLD.seed * 1000 + 17);
  const dense = opts.density ?? 1;
  const colliders = [];
  const groups = {};   // partName -> items
  const impostors = [];   // {name, x, y, z, scale, rot}
  const push = (name, x, z, scale, rot, lean, phase) => { (groups[name] ||= []).push({ m: M(x, heightAt(x, z) - 0.05, z, scale, rot, lean), phase }); };

  // 树和树之间最少隔这么远：用 4 米格子的哈希查邻居，不然几千棵树两两比距离太慢
  const occupied = new Map();
  const cellKey = (x, z) => Math.floor(x / 4) + ',' + Math.floor(z / 4);
  const tooClose = (x, z, radius) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const list = occupied.get(Math.floor(x / 4 + i) + ',' + Math.floor(z / 4 + j)); if (list) for (const c of list) if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return true; }
    return false;
  };
  const occupy = (x, z, r) => { const k = cellKey(x, z); (occupied.get(k) || occupied.set(k, []).get(k)).push({ x, z, r }); };
  const tryPlace = (x, z, radius) => clearOf(x, z, radius) && !tooClose(x, z, radius);

  // 1) 全图杂树 + 枫 + 桦：按噪声"林地密度"撒
  const total = Math.floor(9000 * dense);
  for (let i = 0; i < total; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.96, z = (rnd() - 0.5) * WORLD.size * 0.96;
    const forest = fbm(x / 220, z / 220, 3, WORLD.seed + 31);
    const y = heightAt(x, z);
    const nearMaples = Math.hypot(x - PLACES.maples.x, z - PLACES.maples.z) < PLACES.maples.r;
    const nearPines = Math.hypot(x - PLACES.pines.x, z - PLACES.pines.z) < PLACES.pines.r || y > 60;
    const nearVillage = Math.hypot(x - PLACES.village.x, z - PLACES.village.z) < 190;
    let keep = forest > -0.3 || y > 14 || nearMaples || nearPines;
    if (y > 95 && rnd() < 0.7) keep = false;                       // 山顶稀
    if (!keep || !tryPlace(x, z, 2.2)) continue;
    const r = rnd();
    let name;
    if (nearMaples && r < 0.75) name = 'MapleTree_' + (1 + Math.floor(rnd() * 5));
    else if (nearPines && r < 0.7) name = 'PineTree_' + [1, 2, 4][Math.floor(rnd() * 3)];
    else if (nearVillage && r < 0.5) name = 'Cherry_' + (1 + Math.floor(rnd() * 5));
    else if (r < 0.14) name = 'BirchTree_' + (1 + Math.floor(rnd() * 2));
    else if (r < 0.24) name = 'MapleTree_' + (1 + Math.floor(rnd() * 5));
    else name = 'NormalTree_' + (1 + Math.floor(rnd() * 5));
    const scale = 0.85 + rnd() * 0.5, rot = rnd() * Math.PI * 2;
    push(name, x, z, scale, rot, (rnd() - 0.5) * 0.06, rnd() * 6.28);
    colliders.push({ x, z, r: 0.55 * scale }); occupy(x, z, 2.2);
    impostors.push({ name, x, y: heightAt(x, z) - 0.05, z, scale, rot });
  }
  // 2) 灌木：树下和路边
  for (let i = 0; i < Math.floor(5000 * dense); i++) {
    const x = (rnd() - 0.5) * WORLD.size * 0.96, z = (rnd() - 0.5) * WORLD.size * 0.96;
    if (!clearOf(x, z, 0.6)) continue;
    if (fbm(x / 90, z / 90, 2, WORLD.seed + 41) < -0.1 && rnd() < 0.6) continue;
    push('Bush', x, z, 0.6 + rnd() * 0.7, rnd() * 6.28, 0, rnd() * 6.28);
  }
  // 3) 河岸垂柳：枯枝骨架 + 柳条卡片
  const willow = [], fronds = [];
  for (let z = -WORLD.half + 40; z < WORLD.half - 40; z += 14 + rnd() * 18) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.35) continue;
      const x = RIVER.x(z) + side * (RIVER.halfWidth + 4 + rnd() * 5);
      if (!tryPlace(x, z, 1.5)) continue;
      const scale = 0.9 + rnd() * 0.4, rot = rnd() * 6.28, y = heightAt(x, z) - 0.05;
      const part = parts['DeadTree_' + (1 + Math.floor(rnd() * 3))];
      willow.push({ part, m: M(x, y, z, scale, rot) });
      colliders.push({ x, z, r: 0.5 }); occupy(x, z, 1.5);
      // 柳条：从枝梢垂下
      const geo = part.meshes[0].geometry, tips = branchTips(geo, 10), root = new T.Matrix4().compose(new T.Vector3(x, y, z), _q.setFromEuler(_e.set(0, rot, 0)), new T.Vector3(scale, scale, scale));
      for (const t of tips) for (let k = 0; k < 3; k++) {
        const p = new T.Vector3(t.x + (rnd() - 0.5) * 0.4, t.y + 0.1, t.z + (rnd() - 0.5) * 0.4).applyMatrix4(root);
        const len = (1.6 + rnd() * 1.8) * scale;
        fronds.push({ m: new T.Matrix4().compose(p, _q.setFromEuler(_e.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.25)), new T.Vector3(1, len, 1)), phase: rnd() * 6.28, sway: 0.02, col: Math.floor(rnd() * 4) });
      }
    }
  }
  // 4) 竹坞：竹竿 + 叶簇卡片
  const culms = [], leaves = [], b = PLACES.bamboo;
  for (let i = 0; i < Math.floor(220 * dense); i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * b.r, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    if (!clearOf(x, z, 0.6)) continue;
    const scale = 0.9 + rnd() * 0.6, rot = rnd() * 6.28, y = heightAt(x, z) - 0.05, tall = rnd() < 0.7;
    const part = parts[tall ? 'Bamboo' : 'Bamboo_Mid'];
    culms.push({ part, m: M(x, y, z, scale, rot), phase: rnd() * 6.28 });
    const root = new T.Matrix4().compose(new T.Vector3(x, y, z), _q.setFromEuler(_e.set(0, rot, 0)), new T.Vector3(scale, scale, scale));
    for (const p0 of bandPoints(part.meshes[0].geometry, 64, 0.35, 1.0)) {
      const p = new T.Vector3(p0.x, p0.y, p0.z).applyMatrix4(root);
      leaves.push({ m: new T.Matrix4().compose(p, _q.setFromEuler(_e.set((rnd() - 0.5) * 0.6, rnd() * 6.28, (rnd() - 0.5) * 0.6)), new T.Vector3(1.9, 1.6, 1.9)), phase: rnd() * 6.28, sway: 0.03 + p0.y * 0.012, col: Math.floor(rnd() * 4) });
    }
    if (rnd() < 0.3) colliders.push({ x, z, r: 0.35 });
  }
  // 5) 层叠松：山神祠和烽台边上几棵，枯枝骨架 + 针盘
  const pads = [];
  const pineSpots = [[PLACES.shrine.x + 14, PLACES.shrine.z + 8], [PLACES.shrine.x - 16, PLACES.shrine.z + 12], [PLACES.beacon.x - 14, PLACES.beacon.z + 16], [PLACES.beacon.x + 18, PLACES.beacon.z + 10], [PLACES.teahouse.x - 10, PLACES.teahouse.z - 12]];
  for (const [x, z] of pineSpots) {
    const scale = 1.3 + rnd() * 0.4, rot = rnd() * 6.28, y = heightAt(x, z) - 0.05, part = parts['DeadTree_' + (1 + Math.floor(rnd() * 3))];
    willow.push({ part, m: M(x, y, z, scale, rot) }); colliders.push({ x, z, r: 0.6 });
    const root = new T.Matrix4().compose(new T.Vector3(x, y, z), _q.setFromEuler(_e.set(0, rot, 0)), new T.Vector3(scale, scale, scale));
    for (const t of branchTips(part.meshes[0].geometry, 14)) for (let k = 0; k < 4; k++) {
      const p = new T.Vector3(t.x * (0.55 + k * 0.15), t.y + 0.05 + k * 0.08, t.z * (0.55 + k * 0.15)).applyMatrix4(root);
      const w = (1.4 + rnd() * 1.2) * scale;
      pads.push({ m: new T.Matrix4().compose(p, _q.setFromEuler(_e.set(0, Math.atan2(-t.z, t.x) + (rnd() - 0.5) * 0.5, 0)), new T.Vector3(w, 1, w * 0.8)), phase: rnd() * 6.28, sway: 0.01, col: Math.floor(rnd() * 4) });
    }
  }

  // ---- 合批 ----
  const tint = opts.tint || null;
  let triangles = 0;
  for (const [name, items] of Object.entries(groups)) {
    const part = parts[name.replace('Cherry_', 'MapleTree_')];
    for (const { geometry, matName } of part.meshes) {
      instance(scene, geometry, windMat(materialFor(name.startsWith('Cherry_') && matName === 'MapleTree_Leaves' ? 'Cherry_Leaves' : matName), 'leaf', tint), items, true, name === 'Bush' ? 150 : LOD.value + 30);
      triangles += (geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3) * items.length;
    }
  }
  const byPart = new Map();
  for (const w of willow) { (byPart.get(w.part) || byPart.set(w.part, []).get(w.part)).push({ m: w.m }); }
  for (const [part, items] of byPart) for (const { geometry, matName } of part.meshes) instance(scene, geometry, materialFor(matName), items, true, 380);
  const byCulm = new Map();
  for (const c of culms) { (byCulm.get(c.part) || byCulm.set(c.part, []).get(c.part)).push({ m: c.m, phase: c.phase }); }
  for (const [part, items] of byCulm) for (const { geometry, matName } of part.meshes) instance(scene, geometry, windMat(materialFor(matName), 'culm'), items, true, 300);
  const cardMat = (key, kind) => windMat(toon({ map: cards[key], alphaTest: 0.45, side: T.DoubleSide, emissive: 0x5c7a3a, emissiveMap: cards[key], emissiveIntensity: 0.35 }), kind);
  if (fronds.length) instance(scene, crossStrip(0.55, 6), cardMat('willow', 'frond'), fronds, false, 260);
  if (leaves.length) instance(scene, crossCard(1.2, 1.0), cardMat('bamboo', 'card'), leaves, false, 260);
  if (pads.length) instance(scene, pinePad(), cardMat('pine', 'card'), pads, false, 300);

  // 东畈：稻秧按行列插满整片田，静态合批（不是玩家周围现算的草）
  const reeds = [], p = PLACES.paddies;
  for (let z = p.z - p.r; z <= p.z + p.r; z += 0.8) for (let x = p.x - p.r; x <= p.x + p.r; x += 0.8) {
    if (Math.hypot(x - p.x, z - p.z) > p.r - 14) continue;
    if (Math.abs(Math.sin(z * 0.9)) < 0.18 || Math.abs(Math.sin(x * 0.11)) < 0.05) continue;   // 田埂
    if (roadDist(x, z) < 4) continue;
    const jx = x + (hash2(x * 7, z, 3) - 0.5) * 0.3, jz = z + (hash2(x, z * 7, 4) - 0.5) * 0.3;
    reeds.push({ m: M(jx, heightAt(jx, jz) + 0.05, jz, 1.0 + hash2(x, z, 5) * 0.4, hash2(z, x, 6) * 6.28), phase: hash2(x, z, 8) * 6.28 });
  }
  if (reeds.length) instance(scene, crossCard(0.6, 0.9).translate(0, 0.45, 0), windMat(toon({ map: reedCard(), alphaTest: 0.4, side: T.DoubleSide, color: 0xd8e8a8 }), 'reed'), reeds, false, 260);

  // 远树：烘好的卡片，一棵两三角形
  let impostorMesh = null;
  if (opts.impostor && impostors.length) impostorMesh = buildImpostors(scene, opts.impostor, impostors);

  return { colliders, triangles: Math.round(triangles), trees: impostors.length, impostorMesh };
}

/* ---------------- 远树卡片：开场把每种树正面渲染到一张图集上 ---------------- */
export function bakeImpostors(renderer, assets, names) {
  const { parts, materialFor } = assets.trees;
  const COLS = 6, ROWS = Math.ceil(names.length / COLS), CELL = 256;
  const rt = new T.WebGLRenderTarget(COLS * CELL, ROWS * CELL, { depthBuffer: true });
  rt.texture.colorSpace = T.NoColorSpace; rt.texture.generateMipmaps = true; rt.texture.minFilter = T.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x8a8a7a, 1.6));
  const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(0.5, 1, 1.2); scene.add(sun);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  const slots = {};
  const oldTM = renderer.toneMapping, oldTarget = renderer.getRenderTarget(), oldClear = new T.Color(); renderer.getClearColor(oldClear); const oldAlpha = renderer.getClearAlpha();
  renderer.toneMapping = T.NoToneMapping; renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  names.forEach((name, i) => {
    const part = parts[name.replace('Cherry_', 'MapleTree_')]; const group = new T.Group();
    for (const { geometry, matName } of part.meshes) group.add(new T.Mesh(geometry, materialFor(name.startsWith('Cherry_') && matName === 'MapleTree_Leaves' ? 'Cherry_Leaves' : matName)));
    scene.add(group);
    const h = part.height, w = Math.max(part.radius * 2, h * 0.5);
    cam.left = -w / 2; cam.right = w / 2; cam.top = h; cam.bottom = 0; cam.position.set(0, h * 0.5, 30); cam.lookAt(0, h * 0.5, 0); cam.updateProjectionMatrix();
    const col = i % COLS, row = Math.floor(i / COLS);
    renderer.setViewport(col * CELL, row * CELL, CELL, CELL); renderer.setScissor(col * CELL, row * CELL, CELL, CELL); renderer.setScissorTest(true);
    renderer.render(scene, cam);
    scene.remove(group);
    slots[name] = { u: col / COLS, v: row / ROWS, w, h };
  });
  renderer.setScissorTest(false); renderer.setRenderTarget(oldTarget); renderer.toneMapping = oldTM; renderer.setClearColor(oldClear, oldAlpha); renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  return { texture: rt.texture, slots, cols: COLS, rows: ROWS };
}

export const IMPOSTOR_LIGHT = { sun: new T.Vector3(0, 1, 0), sunColor: new T.Color(1, 1, 1), ambient: new T.Color(0.5, 0.5, 0.5) };
function buildImpostors(scene, atlas, list) {
  const n = list.length;
  const geo = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const off = new Float32Array(n * 3), size = new Float32Array(n * 2), slot = new Float32Array(n * 2);
  list.forEach((t, i) => { const s = atlas.slots[t.name]; off[i * 3] = t.x; off[i * 3 + 1] = t.y; off[i * 3 + 2] = t.z; size[i * 2] = s.w * t.scale; size[i * 2 + 1] = s.h * t.scale; slot[i * 2] = s.u; slot[i * 2 + 1] = s.v; });
  geo.setAttribute('aOff', new T.InstancedBufferAttribute(off, 3)); geo.setAttribute('aSize', new T.InstancedBufferAttribute(size, 2)); geo.setAttribute('aSlot', new T.InstancedBufferAttribute(slot, 2));
  geo.instanceCount = n;
  const mat = new T.ShaderMaterial({
    uniforms: Object.assign(T.UniformsUtils.merge([T.UniformsLib.fog]), { uAtlas: { value: atlas.texture }, uCell: { value: new T.Vector2(1 / atlas.cols, 1 / atlas.rows) }, uLod: LOD, uSun: { value: IMPOSTOR_LIGHT.sun }, uSunColor: { value: IMPOSTOR_LIGHT.sunColor }, uAmbient: { value: IMPOSTOR_LIGHT.ambient } }),
    fog: true, side: T.DoubleSide, alphaTest: 0.5,
    vertexShader: `attribute vec3 aOff; attribute vec2 aSize; attribute vec2 aSlot; uniform vec2 uCell; uniform float uLod; varying vec2 vUv; varying float vShade;
      #include <fog_pars_vertex>
      void main(){
        vec3 toCam = cameraPosition - aOff; float d = length(toCam.xz);
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        float on = step(uLod, d);
        vec3 wp = aOff + right * position.x * aSize.x * on + vec3(0.0, 1.0, 0.0) * position.y * aSize.y * on;
        vUv = aSlot + uv * uCell;
        vShade = 0.85 + 0.15 * uv.y;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uSun, uSunColor, uAmbient; varying vec2 vUv; varying float vShade;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.5) discard;
        vec3 col = t.rgb * (uAmbient + uSunColor * max(uSun.y, 0.0) * 0.9) * vShade;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'impostors'; mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

/* ---------------- 草：玩家周围的格子 ---------------- */
export function createGrass(scene, opts = {}) {
  const CELL = 8, RANGE = opts.range || 6, PER = opts.perCell || 44, MAX = (RANGE * 2 + 1) ** 2 * PER;
  const geo = (() => {
    const q = new T.PlaneGeometry(1, 1, 1, 2).translate(0, 0.5, 0);
    return mergeGeos([q, q.clone().rotateY(Math.PI / 3), q.clone().rotateY(-Math.PI / 3)]);
  })();
  const mat = windMat(toon({ map: grassCard(), alphaTest: 0.4, side: T.DoubleSide, color: 0xd6e6b0, emissive: 0x3a5a20, emissiveMap: grassCard(), emissiveIntensity: 0.25 }), 'grass');
  const inst = new T.InstancedMesh(geo, mat, MAX);
  const phase = new Float32Array(MAX), sway = new Float32Array(MAX), col = new Float32Array(MAX);
  geo.setAttribute('aPhase', new T.InstancedBufferAttribute(phase, 1)); geo.setAttribute('aSway', new T.InstancedBufferAttribute(sway, 1)); geo.setAttribute('aCol', new T.InstancedBufferAttribute(col, 1));
  inst.frustumCulled = false; inst.receiveShadow = true; inst.castShadow = false; inst.count = 0; inst.name = 'grass';
  scene.add(inst);
  // 花：每格几朵，四列图集按实例挑颜色
  const FMAX = (RANGE * 2 + 1) ** 2 * 4;
  const flowers = new T.InstancedMesh(crossCard(0.32, 0.32).translate(0, 0.14, 0), windMat(toon({ map: flowerCard(), alphaTest: 0.4, side: T.DoubleSide, emissive: 0x806050, emissiveMap: flowerCard(), emissiveIntensity: 0.5 }), 'card'), FMAX);
  const fphase = new Float32Array(FMAX), fcol = new Float32Array(FMAX);
  flowers.geometry.setAttribute('aPhase', new T.InstancedBufferAttribute(fphase, 1)); flowers.geometry.setAttribute('aSway', new T.InstancedBufferAttribute(new Float32Array(FMAX), 1)); flowers.geometry.setAttribute('aCol', new T.InstancedBufferAttribute(fcol, 1));
  flowers.frustumCulled = false; flowers.count = 0; flowers.name = 'flowers'; scene.add(flowers);
  let cx = 1e9, cz = 1e9;
  const mat4 = new T.Matrix4();
  function rebuild(px, pz) {
    let n = 0, fn = 0;
    for (let j = -RANGE; j <= RANGE; j++) for (let i = -RANGE; i <= RANGE; i++) {
      const gx = cx + i, gz = cz + j;
      for (let k = 0; k < 4; k++) {
        const x = (gx + hash2(gx * 3 + k, gz * 9, 21)) * CELL, z = (gz + hash2(gx * 9, gz * 3 + k, 22)) * CELL;
        if (groundKind(x, z) !== 'grass' || hash2(gx + k, gz, 23) > 0.5 || fn >= FMAX) continue;
        mat4.compose(_p.set(x, heightAt(x, z) - 0.02, z), _q.setFromEuler(_e.set(0, hash2(gx, gz + k, 24) * 6.28, 0)), _s.set(1, 1, 1));
        flowers.setMatrixAt(fn, mat4); fphase[fn] = hash2(gx, k, 25) * 6.28; fcol[fn] = Math.floor(hash2(k, gx * gz, 26) * 4); fn++;
      }
      for (let k = 0; k < PER; k++) {
        const x = (gx + hash2(gx * 7 + k, gz, 1)) * CELL, z = (gz + hash2(gx, gz * 5 + k, 2)) * CELL;
        const kind = groundKind(x, z);
        if (kind !== 'grass' && kind !== 'bank') continue;
        if (n >= MAX) continue;
        const density = 0.55 + 0.45 * fbm(x / 30, z / 30, 2, 77);
        if (hash2(gx * 3, gz * 11 + k, 5) > density) continue;
        const s = 0.42 + hash2(k, gx + gz, 6) * 0.5, y = heightAt(x, z) - 0.03;
        mat4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, hash2(gx + k, gz, 7) * 6.28, 0)), _s.set(s * 1.3, s, s * 1.3));
        inst.setMatrixAt(n, mat4); phase[n] = hash2(gx, gz + k, 8) * 6.28; n++;
      }
    }
    inst.count = n; inst.instanceMatrix.needsUpdate = true; geo.attributes.aPhase.needsUpdate = true;
    flowers.count = fn; flowers.instanceMatrix.needsUpdate = true; flowers.geometry.attributes.aPhase.needsUpdate = true; flowers.geometry.attributes.aCol.needsUpdate = true;
  }
  return {
    mesh: inst,
    update(px, pz) {
      const nx = Math.floor(px / CELL), nz = Math.floor(pz / CELL);
      if (Math.abs(nx - cx) >= 2 || Math.abs(nz - cz) >= 2) { cx = nx; cz = nz; rebuild(px, pz); }
    },
  };
}
