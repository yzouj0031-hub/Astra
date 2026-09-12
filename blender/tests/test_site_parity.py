"""把移植过的 builder 和 watertown.js 的原函数逐次调用对比。

    & "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" ^
        --background --python blender\\tests\\test_site_parity.py

要在 Blender 里跑（geo.py 依赖 bpy/bmesh/mathutils），内部再 shell 出 node
去执行 js_harness.mjs 取参考值。

比的不只是取数个数，而是**每一次 Batch.add 的原语、4x4 矩阵、颜色、uvBox**，
以及跑完之后的种子。这三样全对，才说明取数顺序和取数的用途都没错位。
"""

import json
import math
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib.geo import Batch  # noqa: E402
from blender.lib import rng as rng_mod  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.lib import atlas  # noqa: E402
from blender.parts import hall, plants, site, town  # noqa: E402

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
    # 房子的四种形态：临街铺面挂竖招牌 / 挂酒旗 / 民居带马头墙 / 底层敞开（茶馆那种）
    "houseShopBoard": ("buildHouse({x:-30,z:19,w:9.5,d:10.5,floors:2,facing:Math.PI,"
                       "shop:true,gable:true,balcony:true,signKind:'board',signIdx:5})"),
    "houseShopFlag": ("buildHouse({x:12,z:-20,w:8,d:9,floors:1,facing:0,"
                      "shop:true,gable:false,signKind:'flag',signIdx:2})"),
    "housePlain": ("buildHouse({x:-70,z:30,w:11,d:9,floors:2,facing:Math.PI/2,"
                   "shop:false,gable:true,balcony:false,signIdx:9})"),
    "houseOpen": ("buildHouse({x:5,z:40,w:12,d:11,floors:2,facing:0,"
                  "openGround:true,gable:true,signIdx:1})"),
    "bridgeSmall": "buildBridge({x:-72,z:0,axis:'z',len:11,halfW:2.1,h:3.6})",
    "bridgeBig": "buildBridge({x:-4,z:0,axis:'z',len:12,halfW:2.5,h:4.8,big:true})",
    "bridgeCross": "buildBridge({x:64,z:9,axis:'x',len:10,halfW:2.0,h:3.0})",
    "buildGate": "buildGate(1, 23)",
    "buildPagoda": "buildPagoda(L.hill.x, L.hill.z)",
    "buildTeahouse": "buildTeahouse()",
    "groundPiece": [-380, 60, 6, 380],
    # 整镇总装：一条随机流从头走到尾，一万多次几何调用逐个比
    "layoutTown": "layoutTown()",
    # 总装尾段：水面倒影片也在随机流里，漏了它地面的草色会整体错位
    "afterStreaks": "(function(){ layoutTown(); buildWater(); buildStreaks(); })()",
}


# Python 侧的同参数（要和上面 JOBS 里的 JS 字面量一字不差）
HOUSES = {
    "houseShopBoard": {"x": -30, "z": 19, "w": 9.5, "d": 10.5, "floors": 2,
                       "facing": math.pi, "shop": True, "gable": True,
                       "balcony": True, "signKind": "board", "signIdx": 5},
    "houseShopFlag": {"x": 12, "z": -20, "w": 8, "d": 9, "floors": 1,
                      "facing": 0, "shop": True, "gable": False,
                      "signKind": "flag", "signIdx": 2},
    "housePlain": {"x": -70, "z": 30, "w": 11, "d": 9, "floors": 2,
                   "facing": math.pi / 2, "shop": False, "gable": True,
                   "balcony": False, "signIdx": 9},
    "houseOpen": {"x": 5, "z": 40, "w": 12, "d": 11, "floors": 2, "facing": 0,
                  "openGround": True, "gable": True, "signIdx": 1},
}
BRIDGES = {
    "bridgeSmall": {"x": -72, "z": 0, "axis": "z", "len": 11, "halfW": 2.1, "h": 3.6},
    "bridgeBig": {"x": -4, "z": 0, "axis": "z", "len": 12, "halfW": 2.5, "h": 4.8,
                  "big": True},
    "bridgeCross": {"x": 64, "z": 9, "axis": "x", "len": 10, "halfW": 2.0, "h": 3.0},
}


REF_DIR = tempfile.mkdtemp(prefix="wt_ref_")


def js_reference():
    proc = subprocess.run(
        ["node", HARNESS, json.dumps(JOBS), REF_DIR],
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


def make_logging_batch(log):
    def factory(nm):
        b = Batch(nm)
        b.log = log
        return b
    return factory


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
    elif name in HOUSES:
        hall.build_house(bs, rng, reg, HOUSES[name])
    elif name in BRIDGES:
        hall.build_bridge(bs, rng, reg, BRIDGES[name])
    elif name == "buildGate":
        hall.build_gate(bs, rng, reg, 1, 23)
    elif name == "buildPagoda":
        hall.build_pagoda(bs, rng, reg, site.L["hill"]["x"], site.L["hill"]["z"],
                          site.hill_y)
    elif name == "layoutTown":
        town.layout_town(bs, rng, reg, make_logging_batch(log))
    elif name == "afterStreaks":
        factory = make_logging_batch(log)
        town.layout_town(bs, rng, reg, factory)
        town.build_streaks(factory("Streaks"), rng, reg)
    elif name == "buildTeahouse":
        # 茶馆自己那套 batch 也记进同一条流水
        hall.build_teahouse(bs, rng, reg, make_logging_batch(log))
    else:
        raise KeyError(name)
    return rng.calls, rng.seed, log


def read_log(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def compare_log(name, ref, py_log):
    if ref["count"] != len(py_log):
        print(f"  FAIL {name}: 几何调用数 JS={ref['count']} PY={len(py_log)}")
        return False
    for i, (j, p) in enumerate(zip(read_log(ref["file"]), py_log)):
        j_geo, j_m, j_col, j_uv, j_extra = j
        p_geo, p_m, p_col, p_uv, p_extra = p
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
        if not compare_extra(name, i, j_extra, p_extra):
            return False
    return True


def compare_extra(name, i, j_extra, p_extra):
    """挤出体比多边形顶点，圆柱比参数 —— 三角化方式两边本来就不同，
    比不了顶点，但造它的形状参数必须一模一样。"""
    if j_extra is None and p_extra is None:
        return True
    if (j_extra is None) != (p_extra is None):
        print(f"  FAIL {name}[{i}]: 一边有形状参数一边没有 JS={j_extra} PY={p_extra}")
        return False

    if "poly" in j_extra:
        jp, pp = j_extra["poly"], p_extra.get("poly", [])
        if len(jp) != len(pp):
            print(f"  FAIL {name}[{i}]: 多边形点数 JS={len(jp)} PY={len(pp)}")
            return False
        for k, (a, b) in enumerate(zip(jp, pp)):
            if abs(a[0] - b[0]) > TOL or abs(a[1] - b[1]) > TOL:
                print(f"  FAIL {name}[{i}]: 多边形第 {k} 点 JS={a} PY={b}")
                return False
        if abs(j_extra["depth"] - p_extra["depth"]) > TOL:
            print(f"  FAIL {name}[{i}]: 挤出深度 JS={j_extra['depth']} PY={p_extra['depth']}")
            return False
        return True

    for k in ("rt", "rb", "h", "rs", "ts", "tl", "open"):
        a, b = j_extra.get(k), p_extra.get(k)
        same = (a == b) if isinstance(a, bool) else abs(a - b) <= TOL
        if not same:
            print(f"  FAIL {name}[{i}]: 圆柱参数 {k} JS={a} PY={b}")
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
    for i, row in enumerate(read_log(ref["file"])):
        jp, jc = row[:3], row[3:]
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


def check_module_preroll(ref, data):
    """layoutTown 不是从种子起点开始的：模块级的星空和雨滴先消耗了 6200 个数。
    这条对不上，整座镇子的布局就全错。顺带比一下算出来的雨滴和星星本身 ——
    parts/weather.py 直接用它们。"""
    r = Rng()
    got = rng_mod.module_level(r)
    if r.seed != ref:
        print(f"  FAIL 模块级预消耗: JS={ref} PY={r.seed}")
        return False
    if len(got["rain"]) != data["rainN"] or len(got["stars"]) * 3 != data["starN"] * 3:
        print(f"  FAIL 模块级数量: 雨 JS={data['rainN']} PY={len(got['rain'])}")
        return False
    for i, jd in enumerate(data["rain"]):
        pd = got["rain"][i]
        for k in ("x", "y", "z", "v"):
            if abs(jd[k] - pd[k]) > TOL:
                print(f"  FAIL 雨滴[{i}].{k}: JS={jd[k]!r} PY={pd[k]!r}")
                return False
    for k in range(3):
        # 星星的坐标存在 Float32Array 里，按单精度分辨率比（半径 820）
        if abs(data["star0"][k] - got["stars"][0][k]) > 1e-3:
            print(f"  FAIL 星[0][{k}]: JS={data['star0'][k]!r} PY={got['stars'][0][k]!r}")
            return False
    print(f"  ok  模块级        {rng_mod.MODULE_LEVEL_DRAWS} 个数后种子 {r.seed}，"
          f"星 {len(got['stars'])} 雨 {len(got['rain'])} 逐值相等")
    return True


def main():
    ref = js_reference()
    ok = check_module_preroll(ref["_moduleSeed"], ref["_moduleData"])
    for name in JOBS:
        if name.startswith("_"):
            continue
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
            good = compare_log(name, r, log)
        if good:
            print(f"  ok  {name:<16} draws={draws} 几何调用={len(log)} 种子={seed}")
        ok &= good

    print("PASS" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
