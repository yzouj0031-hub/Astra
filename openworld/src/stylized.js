/* 二次元汉服人物：不用 Quaternius 的身体网格，只借它的骨架和动画。
   长袍、广袖是按绑定姿势放样出来的曲面，按离骨头的远近算蒙皮权重；
   头、发、手、靴刚性挂在骨头上。全部卡通着色 + 反向外壳描边。

   坐标都在"网格空间"（骨架的绑定姿势，T 字站姿，身高约 1.84）。
   挂到骨头上的办法：子组的局部矩阵取 boneInverse —— 绑定姿势下它的世界矩阵就是单位阵，
   所以子组里的几何直接按网格空间坐标建，动起来自然跟着骨头走。 */
import * as T from 'three';
import { toon, addOutline } from './toon.js';
import { mulberry32 } from './util/rng.js';

const LOOKS = {
  // 玩家：白袍蓝缘，束发红绳
  player:   { robe: '#f3ede0', trim: '#2f5f8f', sash: '#2f5f8f', hair: '#1b2238', ribbon: '#c0392b', skin: '#f6dcc3', hairStyle: 'topknot', brows: 'calm' },
  elder:    { robe: '#5a5f66', trim: '#2a2d33', sash: '#8a6a3a', hair: '#c9c6bd', ribbon: '#6a6a6a', skin: '#efd2b5', hairStyle: 'bun', brows: 'old', beard: true },
  man1:     { robe: '#3d5a80', trim: '#1f2f44', sash: '#c9a24c', hair: '#242424', ribbon: '#8a3a2a', skin: '#f0d4b8', hairStyle: 'topknot', brows: 'calm' },
  man2:     { robe: '#6b8e5a', trim: '#2f4a2a', sash: '#e0d4b0', hair: '#2a2420', ribbon: '#3a3a3a', skin: '#e8c9a8', hairStyle: 'headband', brows: 'calm' },
  woman1:   { robe: '#e8c7d0', trim: '#9a4a6a', sash: '#9a4a6a', hair: '#1e1c2c', ribbon: '#d94a5a', skin: '#f8e2cf', hairStyle: 'buns', brows: 'soft', female: true },
  woman2:   { robe: '#cfe0e8', trim: '#3a6a8a', sash: '#3a6a8a', hair: '#2c2230', ribbon: '#e0b040', skin: '#f6dcc8', hairStyle: 'long', brows: 'soft', female: true },
  child:    { robe: '#f0d070', trim: '#b04a30', sash: '#b04a30', hair: '#1e1e28', ribbon: '#c0392b', skin: '#f8e0cc', hairStyle: 'buns', brows: 'soft', small: true },
  bandit:   { robe: '#4a4038', trim: '#2a2420', sash: '#8a2a22', hair: '#1a1a1a', ribbon: '#b02a22', skin: '#d9b896', hairStyle: 'headband', brows: 'angry', scar: true },
  bandit2:  { robe: '#3a3f48', trim: '#20242a', sash: '#6a2a22', hair: '#2a2420', ribbon: '#8a2a22', skin: '#cfae8e', hairStyle: 'topknot', brows: 'angry' },
};

const B = {};   // 骨名 → 绑定位置，见 rigprobe
const BIND = { pelvis: [0, 0.949, -0.043], spine_01: [0, 1.072, -0.007], spine_02: [0, 1.178, 0.004], spine_03: [0, 1.311, 0.007], neck_01: [0, 1.521, -0.041], Head: [0, 1.6, -0.017],
  upperarm_l: [0.212, 1.455, -0.065], lowerarm_l: [0.463, 1.456, -0.073], hand_l: [0.706, 1.456, -0.065], thigh_l: [0.114, 0.971, -0.036], calf_l: [0.114, 0.542, -0.036], foot_l: [0.114, 0.086, -0.088] };
for (const k in BIND) { B[k] = new T.Vector3(...BIND[k]); if (k.endsWith('_l')) B[k.replace('_l', '_r')] = new T.Vector3(-BIND[k][0], BIND[k][1], BIND[k][2]); }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c) { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }

/* ---------- 贴图：脸、袍 ---------- */
function faceTexture(look) {
  const n = 256, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.fillStyle = look.skin; ctx.fillRect(0, 0, n, n);
  // 腮红
  ctx.fillStyle = 'rgba(240,140,140,0.28)'; for (const x of [78, 178]) { ctx.beginPath(); ctx.ellipse(x, 158, 22, 12, 0, 0, 6.28); ctx.fill(); }
  // 眼睛：大而竖长，上睫毛粗
  const eye = (cx) => {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, 132, 17, 22, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = look.brows === 'angry' ? '#4a2a1a' : '#2c3e6a'; ctx.beginPath(); ctx.ellipse(cx, 136, 11, 17, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#10121c'; ctx.beginPath(); ctx.ellipse(cx, 139, 7, 11, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - 4, 126, 4, 5, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 19, 118); ctx.quadraticCurveTo(cx, 104, cx + 19, 116); ctx.stroke();
  };
  eye(94); eye(162);
  // 眉
  ctx.strokeStyle = look.hair; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const browY = look.brows === 'angry' ? [102, 92] : look.brows === 'old' ? [92, 96] : [96, 92];
  ctx.beginPath(); ctx.moveTo(74, browY[0]); ctx.quadraticCurveTo(94, browY[1] - 4, 114, browY[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(142, browY[1]); ctx.quadraticCurveTo(162, browY[1] - 4, 182, browY[0]); ctx.stroke();
  // 鼻、嘴
  ctx.strokeStyle = 'rgba(120,70,60,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(128, 150); ctx.lineTo(125, 162); ctx.stroke();
  ctx.strokeStyle = '#8a3a3a'; ctx.lineWidth = 3; ctx.beginPath(); if (look.brows === 'angry') { ctx.moveTo(116, 184); ctx.lineTo(140, 182); } else { ctx.moveTo(116, 180); ctx.quadraticCurveTo(128, 190, 140, 180); } ctx.stroke();
  if (look.scar) { ctx.strokeStyle = '#b04a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(170, 150); ctx.lineTo(186, 184); ctx.stroke(); }
  if (look.beard) { ctx.fillStyle = look.hair; ctx.beginPath(); ctx.moveTo(100, 190); ctx.quadraticCurveTo(128, 250, 156, 190); ctx.quadraticCurveTo(128, 205, 100, 190); ctx.fill(); }
  return tex(c);
}
function robeTexture(look) {
  const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = look.robe; ctx.fillRect(0, 0, w, h);
  // 衣料细纹
  ctx.fillStyle = 'rgba(0,0,0,0.035)'; for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  // 交领：正面（u=0.5）两条斜带交叉，右衽
  ctx.strokeStyle = look.trim; ctx.lineWidth = 26; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.52, h * 0.19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.64, 0); ctx.lineTo(w * 0.48, h * 0.2); ctx.stroke();
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(w * 0.62, 0); ctx.lineTo(w * 0.47, h * 0.19); ctx.stroke();
  // 腰带
  ctx.fillStyle = look.sash; ctx.fillRect(0, h * 0.33, w, h * 0.06);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, h * 0.385, w, h * 0.01);
  // 下摆缘边 + 正面开衩线
  ctx.fillStyle = look.trim; ctx.fillRect(0, h * 0.95, w, h * 0.05);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(w * 0.49, h * 0.39, 6, h * 0.56);
  // 袖口在另一张图里；这里右侧留一条备用
  return tex(c);
}
function sleeveTexture(look) {
  const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = look.robe; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.035)'; for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  ctx.fillStyle = look.trim; ctx.fillRect(w * 0.86, 0, w * 0.14, h);   // 袖口缘
  return tex(c);
}

/* ---------- 放样曲面：沿一条轴的一串椭圆截面 ---------- */
/** rings: [{c:Vector3, rx, ry, rz?, tilt?}] 从上到下；segs 周向段数。返回 BufferGeometry（含 uv、normal）。
    axis 'y'：截面在 XZ 平面；axis 'x'：截面在 YZ 平面（袖子）。 */
function loft(rings, segs, axis = 'y', uvFront = 0.5) {
  const pos = [], uv = [], idx = [];
  rings.forEach((r, j) => {
    const v = j / (rings.length - 1);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (axis === 'y') pos.push(r.c.x + Math.sin(a) * r.rx, r.c.y, r.c.z + Math.cos(a) * r.rz);   // a=0 朝 +z（正面）
      else pos.push(r.c.x, r.c.y + Math.cos(a) * r.ry, r.c.z + Math.sin(a) * r.rz);
      uv.push(((i / segs) + uvFront) % 1, 1 - v);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- 蒙皮权重：按高度分段给躯干骨，下摆分给大腿 ---------- */
function weightRobe(geo, boneIndex) {
  const p = geo.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const id = name => boneIndex.get(name);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i); let w = [];
    const seg = (a, b, ya, yb) => { const t = Math.max(0, Math.min(1, (y - ya) / (yb - ya))); w = [[a, 1 - t], [b, t]]; };
    if (y >= 1.42) w = [[id('spine_03'), 1]];
    else if (y >= 1.30) seg(id('spine_03'), id('spine_03'), 1.30, 1.42);
    else if (y >= 1.18) seg(id('spine_02'), id('spine_03'), 1.18, 1.30);
    else if (y >= 1.07) seg(id('spine_01'), id('spine_02'), 1.07, 1.18);
    else if (y >= 0.95) seg(id('pelvis'), id('spine_01'), 0.95, 1.07);
    else {
      // 下摆：骨盆 + 同侧大腿，越往下大腿占比越高，接近中线的点两条腿平分
      const t = Math.max(0, Math.min(1, (0.95 - y) / 0.6)), legShare = 0.25 + 0.55 * t, side = Math.max(-1, Math.min(1, x / 0.12));
      const l = legShare * (0.5 + 0.5 * side), r = legShare * (0.5 - 0.5 * side);
      w = [[id('pelvis'), 1 - legShare], [id('thigh_l'), l], [id('thigh_r'), r]];
    }
    w.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v; });
  }
  geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
}
function weightSleeve(geo, boneIndex, side) {
  const p = geo.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const up = boneIndex.get('upperarm_' + side), lo = boneIndex.get('lowerarm_' + side), hand = boneIndex.get('hand_' + side);
  for (let i = 0; i < n; i++) {
    const x = Math.abs(p.getX(i));
    let w;
    if (x < 0.40) w = [[up, 1]]; else if (x < 0.50) { const t = (x - 0.40) / 0.10; w = [[up, 1 - t], [lo, t]]; } else if (x < 0.66) w = [[lo, 1]]; else { const t = Math.min(1, (x - 0.66) / 0.06); w = [[lo, 1 - t], [hand, t]]; }
    w.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v; });
  }
  geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
}

/* ---------- 头 ---------- */
function headGeometry(scaleX = 1) {
  const g = new T.SphereGeometry(0.128, 28, 22);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 下半收成下巴，脸略扁
    if (y < 0) { const t = -y / 0.128; const k = 1 - 0.32 * t * t; x *= k; z = z * (1 - 0.12 * t); }
    z *= 0.94; x *= scaleX;
    p.setXYZ(i, x, y, z);
    // 正面平面投影：脸画在贴图中央，背面指向贴图角上的纯肤色
    if (z > 0.01) uv.setXY(i, 0.5 + x / 0.3, 0.46 + y / 0.3); else uv.setXY(i, 0.02, 0.98);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------- 发型 ---------- */
function hair(look, mat, head) {
  const g = new T.Group();
  const cap = new T.SphereGeometry(0.146, 24, 18);
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 前额留刘海：正面低于一条锯齿线的点折回线上
    const fringe = 0.05 + 0.035 * Math.abs(Math.sin(x * 55));
    let ny = y;
    if (z > 0.02 && y < fringe) ny = fringe; else if (z <= 0.02 && y < -0.05) ny = -0.05;   // 后脑勺到颈
    p.setXYZ(i, x * 1.02, ny, z * 0.98);
  }
  cap.computeVertexNormals();
  const capMesh = new T.Mesh(cap, mat); capMesh.position.set(0, 0.012, -0.012); g.add(capMesh); addOutline(capMesh, 0.006);
  const ribbon = toon({ color: look.ribbon });
  if (look.hairStyle === 'topknot' || look.hairStyle === 'bun') {
    const bun = new T.Mesh(new T.SphereGeometry(0.052, 14, 12), mat); bun.position.set(0, 0.155, -0.03); bun.scale.set(1, 0.85, 1); g.add(bun); addOutline(bun, 0.005);
    const band = new T.Mesh(new T.TorusGeometry(0.046, 0.012, 8, 20), ribbon); band.position.set(0, 0.125, -0.03); band.rotation.x = Math.PI / 2; g.add(band);
    if (look.hairStyle === 'topknot') { const stick = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.22, 6), toon({ color: '#c9a24c' })); stick.position.set(0, 0.155, -0.03); stick.rotation.z = Math.PI / 2; g.add(stick); }
  }
  if (look.hairStyle === 'headband') {
    const band = new T.Mesh(new T.TorusGeometry(0.146, 0.016, 8, 28), ribbon); band.position.set(0, 0.04, -0.012); band.rotation.x = Math.PI / 2; band.scale.z = 0.98; g.add(band);
    const tail = new T.Mesh(new T.PlaneGeometry(0.05, 0.3), toon({ color: look.ribbon, side: T.DoubleSide })); tail.position.set(0.04, -0.1, -0.15); tail.rotation.y = 0.3; g.add(tail);
  }
  if (look.hairStyle === 'buns') {
    for (const sx of [-1, 1]) { const bun = new T.Mesh(new T.SphereGeometry(0.05, 14, 12), mat); bun.position.set(sx * 0.12, 0.1, -0.02); g.add(bun); addOutline(bun, 0.005);
      const band = new T.Mesh(new T.TorusGeometry(0.04, 0.01, 8, 18), ribbon); band.position.set(sx * 0.12, 0.09, -0.02); band.rotation.z = Math.PI / 2; g.add(band); }
  }
  if (look.hairStyle === 'long' || look.female) {
    // 披到背后的长发：一片放样
    const rings = []; for (let k = 0; k <= 6; k++) { const t = k / 6; rings.push({ c: new T.Vector3(0, 0.02 - t * 0.62, -0.09 - t * 0.04), rx: 0.11 - t * 0.03, rz: 0.045 - t * 0.02 }); }
    const back = new T.Mesh(loft(rings, 12, 'y'), mat); g.add(back); addOutline(back, 0.005);
    const tie = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 8, 16), ribbon); tie.position.set(0, -0.2, -0.11); tie.rotation.x = Math.PI / 2; g.add(tie);
  }
  head.add(g);
}

/* ---------- 整个人 ---------- */
/**
 * fig: makeFigure() 的结果（骨架 + 动画），原来的 Quaternius 网格会被藏掉。
 * lookId: LOOKS 的键。返回 {parts, dispose}。
 */
export function dressFigure(fig, lookId = 'player', opts = {}) {
  const look = LOOKS[lookId] || LOOKS.player;
  const model = fig.model;
  let skeleton = null, armature = null, ref = null;
  model.traverse(o => { if (o.isSkinnedMesh && !skeleton) { skeleton = o.skeleton; armature = o.parent; ref = o; } });
  if (!skeleton) throw new Error('没有找到骨架');
  model.traverse(o => { if (o.isSkinnedMesh) o.visible = false; });
  const boneIndex = new Map(skeleton.bones.map((b, i) => [b.name, i]));
  const bone = name => skeleton.bones[boneIndex.get(name)];
  const inverse = name => skeleton.boneInverses[boneIndex.get(name)];
  const small = look.small ? 0.78 : 1, female = look.female ? 0.9 : 1;

  const skinMat = toon({ color: look.skin });
  const robeMat = toon({ map: robeTexture(look) });
  const sleeveMat = toon({ map: sleeveTexture(look), side: T.DoubleSide });
  const hairMat = toon({ color: look.hair });
  const faceMat = toon({ map: faceTexture(look) });
  const bootMat = toon({ color: '#2a2622' });

  const parts = [];
  /** 刚性挂件：子组局部矩阵 = boneInverse，几何按网格空间坐标写。 */
  const rigid = (boneName) => { const g = new T.Group(); g.matrix.copy(inverse(boneName)); g.matrix.decompose(g.position, g.quaternion, g.scale); bone(boneName).add(g); return g; };
  /** 蒙皮件：和原来的蒙皮网格同一个父节点、同一副骨架。 */
  const skinned = (geo, mat) => { const m = new T.SkinnedMesh(geo, mat); armature.add(m); m.bind(skeleton, ref.bindMatrix); m.castShadow = true; m.frustumCulled = false; parts.push(m); addOutline(m, 0.007); return m; };

  // 长袍
  const robeRings = [];
  const flare = look.female ? 1 : 0.84;
  const prof = [[1.50, 0.185, 0.115], [1.42, 0.2, 0.125], [1.32, 0.19, 0.125], [1.2, 0.17, 0.115], [1.1, 0.155, 0.105], [1.02, 0.165, 0.115], [0.95, 0.19, 0.13], [0.8, 0.205 * flare, 0.15], [0.62, 0.23 * flare, 0.17], [0.45, 0.26 * flare, 0.19], [0.28, 0.29 * flare, 0.21], [0.1, 0.32 * flare, 0.235]];
  for (const [y, rx, rz] of prof) robeRings.push({ c: new T.Vector3(0, y, y > 1.0 ? 0.0 : -0.01), rx: rx * 0.92 * female * small, rz: rz * 0.95 * small, ry: 0 });
  const robeGeo = loft(robeRings, 28, 'y', 0.5); weightRobe(robeGeo, boneIndex);
  const robe = skinned(robeGeo, robeMat); robe.name = 'robe';
  // 领口与脖子：一截肤色圆柱 + 衣领外翻
  const neck = rigid('neck_01'); const nk = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.16, 12), skinMat); nk.position.set(0, 1.56, -0.015); neck.add(nk);

  // 广袖
  for (const side of ['l', 'r']) {
    const s = side === 'l' ? 1 : -1, rings = [];
    const sp = [[0.19, 0.075, 0.07, 0], [0.3, 0.085, 0.075, 0], [0.42, 0.1, 0.085, -0.01], [0.52, 0.13, 0.095, -0.03], [0.62, 0.17, 0.1, -0.06], [0.72, 0.19, 0.1, -0.08]];
    for (const [x, ry, rz, dy] of sp) rings.push({ c: new T.Vector3(s * x, 1.455 + dy, -0.065), ry: ry * small, rz: rz * small });
    const g = loft(rings, 16, 'x', 0); weightSleeve(g, boneIndex, side);
    skinned(g, sleeveMat).name = 'sleeve_' + side;
    // 手
    const h = rigid('hand_' + side); const hand = new T.Mesh(new T.SphereGeometry(0.042 * small, 12, 10), skinMat); hand.position.set(s * 0.76, 1.452, -0.055); hand.scale.set(1.4, 0.8, 1); h.add(hand); addOutline(hand, 0.004);
    // 靴
    const f = rigid('foot_' + side); const boot = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), bootMat); boot.position.set(s * 0.114, 0.05, 0.02); boot.scale.set(0.9, 0.75, 1.7); f.add(boot); addOutline(boot, 0.005);
  }

  // 头：二次元比例，比真人头大一圈
  const hd = rigid('Head');
  const head = new T.Mesh(headGeometry(female === 1 ? 1 : 0.97), faceMat); head.position.set(0, 1.735 * (small === 1 ? 1 : 0.985), 0.0); head.scale.setScalar(small === 1 ? 1.18 : 1.08); hd.add(head); addOutline(head, 0.006);
  head.traverse(o => { o.castShadow = true; });
  hair(look, hairMat, head);

  // 腰间：飘带和玉佩
  const waist = rigid('pelvis');
  const ribbon = new T.Mesh(new T.PlaneGeometry(0.05, 0.36), toon({ color: look.sash, side: T.DoubleSide })); ribbon.position.set(0.09, 0.84, 0.17); ribbon.rotation.y = 0.1; waist.add(ribbon);
  const jade = new T.Mesh(new T.SphereGeometry(0.02, 10, 8), toon({ color: '#5fae8a' })); jade.position.set(0.09, 0.64, 0.17); waist.add(jade);

  parts.forEach(m => { m.receiveShadow = false; });
  fig.hand = bone('hand_r');
  return { parts, look };
}

export { LOOKS };
