"""阶段 1 里程碑 2：场地（地面、驳岸、广场、菜畦、远山、河水）。

    & "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" ^
        --background --python blender\\milestones\\m02_site.py

随机流说明：真实的消费顺序是 layoutTown 里
    桥 -> 驳岸 -> 沿河房子 -> 支流房子 -> 广场 -> 牌坊 -> 茶馆 -> 老樟树
    -> 柳树 -> 宝塔 -> 远山 -> 菜畦 -> 灯笼，最后 init 里 水 -> 地面
房子/牌坊/茶馆/宝塔还没移植，所以这里只按已移植的零件顺序跑一遍。
等 hall.py 到位，物件的随机抖动会整体重排 —— 这是预期内的，
不是移植错了。真实坐标以 build_garden.py 为准。
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
from blender.parts import site  # noqa: E402

OUT = os.path.join(ROOT, "renders", "phase1_site.png")

BATCH_KEYS = ("wall", "roof", "wood", "stone", "glow", "foliage", "sign", "misc")


def collection(scene, name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


def build_water(col):
    """JS 那边是两张单面 plane（watertown.js:534）。这里改成闭合实体：
    Volume Absorption 要有厚度才能按深度累积水色，单面片是没有体积的。
    水面高度仍是 y=-0.8，只是往下补了 1.8 米的水体。"""
    depth = 1.8
    mat = materials.water_material()
    for p in site.WATER_PLANES:
        top_b = to_blender((p["x"], p["y"], p["z"]))
        bpy.ops.mesh.primitive_cube_add(size=1, location=(top_b[0], top_b[1],
                                                          top_b[2] - depth / 2))
        obj = bpy.context.active_object
        obj.name = p["name"]
        obj.scale = (p["w"], p["d"], depth)      # three 的 x/z 尺寸 -> blender 的 x/y
        bpy.ops.object.transform_apply(scale=True)
        obj.data.materials.append(mat)
        for c in obj.users_collection:
            c.objects.unlink(obj)
        col.objects.link(obj)


def look_at(obj, target_three):
    t = Vector(to_blender(target_three))
    obj.rotation_euler = (t - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    col_site = collection(scene, "Site")
    col_water = collection(scene, "Water")
    col_plants = collection(scene, "Plants")

    rng = Rng()
    reg = site.Registry()
    batches = {k: Batch(k.capitalize()) for k in BATCH_KEYS}
    ground = Batch("Ground")

    site.build_banks(batches, rng, reg)
    site.build_plaza(batches, rng, reg)
    site.build_mountains(batches["foliage"], rng)
    site.build_fields(batches["foliage"], rng)
    site.build_ground(ground, rng)

    print(f"  随机流：共 {rng.calls} 次取数，结束种子 {rng.seed}")
    print(f"  灯柱 {len(reg.lantern_spots)} 处，障碍 {len(reg.obstacles)} 处")

    total = 0
    for key, b in batches.items():
        if b.empty:
            continue
        target = col_plants if key == "foliage" else col_site
        obj = b.build(target, materials.for_batch_key(key))
        total += len(obj.data.vertices)
        print(f"  {key:<8} {len(obj.data.vertices):>6} verts  "
              f"{len(obj.data.polygons):>6} faces")
    gobj = ground.build(col_site, materials.for_batch_key("ground"))
    total += len(gobj.data.vertices)
    print(f"  {'ground':<8} {len(gobj.data.vertices):>6} verts  "
          f"{len(gobj.data.polygons):>6} faces")
    print(f"  合计 {total} verts")

    # 顶点色与 UV 都在（2B 的前置条件）
    for obj in (gobj, bpy.data.objects["Stone"]):
        assert obj.data.color_attributes.get("Col"), f"{obj.name} 丢了顶点色"
        assert obj.data.uv_layers.get("UVMap"), f"{obj.name} 丢了 UV"

    build_water(col_water)

    # 日光：斜后侧低角度，江南阴天不要太硬
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 2.6
    sun_data.angle = math.radians(3.5)
    sun_data.color = (1.0, 0.95, 0.86)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(58), 0, math.radians(-125))
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 35.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = Vector(to_blender((-46.0, 7.5, -24.0)))
    scene.collection.objects.link(cam)
    scene.camera = cam
    look_at(cam, (26.0, 0.5, 2.0))

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.60, 0.66, 0.72, 1.0)
    bg.inputs[1].default_value = 1.6
    scene.world = world

    # 雨雾：远山要被压淡，江南的空气不是真空
    scene.world.use_nodes = True
    return scene


def configure(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT
    materials.setup_view_transform(scene)


def main():
    scene = build_scene()
    configure(scene)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("MILESTONE2 ->", OUT, os.path.exists(OUT))


if __name__ == "__main__":
    main()
