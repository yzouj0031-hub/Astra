/**
 * 模型近景：把相机搬到人物跟前，转一圈拍几张。
 *
 *   node tests/model-sheet.cjs [输出目录]
 *
 * 存在的理由：游戏跑起来之后 scene / camera 全在闭包里，从 playwright 外面够不着，
 * 所以之前所有截图都只能是玩家背后两米的第三人称远景 —— 人在画面里就二十来个像素高，
 * 建模改没改根本看不出来。判断「建模好不好」必须能怼近了看。
 *
 * 怎么进去：沿用 smoke.cjs 那一招 —— 在源码里替换 `setMode(MODE.VIEW);` 这个锚点，
 * 插一行把内部变量挂到 window 上，改完写进临时文件再打开。
 * （试过在外面包 THREE.WebGLRenderer.prototype.render，没用：游戏用的是模块作用域里
 *   自己那份 THREE，跟 window.THREE 不是同一个对象。）
 *
 * 怎么抢相机：游戏每帧 tick 都会重写 camera.position，抢在它前面没意义。
 * 所以补的是相机实例上的 updateMatrixWorld —— three 在 render() 内部、
 * 世界矩阵定稿的最后一刻会调它，在那里改位置，游戏的相机逻辑照跑，我们照覆盖。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', '星屿-六地旅行版.html');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'model');

// [名字, 水平角(度), 相机高度（相对人物原点）, 距离]
const VIEWS = [
  ['face',    0,   1.52, 2.3],   // 正面半身
  ['three-q', 38,  1.45, 2.5],   // 四分之三侧：看形体最准的角度
  ['side',    90,  1.42, 2.5],   // 正侧：看胸腔厚度和小腿肚
  ['full',    22,  1.00, 4.4],   // 全身：看比例
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const anchor = '\nsetMode(MODE.VIEW);';
  let html = fs.readFileSync(DIST, 'utf8');
  if (!html.includes(anchor)) throw new Error('没找到 setMode(MODE.VIEW) 锚点，dist 结构变了');
  html = html.replace(anchor, '\nwindow.__api={scene,camera,residents,player,obstacles};' + anchor);
  const tmp = path.join(os.tmpdir(), 'astra-model-sheet.html');
  fs.writeFileSync(tmp, html);

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));

  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__api && window.__api.residents.length, null, { timeout: 60000 });
  await page.waitForTimeout(5000);

  /* 岛民自己会溜达，拍到一半人能走到礁石后面去（相机跟过去就埋进地形里了）。
     所以先把所有人定住，再挑一个周围最空的当模特 —— 同一份 dist 每次拍的都是同一个人、
     同一个位置，前后两版才有可比性。 */
  await page.evaluate(() => {
    const api = window.__api;
    api.residents.forEach(n => { n.pause = 1e9; });
    let best = 0, bestClear = -1;
    api.residents.forEach((n, i) => {
      const x = n.g.position.x, z = n.g.position.z;
      let clear = 1e9;
      for (const o of api.obstacles) clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r);
      if (clear > bestClear) { bestClear = clear; best = i; }
    });
    window.__idx = best;
  });

  await page.evaluate(() => {
    const api = window.__api, cam = api.camera;
    const orig = cam.updateMatrixWorld;
    cam.updateMatrixWorld = function (force) {
      const v = window.__view;
      if (v) {
        const t = api.residents[v.idx % api.residents.length].g;
        t.updateMatrixWorld(true);
        const e = t.matrixWorld.elements;
        const a = v.ang * Math.PI / 180;
        this.position.set(e[12] + Math.sin(a) * v.dist, e[13] + v.high, e[14] + Math.cos(a) * v.dist);
        this.lookAt(e[12], e[13] + v.high - v.dist * 0.09, e[14]);
        this.fov = 34;                 // 长焦：透视畸变小，看比例才准
        this.updateProjectionMatrix();
      }
      return orig.call(this, force);
    };
  });
  await page.evaluate(() => { document.querySelectorAll('button,.hud,dialog').forEach(e => e.style.display = 'none'); });

  const idx = await page.evaluate(() => window.__idx);
  for (const [name, ang, high, dist] of VIEWS) {
    await page.evaluate(v => { window.__view = v; }, { ang, high, dist, idx });
    await page.waitForTimeout(600);
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file });
    console.log('拍了', file);
  }

  console.log('岛民数 ' + await page.evaluate(() => window.__api.residents.length) + '，模特是第 ' + idx + ' 个');
  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
})();
