"""帆船：约 11 米的单桅木帆船（sloop），Blender 里自建，导出一个 GLB。

    blender -b --factory-startup -P blender/tools/build_sailboat.py -- --out assets/vehicles/sailboat.glb

照旧的 buildSailboat（index.html）：船身沿本地 X，船头朝 +X，原点在船身中心、水线在原点下 0.4 米
（游戏里 boat.g.y = 浪高 + 0.4），甲板约 1.1 米。长 11、宽 3.6。

主帆和前帆是独立节点 sail / jib，原点在旧的转轴上（主帆 x=1.2、y=2.2；前帆 x=1.35、y=2.2）。
游戏每帧给旧的 boat.sail / boat.jibM 设 rotation.y = -π/2 + 转舵量，接入时把这两个节点挂进新的转轴组，
补一个 +π/2，静止时帆顺着船身。帆杆放在主帆节点里，跟着帆一起摆（旧船的帆杆是死的）。

坐标：Blender Z 朝上、X 朝船头、Y 朝左舷；导出 glTF 后 X 不变、Z→Y、-Y→Z。
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
ap.add_argument("--out", required=True)
ap.add_argument("--tex", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "_src", "vehicles", "tex"))
ap.add_argument("--texres", type=int, default=512)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
kit = vk.Kit(args.tex, args.texres)
kit.plain("topsides", (vk.lin(28), vk.lin(52), vk.lin(84)), rough=0.3)        # 深海军蓝漆
kit.plain("boot", (0.85, 0.83, 0.78), rough=0.35)                               # 水线白带
kit.plain("bottom", (vk.lin(150), vk.lin(44), vk.lin(34)), rough=0.6)          # 船底防污红漆
kit.textured("deck", "wood_floor_deck", rough=0.7)
kit.textured("teak", "teak_veneer")
kit.textured("sailcloth", "linen_cream", rough=0.95)
kit.M["sailcloth"].use_backface_culling = False                                  # 帆是单层面，两面都要画
kit.plain("brass", (0.78, 0.60, 0.30), metal=1.0, rough=0.3)
kit.plain("rope", (0.10, 0.09, 0.08), rough=0.8)
kit.plain("glass", (0.12, 0.16, 0.18), rough=0.1)
kit.plain("navred", (0.8, 0.05, 0.04), rough=0.3, emit=(0.6, 0.02, 0.01))
kit.plain("navgreen", (0.05, 0.6, 0.2), rough=0.3, emit=(0.02, 0.45, 0.12))

WATER = -0.4
body = kit.part()

# ---------------------------------------------------------------- 船壳：沿 X 放样，截面是 U 形，顶边就是甲板
stations = [(-5.20, 1.10, 1.02, -0.35), (-4.60, 1.45, 1.02, -0.55), (-3.00, 1.74, 1.04, -0.85), (-1.00, 1.80, 1.08, -0.95),
            (1.00, 1.76, 1.13, -0.92), (3.00, 1.45, 1.22, -0.78), (4.60, 0.88, 1.34, -0.55), (5.50, 0.36, 1.43, -0.30),
            (5.90, 0.04, 1.48, 0.10)]
M_RING = 22
rings = []
for x, b, top, bot in vk.smooth_keys(stations, 3):
    ring = []
    for i in range(M_RING + 1):
        a = math.pi * i / M_RING
        s = math.sin(a)
        ring.append(Vector((x, b * math.cos(a), top - (top - bot) * (s ** 0.65))))
    rings.append(ring)
hull = body.loft(rings, "topsides", cap0=True, cap1=True)
for f in hull:
    c = f.calc_center_median()
    f.normal_update()
    if f.normal.z > 0.75 and c.z > 0.9:
        f.material_index = kit.order.index("deck")
    elif c.z < WATER - 0.02:
        f.material_index = kit.order.index("bottom")
    elif c.z < WATER + 0.14:
        f.material_index = kit.order.index("boot")
# 舷墙压条
for sgn in (-1, 1):
    rail = []
    for x, b, top, bot in vk.smooth_keys(stations[1:-1], 3):
        rail.append(vk.superellipse(0, top + 0.05, 0.10, 0.10, 0, n=6, e=2.0))
        rail[-1] = [Vector((x, sgn * (b - 0.02) + p.x, p.z)) for p in rail[-1]]
    body.loft(rail, "teak")

# ---------------------------------------------------------------- 船舱、座舱、舵
cab = [vk.superellipse(0, 1.42, w, 0.78, 0, n=20, e=3.5) for w in (1.6, 2.1, 2.1, 1.7)]
xs = (-2.7, -2.4, -0.7, -0.3)
body.loft([[Vector((x, p.x, p.z)) for p in r] for x, r in zip(xs, cab)], "teak")
for x in (-2.1, -1.5, -0.9):
    for sgn in (-1, 1):
        body.box((x, sgn * 1.04, 1.55), (0.36, 0.03, 0.20), "glass")
body.box((-1.5, 0, 1.84), (1.1, 1.3, 0.06), "deck", bevel=0.02)
body.box((-3.9, 0, 1.22), (2.0, 2.3, 0.08), "teak")               # 座舱地板
for sgn in (-1, 1):
    body.box((-3.9, sgn * 1.2, 1.36), (2.0, 0.07, 0.30), "teak", bevel=0.01)
wheel_c = Vector((-4.5, 0, 1.75))
body.cylinder((-4.7, 0, 1.2), wheel_c, 0.05, "teak", seg=8)
body.torus(wheel_c, (1, 0, 0), 0.42, 0.035, 0.035, "brass", nu=24, nv=6)
for k in range(8):
    a = math.pi * k / 4
    body.cylinder(wheel_c, wheel_c + Vector((0, math.cos(a), math.sin(a))) * 0.52, 0.022, "brass", seg=5)

# ---------------------------------------------------------------- 桅杆与索具
MAST = Vector((1.2, 0, 1.1))
TOP = Vector((1.2, 0, 11.6))
body.cylinder(MAST, TOP, 0.15, "teak", seg=12, r2=0.07)
body.cylinder((1.2, -1.6, 7.6), (1.2, 1.6, 7.6), 0.04, "teak", seg=6)                 # 撑臂
for end in ((5.75, 0, 1.45), (-5.15, 0, 1.08), (1.0, 1.72, 1.12), (1.0, -1.72, 1.12)):
    body.cylinder(TOP, end, 0.018, "rope", seg=4, caps=False)
for sgn in (-1, 1):
    body.cylinder((1.2, sgn * 1.6, 7.6), (1.0, sgn * 1.72, 1.12), 0.015, "rope", seg=4, caps=False)
# 栏杆
for x in (-4.6, -3.0, -1.0, 1.0, 3.0, 4.4):
    b = next(b for xx, b, t, bt in stations if xx >= x - 1e-6)
    top = next(t for xx, bb, t, bt in stations if xx >= x - 1e-6)
    for sgn in (-1, 1):
        body.cylinder((x, sgn * (b - 0.12), top), (x, sgn * (b - 0.12), top + 0.62), 0.025, "brass", seg=6)
for sgn in (-1, 1):
    pts = []
    for x, b, top, bot in vk.smooth_keys(stations[1:-2], 2):
        pts.append(Vector((x, sgn * (b - 0.12), top + 0.6)))
    for a, c in zip(pts, pts[1:]):
        body.cylinder(a, c, 0.012, "rope", seg=4, caps=False)
body.sphere((5.2, 0.45, 1.55), 0.09, "navgreen", nu=8, nv=5)   # 右舷绿（船头朝 +X 时右舷在 -Y）……
body.sphere((5.2, -0.45, 1.55), 0.09, "navred", nu=8, nv=5)
body_ob = kit.finish(body, "body", uv_scale=0.9)


# ---------------------------------------------------------------- 帆：带一点弧度的面片
def sail_patch(part, luff_bottom, luff_top, clew, camber, rows=8, cols=6, head_width=0.0):
    luff_bottom, luff_top, clew = Vector(luff_bottom), Vector(luff_top), Vector(clew)
    grid = []
    for r in range(rows + 1):
        v = r / rows
        a = luff_bottom.lerp(luff_top, v)
        foot = clew.lerp(luff_top, v * (1 - head_width))
        row = []
        for c in range(cols + 1):
            u = c / cols
            p = a.lerp(foot, u)
            p.y += camber * math.sin(math.pi * u) * (1 - v * 0.7)
            row.append(p)
        grid.append(row)
    return part.loft(grid, "sailcloth", cap0=False, cap1=False, closed=False)


sail = kit.part()
PIV = Vector((1.2, 0, 2.2))
sail_patch(sail, Vector((1.32, 0, 2.3)) - PIV, Vector((1.32, 0, 11.2)) - PIV, Vector((-4.25, 0, 2.3)) - PIV, camber=0.35)
sail.cylinder(Vector((1.25, 0, 2.2)) - PIV, Vector((-4.45, 0, 2.2)) - PIV, 0.075, "teak", seg=8)   # 帆杆
for v in (0.3, 0.55, 0.78):                                                                        # 帆骨
    sail.cylinder(Vector((1.32 - 0.1, 0, 2.3 + 8.9 * v)) - PIV, Vector((1.32 - 5.57 * (1 - v) * 0.55, 0, 2.3 + 8.9 * v)) - PIV, 0.012, "teak", seg=4)
sail_ob = kit.finish(sail, "sail")
sail_ob.location = PIV

jib = kit.part()
JPIV = Vector((1.35, 0, 2.2))
sail_patch(jib, Vector((5.55, 0, 1.6)) - JPIV, Vector((1.35, 0, 9.2)) - JPIV, Vector((1.7, 0, 2.05)) - JPIV, camber=0.22, rows=7, cols=5)
jib_ob = kit.finish(jib, "jib")
jib_ob.location = JPIV

vk.report_and_export([body_ob, sail_ob, jib_ob], args.out, "sailboat", limit=(11.6, 12.0))
