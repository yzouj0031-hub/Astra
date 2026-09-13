/* 外部模型资源：GLTFLoader 和烟雨渡的树。
   来源见 assets/LICENSES.md（Quaternius，CC0），打包流程见 scripts/prepare-tree-assets.mjs。

   加载失败一律抛错，由 runtime.js 的 travel() 接住：控制台 console.error，
   界面上把 error.message 写到旅行地图的状态行。**不做静默回退** ——
   退回旧的球体树只允许发生在 npm test 的 Node 环境里，那条路在 watertown.js，
   靠「宿主没把 trees 传进来」触发，浏览器里永远走不到。

   贴图是单独的文件，不在 GLB 里：trees 和 deadtrees 共用同一张树皮，
   塞进各自的 GLB 就要存两遍（实测两份贴图 6.6MB，摘出来去重后 250KB）。
   所以 GLB 只留几何和材质名，这里按材质名把贴图接回去。 */
(function (root) {
'use strict';

const BASE = 'assets/trees/';
// 部件名 -> 在哪个 GLB 里。名字就是 glTF 的网格名，打包时保持不变。
const FILES = {
 'trees.glb':      ['NormalTree_1', 'NormalTree_2', 'NormalTree_3', 'NormalTree_4', 'NormalTree_5'],
 'maple.glb':      ['MapleTree_1', 'MapleTree_2', 'MapleTree_3', 'MapleTree_4', 'MapleTree_5'],
 'birch.glb':      ['BirchTree_1', 'BirchTree_2'],
 'deadtrees.glb':  ['DeadTree_1', 'DeadTree_2', 'DeadTree_3'],
 'bushes.glb':     ['Bush'],
 'bamboo.glb':     ['Bamboo'],
 'bamboo_mid.glb': ['Bamboo_Mid'],
 'palm.glb':       ['PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'PalmTree_4', 'PalmTree_5'],
 'pine.glb':       ['PineTree_1', 'PineTree_2', 'PineTree_4'],
};
// 自己画的 alpha 卡片（scripts/make-plant-cards.mjs）。放在 cards/ 而不是 tex/：
// tex/ 是 prepare-tree-assets.mjs 的输出目录，它每次会整个清掉。
const CARDS = { willow: 'willow_frond.png', bamboo: 'bamboo_leaf.png', pine: 'pine_pad.png' };

const loads = new Map();
function loadScript(src) {
 if (loads.has(src)) return loads.get(src);
 const p = new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = resolve;
  s.onerror = () => { s.remove(); loads.delete(src); reject(new Error('GLTFLoader 没能加载（' + src + '）。')); };
  document.head.appendChild(s);
 });
 loads.set(src, p);
 return p;
}

// dist 单文件版把 GLB 和贴图 base64 内嵌成 data URI 挂在这里（见 scripts/package-game.mjs）。
// 有内嵌就用内嵌，没有就按相对路径去取。
function urlOf(name) {
 const embedded = root.AstraTreeAssetData;
 return (embedded && embedded[name]) || BASE + name;
}

// 直接双击打开 index.html 时，这里是第一个撞墙的地方：fetch 不支持 file://，
// 抛的是一句光秃秃的 "Failed to fetch"。这句会被 runtime.js 原样写到界面上，
// 玩家看了不知道该干什么，所以换成说得清的。
const OFFLINE_HINT = '如果是直接双击打开 index.html，浏览器会拦掉 file:// 的请求 ——'
 + '请用 npm run dev 或 python START_GAME.py 起本地服务，或改用 npm run package:game 出的单文件版。';

function fetchJSON(name) {
 return fetch(urlOf(name)).then(r => {
  if (!r.ok) throw new Error('树的清单 ' + name + ' 取不到（HTTP ' + r.status + '）。');
  return r.json();
 }, () => { throw new Error('树的清单 ' + name + ' 取不到。' + OFFLINE_HINT); });
}

function loadGLB(T, name) {
 return new Promise((resolve, reject) => {
  new T.GLTFLoader().load(urlOf(name), resolve, undefined, () => {
   // GLTFLoader 的 onError 给的是 ProgressEvent，里面没有可读的原因。
   // 最常见的就是从 file:// 打开：XHR 被 CORS 拦掉，控制台另有一条 CORS 报错。
   reject(new Error('树模型 ' + name + ' 加载失败。' + OFFLINE_HINT));
  });
 });
}

/* plain=true 表示这张图贴在我们自己建的几何上（柳条那片 PlaneGeometry），
   不是贴在 glTF 的网格上 —— 两者的 UV 约定相反，flipY 必须分开处理。

   颜色空间：这里一律不设 sRGBEncoding。烟雨渡是 NoToneMapping + LinearEncoding，
   整镇的调色板按 sRGB 的原值直接当线性值送进去（见 regions.js 对 watertown 的特例）。
   给贴图标 sRGB，three 会在着色器里先转成线性、输出时又不转回去，
   叶片会比原图暗一大截、和旁边的墙瓦对不上。让采样值原样通过才跟全镇一致。 */
function loadTexture(T, file, { clamp, plain, dir }) {
 return new Promise((resolve, reject) => {
  new T.TextureLoader().load(urlOf((dir || 'tex') + '/' + file), tex => {
   // glTF 的 UV 原点在左上，three 默认 flipY=true 是给普通图片用的。
   // GLTFLoader 自己加载的贴图会设成 false，我们是单独加载的，得自己对齐，
   // 不然叶片和树皮会上下翻过来 —— 柳条翻过来之后叶子朝上，整棵成了针叶树。
   tex.flipY = !!plain;
   tex.wrapS = tex.wrapT = clamp ? T.ClampToEdgeWrapping : T.RepeatWrapping;
   tex.anisotropy = 4;
   resolve(tex);
  }, undefined, () => reject(new Error('树的贴图 ' + file + ' 加载失败。' + OFFLINE_HINT)));
 });
}

/* 把一个部件（可能由树皮 + 叶片两段网格组成）压成
   [{geometry, matName}]，几何预先烘进世界变换，并挪到「原点在树根、XZ 居中」。
   原件里五个变体各摆在自己的位置上，不挪的话实例化之后全都偏出去。 */
function flatten(T, node) {
 node.updateMatrixWorld(true);
 const parts = [];
 node.traverse(o => { if (o.isMesh) parts.push(o); });
 if (!parts.length) return null;

 const baked = parts.map(m => {
  const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
  // 只记材质**名字**：烟雨渡走 Linear、别的地区走 sRGB，同一张贴图不能同时
  // 挂两种 encoding，材质得按管线各建一份（见 materialFor）。
  return { geometry: g, matName: m.material.name };
 });
 const box = new T.Box3();
 for (const b of baked) { b.geometry.computeBoundingBox(); box.union(b.geometry.boundingBox); }
 const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2;
 for (const b of baked) {
  b.geometry.translate(dx, dy, dz);
  b.geometry.computeBoundingBox();
  b.geometry.computeBoundingSphere();
 }
 return { meshes: baked, height: box.max.y - box.min.y };
}

async function ensureLoader(T) {
 // dist 单文件版把 GLTFLoader 包成 AstraDefineGLTFLoader 存着（见 scripts/package-game.mjs
 // 里的说明：它顶层就要用全局 THREE，而脚本标签比内嵌的 three 更早），这里才真正执行。
 if (!T.GLTFLoader && root.AstraDefineGLTFLoader) root.AstraDefineGLTFLoader();
 if (!T.GLTFLoader) await loadScript('journeys/vendor/GLTFLoader.js');
 if (!T.GLTFLoader) throw new Error('GLTFLoader 加载后仍然不可用。');
}

/* 玩家角色：assets/player/ 下一个模型、一个动画库，来源见 assets/LICENSES.md。
   两个文件分开放是因为动画按骨骼名绑定，换衣服、换发型只要重出 player.glb。
   dist 单文件版内嵌在 AstraPlayerAssetData 上，跟树一样。
   只有玩家自己一个人用，不克隆 —— SkinnedMesh 直接 clone() 骨骼是连不上的。 */
let playerCache = null;
function loadPlayer(T) {
 if (playerCache) return playerCache;
 playerCache = (async () => {
  await ensureLoader(T);
  const url = name => (root.AstraPlayerAssetData && root.AstraPlayerAssetData[name]) || 'assets/player/' + name;
  const glb = name => new Promise((resolve, reject) => {
   new T.GLTFLoader().load(url(name), resolve, undefined, () => reject(new Error('玩家模型 ' + name + ' 加载失败。' + OFFLINE_HINT)));
  });
  const [model, anims] = await Promise.all([glb('player.glb'), glb('anims.glb')]);
  return { scene: model.scene, animations: anims.animations };
 })();
 playerCache = playerCache.catch(error => { playerCache = null; throw error; });
 return playerCache;
}

let cache = null;

/** 加载烟雨渡的树。成功返回 {parts, frond}，失败抛错 —— 不返回 null。 */
function load(T) {
 if (cache) return cache;
 cache = (async () => {
  await ensureLoader(T);

  const manifest = await fetchJSON('manifest.json');
  const gltfs = {};
  await Promise.all(Object.keys(FILES).map(async name => { gltfs[name] = await loadGLB(T, name); }));

  // 贴图按 manifest 里出现的文件去重后加载：树皮是平铺的要 Repeat，
  // 叶片是图集上的卡片要 Clamp；normal map 是数据不是颜色，不能当 sRGB。
  const want = new Map();
  for (const plan of Object.values(manifest.materials)) {
   if (plan.map) want.set(plan.map, { clamp: !!plan.alpha });
   if (plan.normalMap) want.set(plan.normalMap, { clamp: false });
  }
  const texes = {};
  await Promise.all([...want].map(async ([file, how]) => { texes[file] = await loadTexture(T, file, how); }));

  // 贴图解码一次，按色彩管线各克隆一份：clone() 共享 image，各自上传 GPU。
  // 烟雨渡是 NoToneMapping + LinearEncoding，调色板按 sRGB 原值直接当线性值送进去，
  // 贴图也必须原样通过；其余地区是 sRGB 输出，不打 sRGB 标记会亮一大截。
  const srgbCache = {};
  const texOf = (file, srgb) => {
   if (!srgb) return texes[file];
   if (!srgbCache[file]) { const c = texes[file].clone(); c.encoding = T.sRGBEncoding; c.needsUpdate = true; srgbCache[file] = c; }
   return srgbCache[file];
  };

  const matCache = {};
  /** 按材质名和色彩管线取一份 MeshPhongMaterial。全镇/全岛共用同一套着色模型。 */
  function materialFor(name, srgb) {
   const key = name + (srgb ? '|s' : '|l');
   if (matCache[key]) return matCache[key];
   const plan = manifest.materials[name] || {};
   const m = new T.MeshPhongMaterial({ specular: 0x000000, shininess: 1 });
   if (plan.map) m.map = texOf(plan.map, srgb);
   if (plan.normalMap) m.normalMap = texOf(plan.normalMap, false);  // 法线是数据不是颜色
   if (plan.alpha) {
    // 原件把叶片写成 alphaMode BLEND。上百棵树的半透明叶片既排不对序也投不出阴影，
    // 所以改成 alphaTest 硬裁：叶缘硬一点，换来正确的阴影和层次。
    m.alphaTest = 0.5; m.transparent = false; m.depthWrite = true; m.side = T.DoubleSide;
   }
   m.name = '';   // 别让 regions.js 的 SURFACES 按名字给树刷上石头木头的程序化纹理
   matCache[key] = m;
   return m;
  }

  const parts = {};
  for (const [file, names] of Object.entries(FILES)) {
   for (const name of names) {
    const node = gltfs[file].scene.getObjectByName(name);
    if (!node) throw new Error('树模型 ' + file + ' 里找不到 ' + name + '，assets/trees/ 可能是旧版本。');
    const flat = flatten(T, node);
    if (!flat) throw new Error('树模型 ' + name + ' 里没有网格。');
    parts[name] = flat;
   }
  }

  // 三张手画的卡片都贴在自建的 PlaneGeometry 上，走普通图片的 UV 约定（flipY=true）
  const cardTex = {};
  await Promise.all(Object.entries(CARDS).map(async ([key, file]) => {
   cardTex[key] = await loadTexture(T, file, { clamp: true, plain: true, dir: 'cards' });
  }));
  const cardCache = {};
  const cards = (key, srgb) => {
   const k = key + (srgb ? '|s' : '|l');
   if (!cardCache[k]) {
    const c = srgb ? cardTex[key].clone() : cardTex[key];
    if (srgb) { c.encoding = T.sRGBEncoding; c.needsUpdate = true; }
    cardCache[k] = c;
   }
   return cardCache[k];
  };
  return { parts, cards, materialFor };
 })();
 cache = cache.catch(error => { cache = null; throw error; });
 return cache;
}

root.AstraTreeAssets = { load, loadPlayer };

})(typeof window === 'undefined' ? globalThis : window);
