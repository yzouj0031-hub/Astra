/* 地形：rawHeight 预采样成格子，运行时双线性查高度；一张大网格 + 顶点色分区
   （草 / 土路 / 岩 / 河滩 / 水田），近处叠一层细节噪点。水面另起一张平面。 */
import * as T from 'three';
import { WORLD, RIVER, PLACES, ROADS, rawHeight, roadDist } from './layout.js';
import { fbm, hash2, smoothstep, lerp, clamp } from '../util/rng.js';
import { groundDetail } from './textures.js';

const STEP = 2;                                   // 高度格子间距（米）
const N = Math.floor(WORLD.size / STEP) + 1;
const grid = new Float32Array(N * N);
let built = false;

function build() {
  if (built) return; built = true;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    grid[j * N + i] = rawHeight(i * STEP - WORLD.half, j * STEP - WORLD.half);
  }
}

/** 地面高度（双线性）。地图外沿用边缘。 */
export function heightAt(x, z) {
  build();
  const fx = clamp((x + WORLD.half) / STEP, 0, N - 1.001), fz = clamp((z + WORLD.half) / STEP, 0, N - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

const _n = new T.Vector3();
export function normalAt(x, z, out = _n) {
  const e = 0.8;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-dx, 2 * e, -dz).normalize();
}
export function slopeAt(x, z) { return 1 - normalAt(x, z).y; }
export function isWater(x, z) { return heightAt(x, z) < WORLD.water - 0.15; }

/** 地面类型：决定草长不长、树种不种。 */
export function groundKind(x, z) {
  const y = heightAt(x, z);
  if (y < WORLD.water + 0.25) return 'water';
  if (roadDist(x, z) < 3.2) return 'road';
  if (slopeAt(x, z) > 0.42) return 'rock';
  const p = PLACES.paddies; if (Math.hypot(x - p.x, z - p.z) < p.r - 10) return 'paddy';
  if (RIVER.dist(x, z) < RIVER.halfWidth + 6) return 'bank';
  return 'grass';
}

const colorGrass = new T.Color(), tmp = new T.Color();
function vertexColor(x, z, y, out) {
  const s = WORLD.seed;
  const slope = slopeAt(x, z);
  const rd = roadDist(x, z), rv = RIVER.dist(x, z) - RIVER.halfWidth;
  const varia = fbm(x / 45, z / 45, 3, s + 3), patch = fbm(x / 9, z / 9, 2, s + 4);
  // 草：带黄绿到青绿的斑块
  out.setHSL(0.25 + varia * 0.035 + patch * 0.015, 0.45 + varia * 0.12, 0.30 + varia * 0.06 + patch * 0.04);
  // 水田：更亮更黄，带一行行的田埂
  const p = PLACES.paddies, dp = Math.hypot(x - p.x, z - p.z);
  if (dp < p.r + 20) {
    const rows = Math.abs(Math.sin(z * 0.9)) < 0.18 || Math.abs(Math.sin(x * 0.11)) < 0.05;
    tmp.setHSL(0.15, 0.35, rows ? 0.26 : 0.3 + patch * 0.03);
    out.lerp(tmp, smoothstep(p.r + 20, p.r - 10, dp));
  }
  // 岩：坡陡和高处发灰
  const rock = smoothstep(0.30, 0.55, slope) + smoothstep(85, 115, y) * 0.7;
  tmp.setHSL(0.09, 0.08, 0.38 + varia * 0.08 + hash2(x * 3, z * 3, 5) * 0.06);
  out.lerp(tmp, clamp(rock, 0, 1));
  // 河滩 / 湖岸：湿沙
  if (rv < 8 || y < WORLD.water + 1.2) {
    tmp.setHSL(0.1, 0.3, 0.48 + patch * 0.03);
    out.lerp(tmp, Math.max(smoothstep(8, 1, rv), smoothstep(WORLD.water + 1.2, WORLD.water - 0.5, y)));
  }
  if (y < WORLD.water - 0.4) { tmp.setHSL(0.1, 0.25, 0.3); out.lerp(tmp, smoothstep(WORLD.water - 0.4, WORLD.water - 2.5, y)); }
  // 土路：中间踩实的土，边上渐变
  if (rd < 5.5) {
    tmp.setHSL(0.08, 0.32, 0.44 + patch * 0.04);
    out.lerp(tmp, smoothstep(5.5, 2.4, rd) * 0.92);
  }
  // 村里台地：踩得秃一些
  const v = PLACES.village, dv = Math.hypot(x - v.x, z - v.z);
  if (dv < v.r * 0.6) { tmp.setHSL(0.13, 0.3, 0.42); out.lerp(tmp, smoothstep(v.r * 0.6, v.r * 0.2, dv) * 0.16 * (0.5 + patch)); }
  return out;
}

export function buildTerrain(opts = {}) {
  build();
  const segs = opts.segments || 280;
  const size = WORLD.size;
  const geo = new T.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, count = pos.count;
  const colors = new Float32Array(count * 3), uv = geo.attributes.uv;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    vertexColor(x, z, y, colorGrass);
    colors[i * 3] = colorGrass.r; colors[i * 3 + 1] = colorGrass.g; colors[i * 3 + 2] = colorGrass.b;
    uv.setXY(i, x / 7, z / 7);
  }
  geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new T.MeshStandardMaterial({ vertexColors: true, map: groundDetail(), roughness: 1, metalness: 0 });
  const mesh = new T.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'terrain';
  return mesh;
}

/* 水面：一张平面，着色器里叠两层流动噪声当法线扰动，菲涅尔混远近两色。 */
export function buildWater() {
  const geo = new T.PlaneGeometry(WORLD.size, WORLD.size, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new T.Vector3(0.3, 0.8, 0.2) },
      uShallow: { value: new T.Color(0x5f9a8a) }, uDeep: { value: new T.Color(0x24515a) },
      uSky: { value: new T.Color(0xbcd3e6) }, uFogColor: { value: new T.Color(0xd8dfe3) }, uFogNear: { value: 80 }, uFogFar: { value: 600 },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun, uShallow, uDeep, uSky, uFogColor; uniform float uFogNear, uFogFar; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p=vW.xz;
        float a=n(p*0.35+vec2(uTime*0.05,uTime*0.03))+n(p*0.9-vec2(uTime*0.04,uTime*0.07))*0.5;
        float b=n(p*0.35+vec2(-uTime*0.04,uTime*0.05)+3.1)+n(p*0.9+vec2(uTime*0.06,-uTime*0.03)+7.0)*0.5;
        vec3 N=normalize(vec3((a-0.75)*0.35,1.0,(b-0.75)*0.35));
        vec3 V=normalize(cameraPosition-vW);
        float fres=pow(1.0-max(dot(N,V),0.0),3.0);
        vec3 col=mix(uDeep, uShallow, 0.35+0.3*a);
        col=mix(col, uSky, fres*0.75);
        vec3 H=normalize(V+uSun); float spec=pow(max(dot(N,H),0.0),180.0)*max(uSun.y,0.0);
        col+=vec3(spec)*0.9;
        float d=length(cameraPosition-vW); float fog=smoothstep(uFogNear,uFogFar,d);
        col=mix(col,uFogColor,fog);
        gl_FragColor=vec4(col, 0.78+fres*0.2);
      }`,
  });
  const mesh = new T.Mesh(geo, mat); mesh.position.y = WORLD.water; mesh.name = 'water'; mesh.renderOrder = 2;
  // 东畈的田水：同一份材质，一张圆盘，比田面高 15 厘米、比路低
  const p = PLACES.paddies;
  const paddy = new T.Mesh(new T.CircleGeometry(p.r - 12, 48).rotateX(-Math.PI / 2), mat); paddy.position.set(p.x, p.y - 0.15, p.z); paddy.renderOrder = 2; paddy.name = 'paddywater';
  mesh.add(paddy); paddy.position.y -= WORLD.water;
  return mesh;
}

/** 渲染小地图/大地图用的俯视图：直接按顶点色逻辑画一张。 */
export function paintMap(px = 512) {
  build();
  const c = document.createElement('canvas'); c.width = c.height = px; const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px), col = new T.Color();
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = (i / px) * WORLD.size - WORLD.half, z = (j / px) * WORLD.size - WORLD.half, y = heightAt(x, z);
    if (y < WORLD.water) col.set(0x6fa7b8).lerp(new T.Color(0x3d7488), clamp((WORLD.water - y) / 4, 0, 1));
    else { vertexColor(x, z, y, col); const sh = clamp(0.75 + (heightAt(x - 3, z - 3) - y) * 0.06, 0.5, 1.1); col.multiplyScalar(sh).lerp(new T.Color(0xe9dfc2), 0.25); }
    const k = (j * px + i) * 4; img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 路画成虚线一样的土色
  ctx.strokeStyle = 'rgba(133,96,58,0.9)'; ctx.lineWidth = Math.max(1.5, px / 300); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const toPx = (x, z) => [(x + WORLD.half) / WORLD.size * px, (z + WORLD.half) / WORLD.size * px];
  for (const r of ROADS) { ctx.beginPath(); r.forEach(([x, z], i) => { const [a, b] = toPx(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); }
  return c;
}
