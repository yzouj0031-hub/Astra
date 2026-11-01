/* 卡通着色：三阶明暗的渐变图、把任意材质换成 MeshToonMaterial、反向外壳描边。 */
import * as T from 'three';

let gradient = null;
export function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([96, 96, 96, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  gradient = new T.DataTexture(data, 3, 1, T.RGBAFormat);
  gradient.minFilter = gradient.magFilter = T.NearestFilter; gradient.colorSpace = T.NoColorSpace; gradient.needsUpdate = true;
  return gradient;
}

/** 把一份材质的贴图、颜色、透明裁剪、双面、发光搬到卡通材质上。 */
export function toonify(src, extra = {}) {
  const m = new T.MeshToonMaterial({ gradientMap: gradientMap() });
  if (src.map) m.map = src.map;
  if (src.normalMap) m.normalMap = src.normalMap;
  if (src.color) m.color.copy(src.color);
  if (src.emissive) { m.emissive.copy(src.emissive); m.emissiveIntensity = src.emissiveIntensity; if (src.emissiveMap) m.emissiveMap = src.emissiveMap; }
  m.alphaTest = src.alphaTest || 0; m.transparent = !!src.transparent; m.opacity = src.opacity ?? 1; m.side = src.side ?? T.FrontSide;
  m.vertexColors = !!src.vertexColors; m.name = src.name || '';
  Object.assign(m, extra);
  return m;
}

/** 新建一份卡通材质。 */
export function toon(opts = {}) { return new T.MeshToonMaterial({ gradientMap: gradientMap(), ...opts }); }

/** 描边：同一份几何再画一层背面、沿法线外推的黑壳。蒙皮网格也行（外推在蒙皮之前做）。 */
export function outlineMaterial(width = 0.008, color = 0x1c1c26) {
  const m = new T.MeshBasicMaterial({ color, side: T.BackSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uOut = { value: width };
    sh.vertexShader = 'uniform float uOut;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normal * uOut;');
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}
export function addOutline(mesh, width, color) {
  const mat = outlineMaterial(width, color);
  let o;
  if (mesh.isSkinnedMesh) { o = new T.SkinnedMesh(mesh.geometry, mat); o.bind(mesh.skeleton, mesh.bindMatrix); }
  else o = new T.Mesh(mesh.geometry, mat);
  o.name = 'outline'; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
  mesh.add(o);   // 子物体，跟着父网格的变换
  return o;
}
