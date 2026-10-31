/* 昼夜：游戏内一天十二时辰。天空是一只包着相机的大球，着色器按太阳高度混色；
   太阳、月亮、雾色、半球光、灯笼亮度全由 time(0..24) 驱动。 */
import * as T from 'three';
import { clamp, lerp, smoothstep } from '../util/rng.js';

export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
/** 24 小时制 → "巳时初 · 第一日" 这类写法。 */
export function clockLabel(hour, day) {
  const idx = Math.floor(((hour + 1) % 24) / 2), sub = ((hour + 1) % 2) < 1 ? '初' : '正';
  const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const dayText = day <= 10 ? nums[day - 1] : day < 20 ? '十' + nums[day - 11] : String(day);
  return `${SHICHEN[idx]}时${sub} · 第${dayText}日`;
}

const C = (h) => new T.Color(h);
// 关键帧：时刻 → [天顶, 地平, 太阳光色, 雾色, 环境地色]
const KEYS = [
  [0,  [C(0x0c1428), C(0x202a44), C(0x6a7aa8), C(0x1a2234), C(0x161a20)]],
  [4.5,[C(0x1a2440), C(0x4a4a62), C(0x9a7a8a), C(0x3a3448), C(0x202428)]],
  [6,  [C(0x6f9ac8), C(0xf0c09a), C(0xffd0a0), C(0xd9c0a8), C(0x5a5540)]],
  [9,  [C(0x5f97d8), C(0xcfe0ec), C(0xfff2dc), C(0xd3dfe6), C(0x5b6a48)]],
  [13, [C(0x4f8fe0), C(0xd6e5ee), C(0xffffff), C(0xd4e0e8), C(0x6a7a52)]],
  [16.5,[C(0x5590d6), C(0xd9e4ea), C(0xfff4e0), C(0xd6dfe4), C(0x667450)]],
  [18, [C(0x5a86c0), C(0xf0c49a), C(0xffd6a0), C(0xdcc8b0), C(0x5e5a44)]],
  [19, [C(0x3a4a80), C(0xe09a78), C(0xffb080), C(0x8a6a70), C(0x3e3838)]],
  [20.2,[C(0x141e3c), C(0x3a3c58), C(0x8a8ab0), C(0x262c40), C(0x1c2028)]],
  [24, [C(0x0c1428), C(0x202a44), C(0x6a7aa8), C(0x1a2234), C(0x161a20)]],
];
function keyAt(t, i) {
  let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1][0] <= t) k++;
  const [t0, a] = KEYS[k], [t1, b] = KEYS[k + 1], f = clamp((t - t0) / (t1 - t0), 0, 1);
  return a[i].clone().lerp(b[i], f);
}

export function createSky(scene, renderer) {
  const uniforms = {
    uZenith: { value: C(0x5f97d8) }, uHorizon: { value: C(0xd6e5ee) }, uSun: { value: new T.Vector3(0, 1, 0) },
    uSunColor: { value: C(0xffffff) }, uNight: { value: 0 }, uMoon: { value: new T.Vector3(0, -1, 0) },
  };
  const sky = new T.Mesh(new T.SphereGeometry(900, 32, 16), new T.ShaderMaterial({
    uniforms, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uZenith,uHorizon,uSun,uSunColor,uMoon; uniform float uNight; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        float t=clamp(vD.y,0.0,1.0);
        vec3 col=mix(uHorizon,uZenith,pow(t,0.55));
        // 太阳：亮核 + 晕
        float sd=max(dot(vD,uSun),0.0);
        col+=uSunColor*(pow(sd,900.0)*1.6+pow(sd,24.0)*0.28*(1.0-uNight));
        // 日落时地平一带偏暖
        col+=uSunColor*pow(sd,3.0)*0.18*(1.0-t)*(1.0-uNight);
        // 月亮
        float md=max(dot(vD,uMoon),0.0); col+=vec3(0.9,0.92,1.0)*pow(md,1400.0)*1.2*uNight;
        // 星：按方向哈希，夜里才有
        vec3 g=floor(vD*220.0); float s=step(0.9965,h(g)); col+=vec3(s)*uNight*(0.5+0.5*h(g+1.0))*smoothstep(0.02,0.25,vD.y);
        gl_FragColor=vec4(col,1.0);
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  const sun = new T.DirectionalLight(0xffffff, 2.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
  const SH = 48; sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH; sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  const hemi = new T.HemisphereLight(0xcfe0ee, 0x5b6a48, 0.9); scene.add(hemi);
  const moon = new T.DirectionalLight(0x8090c0, 0.0); scene.add(moon); scene.add(moon.target);
  scene.fog = new T.Fog(0xd4e0e8, 140, 900);

  const state = { hour: 9.5, day: 1, speed: 1 / 60 /* 1 真实秒 = 1 游戏分钟 → 一天 24 分钟 */, night: 0, sunDir: new T.Vector3(), paused: false };

  function update(dt, focus) {
    if (!state.paused) { state.hour += dt * state.speed * 60 / 60; if (state.hour >= 24) { state.hour -= 24; state.day++; } }
    const t = state.hour;
    const ang = ((t - 5.5) / 13) * Math.PI;        // 5 点半升起，18 点半落下
    const sd = state.sunDir.set(Math.cos(ang) * 0.75, Math.sin(ang), -0.35).normalize();
    const elev = sd.y;
    const night = state.night = 1 - smoothstep(-0.25, 0.08, elev);
    uniforms.uZenith.value.copy(keyAt(t, 0)); uniforms.uHorizon.value.copy(keyAt(t, 1));
    uniforms.uSunColor.value.copy(keyAt(t, 2)); uniforms.uSun.value.copy(sd); uniforms.uNight.value = night;
    uniforms.uMoon.value.set(-sd.x, -sd.y * 0.8 + 0.1, sd.z * 0.6).normalize();
    scene.fog.color.copy(keyAt(t, 3)); hemi.color.copy(keyAt(t, 1)); hemi.groundColor.copy(keyAt(t, 4));
    hemi.intensity = lerp(0.95, 0.42, night);
    sun.color.copy(keyAt(t, 2)); sun.intensity = lerp(2.4, 0, night) * clamp(elev * 3 + 0.4, 0.2, 1);
    moon.intensity = 0.7 * night;
    sun.visible = elev > -0.2; sun.castShadow = elev > 0.02;
    // 太阳和阴影相机跟着焦点走
    const lightPos = elev > 0.02 ? sd : uniforms.uMoon.value;
    sun.position.copy(focus).addScaledVector(lightPos, 120); sun.target.position.copy(focus);
    moon.position.copy(focus).addScaledVector(uniforms.uMoon.value, 120); moon.target.position.copy(focus);
    sky.position.copy(focus);
    scene.fog.near = lerp(140, 60, night); scene.fog.far = lerp(900, 420, night);
    return state;
  }
  return { state, update, sun, hemi, sky, uniforms, label: () => clockLabel(state.hour, state.day) };
}
