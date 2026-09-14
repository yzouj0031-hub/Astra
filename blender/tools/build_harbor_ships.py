"""维多利亚港停泊的船：1910 年代蒸汽客轮 + 中式帆船（大眼鸡），Blender 里自建，各导出一个 GLB。

    blender -b --factory-startup -P blender/tools/build_harbor_ships.py -- --outdir assets/vehicles

照旧的港区船（index.html「Moored vessels」）：船身沿本地 X、船头朝 +X，原点在船身中心，
水线在原点下 0.45 米（游戏里 boatRoot.y = 浪高 + 0.45）。偶数号是长 34、宽 9 的汽船，
奇数号是长 25、宽 7 的帆船 —— 原来那条帆船换成香港港口里真有的大眼鸡帆船（中式硬帆、竹撑条、高尾楼）。

这些船只在中远景（码头上、海上）出现，不做船舱内部。三角形压在一万出头。
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
WATER = -0.45


def hull_rings(stations, m=20, power=0.6):
    """stations: (x, 半宽, 舷顶 z, 船底 z)。U 形截面，顶边是甲板。"""
    rings = []
    for x, b, top, bot in vk.smooth_keys(stations, 3):
        ring = []
        for i in range(m + 1):
            a = math.pi * i / m
            ring.append(Vector((x, b * math.cos(a), top - (top - bot) * (math.sin(a) ** power))))
        rings.append(ring)
    return rings


def paint_hull(kit, faces, top_mat, boot_mat, bottom_mat, deck_mat, deck_z):
    for f in faces:
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.z > 0.75 and c.z > deck_z:
            f.material_index = kit.order.index(deck_mat)
        elif c.z < WATER - 0.02:
            f.material_index = kit.order.index(bottom_mat)
        elif boot_mat and c.z < WATER + 0.3:
            f.material_index = kit.order.index(boot_mat)
        else:
            f.material_index = kit.order.index(top_mat)


# ============================================================================ 蒸汽客轮
def steamer():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = vk.Kit(args.tex, args.texres)
    kit.plain("black", (0.018, 0.02, 0.024), rough=0.35)
    kit.plain("red", (vk.lin(120), vk.lin(34), vk.lin(28)), rough=0.6)
    kit.plain("white", (0.80, 0.79, 0.75), rough=0.4)
    kit.textured("planks", "planks_white", rough=0.6)
    kit.textured("deck", "deck_light", rough=0.75)   # wood_floor_deck 原图偏橙红，实拍像红漆屋顶
    kit.plain("buff", (vk.lin(196), vk.lin(150), vk.lin(80)), rough=0.5)
    kit.plain("window", (0.06, 0.09, 0.11), rough=0.1, emit=(0.02, 0.018, 0.012))
    kit.plain("iron", (0.10, 0.10, 0.11), metal=0.6, rough=0.5)
    kit.textured("teak", "teak_veneer")
    p = kit.part()

    st = [(-16.6, 2.8, 2.35, 0.2), (-15.5, 3.9, 2.25, -1.2), (-12, 4.45, 2.15, -1.6), (-4, 4.5, 2.1, -1.7),
          (5, 4.45, 2.15, -1.7), (11, 3.9, 2.35, -1.5), (14.8, 2.4, 2.75, -1.1), (16.8, 0.6, 3.1, -0.3), (17.2, 0.05, 3.2, 0.6)]
    paint_hull(kit, p.loft(hull_rings(st), "black"), "black", "white", "red", "deck", 1.9)
    # 舷窗一排
    for x in [i * 1.7 for i in range(-8, 9)]:
        for sgn in (-1, 1):
            b = 4.47 if abs(x) < 10 else 4.0
            p.cylinder((x, sgn * (b - 0.02), 1.15), (x, sgn * (b + 0.06), 1.15), 0.2, "window", seg=10)
    # 上层建筑：两层，白漆木板，一排窗
    for (x0, x1, z0, z1, w) in ((-9.5, 8.5, 2.1, 4.3, 7.0), (-5.5, 4.5, 4.3, 6.2, 5.6), (1.2, 4.2, 6.2, 7.9, 4.8)):
        p.box(((x0 + x1) / 2, 0, (z0 + z1) / 2), (x1 - x0, w, z1 - z0), "planks", bevel=0.05)
        p.box(((x0 + x1) / 2, 0, z1 + 0.08), (x1 - x0 + 0.6, w + 0.6, 0.16), "deck", bevel=0.03)
        n = int((x1 - x0) / 1.4)
        for k in range(n):
            x = x0 + 0.7 + k * (x1 - x0 - 1.4) / max(1, n - 1)
            for sgn in (-1, 1):
                p.box((x, sgn * (w / 2 + 0.02), z0 + (z1 - z0) * 0.55), (0.7, 0.05, 0.85), "window")
    # 驾驶台前窗
    for k in range(5):
        p.box((4.22, -1.6 + k * 0.8, 7.2), (0.05, 0.55, 0.7), "window")
    # 烟囱
    p.cylinder((-2.0, 0, 6.2), (-2.3, 0, 11.4), 1.15, "buff", seg=20, r2=1.05)
    p.cylinder((-2.3, 0, 11.4), (-2.35, 0, 12.4), 1.08, "black", seg=20, r2=1.06)
    for sgn in (-1, 1):
        p.cylinder((1.0, sgn * 2.2, 6.2), (1.0, sgn * 2.2, 7.6), 0.28, "white", seg=10)          # 通风筒
        p.torus((1.0, sgn * 2.2 + sgn * 0.2, 7.7), (0, 1, 0), 0.3, 0.1, 0.1, "white", nu=12, nv=6)
    # 前后桅与吊杆
    for x, h in ((11.5, 15.0), (-12.5, 13.0)):
        p.cylinder((x, 0, 2.2), (x, 0, h), 0.2, "teak", seg=10, r2=0.1)
        p.cylinder((x, 0, 3.2), (x - math.copysign(5.5, x), 0, 5.0), 0.1, "teak", seg=6)
        p.cylinder((x, 0, h), (math.copysign(17.0, x), 0, 3.0), 0.025, "iron", seg=4, caps=False)
    # 救生艇四条
    for x in (-7.5, -3.5):
        for sgn in (-1, 1):
            y = sgn * 3.35
            boat = hull_rings([(x - 2.2, 0.15, 6.9, 6.7), (x - 1.8, 0.55, 6.9, 6.35), (x, 0.7, 6.9, 6.3), (x + 1.8, 0.55, 6.9, 6.35), (x + 2.2, 0.15, 6.9, 6.7)], m=10)
            p.loft([[Vector((q.x, q.y + y, q.z)) for q in r] for r in boat], "white")
            for dx in (-1.6, 1.6):
                p.cylinder((x + dx, sgn * 2.8, 6.2), (x + dx, sgn * 3.35, 7.4), 0.06, "iron", seg=6)
    # 甲板栏杆：沿船壳的实际宽度和舷高走（固定 y=±4.3 的话船头船尾那段会探出船外、悬在水面上）
    keys = vk.smooth_keys(st, 3)
    for lo, hi in ((-15.5, -9.5), (8.5, 16.2)):
        seg = [(x, b, top) for x, b, top, bot in keys if lo <= x <= hi]
        for sgn in (-1, 1):
            for (xa, ba, ta), (xb, bb, tb) in zip(seg, seg[1:]):
                pa, pb = Vector((xa, sgn * (ba - 0.08), ta + 0.3)), Vector((xb, sgn * (bb - 0.08), tb + 0.3))
                mid, d = (pa + pb) / 2, pb - pa
                p.box(mid, (d.length + 0.02, 0.06, 0.55), "white", rot=Vector((1, 0, 0)).rotation_difference(d.normalized()).to_matrix())
    ob = kit.finish(p, "steamer", uv_scale=1.6)
    vk.report_and_export([ob], os.path.join(args.outdir, "harbor_steamer.glb"), "steamer", limit=(35.0, 9.5))   # 沿 X 建：先长后宽


# ============================================================================ 大眼鸡帆船
def junk():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = vk.Kit(args.tex, args.texres)
    kit.textured("planks", "weathered_planks", rough=0.8)
    kit.plain("tar", (0.05, 0.035, 0.025), rough=0.7)
    kit.textured("deck", "wood_floor_deck", rough=0.8)
    kit.textured("sail", "sail_rust", rough=0.95)
    kit.M["sail"].use_backface_culling = False
    kit.textured("bamboo", "bamboo_wall_02", rough=0.7)
    kit.plain("red", (vk.lin(150), vk.lin(40), vk.lin(28)), rough=0.5)
    kit.plain("white", (0.85, 0.83, 0.78), rough=0.5)
    kit.plain("eye", (0.02, 0.02, 0.02), rough=0.4)
    kit.plain("rope", (0.12, 0.10, 0.08), rough=0.8)
    p = kit.part()

    # 船头低、方头；船尾高高翘起
    st = [(-12.6, 2.6, 5.0, 1.6), (-11.6, 3.2, 4.2, -0.2), (-8, 3.5, 2.6, -1.1), (-2, 3.5, 2.1, -1.3),
          (4, 3.3, 2.1, -1.2), (8.5, 2.7, 2.4, -0.9), (11.3, 1.7, 2.9, -0.4), (12.4, 1.2, 3.2, 0.2)]
    paint_hull(kit, p.loft(hull_rings(st, power=0.8), "planks"), "planks", "tar", "tar", "deck", 1.8)
    # 船眼
    for sgn in (-1, 1):
        p.cylinder((10.6, sgn * 2.02, 2.3), (10.6, sgn * 2.14, 2.3), 0.42, "white", seg=14)
        p.cylinder((10.62, sgn * 2.1, 2.3), (10.62, sgn * 2.18, 2.3), 0.2, "eye", seg=12)
    # 尾楼与船篷
    p.box((-9.6, 0, 3.3), (4.4, 6.0, 1.6), "planks", bevel=0.05)
    p.box((-9.6, 0, 4.2), (5.0, 6.6, 0.18), "deck")
    p.box((-12.55, 0, 3.6), (0.2, 5.0, 2.6), "red")
    rings = []
    for x in (-6.8, -5.8, -3.2, -2.2):
        rings.append([Vector((x, 2.4 * math.cos(math.pi * i / 12), 2.1 + 1.6 * math.sin(math.pi * i / 12))) for i in range(13)])
    p.loft(rings, "bamboo", cap0=False, cap1=False, closed=False)
    # 舵
    p.box((-12.8, 0, 0.6), (0.9, 0.15, 3.2), "tar")

    # 三面硬帆：梯形帆面 + 竹撑条
    def battened(x, base, height, width, lean):
        grid = []
        rows, cols = 8, 4
        for r in range(rows + 1):
            v = r / rows
            w = width * (1.0 - 0.25 * v)
            x0 = x - w * 0.25 - lean * v
            z = base + height * v
            row = [Vector((x0 - w * c / cols, 0.3 * math.sin(math.pi * c / cols) * (1 - v * 0.5), z + 0.6 * v * (c / cols))) for c in range(cols + 1)]
            grid.append(row)
        p.loft(grid, "sail", cap0=False, cap1=False, closed=False)
        for r in range(0, rows + 1, 1):
            row = grid[r]
            p.cylinder(row[0] + Vector((0.3, 0, 0)), row[-1] - Vector((0.2, 0, 0)), 0.05, "bamboo", seg=5, caps=False)

    for x, h, w, mast_h in ((5.8, 12.5, 8.0, 17.0), (-1.2, 14.0, 9.5, 19.0), (-7.6, 9.0, 6.0, 13.5)):
        p.cylinder((x, 0, 1.8), (x, 0, mast_h), 0.24, "planks", seg=10, r2=0.12)
        battened(x + 0.5, 3.2, h, w, 0.8)
        p.cylinder((x, 0, mast_h), (x - w * 0.8, 0, 3.6), 0.02, "rope", seg=4, caps=False)
    ob = kit.finish(p, "junk", uv_scale=1.4)
    vk.report_and_export([ob], os.path.join(args.outdir, "harbor_junk.glb"), "junk", limit=(28.0, 7.2))   # 硬帆会探出船头船尾一点


steamer()
junk()
