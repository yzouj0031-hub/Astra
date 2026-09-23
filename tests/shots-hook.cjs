/**
 * 六地验收截图：拍 dist 单文件版，全部机位走 window.__astra 调试钩子（主世界）或导览按钮（旅行地区）。
 *
 *   npm run package:game
 *   node tests/shots-hook.cjs <输出目录> [只拍这些名字,逗号分隔]
 *
 * 环境变量：ROOT=仓库根（默认 /home/user/Astra，worktree 里要指自己）、DIST=dist 里的文件名、
 *           CHROME=浏览器可执行文件（默认 /opt/pw-browsers/chromium）。
 * 地址带 ?quality=lock：软件渲染帧率低，不锁的话游戏会自动关阴影关泛光，拍出来不是真机的样子。
 * 每张图后面打印 renderer.info 的绘制次数和三角形数（主世界；旅行地区读的是各自的渲染）。
 */
const fs = require('fs'), path = require('path');
const { chromium } = (() => { try { return require('playwright'); } catch { return require(path.join('/home/user/Astra', 'node_modules', 'playwright')); } })();
const ROOT = process.env.ROOT || '/home/user/Astra';
const GAME = 'file:///' + path.join(ROOT, 'dist', process.env.DIST || '星屿-六地旅行版.html') + '?quality=lock';
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'game', 'out');
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;

const SHOTS = [
  // 主世界：用 window.__astra 调试钩子定机位（真游戏、真渲染，只是省去点菜单）
  { name: 'harbor-walk',   url: GAME, wait: 4000, run: '__astra.harbor()', after: 2500 },
  { name: 'harbor-view',   url: GAME, wait: 4000, run: '__astra.view("harbor")', after: 4000 },
  { name: 'harbor-night',  url: GAME, wait: 4000, run: '__astra.period(2);__astra.harbor()', after: 4000 },
  { name: 'harbor-street', url: GAME, wait: 4000, run: '__astra.walkTo(700,-60,2.2)', after: 2500 },
  { name: 'harbor-facade', url: GAME, wait: 4000, run: '__astra.walkTo(618,-152,0)', after: 2500 },
  { name: 'harbor-shops',  url: GAME, wait: 4000, run: '__astra.walkTo(600,-262,0)', after: 2500 },
  { name: 'harbor-arcade', url: GAME, wait: 4000, run: '__astra.walkTo(722,-332,0)', after: 2500 },
  { name: 'harbor-clock',  url: GAME, wait: 4000, run: '__astra.orbit(921,42,-130,95,.9,1.25)', after: 3000 },
  { name: 'harbor-facade-night', url: GAME, wait: 4000, run: '__astra.period(2);__astra.walkTo(618,-152,0)', after: 4000 },
  { name: 'island-view',   url: GAME, wait: 4000, run: '__astra.view("island")', after: 4000 },
  { name: 'island-dock',   url: GAME, wait: 4000, run: '__astra.walkMode()', after: 2500 },
  { name: 'island-camp',   url: GAME, wait: 4000, run: '__astra.walkTo(-40,40,-2.3)', after: 2500 },
  { name: 'island-light',  url: GAME, wait: 4000, run: '__astra.walkTo(-2,-8,0.9)', after: 2500 },
  { name: 'island-sunset', url: GAME, wait: 4000, run: '__astra.period(1);__astra.walkTo(30,60,2.6)', after: 4000 },
  { name: 'park-view',     url: GAME, wait: 4000, run: '__astra.view("park")', after: 4000 },
  { name: 'park-gate',     url: GAME, wait: 4000, run: '__astra.park()', after: 2500 },
  { name: 'park-plaza',    url: GAME, wait: 4000, run: '__astra.walkTo(0,-505,0)', after: 2500 },
  { name: 'park-night',    url: GAME, wait: 4000, run: '__astra.period(2);__astra.walkTo(0,-470,0)', after: 4000 },
  { name: 'watertown-dusk', url: GAME + '&journey=watertown', wait: 11000, journey: 'watertown' },
  { name: 'watertown-noon', url: GAME + '&journey=watertown', wait: 11000, journey: 'watertown', times: 3 },
  { name: 'watertown-hill', url: GAME + '&journey=watertown', wait: 11000, journey: 'watertown', times: 3, stop: 2 },
  { name: 'rainport',       url: GAME + '&journey=rainport', wait: 11000, journey: 'rainport' },
  { name: 'rainport-stop1', url: GAME + '&journey=rainport', wait: 11000, journey: 'rainport', stop: 1 },
  { name: 'temple',         url: GAME + '&journey=temple', wait: 11000, journey: 'temple' },
  { name: 'temple-stop1',   url: GAME + '&journey=temple', wait: 11000, journey: 'temple', stop: 1 },
];

async function openMenu(page){ const o = await page.evaluate(()=>{const m=document.getElementById('journey-menu');return m&&m.open;}); if(!o) await page.click('#journey-menu-toggle'); }
async function closeMenu(page){ const o = await page.evaluate(()=>{const m=document.getElementById('journey-menu');return m&&m.open;}); if(o) await page.click('#journey-menu-toggle'); await page.waitForTimeout(300); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const problems = [];
  for (const shot of SHOTS.filter(s => !only || only.has(s.name))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
    page.on('pageerror', e => problems.push(`${shot.name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${shot.name} console: ${m.text().slice(0,300)}`); });
    const t0 = Date.now();
    await page.goto(shot.url, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => document.body.dataset.mode, null, { timeout: 90000 });
    if (shot.journey) await page.waitForFunction(j => document.body.dataset.journey === j, shot.journey, { timeout: 90000 });
    // 开场遮罩要等它真的淡出（软件渲染下 1 秒的定时器可能拖到好几秒），否则整张图蒙着一层蓝
    await page.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.waitForTimeout(shot.wait);
    for (const sel of (shot.click||[])) { await page.click(sel); await page.waitForTimeout(600); }
    if (shot.run) { await page.evaluate(shot.run); }
    if (shot.click || shot.run) await page.waitForTimeout(shot.after || 3000);
    for (let i = 0; i < (shot.times || 0); i++) { await openMenu(page); await page.click('#journey-day'); await page.waitForTimeout(300); }
    if (shot.stop !== undefined) { await openMenu(page); const stops = await page.$$('#journey-stops button'); if (stops[shot.stop]) await stops[shot.stop].click(); await page.waitForTimeout(2500); }
    if (shot.journey) await closeMenu(page);
    const info = await page.evaluate(() => (window.__astra && window.__astra.info) ? window.__astra.info() : null);
    const file = path.join(OUT, shot.name + '.png');
    await page.screenshot({ path: file });
    console.log('拍了', file, ((Date.now()-t0)/1000).toFixed(0)+'s', info ? JSON.stringify(info) : '');
    } catch (e) { console.log('失败', shot.name, String(e.message||e).split('\n')[0]); }
    await page.close();
  }
  await browser.close();
  if (problems.length) { console.log('\n页面报错:'); [...new Set(problems)].slice(0, 12).forEach(p => console.log(' ', p)); } else console.log('\n没有页面报错');
})().catch(e => { console.error(e); process.exitCode = 1; });
