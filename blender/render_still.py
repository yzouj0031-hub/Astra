"""阶段 2A：静帧出图。

    & $B --background --python blender\\render_still.py -- --cam canal --time day
    & $B --background --python blender\\render_still.py -- --cam bridge --time night --samples 1024 --scale 100

机位固化在下面的 CAMERAS 里（文档要求：别每次手摆）。昼夜是一个开关，
改的是世界环境 + 太阳强度 + 灯笼/窗纸的自发光强度 —— 几何一个字不动。

迭代期默认 128 采样 + 降噪 + 50% 分辨率；出图加 --samples 1024 --scale 100。
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender import build_garden  # noqa: E402
from blender.lib import materials  # noqa: E402
from blender.lib.geo import Batch, to_blender  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.lib import rng as rng_mod  # noqa: E402
from blender.parts import weather  # noqa: E402

# 机位：three 空间坐标（和 parts/*.py 一致），(位置, 看向, 焦距)
CAMERAS = {
    # 船上视角，顺着河道看大拱桥
    "canal": ((-38.0, 3.2, -1.2), (-6.0, 3.2, 0.0), 35.0),
    # 岸上看桥与两排房子
    "bridge": ((-16.0, 6.5, 17.0), (-4.5, 2.6, 0.5), 40.0),
    # 广场与茶馆
    "teahouse": ((34.0, 7.0, 2.0), (21.0, 3.5, 17.0), 38.0),
    # 山上的宝塔，远景带整个镇子
    "pagoda": ((-64.0, 34.0, 44.0), (-112.0, 22.0, 84.0), 50.0),
    # 全镇鸟瞰
    "overview": ((-86.0, 62.0, -74.0), (0.0, 6.0, 12.0), 35.0),
}

# 昼夜：太阳(强度,色温,角度) / 世界(颜色,强度) / 自发光(灯笼,窗纸)
TIMES = {
    "day": {
        "sun": (3.0, (1.0, 0.95, 0.87), (58, 0, -118)),
        "world": ((0.62, 0.68, 0.74), 1.7),
        "lantern": 2.0, "glow": 0.6,
    },
    "dusk": {
        "sun": (1.6, (1.0, 0.72, 0.45), (12, 0, -150)),
        "world": ((0.36, 0.34, 0.40), 0.9),
        "lantern": 14.0, "glow": 3.0,
    },
    "night": {
        "sun": (0.06, (0.62, 0.72, 1.0), (34, 0, 60)),      # 月光
        "world": ((0.045, 0.055, 0.085), 0.5),
        "lantern": 28.0, "glow": 6.5,
    },
}


def look_at(obj, target_three):
    t = Vector(to_blender(target_three))
    obj.rotation_euler = (t - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_cameras(scene, active):
    """五个机位都建成物件，选一个当活动相机。"""
    for name, (loc, target, lens) in CAMERAS.items():
        data = bpy.data.cameras.new(f"Cam_{name}")
        data.lens = lens
        cam = bpy.data.objects.new(f"Cam_{name}", data)
        cam.location = Vector(to_blender(loc))
        scene.collection.objects.link(cam)
        look_at(cam, target)
        if name == active:
            scene.camera = cam


def set_time(scene, which):
    cfg = TIMES[which]

    energy, color, rot = cfg["sun"]
    data = bpy.data.lights.new("Sun", type="SUN")
    data.energy = energy
    data.color = color
    data.angle = math.radians(2.5)
    sun = bpy.data.objects.new("Sun", data)
    sun.rotation_euler = tuple(math.radians(a) for a in rot)
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*cfg["world"][0], 1.0)
    bg.inputs[1].default_value = cfg["world"][1]
    scene.world = world

    # 自发光强度：灯笼本身就是光源，夜里全靠它们
    materials.set_emission_strength("M_Lantern", cfg["lantern"])
    materials.set_emission_strength("M_Glow", cfg["glow"])


def add_weather(scene, cam_three, raining, drops_count):
    """雨丝 + 雨雾。雨只下在相机周围（原作也是 +-22 米一个笼子）。"""
    col = bpy.data.collections.new("Weather")
    scene.collection.children.link(col)

    # 雨滴用模块级算出来的那 1000 滴（与原作同一批数）
    r = Rng()
    drops = rng_mod.module_level(r)["rain"]

    center = (cam_three[0], cam_three[2])
    if drops_count:
        batch = Batch("Rain")
        n = weather.build_rain(batch, drops, center, drops_count, cam_three)
        obj = batch.build(col, materials.rain_material())
        obj.visible_shadow = False      # 一千片细条的碎影只会把画面弄脏
        print(f"  雨丝 {n} 条")

    # 雨雾：一个罩住镇子和远山的体积块
    b = weather.mist_bounds(center)
    bpy.ops.mesh.primitive_cube_add(size=1, location=to_blender(
        ((b["x0"] + b["x1"]) / 2, (b["y0"] + b["y1"]) / 2, (b["z0"] + b["z1"]) / 2)))
    mist = bpy.context.active_object
    mist.name = "Mist"
    mist.scale = (b["x1"] - b["x0"], b["z1"] - b["z0"], b["y1"] - b["y0"])
    bpy.ops.object.transform_apply(scale=True)
    mist.data.materials.append(
        materials.mist_material(density=weather.mist_density(raining)))
    mist.visible_shadow = False
    for c in list(mist.users_collection):
        c.objects.unlink(mist)
    col.objects.link(mist)
    print(f"  雨雾密度 {weather.mist_density(raining):.5f}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--cam", default="canal", choices=sorted(CAMERAS))
    ap.add_argument("--time", default="day", choices=sorted(TIMES))
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--scale", type=int, default=50, help="分辨率百分比")
    ap.add_argument("--rain", action="store_true", help="下雨：雨丝 + 更浓的雨雾")
    ap.add_argument("--mist", action="store_true", help="只要雾，不要雨丝")
    ap.add_argument("--drops", type=int, default=1000, help="雨丝条数（最多 1000）")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    stats = build_garden.build(scene, quiet=True)
    print(f"  镇子：{stats['verts']} verts，灯笼 {stats['lanterns']} 盏，"
          f"随机流 {stats['draws']} 次取数")

    add_cameras(scene, args.cam)
    set_time(scene, args.time)

    if args.rain or args.mist:
        add_weather(scene, CAMERAS[args.cam][0], args.rain,
                    args.drops if args.rain else 0)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = args.scale
    scene.render.image_settings.file_format = "PNG"
    materials.setup_view_transform(scene)

    suffix = "_rain" if args.rain else ("_mist" if args.mist else "")
    out = args.out or os.path.join(ROOT, "renders",
                                   f"2a_{args.cam}_{args.time}{suffix}.png")
    scene.render.filepath = out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("RENDER ->", out, os.path.exists(out))


if __name__ == "__main__":
    main()
