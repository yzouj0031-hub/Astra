/* 角色共用：蒙皮克隆、动画控制、碰撞推挤。玩家、村民、山贼都从这里出。 */
import * as T from 'three';
import { clone as skClone } from '../vendor/addons/SkeletonUtils.js';
import { heightAt, isWater } from './world/terrain.js';
import { WORLD } from './world/layout.js';

export const CLIPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', swimIdle: 'Swim_Idle_Loop', swim: 'Swim_Fwd_Loop',
  air: 'Jump_Loop', sit: 'Sitting_Idle_Loop', fight: 'Sword_Idle', attack: 'Sword_Attack', dodge: 'Roll', interact: 'Interact' };
const ONCE = new Set(['attack', 'dodge', 'interact']);

/** 把一份 glTF 场景克隆成可独立动画的实例，缩放到 height 米、脚底在原点。 */
export function makeFigure(srcScene, animations, height = 1.8, tint = null) {
  const model = skClone(srcScene);
  const box = new T.Box3().setFromObject(model), k = height / (box.max.y - box.min.y);
  model.scale.setScalar(k); model.position.y = -box.min.y * k;
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      if (tint) { o.material = o.material.clone(); o.material.color.multiply(new T.Color(tint)); }
    }
  });
  const root = new T.Group(); root.add(model);
  const mixer = new T.AnimationMixer(model), actions = {};
  for (const [key, name] of Object.entries(CLIPS)) {
    const clip = animations.find(c => c.name === name); if (!clip) throw new Error('动画库里缺 ' + name);
    actions[key] = mixer.clipAction(clip);
    if (ONCE.has(key)) { actions[key].setLoop(T.LoopOnce); actions[key].clampWhenFinished = true; }
  }
  let current = null;
  const fig = {
    root, model, mixer, actions, hand: model.getObjectByName('hand_r'), head: model.getObjectByName('head') || model.getObjectByName('Head'),
    play(key, rate = 1, fade = 0.18) {
      const act = actions[key];
      if (key !== current) { const prev = current && actions[current]; act.reset().play(); if (prev) act.crossFadeFrom(prev, fade, false); current = key; }
      act.timeScale = rate; return act;
    },
    current: () => current,
    update(dt) { mixer.update(dt); },
  };
  return fig;
}

/* ---- 碰撞：圆柱体和旋转过的方盒子，只在 XZ 平面推开 ---- */
export function createColliders() {
  const list = [];
  const _v = new T.Vector2();
  return {
    list,
    add(c) { list.push(c); return c; },
    addMany(cs) { for (const c of cs) list.push(c); },
    /** 把 p(x,z) 以半径 r 推出所有碰撞体。 */
    resolve(p, r) {
      for (const c of list) {
        if (c.r !== undefined) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
          if (d < min && d > 1e-4) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); }
        } else if (c.hw !== undefined) {
          const cs = Math.cos(-c.rot || 0), sn = Math.sin(-c.rot || 0);
          const lx = (p.x - c.x) * cs - (p.z - c.z) * sn, lz = (p.x - c.x) * sn + (p.z - c.z) * cs;
          const ox = c.hw + r - Math.abs(lx), oz = c.hd + r - Math.abs(lz);
          if (ox > 0 && oz > 0) {
            let nx = 0, nz = 0;
            if (ox < oz) nx = Math.sign(lx) * ox; else nz = Math.sign(lz) * oz;
            const wc = Math.cos(c.rot || 0), ws = Math.sin(c.rot || 0);
            p.x += nx * wc - nz * ws; p.z += nx * ws + nz * wc;
          }
        }
      }
      // 地图边界
      const lim = WORLD.half - 8;
      p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    },
  };
}

/** 在地上按速度走一步：处理坡度、水、重力、跳。state: {pos, vel, onGround, swimming} */
export function stepBody(b, dt, colliders, radius = 0.4, { gravity = 24, canSwim = true } = {}) {
  b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
  colliders.resolve(b.pos, radius);
  const ground = heightAt(b.pos.x, b.pos.z);
  const water = WORLD.water;
  b.swimming = canSwim && ground < water - 0.9 && b.pos.y < water + 0.2;
  if (b.swimming) { b.pos.y = water - 0.25; b.vel.y = 0; b.onGround = true; return; }
  b.vel.y -= gravity * dt; b.pos.y += b.vel.y * dt;
  if (b.pos.y <= ground) { b.pos.y = ground; b.vel.y = 0; b.onGround = true; } else b.onGround = false;
  // 坡太陡滑下去
}
