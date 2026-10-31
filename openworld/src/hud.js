/* HUD：小地图、时辰、血气、任务追踪、路标、提示、对话框、面板。只读游戏状态，不改它。 */
import * as T from 'three';
import { WORLD, PLACES, placeAt } from './world/layout.js';
import { paintMap } from './world/terrain.js';
import { ITEMS } from './items.js';

const $ = id => document.getElementById(id);

export function createHUD(world) {
  const els = {
    hud: $('hud'), minimap: $('minimap'), place: $('place'), clock: $('clock'), coins: $('coin-n'),
    hpFill: $('hp-fill'), hpT: $('hp-t'), stFill: $('st-fill'), stT: $('st-t'), trName: $('tr-name'), trDesc: $('tr-desc'),
    wp: $('wp'), wpD: $('wp-d'), prompt: $('prompt'), promptT: $('prompt-t'), toasts: $('toasts'), dmg: $('dmg'),
    dialog: $('dialog'), dgName: $('dg-name'), dgQuest: $('dg-quest'), dgText: $('dg-text'), dgActs: $('dg-acts'), dead: $('dead'),
  };
  const mapImg = paintMap(512);
  const mm = els.minimap.getContext('2d');
  let lastPlace = null;
  const _v = new T.Vector3();

  function toast(text) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; els.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
  }

  function drawMinimap(p, camYaw, target) {
    const W = 236, R = 92;   // 米：半径 92 米
    mm.save(); mm.clearRect(0, 0, W, W);
    mm.beginPath(); mm.arc(W / 2, W / 2, W / 2 - 2, 0, 6.28); mm.clip();
    const scale = (W / 2) / R;   // px / m
    const sx = 512 / WORLD.size;
    // 地图：以玩家为中心、北朝上
    mm.translate(W / 2, W / 2); mm.scale(scale / sx, scale / sx);
    mm.drawImage(mapImg, -(p.pos.x + WORLD.half) * sx, -(p.pos.z + WORLD.half) * sx);
    mm.restore();
    mm.save(); mm.translate(W / 2, W / 2);
    // 任务点
    if (target) {
      let dx = (target.x - p.pos.x) * scale, dz = (target.z - p.pos.z) * scale; const d = Math.hypot(dx, dz), lim = W / 2 - 12;
      if (d > lim) { dx *= lim / d; dz *= lim / d; }
      mm.save(); mm.translate(dx, dz); mm.rotate(Math.PI / 4); mm.fillStyle = '#b2382c'; mm.fillRect(-6, -6, 12, 12); mm.strokeStyle = '#fff3dc'; mm.lineWidth = 2; mm.strokeRect(-6, -6, 12, 12); mm.restore();
    }
    // 山贼红点
    for (const b of world.npcs.bandits) { if (b.dead) continue; const dx = (b.pos.x - p.pos.x) * scale, dz = (b.pos.z - p.pos.z) * scale; if (Math.hypot(dx, dz) < W / 2 - 6) { mm.fillStyle = '#d33'; mm.beginPath(); mm.arc(dx, dz, 3, 0, 6.28); mm.fill(); } }
    for (const n of world.npcs.list) { const dx = (n.pos.x - p.pos.x) * scale, dz = (n.pos.z - p.pos.z) * scale; if (Math.hypot(dx, dz) < W / 2 - 6) { mm.fillStyle = '#f3e7cc'; mm.beginPath(); mm.arc(dx, dz, 2.5, 0, 6.28); mm.fill(); } }
    // 玩家箭头：按面朝方向
    mm.rotate(-p.yaw + Math.PI); mm.fillStyle = '#b2382c'; mm.strokeStyle = '#fff3dc'; mm.lineWidth = 2;
    mm.beginPath(); mm.moveTo(0, -11); mm.lineTo(8, 8); mm.lineTo(0, 4); mm.lineTo(-8, 8); mm.closePath(); mm.fill(); mm.stroke();
    mm.restore();
  }

  function update(dt, p, cam, sky, questCur) {
    // 地名 / 时辰 / 钱
    const pl = placeAt(p.pos.x, p.pos.z);
    if (pl.id !== lastPlace) { lastPlace = pl.id; els.place.textContent = pl.name; if (pl.r) world.onEnterPlace(pl); }
    els.clock.textContent = sky.label();
    els.coins.textContent = p.coins;
    els.hpFill.style.width = (p.hp / p.maxHp * 100) + '%'; els.hpT.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    els.stFill.style.width = p.stamina + '%'; els.stT.textContent = '';
    // 任务追踪 + 路标
    let target = null;
    if (questCur) {
      els.trName.textContent = questCur.q.name; els.trDesc.textContent = `${world.quests.progressText(questCur.q)} · ${Math.round(Math.hypot(questCur.step.at[0] - p.pos.x, questCur.step.at[1] - p.pos.z))} 米`;
      target = { x: questCur.step.at[0], z: questCur.step.at[1] };
    } else { els.trName.textContent = ''; els.trDesc.textContent = ''; }
    if (target) {
      _v.set(target.x, world.heightAt(target.x, target.z) + 2.5, target.z).project(cam);
      const behind = _v.z > 1; let x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - 40; }
      x = Math.max(24, Math.min(innerWidth - 24, x)); y = Math.max(90, Math.min(innerHeight - 40, y));
      els.wp.style.left = x + 'px'; els.wp.style.top = y + 'px'; els.wpD.textContent = Math.round(Math.hypot(target.x - p.pos.x, target.z - p.pos.z)) + ' 米';
      els.wp.classList.remove('hide');
    } else els.wp.classList.add('hide');
    drawMinimap(p, cam.rotation.y, target);
    els.dmg.style.opacity = p.hp < 30 ? 0.5 + 0.3 * Math.sin(performance.now() / 300) : world.hurtFlash > 0 ? world.hurtFlash : 0;
    els.dead.classList.toggle('hide', !p.dead);
  }

  function prompt(text) { if (!text) { els.prompt.classList.add('hide'); return; } els.promptT.textContent = text; els.prompt.classList.remove('hide'); }

  function dialog({ name, text, quest, actions }) {
    els.dgName.textContent = name; els.dgQuest.textContent = quest ? `· 任务「${quest}」` : ''; els.dgText.textContent = text;
    els.dgActs.innerHTML = '';
    for (const a of actions || [{ label: '好', run: () => {} }]) { const b = document.createElement('button'); b.textContent = a.label; b.onclick = () => { els.dialog.classList.add('hide'); world.paused = false; a.run(); }; els.dgActs.appendChild(b); }
    els.dialog.classList.remove('hide'); world.paused = true;
  }

  /* ---- 面板 ---- */
  const panels = { map: $('p-map'), bag: $('p-bag'), quest: $('p-quest'), shop: $('p-shop'), pause: $('p-pause') };
  let open = null;
  function show(id) {
    if (open) panels[open].classList.add('hide');
    open = id; world.paused = !!id;
    if (!id) return;
    panels[id].classList.remove('hide');
    if (id === 'map') drawBigMap(); if (id === 'bag') fillBag(); if (id === 'quest') fillQuests(); if (id === 'shop') fillShop(); if (id === 'pause') fillPause();
  }
  const toggle = id => show(open === id ? null : id);
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => show(null));
  $('s-map').onclick = () => toggle('map'); $('s-bag').onclick = () => toggle('bag'); $('s-quest').onclick = () => toggle('quest'); $('s-pause').onclick = () => toggle('pause');

  function drawBigMap() {
    const c = $('bigmap'), ctx = c.getContext('2d'), S = c.width, k = S / WORLD.size, p = world.player;
    ctx.drawImage(mapImg, 0, 0, S, S);
    ctx.font = '15px "Ma Shan Zheng","STKaiti",serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#22231f'; ctx.strokeStyle = 'rgba(242,233,211,.9)'; ctx.lineWidth = 3;
    for (const pl of Object.values(PLACES)) { if (!pl.r && !['beacon', 'camp1', 'camp2', 'teahouse', 'dock', 'bridge'].includes(pl.id)) continue; const x = (pl.x + WORLD.half) * k, y = (pl.z + WORLD.half) * k; ctx.strokeText(pl.name, x, y - 6); ctx.fillText(pl.name, x, y - 6); ctx.fillStyle = '#b2382c'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill(); ctx.fillStyle = '#22231f'; }
    for (const q of world.quests.QUESTS) { const s = world.quests.state[q.id]; if (s.status !== 'active') continue; const st = q.steps[s.step], x = (st.at[0] + WORLD.half) * k, y = (st.at[1] + WORLD.half) * k; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = world.quests.tracked === q.id ? '#b2382c' : '#c9a24c'; ctx.fillRect(-6, -6, 12, 12); ctx.strokeStyle = '#fff3dc'; ctx.lineWidth = 2; ctx.strokeRect(-6, -6, 12, 12); ctx.restore(); ctx.fillStyle = '#b2382c'; ctx.font = '13px "Noto Serif SC",serif'; ctx.fillText(q.name, x, y + 22); ctx.font = '15px "Ma Shan Zheng","STKaiti",serif'; ctx.fillStyle = '#22231f'; }
    const px = (p.pos.x + WORLD.half) * k, py = (p.pos.z + WORLD.half) * k; ctx.save(); ctx.translate(px, py); ctx.rotate(-p.yaw + Math.PI); ctx.fillStyle = '#b2382c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 4); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  $('bigmap').onclick = e => {
    const r = e.target.getBoundingClientRect(), k = WORLD.size / r.width, x = (e.clientX - r.left) * k - WORLD.half, z = (e.clientY - r.top) * k - WORLD.half;
    for (const q of world.quests.QUESTS) { const s = world.quests.state[q.id]; if (s.status !== 'active') continue; const st = q.steps[s.step]; if (Math.hypot(st.at[0] - x, st.at[1] - z) < 40) { world.quests.tracked = q.id; drawBigMap(); toast(`追踪：${q.name}`); } }
  };
  function fillBag() {
    const l = $('bag-list'); l.innerHTML = '';
    const inv = world.items.inv, keys = Object.keys(inv);
    if (!keys.length) l.innerHTML = '<div class="row"><span>空空如也。竹坞有草药，寨子里有钱袋。</span></div>';
    for (const id of keys) { const it = ITEMS[id]; const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div><b>${it.name}</b> × ${inv[id]}<small>${it.desc}</small></div>`; if (it.use) { const b = document.createElement('button'); b.textContent = '用'; b.onclick = () => { world.items.use(id, world.player); fillBag(); }; r.appendChild(b); } l.appendChild(r); }
    const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div>铜钱<small>茶舍买药、卖草药用</small></div><b>${world.player.coins} 文</b>`; l.appendChild(r);
  }
  function fillQuests() {
    const l = $('quest-list'); l.innerHTML = '';
    for (const q of world.quests.QUESTS) {
      const s = world.quests.state[q.id]; if (s.status === 'locked') continue;
      const r = document.createElement('div'); r.className = 'row' + (s.status === 'done' ? ' done' : '');
      r.innerHTML = `<div><b>${q.name}</b>${s.status === 'done' ? ' · 已完成' : ''}<small>${q.desc}</small>${s.status === 'active' ? `<small>▸ ${world.quests.progressText(q)}</small>` : ''}</div>`;
      if (s.status === 'active') { const b = document.createElement('button'); b.textContent = world.quests.tracked === q.id ? '追踪中' : '追踪'; b.className = world.quests.tracked === q.id ? 'on' : ''; b.onclick = () => { world.quests.tracked = q.id; fillQuests(); }; r.appendChild(b); }
      l.appendChild(r);
    }
    if (!l.children.length) l.innerHTML = '<div class="row"><span>还没有事务。去村里找人说话。</span></div>';
  }
  function fillShop() {
    const l = $('shop-list'); l.innerHTML = `<div class="kv">你有铜钱 ${world.player.coins} 文</div>`;
    for (const id of ['tea', 'medicine']) { const it = ITEMS[id]; const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div><b>${it.name}</b> · ${it.buy} 文<small>${it.desc}</small></div>`; const b = document.createElement('button'); b.textContent = '买'; b.onclick = () => { world.items.buy(id, world.player); fillShop(); }; r.appendChild(b); l.appendChild(r); }
    for (const id of ['herb', 'mushroom']) { const it = ITEMS[id], n = world.items.count(id); const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<div><b>${it.name}</b> × ${n} · 收 ${it.sell} 文<small>${it.desc}</small></div>`; const b = document.createElement('button'); b.textContent = '卖一株'; b.disabled = !n; b.onclick = () => { world.items.sell(id, world.player); fillShop(); }; r.appendChild(b); l.appendChild(r); }
  }
  function fillPause() {
    const p = world.player, st = world.stats;
    $('pause-info').innerHTML = `第 ${world.sky.state.day} 日 · ${world.sky.label()}<br>铜钱 ${p.coins} 文 · 血 ${Math.ceil(p.hp)}/${p.maxHp}<br>任务完成 ${world.quests.QUESTS.filter(q => world.quests.state[q.id].status === 'done').length}/${world.quests.QUESTS.length} · 击退山贼 ${st.kills} · 走过 ${Math.round(st.walked)} 米<br><span style="opacity:.7">三角形 ${st.tris.toLocaleString()} · ${st.fps} 帧/秒 · 绘制 ${st.calls}</span>`;
  }
  $('btn-save').onclick = () => { world.save(); toast('已存档'); };
  $('btn-time').onclick = () => { world.sky.state.hour = Math.floor((world.sky.state.hour + 1) / 2) * 2 + 1; if (world.sky.state.hour >= 24) { world.sky.state.hour -= 24; world.sky.state.day++; } fillPause(); };
  $('btn-reset').onclick = () => { if (confirm('清空存档，从头开始？')) { world.reset(); show(null); } };

  return { els, toast, update, prompt, dialog, show, toggle, get open() { return open; } };
}
