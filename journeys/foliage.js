/* 六地共用的植被装配：实例化、风、alpha 卡片。
   原来这套只长在 watertown.js 里，静屿、星辉乐园、雨港、静山寺各有一份
   自己拿圆柱和锥体拼的树 —— 现在统一从这里出。

   宿主需要提供：
     T      three（宿主自己那一份）
     scene  往哪个场景里加
     srgb   该场景是不是 sRGB 输出。烟雨渡是 NoToneMapping + LinearEncoding，
            贴图必须原样通过；其余地区是 sRGB 输出，不打标记会亮一大截。
     assets journeys/assets.js 加载好的 {parts, cards, materialFor}

   风是顶点着色器里推的，摆幅两部分相加：
     - 局部项：随几何自身的局部高度增长，让长条自己弯（柳条最明显）。
     - aSway：逐实例的整体摆幅。挂在竹竿高处的叶簇是整片跟着竿子晃，
       它自己那点局部高度差撑不起位移，摆幅得在放置时按挂点高度算好传进来。
   阴影贴图走的是 depth 材质，不含这段位移，所以影子不跟着摆。 */
(function (root) {
'use strict';

function create(T, scene, opts) {
 const srgb = !!(opts && opts.srgb);
 const assets = opts.assets;
 // 逐地区的色偏。同一批模型要放进夜港和暗绿的山谷，原色偏亮偏黄，
 // 直接摆进去会从场景里跳出来。color 是乘在贴图上的，给个暗调的灰绿就压下去了。
 const tint = (opts && opts.tint) || null;
 const WIND = { value: 0 };
 const _e = new T.Euler(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3();

 /** 和 watertown.js 里的 M() 同一套参数顺序，免得两边写法不一致。 */
 function M(px, py, pz, sx, sy, sz, rx, ry, rz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _p.set(px, py, pz); _s.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
  return new T.Matrix4().compose(_p, _q, _s);
 }

 const _mats = new Map();
 function windMat(base, kind) {
  const key = base.uuid + '|' + kind + '|' + (tint || 0);
  if (_mats.has(key)) return _mats.get(key);
  const m = base.clone();
  if (tint) m.color = new T.Color(tint);
  m.onBeforeCompile = shader => {
   shader.uniforms.uWind = WIND;
   shader.vertexShader = 'uniform float uWind;\nattribute float aPhase;\nattribute float aSway;\n' + shader.vertexShader;
   if (kind !== 'leaf') {
    // 手画的卡片横向切成四列，按实例挑一列，同一株上的卡片就不重样。
    // 树自带的叶片贴图不是这种图集，所以只有卡片声明 aCol。
    shader.vertexShader = 'attribute float aCol;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',
     '#include <uv_vertex>\n\tvUv.x=(vUv.x+aCol)*0.25;');
   }
   const local = kind === 'frond' ? 'max(0.0,-transformed.y)*0.075'
    : kind === 'leaf' ? 'max(0.0,transformed.y-1.4)*0.016'
    : kind === 'culm' ? 'max(0.0,transformed.y-0.3)*0.055'   // 竹竿整根晃
    : '0.0';
   shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n\tfloat amp=' + local + '+aSway;' +
    '\n\tfloat sw=uWind+aPhase;' +
    '\n\ttransformed.x+=sin(sw*1.30+transformed.y*0.32)*amp;' +
    '\n\ttransformed.z+=cos(sw*1.07+transformed.y*0.26)*amp*0.7;');
  };
  // 不给 cacheKey 的话 three 会把没注入过的程序复用给它，风就没了
  m.customProgramCacheKey = () => 'astra-wind-' + kind;
  _mats.set(key, m);
  return m;
 }

 /* InstancedMesh 的逐实例属性挂在 geometry 上，而不同组可能共用同一份部件几何
    （比如老樟树和挑到同一变体的杂树）。直接挂会互相覆盖、长度还对不上。
    所以给每组做一份只共享缓冲区的浅拷贝：属性对象是新的，底层数据还是那一份。 */
 function shareGeometry(src) {
  const g = new T.BufferGeometry();
  for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
  if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox; g.boundingSphere = src.boundingSphere;
  return g;
 }

 /** items: [{m, phase, sway, col}]。几何必须是新建的或 shareGeometry() 的拷贝。 */
 function instance(geo, mat, items, cfg) {
  const shadow = !!(cfg && cfg.shadow);
  const inst = new T.InstancedMesh(geo, mat, items.length);
  const phase = new Float32Array(items.length), sway = new Float32Array(items.length), col = new Float32Array(items.length);
  items.forEach((it, i) => { inst.setMatrixAt(i, it.m); phase[i] = it.phase || 0; sway[i] = it.sway || 0; col[i] = it.col || 0; });
  inst.geometry.setAttribute('aPhase', new T.InstancedBufferAttribute(phase, 1));
  inst.geometry.setAttribute('aSway', new T.InstancedBufferAttribute(sway, 1));
  inst.geometry.setAttribute('aCol', new T.InstancedBufferAttribute(col, 1));
  inst.instanceMatrix.needsUpdate = true;
  // 叶片卡片一律不投影：上千片窄条会把 shadow map 打成噪点，枝干的影子已经够交代位置
  inst.castShadow = shadow; inst.receiveShadow = true; inst.frustumCulled = false;
  scene.add(inst);
  return inst;
}

 /** 把一个部件按一批落点实例化。spots: [{x,y,z,scale,rot,lean,phase}] */
 function plant(partName, spots, cfg) {
  if (!spots.length) return;
  const flat = assets.parts[partName];
  if (!flat) throw new Error('树模型里没有部件 ' + partName);
  const target = cfg && cfg.height;
  const norm = target ? target / flat.height : 1;
  for (const { geometry, matName } of flat.meshes) {
   const base = assets.materialFor(matName, srgb);
   instance(shareGeometry(geometry), windMat(base, 'leaf'), spots.map(s => ({
    m: M(s.x, s.y, s.z, s.scale * norm, s.scale * norm, s.scale * norm, s.lean || 0, s.rot || 0, 0),
    phase: s.phase || 0, sway: 0,
   })), { shadow: cfg && cfg.shadow !== false });
  }
  return norm;
 }

 /* 两片十字交叉的卡片：单片平面侧着看会整条消失，而柳条/竹叶是绕着株身一圈的，
    总有一批正好转到侧面。交叉之后从任何角度都有面朝着你。 */
 function crossStrip(width, segs) {
  const half = new T.PlaneGeometry(width, 1, 1, segs).translate(0, -0.5, 0);
  return mergePair(half, M(0, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0));
 }
 function crossCard(w, h) {
  return mergePair(new T.PlaneGeometry(w, h, 1, 1), M(0, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0));
 }
 /* 松针盘：一片摊平的卡片，从枝干往外伸。做成很浅的"人"字形两片 ——
    纯水平的一片从侧面看会消失，而松盘恰恰主要是侧着看的。 */
 function pinePad() {
  const quad = new T.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const a = quad.clone().applyMatrix4(M(0, 0, 0, 1, 1, 1, 0.30, 0, 0));
  const b = quad.clone().applyMatrix4(M(0, 0, 0, 1, 1, 1, -0.30, 0, 0));
  return joinGeometries([a, b]);
 }
 function mergePair(geo, matrix) {
  return joinGeometries([geo.clone(), geo.clone().applyMatrix4(matrix)]);
 }
 /* 只合并 position/normal/uv/index 的小工具。r128 的 BufferGeometryUtils 没有随
    examples/js 一起 vendored 进来，而这里要合的只有两片平面，自己拼比多带一个文件便宜。 */
 function joinGeometries(list) {
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g of list) {
   const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
   for (let i = 0; i < p.count; i++) {
    pos.push(p.getX(i), p.getY(i), p.getZ(i));
    nor.push(n.getX(i), n.getY(i), n.getZ(i));
    uv.push(t.getX(i), t.getY(i));
   }
   const ix = g.index;
   for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
   base += p.count;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
 }

 function cardMat(key, kind) {
  const m = new T.MeshPhongMaterial({ map: assets.cards(key, srgb), alphaTest: 0.45, transparent: false,
   side: T.DoubleSide, specular: 0x000000, shininess: 1 });
  m.name = '';
  return windMat(m, kind);
 }

 /* 从枝干几何里挑挂点：取树冠高度以上、离主干有距离的顶点，按方位角分桶，
    每桶留最外面那个 —— 卡片才会绕着树冠一圈垂下来，而不是全挤在一侧。
    有些方位没有枝梢，那个桶就空着，所以实际拿到的会少于 buckets。 */
 function branchTips(geo, buckets) {
  const pos = geo.attributes.position;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, hi = bb.min.y + (bb.max.y - bb.min.y) * 0.5;
  const best = new Array(buckets).fill(null);
  const TAU = Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
   const y = pos.getY(i); if (y < hi) continue;
   const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
   if (r < 0.18) continue;
   const b = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * buckets) % buckets;
   const score = r + y * 0.25;
   if (!best[b] || score > best[b].score) best[b] = { x, y, z, score };
  }
  return best.filter(Boolean);
 }

 /* 按 Y 高度带取一批点，按下标等距取样 —— 竹是好几根竿子共用一个网格，
    等距取样自然会落到不同竿子上。 */
 function bandPoints(geo, count, lo, hi) {
  const pos = geo.attributes.position;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, y0 = bb.min.y + (bb.max.y - bb.min.y) * lo, y1 = bb.min.y + (bb.max.y - bb.min.y) * hi;
  const cand = [];
  for (let i = 0; i < pos.count; i++) {
   const y = pos.getY(i); if (y < y0 || y > y1) continue;
   cand.push({ x: pos.getX(i), y, z: pos.getZ(i) });
  }
  if (cand.length <= count) return cand;
  const out = [], step = cand.length / count;
  for (let i = 0; i < count; i++) out.push(cand[Math.floor(i * step)]);
  return out;
 }

 return { M, WIND, windMat, shareGeometry, instance, plant, crossStrip, crossCard, pinePad,
  cardMat, branchTips, bandPoints, heightOf: n => assets.parts[n].height,
  tick: t => { WIND.value = t; } };
}

root.AstraFoliage = { create };

})(typeof window === 'undefined' ? globalThis : window);
