/**
 * 车、船、飞机的对比截图：同一套机位，换模型前拍一遍、换完再拍一遍。
 * 拍的是 dist 单文件版里真正跑起来的游戏。
 *
 *   node tests/vehicle-shots.cjs [输出目录] [只拍哪几张，逗号分隔]
 *   node tests/vehicle-shots.cjs renders/game/vehicles-before
 *
 * 两类镜头：
 *  - *-close / *-mid：相机钉在载具上（补 camera.updateMatrixWorld，同 model-sheet.cjs），看建模本身
 *  - *-drive / *-sail / *-taxi：进入驾驶模式后用游戏自己的相机，玩家实际看到的就是这个
 * 旅行地区（烟雨渡、雨港）用各自场景的相机，同样的办法钉住。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', '星屿-六地旅行版.html');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'game', 'vehicles');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const anchor = '\nsetMode(MODE.VIEW);';
  let html = fs.readFileSync(DIST, 'utf8');
  if (!html.includes(anchor)) throw new Error('没找到 setMode(MODE.VIEW) 锚点，dist 结构变了');
  html = html.replace(anchor, '\nwindow.__api={THREE,scene,camera,keys,clearInput,pickMode,strollHarbor,roadster,seaplane,boat,harborTrams,harborShips,car,plane,ship,journeys};' + anchor);
  const tmp = path.join(os.tmpdir(), `astra-vehicle-shots-${process.pid}.html`);
  fs.writeFileSync(tmp, html);

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__api, null, { timeout: 120000 });
  await page.waitForTimeout(5000);

  const shots = [];
  const want = n => !ONLY || ONLY.includes(n);
  const shoot = async name => {
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file, timeout: 180000 });
    shots.push(file); console.log('拍了', file);
  };
  const hideUi = () => page.evaluate(() => {
    for (const e of document.body.querySelectorAll('*')) {
      if (e.tagName === 'CANVAS' || e.querySelector('canvas')) continue;
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'absolute' || e.matches('button,dialog')) e.style.visibility = 'hidden';
    }
  });
  // 把某台相机钉在 window.__target 上。ang 是相对载具朝向的水平角（0 = 正前方），高度都相对载具原点
  const pin = cameraExpr => page.evaluate(expr => {
    const cam = eval(expr);
    if (cam.__pinned) return;
    const orig = cam.updateMatrixWorld;
    cam.updateMatrixWorld = function (force) {
      const v = window.__view, t = window.__target;
      if (v && t) {
        t.updateMatrixWorld(true);
        const e = t.matrixWorld.elements, yaw = Math.atan2(e[8], e[10]), a = v.ang * Math.PI / 180 + yaw;
        this.position.set(e[12] + Math.sin(a) * v.dist, e[13] + v.high, e[14] + Math.cos(a) * v.dist);
        this.lookAt(e[12], e[13] + v.look, e[14]);
        this.fov = v.fov || 40; this.updateProjectionMatrix();
      }
      return orig.call(this, force);
    };
    cam.__pinned = true;
  }, cameraExpr);
  const close = async (name, targetExpr, view) => {
    if (!want(name)) return;
    await page.evaluate(([t, v]) => { window.__target = eval(t); window.__view = v; }, [targetExpr, view]);
    await page.waitForTimeout(1500); await shoot(name);
    await page.evaluate(() => { window.__view = null; });
  };
  const drive = async (name, mode, keys, ms = 3000) => {
    if (!want(name)) return;
    await page.evaluate(([m, k]) => { const api = window.__api; api.clearInput(); api.pickMode(m); Object.assign(api.keys, k); }, [mode, keys]);
    await page.waitForTimeout(ms); await shoot(name);
    await page.evaluate(() => { const api = window.__api; api.clearInput(); api.pickMode('walk'); });
    await page.waitForTimeout(800);
  };

  await page.evaluate(() => { window.__api.strollHarbor(); window.__api.clearInput(); });
  await page.waitForTimeout(3000);
  await hideUi();
  await pin('window.__api.camera');

  // ---- 主世界 --------------------------------------------------------------------------
  await close('car-close', 'window.__api.roadster.g', { ang: 40, dist: 8, high: 2.4, look: .9 });
  await close('car-side', 'window.__api.roadster.g', { ang: 90, dist: 9, high: 1.6, look: .9 });
  await drive('car-drive', 'drive', { w: true });
  await close('plane-close', 'window.__api.seaplane.g', { ang: 35, dist: 17, high: 4, look: 1 });
  await drive('plane-taxi', 'fly', { shift: true }, 3500);
  await close('sail-close', 'window.__api.boat.g', { ang: 40, dist: 22, high: 6, look: 3 });
  await drive('sail-chase', 'sail', { w: true }, 3500);
  await close('tram-close', 'window.__api.harborTrams[0].g', { ang: 30, dist: 16, high: 4, look: 2.5 });
  await close('ships-mid', 'window.__api.harborShips[3].g', { ang: 20, dist: 70, high: 18, look: 4 });

  // ---- 旅行地区 ------------------------------------------------------------------------
  const journey = async (id, name, targetExpr, view) => {
    if (!want(name)) return;
    await page.evaluate(i => window.__api.journeys.travel(i), id);
    await page.waitForFunction(i => { const j = window.__api.journeys; return !j.busy && j.active && j.active.id === i; }, id, { timeout: 180000 });
    await page.waitForTimeout(2500);
    await hideUi();
    await pin('window.__api.journeys.active.camera');
    await close(name, targetExpr, view);
  };
  await journey('watertown', 'wt-boat', 'window.__api.journeys.active.world.pboat.g', { ang: 40, dist: 9, high: 3, look: .6 });
  await journey('rainport', 'rp-tram', 'window.__api.journeys.active.world.tram', { ang: 30, dist: 12, high: 3, look: 1.5 });

  console.log(JSON.stringify({ shots: shots.length, problems }, null, 1));
  await browser.close();
  if (problems.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
