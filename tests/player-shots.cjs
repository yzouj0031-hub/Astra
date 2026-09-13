/**
 * 玩家角色验收截图：拍的是 dist 单文件版里真正跑起来的游戏，模型走的是内嵌的那条加载路径。
 *
 *   node tests/player-shots.cjs [输出目录] [只拍哪几张，逗号分隔]
 *
 * 两类镜头：
 *  - chase-*：游戏自己的第三人称追尾相机，玩家实际看到的就是这个
 *  - face / three-q / back / swim-close：把相机怼到人跟前，看建模和动画姿势
 *    （抢相机的办法同 model-sheet.cjs：补 camera.updateMatrixWorld，游戏每帧照算，我们最后覆盖）
 *
 * 模型没加载上（player.animate 不存在）就直接失败退出，不拍旧人偶糊弄过去。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', '星屿-六地旅行版.html');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'model', 'player');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const anchor = '\nsetMode(MODE.VIEW);';
  let html = fs.readFileSync(DIST, 'utf8');
  if (!html.includes(anchor)) throw new Error('没找到 setMode(MODE.VIEW) 锚点，dist 结构变了');
  html = html.replace(anchor, '\nwindow.__api={THREE,scene,camera,player,walk,keys,strollHarbor,worldWalkHeight,SEA_LEVEL,clearInput,journeys};' + anchor);
  const tmp = path.join(os.tmpdir(), `astra-player-shots-${process.pid}.html`);
  fs.writeFileSync(tmp, html);

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__api, null, { timeout: 120000 });
  try {
    await page.waitForFunction(() => window.__api.player.animate, null, { timeout: 90000 });
  } catch {
    console.error('玩家模型没加载上：\n' + problems.join('\n'));
    await browser.close(); process.exit(1);
  }

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
  // 近景机位：相对玩家脚底；ang 是相对玩家朝向的水平角，0 = 正对脸
  await page.evaluate(() => {
    const api = window.__api, cam = api.camera, orig = cam.updateMatrixWorld;
    cam.updateMatrixWorld = function (force) {
      const v = window.__view;
      if (v) {
        const g = api.player.g; g.updateMatrixWorld(true);
        const e = g.matrixWorld.elements, a = v.ang * Math.PI / 180 + g.rotation.y;
        this.position.set(e[12] + Math.sin(a) * v.dist, e[13] + v.high, e[14] + Math.cos(a) * v.dist);
        this.lookAt(e[12], e[13] + v.look, e[14]);
        this.fov = 34; this.updateProjectionMatrix();
      }
      return orig.call(this, force);
    };
  });

  // 进港区街上，第三人称
  await page.evaluate(() => { const api = window.__api; api.strollHarbor(); api.walk.tps = true; api.clearInput(); });
  await page.waitForTimeout(4000);
  await hideUi();

  if (want('chase-idle')) { await page.waitForTimeout(1500); await shoot('chase-idle'); }
  if (want('chase-jog')) {
    await page.evaluate(() => { window.__api.keys.w = true; });
    await page.waitForTimeout(2500); await shoot('chase-jog');
  }
  if (want('chase-sprint')) {
    await page.evaluate(() => { window.__api.keys.w = true; window.__api.keys.shift = true; });
    await page.waitForTimeout(2500); await shoot('chase-sprint');
  }
  await page.evaluate(() => window.__api.clearInput());
  await page.waitForTimeout(1500);

  for (const [name, view] of [
    ['face', { ang: 0, high: 1.84, dist: 1.35, look: 1.80 }],
    ['three-q', { ang: 38, high: 1.35, dist: 3.6, look: 1.10 }],
    ['back', { ang: 180, high: 1.55, dist: 1.6, look: 1.55 }],   // 领口后面：上一版这里露皮肤
  ]) {
    if (!want(name)) continue;
    await page.evaluate(v => { window.__view = v; }, view);
    await page.waitForTimeout(1200); await shoot(name);
  }
  await page.evaluate(() => { window.__view = null; });

  if (want('chase-swim') || want('swim-close')) {
    // 在玩家周围找一块开阔的深水（周围 25 米一圈都深，别贴着码头墙），面朝外海放进去，
    // 按 updateWalk 落水那段的写法直接设状态
    const ok = await page.evaluate(() => {
      const api = window.__api, w = api.walk, deep = (x, z) => api.worldWalkHeight(x, z) < api.SEA_LEVEL - 3;
      for (let r = 40; r < 600; r += 15) for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
        if (!deep(x, z)) continue;
        let open = true;
        for (let j = 0; j < 8 && open; j++) open = deep(x + Math.cos(j * Math.PI / 4) * 25, z + Math.sin(j * Math.PI / 4) * 25);
        if (!open) continue;
        Object.assign(w, { x, z, vx: 0, vz: 0, swim: true, air: false, dive: false, climb: null, vy: 0, y: api.SEA_LEVEL - .02, stroke: 0, heading: a, yaw: a });
        return { x, z };
      }
      return null;
    });
    if (!ok) throw new Error('玩家附近 400 米内找不到深水');
    await page.evaluate(() => { window.__api.keys.w = true; });
    await page.waitForTimeout(3000);
    // 实测游泳姿势相对水面的高度：人应该一半在水里，SWIM_LIFT 按这个定
    const swimBox = await page.evaluate(() => {
      const api = window.__api, T = api.THREE, m = api.player.model; m.updateMatrixWorld(true);
      const b = new T.Box3(); m.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); b.expandByObject(o); } });
      const bones = ['pelvis', 'spine_03', 'Head'].map(n => { const o = m.getObjectByName(n); return [n, +(o.getWorldPosition(new T.Vector3()).y - api.SEA_LEVEL).toFixed(2)]; });
      return { groundY: +(api.walk.groundY - api.SEA_LEVEL).toFixed(2), boneHeightsAboveWater: Object.fromEntries(bones), modelLift: +m.position.y.toFixed(2) };
    });
    console.log('游泳姿势（相对水面，米）', JSON.stringify(swimBox));
    if (want('chase-swim')) await shoot('chase-swim');
    if (want('swim-close')) {
      // 游泳近景：人是趴平的，相机抬高、从斜后上方对准身体中段，不是按站姿的头高去拍
      await page.evaluate(() => { window.__view = { ang: 135, high: 2.4, dist: 3.2, look: 0.35 }; });
      await page.waitForTimeout(1200); await shoot('swim-close');
      await page.evaluate(() => { window.__view = null; });
    }
    await page.evaluate(() => window.__api.clearInput());
  }

  /* 旅行地区：同一个玩家模型挂进地区场景，用地区自己的相机拍。
     烟雨渡是 LinearEncoding + NoToneMapping，和主世界的色彩管线不一样，得单独看一眼；
     坐船走 sit 片段，山寺开打后剑挂在手骨上 —— 这两处原来是给程序化骨架摆的。 */
  const journey = async (id, near, name, wait = 2500) => {
    if (!want(name)) return;
    await page.evaluate(i => window.__api.journeys.travel(i), id);
    await page.waitForFunction(i => { const j = window.__api.journeys; return !j.busy && j.active && j.active.id === i; }, id, { timeout: 180000 });
    await page.waitForTimeout(2000);
    const ran = await page.evaluate(near);
    if (!ran) throw new Error(`${name}: 没找到可以触发的交互`);
    await page.waitForTimeout(wait);
    await hideUi();
    await shoot(name);
  };
  await journey('watertown', () => {
    const a = window.__api.journeys.active, b = a.world.BOAT;
    Object.assign(a.pos, { x: b.x + 2, z: b.z, speed: 0 });
    const c = a.context(); if (!c) return false; c.run(); return true;
  }, 'wt-boat');
  await journey('temple', () => {
    const a = window.__api.journeys.active, boss = a.world.game.boss;
    Object.assign(a.pos, { x: boss.x + 4, z: boss.z + 3, speed: 0 });   // 5 米：开打要进 7 米内
    const c = a.context(); if (!c) return false; c.run(); return true;
  }, 'temple-fight');

  const state = await page.evaluate(() => {
    const api = window.__api; let tris = 0;
    api.player.model.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return { tris, gltf: !!api.player.animate, procedualHidden: !api.player.body.visible };
  });
  console.log(JSON.stringify({ ...state, shots: shots.length, problems }, null, 1));
  await browser.close();
  if (problems.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
