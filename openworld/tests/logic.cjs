/**
 * 玩法逻辑冒烟：在真游戏里直接调内部对象，验证任务、对话、捡拾、战斗、买卖、存档这条链是通的。
 *
 *   node openworld/tests/logic.cjs
 *
 * 画面用最小视口（软件渲染一帧要几百毫秒），断言只看状态不看像素。
 */
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8793;
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  通过 ' : '  失败 ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?low=1&t=10`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hide'), null, { timeout: 120000 });
  await page.evaluate(() => { localStorage.clear(); const d = document.getElementById('dialog'); if (!d.classList.contains('hide')) d.querySelector('button').click(); });
  const frames = n => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  // 1) 初到渡头：走到里正跟前说话 → 任务完成、得 10 文、黑石寨任务接上
  const r1 = await page.evaluate(() => {
    const g = window.__game, n = g.npcs.byName('里正'); g.player.pos.set(n.pos.x + 1.2, n.pos.y, n.pos.z);
    const before = g.quests.state.arrive.status; const r = g.quests.talk(n);
    return { before, after: g.quests.state.arrive.status, coins: g.player.coins, bandits: g.quests.state.bandits.status, text: r.text };
  });
  check(r1.before === 'active' && r1.after === 'done', `说话推进任务 initially ${r1.before} → ${r1.after}`);
  check(r1.coins === 10, `完成奖励铜钱 10（实际 ${r1.coins}）`);
  check(r1.bandits === 'active', `里正接着给黑石寨任务（${r1.bandits}）`);

  // 2) 捡七叶草：站到一株上跑几帧
  const r2 = await page.evaluate(() => { const g = window.__game, p = g.world.items.pickups.find(p => p.kind === 'herb'); g.player.pos.set(p.x, g.world.heightAt(p.x, p.z), p.z); return p.kind; });
  await frames(4);
  const r2b = await page.evaluate(() => ({ herb: window.__game.world.items.count('herb'), inv: JSON.stringify(window.__game.world.items.inv) }));
  check(r2b.herb === 1, `捡到七叶草（背包 ${r2b.inv}）`);

  // 3) 阿婆的药：接任务，塞满 3 株，再交
  const r3 = await page.evaluate(() => {
    const g = window.__game, n = g.npcs.byName('渡头阿婆'); g.player.pos.set(n.pos.x + 1, n.pos.y, n.pos.z);
    g.quests.talk(n); const s1 = g.quests.state.herbs.status;
    g.world.items.add('herb', 2); g.quests.event('collect', 'herb'); const step = g.quests.state.herbs.step;
    g.quests.talk(n); return { s1, step, s2: g.quests.state.herbs.status, herbs: g.world.items.count('herb'), coins: g.player.coins };
  });
  check(r3.s1 === 'active' && r3.step === 1, `阿婆的任务接上并进入交付步骤（${r3.s1}, step ${r3.step}）`);
  check(r3.s2 === 'done' && r3.herbs === 0 && r3.coins === 40, `交草药完成、草药扣掉、铜钱 40（实际 ${r3.s2} ${r3.herbs} ${r3.coins}）`);

  // 4) 战斗：站到山贼面前挥三刀，看他掉血、死了掉钱、任务计数
  const r4 = await page.evaluate(() => {
    const g = window.__game, b = g.npcs.bandits.find(b => b.campId === 'camp1'); g.player.pos.set(b.pos.x, b.pos.y, b.pos.z + 1.2); g.player.yaw = Math.PI;
    const hp0 = b.hp; g.npcs.strike(g.player, 18, 2.0); const hp1 = b.hp; g.npcs.strike(g.player, 34, 2.4); g.npcs.strike(g.player, 34, 2.4);
    return { hp0, hp1, dead: b.dead, kills: g.world.stats.kills, n: g.quests.state.bandits.n, coins: g.player.coins };
  });
  check(r4.hp1 === r4.hp0 - 18, `轻击掉 18 血（${r4.hp0} → ${r4.hp1}）`);
  check(r4.dead && r4.kills === 1 && r4.n === 1, `砍死一个：kills ${r4.kills}，任务计数 ${r4.n}`);
  check(r4.coins > 40, `山贼掉铜钱（${r4.coins}）`);

  // 5) 山贼反击：让他追上来砍一刀
  const r5 = await page.evaluate(() => { const g = window.__game, b = g.npcs.bandits.find(b => b.campId === 'camp1' && !b.dead); g.player.pos.set(b.pos.x + 1.0, b.pos.y, b.pos.z); b.state = 'attack'; b.atkT = 0.5; b.hitDone = false; b.yaw = Math.atan2(g.player.pos.x - b.pos.x, g.player.pos.z - b.pos.z); return g.player.hp; });
  await frames(3);
  const r5b = await page.evaluate(() => window.__game.player.hp);
  check(r5b < r5, `被山贼砍到掉血（${r5} → ${r5b}）`);

  // 6) 茶舍买药再用
  const r6 = await page.evaluate(() => { const g = window.__game; const c0 = g.player.coins; g.world.items.buy('medicine', g.player); const c1 = g.player.coins; const hp0 = g.player.hp; g.world.items.use('medicine', g.player); return { c0, c1, hp0, hp1: g.player.hp, left: g.world.items.count('medicine') }; });
  check(r6.c1 === r6.c0 - 20 && r6.hp1 > r6.hp0 && r6.left === 0, `买伤药花 20、用了回血（${r6.c0}→${r6.c1}，${r6.hp0}→${r6.hp1}）`);

  // 7) 上香 / 烽火 / 船
  const r7 = await page.evaluate(() => { const g = window.__game; g.quests.start('pray'); g.quests.event('interact', 'shrine'); g.quests.state.bandits.status = 'done'; g.quests.start('beacon'); g.quests.event('interact', 'beacon'); g.quests.start('ferry'); g.world.boat.board(g.player); g.world.boat.pos.x += 100; g.world.boat.update(0.016, { move: { x: 0, y: 0 } }, g.player); return { pray: g.quests.state.pray.status, beacon: g.quests.state.beacon.status, ferry: g.quests.state.ferry.status, riding: g.world.boat.riding, maxHp: g.player.maxHp }; });
  check(r7.pray === 'done' && r7.beacon === 'done' && r7.ferry === 'done', `上香 / 烽火 / 泛舟任务都能完成（${r7.pray} ${r7.beacon} ${r7.ferry}）`);
  check(r7.maxHp === 120, `两次血上限奖励 → 120（实际 ${r7.maxHp}）`);

  // 8) 存档再读
  const r8 = await page.evaluate(() => { const g = window.__game; g.player.coins = 777; g.world.save(); return JSON.parse(localStorage.getItem('yunshui-save-v1')); });
  check(r8 && r8.coins === 777 && r8.quests.state.herbs.status === 'done', `存档写入（coins ${r8 && r8.coins}）`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hide'), null, { timeout: 120000 });
  const r9 = await page.evaluate(() => ({ coins: window.__game.player.coins, herbs: window.__game.quests.state.herbs.status, maxHp: window.__game.player.maxHp }));
  check(r9.coins === 777 && r9.herbs === 'done' && r9.maxHp === 120, `重开后读回存档（coins ${r9.coins}, maxHp ${r9.maxHp}）`);

  // 9) 面板开得开、关得掉
  const r10 = await page.evaluate(() => { const h = window.__game.world.hud; h.show('map'); const a = !document.getElementById('p-map').classList.contains('hide'); h.show('bag'); const b = !document.getElementById('p-bag').classList.contains('hide') && document.getElementById('p-map').classList.contains('hide'); h.show('quest'); const c = document.getElementById('quest-list').children.length; h.show(null); return { a, b, c, paused: window.__game.world.paused }; });
  check(r10.a && r10.b && r10.c >= 5 && !r10.paused, `舆图 / 行囊 / 事务面板（事务 ${r10.c} 条）`);

  check(errors.length === 0, `页面无报错${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.kill();
  console.log(fails.length ? `\n${fails.length} 项失败` : '\n全部通过');
  process.exitCode = fails.length ? 1 : 0;
})();
