"""整镇总装。

    & "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" ^
        --background --python blender\\build_garden.py

生成顺序照 watertown.js:1108 的 init()：
    （模块级：星空 + 雨滴，先吃掉 6200 个随机数）
    buildAtlas -> makeMaterials -> layoutTown -> buildWater
    -> buildStreaks -> buildGround -> commitBatches
其中 buildAtlas / makeMaterials / buildWater 不消耗随机数，
buildStreaks 每片消耗一个 —— 少走这一段，地面的逐顶点草色就全错。

物件按 Collection 分组（Hall / Plants / Lamps / Water / Site / Streaks），
2B 烘焙时要按组筛选，2A 里也方便单独隐藏（比如掀掉屋顶看室内）。
"""

import math
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from blender.lib import detail, materials, rng as rng_mod  # noqa: E402
from blender.lib.geo import BATCH_KEYS, Batch, to_blender  # noqa: E402
from blender.lib.rng import Rng  # noqa: E402
from blender.parts import lamps, site, town  # noqa: E402

# 哪个 batch 进哪个 Collection
COLLECTION_OF = {
    "wall": "Hall", "roof": "Hall", "wood": "Hall", "stone": "Hall",
    "sign": "Hall", "misc": "Hall", "glow": "Hall",
    "foliage": "Plants",
}
WATER_DEPTH = 1.8      # 水体厚度：Volume Absorption 要有厚度才有水色


def new_collection(scene, name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


def build(scene, quiet=False, bevel=True):
    """把整座镇子生成到当前场景，返回统计信息。

    bevel=True 时给建筑和石作加倒角（见 lib/detail.py）：现实里没有数学上的
    完美尖边，每条边挂住一道细高光，是「看着像东西」和「看着像建模」的分界线。
    """
    cols = {name: new_collection(scene, name)
            for name in ("Hall", "Plants", "Lamps", "Water", "Site", "Teahouse")}

    rng = Rng()
    rng_mod.module_preroll(rng)          # 星空 + 雨滴，6200 个数

    reg = site.Registry()
    batches = {k: Batch(k.capitalize()) for k in BATCH_KEYS}
    th = town.layout_town(batches, rng, reg, Batch)

    streaks = Batch("Streaks")
    town.build_streaks(streaks, rng, reg)   # 只走随机流，几何默认不进场景

    ground = Batch("Ground")
    site.build_ground(ground, rng)

    lantern_b = Batch("Lanterns")
    lamps.build_lanterns(lantern_b, batches["wood"], reg)

    stats = {"draws": rng.calls, "seed": rng.seed,
             "lanterns": len(reg.lantern_spots),
             "obstacles": len(reg.obstacles),
             "bridges": len(reg.bridges), "verts": 0}

    def emit(batch, key, collection):
        obj = batch.build(cols[collection], materials.for_batch_key(key))
        if obj:
            stats["verts"] += len(obj.data.vertices)
            if not quiet:
                print(f"  {batch.name:<12} {len(obj.data.vertices):>7} verts "
                      f"{len(obj.data.polygons):>7} faces  -> {collection}")
        return obj

    for key, b in batches.items():
        emit(b, key, COLLECTION_OF[key])
    emit(ground, "ground", "Site")
    emit(lantern_b, "lantern", "Lamps")
    # 茶馆上半截单独一组：原作靠它做「走进去变透明」，这里用来掀顶看室内
    for key, b in th.items():
        emit(b, key, "Teahouse")

    build_water(cols["Water"])

    if bevel:
        stats["beveled"] = detail.refine_scene(
            [cols["Hall"], cols["Teahouse"], cols["Lamps"], cols["Site"]], quiet=quiet)
    return stats


def build_water(collection):
    """两片水面。JS 是单面 plane，这里做成闭合水体（见 materials.water_material）。"""
    mat = materials.water_material()
    for p in site.WATER_PLANES:
        top = to_blender((p["x"], p["y"], p["z"]))
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(top[0], top[1], top[2] - WATER_DEPTH / 2))
        obj = bpy.context.active_object
        obj.name = p["name"]
        obj.scale = (p["w"], p["d"], WATER_DEPTH)
        bpy.ops.object.transform_apply(scale=True)
        obj.data.materials.append(mat)
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        collection.objects.link(obj)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stats = build(bpy.context.scene)
    print(f"  随机流 {stats['draws']} 次取数，结束种子 {stats['seed']}")
    print(f"  灯笼 {stats['lanterns']}，障碍 {stats['obstacles']}，"
          f"桥 {stats['bridges']}，合计 {stats['verts']} verts")

    out = os.path.join(ROOT, "renders", "town.blend")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)


if __name__ == "__main__":
    main()
