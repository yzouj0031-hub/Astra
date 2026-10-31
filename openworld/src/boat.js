/* 乌篷船：在埠头按 E 登船，W/S 划、A/D 转向，靠岸按 E 下船。船模型是 Astra 自建的 wupeng.glb。 */
import * as T from 'three';
import { heightAt } from './world/terrain.js';
import { WORLD, PLACES } from './world/layout.js';
import { clamp, lerp } from './util/rng.js';

export function createBoat(scene, assets, world) {
  const g = assets.boat.clone(true);
  const box = new T.Box3().setFromObject(g), len = box.max.z - box.min.z, k = 5.2 / Math.max(len, box.max.x - box.min.x);
  g.scale.setScalar(k); g.position.y -= box.min.y * k;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const root = new T.Group(); root.add(g); scene.add(root);
  const home = { x: PLACES.dock.x + 2.6, z: PLACES.dock.z + 1 };
  const b = { root, pos: root.position, yaw: Math.PI / 2, speed: 0, turn: 0, riding: false, rowT: 0, start: null, maxDist: 0 };
  b.pos.set(home.x, WORLD.water, home.z); root.rotation.y = b.yaw;

  function update(dt, input, player) {
    if (b.riding) {
      const fwd = input.move.y, side = input.move.x;
      b.speed = lerp(b.speed, fwd * 4.2, 1 - Math.exp(-dt * 1.6));
      b.turn = lerp(b.turn, -side * 0.9, 1 - Math.exp(-dt * 3));
      b.yaw += b.turn * dt * clamp(Math.abs(b.speed) / 2 + 0.3, 0.3, 1);
      const nx = b.pos.x + Math.sin(b.yaw) * b.speed * dt, nz = b.pos.z + Math.cos(b.yaw) * b.speed * dt;
      // 只在够深的水里走
      if (heightAt(nx, nz) < WORLD.water - 0.6) { b.pos.x = nx; b.pos.z = nz; } else b.speed *= 0.3;
      b.rowT += dt * Math.abs(b.speed);
      root.rotation.y = b.yaw; root.rotation.z = Math.sin(b.rowT * 1.4) * 0.02; root.rotation.x = Math.sin(performance.now() / 900) * 0.012;
      b.pos.y = WORLD.water + 0.02 + Math.sin(performance.now() / 700) * 0.03;
      player.pos.set(b.pos.x - Math.sin(b.yaw) * 0.6, b.pos.y + 0.55, b.pos.z - Math.cos(b.yaw) * 0.6); player.yaw = b.yaw;
      player.fig.root.rotation.y = b.yaw; player.fig.play('sit'); player.fig.update(dt);
      const d = Math.hypot(b.pos.x - b.start.x, b.pos.z - b.start.z); if (d > b.maxDist) { b.maxDist = d; world.quests.event('boat', d); }
    } else {
      b.pos.y = WORLD.water + 0.02 + Math.sin(performance.now() / 700) * 0.03;
      root.rotation.x = Math.sin(performance.now() / 900) * 0.012;
    }
  }
  function canBoard(player) { return !b.riding && Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z) < 4.5; }
  function canLand() {
    if (!b.riding) return null;
    for (let a = 0; a < 6.28; a += 0.5) { const x = b.pos.x + Math.cos(a) * 4, z = b.pos.z + Math.sin(a) * 4; const y = heightAt(x, z); if (y > WORLD.water + 0.1 && y < WORLD.water + 2.5) return { x, z }; }
    return null;
  }
  function board(player) { b.riding = true; b.start = { x: b.pos.x, z: b.pos.z }; b.maxDist = 0; b.speed = 0; player.fighting = 0; player.action = null; world.notify('登船 · W/S 划 A/D 转向，靠岸按 E 下船'); }
  function land(player, spot) { b.riding = false; player.pos.set(spot.x, heightAt(spot.x, spot.z), spot.z); player.vel.set(0, 0, 0); }
  return Object.assign(b, { update, canBoard, canLand, board, land });
}
