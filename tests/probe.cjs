/* 诊断：哪些材质没上程序化贴图，按覆盖面积排。
   addSurfaceDetail 会在材质上打 userData.surfKind，没有这个标记的就是漏网的。
   面积用每个网格的世界包围盒表面积估，够用来排序。 */
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const DIST = path.join(__dirname, '..', 'dist', '星屿-六地旅行版.html');
let h = fs.readFileSync(DIST, 'utf8');
h = h.replace('\nsetMode(MODE.VIEW);', '\nwindow.__api={scene,THREE};\nsetMode(MODE.VIEW);');
const tmp = path.join(os.tmpdir(), 'astra-probe.html');
fs.writeFileSync(tmp, h);
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 480 } });
  await pg.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__api, null, { timeout: 60000 });
  await pg.waitForTimeout(4000);
  const rows = await pg.evaluate(() => {
    const T = window.__api.THREE, box = new T.Box3(), size = new T.Vector3();
    const agg = new Map();
    window.__api.scene.updateMatrixWorld(true);
    window.__api.scene.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || !o.material) return;
      box.setFromObject(o); box.getSize(size);
      const area = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
      if (!isFinite(area)) return;
      const m = o.material;
      const key = m.uuid;
      const r = agg.get(key) || { area: 0, n: 0, surf: m.userData.surfKind || null, hex: m.color ? '#' + m.color.getHexString() : '-', name: m.name || '' };
      r.area += area; r.n++;
      agg.set(key, r);
    });
    return [...agg.values()].filter(r => !r.surf && r.area < 1e6).sort((a, b) => b.area - a.area).slice(0, 22);
  });
  for (const r of rows) {
    console.log(
      (r.surf ? '  已上 ' + r.surf.padEnd(8) : '>> 漏了     ') +
      String(Math.round(r.area)).padStart(9) + '  ' + String(r.n).padStart(5) + ' 个网格  ' + r.hex + ' ' + r.name
    );
  }
  await b.close();
})();
