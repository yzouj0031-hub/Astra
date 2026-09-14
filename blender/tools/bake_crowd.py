"""路人版：把拼好的角色 GLB（头、衣服、头发……多个网格多种材质）合成一个网格、烘成一张贴图。

    blender -b --factory-startup -P blender/tools/bake_crowd.py -- --in ped.glb --out ped_baked.glb [--size 512]

为什么：compose_player.py 出的角色有 6~10 个网格/材质，three 里每个材质一次绘制。
港区 80 个路人就是七八百次绘制，手机扛不住。合成一个网格、一张贴图之后，一个人一次绘制。

做法：
1. 所有网格 join 成一个（顶点组跟着走，蒙皮不丢），挂回同一副骨架
2. 新建一套 UV，Smart UV Project 铺满一张图
3. 用 Cycles 把原材质的「颜色」（DIFFUSE 只取 COLOR，不带光照）烘到新 UV 上
4. 换成只有这一张图的单一材质，导出 GLB（不带动画，动画和玩家共用 anims.glb）

烘焙在 CPU 上跑，512² 一个人十几秒。
"""
import argparse
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--samples", type=int, default=4)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)
scene = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("输入里没有网格")

# ---- 1. 合成一个网格 -------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "crowd_body"
print(f"[bake] 合成 {len(meshes)} 个网格 -> 1，材质槽 {len(body.data.materials)}")

# ---- 2. 新 UV -----------------------------------------------------------------------------
src_uv = body.data.uv_layers.active.name
bake_uv = body.data.uv_layers.new(name="BakeUV")
body.data.uv_layers.active = bake_uv
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, scale_to_bounds=True)
bpy.ops.object.mode_set(mode="OBJECT")

# ---- 3. 烘颜色 ----------------------------------------------------------------------------
img = bpy.data.images.new("crowd_atlas", args.size, args.size, alpha=False)
for mat in body.data.materials:
    if not mat or not mat.node_tree:
        continue
    nt = mat.node_tree
    # 原材质的贴图节点得明确走原 UV，不然会跟着 active UV 跑到新 UV 上
    for n in nt.nodes:
        if n.type == "TEX_IMAGE":
            uvn = nt.nodes.new("ShaderNodeUVMap")
            uvn.uv_map = src_uv
            nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
    target = nt.nodes.new("ShaderNodeTexImage")
    target.image = img
    for n in nt.nodes:
        n.select = False
    target.select = True
    nt.nodes.active = target

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
scene.render.bake.use_pass_color = True
scene.render.bake.margin = 4
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, uv_layer="BakeUV")
img.pack()
print(f"[bake] 烘好 {args.size}²")

# ---- 4. 单一材质 --------------------------------------------------------------------------
mat = bpy.data.materials.new("crowd")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = 0.8
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
body.data.materials.clear()
body.data.materials.append(mat)
# 只留烘焙用的那套 UV，导出时就只有一套
for uv in [u for u in body.data.uv_layers if u.name != "BakeUV"]:
    body.data.uv_layers.remove(uv)

body.data.calc_loop_triangles()
print(f"[bake] 三角形 {len(body.data.loop_triangles)}，材质 {len(body.data.materials)}")
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", export_animations=False, export_skins=True,
                          export_image_format="JPEG", export_jpeg_quality=85)
print(f"[bake] 写出 {args.out}  {os.path.getsize(args.out) / 1048576:.2f}MB")
