/**
 * 云水行的游戏内实拍：起本地服务 → 无头 Chromium 跑真正的游戏 → 按机位截图。
 *
 *   node openworld/tests/shots.cjs <输出目录> [机位名,机位名]
 *
 * 机位通过 URL 参数定：at=x,z 玩家位置，yaw 玩家朝向，cam=yaw,pitch,dist 相机，t=时刻（0..24）。
 * 加载完成的判定是 #hud 显示出来；再等几秒让草、阴影和动画都跑起来。
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '..', 'renders', 'openworld');
const PORT = 8791;

const SHOTS = [
  { name: 'village-morning', q: 'at=-100,70&yaw=2.6&cam=0.9,0.22,7&t=9.5&low=1' },
  { name: 'village-street', q: 'at=-140,44&yaw=1.2&cam=4.3,0.18,6&t=15' },
  { name: 'teahouse', q: 'at=-92,32&yaw=3.1&cam=0.1,0.2,7&t=11' },
  { name: 'bridge', q: 'at=96,62&yaw=1.4&cam=4.6,0.22,9&t=16.5' },
  { name: 'bamboo', q: 'at=-190,-50&yaw=-0.6&cam=2.4,0.15,6&t=10' },
  { name: 'paddies', q: 'at=150,60&yaw=0.8&cam=3.9,0.3,9&t=13' },
  { name: 'dusk-lanterns', q: 'at=-110,22&yaw=2.0&cam=5.0,0.15,6&t=19.2' },
  { name: 'night', q: 'at=-120,50&yaw=0&cam=3.2,0.2,7&t=22' },
  { name: 'camp', q: 'at=320,340&yaw=0.6&cam=3.6,0.25,8&t=14' },
  { name: 'mountain', q: 'at=360,-330&yaw=0.5&cam=3.5,0.35,10&t=8' },
  { name: 'overview', q: 'at=-60,60&yaw=0&cam=2.6,0.55,42&t=12' },
  { name: 'portrait', q: 'at=-94,30&yaw=0&cam=3.0,0.08,2.6&t=10' },
  { name: 'villagers', q: 'at=-100,22&yaw=2.4&cam=5.4,0.1,3.4&t=10' },
  { name: 'mobile', q: 'at=-100,70&yaw=2.6&cam=0.9,0.3,9&t=9.5', mobile: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), String(PORT)], { stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
  const problems = [], stats = [];
  for (const shot of SHOTS.filter(s => !only || only.has(s.name))) {
    const ctx = await browser.newContext(shot.mobile
      ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' }
      : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`${shot.name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${shot.name} console: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/?${shot.q}`, { waitUntil: 'load', timeout: 120000 });
    try {
      await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hide'), null, { timeout: 90000 });
    } catch (e) {
      const err = await page.evaluate(() => (document.getElementById('ld-err') || {}).textContent);
      problems.push(`${shot.name}: 游戏没启动 ${err || ''}`);
      await page.screenshot({ path: path.join(OUT, shot.name + '.png'), timeout: 180000 }); await ctx.close(); continue;
    }
    // 开场对话框挡画面：关掉
    await page.evaluate(() => { const d = document.getElementById('dialog'); if (d && !d.classList.contains('hide')) d.querySelector('button').click(); });
    await page.waitForTimeout(shot.mobile ? 4000 : 5000);
    const s = await page.evaluate(() => { const g = window.__game; const i = g.renderer.info.render; return { tris: i.triangles, calls: i.calls, fps: g.world.stats.fps, foliageTris: g.planted.triangles }; });
    stats.push({ name: shot.name, ...s });
    await page.screenshot({ path: path.join(OUT, shot.name + '.png'), timeout: 180000 });
    console.log(`拍了 ${shot.name}  三角形 ${s.tris.toLocaleString()}  绘制 ${s.calls}`);
    await ctx.close();
  }
  await browser.close(); server.kill();
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  if (problems.length) { console.log('\n问题：'); for (const p of [...new Set(problems)]) console.log(' - ' + p); process.exitCode = 1; }
})();
