/**
 * 在 node 里跑 watertown.js 的**原函数**，报告每个 builder 消耗掉的随机数序列。
 *
 * 关键点：随机数是在**实参求值**时被消耗的，所以 box()/Batch.add() 这些
 * 只负责收几何的东西可以整个换成空壳，不影响取数顺序 —— 顺序完全由 JS
 * 自己的求值规则决定。真正必须是原件的是 rnd/rr/ri/pick/tint/M，
 * 它们连同 Batch、G、C、L、hillY 一起从源文件里整段切出来执行。
 *
 * three.js 用的是 index.html 里内嵌的那份真 r128（Color.lerp、PlaneGeometry
 * 的顶点顺序都要真的），不是我自己写的替身。
 *
 *   node blender/tests/js_harness.mjs buildBanks buildFields ...
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---------- 从 index.html 里抠出内嵌的 three.js r128 ---------- */
function loadThree() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const marker = 'Three.js Authors';
  const at = html.indexOf(marker);
  if (at < 0) throw new Error('index.html 里找不到内嵌的 three.js');
  const open = html.lastIndexOf('<script>', at);
  const close = html.indexOf('</script>', at);
  const code = html.slice(html.indexOf('>', open) + 1, close);
  const sandbox = { globalThis: null, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'three.r128.js' });
  if (!sandbox.THREE) throw new Error('three.js 没挂到全局');
  return sandbox.THREE;
}

/* ---------- 从 watertown.js 里切片 ---------- */
const src = fs.readFileSync(path.join(ROOT, 'journeys', 'watertown.js'), 'utf8');

function sliceBetween(fromMarker, toMarker) {
  const a = src.indexOf(fromMarker);
  const b = src.indexOf(toMarker, a);
  if (a < 0 || b < 0) throw new Error(`切不出 ${fromMarker} .. ${toMarker}`);
  return src.slice(a, b);
}

function sliceFunction(name) {
  const head = `function ${name}(`;
  const a = src.indexOf(head);
  if (a < 0) throw new Error(`watertown.js 里没有 ${name}`);
  // 从函数体第一个 { 开始数括号，忽略字符串与注释里的括号
  let i = src.indexOf('{', a);
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(a, i + 1); }
  }
  throw new Error(`${name} 括号没配平`);
}

/* ---------- 组装运行环境 ---------- */
export function makeEnv() {
  const T = loadThree();

  const preamble = [
    sliceBetween('let _seed', '/* ---------- 调色 ---------- */'),   // rnd/rr/ri/pick/clamp/lerp/smooth
    sliceBetween('const C = {', '/* ---------- 合批'),               // C 与 tint（原件）
    sliceBetween('function flipInside', '/* ---------- 文字贴图'),   // G / M / box / shape（原件）
    sliceBetween('const SIGNS=', '/* ---------- 镇子的布局'),        // 图集：SIGNS/FLAGS/buildAtlas/uvOf（原件）
    sliceBetween('const L = {', '/* =========='),                    // L / 判定 / hillY（原件）
    sliceBetween('/* 屋顶截面', 'function buildHouse('),             // 屋顶/墙体/山墙/立面（原件）
  ].join('\n');

  const stubs = `
    // 只收几何、不消耗随机数的空壳。Batch.add 记账：原语名、矩阵（列主序
    // 16 个数，就是 three.js Matrix4.elements 的排布）、颜色、uvBox。
    // box()/shape() 都最终落到 add，所以只在这里记就够。
    const _noop = () => {};
    const LOG = [];
    function _geoInfo(g){
      for (const k of Object.keys(G)) if (G[k] === g) return [k, null];
      // 屋顶/墙体/桥栏是现造的 ExtrudeGeometry，桥洞是带角度参数的圆柱。
      // 三角化方式和 Blender 不一样，没法逐顶点比，所以记下**造它的参数**：
      // 多边形顶点 / 圆柱参数。形状对不对全看这些。
      if (g.type === 'ExtrudeGeometry') {
        const sh = g.parameters.shapes;
        return ['extrude', {
          poly: sh.curves.map(c => [c.v1.x, c.v1.y]),
          depth: g.parameters.options.depth,
        }];
      }
      if (g.type === 'CylinderGeometry') {
        const p = g.parameters;
        return ['tube', {
          rt: p.radiusTop, rb: p.radiusBottom, h: p.height, rs: p.radialSegments,
          open: p.openEnded, ts: p.thetaStart, tl: p.thetaLength,
        }];
      }
      return [g.type || 'unknown', null];
    }
    function _colOf(c){
      const t = (c && c.isColor) ? c : new T.Color(c);
      return [t.r, t.g, t.b];
    }
    const _batch = {
      add: (geo, m, color, uvBox) => {
        const [name, extra] = _geoInfo(geo);
        LOG.push([name, Array.from(m.elements), _colOf(color), uvBox || null, extra]);
      },
      empty: true, build: _noop,
    };
    const B = new Proxy({}, { get: () => _batch });
    const MAT = new Proxy({}, { get: () => ({}) });
    const scene = { add: _noop };
    // 画布空壳：所有绘制调用都是空的，但 buildAtlas 里
    // Atlas.cells[...] = cell(...) 那套算术是原件，跑出来的格子坐标是真的。
    const _ctx2d = new Proxy({}, {
      get: () => () => {},
      set: () => true,
    });
    const document = { createElement: () => ({ width: 0, height: 0, getContext: () => _ctx2d }) };
    let signCounter = 0;
    // 还没移植的建筑先空着；buildHouse / buildBridge 会从源文件切真身进来
    const buildGate = _noop, buildTeahouse = _noop, buildPagoda = _noop;
  `;

  const ctx = { T, THREE: T, console, Math, Object, Array, Number, String, JSON };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${stubs}\n${preamble}\n`, ctx, { filename: 'watertown.slice.js' });
  return ctx;
}

/** 跑一个 builder，返回取数个数、结束时的种子、以及完整的几何调用流水。 */
const _defined = new WeakMap();

export function record(ctx, name, callExpr) {
  // 同一个 JS 函数可能有多组参数（比如柳树的 bank / 非 bank），
  // 所以函数名从调用表达式里取，不用 job 的 key。同一个函数只切一次 ——
  // 切第二次会撞上已有的声明。
  const fn = callExpr.slice(0, callExpr.indexOf('(')).trim();
  if (!_defined.has(ctx)) _defined.set(ctx, new Set());
  const seen = _defined.get(ctx);
  if (!seen.has(fn)) {
    vm.runInContext(sliceFunction(fn), ctx, { filename: `${fn}.js` });
    seen.add(fn);
  }
  const probe = `
    (() => {
      _seed = 20260906;
      LOG.length = 0;
      let _n = 0;
      const _origRnd = rnd;
      rnd = function(){ _n++; return _origRnd(); };
      const _ret = (${callExpr});
      rnd = _origRnd;
      return { draws: _n, seed: _seed, log: LOG.slice(), ret: _ret };
    })()
  `;
  return vm.runInContext(probe, ctx, { filename: `${name}.probe.js` });
}

/** groundPiece 返回的是一个真 Mesh，把顶点位置与顶点色读出来比。 */
export function recordGroundPiece(ctx, args) {
  vm.runInContext(sliceFunction('groundPiece'), ctx, { filename: 'groundPiece.js' });
  const probe = `
    (() => {
      _seed = 20260906;
      let _n = 0;
      const _origRnd = rnd;
      rnd = function(){ _n++; return _origRnd(); };
      const m = groundPiece(${args.join(',')});
      rnd = _origRnd;
      const p = m.geometry.attributes.position, c = m.geometry.attributes.color;
      const pos = [], col = [];
      for (let i = 0; i < p.count; i++) {
        pos.push([p.getX(i), p.getY(i), p.getZ(i)]);
        col.push([c.getX(i), c.getY(i), c.getZ(i)]);
      }
      return { draws: _n, seed: _seed, count: p.count, pos, col };
    })()
  `;
  return vm.runInContext(probe, ctx, { filename: 'groundPiece.probe.js' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ctx = makeEnv();
  const jobs = JSON.parse(process.argv[2] || '{}');
  const out = {};
  for (const [name, call] of Object.entries(jobs)) {
    if (name === 'atlasCells') {
      // 真的 buildAtlas 跑一遍（画布是空壳，格子算术是原件）
      out[name] = vm.runInContext('buildAtlas(); Atlas.cells', ctx);
    } else if (name === 'groundPiece') {
      out[name] = recordGroundPiece(ctx, call);
    } else {
      out[name] = record(ctx, name, call);
    }
  }
  process.stdout.write(JSON.stringify(out));
}
