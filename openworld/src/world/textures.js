/* 运行时在画布上生成的贴图：地面细节、灰瓦、白墙、木纹、窗棂、草丛卡片。
   不用贴图文件 —— 这些纹理按参数现画比下载一堆图便宜，也不占包体。 */
import * as T from 'three';
import { hash2, fbm } from '../util/rng.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 地面细节：灰度噪点，平铺在顶点色上面，近看才有"土"的颗粒。 */
export function groundDetail() {
  const n = 256, c = canvas(n, n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    // 周期噪声：按 n 取模让四边接得上
    const v = 0.62 + 0.38 * (0.5 + 0.5 * fbm(x / 23, y / 23, 3, 3)) + (hash2(x, y, 9) - 0.5) * 0.22;
    const i = (y * n + x) * 4, k = Math.round(Math.max(0, Math.min(1, v)) * 255);
    img.data[i] = k; img.data[i + 1] = k; img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

/** 灰瓦：一行行筒瓦，带瓦当的明暗。 */
export function roofTiles() {
  const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#4b5058'; ctx.fillRect(0, 0, w, h);
  const rows = 8, cols = 8, rh = h / rows, cw = w / cols;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = col * cw, y = r * rh, k = hash2(col, r, 21);
    // 板瓦（凹）
    const grd = ctx.createLinearGradient(x, 0, x + cw, 0);
    grd.addColorStop(0, `hsl(215,8%,${26 + k * 6}%)`); grd.addColorStop(0.5, `hsl(215,8%,${40 + k * 6}%)`); grd.addColorStop(1, `hsl(215,8%,${27 + k * 5}%)`);
    ctx.fillStyle = grd; ctx.fillRect(x, y, cw, rh);
    // 筒瓦（凸，压在两片板瓦之间）
    const g2 = ctx.createLinearGradient(x + cw * 0.3, 0, x + cw * 0.7, 0);
    g2.addColorStop(0, '#2d3137'); g2.addColorStop(0.5, '#6a7079'); g2.addColorStop(1, '#2a2e34');
    ctx.fillStyle = g2; ctx.fillRect(x + cw * 0.3, y, cw * 0.4, rh);
    // 每行下沿一条暗缝
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + rh - 3, cw, 3);
  }
  return tex(c);
}

/** 夯土/白灰墙：底部返潮发黄，上面斑驳。 */
export function plasterWall(base = '#e7dfcc') {
  const n = 256, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
  const img = ctx.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, v = fbm(x / 30, y / 30, 4, 11) * 14 + (hash2(x, y, 5) - 0.5) * 10;
    const damp = Math.max(0, (y - n * 0.7) / (n * 0.3)) * 28;   // 墙脚返潮
    img.data[i] = Math.max(0, img.data[i] + v - damp * 0.6);
    img.data[i + 1] = Math.max(0, img.data[i + 1] + v - damp * 0.8);
    img.data[i + 2] = Math.max(0, img.data[i + 2] + v - damp * 1.3);
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

/** 木纹：竖直木纹，柱、梁、门、栏杆共用。 */
export function wood(hue = 24, light = 32) {
  const n = 256, c = canvas(n, n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const grain = fbm(x / 9, y / 90, 3, 31) * 0.5 + fbm(x / 2.5, y / 200, 2, 32) * 0.25;
    const l = light + grain * 12, s = 42 + grain * 10;
    const col = hslToRgb(hue / 360, s / 100, l / 100), i = (y * n + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

/** 窗棂：直棂 + 方格，纸是暖白色，夜里当发光面。 */
export function lattice() {
  const n = 128, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.fillStyle = '#f1e4c6'; ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = '#4a2e1a';
  for (let i = 0; i <= 4; i++) { ctx.fillRect(i * (n / 4) - 2, 0, 4, n); ctx.fillRect(0, i * (n / 4) - 2, n, 4); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * n / 4, y = j * n / 4; ctx.fillRect(x + n / 8 - 1, y, 2, n / 4); ctx.fillRect(x, y + n / 8 - 1, n / 4, 2);
  }
  return tex(c, { repeat: false });
}

/** 石块：青石，用在桥、井台、烽台。 */
export function stone() {
  const n = 256, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.fillStyle = '#7d8183'; ctx.fillRect(0, 0, n, n);
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const rh = n / rows, off = (r % 2) * 28; let x = -off;
    while (x < n) {
      const w = 36 + hash2(x, r, 44) * 30, k = hash2(x + 7, r, 45);
      ctx.fillStyle = `hsl(${195 + k * 20},${5 + k * 5}%,${44 + k * 12}%)`;
      ctx.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      x += w;
    }
  }
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) { const v = (hash2(i, 3, 46) - 0.5) * 18; img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v; }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

/** 草丛卡片：一簇细长叶片，alpha 镂空，根部深、梢头亮。 */
export function grassCard() {
  const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const k = hash2(i, 1, 51), x0 = 18 + k * (w - 36), top = 6 + hash2(i, 2, 52) * 40;
    const lean = (hash2(i, 3, 53) - 0.5) * 50, wd = 3.5 + hash2(i, 4, 54) * 3;
    const grd = ctx.createLinearGradient(0, h, 0, top);
    grd.addColorStop(0, '#39581f'); grd.addColorStop(0.55, '#6b9a34'); grd.addColorStop(1, '#b9d36a');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(x0 - wd, h); ctx.quadraticCurveTo(x0 + lean * 0.3, h * 0.55, x0 + lean, top); ctx.quadraticCurveTo(x0 + lean * 0.3 + wd * 0.6, h * 0.55, x0 + wd, h); ctx.closePath(); ctx.fill();
  }
  const t = tex(c, { repeat: false }); t.flipY = true; return t;
}

/** 芦苇 / 稻秧卡片：直立细叶。 */
export function reedCard() {
  const w = 64, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x0 = 8 + hash2(i, 9, 61) * 48, lean = (hash2(i, 8, 62) - 0.5) * 22;
    const grd = ctx.createLinearGradient(0, h, 0, 0); grd.addColorStop(0, '#5c7a2a'); grd.addColorStop(1, '#c6d56a');
    ctx.strokeStyle = grd; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, h); ctx.quadraticCurveTo(x0 + lean * 0.4, h * 0.4, x0 + lean, 4 + hash2(i, 7, 63) * 30); ctx.stroke();
  }
  const t = tex(c, { repeat: false }); t.flipY = true; return t;
}

/** 灯笼纸：竖条骨架。 */
export function lanternPaper() {
  const n = 64, c = canvas(n, n), ctx = c.getContext('2d');
  ctx.fillStyle = '#d8402c'; ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = '#9c2518'; for (let i = 0; i < 6; i++) ctx.fillRect(i * n / 6, 0, 2, n);
  return tex(c);
}

function hslToRgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
