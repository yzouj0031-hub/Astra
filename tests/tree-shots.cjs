/**
 * 烟雨渡的树：改前 / 改后 同机位对比。
 *
 *   node tests/tree-shots.cjs <输出目录>
 *
 * 拍的是 dist 里那个自包含 HTML —— 玩家双击打开的就是它，
 * 树的 GLB 也是 base64 内嵌在里面的，所以这里能一并验证内嵌那条路通不通。
 *
 * 机位靠「附近走走」的导览按钮和「俯瞰」定，不碰内部变量：
 * 这些按钮走的是正常玩法入口，前后两次点的是同一串，机位才真的可比。
 *
 * 第二个参数可以只拍其中几张（逗号分隔），补拍时不用把四张全重跑一遍：
 *   node tests/tree-shots.cjs renders/game/trees-after over-noon
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const GAME = 'file:///' + path.join(ROOT, 'dist', '星屿-六地旅行版.html').replace(/\\/g, '/');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'game', 'trees');

// 柳树集中在三处：沿河驳岸（z=±7 一整条）、山脚一圈、镇外散落。
// stop 的下标对应 core.js REGIONS.watertown.stops：0=乌篷渡口 1=听雨茶馆 2=山寺古道
const SHOTS = [
  { name: 'bank-dusk',  stop: 0 },                 // 渡口：正对沿河柳
  { name: 'hill-dusk',  stop: 2 },                 // 山寺古道：山脚柳林
  { name: 'bank-noon',  stop: 0, times: 3 },       // 正午：看叶片贴图和明暗
  { name: 'hill-noon',  stop: 2, times: 3 },       // 山脚：红枫、竹丛和层叠松都在这一带
  { name: 'over-noon',  stop: 0, times: 3, overview: true }, // 俯瞰：看整片树的分布和密度
];

async function openMenu(page) {
  const open = await page.evaluate(() => document.getElementById('journey-menu').open);
  if (!open) await page.click('#journey-menu-toggle');
}

async function closeMenu(page) {
  const open = await page.evaluate(() => document.getElementById('journey-menu').open);
  if (open) await page.click('#journey-menu-toggle');
  await page.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const problems = [];

  const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
  for (const shot of SHOTS.filter(s => !only || only.has(s.name))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => problems.push(`${shot.name} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`${shot.name} console: ${m.text()}`); });
    await page.goto(GAME + '?journey=watertown', { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => document.body.dataset.journey === 'watertown', null, { timeout: 60000 });
    await page.waitForTimeout(9000);

    for (let i = 0; i < (shot.times || 0); i++) {
      await openMenu(page);
      await page.click('#journey-day');
      await page.waitForTimeout(300);
    }
    await openMenu(page);
    const stops = await page.$$('#journey-stops button');
    if (!stops[shot.stop]) throw new Error('导览按钮不见了，stops 结构变了');
    await stops[shot.stop].click();
    await page.waitForTimeout(2500);
    if (shot.overview) {
      await openMenu(page);
      await page.click('#journey-view');
      // 菜单展开时地区是暂停的，不收起来相机不会飞到俯瞰位，面板还挡着半张画面
      await closeMenu(page);
      await page.waitForTimeout(3500);
    }

    const file = path.join(OUT, shot.name + '.png');
    await page.screenshot({ path: file });
    console.log('拍了', file);
    await page.close();
  }

  await browser.close();
  if (problems.length) { console.log('\n页面报错:'); problems.slice(0, 12).forEach(p => console.log(' ', p)); }
  else console.log('\n没有页面报错');
})().catch(e => { console.error(e); process.exitCode = 1; });
