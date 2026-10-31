/* 第三人称跟随相机：绕角色的 yaw/pitch 球面，遇地形抬高，弹簧平滑。 */
import * as T from 'three';
import { heightAt } from './world/terrain.js';
import { clamp, lerp } from './util/rng.js';

export function createCamera(aspect) {
  const cam = new T.PerspectiveCamera(55, aspect, 0.3, 1600);
  const s = { yaw: Math.PI, pitch: 0.28, dist: 6.5, target: new T.Vector3(), pos: new T.Vector3(), first: false };
  const want = new T.Vector3(), off = new T.Vector3();
  function update(dt, anchor, input) {
    s.yaw -= input.look.dx * 0.0045; s.pitch = clamp(s.pitch + input.look.dy * 0.0035, -0.35, 1.2);
    if (input.zoom) s.dist = clamp(s.dist + input.zoom * 0.8, 2.6, 16);
    s.target.lerp(anchor, 1 - Math.exp(-dt * 12));
    s.target.y = lerp(s.target.y, anchor.y, 1 - Math.exp(-dt * 8));
    const d = s.dist;
    off.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch)).multiplyScalar(d);
    want.copy(s.target).add(off);
    // 不钻进地里
    const ground = heightAt(want.x, want.z) + 0.6;
    if (want.y < ground) want.y = ground;
    s.pos.lerp(want, 1 - Math.exp(-dt * 14));
    cam.position.copy(s.pos);
    cam.lookAt(s.target.x, s.target.y + 0.2, s.target.z);
  }
  return { cam, s, update };
}
