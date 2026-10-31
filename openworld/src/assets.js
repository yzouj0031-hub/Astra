/* 外部模型：树（Quaternius，CC0）、玩家与路人（Quaternius，CC0）、乌篷船（Astra 自建）。
   来源与加工见 assets/LICENSES.md。加载失败一律抛错并显示在加载页上，不做静默回退。 */
import * as T from 'three';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';

const BASE = new URL('../assets/', import.meta.url).href;
const loader = new GLTFLoader();

export const TREE_FILES = {
  'trees/trees.glb':      ['NormalTree_1', 'NormalTree_2', 'NormalTree_3', 'NormalTree_4', 'NormalTree_5'],
  'trees/maple.glb':      ['MapleTree_1', 'MapleTree_2', 'MapleTree_3', 'MapleTree_4', 'MapleTree_5'],
  'trees/birch.glb':      ['BirchTree_1', 'BirchTree_2'],
  'trees/deadtrees.glb':  ['DeadTree_1', 'DeadTree_2', 'DeadTree_3'],
  'trees/bushes.glb':     ['Bush'],
  'trees/bamboo.glb':     ['Bamboo'],
  'trees/bamboo_mid.glb': ['Bamboo_Mid'],
  'trees/pine.glb':       ['PineTree_1', 'PineTree_2', 'PineTree_4'],
};
const CARDS = { willow: 'trees/cards/willow_frond.png', bamboo: 'trees/cards/bamboo_leaf.png', pine: 'trees/cards/pine_pad.png' };

function glb(path) {
  return new Promise((resolve, reject) => {
    loader.load(BASE + path, resolve, undefined, () => reject(new Error(`模型 ${path} 加载失败（请用本地服务打开，不要直接双击 index.html）。`)));
  });
}
function texture(path, { clamp = false, srgb = true, plain = false } = {}) {
  return new Promise((resolve, reject) => {
    new T.TextureLoader().load(BASE + path, t => {
      t.flipY = plain;                       // glTF 的 UV 原点在左上；自己建的平面才翻
      t.wrapS = t.wrapT = clamp ? T.ClampToEdgeWrapping : T.RepeatWrapping;
      t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = 4;
      resolve(t);
    }, undefined, () => reject(new Error(`贴图 ${path} 加载失败。`)));
  });
}

/** 把一个部件压成 [{geometry, matName}]，原点挪到树根、XZ 居中。 */
function flatten(node) {
  node.updateMatrixWorld(true);
  const meshes = [];
  node.traverse(o => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return null;
  const baked = meshes.map(m => ({ geometry: m.geometry.clone().applyMatrix4(m.matrixWorld), matName: m.material.name }));
  const box = new T.Box3();
  for (const b of baked) { b.geometry.computeBoundingBox(); box.union(b.geometry.boundingBox); }
  const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2;
  for (const b of baked) { b.geometry.translate(dx, dy, dz); b.geometry.computeBoundingBox(); b.geometry.computeBoundingSphere(); }
  return { meshes: baked, height: box.max.y - box.min.y, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 };
}

export async function loadAll(progress = () => {}) {
  const steps = 5; let done = 0; const tick = label => progress(++done / steps, label);

  const manifest = await fetch(BASE + 'trees/manifest.json').then(r => { if (!r.ok) throw new Error('树的清单取不到'); return r.json(); });
  tick('树的清单');
  const gltfs = {};
  await Promise.all(Object.keys(TREE_FILES).map(async f => { gltfs[f] = await glb(f); }));
  tick('树模型');
  const want = new Map();
  for (const plan of Object.values(manifest.materials)) {
    if (plan.map) want.set(plan.map, { clamp: !!plan.alpha, srgb: true });
    if (plan.normalMap) want.set(plan.normalMap, { clamp: false, srgb: false });
  }
  const texes = {};
  await Promise.all([...want].map(async ([file, how]) => { texes[file] = await texture('trees/tex/' + file, how); }));
  const cards = {};
  await Promise.all(Object.entries(CARDS).map(async ([k, p]) => { cards[k] = await texture(p, { clamp: true, plain: true }); }));
  tick('树的贴图');

  const parts = {};
  for (const [file, names] of Object.entries(TREE_FILES)) {
    for (const name of names) {
      const node = gltfs[file].scene.getObjectByName(name);
      if (!node) throw new Error(`${file} 里没有 ${name}`);
      parts[name] = flatten(node);
    }
  }
  const matCache = {};
  function materialFor(name) {
    if (matCache[name]) return matCache[name];
    const plan = manifest.materials[name] || {};
    const m = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    if (plan.map) m.map = texes[plan.map];
    if (plan.normalMap) m.normalMap = texes[plan.normalMap];
    if (plan.alpha) { m.alphaTest = 0.5; m.transparent = false; m.side = T.DoubleSide; }
    m.name = name;
    matCache[name] = m;
    return m;
  }

  const [player, anims] = await Promise.all([glb('player/player.glb'), glb('player/anims.glb')]);
  tick('玩家角色');
  const crowdFiles = ['crowd/m_indigo_parted.glb', 'crowd/f_brown_buns.glb', 'crowd/m_brown_buzzed.glb', 'crowd/f_indigo_long.glb'];
  const [crowd, boat] = await Promise.all([Promise.all(crowdFiles.map(f => glb(f))), glb('wupeng.glb')]);
  tick('路人与船');

  return {
    trees: { parts, materialFor, cards },
    player: { scene: player.scene, animations: anims.animations },
    crowd: crowd.map(g => g.scene),
    boat: boat.scene,
  };
}
