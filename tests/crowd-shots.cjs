/**
 * 港区路人验收：dist 单文件版里真正跑起来，确认路人全换成了 glTF 模型、在走，拍图并报渲染开销。
 *
 *   node tests/crowd-shots.cjs [输出目录]
 *
 * 模型没加载上（crowdPeople 为空）就失败退出，不拿方块人糊弄。
 * 开销取 renderer.info：同一机位下一帧的绘制次数和三角形数。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', '星屿-六地旅行版.html');
const OUT = process.argv[2] || path.join(ROOT, 'renders', 'game', 'crowd');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const anchor = '\nsetMode(MODE.VIEW);';
  let html = fs.readFileSync(DIST, 'utf8');
  if (!html.includes(anchor)) throw new Error('没找到 setMode(MODE.VIEW) 锚点，dist 结构变了');
  html = html.replace(anchor, '\nwindow.__api={THREE,scene,camera,renderer,crowdPeople,harborVisitors,harborStaff,walk,strollHarbor,clearInput,player};' + anchor);
  const tmp = path.join(os.tmpdir(), `astra-crowd-shots-${process.pid}.html`);
  fs.writeFileSync(tmp, html);

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__api, null, { timeout: 180000 });
  try {
    await page.waitForFunction(() => { const a = window.__api; return a.crowdPeople.length >= a.harborVisitors.length + a.harborStaff.length; }, null, { timeout: 180000 });
  } catch {
    console.error('路人模型没加载上：\n' + problems.join('\n'));
    await browser.close(); process.exit(1);
  }

  const hideUi = () => page.evaluate(() => {
    for (const e of document.body.querySelectorAll('*')) {
      if (e.tagName === 'CANVAS' || e.querySelector('canvas')) continue;
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'absolute' || e.matches('button,dialog')) e.style.visibility = 'hidden';
    }
  });
  // renderer.info 默认每次 render() 清零；一帧里如果有多次 render（阴影、后处理），读到的只是最后一次。
  // 关掉自动清零，清一次，等两帧，读出来的是两帧的合计，再除以二
  const cost = () => page.evaluate(async () => {
    const r = window.__api.renderer; r.info.autoReset = false; r.info.reset();
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const i = r.info.render, out = { callsPerFrame: Math.round(i.calls / 2), trianglesPerFrame: Math.round(i.triangles / 2) };
    r.info.autoReset = true; return out;
  });

  await page.evaluate(() => { const a = window.__api; a.strollHarbor(); a.walk.tps = true; a.clearInput(); });
  await page.waitForTimeout(5000);
  await hideUi();
  const shots = [];
  const shoot = async name => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, timeout: 180000 }); shots.push(f); console.log('拍了', f); };

  await shoot('street');
  const streetCost = await cost();
  // 同一机位把路人模型挪到相机看不见的图层再量一次，差值就是路人自己的开销（含阴影那一遍）。
  // 不能用 visible：animateCrowdModels 每帧按距离重设 visible，会把它改回来；layers 它不碰
  const setCrowdLayer = layer => page.evaluate(l => { for (const c of window.__api.crowdPeople) c.model.traverse(o => o.layers.set(l)); }, layer);
  await setCrowdLayer(31);
  await page.waitForTimeout(500);
  const noCrowdCost = await cost();
  await setCrowdLayer(0);

  // 近景：钉住离玩家最近、正在走的一个路人，从斜前方拍
  await page.evaluate(() => {
    const a = window.__api, T = a.THREE, w = new T.Vector3(), me = new T.Vector3(a.walk.x, 0, a.walk.z);
    let best = null, bd = 1e9;
    for (const c of a.crowdPeople) { if (!c.visitor) continue; c.p.g.getWorldPosition(w); const d = Math.hypot(w.x - me.x, w.z - me.z); if (d < bd) { bd = d; best = c; } }
    window.__target = best.p.g;
    const cam = a.camera, orig = cam.updateMatrixWorld;
    cam.updateMatrixWorld = function (force) {
      const t = window.__target; t.updateMatrixWorld(true);
      const e = t.matrixWorld.elements, yaw = Math.atan2(e[8], e[10]) + 0.6;
      this.position.set(e[12] + Math.sin(yaw) * 4.2, e[13] + 1.5, e[14] + Math.cos(yaw) * 4.2);
      this.lookAt(e[12], e[13] + 1.0, e[14]); this.fov = 36; this.updateProjectionMatrix();
      return orig.call(this, force);
    };
  });
  await page.waitForTimeout(1500);
  await shoot('walker-close');

  const state = await page.evaluate(() => {
    const a = window.__api;
    const walking = a.crowdPeople.filter(c => c.visitor && (c.visitor.actualSpeed || 0) > 0.3).length;
    return { crowdModels: a.crowdPeople.length, visitors: a.harborVisitors.length, staff: a.harborStaff.length, walkingNow: walking,
      oldFiguresStillVisible: a.crowdPeople.filter(c => c.p.g.children.some(ch => ch !== c.model && ch.visible && ch.isMesh)).length };
  });
  const crowdCost = { callsPerFrame: streetCost.callsPerFrame - noCrowdCost.callsPerFrame, trianglesPerFrame: streetCost.trianglesPerFrame - noCrowdCost.trianglesPerFrame };
  console.log(JSON.stringify({ ...state, streetCost, noCrowdCost, crowdCost, shots: shots.length, problems }, null, 1));
  await browser.close();
  if (problems.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
