"""阶段 1 里程碑 4：房子与石拱桥。

    & $B --background --python blender\\milestones\\m04_hall.py

看四样东西：
- 屋面是不是下凹的曲面（不是两块平斜板），瓦垄贴着曲面走
- 马头墙的三阶是不是贴着屋面高度递降
- 墙顶和屋面之间没有缝（addBody 的上边缘采样 roofYAt）
- 招牌/酒旗贴的是不是各自那一格

房子的位置是手摆的固定表，不是 layoutTown 算的 —— 那个还要等牌坊、
茶馆、宝塔移植完（它们夹在房子和柳树中间消耗随机数）。所以这张图看的是
单体形态对不对，不是镇子的最终布局。
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib import materials  # noqa: E402
from blender.lib.geo import Batch, to_blender  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.parts import hall, site  # noqa: E402

OUT = os.path.join(ROOT, "renders", "phase1_hall.png")
BATCH_KEYS = ("wall", "roof", "wood", "stone", "glow", "foliage", "sign", "misc")

# 沿河两排：北岸朝南（facing=PI），南岸朝北（facing=0）
HOUSES = [
    dict(x=-28, z=18.5, w=9.5, d=10.5, floors=2, facing=math.pi, shop=True,
         gable=True, balcony=True, signKind="board", signIdx=0),
    dict(x=-17, z=17.8, w=8.0, d=9.2, floors=1, facing=math.pi, shop=True,
         gable=False, signKind="flag", signIdx=0),
    dict(x=-7.5, z=18.2, w=9.0, d=10.0, floors=2, facing=math.pi, shop=True,
         gable=True, balcony=False, signKind="board", signIdx=6),
    dict(x=3.5, z=18.6, w=10.0, d=10.8, floors=2, facing=math.pi, shop=False,
         gable=True, balcony=True, signIdx=11),
    dict(x=15, z=17.6, w=8.5, d=9.4, floors=1, facing=math.pi, shop=True,
         gable=True, signKind="board", signIdx=13),
    dict(x=-24, z=-18.4, w=10.5, d=10.2, floors=2, facing=0, shop=True,
         gable=True, balcony=True, signKind="board", signIdx=2),
    dict(x=-12, z=-17.9, w=9.0, d=9.6, floors=2, facing=0, shop=False,
         gable=True, balcony=False, signIdx=8),
    dict(x=-1, z=-18.8, w=11.0, d=11.0, floors=2, facing=0, openGround=True,
         gable=True, signIdx=3),
    dict(x=11, z=-18.0, w=8.5, d=9.8, floors=1, facing=0, shop=True,
         gable=False, signKind="flag", signIdx=1),
]

BRIDGES = [
    dict(x=-4, z=0, axis="z", len=12, halfW=2.5, h=4.8, big=True),
    dict(x=-72, z=0, axis="z", len=11, halfW=2.1, h=3.6),
]


def look_at(obj, target_three):
    t = Vector(to_blender(target_three))
    obj.rotation_euler = (t - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    col_town = bpy.data.collections.new("Town")
    col_site = bpy.data.collections.new("Site")
    for c in (col_town, col_site):
        scene.collection.children.link(c)

    rng = Rng()
    reg = site.Registry()
    batches = {k: Batch(k.capitalize()) for k in BATCH_KEYS}
    ground = Batch("Ground")

    # 顺序照 layoutTown：桥 -> 驳岸 -> 房子，地面最后
    for b in BRIDGES:
        hall.build_bridge(batches, rng, reg, b)
    site.build_banks(batches, rng, reg)
    for o in HOUSES:
        hall.build_house(batches, rng, reg, o)
    site.build_ground(ground, rng)

    print(f"  随机流：{rng.calls} 次取数，结束种子 {rng.seed}")
    print(f"  灯笼位 {len(reg.lantern_spots)}，障碍 {len(reg.obstacles)}，桥 {len(reg.bridges)}")

    for key, b in batches.items():
        if not b.empty:
            obj = b.build(col_town, materials.for_batch_key(key))
            print(f"  {key:<8} {len(obj.data.vertices):>6} verts {len(obj.data.polygons):>6} faces")
    ground.build(col_site, materials.for_batch_key("ground"))

    # 水
    depth = 1.8
    wmat = materials.water_material()
    for p in site.WATER_PLANES:
        top_b = to_blender((p["x"], p["y"], p["z"]))
        bpy.ops.mesh.primitive_cube_add(size=1, location=(top_b[0], top_b[1],
                                                          top_b[2] - depth / 2))
        obj = bpy.context.active_object
        obj.name = p["name"]
        obj.scale = (p["w"], p["d"], depth)
        bpy.ops.object.transform_apply(scale=True)
        obj.data.materials.append(wmat)

    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(3.0)
    sun_data.color = (1.0, 0.94, 0.85)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(54), 0, math.radians(-118))
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 30.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = Vector(to_blender((-34.0, 16.0, -34.0)))
    scene.collection.objects.link(cam)
    scene.camera = cam
    look_at(cam, (-2.0, 2.0, 1.0))

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.68, 0.74, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.7
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    materials.setup_view_transform(scene)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("MILESTONE4 ->", OUT, os.path.exists(OUT))


if __name__ == "__main__":
    main()
