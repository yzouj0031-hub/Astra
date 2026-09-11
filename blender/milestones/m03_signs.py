"""阶段 1 里程碑 3：招牌字图集贴到牌子上。

    python blender\\tools\\make_atlas.py          # 先用系统 Python 画图集
    & $B --background --python blender\\milestones\\m03_signs.py

看的是渡口那块牌子（buildPlaza 里的真几何，走的是真 uvBox）：
字要正、不能镜像、不能糊、不能串到隔壁格子。
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib import atlas, materials  # noqa: E402
from blender.lib.geo import Batch, to_blender  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.parts import site  # noqa: E402

OUT = os.path.join(ROOT, "renders", "phase1_signs.png")
BATCH_KEYS = ("wall", "roof", "wood", "stone", "glow", "foliage", "sign", "misc")


def look_at(obj, target_three):
    t = Vector(to_blender(target_three))
    obj.rotation_euler = (t - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    col = bpy.data.collections.new("Site")
    scene.collection.children.link(col)

    rng = Rng()
    reg = site.Registry()
    batches = {k: Batch(k.capitalize()) for k in BATCH_KEYS}

    site.build_banks(batches, rng, reg)
    site.build_plaza(batches, rng, reg, atlas.uv_of)

    for key, b in batches.items():
        if not b.empty:
            b.build(col, materials.for_batch_key(key))

    # 牌子那块 UV 应该落在 dock 格子里
    sign_obj = bpy.data.objects["Sign"]
    uv = sign_obj.data.uv_layers["UVMap"]
    us = [d.uv[0] for d in uv.data]
    vs = [d.uv[1] for d in uv.data]
    want = atlas.uv_of("dock")
    print(f"  牌子 UV 范围 u[{min(us):.4f},{max(us):.4f}] v[{min(vs):.4f},{max(vs):.4f}]")
    print(f"  dock 格子    u[{want[0]:.4f},{want[2]:.4f}] v[{want[1]:.4f},{want[3]:.4f}]")
    assert abs(min(us) - want[0]) < 1e-9 and abs(max(us) - want[2]) < 1e-9
    assert abs(min(vs) - want[1]) < 1e-9 and abs(max(vs) - want[3]) < 1e-9

    # 地面
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -0.02))
    ground = bpy.context.active_object
    ground.name = "GroundPlane"
    gm = bpy.data.materials.new("M_Flat")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.21, 0.19, 0.14, 1.0)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(gm)

    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(4.0)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-70))
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 85.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = Vector(to_blender((-41.4, 2.55, 12.2)))
    scene.collection.objects.link(cam)
    scene.camera = cam
    look_at(cam, (-42.5, 2.35, 7.6))

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.58, 0.64, 0.70, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.5
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    materials.setup_view_transform(scene)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("MILESTONE3 ->", OUT, os.path.exists(OUT))


if __name__ == "__main__":
    main()
