/* 整张地图的"地理"：坐标都是米，原点在地图中心，北是 -z。
   地形、路、村子、任务点都引用这里，改一处全图跟着动。 */
import { fbm, smoothstep, lerp, clamp } from '../util/rng.js';

export const WORLD = { size: 1400, half: 700, water: 2.0, seed: 7 };

/* 河：从北到南一条弯河，x 随 z 摆动。 */
export const RIVER = {
  halfWidth: 13,
  x(z) { return 70 + 95 * Math.sin(z / 270) + 32 * Math.sin(z / 93 + 1.3); },
  dist(x, z) { return Math.abs(x - RIVER.x(z)); },
};

export const PLACES = {
  village:  { id: 'village',  name: '渡头村',   x: -130, z: 50,   r: 125, y: 6.0 },
  paddies:  { id: 'paddies',  name: '东畈',     x: 215,  z: 110,  r: 130, y: 3.4 },
  lake:     { id: 'lake',     name: '镜湖',     x: -410, z: -150, r: 100 },
  mountain: { id: 'mountain', name: '青屏山',   x: 420,  z: -420, r: 300, h: 125 },
  beacon:   { id: 'beacon',   name: '青屏烽台', x: 420,  z: -420 },
  shrine:   { id: 'shrine',   name: '山神祠',   x: -230, z: -250, r: 60 },
  pines:    { id: 'pines',    name: '松坡',     x: -400, z: 360,  r: 190 },
  camp1:    { id: 'camp1',    name: '黑石寨',   x: 340,  z: 360 },
  camp2:    { id: 'camp2',    name: '野狐坡',   x: -470, z: 330 },
  bridge:   { id: 'bridge',   name: '渡头桥',   x: 0,    z: 50 },   // x 在 bridgeSpan() 里按河心算
  dock:     { id: 'dock',     name: '渡头埠',   x: 0,    z: 110 },
  teahouse: { id: 'teahouse', name: '听松茶舍', x: -92,  z: 20 },
  bamboo:   { id: 'bamboo',   name: '竹坞',     x: -200, z: -70,  r: 55 },
  maples:   { id: 'maples',   name: '枫林',     x: -230, z: -250, r: 90 },
};
PLACES.bridge.x = RIVER.x(PLACES.bridge.z);
PLACES.dock.x = RIVER.x(PLACES.dock.z) - RIVER.halfWidth - 3;

/* 路：折线，宽 5 米。地形不按它压平，只在顶点色上画成土色、并把草和树让开。 */
export const ROADS = [
  // 村 → 桥 → 东畈 → 盘山 → 烽台
  [[-130, 50], [-60, 46], [PLACES.bridge.x - 24, 50], [PLACES.bridge.x + 24, 50], [120, 70], [215, 110],
   [290, 40], [330, -60], [380, -160], [330, -250], [370, -330], [420, -420]],
  // 村 → 竹坞 → 山神祠
  [[-130, 50], [-170, -10], [-200, -70], [-215, -160], [-230, -250]],
  // 村 → 松坡 → 野狐坡
  [[-130, 50], [-200, 130], [-290, 220], [-400, 300], [-470, 330]],
  // 东畈 → 黑石寨
  [[215, 110], [260, 220], [320, 300], [340, 360]],
  // 村 → 镜湖
  [[-130, 50], [-230, 20], [-320, -60], [-380, -110]],
  // 村内小路到埠头
  [[-130, 50], [-80, 90], [PLACES.dock.x - 4, PLACES.dock.z]],
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}
export function roadDist(x, z) {
  let best = 1e9;
  for (const road of ROADS) for (let i = 1; i < road.length; i++) {
    const d = segDist(x, z, road[i - 1][0], road[i - 1][1], road[i][0], road[i][1]);
    if (d < best) best = d;
  }
  return best;
}

const g = (x, z, cx, cz, s) => { const d2 = (x - cx) ** 2 + (z - cz) ** 2; return Math.exp(-d2 / (2 * s * s)); };

/** 纯函数：地面高度。地形网格和运行时查询都走它（运行时查的是它预采样的格子）。 */
export function rawHeight(x, z) {
  const s = WORLD.seed;
  let y = 4 + fbm(x / 460, z / 460, 5, s) * 15 + fbm(x / 110, z / 110, 3, s + 50) * 2.6;
  // 青屏山：东北角一座主峰，山脊用低频噪声扭一下
  const m = PLACES.mountain;
  const ridge = 1 + 0.22 * fbm(x / 160, z / 160, 3, s + 90);
  y += m.h * g(x, z, m.x, m.z, 250) * ridge;
  y += 36 * g(x, z, m.x - 160, m.z + 140, 120);          // 前峰，让盘山路有坡可盘
  // 松坡：西南一片缓丘
  y += 34 * g(x, z, PLACES.pines.x, PLACES.pines.z, 180);
  // 山神祠所在的小丘
  y += 20 * g(x, z, PLACES.shrine.x, PLACES.shrine.z, 110);
  // 东畈：水田压平
  // 东畈：水田压平，田面比路低 30 厘米，这样田里能灌一层水、路还是干的
  const p = PLACES.paddies, dp = Math.hypot(x - p.x, z - p.z);
  y = lerp(y, p.y - 0.3 + 0.3 * smoothstep(7, 3.5, roadDist(x, z)), smoothstep(p.r + 50, p.r - 15, dp));
  // 渡头村：台地
  const v = PLACES.village, dv = Math.hypot(x - v.x, z - v.z);
  y = lerp(y, v.y + fbm(x / 60, z / 60, 2, s + 7) * 0.5, smoothstep(v.r + 60, v.r - 25, dv));
  // 镜湖：挖一个碗
  const l = PLACES.lake, dl = Math.hypot(x - l.x, z - l.z);
  y = lerp(y, -5, smoothstep(l.r + 45, l.r - 15, dl));
  // 河谷：岸边先抬到水面以上，再向河心挖下去
  const d = RIVER.dist(x, z), hw = RIVER.halfWidth;
  const bank = smoothstep(hw + 70, hw + 6, d);
  y = lerp(y, Math.max(y * 0.4 + 1.6, 3.0), bank);
  y = lerp(y, -2.8, smoothstep(hw + 5, hw - 5, d));
  return y;
}

export function placeAt(x, z) {
  for (const p of Object.values(PLACES)) if (p.r && Math.hypot(x - p.x, z - p.z) < p.r) return p;
  if (RIVER.dist(x, z) < RIVER.halfWidth + 10) return { id: 'river', name: '溪上' };
  return { id: 'wild', name: '野地' };
}
