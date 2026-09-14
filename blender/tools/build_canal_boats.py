"""旅行地区的船：烟雨渡乌篷船 + 雨港的河船与夜航渡轮，Blender 里自建，各导出一个 GLB。

    blender -b --factory-startup -P blender/tools/build_canal_boats.py -- --outdir assets/vehicles

乌篷船照 journeys/watertown.js 的 makeBoat：船身沿本地 X（±3.4）、宽 ±0.85，原点在船底中心，船舷高 0.75；
乌篷在船中偏前（x≈0.3），船夫站船尾 x≈-2.3，橹（单支长桨）的转轴在 (-2.9, 1.05, 0.35)。
橹是独立节点 oar，接入时挂进旧的 oar 组，游戏每帧给那个组转 rotation.y，照样摇。
船夫这轮不换（路人那轮统一换），船头灯笼游戏里另挂，这里不建。

雨港两条照 journeys/rainport.js 的 makeBoat：旧船沿 Z，这里沿 X 建，接入时转 90°；
原点在船身中心，水线约在 z=0。窗户暖色自发光（雨港是夜景）。

坐标约定见 blender/lib/vehicle_kit.py（Blender Z 朝上、X 朝船头）。
"""
import argparse
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
import bpy  # noqa: E402
import vehicle_kit as vk  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--outdir", required=True)
ap.add_argument("--tex", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "_src", "vehicles", "tex"))
ap.add_argument("--texres", type=int, default=512)
args = ap.parse_args(argv)


def hull_rings(stations, m=16, power=0.7):
    rings = []
    for x, b, top, bot in vk.smooth_keys(stations, 3):
        rings.append([Vector((x, b * math.cos(math.pi * i / m), top - (top - bot) * (math.sin(math.pi * i / m) ** power))) for i in range(m + 1)])
    return rings


# ============================================================================ 乌篷船
def wupeng():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = vk.Kit(args.tex, args.texres)
    kit.textured("hull", "planks_tung", rough=0.55)
    kit.textured("deck", "weathered_planks", rough=0.8)
    kit.textured("mat", "bamboo_black", rough=0.85)
    kit.M["mat"].use_backface_culling = False
    kit.textured("bamboo", "bamboo_wall_02", rough=0.7)
    kit.plain("iron", (0.05, 0.05, 0.05), metal=0.4, rough=0.6)
    kit.plain("rope", (0.18, 0.15, 0.10), rough=0.8)
    p = kit.part()

    # 船头船尾都略翘，尖头；船底浅
    st = [(-3.42, 0.08, 0.98, 0.62), (-3.1, 0.52, 0.86, 0.16), (-2.2, 0.8, 0.77, 0.02), (0.0, 0.86, 0.74, 0.0),
          (2.0, 0.8, 0.77, 0.02), (3.0, 0.5, 0.86, 0.16), (3.42, 0.08, 1.0, 0.62)]
    faces = p.loft(hull_rings(st), "hull")
    for f in faces:
        f.normal_update()
        if f.normal.z > 0.8:
            f.material_index = kit.order.index("deck")
    # 舷边压条 + 横梁（座板）
    for sgn in (-1, 1):
        rail = [vk.superellipse(0, top + 0.02, 0.07, 0.06, 0, n=6, e=2) for x, b, top, bot in vk.smooth_keys(st[1:-1], 3)]
        pts = [x for x, b, top, bot in vk.smooth_keys(st[1:-1], 3)]
        bs = [b for x, b, top, bot in vk.smooth_keys(st[1:-1], 3)]
        p.loft([[Vector((x, sgn * (b - 0.02) + q.x, q.z)) for q in r] for x, b, r in zip(pts, bs, rail)], "deck")
    for x in (-2.4, -1.2, 1.6, 2.4):
        p.box((x, 0, 0.62), (0.16, 1.5 if abs(x) < 2 else 1.3, 0.05), "deck")
    p.box((0.0, 0, 0.5), (4.6, 1.4, 0.04), "deck")                    # 舱底板

    # 乌篷：两段半圆拱，竹篾编成，外面刷黑；拱骨是竹条
    def arch(x0, x1, r, z0):
        rings = []
        for x in (x0, x0 + 0.06, x1 - 0.06, x1):
            rings.append([Vector((x, r * math.cos(math.pi * i / 14), z0 + r * 0.95 * math.sin(math.pi * i / 14))) for i in range(15)])
        p.loft(rings, "mat", cap0=False, cap1=False, closed=False)
        for x in (x0 + 0.03, (x0 + x1) / 2, x1 - 0.03):
            for i in range(14):
                a, b = math.pi * i / 14, math.pi * (i + 1) / 14
                p.cylinder((x, (r + 0.02) * math.cos(a), z0 + (r + 0.02) * 0.95 * math.sin(a)),
                           (x, (r + 0.02) * math.cos(b), z0 + (r + 0.02) * 0.95 * math.sin(b)), 0.018, "bamboo", seg=4, caps=False)

    arch(-0.95, 0.55, 0.84, 0.74)
    arch(0.55, 1.65, 0.80, 0.74)          # 前段略小，可以推叠进后段
    # 船尾橹架
    p.cylinder((-2.9, 0.35, 0.74), (-2.9, 0.35, 1.02), 0.04, "iron", seg=6)
    body = kit.finish(p, "body", uv_scale=0.5)

    # 橹：长桨，原点在橹架上的转轴
    o = kit.part()
    PIV = Vector((-2.9, -0.35, 1.05))
    o.cylinder(Vector((-2.9, -0.35, 1.05)) - PIV, Vector((-5.1, -0.9, 0.2)) - PIV, 0.035, "deck", seg=6)          # 橹身往后下方伸进水
    o.box(Vector((-5.3, -0.95, 0.05)) - PIV, (0.55, 0.05, 0.16), "deck", bevel=0.01)                                 # 橹板
    o.cylinder(Vector((-2.9, -0.35, 1.05)) - PIV, Vector((-1.9, -0.1, 1.35)) - PIV, 0.03, "deck", seg=6)            # 橹柄
    o.cylinder(Vector((-1.9, -0.1, 1.35)) - PIV, Vector((-1.9, -0.1, 0.8)) - PIV, 0.008, "rope", seg=4, caps=False)  # 橹绳
    oar = kit.finish(o, "oar")
    oar.location = PIV
    vk.report_and_export([body, oar], os.path.join(args.outdir, "wupeng.glb"), "wupeng", limit=(9.3, 2.0))   # 船身 6.8 米，橹从船尾往后伸 2 米多


# ============================================================================ 雨港：河船 / 夜航渡轮
def rainport_boat(name, length, beam, hull_rgb, cabin_len):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = vk.Kit(args.tex, args.texres)
    kit.plain("hull", hull_rgb, rough=0.4)
    kit.plain("bottom", (0.05, 0.05, 0.06), rough=0.6)
    kit.textured("deck", "wood_floor_deck", rough=0.75)
    kit.textured("cabin", "planks_white", rough=0.6)
    kit.plain("roof", (vk.lin(58), vk.lin(104), vk.lin(117)), rough=0.5)
    kit.plain("window", (0.12, 0.1, 0.07), rough=0.1, emit=(0.95, 0.66, 0.3))
    kit.plain("rail", (0.75, 0.74, 0.70), metal=0.6, rough=0.35)
    kit.plain("tyre", (0.03, 0.03, 0.03), rough=0.9)
    p = kit.part()
    h = length / 2
    st = [(-h, beam * 0.36, 0.9, 0.2), (-h + 0.5, beam * 0.48, 0.85, -0.5), (-h * 0.3, beam / 2, 0.85, -0.7),
          (h * 0.4, beam * 0.48, 0.9, -0.65), (h * 0.8, beam * 0.3, 1.05, -0.4), (h, 0.05, 1.2, 0.3)]
    for f in p.loft(hull_rings(st, m=18), "hull"):
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.z > 0.8:
            f.material_index = kit.order.index("deck")
        elif c.z < -0.05:
            f.material_index = kit.order.index("bottom")
    # 船舱
    cx = -h * 0.15
    p.box((cx, 0, 1.55), (cabin_len, beam * 0.72, 1.3), "cabin", bevel=0.06)
    rings = []
    for x in (cx - cabin_len / 2 - 0.25, cx - cabin_len / 2, cx + cabin_len / 2, cx + cabin_len / 2 + 0.25):
        rings.append([Vector((x, (beam * 0.42) * math.cos(math.pi * i / 10), 2.2 + 0.25 * math.sin(math.pi * i / 10))) for i in range(11)])
    p.loft(rings, "roof")
    n = max(2, int(cabin_len / 0.9))
    for k in range(n):
        x = cx - cabin_len / 2 + 0.5 + k * (cabin_len - 1.0) / max(1, n - 1)
        for sgn in (-1, 1):
            p.box((x, sgn * beam * 0.365, 1.65), (0.55, 0.03, 0.55), "window")
    p.box((cx + cabin_len / 2 + 0.01, 0, 1.65), (0.03, beam * 0.5, 0.55), "window")
    # 栏杆与护舷轮胎
    for sgn in (-1, 1):
        p.box((h * 0.25, sgn * beam * 0.45, 1.25), (h * 0.9, 0.04, 0.05), "rail")
        for x in (-h * 0.5, 0, h * 0.4):
            p.torus((x, sgn * beam * 0.5, 0.55), (0, 1, 0), 0.22, 0.07, 0.07, "tyre", nu=14, nv=6)
    ob = kit.finish(p, name, uv_scale=1.0)
    vk.report_and_export([ob], os.path.join(args.outdir, name + ".glb"), name, limit=(length + 0.3, beam + 0.3))


wupeng()
rainport_boat("rainport_boat", 8.6, 3.6, (vk.lin(156), vk.lin(101), vk.lin(93)), 2.6)
rainport_boat("rainport_ferry", 11.2, 3.6, (vk.lin(62), vk.lin(121), vk.lin(128)), 5.0)
