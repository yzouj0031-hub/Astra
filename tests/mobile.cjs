/**
 * 手机 / 平板适配体检：截图 + 量控件。
 *
 *   node tests/mobile.cjs
 *
 * 看三件事：
 *   1. 触屏控件在不在（摇杆、跳跃/油门、上下载具、互动）
 *   2. 尺寸够不够手指点（44 CSS px 是通用下限）
 *   3. 有没有跑到屏幕外、有没有互相压住
 */
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const GAME = 'file:///' + path.join(ROOT, 'dist', '星屿-六地旅行版.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'renders', 'mobile');

const TARGETS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, dpr: 3 },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, dpr: 3 },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, dpr: 2 },
];

// 触屏该有的控件。id -> 说明
const CONTROLS = {
  'joy': '移动摇杆',
  'jump-button': '跳 / 油门',
  'brake-button': '刹车 / 收油',
  'vehicle-interact': '上下载具',
  'castbtn': '抛竿',
};
const MIN_TAP = 44;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });

  for (const t of TARGETS) {
    const ctx = await browser.newContext({
      viewport: t.viewport, deviceScaleFactor: t.dpr,
      isMobile: true, hasTouch: true,
      userAgent: devices['iPhone 13']?.userAgent,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(GAME, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.mode, null, { timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, t.name + '.png') });

    const report = await page.evaluate(({ CONTROLS, MIN_TAP }) => {
      const out = [];
      for (const [id, label] of Object.entries(CONTROLS)) {
        const el = document.getElementById(id);
        if (!el) { out.push({ id, label, state: '没有这个元素' }); continue; }
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const shown = !el.hidden && style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0;
        out.push({
          id, label, state: shown ? '显示' : '隐藏',
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          small: shown && (r.width < MIN_TAP || r.height < MIN_TAP),
          offscreen: shown && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1),
        });
      }
      return out;
    }, { CONTROLS, MIN_TAP });

    console.log(`\n===== ${t.name}  ${t.viewport.width}x${t.viewport.height} =====`);
    for (const c of report) {
      const flags = [c.small ? '太小' : '', c.offscreen ? '出界' : ''].filter(Boolean).join(' ');
      console.log(`  ${c.label.padEnd(12)} ${c.state}${c.size ? '  ' + c.size : ''}  ${flags}`);
    }
    if (errors.length) console.log('  页面报错:', errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
