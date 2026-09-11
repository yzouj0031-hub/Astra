"""把移植过的 builder 和 watertown.js 的原函数逐次调用对比。

    & "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" ^
        --background --python blender\\tests\\test_site_parity.py

要在 Blender 里跑（geo.py 依赖 bpy/bmesh/mathutils），内部再 shell 出 node
去执行 js_harness.mjs 取参考值。

比的不只是取数个数，而是**每一次 Batch.add 的原语、4x4 矩阵、颜色、uvBox**，
以及跑完之后的种子。这三样全对，才说明取数顺序和取数的用途都没错位。
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib.geo import Batch  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.lib import atlas  # noqa: E402
from blender.parts import plants, site  # noqa: E402

HARNESS = os.path.join(ROOT, "blender", "tests", "js_harness.mjs")
TOL = 1e-9

JOBS = {
    # 放最前面：buildAtlas 先跑，后面 buildPlaza 里的 uvOf('dock') 才有值
    "atlasCells": "buildAtlas()",
    "buildBanks": "buildBanks()",
    "buildPlaza": "buildPlaza()",
    "buildFields": "buildFields()",
    "buildMountains": "buildMountains()",
    "buildWillow": "buildWillow(0, 0)",
    "buildWillowBank": "buildWillow(12, 7, 1.05, true)",
    "buildCamphor": "buildCamphor(-7, 19, 1.1)",
    "groundPiece": [-380, 60, 6, 380],
}


def js_reference():
    proc = subprocess.run(
        ["node", HARNESS, json.dumps(JOBS)],
        capture_output=True, text=True, cwd=ROOT, shell=(os.name == "nt"),
    )
    if proc.returncode != 0:
        print(proc.stdout[-2000:])
        print(proc.stderr[-2000:])
        raise SystemExit("js_harness 跑挂了")
    return json.loads(proc.stdout)


def _batches(log):
    keys = ("wall", "roof", "wood", "stone", "glow", "foliage", "sign", "misc")
    bs = {}
    for k in keys:
        b = Batch(k)
        b.log = log          # 共用一份流水，才能和 JS 那边单条 LOG 的顺序对上
        bs[k] = b
    return bs


def run_python(name):
    """返回 (draws, seed, log)"""
    rng = Rng()
    log = []
    bs = _batches(log)
    reg = site.Registry()

    if name == "buildBanks":
        site.build_banks(bs, rng, reg)
    elif name == "buildPlaza":
        site.build_plaza(bs, rng, reg, atlas.uv_of)
    elif name == "buildFields":
        site.build_fields(bs["foliage"], rng)
    elif name == "buildMountains":
        site.build_mountains(bs["foliage"], rng)
    elif name == "buildWillow":
        plants.build_willow(bs["foliage"], rng, 0, 0)
    elif name == "buildWillowBank":
        plants.build_willow(bs["foliage"], rng, 12, 7, 1.05, True)
    elif name == "buildCamphor":
        plants.build_camphor(bs["foliage"], rng, -7, 19, 1.1)
    else:
        raise KeyError(name)
    return rng.calls, rng.seed, log


def compare_log(name, js_log, py_log):
    if len(js_log) != len(py_log):
        print(f"  FAIL {name}: 几何调用数 JS={len(js_log)} PY={len(py_log)}")
        return False
    for i, (j, p) in enumerate(zip(js_log, py_log)):
        j_geo, j_m, j_col, j_uv = j
        p_geo, p_m, p_col, p_uv = p
        if j_geo != p_geo:
            print(f"  FAIL {name}[{i}]: 原语 JS={j_geo} PY={p_geo}")
            return False
        for k in range(16):
            if abs(j_m[k] - p_m[k]) > TOL:
                print(f"  FAIL {name}[{i}]: 矩阵第 {k} 项 JS={j_m[k]!r} PY={p_m[k]!r}")
                return False
        for k in range(3):
            if abs(j_col[k] - p_col[k]) > TOL:
                print(f"  FAIL {name}[{i}]: 颜色 {'rgb'[k]} JS={j_col[k]!r} PY={p_col[k]!r}")
                return False
        if (j_uv is None) != (p_uv is None):
            print(f"  FAIL {name}[{i}]: uvBox JS={j_uv} PY={p_uv}")
            return False
        if j_uv is not None:
            for k in range(4):
                if abs(j_uv[k] - p_uv[k]) > TOL:
                    print(f"  FAIL {name}[{i}]: uvBox[{k}] JS={j_uv[k]!r} PY={p_uv[k]!r}")
                    return False
    return True


def check_ground_piece(ref):
    """groundPiece 不走 Batch，比真 PlaneGeometry 的逐顶点位置与颜色。"""
    rng = Rng()
    b = Batch("ground")
    site.ground_piece(b, rng, *JOBS["groundPiece"])

    ok = True
    if rng.calls != ref["draws"] or rng.seed != ref["seed"]:
        print(f"  FAIL groundPiece: draws JS={ref['draws']} PY={rng.calls} / "
              f"seed JS={ref['seed']} PY={rng.seed}")
        ok = False
    if len(b.verts) != ref["count"]:
        print(f"  FAIL groundPiece: 顶点数 JS={ref['count']} PY={len(b.verts)}")
        return False
    worst_p = worst_c = 0.0
    for i, (jp, jc) in enumerate(zip(ref["pos"], ref["col"])):
        pv, pc = b.verts[i], b.cols[i]
        worst_p = max(worst_p, max(abs(jp[k] - pv[k]) for k in range(3)))
        # Python 侧 cols 存的是线性值，JS 是原始显示值，比之前先编码回去
        pc_srgb = tuple(
            (v * 12.92) if v <= 0.0031308 else (1.055 * v ** (1 / 2.4) - 0.055)
            for v in pc
        )
        worst_c = max(worst_c, max(abs(jc[k] - pc_srgb[k]) for k in range(3)))
    # three.js 的顶点位置存在 Float32Array 里，参考值本身就是单精度量化过的，
    # 所以位置容差按 float32 在 |x|<=380 量级上的分辨率给（~3e-5）。
    if worst_p > 1e-4 or worst_c > 1e-6:
        print(f"  FAIL groundPiece: 顶点最大偏差 pos={worst_p:.3e} col={worst_c:.3e}")
        ok = False
    else:
        print(f"  ok  groundPiece  {ref['count']} 顶点, draws={rng.calls}, "
              f"pos偏差<{worst_p:.1e} col偏差<{worst_c:.1e}")
    return ok


def check_atlas(ref):
    """图集格子：JS 的 buildAtlas 在空壳画布上跑出来的 Atlas.cells，
    对 lib/atlas.py 算出来的同一张表。字形不比（PIL 和 canvas 本来就不同），
    比的是每一格的 uvBox —— 贴歪没贴歪全看这个。"""
    mine = atlas.cells()
    if set(mine) != set(ref):
        print(f"  FAIL atlas: 格子名对不上 少={sorted(set(ref) - set(mine))} "
              f"多={sorted(set(mine) - set(ref))}")
        return False
    worst = 0.0
    for key, box_ref in ref.items():
        for k in range(4):
            worst = max(worst, abs(box_ref[k] - mine[key][k]))
    if worst > TOL:
        print(f"  FAIL atlas: uvBox 最大偏差 {worst:.3e}")
        return False
    print(f"  ok  atlas            {len(mine)} 格全等（招牌 24 + 酒旗 4 + 匾 4）")
    return True


def main():
    ref = js_reference()
    ok = True
    for name in JOBS:
        if name == "atlasCells":
            ok &= check_atlas(ref[name])
            continue
        if name == "groundPiece":
            ok &= check_ground_piece(ref[name])
            continue
        r = ref[name]
        draws, seed, log = run_python(name)
        good = True
        if draws != r["draws"]:
            print(f"  FAIL {name}: 取数 JS={r['draws']} PY={draws}")
            good = False
        elif seed != r["seed"]:
            print(f"  FAIL {name}: 结束种子 JS={r['seed']} PY={seed}")
            good = False
        else:
            good = compare_log(name, r["log"], log)
        if good:
            print(f"  ok  {name:<16} draws={draws} 几何调用={len(log)} 种子={seed}")
        ok &= good

    print("PASS" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
