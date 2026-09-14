/**
 * 每帧 CPU 开销分项计时：不开浏览器，照 smoke.cjs 的办法把游戏装进 Node 的 vm（假 DOM、假渲染器），
 * 按手机尺寸初始化，在几个典型位置各跑几百帧，量每个子系统一帧花多少毫秒。
 *
 *   node tests/perf-profile.cjs [宽 高] [--html=别的 index.html]   默认 390 844（竖屏手机）、仓库里的 index.html
 *   --html 用来量改动之前的版本：git show HEAD:index.html > old.html 再传进来
 *
 * 量不到 GPU（绘制次数、着色器、阴影），那部分要真机或浏览器；这里只回答「JS 每帧有多重、重在哪」。
 * 数字只在同一台机器上前后对比有意义。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const htmlArg = process.argv.find(x => x.startsWith('--html='));
const [W, H] = process.argv.slice(2).filter(x => !x.startsWith('--')).map(Number);
const width = W || 390, height = H || 844;

const HTML = fs.readFileSync(htmlArg ? htmlArg.slice(7) : path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const THREE = {};
vm.runInNewContext(scripts[0], { exports: THREE, module: {}, console, performance });

const nodes = new Map();
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (() => {}), set: (t, k, v) => (t[k] = v, true) });
class El {
  constructor(id) { this.id = id; this.style = {}; this.attrs = {}; this.handlers = {}; this.textContent = ''; this.innerHTML = ''; this.children = []; this.width = 288; this.height = 248; const c = new Set(); this.classList = { add: k => c.add(k), remove: k => c.delete(k), toggle: (k, v) => v === false ? c.delete(k) : c.add(k), contains: k => c.has(k) }; this.dataset = {}; }
  addEventListener(k, fn) { (this.handlers[k] ??= []).push(fn); }
  appendChild(e) { this.children.push(e); }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
  getContext() { return ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 130, right: 500, bottom: 130 }; }
  querySelector() { return new El('q'); } closest() { return null; } click() {}
  showModal() { this.open = true; } close() { this.open = false; }
}
for (const m of HTML.matchAll(/\bid="([^"]+)"/g)) if (!nodes.has(m[1])) nodes.set(m[1], new El(m[1]));
const body = new El('body');
const document = { body, hidden: false, documentElement: new El('html'), head: new El('head'), getElementById: id => nodes.get(id) || null, createElement: t => new El(t), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
const canvas = new El('stage-canvas'); canvas.width = width; canvas.height = height;
let renders = 0;
const renderer = { domElement: canvas, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1, shadowMap: {}, render: () => renders++, info: { render: {} } };
const three = { ...THREE, WebGLRenderer: function () { return renderer; } };
const sandbox = { THREE: three, document, innerWidth: width, innerHeight: height, devicePixelRatio: 3, requestAnimationFrame: () => {}, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {}, matchMedia: q => ({ matches: /coarse/.test(q) }), navigator: { maxTouchPoints: 5 }, localStorage: { getItem: () => null, setItem() {} }, performance, console, URL, Date };
sandbox.window = sandbox;
const c = vm.createContext(sandbox);
vm.runInContext(scripts[1], c);

// 后面几个是 updateWalk 里面的零件，和 updateWalk 的时间有重叠，用来看它重在哪
const PARTS = ['animateResort', 'updateHarbor', 'updateAtmosphere', 'updateResidents', 'updateActors', 'drawMap', 'renderScene',
  'updateWalk', 'resolveHarborWalk', 'placeChaseCamera', 'safeChasePosition', 'chaseBlocked'];
// 在 tick 里给每个子系统包一层计时：替换源码里 `function 名字(` 为「名字__raw」，再定义同名的计时包装
let src = scripts[2];
// 只包顶层定义（行首 function 名字(）的：嵌在别的函数里的同名函数，外面的包装够不着
for (const name of [...PARTS]) {
  const decl = `
function ${name}(`;
  if (src.split(decl).length !== 2) { console.log(`（${name} 不是唯一的顶层函数，不单独计时）`); PARTS.splice(PARTS.indexOf(name), 1); continue; }
  // 包装紧挨着原函数插进去：游戏脚本整体在一个作用域里，追加到脚本末尾的包装看不见改了名的原函数
  src = src.replace(decl, `
function ${name}(...a){const s=__realNow();try{return ${name}__raw(...a);}finally{__perf.${name}=(__perf.${name}||0)+__realNow()-s;}}
function ${name}__raw(`);
}
src = src.replace('\nsetMode(MODE.VIEW);', '\nglobalThis.api={tick,walk,strollHarbor,focusRegion,setMode,MODE,keys,clearInput,camera};\nsetMode(MODE.VIEW);');
sandbox.__perf = {};
// 计时要用真时钟：下面会把游戏看到的 performance.now 换成按帧推进的假时钟，一帧之内它不动
sandbox.__realNow = performance.now.bind(performance);
const t0 = performance.now();
vm.runInContext(src, c, { timeout: 120000 });
console.log(`${width}x${height} 触屏：初始化 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
const a = c.api;

// 假时钟：tick 里用 THREE.Clock 取帧间隔，这里每帧推进 1/60 秒
let now = 0;
sandbox.performance = { now: () => now };
const realNow = performance.now.bind(performance);
function run(label, setup, frames = 240) {
  setup();
  for (let i = 0; i < 30; i++) { now += 16.7; a.tick(); }         // 预热
  for (const k of Object.keys(sandbox.__perf)) sandbox.__perf[k] = 0;
  const s = realNow();
  for (let i = 0; i < frames; i++) { now += 16.7; a.tick(); }
  const total = (realNow() - s) / frames;
  const parts = Object.fromEntries(PARTS.map(k => [k, +((sandbox.__perf[k] || 0) / frames).toFixed(2)]));
  const known = Object.values(parts).reduce((x, y) => x + y, 0);
  console.log(`\n== ${label}：一帧 JS ${total.toFixed(2)} ms`);
  for (const [k, v] of Object.entries(parts).sort((x, y) => y[1] - x[1])) if (v >= 0.01) console.log(`   ${k.padEnd(18)} ${v.toFixed(2)} ms`);
  console.log(`   其他（tick 里的零碎） ${(total - known).toFixed(2)} ms`);
  return { label, total: +total.toFixed(2), parts };
}
const results = [];
results.push(run('港区街道步行（第三人称）', () => { a.strollHarbor(); a.walk.tps = true; a.clearInput(); }));
results.push(run('港区街道奔跑', () => { a.strollHarbor(); a.walk.tps = true; a.keys.w = true; a.keys.shift = true; }));
results.push(run('静屿俯瞰', () => { a.clearInput(); a.focusRegion('island'); }));
results.push(run('星辉乐园俯瞰', () => { a.clearInput(); a.focusRegion('park'); }));
fs.writeFileSync(path.join(__dirname, '..', 'renders', `perf-${width}x${height}${htmlArg ? '-before' : ''}.json`), JSON.stringify(results, null, 1));
