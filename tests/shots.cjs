/**
 * 给打包好的单文件游戏截图，用来实际看画面 —— 逻辑测试验不了"好不好看"。
 *
 *   node tests/shots.cjs [输出目录]
 *
 * 需要 playwright（devDependency）。截的是 dist 里那个自包含 HTML，
 * 也就是玩家真正双击打开的东西。游戏的变量都在闭包里，从外面拿不到，
 * 所以切区域走 ?journey= 这个入口（runtime.js 加载时会读它）。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const GAME = 'file:///' + path.join(ROOT, 'dist', '星屿-六地旅行版.html').replace(/\\/g, '/');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'game');

// times：进去之后点几下「换个时辰」。水乡默认 17:36 黄昏，
// 预设顺序是 6:30 / 12:00 / 17:36 / 22:48，所以点三下到正午。
const SHOTS = [
  { name: 'harbor', url: GAME, wait: 5000 },
  { name: 'watertown-dusk', url: GAME + '?journey=watertown', wait: 11000 },
  { name: 'watertown-noon', url: GAME + '?journey=watertown', wait: 11000, times: 3 },
  { name: 'rainport', url: GAME + '?journey=rainport', wait: 11000 },
  // 静屿和星辉乐园是主场景里的区域，不走 ?journey=，点左上角的区域按钮切过去。
  // 这两块之前一次都没拍过 —— 乐园其实是整个游戏里面积最大的一片。
  { name: 'island', url: GAME, wait: 5000, click: '#region-island', after: 3500 },
  { name: 'park',   url: GAME, wait: 5000, click: '#region-park',   after: 3500 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const problems = [];

  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => problems.push(`${shot.name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${shot.name} console: ${m.text()}`); });
    // 单文件版有 7MB 多的内嵌资源，swiftshader 下光解析就要半分钟以上，
    // 默认 30 秒的 goto 超时不够。
    await page.goto(shot.url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => document.body.dataset.mode, null, { timeout: 60000 });
    await page.waitForTimeout(shot.wait);
    if (shot.click) { await page.click(shot.click); await page.waitForTimeout(shot.after || 3000); }
    for (let i = 0; i < (shot.times || 0); i++) {
      await page.click('#journey-menu-toggle').catch(() => {});
      await page.click('#journey-day');
      await page.click('#journey-menu-toggle').catch(() => {});
      await page.waitForTimeout(400);
    }
    const file = path.join(OUT, shot.name + '.png');
    await page.screenshot({ path: file });
    console.log('拍了', file);
    await page.close();
  }

  await browser.close();
  if (problems.length) { console.log('\n页面报错:'); problems.slice(0, 10).forEach(p => console.log(' ', p)); }
  else console.log('\n没有页面报错');
})().catch(e => { console.error(e); process.exitCode = 1; });
