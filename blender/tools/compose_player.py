"""玩家角色：Quaternius 底模的头 + 农夫装 + 发型 → 一个 GLB（不带动画）。

    blender -b --factory-startup -P blender/tools/compose_player.py -- \\
        --body B.gltf --outfit O.gltf --hair H.gltf --out assets/player/player.glb [...]

一般不直接跑它，走 scripts/prepare-player-assets.mjs，那边把参数定死了。

几件不看代码不知道的事：
- 服装包的 Readme 原话："only the head of the model is required. Using the full body will
  result in clipping." 所以底模身体上权重不在脖子/头这条链上的顶点要删掉。
  删到脖子根会留一圈锯齿边，删少了后背又会从领口穿出来 —— 所以交界一圈的顶点
  沿法线往里收几毫米，让衣服盖住。
- 头发和眉毛的贴图是灰度（像素 90–176），颜色在引擎 shader 里染。glTF 没有那层，
  不染就是一头白发。这里乘一个颜色进 Base Color，导出器会写成 baseColorFactor。
- 底模的 Light / Dark 两张皮肤贴图，脸部平均色完全一样（161,113,80），换贴图不解决偏橙。
  真正的问题是饱和度高，所以直接在贴图上降饱和、提亮。
- 靛蓝重染只保留原贴图的明暗（织纹、褶皱、扣子），色相整体换掉。
- 动画不在这里导出。Universal Animation Library 骨骼同名，运行时从另一个文件取。
"""
import argparse
import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--body", required=True)
ap.add_argument("--outfit", required=True)
ap.add_argument("--hair", action="append", default=[])
ap.add_argument("--out", required=True)
ap.add_argument("--tex", type=int, default=1024, help="贴图边长上限")
ap.add_argument("--jpeg", type=int, default=85, help="JPEG 质量；0 = 保留 PNG")
ap.add_argument("--hair-color", default="0.22,0.17,0.14", help="乘进 MI_Hair_* 的 R,G,B（线性，0-1）")
ap.add_argument("--neck-keep", type=float, default=0.15,
                help="顶点权重里 neck_01 及以下骨骼占到这个比例才保留")
ap.add_argument("--neck-shrink", type=float, default=0.012,
                help="交界一圈（脖子/头权重不足 90%%）沿法线往里收多少米")
ap.add_argument("--skin", action="append", default=[], help="要调色的皮肤贴图名前缀")
ap.add_argument("--skin-sat", type=float, default=0.7)
ap.add_argument("--skin-val", type=float, default=1.22)
ap.add_argument("--indigo", action="append", default=[], help="要重染成靛蓝土布的贴图名前缀")
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


body_objs = import_gltf(args.body)
# 只记名字：下面会删掉没材质的小球，删过的对象再碰一下 Blender 就抛 "StructRNA has been removed"
body_mesh_names = [o.name for o in body_objs if o.type == "MESH"]
arm = next(o for o in body_objs if o.type == "ARMATURE")
arm.name = "Player_Armature"


def rebind(objs):
    """网格挂到底模的骨架上（骨骼同名），丢掉它们自己带的那副骨架。"""
    for o in objs:
        if o.type != "MESH":
            continue
        mw = o.matrix_world.copy()
        o.parent = arm
        o.matrix_world = mw
        mods = [m for m in o.modifiers if m.type == "ARMATURE"] or [o.modifiers.new("Armature", "ARMATURE")]
        for m in mods:
            m.object = arm
    for o in objs:
        if o.type == "ARMATURE" and o is not arm:
            bpy.data.objects.remove(o, do_unlink=True)


rebind(import_gltf(args.outfit))
for h in args.hair:
    rebind(import_gltf(h))
for o in list(bpy.data.objects):
    # 导入器留下的空节点，和底模里两个没材质的小球（各 80 面，看不见，白占）
    if (o.type == "EMPTY" and not o.children) or (o.type == "MESH" and not any(o.data.materials)):
        bpy.data.objects.remove(o, do_unlink=True)

# --- 底模身体只留脖子和头 ------------------------------------------------------------------
keep_bones = set()


def collect(b):
    keep_bones.add(b.name)
    for c in b.children:
        collect(c)


collect(arm.data.bones["neck_01"])
for o in [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects]:
    groups = {g.index: g.name for g in o.vertex_groups}
    share = {}
    for v in o.data.vertices:
        total = sum(g.weight for g in v.groups) or 1.0
        share[v.index] = sum(g.weight for g in v.groups if groups.get(g.group) in keep_bones) / total
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    if min(share.values()) >= 0.9:          # 眼睛、眉毛这些本来就全在头上
        bm.free()
        continue
    border = 0
    for v in bm.verts:
        if args.neck_keep <= share[v.index] < 0.9:
            v.co -= v.normal * args.neck_shrink
            border += 1
    kill = [v for v in bm.verts if share[v.index] < args.neck_keep]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    print(f"[compose] {o.name}: 删掉 {len(kill)} 个身体顶点，交界 {border} 个往里收 {args.neck_shrink * 1000:.0f}mm")

# --- 头发染色 ------------------------------------------------------------------------------
rgb = [float(x) for x in args.hair_color.split(",")]
for mat in bpy.data.materials:
    if not mat.name.startswith("MI_Hair") or not mat.use_nodes:
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf or not bsdf.inputs["Base Color"].is_linked:
        continue
    src = bsdf.inputs["Base Color"].links[0].from_socket
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*rgb, 1.0)
    nt.links.new(src, mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    print(f"[compose] 头发染色 {mat.name} x {rgb}")

# --- 贴图：限尺寸、调皮肤、重染 --------------------------------------------------------------


def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def store(img, a):
    img.pixels.foreach_set(np.clip(a, 0, 1).astype(np.float32).ravel())
    img.update()
    img.pack()


LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)
for img in list(bpy.data.images):
    w, h = img.size
    if not w:
        continue
    if w > args.tex or h > args.tex:
        img.scale(min(w, args.tex), min(h, args.tex))
        img.pack()
    if any(img.name.startswith(p) for p in args.skin):
        a = pixels(img)
        rgb_ = a[..., :3]
        grey = (rgb_ @ LUMA)[..., None]
        a[..., :3] = (grey + (rgb_ - grey) * args.skin_sat) * args.skin_val
        store(img, a)
        print(f"[compose] 皮肤调色 {img.name}: 饱和度 x{args.skin_sat}，明度 x{args.skin_val}")
    if any(img.name.startswith(p) for p in args.indigo):
        a = pixels(img)
        lum = a[..., :3] @ LUMA
        lo, hi = np.percentile(lum, [1, 99])
        t = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1)[..., None]
        black, mid, white = (np.array(c, dtype=np.float32) / 255 for c in ((14, 20, 34), (52, 70, 102), (150, 156, 160)))
        m = 120 / 255
        a[..., :3] = np.where(t < m, black + (mid - black) * (t / m), mid + (white - mid) * ((t - m) / (1 - m)))
        store(img, a)
        print(f"[compose] 靛蓝重染 {img.name}")

# --- 报数 ---------------------------------------------------------------------------------
dg = bpy.context.evaluated_depsgraph_get()
total = 0
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    me = o.evaluated_get(dg).to_mesh()
    me.calc_loop_triangles()
    total += len(me.loop_triangles)
    o.evaluated_get(dg).to_mesh_clear()
print(f"[compose] 三角形合计 {total}")

bpy.ops.export_scene.gltf(
    filepath=args.out, export_format="GLB", export_animations=False, export_skins=True,
    export_image_format="JPEG" if args.jpeg else "AUTO", export_jpeg_quality=args.jpeg or 75,
    export_yup=True,
)
print(f"[compose] 写出 {args.out}")
