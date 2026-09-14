"""水上飞机：1920 年代双翼浮筒机，Blender 里自建，导出一个 GLB。

    blender -b --factory-startup -P blender/tools/build_seaplane.py -- --out assets/vehicles/seaplane.glb

为什么自建：见 build_roadster.py。能不登录下载的水上飞机一架都没有；带浮筒的只在 Sketchfab。

尺寸、原点照旧的 buildSeaplane（index.html）：原点在机身中心，上翼展 12.4、下翼展 11.2，
浮筒底在原点下方约 2.2 米（游戏里 plane.y = 海面 + PLANE_FLOAT 2.0，浮筒刚好压进水里一点）。
螺旋桨是独立节点 prop，原点在桨毂（旧的 prop 组在机头 +Z 4.25），绕机身纵轴转；
游戏里把它挂进旧的 prop 组，旧组每帧转 rotation.z，模糊桨盘也还是旧的那片。

材质：蒙皮是亚麻布纹（Poly Haven rough_linen，染成奶油色），桨和支柱是柚木纹，座椅是皮革；
发动机罩、支柱接头是铝，饰带和舵面是红漆。坐标约定见 blender/lib/vehicle_kit.py。
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
import vehicle_kit as vk  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--tex", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "_src", "vehicles", "tex"))
ap.add_argument("--texres", type=int, default=512)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
kit = vk.Kit(args.tex, args.texres)
# 蒙皮用 linen_cream：Poly Haven 的 rough_linen 原图是蓝布（平均色 145,171,205），乘奶油色只会乘出灰蓝，
# 游戏里实拍两版都是冷灰的。所以另存一张只留布纹明暗、重新上成奶油色的（见 assets/LICENSES.md）
kit.textured("canvas", "linen_cream", rough=0.9)
kit.plain("trim", (vk.lin(168), vk.lin(62), vk.lin(48)), rough=0.45)
kit.plain("alu", (0.72, 0.73, 0.74), metal=1.0, rough=0.3)
kit.plain("dark", (0.02, 0.02, 0.022), metal=0.3, rough=0.5)
kit.textured("wood", "teak_veneer")
kit.textured("leather", "brown_leather")
kit.plain("floatpaint", (vk.lin(226), vk.lin(218), vk.lin(196)), rough=0.35)
kit.plain("glass", (0.6, 0.7, 0.75), rough=0.05, alpha=0.3)
kit.plain("navred", (0.8, 0.05, 0.04), rough=0.3, emit=(0.6, 0.02, 0.01))
kit.plain("navgreen", (0.05, 0.6, 0.2), rough=0.3, emit=(0.02, 0.45, 0.12))

body = kit.part()

# ---------------------------------------------------------------- 机身：(y, 中心 z, 宽, 高, 方度)
fus_keys = [(-3.30, 0.00, 0.98, 1.00, 2.6), (-2.70, 0.02, 1.06, 1.10, 3.2), (-1.60, 0.05, 1.08, 1.16, 4.0),
            (-0.20, 0.06, 1.04, 1.12, 4.0), (1.10, 0.14, 0.82, 0.92, 3.6), (2.40, 0.30, 0.46, 0.56, 3.0),
            (3.30, 0.42, 0.16, 0.20, 2.6)]
rings = [vk.superellipse(0, zc, w, h, y, n=36, e=e) for y, zc, w, h, e in vk.smooth_keys(fus_keys, 4)]
shell = body.loft(rings, "canvas")
# 座舱口：上面挖掉，壳加厚，看得见里面的皮座椅
cut = [f for f in shell if f.calc_center_median().z > 0.45 and -1.05 < f.calc_center_median().y < 0.15 and abs(f.calc_center_median().x) < 0.42]
bmesh.ops.delete(body.bm, geom=cut, context="FACES")
bmesh.ops.solidify(body.bm, geom=[f for f in body.bm.faces if f.is_valid], thickness=0.025)
body.torus((0, -0.45, 0.60), (0, 0, 1), 0.44, 0.035, 0.035, "leather", nu=28, nv=6)   # 座舱口的皮包边
body.box((0, -0.30, 0.10), (0.70, 0.60, 0.16), "leather", bevel=0.04, seg=2)
body.box((0, 0.02, 0.36), (0.70, 0.10, 0.50), "leather", bevel=0.04, seg=2, rot=Matrix.Rotation(math.radians(-10), 3, "X"))
body.box((0, -1.02, 0.46), (0.78, 0.05, 0.16), "wood", bevel=0.01)                     # 仪表板
# 小挡风
tilt = Matrix.Rotation(math.radians(-25), 3, "X")
body.box(Vector((0, -1.18, 0.74)), (0.52, 0.006, 0.24), "glass", rot=tilt)

# 红饰带：机身两侧一条贴着蒙皮的细带
for sx in (-1, 1):
    band = []
    for y, zc, w, h, e in vk.smooth_keys(fus_keys[:5], 3):
        x = sx * (w / 2 + 0.012)
        band.append([body.bm.verts.new((x, y, zc + 0.10)), body.bm.verts.new((x, y, zc + 0.24))])
    for a, b in zip(band, band[1:]):
        body.face((a[0], b[0], b[1], a[1]) if sx > 0 else (a[1], b[1], b[0], a[0]), "trim")

# ---------------------------------------------------------------- 发动机罩 + 星形发动机
cowl = [vk.superellipse(0, 0.0, d, d, y, n=32, e=2.0) for y, d in ((-3.30, 0.98), (-3.55, 1.02), (-3.78, 0.96), (-3.86, 0.80))]
body.loft(cowl, "alu", cap0=False, cap1=False)
body.loft([vk.superellipse(0, 0.0, 0.80, 0.80, -3.86, n=32, e=2.0), vk.superellipse(0, 0.0, 0.66, 0.66, -3.80, n=32, e=2.0)], "dark", cap0=False, cap1=True)
for i in range(7):
    a = 2 * math.pi * i / 7 + 0.2
    c = Vector((math.cos(a) * 0.26, -3.84, math.sin(a) * 0.26))
    tip = c + Vector((math.cos(a), 0, math.sin(a))) * 0.18
    body.cylinder(c, tip, 0.055, "alu", seg=10)
    for k in range(3):   # 散热片
        p = c + (tip - c) * (0.25 + 0.3 * k)
        body.cylinder(p - Vector((0, 0.015, 0)), p + Vector((0, 0.015, 0)), 0.072, "alu", seg=10, caps=False)
for sx in (-1, 1):   # 排气管
    body.cylinder((sx * 0.46, -3.2, -0.30), (sx * 0.52, -1.6, -0.42), 0.035, "dark", seg=8)

# ---------------------------------------------------------------- 翼
def wing(span, chord, thick, y_lead, z, dihedral=0.0, tip_trim=True):
    prof = vk.airfoil(chord, thick, n=14)
    rings = []
    stations = [i / 24 for i in range(25)]
    for s in stations:
        x = -span / 2 + span * s
        k = abs(2 * s - 1)
        # 翼尖收圆：最外 6% 弦长收窄、厚度收薄
        r = 1.0 if k < 0.94 else math.sqrt(max(0.0, 1 - ((k - 0.94) / 0.06) ** 2))
        r = max(r, 0.18)
        zz = z + abs(x) * math.tan(dihedral)
        rings.append([Vector((x, y_lead + chord * (1 - r) * 0.5 + yy * r, zz + zt * r)) for yy, zt in prof])
    faces = body.loft(rings, "canvas", cap0=True, cap1=True)
    if tip_trim:
        for f in faces:
            if abs(f.calc_center_median().x) > span / 2 - 0.55:
                f.material_index = kit.order.index("trim")
    return faces


wing(12.4, 1.85, 0.12, -1.28, 1.62)
wing(11.2, 1.65, 0.11, -1.00, -0.18, dihedral=math.radians(1.5))
# 上翼中段的油箱整流
body.loft([vk.superellipse(0, 1.72, w, 0.14, y, n=16, e=3.0) for y, w in ((-1.2, 0.2), (-0.9, 0.9), (0.2, 0.9), (0.5, 0.2))], "alu")

# 翼间支柱（木）+ 张线（钢）
for sx in (-1, 1):
    for xs in (4.4,):
        x = sx * xs
        body.cylinder((x, -0.95, 1.58), (x, -0.70, -0.12), 0.045, "wood", seg=8)
        body.cylinder((x, 0.22, 1.58), (x, 0.40, -0.12), 0.045, "wood", seg=8)
        body.cylinder((x, -0.95, 1.58), (sx * 1.2, -0.70, -0.12), 0.008, "dark", seg=4, caps=False)
        body.cylinder((x, 0.22, -0.10), (sx * 1.2, 0.30, 1.58), 0.008, "dark", seg=4, caps=False)
    # 机身到上翼的撑杆
    body.cylinder((sx * 0.46, -0.95, 0.52), (sx * 0.62, -0.95, 1.58), 0.035, "alu", seg=8)
    body.cylinder((sx * 0.44, 0.10, 0.52), (sx * 0.60, 0.22, 1.58), 0.035, "alu", seg=8)
    # 翼尖航行灯：左红右绿（机头朝 -Y，飞行员的左边是 +X）
    body.sphere((sx * 6.12, -0.60, 1.66), 0.08, "navred" if sx > 0 else "navgreen", nu=8, nv=5)

# ---------------------------------------------------------------- 尾翼
def surface(poly, x, thick, mat):
    """在 YZ 平面里的一块薄板（垂直尾翼、方向舵）。"""
    top = [body.bm.verts.new((x + thick, y, z)) for y, z in poly]
    bot = [body.bm.verts.new((x - thick, y, z)) for y, z in poly]
    body.face(top, mat)
    body.face(list(reversed(bot)), mat)
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        body.face((bot[i], bot[j], top[j], top[i]), mat)


prof = vk.airfoil(1.05, 0.08, n=10)
stab = []
for s in [i / 12 for i in range(13)]:
    x = -2.0 + 4.0 * s
    k = abs(2 * s - 1)
    r = 1.0 if k < 0.85 else max(0.25, math.sqrt(max(0.0, 1 - ((k - 0.85) / 0.15) ** 2)))
    stab.append([Vector((x, 2.55 + 1.05 * (1 - r) * 0.5 + yy * r, 0.45 + zt * r)) for yy, zt in prof])
body.loft(stab, "canvas")
surface([(2.55, 0.50), (3.20, 0.52), (3.35, 1.55), (3.05, 1.72), (2.80, 1.20)], 0.0, 0.035, "canvas")
surface([(3.36, 0.40), (3.72, 0.46), (3.80, 1.30), (3.55, 1.62), (3.37, 1.55)], 0.0, 0.03, "trim")   # 方向舵

# ---------------------------------------------------------------- 浮筒 + 撑杆
def pontoon(x):
    keys = []
    for y, w, top, bot in ((-2.75, 0.10, 0.02, 0.18), (-2.45, 0.62, 0.20, -0.14), (-1.80, 0.92, 0.30, -0.34),
                           (-0.40, 1.00, 0.34, -0.38), (0.25, 0.98, 0.33, -0.38), (0.30, 0.94, 0.32, -0.26),
                           (1.40, 0.72, 0.28, -0.12), (2.10, 0.20, 0.20, 0.08)):
        keys.append((y, w, top, bot))
    rings = []
    for y, w, top, bot in vk.smooth_keys(keys, 3):
        rings.append(vk.superellipse(x, -1.85 + (top + bot) / 2, w, top - bot, y - 0.35, n=24, e=3.2))
    faces = body.loft(rings, "floatpaint")
    for f in faces:
        c = f.calc_center_median()
        if c.z < -1.85 - 0.18:
            f.material_index = kit.order.index("trim")   # 水线下漆成红色
    body.cylinder((x, -2.40, -1.60), (x * 0.40, -1.35, -0.48), 0.045, "alu", seg=8)
    body.cylinder((x, -0.60, -1.55), (x * 0.40, -0.10, -0.45), 0.045, "alu", seg=8)
    body.cylinder((x, -2.40, -1.60), (x, -0.95, -0.20), 0.035, "alu", seg=8)
    body.cylinder((x, -0.60, -1.55), (x, 0.22, -0.20), 0.035, "alu", seg=8)


for sx in (-1, 1):
    pontoon(sx * 1.85)
body.cylinder((-1.85, -2.40, -1.55), (1.85, -2.40, -1.55), 0.03, "alu", seg=8)
body.cylinder((-1.85, -0.60, -1.50), (1.85, -0.60, -1.50), 0.03, "alu", seg=8)

body_ob = kit.finish(body, "body")

# ---------------------------------------------------------------- 螺旋桨（独立节点，原点在桨毂）
prop = kit.part()
prop.loft([vk.superellipse(0, 0, d, d, y, n=20, e=2.0) for y, d in ((0.06, 0.30), (-0.06, 0.28), (-0.20, 0.18), (-0.30, 0.02))], "alu", cap0=True, cap1=True)
for side in (-1, 1):
    rings = []
    for i in range(10):
        t = i / 9
        rr = 0.12 + t * 1.02
        chord = 0.20 * (1 - 0.55 * t) + 0.04
        twist = math.radians(35 - 22 * t) * side
        c, s = math.cos(twist), math.sin(twist)
        pts = []
        for yy, zt in vk.airfoil(chord, 0.14, n=6):
            ly, lz = yy - chord / 2, zt
            pts.append(Vector((ly * c - lz * s, ly * s + lz * c, side * rr)))
        rings.append([Vector((p.x, p.y, p.z)) for p in pts])
    prop.loft(rings, "wood")
prop_ob = kit.finish(prop, "prop")
prop_ob.location = (0, -4.25, 0)

vk.report_and_export([body_ob, prop_ob], args.out, "seaplane", limit=(12.6, 8.6))   # 旧机从尾舵到桨尖约 8.4 米
