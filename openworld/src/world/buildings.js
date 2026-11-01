/* 建筑与道具：房子、茶舍、山神祠、石桥、埠头、井、烽台、牌坊、寨子、篱笆、路牌、灯笼。
   方盒子本来就合理的东西（房、桥、船坞）可以用几何体拼；人、树绝不在这里拼。 */
import * as T from 'three';
import { WORLD, RIVER, PLACES, roadDist } from './layout.js';
import { heightAt } from './terrain.js';
import { mulberry32 } from '../util/rng.js';
import * as TX from './textures.js';
import { mergeGeometries } from '../../vendor/addons/BufferGeometryUtils.js';
import { toon } from '../toon.js';

const S = {};   // 共享材质
function mats() {
  if (S.ready) return S;
  S.tile = toon({ map: TX.roofTiles() });
  S.wall = toon({ map: TX.plasterWall() });
  S.wallDark = toon({ map: TX.plasterWall('#cdbfa4') });
  S.wood = toon({ map: TX.wood(24, 30) });
  S.woodRed = toon({ map: TX.wood(8, 28), color: 0xc0523a });
  S.woodLight = toon({ map: TX.wood(30, 48) });
  S.stone = toon({ map: TX.stone() });
  S.lattice = toon({ map: TX.lattice(), emissive: 0xffd58a, emissiveMap: TX.lattice(), emissiveIntensity: 0 });
  S.door = toon({ map: TX.wood(20, 22) });
  S.lantern = toon({ map: TX.lanternPaper(), emissive: 0xff5a2a, emissiveIntensity: 0.25 });
  S.canvas = toon({ color: 0xb8a888, side: T.DoubleSide });
  S.iron = toon({ color: 0x3a3a3c });
  S.ready = true;
  return S;
}

function box(w, h, d, m, x = 0, y = 0, z = 0, shadow = true) {
  const g = new T.BoxGeometry(w, h, d), mesh = new T.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; return mesh;
}
function uvScale(geo, sx, sy) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return geo; }

/* 歇山式太麻烦，这里是带举折和翘角的硬山顶：两片曲面，端部抬起。 */
function roof(len, span, rise, m, { overhang = 0.9, sag = 0.18, curl = 0.35 } = {}) {
  const g = new T.Group();
  for (const side of [-1, 1]) {
    const geo = new T.PlaneGeometry(len + overhang * 2, span / 2 + overhang, 12, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / (len / 2 + overhang), v = (pos.getY(i) + (span / 2 + overhang) / 2) / (span / 2 + overhang);   // v: 0 檐 → 1 脊
      const t = 1 - v;
      let y = rise * v + sag * rise * Math.sin(Math.PI * v) * -1 + 0.0;                 // 举折：中段凹
      const ends = Math.max(0, Math.abs(u) - 0.72) / 0.28; y += curl * ends * ends * t;  // 翘角
      pos.setXYZ(i, pos.getX(i), y, side * t * (span / 2 + overhang));
    }
    geo.computeVertexNormals();
    uvScale(geo, (len + overhang * 2) / 1.6, (span / 2 + overhang) / 1.6);
    const mesh = new T.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true;
    if (side > 0) { const n = geo.attributes.normal; /* 正面朝上即可 */ }
    g.add(mesh);
  }
  // 正脊：一根深色脊条 + 两端鸱吻
  const ridge = box(len + overhang * 2 + 0.2, 0.22, 0.32, mats().iron, 0, rise + 0.08, 0); g.add(ridge);
  for (const e of [-1, 1]) g.add(box(0.3, 0.5, 0.3, mats().iron, e * (len / 2 + overhang), rise + 0.3, 0));
  // 檐口下的瓦当线
  for (const side of [-1, 1]) g.add(box(len + overhang * 2, 0.14, 0.14, mats().iron, 0, 0.02, side * (span / 2 + overhang)));
  return g;
}

export function house(w, d, h, opts = {}) {
  const m = mats(), g = new T.Group();
  const stone = 0.35;
  g.add(box(w + 0.6, stone, d + 0.6, m.stone, 0, stone / 2, 0));
  const body = box(w, h, d, opts.dark ? m.wallDark : m.wall, 0, stone + h / 2, 0); uvScale(body.geometry, 1.5, 1); g.add(body);
  // 柱子：四角 + 每 3 米一根；檐下横枋
  const cols = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= cols; i++) for (const side of [-1, 1]) g.add(box(0.26, h + 0.1, 0.26, m.wood, -w / 2 + (w / cols) * i, stone + h / 2, side * (d / 2 + 0.05)));
  for (const side of [-1, 1]) g.add(box(w + 0.4, 0.28, 0.3, m.wood, 0, stone + h - 0.1, side * (d / 2 + 0.1)));
  for (const side of [-1, 1]) g.add(box(0.3, 0.28, d + 0.4, m.wood, side * (w / 2 + 0.1), stone + h - 0.1, 0));
  // 门：正面居中；窗：门两侧
  const front = d / 2 + 0.02;
  g.add(box(1.3, 2.2, 0.08, m.door, opts.doorX || 0, stone + 1.1, front));
  g.add(box(1.5, 0.12, 0.12, m.wood, opts.doorX || 0, stone + 2.26, front + 0.04));
  const win = (x, z, ry) => { const wm = new T.Mesh(new T.PlaneGeometry(1.1, 1.0), m.lattice); wm.position.set(x, stone + 1.55, z); wm.rotation.y = ry; g.add(wm); const fr = box(1.3, 1.2, 0.1, m.wood, x, stone + 1.55, z - 0.06 * Math.cos(ry)); fr.rotation.y = ry; g.add(fr); return wm; };
  if (w > 4.5) { win(-w / 4 - 0.3, front + 0.06, 0); win(w / 4 + 0.3, front + 0.06, 0); }
  if (opts.sideWindows) { win(-w / 2 - 0.06, 0, -Math.PI / 2); }
  // 屋顶
  const r = roof(w, d, opts.rise || Math.max(1.6, d * 0.42), m.tile, { overhang: 0.9 });
  r.position.y = stone + h; g.add(r);
  // 灯笼：门两边
  const lan = [];
  for (const sx of [-1, 1]) { const l = lantern(); l.position.set((opts.doorX || 0) + sx * Math.max(1.2, w * 0.2), stone + h - 0.55, front + 0.55); g.add(l); lan.push(l); }
  g.userData.lanterns = lan;
  g.userData.collider = { hw: w / 2 + 0.3, hd: d / 2 + 0.3 };
  return g;
}

export function lantern() {
  const m = mats(), g = new T.Group();
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2(0.06 + Math.sin(t * Math.PI) * 0.22, t * 0.5)); }
  const paper = new T.Mesh(new T.LatheGeometry(pts, 10), m.lantern); paper.position.y = -0.25; g.add(paper);
  g.add(box(0.1, 0.06, 0.1, m.iron, 0, 0.27, 0)); g.add(box(0.1, 0.06, 0.1, m.iron, 0, -0.27, 0));
  const tassel = box(0.03, 0.22, 0.03, new T.MeshStandardMaterial({ color: 0xc0392b }), 0, -0.42, 0); g.add(tassel);
  const string = box(0.015, 0.4, 0.015, m.iron, 0, 0.5, 0); g.add(string);
  g.userData.isLantern = true;
  return g;
}

export function teahouse() {
  const m = mats(), g = new T.Group();
  const h = house(11, 7, 3.4, { rise: 3.0, doorX: 0 });
  g.add(h);
  // 前廊：抬出一片台 + 四根红柱 + 廊檐
  const porch = box(11.6, 0.3, 3.2, m.woodLight, 0, 0.5, 5.1); g.add(porch);
  for (let i = 0; i < 4; i++) g.add(box(0.3, 3.2, 0.3, m.woodRed, -4.8 + i * 3.2, 2.1, 6.4));
  const pr = roof(11.6, 3.4, 1.2, m.tile, { overhang: 0.5, curl: 0.2 }); pr.position.set(0, 3.6, 5.2); g.add(pr);
  // 两张桌、长凳
  for (const x of [-3.2, 3.2]) { g.add(box(1.4, 0.08, 0.9, m.woodLight, x, 1.35, 5.1)); g.add(box(0.15, 0.7, 0.15, m.wood, x, 1.0, 5.1)); for (const dz of [-0.7, 0.7]) g.add(box(1.4, 0.06, 0.3, m.woodLight, x, 1.05, 5.1 + dz)); }
  // 匾额与幌子
  g.add(sign('听松茶舍', 2.8, 0.7).translateY(3.25).translateZ(3.62));
  const flag = new T.Mesh(new T.PlaneGeometry(0.6, 1.6), new T.MeshStandardMaterial({ color: 0x2f5f8c, side: T.DoubleSide })); flag.position.set(6.4, 3.0, 6.4); g.add(flag);
  g.add(box(0.08, 4.6, 0.08, m.wood, 6.75, 2.3, 6.4));
  g.userData.lanterns = h.userData.lanterns;
  g.userData.collider = { hw: 6.2, hd: 3.8, zOff: 0 };
  return g;
}

/** 刻字牌匾：画布文字贴在木板上。 */
export function sign(text, w = 2, h = 0.6, { color = '#f1e4c6', bg = '#3a2415', vertical = false } = {}) {
  const c = document.createElement('canvas'); c.width = vertical ? 128 : 512; c.height = vertical ? 512 : 128; const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = color; ctx.font = `bold ${vertical ? 88 : 84}px "Ma Shan Zheng","STKaiti","KaiTi",serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (vertical) [...text].forEach((ch, i) => ctx.fillText(ch, 64, 64 + i * (384 / Math.max(1, text.length - 1) || 0)));
  else ctx.fillText(text, 256, 68);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, 0.08), [mats().wood, mats().wood, mats().wood, mats().wood, toon({ map: t }), mats().wood]);
  mesh.castShadow = true; return mesh;
}

export function signpost(labels) {
  const m = mats(), g = new T.Group();
  g.add(box(0.18, 2.6, 0.18, m.wood, 0, 1.3, 0));
  labels.forEach((lab, i) => { const s = sign(lab.text, 1.3, 0.3, { bg: '#5a3b22' }); s.position.set(0.5, 2.3 - i * 0.4, 0); s.rotation.y = lab.angle; g.add(s); });
  g.userData.collider = { r: 0.25 }; return g;
}

export function well() {
  const m = mats(), g = new T.Group();
  const ring = new T.Mesh(new T.CylinderGeometry(0.9, 1.0, 0.9, 12, 1, true), m.stone); ring.position.y = 0.45; ring.castShadow = true; g.add(ring);
  g.add(new T.Mesh(new T.CircleGeometry(0.85, 12).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x1d2b30 })).translateY(0.3));
  for (const x of [-1, 1]) g.add(box(0.14, 2.3, 0.14, m.wood, x * 0.9, 1.15, 0));
  g.add(box(2.2, 0.12, 0.12, m.wood, 0, 2.25, 0)); const r = roof(1.6, 1.4, 0.5, m.tile, { overhang: 0.4, curl: 0.1 }); r.position.y = 2.3; g.add(r);
  g.add(new T.Mesh(new T.CylinderGeometry(0.25, 0.3, 0.35, 10), m.wood).translateY(1.0).translateX(0.5));
  g.userData.collider = { r: 1.15 }; return g;
}

export function shrine() {
  const m = mats(), g = new T.Group();
  g.add(box(7, 0.6, 6, m.stone, 0, 0.3, 0));
  const back = box(5.4, 3, 0.3, m.wallDark, 0, 2.1, -2.2); g.add(back);
  for (const sx of [-1, 1]) g.add(box(0.3, 3, 4.2, m.wallDark, sx * 2.7, 2.1, -0.2));
  for (const sx of [-1, 1]) g.add(box(0.32, 3.2, 0.32, m.woodRed, sx * 2.55, 2.2, 2.0));
  const r = roof(6.4, 5.6, 2.4, m.tile, { overhang: 0.9, curl: 0.5 }); r.position.y = 3.6; g.add(r);
  // 神龛、香炉
  g.add(box(1.6, 1.2, 0.8, m.woodRed, 0, 1.2, -1.6)); g.add(box(0.9, 1.4, 0.5, new T.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.6, roughness: 0.4 }), 0, 2.4, -1.7));
  const burner = new T.Mesh(new T.CylinderGeometry(0.5, 0.35, 0.6, 12), m.iron); burner.position.set(0, 0.9, 1.0); g.add(burner);
  g.add(sign('山神祠', 1.8, 0.5).translateY(3.3).translateZ(2.4));
  const lan = []; for (const sx of [-1, 1]) { const l = lantern(); l.position.set(sx * 2.0, 3.0, 2.6); g.add(l); lan.push(l); }
  g.userData.lanterns = lan; g.userData.collider = { hw: 3.6, hd: 3.2 }; return g;
}

/** 石拱桥：桥面是一段弧，两侧栏板望柱。跨度按河宽算。 */
export function bridge(span) {
  const m = mats(), g = new T.Group(), len = span + 10, segs = 24, width = 4.2;
  const deck = new T.PlaneGeometry(len, width, segs, 1).rotateX(-Math.PI / 2);
  const pos = deck.attributes.position;
  const arc = u => Math.sin(Math.PI * (u + 0.5)) * 2.6;    // u: -0.5..0.5
  for (let i = 0; i < pos.count; i++) pos.setY(i, arc(pos.getX(i) / len));
  deck.computeVertexNormals(); uvScale(deck, len / 2, 2);
  const d = new T.Mesh(deck, m.stone); d.castShadow = true; d.receiveShadow = true; g.add(d);
  // 桥身：弧下面的拱和桥墩
  const body = new T.PlaneGeometry(len, width, segs, 1).rotateX(Math.PI / 2); const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setY(i, arc(bp.getX(i) / len) - 0.5); body.computeVertexNormals(); uvScale(body, len / 2, 2);
  g.add(new T.Mesh(body, m.stone));
  for (const side of [-1, 1]) {
    const wall = new T.PlaneGeometry(len, 3.4, segs, 1); const wp = wall.attributes.position;
    for (let i = 0; i < wp.count; i++) { const u = wp.getX(i) / len; wp.setY(i, arc(u) - 0.5 + (wp.getY(i) > 0 ? 0 : -3.0)); }
    const arch = 1 - Math.pow(1, 1); wall.computeVertexNormals(); uvScale(wall, len / 2, 2);
    const wm = new T.Mesh(wall, m.stone); wm.position.z = side * width / 2; if (side < 0) wm.rotation.y = Math.PI; wm.material = m.stone; g.add(wm);
    // 栏板 + 望柱
    for (let i = 0; i <= 12; i++) { const u = -0.5 + i / 12, x = u * len; const post = box(0.22, 1.0, 0.22, m.stone, x, arc(u) + 0.5, side * (width / 2 - 0.1)); g.add(post); if (i < 12) { const nu = -0.5 + (i + 0.5) / 12; const rail = box(len / 12, 0.55, 0.1, m.stone, nu * len, arc(nu) + 0.35, side * (width / 2 - 0.1)); rail.rotation.z = Math.atan2(arc(nu + 0.02) - arc(nu - 0.02), 0.04 * len); g.add(rail); } }
  }
  g.userData.deck = { len, width, arc };
  return g;
}

export function dock() {
  const m = mats(), g = new T.Group();
  for (let i = 0; i < 8; i++) g.add(box(2.2, 0.12, 0.7, m.woodLight, 0, 0, -i * 0.8));
  for (const sx of [-1, 1]) for (const z of [0, -3, -5.6]) g.add(box(0.2, 2.2, 0.2, m.wood, sx * 1.0, -0.8, z));
  g.add(box(0.25, 1.4, 0.25, m.wood, 1.2, 0.6, -5.4));   // 系船桩
  g.userData.collider = null; return g;
}

export function beaconTower() {
  const m = mats(), g = new T.Group();
  const base = new T.Mesh(uvScale(new T.CylinderGeometry(3.2, 4.2, 9, 12), 6, 4), m.stone); base.position.y = 4.5; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const top = new T.Mesh(uvScale(new T.CylinderGeometry(3.6, 3.2, 1.0, 12), 6, 1), m.stone); top.position.y = 9.5; g.add(top);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(box(0.5, 0.9, 0.5, m.stone, Math.cos(a) * 3.3, 10.4, Math.sin(a) * 3.3)); }
  // 柴堆与火盆
  const bowl = new T.Mesh(new T.CylinderGeometry(1.2, 0.8, 0.8, 10), m.iron); bowl.position.y = 10.4; g.add(bowl);
  const fire = new T.PointLight(0xff7a2a, 0, 70, 1.5); fire.position.y = 11.6; g.add(fire);
  const flame = new T.Mesh(new T.ConeGeometry(0.8, 2.2, 8), new T.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85 })); flame.position.y = 11.8; flame.visible = false; g.add(flame);
  // 台阶（绕一圈的斜坡：用一串小块）
  for (let i = 0; i < 20; i++) { const a = i * 0.32, r = 4.6; const s = box(1.2, 0.3, 1.0, m.stone, Math.cos(a) * r, 0.2 + i * 0.5, Math.sin(a) * r); s.rotation.y = -a; g.add(s); }
  g.userData.fire = { light: fire, flame }; g.userData.collider = { r: 4.0 }; return g;
}

export function gate(text) {
  const m = mats(), g = new T.Group();
  for (const sx of [-1, 1]) { g.add(box(0.5, 5.2, 0.5, m.woodRed, sx * 2.6, 2.6, 0)); g.add(box(1.0, 0.6, 1.0, m.stone, sx * 2.6, 0.3, 0)); }
  g.add(box(6.4, 0.5, 0.5, m.woodRed, 0, 5.0, 0)); g.add(box(6.0, 0.35, 0.4, m.woodRed, 0, 4.1, 0));
  const r = roof(6.0, 1.6, 0.8, m.tile, { overhang: 0.5, curl: 0.4 }); r.position.y = 5.3; g.add(r);
  g.add(sign(text, 2.4, 0.62).translateY(4.55));
  g.userData.collider = null; return g;
}

export function fenceLine(points, every = 2.2) {
  const m = mats(), g = new T.Group();
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / every)), ang = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = heightAt(x, z);
      const p = box(0.12, 1.1, 0.12, m.wood, x, y + 0.5, z); g.add(p);
      if (k < n) { const t2 = (k + 0.5) / n, mx = ax + (bx - ax) * t2, mz = az + (bz - az) * t2, my = heightAt(mx, mz); for (const h of [0.45, 0.85]) { const r = box(0.08, 0.07, len / n, m.woodLight, mx, my + h, mz); r.rotation.y = ang; g.add(r); } }
    }
  }
  return g;
}

export function tent(rot = 0) {
  const m = mats(), g = new T.Group();
  const cone = new T.Mesh(new T.ConeGeometry(2.4, 2.6, 8, 1, true), m.canvas); cone.position.y = 1.3; cone.castShadow = true; g.add(cone);
  g.add(box(0.1, 2.9, 0.1, m.wood, 0, 1.45, 0));
  g.rotation.y = rot; g.userData.collider = { r: 2.2 }; return g;
}
export function campfire() {
  const m = mats(), g = new T.Group();
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const s = new T.Mesh(new T.DodecahedronGeometry(0.28, 0), m.stone); s.position.set(Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8); g.add(s); }
  for (let i = 0; i < 3; i++) { const l = box(1.2, 0.14, 0.14, m.wood, 0, 0.2, 0); l.rotation.y = i * 1.05; g.add(l); }
  const flame = new T.Mesh(new T.ConeGeometry(0.35, 1.0, 7), new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 })); flame.position.y = 0.7; g.add(flame);
  const light = new T.PointLight(0xff8a3a, 40, 18, 1.6); light.position.y = 1.0; g.add(light);
  g.userData.fire = { light, flame }; g.userData.collider = { r: 0.9 }; return g;
}
/** 陶罐：放样的瓮，口小肚大，青灰釉。 */
export function jar(h = 0.7) {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new T.Vector2((0.12 + Math.sin(t * Math.PI) * 0.22 - t * t * 0.06) * h / 0.7, t * h)); }
  const m = new T.Mesh(new T.LatheGeometry(pts, 14), toon({ color: 0x5a6a62 })); m.castShadow = true; m.userData.collider = { r: 0.3 * h / 0.7 }; return m;
}
/** 柴堆：一排横放的圆木。 */
export function woodpile() {
  const g = new T.Group(), m = mats();
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5 - r; i++) { const l = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 1.0, 7), m.wood); l.rotation.z = Math.PI / 2; l.position.set(0, 0.09 + r * 0.16, -0.36 + i * 0.18 + r * 0.09); l.castShadow = true; g.add(l); }
  g.userData.collider = { hw: 0.55, hd: 0.5 }; return g;
}
/** 圆灌木：两三个压扁的球叠在一起，纯色。 */
export function shrub(s = 1) {
  const g = new T.Group(), m = toon({ color: 0x4f9a3c });
  for (const [x, y, z, r] of [[0, 0.35, 0, 0.5], [0.3, 0.28, 0.15, 0.36], [-0.28, 0.3, -0.1, 0.38]]) { const b = new T.Mesh(new T.SphereGeometry(r * s, 10, 8), m); b.position.set(x * s, y * s, z * s); b.scale.y = 0.8; b.castShadow = true; g.add(b); }
  g.userData.collider = { r: 0.5 * s }; return g;
}
export function crate(size = 0.9) { const c = box(size, size, size, mats().woodLight, 0, size / 2, 0); c.userData.collider = { r: size * 0.7 }; return c; }
export function palisade(points) {
  const m = mats(), g = new T.Group();
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.5);
    for (let k = 0; k <= n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = heightAt(x, z); const p = new T.Mesh(new T.CylinderGeometry(0.18, 0.22, 2.8 + (k % 3) * 0.2, 6), m.wood); p.position.set(x, y + 1.2, z); p.castShadow = true; g.add(p); }
  }
  return g;
}

/* 摆进世界：返回碰撞体、灯笼、可互动点、发光窗材质。 */
export function buildWorld(scene) {
  const rnd = mulberry32(WORLD.seed * 77 + 5);
  const roots = []; const addRoot = o => { scene.add(o); roots.push(o); return o; };
  const m = mats();
  const colliders = [], lanterns = [], fires = [], interact = [];
  const placeAt = (obj, x, z, ry = 0, yOff = 0) => {
    obj.position.set(x, heightAt(x, z) + yOff, z); obj.rotation.y = ry; addRoot(obj);
    const c = obj.userData.collider;
    if (c) colliders.push({ x, z, rot: ry, ...c });
    if (obj.userData.lanterns) for (const l of obj.userData.lanterns) lanterns.push(l);
    if (obj.userData.fire) fires.push(obj.userData.fire);
    return obj;
  };

  // ---- 渡头村：茶舍居中，房子按两条街排 ----
  const v = PLACES.village;
  const th = placeAt(teahouse(), PLACES.teahouse.x, PLACES.teahouse.z, Math.PI * 0.08);
  interact.push({ id: 'teahouse', x: PLACES.teahouse.x, z: PLACES.teahouse.z + 7, r: 3.5, label: '进茶舍 · 买卖', kind: 'shop' });
  const houseSpots = [
    [-150, 20, 0.2], [-166, 46, 0.1], [-150, 74, -0.1], [-118, 84, 0.05], [-92, 70, -0.35],
    [-176, 80, 0.5], [-120, -4, 0.9], [-160, -6, 0.5], [-86, -8, -0.6], [-200, 40, 0.3], [-192, 10, 0.6],
  ];
  houseSpots.forEach(([x, z, ry], i) => {
    const w = 6 + rnd() * 3, d = 5 + rnd() * 2, h = 2.8 + rnd() * 0.6;
    const hs = house(w, d, h, { dark: rnd() < 0.3, sideWindows: rnd() < 0.5 });
    // 朝向村中心
    placeAt(hs, x, z, Math.atan2(v.x - x, v.z - z) + (ry - 0.3) * 0.3);
  });
  placeAt(well(), -118, 32, 0.3);
  // 房前屋后的摆设：陶罐、柴堆、灌木
  houseSpots.forEach(([x, z], i) => {
    const a = Math.atan2(v.x - x, v.z - z), fx = x + Math.sin(a) * 4.6, fz = z + Math.cos(a) * 4.6, sx = Math.cos(a), sz = -Math.sin(a);
    if (i % 3 !== 2) { placeAt(jar(0.6 + rnd() * 0.3), fx + sx * 2.6, fz + sz * 2.6); placeAt(jar(0.5 + rnd() * 0.3), fx + sx * 3.2, fz + sz * 3.1); }
    if (i % 2 === 0) placeAt(woodpile(), x - sx * 4.8, z - sz * 4.8, a + Math.PI / 2);
    placeAt(shrub(0.8 + rnd() * 0.6), fx - sx * 3.4, fz - sz * 3.2);
  });
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.28, r = 20 + rnd() * 75, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r; if (roadDist(x, z) > 4) placeAt(shrub(0.7 + rnd() * 0.8), x, z); }
  placeAt(gate('渡头村'), -60, 46, Math.PI / 2 + 0.05);
  placeAt(gate('渡头村'), -205, 128, Math.PI / 2 - 0.6);
  // 篱笆围出几片菜畦
  addRoot(fenceLine([[-150, 100], [-120, 112], [-92, 100]]));
  addRoot(fenceLine([[-212, 60], [-214, 90], [-196, 104]]));

  // ---- 桥、埠头 ----
  const bz = PLACES.bridge.z, bx = RIVER.x(bz);
  const br = bridge(RIVER.halfWidth * 2 + 6); br.position.set(bx, heightAt(bx - 20, bz) + 0.3, bz); br.rotation.y = -Math.atan2(RIVER.x(bz + 5) - RIVER.x(bz - 5), 10); addRoot(br);
  const dk = dock(); const dx = PLACES.dock.x, dz = PLACES.dock.z; dk.position.set(dx, WORLD.water + 0.5, dz); dk.rotation.y = -Math.PI / 2; addRoot(dk);
  interact.push({ id: 'dock', x: dx + 2, z: dz, r: 3, label: '登船 · 划乌篷', kind: 'boat' });

  // ---- 东畈：三户农家 + 田埂篱笆 ----
  const p = PLACES.paddies;
  [[p.x - 60, p.z - 90, 0.3], [p.x - 30, p.z - 108, -0.2], [p.x + 70, p.z - 80, 0.6]].forEach(([x, z, ry]) => placeAt(house(6.5, 5.5, 2.9, { dark: true }), x, z, ry));
  addRoot(fenceLine([[p.x - 110, p.z - 60], [p.x - 110, p.z + 60], [p.x + 110, p.z + 60], [p.x + 110, p.z - 60], [p.x - 110, p.z - 60]], 2.5));

  // ---- 山神祠、烽台 ----
  placeAt(shrine(), PLACES.shrine.x, PLACES.shrine.z, Math.PI * 0.95);
  interact.push({ id: 'shrine', x: PLACES.shrine.x, z: PLACES.shrine.z - 3.5, r: 3, label: '上香 · 祈福', kind: 'pray' });
  const bt = placeAt(beaconTower(), PLACES.beacon.x, PLACES.beacon.z, 0);
  interact.push({ id: 'beacon', x: PLACES.beacon.x + 5.4, z: PLACES.beacon.z, r: 4.5, label: '点燃烽火', kind: 'beacon' });

  // ---- 两个寨子 ----
  for (const id of ['camp1', 'camp2']) {
    const c = PLACES[id];
    placeAt(campfire(), c.x, c.z);
    placeAt(tent(0.4), c.x - 7, c.z + 3, 0.4); placeAt(tent(2.6), c.x + 6, c.z + 5, 2.6); placeAt(tent(-1.5), c.x + 2, c.z - 8, -1.5);
    placeAt(crate(), c.x + 3, c.z + 1); placeAt(crate(0.7), c.x + 3.9, c.z + 1.2); placeAt(crate(0.8), c.x - 4, c.z - 3);
    const pts = []; for (let i = 0; i <= 9; i++) { const a = -0.9 + i * 0.34; pts.push([c.x + Math.cos(a) * 15, c.z + Math.sin(a) * 15]); }
    addRoot(palisade(pts));
  }

  // ---- 路牌 ----
  const sp = (x, z, labels) => placeAt(signpost(labels), x, z, 0);
  sp(-58, 52, [{ text: '← 渡头村', angle: Math.PI / 2 }, { text: '东畈 →', angle: Math.PI / 2 }]);
  sp(PLACES.paddies.x + 2, PLACES.paddies.z + 6, [{ text: '青屏烽台 ↑', angle: 0.9 }, { text: '黑石寨 ↓', angle: 0.9 }]);
  sp(-172, -12, [{ text: '竹坞 · 山神祠', angle: -0.5 }]);
  sp(-204, 134, [{ text: '松坡 · 野狐坡', angle: 2.0 }]);

  // 村里的石灯、路边的灯笼杆
  for (const [x, z] of [[-100, 40], [-136, 60], [-110, 70], [-148, 40], [-80, 20]]) {
    const pole = box(0.12, 3.4, 0.12, m.wood, 0, 1.7, 0); const l = lantern(); l.position.set(0.35, 3.2, 0); const g = new T.Group(); g.add(pole, l); g.userData.lanterns = [l]; g.userData.collider = { r: 0.2 }; placeAt(g, x, z, rnd() * 6.28);
  }

  const merged = mergeStatics(scene, roots);
  return { colliders, lanterns, fires, interact, windowMat: m.lattice, lanternMat: m.lantern, beacon: bt, merged };
}

/* 几百个小方块各画一次太费：按材质把所有静态网格合成一个。火苗（MeshBasic）和牌匾（多材质）留着不合。 */
function mergeStatics(scene, roots) {
  const buckets = new Map();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    const doomed = [];
    r.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.isMeshBasicMaterial || o.isInstancedMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) return;
      (buckets.get(o.material) || buckets.set(o.material, []).get(o.material)).push(g);
      doomed.push(o);
    });
    for (const o of doomed) o.parent.remove(o);
  }
  const out = [];
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const mesh = new T.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'static:' + (mat.name || mat.uuid.slice(0, 4));
    scene.add(mesh); out.push(mesh);
  }
  return out;
}
