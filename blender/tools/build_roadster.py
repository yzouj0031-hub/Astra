"""老爷车：1930 年代双座敞篷车，Blender 里自建，导出一个 GLB。

    blender -b --factory-startup -P blender/tools/build_roadster.py -- --out assets/vehicles/roadster.glb

为什么自己建：带贴图、许可干净的老式车几乎全在 Sketchfab（要登录），用户定了不走那条路；
CC0 能直接下载的车全是纯色低多边形或调色板贴图，正是要替换掉的那种廉价感。

不是拿方盒拼：车身、机盖是按截面放样出来的曲面，翼子板是截面沿路径扫出来的，
轮胎是圆环，大灯是旋转体。真实贴图用在皮座椅、帆布篷、仪表板木饰上（Poly Haven，CC0）。
车漆和镀铬不贴图 —— 光滑漆面加主世界的环境贴图反射，比贴一张纹理更像真的。

坐标：Blender 里车头朝 -Y、Z 朝上，导出 glTF（Y 朝上）后车头朝 +Z，和游戏里的 buildCar 一致。
尺寸按游戏单位（玩家 2.02 米高），整车必须落在碰撞包络 3.32 × 5.2 米以内（见 index.html 的
CAR_HALF_WIDTH / CAR_HALF_LENGTH）。轮子位置沿用旧车的轴距 ±1.45、半径 0.46。

四个轮子是独立节点 wheel_FL / wheel_FR / wheel_RL / wheel_RR，原点在轮心，绕本地 X 轴滚动，
游戏里转向转 Y、滚动转 X，和旧车的 mount / hub 对得上。其余静态件合成一个 body。
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--tex", default=os.path.join(os.path.dirname(__file__), "..", "..", "assets", "_src", "vehicles", "tex"))
ap.add_argument("--paint", default="47,74,65", help="车身漆色 sRGB 0-255（默认沿用旧车 0x2f4a41）")
ap.add_argument("--texres", type=int, default=512)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

WHEEL_R = 0.46
AXLE_Y = 1.45          # 前轴 -1.45，后轴 +1.45
TRACK_X = 0.86         # 轮心横向位置


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ---------------------------------------------------------------- 材质
def principled(m):
    if not m.node_tree:
        m.use_nodes = True
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None:
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return nt, b


def mat_plain(name, rgb, metal=0.0, rough=0.5, alpha=1.0, emit=None):
    m = bpy.data.materials.new(name)
    nt, b = principled(m)
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = 1.0
    return m


def load_img(path, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    if not color:
        img.colorspace_settings.name = "Non-Color"
    if img.size[0] > args.texres:
        img.scale(args.texres, args.texres)
        img.pack()
    return img


def mat_tex(name, folder, rough_default=0.6, tint=None):
    m = bpy.data.materials.new(name)
    nt, b = principled(m)
    d = os.path.join(args.tex, folder)
    diff = nt.nodes.new("ShaderNodeTexImage")
    diff.image = load_img(os.path.join(d, "diff.jpg"))
    if tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (*tint, 1.0)
        nt.links.new(diff.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    else:
        nt.links.new(diff.outputs["Color"], b.inputs["Base Color"])
    if os.path.exists(os.path.join(d, "nor.jpg")):
        nor = nt.nodes.new("ShaderNodeTexImage")
        nor.image = load_img(os.path.join(d, "nor.jpg"), color=False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if os.path.exists(os.path.join(d, "rough.jpg")):
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = load_img(os.path.join(d, "rough.jpg"), color=False)
        nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough_default
    return m


paint_rgb = tuple(lin(float(c)) for c in args.paint.split(","))
M = {
    "paint": mat_plain("Paint", paint_rgb, metal=0.35, rough=0.28),
    "black": mat_plain("BlackEnamel", (0.012, 0.012, 0.014), metal=0.2, rough=0.32),
    "chrome": mat_plain("Chrome", (0.80, 0.80, 0.78), metal=1.0, rough=0.13),
    "rubber": mat_plain("Rubber", (0.018, 0.018, 0.02), rough=0.88),
    "glass": mat_plain("Glass", (0.55, 0.65, 0.70), metal=0.0, rough=0.05, alpha=0.28),
    # 灯罩是深色高反光（玻璃罩着反光碗）：浅色底 + 自发光在白天就是两个没有明暗的白球，
    # 只压自发光不够，第二版试过
    "lens": mat_plain("LampLens", (0.08, 0.08, 0.075), metal=0.9, rough=0.08, emit=(0.05, 0.045, 0.035)),
    "tail": mat_plain("TailLamp", (0.7, 0.05, 0.04), rough=0.3, emit=(0.25, 0.02, 0.01)),
    "grille": mat_plain("GrilleBack", (0.02, 0.02, 0.022), rough=0.6),
    "leather": mat_tex("Leather", "brown_leather"),
    "canvas": mat_tex("Canvas", "rough_linen", tint=(0.55, 0.50, 0.40)),
    "wood": mat_tex("Teak", "teak_veneer"),
}
MAT_ORDER = list(M.keys())


# ---------------------------------------------------------------- 几何工具
class Part:
    """一个 bmesh + 当前材质槽；最后按对象写出。"""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def face(self, verts, mat):
        f = self.bm.faces.new(verts)
        f.material_index = MAT_ORDER.index(mat)
        return f


def loft(part, rings, mat, cap0=True, cap1=True, closed=True):
    bm = part.bm
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    faces = []
    for a, b in zip(vs, vs[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append(part.face((a[i], a[j], b[j], b[i]), mat))
    if cap0:
        faces.append(part.face(list(reversed(vs[0])), mat))
    if cap1:
        faces.append(part.face(vs[-1], mat))
    return faces


def superellipse(cx, cz, w, h, y, n=32, e=4.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = cx + (w / 2) * math.copysign(abs(c) ** (2 / e), c)
        z = cz + (h / 2) * math.copysign(abs(s) ** (2 / e), s)
        pts.append(Vector((x, y, z)))
    return pts


def smooth_keys(keys, steps):
    """关键截面之间按 smoothstep 插值，放样出来的曲面不会一节一节折。"""
    out = []
    for (a, b) in zip(keys, keys[1:]):
        for s in range(steps):
            t = s / steps
            t = t * t * (3 - 2 * t)
            out.append(tuple(pa + (pb - pa) * t for pa, pb in zip(a, b)))
    out.append(keys[-1])
    return out


def box(part, c, size, mat, bevel=0.0, seg=2, rot=None):
    bm = part.bm
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    R = rot or Matrix.Identity(3)
    for v in verts:
        local = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        v.co = Vector(c) + R @ local
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        f.material_index = MAT_ORDER.index(mat)
    if bevel > 0:
        edges = list({e for v in verts for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    return verts


def cylinder(part, a, b, r, mat, seg=12, caps=True):
    """两端点之间的圆柱。"""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    rings = []
    for p in (a, b):
        rings.append([p + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r for i in range(seg)])
    return loft(part, rings, mat, caps, caps)


def torus(part, center, axis, R, ra, rw, mat, nu=36, nv=10):
    """圆环，axis 是转轴方向。ra 径向半厚，rw 轴向半宽（轮胎是扁的）。"""
    axis = Vector(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    c = Vector(center)
    rings = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        radial = u * math.cos(a) + v * math.sin(a)
        rings.append([c + radial * (R + ra * math.cos(2 * math.pi * j / nv)) + axis * (rw * math.sin(2 * math.pi * j / nv)) for j in range(nv)])
    bm = part.bm
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(nu):
        A, B = vs[i], vs[(i + 1) % nu]
        for j in range(nv):
            k = (j + 1) % nv
            part.face((A[j], A[k], B[k], B[j]), mat)


def sweep(part, centerline, profile, mat, side_sign=1.0):
    """截面沿 YZ 平面里的一条中心线扫。profile 是 (dx, dn)：dx 沿 X，dn 沿曲线外法线。"""
    pts = [Vector(p) for p in centerline]
    rings = []
    last = len(pts) - 1
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, last)] - pts[max(i - 1, 0)]).normalized()
        n = Vector((0, -t.z, t.y))
        if n.z < 0 and abs(n.z) > 0.2:
            n = -n
        # 两头 4 节收窄变薄：不收的话端面是一块钝竖板，看着像挂了挡泥板
        k = min(1.0, (i + 1) / 4, (last - i + 1) / 4)
        k = 0.25 + 0.75 * k * k * (3 - 2 * k)
        rings.append([p + Vector((dx * k * side_sign, 0, 0)) + n * dn * k for dx, dn in profile])
    return loft(part, rings, mat, True, True)


def arc(cy, cz, R, t0, t1, n):
    return [(cy + R * math.cos(t0 + (t1 - t0) * i / (n - 1)), cz + R * math.sin(t0 + (t1 - t0) * i / (n - 1))) for i in range(n)]


def finish(part, name, smooth_angle=35.0, uv_scale=0.6):
    bm = part.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for loop in f.loops:
            co = loop.vert.co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            loop[part.uv].uv = (u / uv_scale, v / uv_scale)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for key in MAT_ORDER:
        me.materials.append(M[key])
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- 车身
body = Part()

# 座舱段 + 船尾：(y, 底 z, 顶 z, 宽)
tub_keys = [(-0.36, 0.55, 1.10, 1.30), (-0.10, 0.55, 1.08, 1.36), (0.40, 0.55, 1.03, 1.38),
            (1.00, 0.55, 0.99, 1.36), (1.45, 0.56, 0.95, 1.30), (1.80, 0.58, 0.88, 1.14),
            (2.00, 0.62, 0.80, 0.86), (2.08, 0.66, 0.76, 0.46)]
rings = [superellipse(0, (zb + zt) / 2, w, zt - zb, y, n=36, e=5.0) for y, zb, zt, w in smooth_keys(tub_keys, 3)]
tub_faces = loft(body, rings, "paint")
# 挖出座舱口，再给壳加厚度：从上面看得见座舱里的座椅
cut = [f for f in tub_faces if f.calc_center_median().z > 0.93 and -0.18 < f.calc_center_median().y < 0.98
       and abs(f.calc_center_median().x) < 0.56]
bmesh.ops.delete(body.bm, geom=cut, context="FACES")
shell = [f for f in body.bm.faces if f.is_valid]
bmesh.ops.solidify(body.bm, geom=shell, thickness=0.03)

# 机盖：从前围到散热器
hood_keys = [(-0.36, 0.60, 1.09, 1.04), (-1.20, 0.60, 1.07, 0.98), (-1.94, 0.60, 1.04, 0.92)]
loft(body, [superellipse(0, (zb + zt) / 2, w, zt - zb, y, n=32, e=5.0) for y, zb, zt, w in smooth_keys(hood_keys, 4)], "paint")
# 机盖腰线：一条细镀铬饰条
for sx in (-1, 1):
    cylinder(body, (sx * 0.505, -0.40, 0.95), (sx * 0.47, -1.92, 0.93), 0.012, "chrome", seg=6)

# 散热器壳 + 格栅
loft(body, [superellipse(0, 0.85, 0.86, 0.58, -1.93, n=32, e=6.0), superellipse(0, 0.85, 0.80, 0.56, -2.06, n=32, e=6.0)], "chrome")
box(body, (0, -2.07, 0.85), (0.64, 0.01, 0.46), "grille")
for i in range(11):
    box(body, (-0.30 + i * 0.06, -2.08, 0.85), (0.014, 0.012, 0.44), "chrome")
cylinder(body, (0, -2.0, 1.14), (0, -2.0, 1.22), 0.03, "chrome", seg=10)

# 底盘大梁（从侧面看得到的那条黑影）
for sx in (-1, 1):
    box(body, (sx * 0.46, 0, 0.47), (0.08, 4.1, 0.1), "black")

# 翼子板：前后四片，沿轮拱扫出来，外沿往下翻一点
# 外沿只往下翻 2 厘米：翻 5 厘米时末端收窄了也还挂着一道竖边，正面看像挡泥板
FENDER = [(-0.16, -0.02), (-0.13, 0.03), (-0.06, 0.055), (0.0, 0.06), (0.06, 0.055), (0.13, 0.03), (0.16, -0.02),
          (0.14, -0.035), (0.0, 0.03), (-0.14, -0.035)]
for sx in (-1, 1):
    x0 = sx * TRACK_X
    # 末端只到轴线下一点：原来前端收到 1.12π、后端 -0.14π，垂到轮轴以下，像两块挡泥板
    front = [(-0.64, 0.40), (-0.80, 0.42)] + arc(-AXLE_Y, WHEEL_R, 0.60, 0.06 * math.pi, 1.0 * math.pi, 22)
    rear = [(0.64, 0.40), (0.80, 0.42)] + arc(AXLE_Y, WHEEL_R, 0.60, 0.94 * math.pi, 0.0, 22)
    # 翼子板用车身同色漆：黑亮翼子板从正后方看轮廓和轮胎一样，像多出两只轮子
    for path in (front, rear):
        sweep(body, [(x0, y, z) for y, z in path], FENDER, "paint", side_sign=sx)
    # 踏板
    box(body, (sx * 0.85, 0, 0.395), (0.30, 1.32, 0.035), "rubber", bevel=0.008)
    for yy in (-0.4, 0.0, 0.4):
        box(body, (sx * 0.85, yy, 0.415), (0.26, 0.02, 0.006), "chrome")

# 大灯：灯杆 + 两只碗形灯
cylinder(body, (-0.66, -1.98, 0.86), (0.66, -1.98, 0.86), 0.024, "chrome", seg=8)
for sx in (-1, 1):
    cx, cy, cz = sx * 0.60, -1.98, 1.00
    prof = [(0.0, 0.05), (0.04, 0.10), (0.09, 0.14), (0.15, 0.16), (0.18, 0.165)]
    loft(body, [[Vector((cx + r * math.cos(2 * math.pi * i / 20), cy - d, cz + r * math.sin(2 * math.pi * i / 20))) for i in range(20)]
                for d, r in prof], "chrome", cap0=True, cap1=False)
    loft(body, [[Vector((cx + 0.158 * math.cos(2 * math.pi * i / 20), cy - 0.175, cz + 0.158 * math.sin(2 * math.pi * i / 20))) for i in range(20)]], "lens", cap0=False, cap1=True)
    torus(body, (cx, cy - 0.175, cz), (0, 1, 0), 0.162, 0.012, 0.012, "chrome", nu=20, nv=6)   # 灯圈
    cylinder(body, (cx, cy, 0.86), (cx, cy, 0.95), 0.02, "chrome", seg=6)
# 尾灯
for sx in (-1, 1):
    box(body, (sx * 0.55, 2.02, 0.74), (0.09, 0.05, 0.07), "tail", bevel=0.01)

# 挡风玻璃：镀铬框 + 玻璃，往后仰 10°
tilt = Matrix.Rotation(math.radians(10), 3, "X")
wc = Vector((0, -0.30, 1.08))
for c, s in [((-0.62, 0, 0.22), (0.03, 0.03, 0.46)), ((0.62, 0, 0.22), (0.03, 0.03, 0.46)),
             ((0, 0, 0.44), (1.27, 0.03, 0.03)), ((0, 0, 0.0), (1.27, 0.03, 0.03))]:
    box(body, wc + tilt @ Vector(c), s, "chrome", rot=tilt)
box(body, wc + tilt @ Vector((0, 0, 0.22)), (1.21, 0.006, 0.42), "glass", rot=tilt)

# 座舱：地板、仪表板、方向盘（右舵，Blender 里车右侧是 -X）、皮长椅、折起的帆布篷
box(body, (0, 0.38, 0.60), (1.22, 1.14, 0.03), "black")
box(body, (0, -0.24, 0.98), (1.22, 0.05, 0.15), "wood", bevel=0.01)
col = Vector((-0.30, -0.22, 0.96))
wheel_c = Vector((-0.30, 0.02, 1.10))
cylinder(body, col, wheel_c, 0.018, "black", seg=8)
torus(body, wheel_c, (0, math.cos(math.radians(55)), math.sin(math.radians(55))), 0.17, 0.014, 0.014, "black", nu=24, nv=6)
box(body, (0, 0.44, 0.73), (1.08, 0.46, 0.15), "leather", bevel=0.05, seg=3)
back = Matrix.Rotation(math.radians(-12), 3, "X")
box(body, (0, 0.73, 0.95), (1.08, 0.12, 0.40), "leather", bevel=0.05, seg=3, rot=back)
top_rings = []
for i in range(9):
    t = i / 8
    x = -0.64 + 1.28 * t
    k = math.sqrt(max(0.0, 1 - (2 * t - 1) ** 8))
    top_rings.append([Vector((x, 0.98 + 0.13 * k * math.cos(2 * math.pi * j / 14), 1.05 + 0.08 * k * math.sin(2 * math.pi * j / 14))) for j in range(14)])
loft(body, top_rings, "canvas")

# 保险杠
for y, z in ((-2.28, 0.44), (2.36, 0.40)):
    rings = []
    for i in range(15):
        x = -0.82 + 1.64 * i / 14
        yy = y + (0.06 if y < 0 else -0.06) * (x / 0.82) ** 2
        rings.append(superellipse(0, z, 0.07, 0.10, 0, n=10, e=4.0))
        rings[-1] = [Vector((x, yy + p.x, p.z)) for p in rings[-1]]
    loft(body, rings, "chrome")
    for sx in (-1, 1):
        cylinder(body, (sx * 0.45, y, z), (sx * 0.45, y * 0.91, z + 0.06), 0.025, "chrome", seg=8)


# ---------------------------------------------------------------- 轮子
def build_wheel(part, c, axis):
    axis = Vector(axis).normalized()
    torus(part, c, axis, 0.385, 0.075, 0.11, "rubber", nu=36, nv=10)
    torus(part, c, axis, 0.30, 0.02, 0.05, "chrome", nu=36, nv=6)
    cylinder(part, Vector(c) - axis * 0.08, Vector(c) + axis * 0.08, 0.09, "chrome", seg=16)
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u)
    for i in range(20):
        a = 2 * math.pi * i / 20
        radial = u * math.cos(a) + v * math.sin(a)
        off = axis * (0.035 if i % 2 else -0.035)
        cylinder(part, Vector(c) + off + radial * 0.08, Vector(c) - off * 0.3 + radial * 0.29, 0.006, "chrome", seg=4, caps=False)


build_wheel(body, (0, 2.22, 0.70), (0, 1, 0))                     # 车尾备胎
cylinder(body, (0, 2.06, 0.70), (0, 2.14, 0.70), 0.05, "black", seg=10)

body_ob = finish(body, "body")

wheel_obs = []
for name, sx, sy in (("wheel_FL", 1, -1), ("wheel_FR", -1, -1), ("wheel_RL", 1, 1), ("wheel_RR", -1, 1)):
    p = Part()
    build_wheel(p, (0, 0, 0), (1, 0, 0))
    ob = finish(p, name)
    ob.location = (sx * TRACK_X, sy * AXLE_Y, WHEEL_R)
    wheel_obs.append(ob)

# ---------------------------------------------------------------- 报数 + 导出
dg = bpy.context.evaluated_depsgraph_get()
total = 0
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for ob in [body_ob] + wheel_obs:
    me = ob.evaluated_get(dg).to_mesh()
    me.calc_loop_triangles()
    total += len(me.loop_triangles)
    for v in me.vertices:
        w = ob.matrix_world @ v.co
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
    print(f"[roadster] {ob.name:10s} tris {len(me.loop_triangles)}")
    ob.evaluated_get(dg).to_mesh_clear()
size = hi - lo
print(f"[roadster] 三角形合计 {total}")
print(f"[roadster] 尺寸 宽 {size.x:.2f} × 长 {size.y:.2f} × 高 {size.z:.2f}（碰撞包络 3.32 × 5.20）")
assert size.x <= 3.32 and size.y <= 5.20, "超出碰撞包络"

os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", export_apply=True, export_yup=True,
                          export_image_format="JPEG", export_jpeg_quality=85, export_materials="EXPORT")
print(f"[roadster] 写出 {args.out}  {os.path.getsize(args.out) / 1048576:.2f}MB")
