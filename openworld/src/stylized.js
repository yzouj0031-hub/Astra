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
  player:   { robe: '#f3ede0', inner: '#6fa0c8', trim: '#2f5f8f', sash: '#2f5f8f', hair: '#1b2238', hairLight: '#4a5a8a', ribbon: '#c0392b', skin: '#f6dcc3', hairStyle: 'topknot', brows: 'calm' },
  elder:    { robe: '#5a5f66', trim: '#2a2d33', sash: '#8a6a3a', hair: '#c9c6bd', ribbon: '#6a6a6a', skin: '#efd2b5', hairStyle: 'bun', brows: 'old', beard: true },
  man1:     { robe: '#3d5a80', trim: '#1f2f44', sash: '#c9a24c', hair: '#242424', ribbon: '#8a3a2a', skin: '#f0d4b8', hairStyle: 'topknot', brows: 'calm' },
  man2:     { robe: '#6b8e5a', trim: '#2f4a2a', sash: '#e0d4b0', hair: '#2a2420', ribbon: '#3a3a3a', skin: '#e8c9a8', hairStyle: 'headband', brows: 'calm' },
  woman1:   { robe: '#e8c7d0', trim: '#9a4a6a', sash: '#9a4a6a', hair: '#1e1c2c', ribbon: '#d94a5a', skin: '#f8e2cf', hairStyle: 'buns', brows: 'soft', female: true },
  woman2:   { robe: '#cfe0e8', trim: '#3a6a8a', sash: '#3a6a8a', hair: '#2c2230', ribbon: '#e0b040', skin: '#f6dcc8', hairStyle: 'long', brows: 'soft', female: true },
  child:    { robe: '#f0d070', trim: '#b04a30', sash: '#b04a30', hair: '#1e1e28', ribbon: '#c0392b', skin: '#f8e0cc', hairStyle: 'buns', brows: 'soft', small: true },
  bandit:   { robe: '#5a6a7a', inner: '#3a3a3a', trim: '#2a2420', sash: '#8a2a22', hair: '#1a1a1a', ribbon: '#b02a22', skin: '#d9b896', hairStyle: 'headband', brows: 'angry', scar: true, vest: '#5a3a28', short: true },
  bandit2:  { robe: '#4a5460', inner: '#2a2a2a', trim: '#20242a', sash: '#6a2a22', hair: '#2a2420', ribbon: '#8a2a22', skin: '#cfae8e', hairStyle: 'topknot', brows: 'angry', vest: '#4a3020', short: true },
};

function lighten(hex) { const c = new T.Color(hex); c.offsetHSL(0, -0.05, 0.22); return '#' + c.getHexString(); }
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
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, 138, 15, 20, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = look.brows === 'angry' ? '#4a2a1a' : '#2c3e6a'; ctx.beginPath(); ctx.ellipse(cx, 142, 10, 15, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#10121c'; ctx.beginPath(); ctx.ellipse(cx, 145, 6, 10, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - 4, 132, 4, 5, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 17, 126); ctx.quadraticCurveTo(cx, 112, cx + 17, 124); ctx.stroke();
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
  // 内衬露出的下摆：袍子下摆比内衬短一截，内衬的颜色在最下面露一条
  if (look.inner) { ctx.fillStyle = look.inner; ctx.fillRect(0, h * 0.86, w, h * 0.09); }
  // 下摆缘边 + 正面开衩线
  ctx.fillStyle = look.trim; ctx.fillRect(0, h * 0.95, w, h * 0.05);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(w * 0.49, h * 0.39, 6, h * 0.56);
  // 袖口在另一张图里；这里右侧留一条备用
  return tex(c);
}
function vestTexture(look) {
  const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = look.vest; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3; for (let y = 16; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = '#c9a24c'; for (let x = 10; x < w; x += 32) for (let y = 8; y < h; y += 22) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(w * 0.49, 0, 5, h);   // 前襟中缝
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
    if (y >= 1.54) { const t = Math.min(1, (y - 1.54) / 0.08); w = [[id('spine_03'), 1 - t * 0.6], [id('neck_01'), t * 0.6]]; }
    else if (y >= 1.42) w = [[id('spine_03'), 1]];
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

/* ---------- 头：瓜子脸，不是球 ---------- */
function headGeometry(scaleX = 1) {
  const R = 0.122;
  const g = new T.SphereGeometry(R, 32, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) {
      // 下半：往下巴收成尖，脸颊在 -0.02 处最宽，下巴略前伸
      const t = -y / R;
      x *= 1 - 0.62 * Math.pow(t, 1.6); z *= 1 - 0.28 * t; z += 0.015 * t; y *= 1.08;
    } else { x *= 1.02; z *= 0.98; }
    z *= 0.96; x *= scaleX;
    p.setXYZ(i, x, y, z);
    if (z > 0.005) uv.setXY(i, 0.5 + x / 0.3, 0.47 + y / 0.3); else uv.setXY(i, 0.02, 0.98);
  }
  g.computeVertexNormals();
  return g;
}

/* ---------- 发型：有发量、有刘海、有鬓发 ---------- */
function strand(mat, len, w, thick) {
  // 一绺头发：上粗下尖的扁楔
  // ConeGeometry 尖朝上：先翻成尖朝下，再把宽的根端挪到原点
  const g = new T.ConeGeometry(w, len, 5, 1); g.rotateX(Math.PI); g.translate(0, -len / 2, 0); g.scale(1, 1, thick / w);
  const m = new T.Mesh(g, mat); addOutline(m, 0.004); return m;
}
function hair(look, mat, head) {
  const g = new T.Group();
  const cap = new T.SphereGeometry(0.15, 28, 20);
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let ny = y;
    const fringe = 0.055 + 0.02 * Math.abs(Math.sin(x * 40));
    if (z > 0.03 && y < fringe) ny = fringe;            // 前额：刘海另做
    else if (z <= 0.03 && y < -0.04) ny = -0.04;        // 后脑勺到颈
    p.setXYZ(i, x * 1.08, ny * 1.02 + 0.015, z * 1.1 - 0.02);
  }
  cap.computeVertexNormals();
  const capMesh = new T.Mesh(cap, mat); g.add(capMesh); addOutline(capMesh, 0.005);
  // 高光条：一圈略亮的发带状薄壳，只在头顶前方一段
  const hl = new T.Mesh(new T.TorusGeometry(0.152, 0.012, 6, 24, Math.PI * 0.9), toon({ color: look.hairLight || lighten(look.hair) })); hl.position.set(0, 0.085, -0.02); hl.rotation.set(Math.PI / 2 - 0.35, 0, Math.PI * 0.55); hl.scale.set(1, 1, 0.5); g.add(hl);
  // 刘海：一排楔形绺，中间短两边长，微微外撇
  const bangs = look.brows === 'angry' ? [[-0.9, 0.085], [-0.55, 0.07], [-0.2, 0.055], [0.15, 0.06], [0.5, 0.075], [0.85, 0.09]] : [[-0.85, 0.08], [-0.5, 0.065], [-0.15, 0.055], [0.2, 0.06], [0.55, 0.07], [0.85, 0.085]];
  for (const [a, len] of bangs) {
    const sx = Math.sin(a) * 0.135, sz = Math.cos(a) * 0.135;
    const st = strand(mat, len, 0.028, 0.02); st.position.set(sx, 0.085, sz + 0.005); st.rotation.set(0.32, a, -a * 0.25); g.add(st);
  }
  // 鬓发：耳前两绺长的
  for (const sx of [-1, 1]) { const st = strand(mat, look.female ? 0.26 : 0.17, 0.03, 0.024); st.position.set(sx * 0.145, 0.03, 0.03); st.rotation.set(0.05, 0, -sx * 0.12); g.add(st); }
  const ribbon = toon({ color: look.ribbon });
  if (look.hairStyle === 'topknot' || look.hairStyle === 'bun') {
    const bun = new T.Mesh(new T.SphereGeometry(0.055, 14, 12), mat); bun.position.set(0, 0.165, -0.04); bun.scale.set(1.1, 0.8, 1); g.add(bun); addOutline(bun, 0.005);
    const band = new T.Mesh(new T.TorusGeometry(0.05, 0.013, 8, 20), ribbon); band.position.set(0, 0.135, -0.04); band.rotation.x = Math.PI / 2; g.add(band);
    if (look.hairStyle === 'topknot') { const stick = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.15, 6), toon({ color: '#c9a24c' })); stick.position.set(0.02, 0.165, -0.04); stick.rotation.z = Math.PI / 2; g.add(stick); }
  }
  if (look.hairStyle === 'headband') {
    const band = new T.Mesh(new T.TorusGeometry(0.158, 0.016, 8, 28), ribbon); band.position.set(0, 0.05, -0.02); band.rotation.x = Math.PI / 2; band.scale.z = 1.02; g.add(band);
    for (const k of [-1, 1]) { const tail = new T.Mesh(new T.PlaneGeometry(0.04, 0.32), toon({ color: look.ribbon, side: T.DoubleSide })); tail.position.set(k * 0.03, -0.1, -0.17); tail.rotation.set(0.1, k * 0.3, k * 0.15); g.add(tail); }
    const knot = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), mat); knot.position.set(0, 0.11, -0.06); knot.scale.set(1, 0.7, 1); g.add(knot); addOutline(knot, 0.005);
  }
  if (look.hairStyle === 'buns') {
    for (const sx of [-1, 1]) { const bun = new T.Mesh(new T.SphereGeometry(0.055, 14, 12), mat); bun.position.set(sx * 0.13, 0.11, -0.02); g.add(bun); addOutline(bun, 0.005);
      const band = new T.Mesh(new T.TorusGeometry(0.045, 0.01, 8, 18), ribbon); band.position.set(sx * 0.13, 0.1, -0.02); band.rotation.z = Math.PI / 2; g.add(band); }
  }
  if (look.hairStyle === 'long' || look.female) {
    const rings = []; for (let k = 0; k <= 6; k++) { const t = k / 6; rings.push({ c: new T.Vector3(0, 0.03 - t * 0.64, -0.1 - t * 0.04), rx: 0.12 - t * 0.035, rz: 0.05 - t * 0.02 }); }
    const back = new T.Mesh(loft(rings, 12, 'y'), mat); g.add(back); addOutline(back, 0.005);
    const tie = new T.Mesh(new T.TorusGeometry(0.055, 0.012, 8, 16), ribbon); tie.position.set(0, -0.2, -0.12); tie.rotation.x = Math.PI / 2; g.add(tie);
  }
  head.add(g);
}

/* ---------- 整个人 ---------- */
/**
 * fig: makeFigure() 的结果（骨架 + 动画），原来的 Quaternius 网格会被藏掉。
 * lookId: LOOKS 的键；opts.weapon = 'spear' 给右手一杆枪。
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
  const small = look.small ? 0.78 : 1, female = look.female ? 0.88 : 1;

  const skinMat = toon({ color: look.skin });
  const robeMat = toon({ map: robeTexture(look) });
  const sleeveMat = toon({ map: sleeveTexture(look), side: T.DoubleSide });
  const trimMat = toon({ color: look.trim, side: T.DoubleSide });
  const sashMat = toon({ color: look.sash, side: T.DoubleSide });
  const hairMat = toon({ color: look.hair });
  const faceMat = toon({ map: faceTexture(look) });
  const bootMat = toon({ color: '#2a2622' });

  const parts = [];
  const rigid = (boneName) => { const g = new T.Group(); g.matrix.copy(inverse(boneName)); g.matrix.decompose(g.position, g.quaternion, g.scale); bone(boneName).add(g); return g; };
  const skinned = (geo, mat) => { const m = new T.SkinnedMesh(geo, mat); armature.add(m); m.bind(skeleton, ref.bindMatrix); m.castShadow = true; m.frustumCulled = false; parts.push(m); addOutline(m, 0.006); return m; };

  // 长袍：肩宽约是头宽的 1.6 倍，腰收，下摆直落
  const flare = look.female ? 1 : 0.8;
  const prof = [[1.615, 0.066, 0.06], [1.585, 0.085, 0.075], [1.55, 0.14, 0.095], [1.515, 0.2, 0.11], [1.46, 0.215, 0.125], [1.36, 0.205, 0.125], [1.24, 0.18, 0.115], [1.12, 0.155, 0.105], [1.03, 0.16, 0.11], [0.95, 0.18, 0.125], [0.8, 0.2 * flare, 0.145], [0.62, 0.22 * flare, 0.16], [0.45, 0.245 * flare, 0.18], [0.28, 0.27 * flare, 0.2], [0.1, 0.3 * flare, 0.22]];
  const robeRings = prof.map(([y, rx, rz]) => ({ c: new T.Vector3(0, y, y > 1.0 ? 0.0 : -0.01), rx: rx * female * small, rz: rz * small }));
  const robeGeo = loft(robeRings, 28, 'y', 0.5); weightRobe(robeGeo, boneIndex);
  skinned(robeGeo, robeMat).name = 'robe';
  // 交领：两片真正的叠片，从肩头斜到胸口交叉，右衽压左
  const chest = rigid('spine_03');
  for (const [sx, order] of [[1, 0], [-1, 1]]) {
    if (look.inner) { const under = new T.Mesh(new T.PlaneGeometry(0.075, 0.44), toon({ color: look.inner, side: T.DoubleSide })); under.position.set(sx * 0.07, 1.42, 0.108); under.rotation.set(-0.1, 0, sx * 0.42); chest.add(under); }
    const lap = new T.Mesh(new T.PlaneGeometry(0.07, 0.42), trimMat);
    lap.position.set(sx * 0.05, 1.43, 0.118 + order * 0.006); lap.rotation.set(-0.1, 0, sx * 0.38); chest.add(lap);
    const inner = new T.Mesh(new T.PlaneGeometry(0.05, 0.38), toon({ color: '#fff8ea', side: T.DoubleSide }));
    inner.position.set(sx * 0.082, 1.45, 0.112); inner.rotation.set(-0.1, 0, sx * 0.38); chest.add(inner);
  }
  if (look.vest) {
    const vr = [[1.5, 0.215, 0.13], [1.42, 0.23, 0.14], [1.3, 0.22, 0.14], [1.17, 0.2, 0.13], [1.06, 0.19, 0.125]].map(([y, rx, rz]) => ({ c: new T.Vector3(0, y, 0), rx, rz }));
    const vg = loft(vr, 20, 'y', 0.5); weightRobe(vg, boneIndex);
    const vest = skinned(vg, toon({ map: vestTexture(look), side: T.DoubleSide })); vest.name = 'vest';
    for (const sx of [-1, 1]) { const pad = new T.Mesh(new T.SphereGeometry(0.11, 12, 10), toon({ color: look.vest })); pad.position.set(sx * 0.2, 1.49, -0.03); pad.scale.set(1, 0.6, 0.9); chest.add(pad); addOutline(pad, 0.005); }
  }
  // 脖子
  const neck = rigid('neck_01'); const nk = new T.Mesh(new T.CylinderGeometry(0.05, 0.055, 0.12, 12), skinMat); nk.position.set(0, 1.6, -0.01); neck.add(nk);
  // 腰带：一圈宽带 + 结 + 两条飘带
  const waist = rigid('spine_01');
  const belt = new T.Mesh(new T.TorusGeometry(0.15, 0.028, 6, 26), sashMat); belt.position.set(0, 1.09, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1.08 * female, 0.78, 1); waist.add(belt); addOutline(belt, 0.004);
  const knot = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), sashMat); knot.position.set(0.03, 1.08, 0.125); knot.scale.set(1.3, 0.8, 0.7); waist.add(knot);
  for (const k of [-1, 1]) { const rb = new T.Mesh(new T.PlaneGeometry(0.04, 0.42), sashMat); rb.position.set(0.03 + k * 0.025, 0.86, 0.13); rb.rotation.set(0.08, 0, k * 0.06); waist.add(rb); }
  const jade = new T.Mesh(new T.SphereGeometry(0.018, 10, 8), toon({ color: '#5fae8a' })); jade.position.set(-0.09, 0.98, 0.12); waist.add(jade);

  // 广袖：肩头饱满，到腕口张开下垂
  for (const side of ['l', 'r']) {
    const s = side === 'l' ? 1 : -1, rings = [];
    const wide = look.short ? 0.6 : 0.8;
    const sp = [[0.17, 0.1, 0.09, 0.01], [0.27, 0.088, 0.08, 0], [0.4, 0.09, 0.082, -0.01], [0.52, 0.1 * wide + 0.02, 0.088, -0.02], [0.62, 0.13 * wide, 0.09, -0.035], [0.7, 0.14 * wide, 0.09, -0.05]];
    for (const [x, ry, rz, dy] of sp) rings.push({ c: new T.Vector3(s * x, 1.455 + dy, -0.065), ry: ry * small, rz: rz * small });
    const g = loft(rings, 16, 'x', 0); weightSleeve(g, boneIndex, side);
    skinned(g, sleeveMat).name = 'sleeve_' + side;
    // 手：扁的手掌加拇指
    const h = rigid('hand_' + side);
    const palm = new T.Mesh(new T.SphereGeometry(0.036 * small, 12, 10), skinMat); palm.position.set(s * 0.775, 1.45, -0.058); palm.scale.set(1.6, 0.5, 0.95); h.add(palm); addOutline(palm, 0.004);
    const thumb = new T.Mesh(new T.SphereGeometry(0.013 * small, 8, 6), skinMat); thumb.position.set(s * 0.745, 1.447, -0.02); thumb.scale.set(1.5, 1, 1); h.add(thumb);
    // 靴
    const f = rigid('foot_' + side); const boot = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), bootMat); boot.position.set(s * 0.114, 0.05, 0.02); boot.scale.set(0.85, 0.7, 1.6); f.add(boot); addOutline(boot, 0.005);
    if (opts.weapon === 'spear' && side === 'r') {
      const shaft = new T.Mesh(new T.CylinderGeometry(0.012, 0.014, 2.1, 8), toon({ color: '#6b4a2e' })); shaft.position.set(-0.78, 1.45, -0.05); h.add(shaft); addOutline(shaft, 0.003);
      const blade = new T.Mesh(new T.ConeGeometry(0.03, 0.26, 6), toon({ color: '#cfd6dc' })); blade.position.set(-0.78, 2.62, -0.05); blade.scale.set(1, 1, 0.4); h.add(blade); addOutline(blade, 0.003);
      const tassel = new T.Mesh(new T.ConeGeometry(0.035, 0.14, 8), toon({ color: '#c0392b' })); tassel.position.set(-0.78, 2.42, -0.05); tassel.rotation.x = Math.PI; h.add(tassel);
    }
  }

  // 头：和真人比例接近，靠头发撑出轮廓
  const hd = rigid('Head');
  const head = new T.Mesh(headGeometry(female === 1 ? 1 : 0.96), faceMat); head.position.set(0, 1.715, 0.005); head.scale.setScalar(small === 1 ? 1.0 : 1.08); hd.add(head); addOutline(head, 0.005);
  head.traverse(o => { o.castShadow = true; });
  hair(look, hairMat, head);

  parts.forEach(m => { m.receiveShadow = false; });
  fig.hand = bone('hand_r');
  return { parts, look };
}

export { LOOKS };
