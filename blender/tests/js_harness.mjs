/**
 * 在 node 里跑 watertown.js 的**原件**，把每个 builder 的几何调用流水导出来。
 *
 *   node blender/tests/js_harness.mjs '<jobs json>' <输出目录>
 *
 * 做法
 * ----
 * 1. three.js 用 index.html 里内嵌的那份真 r128（Color.lerp、PlaneGeometry
 *    的顶点顺序、ExtrudeGeometry 的参数都要真的）。
 * 2. watertown.js 的**整个模块体**（到最后那句 init() 为止）原样跑一遍。
 *    只有 init() 不跑 —— 它要 WebGL 和 DOM。这一步很重要：模块级的星空
 *    和雨滴两个循环会先消耗 6200 个随机数，layoutTown 并不是从种子起点开始的。
 * 3. 模块加载完之后，把 Batch.prototype.add 换成记账版。box()/shape() 最终
 *    都落到 add，所以一处就够；B 里那些已经造好的 Batch 实例也一并生效。
 * 4. 通过模块内的一个 direct eval（__wt.evalIn）调用具体的 builder ——
 *    这样能读写模块作用域里的 _seed、rnd、lanternSpots 等等。
 *
 * 换句话说：除了「不画东西」，跑的全是原件。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadThree() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = html.indexOf('Three.js Authors');
  if (at < 0) throw new Error('index.html 里找不到内嵌的 three.js');
  const open = html.lastIndexOf('<script>', at);
  const close = html.indexOf('</script>', at);
  const sandbox = { globalThis: null, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(html.slice(html.indexOf('>', open) + 1, close), sandbox,
                  { filename: 'three.r128.js' });
  if (!sandbox.THREE) throw new Error('three.js 没挂到全局');
  return sandbox.THREE;
}

function moduleBody() {
  const src = fs.readFileSync(path.join(ROOT, 'journeys', 'watertown.js'), 'utf8');
  const a = src.indexOf("'use strict';");
  const b = src.lastIndexOf('init();');
  if (a < 0 || b < 0) throw new Error('watertown.js 的结构变了，切不出模块体');
  return src.slice(a, b);
}

/** 装好模块并把 Batch 换成记账版，返回可执行模块内表达式的 evalIn。 */
export function makeEnv() {
  const T = loadThree();
  const noop = () => {};
  const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
  const ctx = {
    THREE: T, console, Math, Object, Array, Number, String, JSON, Date, Map, Set,
    Float32Array, Uint16Array, Uint32Array, ArrayBuffer, isNaN, parseFloat, parseInt,
    document: {
      createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d,
                              addEventListener: noop, appendChild: noop }),
      getElementById: () => null,
      body: { appendChild: noop, style: {} },
      addEventListener: noop,
    },
    window: { innerWidth: 1280, innerHeight: 720, addEventListener: noop,
              devicePixelRatio: 1 },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    setTimeout: () => 0,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  vm.runInContext(
    `const __THREE = THREE;\n(function(THREE){\n${moduleBody()}\n` +
    `globalThis.__wt = { evalIn: (s) => eval(s) };\n})(__THREE);`,
    ctx, { filename: 'watertown.body.js' });

  // 记账版 Batch.add（定义在模块作用域里，才看得见 G 和 T）
  ctx.__wt.evalIn(`
    globalThis.__LOG = [];
    globalThis.__geoInfo = function(g){
      for (const k of Object.keys(G)) if (G[k] === g) return [k, null];
      if (g.type === 'ExtrudeGeometry') {
        return ['extrude', { poly: g.parameters.shapes.curves.map(c => [c.v1.x, c.v1.y]),
                             depth: g.parameters.options.depth }];
      }
      if (g.type === 'CylinderGeometry') {
        const p = g.parameters;
        return ['tube', { rt: p.radiusTop, rb: p.radiusBottom, h: p.height,
                          rs: p.radialSegments, open: p.openEnded,
                          ts: p.thetaStart, tl: p.thetaLength }];
      }
      return [g.type || 'unknown', null];
    };
    Batch.prototype.add = function(geo, m, color, uvBox){
      const [name, extra] = __geoInfo(geo);
      const c = (color && color.isColor) ? color : new T.Color(color);
      __LOG.push([name, Array.from(m.elements), [c.r, c.g, c.b], uvBox || null, extra]);
    };
    'patched'
  `);
  return ctx;
}

const SEED0 = 20260906;

/** 从干净状态跑一个 builder。日志写文件，stdout 只回元信息。 */
export function record(ctx, name, callExpr, outDir) {
  const meta = ctx.__wt.evalIn(`
    (() => {
      _seed = ${SEED0};
      __LOG.length = 0;
      lanternSpots.length = 0; obstacles.length = 0; bridges.length = 0;
      signCounter = 0;
      let n = 0;
      const orig = rnd;
      rnd = function(){ n++; return orig(); };
      try { (${callExpr}); } finally { rnd = orig; }
      return { draws: n, seed: _seed, count: __LOG.length,
               lanterns: lanternSpots.length, obstacles: obstacles.length };
    })()
  `);
  const file = path.join(outDir, `${name}.jsonl`);
  const log = ctx.__wt.evalIn('__LOG');
  fs.writeFileSync(file, log.map(e => JSON.stringify(e)).join('\n'));
  meta.file = file;
  return meta;
}

/** 模块级（星空 + 雨滴）消耗完之后的状态 —— layoutTown 的真实起点。 */
export function moduleLevelSeed(ctx) {
  return ctx.__wt.evalIn('_seed');
}

/** groundPiece 返回真 Mesh，比逐顶点位置与颜色。 */
export function recordGroundPiece(ctx, args, outDir) {
  const meta = ctx.__wt.evalIn(`
    (() => {
      _seed = ${SEED0};
      let n = 0;
      const orig = rnd;
      rnd = function(){ n++; return orig(); };
      const m = groundPiece(${args.join(',')});
      rnd = orig;
      const p = m.geometry.attributes.position, c = m.geometry.attributes.color;
      const rows = [];
      for (let i = 0; i < p.count; i++)
        rows.push([p.getX(i), p.getY(i), p.getZ(i), c.getX(i), c.getY(i), c.getZ(i)]);
      globalThis.__ROWS = rows;
      return { draws: n, seed: _seed, count: p.count };
    })()
  `);
  const file = path.join(outDir, 'groundPiece.jsonl');
  fs.writeFileSync(file, ctx.__wt.evalIn('__ROWS').map(r => JSON.stringify(r)).join('\n'));
  meta.file = file;
  return meta;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jobs = JSON.parse(process.argv[2] || '{}');
  const outDir = process.argv[3] || path.join(ROOT, 'blender', 'tests', '_ref');
  fs.mkdirSync(outDir, { recursive: true });

  const ctx = makeEnv();
  const out = { _moduleSeed: moduleLevelSeed(ctx) };
  for (const [name, call] of Object.entries(jobs)) {
    if (name === 'atlasCells') {
      out[name] = ctx.__wt.evalIn('buildAtlas(); Atlas.cells');
    } else if (name === 'groundPiece') {
      out[name] = recordGroundPiece(ctx, call, outDir);
    } else {
      out[name] = record(ctx, name, call, outDir);
    }
  }
  process.stdout.write(JSON.stringify(out));
}
