"""阶段 1 里程碑 1：柳树与樟树。

    blender --background --python blender/milestones/m01_trees.py

顺带守两条不变量：每棵树消耗的随机数个数必须与 JS 一致（取数顺序被改坏时会炸）。
"""

import math
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib import materials  # noqa: E402
from blender.lib.geo import Batch  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.parts import plants  # noqa: E402

OUT = os.path.join(ROOT, "renders", "phase1_trees.png")


def check_draw_counts():
    """取数个数是移植正确性的第一道闸。"""
    cases = [
        ("willow free", lambda b, r: plants.build_willow(b, r, 0, 0), plants.WILLOW_DRAWS_FREE),
        ("willow bank", lambda b, r: plants.build_willow(b, r, 0, 0, 1.0, True), plants.WILLOW_DRAWS_BANK),
        ("camphor", lambda b, r: plants.build_camphor(b, r, 0, 0), plants.CAMPHOR_DRAWS),
    ]
    for label, fn, expect in cases:
        r = Rng()
        fn(Batch("scratch"), r)
        status = "ok " if r.calls == expect else "FAIL"
        print(f"  {status} {label:<12} draws={r.calls} expect={expect}")
        if r.calls != expect:
            raise SystemExit(f"{label} 取数个数对不上，取数顺序被改坏了")


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    col_plants = bpy.data.collections.new("Plants")
    scene.collection.children.link(col_plants)

    rng = Rng()
    batch = Batch("Trees")
    # 一排柳树 + 一棵樟树。位置是临时摆的，layoutTown 移植后换成镇子的真实坐标。
    plants.build_willow(batch, rng, -9, 0, 1.0, True)
    plants.build_willow(batch, rng, 0, 1.5, 1.05, False)
    plants.build_willow(batch, rng, 9, -0.5, 0.95, True)
    plants.build_camphor(batch, rng, 20, 2, 1.0)

    mat = materials.vertex_color_material()
    obj = batch.build(col_plants, mat)
    print(f"  trees mesh: {len(obj.data.vertices)} verts, {len(obj.data.polygons)} faces")

    # 地面
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    gm = bpy.data.materials.new("M_Ground")
    gm.use_nodes = True
    gb = gm.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (0.148, 0.196, 0.104, 1.0)  # C.grass 解码后
    gb.inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(gm)

    # 日光
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(2.0)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    scene.collection.objects.link(sun)

    # 相机：平视，看得清树冠和垂条
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 34.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (9.0, -40.0, 8.0)
    cam.rotation_euler = (math.radians(85), 0, math.radians(10))
    scene.collection.objects.link(cam)
    scene.camera = cam

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.62, 0.70, 1.0)   # 江南天色，偏灰蓝
    bg.inputs[1].default_value = 1.2
    scene.world = world
    return scene


def configure(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    materials.setup_view_transform(scene)


def main():
    check_draw_counts()
    scene = build_scene()
    configure(scene)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("MILESTONE1 ->", OUT, os.path.exists(OUT))


if __name__ == "__main__":
    main()
