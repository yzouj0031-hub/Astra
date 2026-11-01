/* 玩家：相对相机的移动、跑、跳、游泳、轻击/重击/翻滚，血与体力。 */
import * as T from 'three';
import { makeFigure, stepBody } from './characters.js';
import { dressFigure } from './stylized.js';
import { toon } from './toon.js';
import { heightAt } from './world/terrain.js';
import { clamp, lerp } from './util/rng.js';

const WALK = 2.2, JOG = 4.6, SPRINT = 7.8, SWIM = 2.4;

export function createPlayer(scene, assets, colliders) {
  const fig = makeFigure(assets.player.scene, assets.player.animations, 1.8);
  fig.root.name = 'player'; scene.add(fig.root);
  dressFigure(fig, 'player');
  // 一把刀：挂在右手骨骼上（道具可以用几何体）
  const sword = new T.Group();
  const blade = new T.Mesh(new T.BoxGeometry(0.035, 0.78, 0.012), toon({ color: 0xdfe6ec })); blade.position.y = 0.5; sword.add(blade);
  const guard = new T.Mesh(new T.BoxGeometry(0.14, 0.03, 0.04), toon({ color: 0xc9a24c })); guard.position.y = 0.1; sword.add(guard);
  const grip = new T.Mesh(new T.CylinderGeometry(0.017, 0.02, 0.2, 8), toon({ color: 0x3a2a1a })); sword.add(grip);
  if (fig.hand) { fig.hand.add(sword); sword.scale.setScalar(1 / fig.model.scale.x); sword.rotation.set(Math.PI / 2, 0, 0); sword.position.set(0, 0.06, 0.02); }
  sword.visible = false;

  const p = {
    fig, pos: fig.root.position, vel: new T.Vector3(), yaw: Math.PI, onGround: true, swimming: false,
    hp: 100, maxHp: 100, stamina: 100, speed: 0, top: JOG,
    action: null, actionT: 0, actionDur: 0, fighting: 0, hitDone: false, invuln: 0, dead: false, respawnT: 0,
    coins: 0, sword,
    get heading() { return new T.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)); },
  };
  const dir = new T.Vector3(), fwd = new T.Vector3(), right = new T.Vector3();

  function startAction(kind) {
    if (p.action || p.swimming) return false;
    const dur = { attack: 0.62, heavy: 0.95, dodge: 0.7, interact: 0.9 }[kind];
    p.action = kind; p.actionT = 0; p.actionDur = dur; p.hitDone = false;
    if (kind === 'dodge') { p.invuln = 0.45; p.stamina -= 15; }
    if (kind === 'attack') p.stamina -= 8; if (kind === 'heavy') p.stamina -= 20;
    p.fighting = 4;
    return true;
  }

  function update(dt, input, cam, world) {
    if (p.dead) { p.respawnT -= dt; fig.play('idle'); fig.update(dt); return; }
    // 相机系的前/右
    fwd.set(-Math.sin(cam.s.yaw), 0, -Math.cos(cam.s.yaw)); right.set(fwd.z, 0, -fwd.x);
    dir.set(0, 0, 0).addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    const mag = Math.min(1, dir.length());
    if (mag > 0.01) dir.normalize();
    const wantSprint = input.sprint && mag > 0.5 && p.stamina > 2 && !p.swimming;
    const top = p.swimming ? SWIM : wantSprint ? SPRINT : JOG;
    p.top = JOG;
    let target = mag < 0.45 && mag > 0.01 ? WALK * (mag / 0.45) : top * mag;
    if (p.action === 'attack' || p.action === 'heavy') target *= 0.15;
    if (p.action === 'dodge') { target = 6.5; if (mag < 0.01) dir.copy(p.heading); }
    // 坡度减速
    const n = heightAt(p.pos.x + dir.x, p.pos.z + dir.z) - heightAt(p.pos.x, p.pos.z);
    if (n > 0.35) target *= clamp(1 - (n - 0.35) * 1.4, 0.25, 1);
    if (n > 0.95) target = 0;   // 太陡爬不上
    const accel = p.onGround ? 18 : 6;
    const vx = dir.x * target, vz = dir.z * target;
    p.vel.x = lerp(p.vel.x, vx, 1 - Math.exp(-dt * accel)); p.vel.z = lerp(p.vel.z, vz, 1 - Math.exp(-dt * accel));
    p.speed = Math.hypot(p.vel.x, p.vel.z);
    if (mag > 0.01 && target > 0) { const want = Math.atan2(dir.x, dir.z); let d = want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * (1 - Math.exp(-dt * 14)); }
    // 跳
    if (input.jump && p.onGround && !p.swimming && !p.action && p.stamina > 5) { p.vel.y = 8.2; p.onGround = false; p.stamina -= 6; }
    // 体力
    if (wantSprint && p.speed > 3) p.stamina -= dt * 9; else p.stamina += dt * (p.action ? 4 : 11);
    p.stamina = clamp(p.stamina, 0, 100);
    // 动作
    if (input.attack) startAction('attack'); else if (input.heavy) startAction('heavy'); else if (input.dodge) startAction('dodge');
    if (p.action) {
      p.actionT += dt;
      const frac = p.actionT / p.actionDur;
      if ((p.action === 'attack' || p.action === 'heavy') && !p.hitDone && frac > 0.42) { p.hitDone = true; world.playerStrike(p.action === 'heavy' ? 34 : 18, p.action === 'heavy' ? 2.4 : 2.0); }
      if (p.actionT >= p.actionDur) p.action = null;
    }
    p.fighting = Math.max(0, p.fighting - dt); p.invuln = Math.max(0, p.invuln - dt);
    sword.visible = p.fighting > 0;
    stepBody(p, dt, colliders, 0.4);
    fig.root.rotation.y = p.yaw;
    // 动画
    let key, rate = 1;
    if (p.action) { key = p.action === 'heavy' ? 'attack' : p.action; const act = fig.play(key); act.paused = true; act.time = clamp(p.actionT / p.actionDur, 0, 0.999) * act.getClip().duration; }
    else {
      if (p.swimming) key = p.speed > 0.6 ? 'swim' : 'swimIdle';
      else if (!p.onGround) key = 'air';
      else if (p.speed < 0.3) key = p.fighting > 0 ? 'fight' : 'idle';
      else { const r = p.speed / JOG; key = r < 0.45 ? 'walk' : r < 1.25 ? 'jog' : 'sprint'; rate = key === 'walk' ? clamp(r / 0.35, 0.6, 1.3) : key === 'jog' ? clamp(r, 0.75, 1.25) : clamp(r / 1.7, 0.8, 1.2); }
      const act = fig.play(key, rate); act.paused = false;
    }
    fig.model.position.y = (p.swimming ? -0.3 : 0) + (fig.model.userData.foot ?? (fig.model.userData.foot = fig.model.position.y));
    fig.update(dt);
    // 掉水里太深、掉出地图
    if (p.pos.y < -20) { p.pos.set(-120, heightAt(-120, 40), 40); }
  }

  function damage(amount, from) {
    if (p.invuln > 0 || p.dead) return false;
    p.hp -= amount; p.invuln = 0.35; p.fighting = 5;
    if (from) { const dx = p.pos.x - from.x, dz = p.pos.z - from.z, d = Math.hypot(dx, dz) || 1; p.vel.x += dx / d * 4; p.vel.z += dz / d * 4; }
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.respawnT = 3; }
    return true;
  }
  function respawn(at) { p.dead = false; p.hp = p.maxHp; p.stamina = 100; p.pos.set(at.x, heightAt(at.x, at.z), at.z); p.vel.set(0, 0, 0); p.action = null; }
  function heal(n) { p.hp = Math.min(p.maxHp, p.hp + n); }

  return Object.assign(p, { update, damage, respawn, heal, startAction });
}
