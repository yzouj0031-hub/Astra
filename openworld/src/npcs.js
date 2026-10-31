/* 村民：在村里几处之间溜达、站着歇、玩家走近就转过来说话。
   山贼：在寨子里巡逻，玩家进圈就追、近身就砍，有血条，死后掉铜钱、隔一阵复活。 */
import * as T from 'three';
import { makeFigure, stepBody } from './characters.js';
import { heightAt } from './world/terrain.js';
import { PLACES } from './world/layout.js';
import { mulberry32, clamp, lerp } from './util/rng.js';

const VILLAGERS = [
  { name: '渡头阿婆', variant: 1, home: [-118, 36], lines: ['后生，刚来渡头村吧？村口往东过桥就是东畈。', '夜里山上有狼嚎，听得人心慌。'], quest: 'herbs' },
  { name: '船夫老周', variant: 2, home: [PLACES.dock.x - 6, PLACES.dock.z - 2], lines: ['这船吃水浅，顺着溪往南划，能到松坡脚下。', '你要去对岸？走桥，或者自己划。'], quest: 'ferry' },
  { name: '里正', variant: 0, home: [-96, 30], lines: ['黑石寨那帮山贼又下来抢粮了，县里的兵一时半会到不了。', '烽台要是点起来，县城看见了才会派人。'], quest: 'bandits' },
  { name: '茶博士', variant: 2, home: [PLACES.teahouse.x + 3, PLACES.teahouse.z + 6.5], lines: ['一碗茶三文，伤药二十文，不二价。', '坐啊，听松风。'], shop: true },
  { name: '采药的阿满', variant: 3, home: [-168, -30], lines: ['竹坞里的七叶草最好，山神祠后头也有。', '一株换五文，去茶舍找茶博士，他收。'] },
  { name: '田头的顺子', variant: 2, home: [PLACES.paddies.x - 40, PLACES.paddies.z - 70], lines: ['今年水够，稻秧长得旺。', '昨儿见山贼在寨子那边操练，怕是要出事。'] },
  { name: '守祠的老道', variant: 0, home: [PLACES.shrine.x + 4, PLACES.shrine.z + 6], lines: ['山神祠香火断了三年，你若肯上一炷香，山神会记得。', '枫叶红了，秋就深了。'], quest: 'pray' },
  { name: '小石头', variant: 3, home: [-140, 60], lines: ['我爹说烽台上能看见整条溪！', '你有刀！你是侠客吗？'] },
  { name: '浣衣的秀姑', variant: 1, home: [-78, 86], lines: ['溪水凉，衣裳洗得干净。', '桥头那棵柳是我阿公种的。'] },
];

export function createNPCs(scene, assets, colliders, world) {
  const rnd = mulberry32(99);
  const list = [], bandits = [];
  const _d = new T.Vector3();

  // ---- 村民 ----
  for (const def of VILLAGERS) {
    const fig = makeFigure(assets.crowd[def.variant], assets.player.animations, 1.68 + rnd() * 0.16);
    const [hx, hz] = def.home;
    fig.root.position.set(hx, heightAt(hx, hz), hz); scene.add(fig.root);
    const n = { def, fig, pos: fig.root.position, vel: new T.Vector3(), yaw: rnd() * 6.28, home: { x: hx, z: hz }, goal: null, wait: rnd() * 4, onGround: true, kind: 'villager', talkT: 0 };
    list.push(n);
    colliders.add({ x: hx, z: hz, r: 0.35, npc: n });
  }
  // ---- 山贼 ----
  const campDefs = [['camp1', 5], ['camp2', 4]];
  for (const [id, count] of campDefs) {
    const c = PLACES[id];
    for (let i = 0; i < count; i++) {
      const a = rnd() * 6.28, r = 3 + rnd() * 8, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const fig = makeFigure(assets.crowd[i % 2 === 0 ? 2 : 0], assets.player.animations, 1.8 + rnd() * 0.1, 0x8a6a5a);
      fig.root.position.set(x, heightAt(x, z), z); scene.add(fig.root);
      // 刀
      const blade = new T.Mesh(new T.BoxGeometry(0.04, 0.7, 0.015), new T.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.4 })); blade.position.y = 0.4;
      if (fig.hand) { fig.hand.add(blade); blade.scale.setScalar(1 / fig.model.scale.x); blade.rotation.set(Math.PI / 2, 0, 0); }
      const b = { fig, pos: fig.root.position, vel: new T.Vector3(), yaw: a, camp: c, campId: id, hp: 60, maxHp: 60, state: 'patrol', goal: null, wait: rnd() * 3, atkT: 0, hitDone: false, onGround: true, kind: 'bandit', dead: false, respawnT: 0, bar: makeBar() };
      b.bar.position.y = 2.1; fig.root.add(b.bar);
      bandits.push(b);
    }
  }

  function makeBar() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.1, 0.14, 1); s.userData.canvas = c; s.userData.tex = t; s.visible = false; return s;
  }
  function drawBar(b) {
    const c = b.bar.userData.canvas, ctx = c.getContext('2d'); ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(20,20,20,0.7)'; ctx.fillRect(0, 0, 128, 16); ctx.fillStyle = '#c0392b'; ctx.fillRect(2, 2, 124 * (b.hp / b.maxHp), 12); b.bar.userData.tex.needsUpdate = true;
  }

  function steer(n, dt, speed, turn = 8) {
    if (!n.goal) return 0;
    const dx = n.goal.x - n.pos.x, dz = n.goal.z - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { n.goal = null; n.vel.x = n.vel.z = 0; return 0; }
    const want = Math.atan2(dx, dz); let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * (1 - Math.exp(-dt * turn));
    n.vel.x = Math.sin(n.yaw) * speed; n.vel.z = Math.cos(n.yaw) * speed;
    return speed;
  }

  function update(dt, player) {
    const pp = player.pos;
    // 村民
    for (const n of list) {
      const dist = Math.hypot(pp.x - n.pos.x, pp.z - n.pos.z);
      if (dist > 180) { n.fig.root.visible = false; continue; } n.fig.root.visible = true;
      const near = dist < 3.2;
      let sp = 0;
      if (near) { n.goal = null; const want = Math.atan2(pp.x - n.pos.x, pp.z - n.pos.z); let dy = want - n.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); n.yaw += dy * (1 - Math.exp(-dt * 6)); n.vel.set(0, 0, 0); }
      else if (n.def.shop) { n.vel.set(0, 0, 0); }
      else if (n.goal) sp = steer(n, dt, 1.3);
      else { n.wait -= dt; if (n.wait <= 0) { const a = rnd() * 6.28, r = 2 + rnd() * 9; n.goal = { x: n.home.x + Math.cos(a) * r, z: n.home.z + Math.sin(a) * r }; n.wait = 3 + rnd() * 7; } }
      stepBody(n, dt, { resolve: (p, r) => colliders.resolve(p, r) }, 0.3, { canSwim: false });
      n.fig.root.rotation.y = n.yaw;
      if (dist < 90) { n.fig.play(sp > 0.1 ? 'walk' : n.talkT > 0 ? 'interact' : 'idle', sp > 0.1 ? clamp(sp / 1.4, 0.7, 1.3) : 1); n.fig.update(dt); }
      n.talkT = Math.max(0, n.talkT - dt);
      // 自己那个碰撞体跟着走
      const col = colliders.list.find(c => c.npc === n); if (col) { col.x = n.pos.x; col.z = n.pos.z; }
    }
    // 山贼
    for (const b of bandits) {
      if (b.dead) { b.respawnT -= dt; b.fig.root.visible = b.respawnT > 0 && false; if (b.respawnT <= 0) { b.dead = false; b.hp = b.maxHp; b.fig.root.visible = true; const a = rnd() * 6.28; b.pos.set(b.camp.x + Math.cos(a) * 6, 0, b.camp.z + Math.sin(a) * 6); b.pos.y = heightAt(b.pos.x, b.pos.z); b.state = 'patrol'; } continue; }
      const dist = Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z);
      if (dist > 220) { b.fig.root.visible = false; continue; } b.fig.root.visible = true;
      const toCamp = Math.hypot(b.camp.x - b.pos.x, b.camp.z - b.pos.z);
      let sp = 0, key = 'idle';
      if (b.state === 'patrol') {
        if (dist < 22 && !player.dead) b.state = 'chase';
        else if (b.goal) sp = steer(b, dt, 1.4); else { b.wait -= dt; if (b.wait <= 0) { const a = rnd() * 6.28, r = 2 + rnd() * 10; b.goal = { x: b.camp.x + Math.cos(a) * r, z: b.camp.z + Math.sin(a) * r }; b.wait = 2 + rnd() * 5; } }
        key = sp > 0.1 ? 'walk' : 'idle';
      } else if (b.state === 'chase') {
        if (dist > 60 || toCamp > 90 || player.dead) { b.state = 'patrol'; b.goal = { x: b.camp.x, z: b.camp.z }; }
        else if (dist < 1.7) { b.state = 'attack'; b.atkT = 0; b.hitDone = false; b.vel.set(0, 0, 0); }
        else { b.goal = { x: pp.x, z: pp.z }; sp = steer(b, dt, 4.2, 10); key = 'jog'; }
        if (b.state === 'chase' && sp < 0.1) key = 'fight';
      } else if (b.state === 'attack') {
        b.atkT += dt; const dur = 0.8;
        const want = Math.atan2(pp.x - b.pos.x, pp.z - b.pos.z); let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * (1 - Math.exp(-dt * 5));
        if (!b.hitDone && b.atkT > 0.45 * dur) { b.hitDone = true; if (dist < 2.3 && Math.abs(dy) < 1.0) { if (player.damage(12, b.pos)) world.onPlayerHit(b); } }
        if (b.atkT >= dur + 0.5) b.state = 'chase';
        key = 'attack';
      }
      stepBody(b, dt, { resolve: (p, r) => colliders.resolve(p, r) }, 0.35, { canSwim: false });
      b.fig.root.rotation.y = b.yaw;
      if (dist < 120) {
        const act = b.fig.play(key, key === 'walk' ? 1 : key === 'jog' ? 1.1 : 1);
        if (key === 'attack') { act.paused = true; act.time = clamp(b.atkT / 0.8, 0, 0.999) * act.getClip().duration; } else act.paused = false;
        b.fig.update(dt);
      }
      b.bar.visible = b.hp < b.maxHp && dist < 40;
    }
  }

  /** 玩家挥刀：扇形范围内的山贼掉血。 */
  function strike(player, dmg, range) {
    const pp = player.pos, h = player.heading; let hit = 0;
    for (const b of bandits) {
      if (b.dead) continue;
      _d.set(b.pos.x - pp.x, 0, b.pos.z - pp.z); const d = _d.length(); if (d > range) continue;
      _d.normalize(); if (_d.dot(h) < 0.35) continue;
      b.hp -= dmg; hit++; drawBar(b);
      b.vel.x += _d.x * 5; b.vel.z += _d.z * 5;
      if (b.state === 'patrol') b.state = 'chase';
      if (b.hp <= 0) { b.dead = true; b.respawnT = 90; b.fig.root.visible = false; b.bar.visible = false; world.onBanditKilled(b); }
      else world.onBanditHit(b);
    }
    return hit;
  }

  function nearestVillager(pos, r = 2.6) {
    let best = null, bd = r;
    for (const n of list) { const d = Math.hypot(pos.x - n.pos.x, pos.z - n.pos.z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function byName(name) { return list.find(n => n.def.name === name); }

  return { list, bandits, update, strike, nearestVillager, byName };
}
