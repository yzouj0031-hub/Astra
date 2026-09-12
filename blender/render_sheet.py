"""一次出一整组静帧：5 个机位 x 3 个时段。

    & $B --background --python blender\\render_sheet.py -- --samples 512 --scale 70

镇子只总装一次，然后按「时段 -> 机位」两层循环渲 —— 每张单独起一次
Blender 的话，15 次总装是白花的。

已经存在的图默认跳过（--force 覆盖），所以中途断了直接重跑就能接上。
每张渲完打印耗时和累计，方便估还要多久。
"""

import argparse
import math
import os
import sys
import time

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender import build_garden, render_still  # noqa: E402
from blender.lib import materials  # noqa: E402

CAMERAS = render_still.CAMERAS
TIMES = render_still.TIMES
OUT_DIR = os.path.join(ROOT, "renders", "sheet")


def apply_time(scene, sun, which):
    """只改灯光和世界，不新建物件 —— 三个时段循环用同一盏太阳。"""
    cfg = TIMES[which]
    energy, color, rot = cfg["sun"]
    sun.data.energy = energy
    sun.data.color = color
    sun.rotation_euler = tuple(math.radians(a) for a in rot)

    horizon, zenith, strength = cfg["world"]
    materials.gradient_world(scene, horizon, zenith, strength)

    materials.set_emission_strength("M_Lantern", cfg["lantern"])
    materials.set_emission_strength("M_Glow", cfg["glow"])

    if cfg.get("haze"):
        color, start, depth, strength = cfg["haze"]
        materials.setup_depth_haze(scene, color, start, depth, strength=strength)
    else:
        materials.clear_compositor(scene)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=512)
    ap.add_argument("--scale", type=int, default=70)
    ap.add_argument("--force", action="store_true", help="已存在的也重渲")
    ap.add_argument("--cams", default=None, help="逗号分隔，只渲这些机位")
    ap.add_argument("--times", default=None, help="逗号分隔，只渲这些时段")
    args = ap.parse_args(argv)

    cams = args.cams.split(",") if args.cams else list(CAMERAS)
    times = args.times.split(",") if args.times else ["day", "dusk", "night"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    t0 = time.time()
    stats = build_garden.build(scene, quiet=True)
    print(f"  总装 {stats['verts']} verts，{time.time() - t0:.1f}s", flush=True)

    render_still.add_cameras(scene, cams[0])
    render_still.set_time(scene, times[0])          # 建太阳和世界
    sun = bpy.data.objects["Sun"]

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"                     # 这台机器没有可用的 GPU 设备，
    scene.cycles.samples = args.samples             # 见 tools/probe_gpu.py
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = args.scale
    scene.render.image_settings.file_format = "PNG"
    materials.setup_view_transform(scene)

    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = [(t, c) for t in times for c in cams]
    done = 0
    started = time.time()

    for when, cam in jobs:
        out = os.path.join(OUT_DIR, f"{cam}_{when}.png")
        if os.path.exists(out) and not args.force:
            print(f"  跳过 {cam}_{when}（已存在）", flush=True)
            done += 1
            continue

        apply_time(scene, sun, when)
        scene.camera = bpy.data.objects[f"Cam_{cam}"]
        scene.render.filepath = out

        t = time.time()
        bpy.ops.render.render(write_still=True)
        dt = time.time() - t
        done += 1
        elapsed = time.time() - started
        left = (len(jobs) - done) * (elapsed / max(1, done))
        print(f"  [{done}/{len(jobs)}] {cam}_{when}  {dt/60:.1f} 分钟"
              f"（累计 {elapsed/60:.1f}，预计还要 {left/60:.0f} 分钟）", flush=True)

    print(f"SHEET DONE {done}/{len(jobs)} -> {OUT_DIR}", flush=True)


if __name__ == "__main__":
    main()
