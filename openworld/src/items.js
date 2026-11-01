/* 物品：地上的可捡物（七叶草、铜钱袋、菌子）、背包、茶舍买卖。
   捡物是小几何体加光圈，捡走后隔几分钟原地再长。 */
import * as T from 'three';
import { heightAt } from './world/terrain.js';
import { PLACES } from './world/layout.js';
import { mulberry32 } from './util/rng.js';
import { toon } from './toon.js';

export const ITEMS = {
  herb: { name: '七叶草', desc: '竹坞里的药草，茶博士收，五文一株。', sell: 5 },
  mushroom: { name: '松菌', desc: '松坡上的菌子，炖汤最好。', sell: 4 },
  medicine: { name: '伤药', desc: '金疮药一包，回血五十。', buy: 20, use: p => p.heal(50) },
  tea: { name: '茶', desc: '一碗松风茶，解乏，回血十。', buy: 3, use: p => { p.heal(10); p.stamina = 100; } },
  coinbag: { name: '铜钱袋', desc: '散落的钱袋。' },
};

export function createItems(scene, world) {
  const rnd = mulberry32(4242);
  const inv = {};
  const pickups = [];
  const herbGeo = new T.ConeGeometry(0.18, 0.5, 5), herbMat = toon({ color: 0x4e9a3c });
  const leafGeo = new T.PlaneGeometry(0.5, 0.5), leafMat = toon({ color: 0x7ac25a, side: T.DoubleSide });
  const bagGeo = new T.SphereGeometry(0.22, 8, 6), bagMat = toon({ color: 0x8a5a2b });
  const shroomGeo = new T.CylinderGeometry(0.22, 0.08, 0.24, 8), shroomMat = toon({ color: 0xc9a06a });
  const ringGeo = new T.RingGeometry(0.45, 0.6, 24).rotateX(-Math.PI / 2), ringMat = new T.MeshBasicMaterial({ color: 0xf4d35e, transparent: true, opacity: 0.8, depthWrite: false });

  function make(kind, x, z) {
    const g = new T.Group(), y = heightAt(x, z);
    if (kind === 'herb') { for (let i = 0; i < 3; i++) { const l = new T.Mesh(leafGeo, leafMat); l.rotation.set(-0.4, i * 2.1, 0); l.position.y = 0.3; g.add(l); } const s = new T.Mesh(herbGeo, herbMat); s.position.y = 0.25; g.add(s); }
    else if (kind === 'coinbag') { const b = new T.Mesh(bagGeo, bagMat); b.scale.y = 0.8; b.position.y = 0.2; g.add(b); }
    else { const m = new T.Mesh(shroomGeo, shroomMat); m.position.y = 0.15; g.add(m); }
    const ring = new T.Mesh(ringGeo, ringMat); ring.position.y = 0.05; g.add(ring);
    g.position.set(x, y, z); scene.add(g);
    const p = { kind, g, x, z, taken: false, respawn: 0, ring }; pickups.push(p); return p;
  }
  // 七叶草：竹坞 + 山神祠后
  for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = 6 + rnd() * 50; make('herb', PLACES.bamboo.x + Math.cos(a) * r, PLACES.bamboo.z + Math.sin(a) * r); }
  for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = 10 + rnd() * 30; make('herb', PLACES.shrine.x + Math.cos(a) * r, PLACES.shrine.z + Math.sin(a) * r); }
  for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = 20 + rnd() * 120; make('mushroom', PLACES.pines.x + Math.cos(a) * r, PLACES.pines.z + Math.sin(a) * r); }
  // 钱袋：寨子里和路边
  for (const id of ['camp1', 'camp2']) for (let i = 0; i < 3; i++) { const a = rnd() * 6.28, r = 2 + rnd() * 10; make('coinbag', PLACES[id].x + Math.cos(a) * r, PLACES[id].z + Math.sin(a) * r); }
  for (let i = 0; i < 10; i++) { make('coinbag', (rnd() - 0.5) * 900, (rnd() - 0.5) * 900); }

  function add(id, n = 1) { inv[id] = (inv[id] || 0) + n; }
  function take(id, n = 1) { inv[id] = Math.max(0, (inv[id] || 0) - n); if (!inv[id]) delete inv[id]; }
  const count = id => inv[id] || 0;

  function update(dt, player, t) {
    const pp = player.pos;
    for (const p of pickups) {
      if (p.taken) { p.respawn -= dt; if (p.respawn <= 0) { p.taken = false; p.g.visible = true; } continue; }
      const d = Math.hypot(pp.x - p.x, pp.z - p.z);
      p.g.visible = d < 120;
      if (d < 120) { p.ring.rotation.y = t * 0.8; p.ring.material.opacity = 0.5 + 0.3 * Math.sin(t * 3); }
      if (d < 1.4 && !player.dead) {
        p.taken = true; p.respawn = 300; p.g.visible = false;
        if (p.kind === 'coinbag') { const n = 5 + Math.floor(rnd() * 12); world.giveCoins(n); world.notify(`捡到铜钱袋 · ${n} 文`); }
        else { add(p.kind); world.notify(`采到 ${ITEMS[p.kind].name} · 共 ${count(p.kind)}`); world.quests.event('collect', p.kind); }
      }
    }
  }
  function use(id, player) { const it = ITEMS[id]; if (!it || !it.use || !count(id)) return false; it.use(player); take(id); world.notify(`用了 ${it.name}`); return true; }
  function buy(id, player) { const it = ITEMS[id]; if (!it.buy || player.coins < it.buy) { world.notify('铜钱不够。'); return false; } player.coins -= it.buy; add(id); world.notify(`买下 ${it.name} · 花 ${it.buy} 文`); return true; }
  function sell(id, player) { const it = ITEMS[id]; if (!it.sell || !count(id)) return false; take(id); player.coins += it.sell; world.notify(`卖出 ${it.name} · 得 ${it.sell} 文`); return true; }

  return { inv, pickups, add, take, count, update, use, buy, sell, serialize: () => ({ ...inv }), restore: d => { for (const k in inv) delete inv[k]; Object.assign(inv, d || {}); } };
}
