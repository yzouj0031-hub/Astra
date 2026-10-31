/* 入口：加载资源 → 建世界 → 主循环。所有系统在这里接线。 */
import * as T from 'three';
import { loadAll } from './assets.js';
import { WORLD, PLACES } from './world/layout.js';
import { buildTerrain, buildWater, heightAt } from './world/terrain.js';
import { plantWorld, createGrass, cullFoliage, bakeImpostors, IMPOSTOR_LIGHT, LOD, WIND } from './world/foliage.js';
import { buildWorld } from './world/buildings.js';
import { createSky } from './world/sky.js';
import { createInput } from './input.js';
import { createCamera } from './camera.js';
import { createColliders } from './characters.js';
import { createPlayer } from './player.js';
import { createNPCs } from './npcs.js';
import { createQuests } from './quests.js';
import { createItems } from './items.js';
import { createHUD } from './hud.js';
import { createBoat } from './boat.js';
import { lerp, clamp } from './util/rng.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'yunshui-save-v1';
const params = new URLSearchParams(location.search);
const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
const low = params.get('low') === '1' || mobile;

async function boot() {
  const ldFill = $('ld-fill'), ldText = $('ld-text');
  const progress = (f, label) => { ldFill.style.width = Math.round(f * 100) + '%'; ldText.textContent = label; };
  let assets;
  try { assets = await loadAll(progress); }
  catch (e) { console.error(e); $('ld-err').textContent = String(e.message || e); $('ld-err').classList.remove('hide'); ldText.textContent = '资源没有加载成功'; return; }
  progress(1, '铺地、种树、盖房子…');
  await new Promise(r => setTimeout(r, 30));

  const canvas = $('view');
  const renderer = new T.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = T.SRGBColorSpace;

  const scene = new T.Scene();
  const sky = createSky(scene, renderer); if (low) sky.sun.shadow.mapSize.set(1024, 1024);
  const terrain = buildTerrain({ segments: low ? 200 : 300 }); scene.add(terrain);
  const water = buildWater(); scene.add(water);
  const colliders = createColliders();
  const world = {
    scene, assets, colliders, heightAt, paused: false, hurtFlash: 0, stats: { kills: 0, walked: 0, tris: 0, fps: 0, calls: 0 }, visited: new Set(), beaconLit: false,
    notify: t => hud.toast(t), giveCoins: n => { player.coins += n; }, countItem: id => items.count(id), takeItem: (id, n) => items.take(id, n),
    onEnterPlace: pl => { if (!world.visited.has(pl.id)) { world.visited.add(pl.id); hud.toast(`发现 · ${pl.name}`); } },
    onPlayerHit: () => { world.hurtFlash = 0.6; }, onBanditHit: () => {}, onBanditKilled: b => { world.stats.kills++; world.giveCoins(4 + Math.floor(Math.random() * 6)); quests.event('kill', b.campId); },
    playerStrike: (dmg, range) => { npcs.strike(player, dmg, range); },
  };
  const built = buildWorld(scene); colliders.addMany(built.colliders);
  LOD.value = low ? 120 : 190;
  const treeNames = Object.keys(assets.trees.parts).filter(n => /^(NormalTree|MapleTree|BirchTree|PineTree)_/.test(n));
  const atlas = bakeImpostors(renderer, assets, treeNames);
  const planted = plantWorld(scene, assets, { density: low ? 0.55 : 1, impostor: atlas }); colliders.addMany(planted.colliders);
  const grass = createGrass(scene, { range: low ? 4 : 6, perCell: low ? 26 : 44 });
  const player = createPlayer(scene, assets, colliders); world.player = player;
  const npcs = createNPCs(scene, assets, colliders, world); world.npcs = npcs;
  const quests = createQuests(world); world.quests = quests;
  const items = createItems(scene, world); world.items = items;
  const boat = createBoat(scene, assets, world); world.boat = boat;
  const hud = createHUD(world); world.hud = hud; world.sky = sky;
  const { cam, s: camS, update: camUpdate } = createCamera(innerWidth / innerHeight);
  const fitFov = () => { cam.fov = innerWidth < innerHeight ? 72 : 55; cam.updateProjectionMatrix(); }; fitFov(); if (innerWidth < innerHeight) { camS.pitch = 0.16; camS.dist = 7.5; }
  if (navigator.maxTouchPoints > 0 && mobile) document.body.classList.add('touch');
  const input = createInput(canvas, { stick: $('stick'), knob: $('knob'), touchLayer: $('touch'), btnSprint: $('b-sprint'), btnJump: $('b-jump'), btnAttack: $('b-attack'), btnInteract: $('b-interact'), btnDodge: $('b-dodge') });
  // 灯笼里的点光：只给离玩家最近的几盏
  const lanternLights = []; for (let i = 0; i < (low ? 3 : 6); i++) { const l = new T.PointLight(0xff9a4a, 0, 20, 1.6); scene.add(l); lanternLights.push(l); }

  // ---- 存档 ----
  const spawn = { x: -70, z: 56 };
  function save() {
    const d = { pos: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw, hour: sky.state.hour, day: sky.state.day, hp: player.hp, maxHp: player.maxHp, coins: player.coins,
      inv: items.serialize(), quests: quests.serialize(), visited: [...world.visited], beacon: world.beaconLit, stats: world.stats };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch {}
  }
  function load() {
    let d = null; try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch {}
    if (!d) { player.pos.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z); return false; }
    player.pos.set(d.pos[0], d.pos[1], d.pos[2]); player.yaw = d.yaw || Math.PI; sky.state.hour = d.hour ?? 9.5; sky.state.day = d.day || 1;
    player.hp = d.hp ?? 100; player.maxHp = d.maxHp || 100; player.coins = d.coins || 0; items.restore(d.inv); quests.restore(d.quests);
    (d.visited || []).forEach(v => world.visited.add(v)); world.beaconLit = !!d.beacon; Object.assign(world.stats, d.stats || {});
    if (world.beaconLit) lightBeacon(false);
    return true;
  }
  function reset() { try { localStorage.removeItem(SAVE_KEY); } catch {} location.reload(); }
  world.save = save; world.reset = reset;
  function lightBeacon(announce = true) { world.beaconLit = true; const f = built.beacon.userData.fire; f.light.intensity = 400; f.flame.visible = true; if (announce) hud.toast('烽火燃起，整条溪谷都看得见。'); }

  const hadSave = load();
  if (params.get('t')) sky.state.hour = parseFloat(params.get('t'));
  if (params.get('at')) { const [x, z] = params.get('at').split(',').map(Number); player.pos.set(x, heightAt(x, z), z); }
  if (params.get('yaw')) player.yaw = parseFloat(params.get('yaw'));
  if (params.get('cam')) { const [yaw, pitch, dist] = params.get('cam').split(',').map(Number); camS.yaw = yaw; camS.pitch = pitch; camS.dist = dist; }
  camS.target.copy(player.pos); camS.yaw = player.yaw + Math.PI; camS.pos.copy(player.pos).add(new T.Vector3(Math.sin(camS.yaw) * 6, 2.5, Math.cos(camS.yaw) * 6));

  // ---- 互动 ----
  function interactables() {
    const out = [];
    const v = npcs.nearestVillager(player.pos, 2.8); if (v) out.push({ label: `和${v.def.name}说话`, run: () => { v.talkT = 2; const r = quests.talk(v); if (v.def.shop) r.actions = [{ label: '买卖', run: () => hud.show('shop') }, { label: '告辞', run: () => {} }]; hud.dialog(r); } });
    for (const it of built.interact) {
      if (Math.hypot(player.pos.x - it.x, player.pos.z - it.z) > it.r) continue;
      if (it.kind === 'shop') out.push({ label: it.label, run: () => hud.show('shop') });
      else if (it.kind === 'pray') out.push({ label: it.label, run: () => { player.startAction('interact'); quests.event('interact', 'shrine'); hud.toast('上了一炷香。'); } });
      else if (it.kind === 'beacon') { if (!world.beaconLit) out.push({ label: it.label, run: () => { player.startAction('interact'); lightBeacon(); quests.event('interact', 'beacon'); } }); }
    }
    if (boat.canBoard(player)) out.push({ label: '登船 · 划乌篷', run: () => boat.board(player) });
    return out;
  }

  // ---- 主循环 ----
  $('loading').classList.add('hide'); $('hud').classList.remove('hide');
  if (!hadSave) setTimeout(() => hud.dialog({ name: '云水行', text: '溪山一程。村里的人都有话说，按 E 和他们聊；追着左上角的任务走，山上有烽台，寨子里有山贼。', actions: [{ label: '入山', run: () => {} }] }), 400);
  const clock = new T.Clock(); let t = 0, saveT = 0, fpsN = 0, fpsT = 0, lastPos = player.pos.clone();
  const _focus = new T.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05); t += dt;
    input.poll();
    // 面板开关
    if (input.map) hud.toggle('map'); if (input.bag) hud.toggle('bag'); if (input.quests) hud.toggle('quest');
    if (input.pause) { if (hud.open) hud.show(null); else if (!hud.els.dialog.classList.contains('hide')) { hud.els.dialog.classList.add('hide'); world.paused = false; } else hud.show('pause'); }
    if (input.time) { sky.state.hour += 1; }
    WIND.value += dt * 1.2;
    const focus = _focus.copy(player.pos);
    sky.update(world.paused ? 0 : dt, focus);
    if (!world.paused) {
      if (boat.riding) {
        boat.update(dt, input.st, player);
        const spot = boat.canLand(); hud.prompt(spot ? '靠岸 · 下船' : null);
        if (input.interact && spot) boat.land(player, spot);
      } else {
        player.update(dt, input.st, { s: camS }, world);
        boat.update(dt, input.st, player);
        const acts = interactables(); hud.prompt(acts.length ? acts[0].label : null);
        if (input.interact && acts.length && !player.action) acts[0].run();
        if (player.dead && player.respawnT <= 0) { player.respawn(spawn); hud.toast('在村口醒来。身上的铜钱少了一些。'); player.coins = Math.floor(player.coins * 0.8); }
      }
      npcs.update(dt, player); items.update(dt, player, t);
      world.stats.walked += Math.hypot(player.pos.x - lastPos.x, player.pos.z - lastPos.z); lastPos.copy(player.pos);
      saveT += dt; if (saveT > 15) { saveT = 0; save(); }
    }
    camUpdate(dt, focus.clone().add(new T.Vector3(0, 1.45, 0)), input.st);
    grass.update(player.pos.x, player.pos.z); cullFoliage(player.pos.x, player.pos.z);
    // 夜里：灯笼、窗纸、寨火
    const night = sky.state.night;
    built.windowMat.emissiveIntensity = night * 1.4;
    for (const f of built.fires) { if (f === built.beacon.userData.fire) continue; f.light.intensity = 40 + Math.sin(t * 9) * 8 + Math.sin(t * 23) * 4; f.flame.scale.y = 0.9 + Math.sin(t * 11) * 0.12; }
    if (world.beaconLit) { built.beacon.userData.fire.light.intensity = 400 + Math.sin(t * 7) * 60; }
    const near = built.lanterns.map(l => { l.getWorldPosition(_tmp); return { l, d: _tmp.distanceToSquared(player.pos), x: _tmp.x, y: _tmp.y, z: _tmp.z }; }).sort((a, b) => a.d - b.d);
    lanternLights.forEach((pl, i) => { const n = near[i]; if (!n) { pl.intensity = 0; return; } pl.position.set(n.x, n.y - 0.2, n.z); pl.intensity = night * 45; });
    built.lanternMat.emissiveIntensity = 0.2 + night * 1.8;
    water.material.uniforms.uTime.value = t; water.material.uniforms.uSun.value.copy(sky.state.sunDir); water.material.uniforms.uFogColor.value.copy(scene.fog.color); water.material.uniforms.uFogNear.value = scene.fog.near; water.material.uniforms.uFogFar.value = scene.fog.far;
    water.material.uniforms.uSky.value.copy(sky.uniforms.uHorizon.value);
    IMPOSTOR_LIGHT.sun.copy(sky.state.sunDir); IMPOSTOR_LIGHT.sunColor.copy(sky.sun.color).multiplyScalar(sky.sun.intensity / 2.4); IMPOSTOR_LIGHT.ambient.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.55);
    world.hurtFlash = Math.max(0, world.hurtFlash - dt * 1.5);
    hud.update(dt, player, cam, sky, quests.current());
    renderer.render(scene, cam);
    fpsN++; fpsT += dt; if (fpsT > 1) { world.stats.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; world.stats.tris = renderer.info.render.triangles; world.stats.calls = renderer.info.render.calls; }
    input.endFrame();
  }
  const _tmp = new T.Vector3();
  window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; fitFov(); });
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.__game = { world, player, sky, renderer, scene, cam, camS, quests, npcs, built, planted };
  frame();
}

boot().catch(e => { console.error(e); $('ld-err').textContent = String(e.stack || e); $('ld-err').classList.remove('hide'); });
