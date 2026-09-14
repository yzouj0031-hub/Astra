"""电车：维多利亚港的 1920 年代香港双层电车 + 雨港的单层珊瑚色电车，Blender 里自建。

    blender -b --factory-startup -P blender/tools/build_trams.py -- --outdir assets/vehicles

两辆都沿本地 X 建，原点在路面（轮子踩在 z=0）、车身中心：
- tram_hk.glb：长 11、宽 2.4，照港区旧电车（index.html「Tram rails and one moving car」，沿 X、原点在路面）
- tram_rainport.glb：长 7.7、宽 2.7，旧车沿 Z；接入时绕 Y 转 90°（两头对称，转哪边都一样）

窗户用深色玻璃加一点暖色自发光，雨港夜景里车窗是亮的（旧车窗户就是发光的色块）。
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


def base_kit(body_rgb, panel_rgb, window_emit):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = vk.Kit(args.tex, args.texres)
    kit.plain("body", body_rgb, rough=0.35)
    kit.plain("panel", panel_rgb, rough=0.4)
    kit.plain("dark", (0.02, 0.022, 0.024), metal=0.4, rough=0.5)
    kit.plain("window", (0.10, 0.12, 0.12), rough=0.08, emit=window_emit)
    kit.textured("teak", "teak_veneer")
    kit.plain("brass", (0.78, 0.60, 0.30), metal=1.0, rough=0.3)
    kit.plain("roof", (0.62, 0.62, 0.58), rough=0.7)
    kit.plain("lamp", (1.0, 0.92, 0.7), rough=0.2, emit=(1.0, 0.8, 0.45))
    return kit


def rounded_box(p, x0, x1, z0, z1, w, mat, e=6.0, n=24):
    """两头圆角的车厢：沿 X 放样的超椭圆截面，端头收一点。"""
    keys = [(x0, w * 0.86), (x0 + 0.35, w), (x1 - 0.35, w), (x1, w * 0.86)]
    rings = [vk.superellipse(0, (z0 + z1) / 2, ww, z1 - z0, 0, n=n, e=e) for _, ww in keys]
    return p.loft([[Vector((x, q.x, q.z)) for q in r] for (x, _), r in zip(keys, rings)], mat)


def windows(p, x0, x1, z0, z1, half_w, count, mat="window", frame="panel"):
    pitch = (x1 - x0) / count
    for k in range(count):
        cx = x0 + pitch * (k + 0.5)
        for sgn in (-1, 1):
            p.box((cx, sgn * (half_w + 0.012), (z0 + z1) / 2), (pitch * 0.78, 0.03, z1 - z0), mat)
            p.box((cx + pitch / 2, sgn * (half_w + 0.02), (z0 + z1) / 2), (0.07, 0.04, z1 - z0 + 0.08), frame)


def truck(p, xs, half_track):
    for x in xs:
        p.box((x, 0, 0.62), (2.4, half_track * 2 + 0.2, 0.28), "dark", bevel=0.03)
        for dx in (-0.8, 0.8):
            for sgn in (-1, 1):
                p.cylinder((x + dx, sgn * half_track - 0.08, 0.42), (x + dx, sgn * half_track + 0.08, 0.42), 0.42, "dark", seg=16)
                p.torus((x + dx, sgn * (half_track + 0.09), 0.42), (0, 1, 0), 0.3, 0.03, 0.03, "brass", nu=16, nv=5)


# ============================================================================ 香港双层电车
def hk():
    kit = base_kit((vk.lin(34), vk.lin(84), vk.lin(58)), (vk.lin(226), vk.lin(214), vk.lin(178)), (0.05, 0.04, 0.025))
    p = kit.part()
    L, W = 11.0, 2.4
    # 下层车厢：下半截墨绿、上半截奶油色窗带
    rounded_box(p, -L / 2 + 0.3, L / 2 - 0.3, 0.8, 1.9, W, "body")
    rounded_box(p, -L / 2 + 0.3, L / 2 - 0.3, 1.9, 3.05, W - 0.04, "panel")
    windows(p, -L / 2 + 1.4, L / 2 - 1.4, 2.0, 2.85, W / 2 - 0.02, 7)
    # 两头的开放平台 + 楼梯
    for sgn in (-1, 1):
        x = sgn * (L / 2 - 0.55)
        p.box((x, 0, 0.9), (1.1, W - 0.1, 0.12), "teak")
        p.box((sgn * (L / 2 - 0.08), 0, 1.35), (0.08, W - 0.2, 1.0), "body")
        p.box((sgn * (L / 2 - 0.1), 0, 2.45), (0.05, 1.2, 0.8), "window")
        for k in range(6):   # 楼梯踏步
            p.box((sgn * (L / 2 - 0.35 - k * 0.12), 0.65, 1.0 + k * 0.33), (0.3, 0.9, 0.05), "teak")
        p.sphere((sgn * (L / 2 - 0.02), 0, 1.25), 0.14, "lamp", nu=10, nv=6)
    # 上层：奶油色车厢，一排窗，墨绿腰线
    p.box((0, 0, 3.12), (L - 0.2, W + 0.1, 0.14), "body", bevel=0.03)
    rounded_box(p, -L / 2 + 0.2, L / 2 - 0.2, 3.2, 4.55, W - 0.02, "panel")
    windows(p, -L / 2 + 0.6, L / 2 - 0.6, 3.55, 4.35, W / 2 - 0.01, 9)
    for sgn in (-1, 1):
        p.box((0, sgn * (W / 2 + 0.01), 3.38), (L - 0.6, 0.03, 0.22), "body")
    # 车顶：微拱
    roof = []
    for x in (-L / 2 + 0.05, -L / 2 + 0.4, L / 2 - 0.4, L / 2 - 0.05):
        roof.append([Vector((x, (W / 2 + 0.12) * math.cos(math.pi * i / 12), 4.6 + 0.16 * math.sin(math.pi * i / 12))) for i in range(13)])
    p.loft(roof, "roof")
    # 集电杆
    p.box((0, 0, 4.82), (0.9, 0.5, 0.14), "dark")
    p.cylinder((0.2, 0, 4.9), (-3.4, 0, 7.8), 0.045, "dark", seg=6)
    p.sphere((-3.45, 0, 7.84), 0.08, "brass", nu=8, nv=5)
    # 路牌
    for sgn in (-1, 1):
        p.box((sgn * (L / 2 - 0.05), 0, 4.1), (0.06, 1.3, 0.34), "dark")
    truck(p, (-1.3, 1.3), 1.0)
    p.box((0, 0, 0.78), (L - 0.6, W - 0.3, 0.1), "dark")
    ob = kit.finish(p, "tram_hk", uv_scale=1.0)
    vk.report_and_export([ob], os.path.join(args.outdir, "tram_hk.glb"), "tram_hk", limit=(11.4, 2.8))   # 沿 X 建：先长后宽


# ============================================================================ 雨港单层电车
def rainport():
    kit = base_kit((vk.lin(214), vk.lin(106), vk.lin(94)), (vk.lin(222), vk.lin(224), vk.lin(194)), (0.9, 0.62, 0.3))
    p = kit.part()
    L, W = 7.7, 2.7
    rounded_box(p, -L / 2, L / 2, 0.7, 1.85, W, "body")
    rounded_box(p, -L / 2 + 0.05, L / 2 - 0.05, 1.85, 2.9, W - 0.02, "panel")
    windows(p, -L / 2 + 0.7, L / 2 - 0.7, 1.95, 2.72, W / 2 - 0.01, 5)
    for sgn in (-1, 1):
        p.box((sgn * (L / 2 + 0.01), 0, 2.35), (0.04, 2.0, 0.7), "window")
        p.box((sgn * (L / 2 + 0.03), 0, 1.5), (0.05, 2.4, 0.12), "brass")
        for y in (-0.8, 0.8):
            p.sphere((sgn * (L / 2 + 0.02), y, 1.12), 0.15, "lamp", nu=10, nv=6)
    roof = []
    for x in (-L / 2 - 0.1, -L / 2 + 0.3, L / 2 - 0.3, L / 2 + 0.1):
        roof.append([Vector((x, (W / 2 + 0.12) * math.cos(math.pi * i / 12), 2.95 + 0.2 * math.sin(math.pi * i / 12))) for i in range(13)])
    p.loft(roof, "roof")
    p.box((0, 0, 3.25), (3.2, 1.8, 0.16), "dark")
    # 受电弓：菱形架
    for a, b in (((-0.6, 0, 3.3), (0, 0, 4.0)), ((0.6, 0, 3.3), (0, 0, 4.0)), ((0, 0, 4.0), (-0.5, 0, 4.45)), ((0, 0, 4.0), (0.5, 0, 4.45))):
        p.cylinder(a, b, 0.035, "dark", seg=6)
    p.box((0, 0, 4.48), (0.12, 1.4, 0.06), "brass")
    truck(p, (-2.4, 2.4), 1.15)
    ob = kit.finish(p, "tram_rainport", uv_scale=1.0)
    vk.report_and_export([ob], os.path.join(args.outdir, "tram_rainport.glb"), "tram_rainport", limit=(8.2, 3.0))   # 两头的保险杠探出一点


hk()
rainport()
