"""几何地基：坐标系转换、three.js 矩阵语义、原语、顶点色合批。

坐标系（全场唯一一处做转换，不要在别处再各自处理）
--------------------------------------------------
three.js 是 Y-up 右手系，Blender 是 Z-up 右手系。约定：

    blender = (x, -z, y)   <-  three = (x, y, z)

即绕 X 轴 +90°，手性不变（与 glTF 的约定一致）。
所有 parts/*.py 都在 **three 空间**里按原 JS 的数值写坐标，
只有 Batch.build() 出网格的那一刻做一次转换。这样移植时可以逐行对照 JS。

单位：JS 里 1 = 1 米（人高 ~1.7，河道半宽 6，山高 20），Blender 里 1 unit = 1 米，
所以数值 1:1 搬运，不缩放。

矩阵：M() 复刻 three.js 的 `new Matrix4().compose(p, q, s)`，
旋转部分是 Euler order 'XYZ'，展开成矩阵是 R = Rx·Ry·Rz（见 three.js
Matrix4.makeRotationFromEuler 的 'XYZ' 分支）。mathutils.Euler 的乘法约定
和这个不一定一致，所以这里显式相乘，不用 Euler。
"""

import math

import bmesh
import bpy

from . import color as _color
from . import mat4 as _mat4
from .mat4 import IDENTITY, Mat4

# ---------------------------------------------------------------- 坐标系

def to_blender(v):
    """three (x,y,z) -> blender (x,-z,y)"""
    return (v[0], -v[2], v[1])


def from_blender(v):
    """blender (x,y,z) -> three (x,z,-y)"""
    return (v[0], v[2], -v[1])


# ---------------------------------------------------------------- 矩阵

def M(px=0.0, py=0.0, pz=0.0, sx=1.0, sy=1.0, sz=1.0, rx=0.0, ry=0.0, rz=0.0):
    """watertown.js:81 的 M()。返回 three 空间的 4x4，T·R·S。"""
    t = _mat4.translation(px, py, pz)
    r = _mat4.rot_x(rx) @ _mat4.rot_y(ry) @ _mat4.rot_z(rz)
    s = _mat4.scale(sx, sy, sz)
    return t @ r @ s


# ---------------------------------------------------------------- 原语
# 全部按 three.js 的分段数生成，并转回 three 空间（Y 轴朝上）存着。

class Prim:
    __slots__ = ("verts", "faces", "smooth", "uvs", "name", "extra")

    def __init__(self, verts, faces, smooth, uvs, name="prim", extra=None):
        self.verts = verts      # [(x,y,z), ...] three 空间
        self.faces = faces      # [(i,j,k[,l]), ...]
        self.smooth = smooth    # [bool, ...] 与 faces 等长
        self.uvs = uvs          # [[(u,v), ...每个角], ...] 与 faces 等长
        self.name = name        # 记账用的名字
        self.extra = extra      # 记账用的参数（多边形、圆柱参数……），给测试比对


def _bm_to_prim(bm, smooth_fn, uv_fn):
    """uv_fn(face_normal_three, vert_three) -> (u,v)，按 three.js 的贴图约定算。"""
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    verts = [from_blender(v.co) for v in bm.verts]
    faces, smooth, uvs = [], [], []
    for f in bm.faces:
        idx = tuple(v.index for v in f.verts)
        # Z-up -> Y-up 是纯旋转（行列式 +1），绕序不变
        faces.append(idx)
        smooth.append(smooth_fn(f))
        n = from_blender(f.normal)
        uvs.append([uv_fn(n, verts[i]) for i in idx])
    bm.free()
    return Prim(verts, faces, smooth, uvs)


# --- three.js 的贴图约定 ------------------------------------------------
# BoxGeometry：每个面各自铺满 0..1，v 朝上。逐面核对过 three.js buildPlane
# 的 udir/vdir（见 BoxGeometry 源码里六次 buildPlane 调用的符号）。

def _uv_box(n, v):
    x, y, z = v
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ax >= ay and ax >= az:
        return (0.5 - z, y + 0.5) if n[0] > 0 else (z + 0.5, y + 0.5)
    if az >= ay:
        return (x + 0.5, y + 0.5) if n[2] > 0 else (0.5 - x, y + 0.5)
    return (x + 0.5, z + 0.5) if n[1] > 0 else (x + 0.5, 0.5 - z)


def _uv_plane(n, v):
    return (v[0] + 0.5, v[1] + 0.5)


def _uv_tube(n, v):
    """柱/锥：侧壁绕一圈 u=theta/2pi、v 沿高；顶底盖是圆形投影。"""
    x, y, z = v
    if abs(n[1]) > 0.7:                       # 盖
        sign = 1.0 if n[1] > 0 else -1.0
        return (x * 0.5 + 0.5, z * 0.5 * sign + 0.5)
    return (math.atan2(x, z) / TAU % 1.0, y + 0.5)


def _uv_sph(n, v):
    x, y, z = v
    r = max(1e-9, math.sqrt(x * x + y * y + z * z))
    return (math.atan2(x, z) / TAU % 1.0, 0.5 + math.asin(max(-1.0, min(1.0, y / r))) / math.pi)


def _fix_seam(prim):
    """绕一圈的原语在接缝处 u 会从 0.99 跳回 0，把跳变那一侧补成 1。"""
    for corners in prim.uvs:
        us = [c[0] for c in corners]
        if max(us) - min(us) > 0.5:
            for i, (u, vv) in enumerate(corners):
                if u < 0.5:
                    corners[i] = (u + 1.0, vv)
    return prim


def _make_box():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    return _bm_to_prim(bm, lambda f: False, _uv_box)


def _make_cyl(segments):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=1.0, radius2=1.0, depth=1.0)
    # three.js 的柱面侧壁是平滑法线，顶底盖是平的
    return _fix_seam(_bm_to_prim(bm, lambda f: len(f.verts) == 4, _uv_tube))


def _make_cone(segments):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=1.0, radius2=0.0, depth=1.0)
    return _fix_seam(_bm_to_prim(bm, lambda f: len(f.verts) == 3, _uv_tube))


def _make_sph(u_segments, v_segments):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segments, v_segments=v_segments,
                              radius=1.0)
    return _fix_seam(_bm_to_prim(bm, lambda f: True, _uv_sph))


def _make_plane():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    # three.js PlaneGeometry 在 XY 平面、法线 +Z；create_grid 在 XY 平面法线 +Z(blender)
    # 转到 three 空间后会变成朝 -Y，这里绕回去。
    bm.verts.ensure_lookup_table()
    prim = _bm_to_prim(bm, lambda f: False, _uv_plane)
    prim.verts = [(v[0], -v[2], v[1]) for v in prim.verts]
    prim.uvs = [[(v[0] + 0.5, v[1] + 0.5) for v in
                 (prim.verts[i] for i in f)] for f in prim.faces]
    return prim


# --- 挤出与开口圆柱：屋顶、山墙、桥用的，不是固定原语 ------------------

def _signed_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return a / 2


def extrude_prim(poly, depth):
    """three.js ExtrudeGeometry(shape, {depth, bevelEnabled:false})。

    把 XY 平面上的多边形沿 +Z 拉成柱体。three.js 用 ShapeUtils 三角化，
    这里直接留 ngon 端面 —— Blender 渲染时自己会三角化，形状一样，
    只是顶点顺序和 JS 不同（所以测试比的是多边形本身，不是三角形）。

    绕序统一成逆时针，端面法线才朝对；原始 shape 的绕序两种都有。
    UV：端面用 (x, y)，侧壁用 (沿周长的距离, z)。这几块都是顶点色上色，
    UV 只是留给 2B 烘焙用的占位，不追求和 three.js 的 UVGenerator 一致。
    """
    poly = [tuple(p) for p in poly]
    if len(poly) > 1 and poly[0] == poly[-1]:
        poly = poly[:-1]
    original = [list(p) for p in poly]      # 记账用原始顺序，翻绕序只是内部实现
    if _signed_area(poly) < 0:
        poly = poly[::-1]
    n = len(poly)

    verts = [(x, y, 0.0) for x, y in poly] + [(x, y, depth) for x, y in poly]
    faces, uvs, smooth = [], [], []

    faces.append(tuple(range(n - 1, -1, -1)))          # 背面（-Z）
    uvs.append([(poly[i][0], poly[i][1]) for i in range(n - 1, -1, -1)])
    smooth.append(False)

    faces.append(tuple(range(n, 2 * n)))               # 正面（+Z）
    uvs.append([(x, y) for x, y in poly])
    smooth.append(False)

    run = 0.0
    for i in range(n):
        j = (i + 1) % n
        seg = math.dist(poly[i], poly[j])
        faces.append((i, j, j + n, i + n))
        uvs.append([(run, 0.0), (run + seg, 0.0), (run + seg, depth), (run, depth)])
        smooth.append(False)
        run += seg

    return Prim(verts, faces, smooth, uvs, "extrude",
                {"poly": original, "depth": depth})


def tube_prim(radius_top, radius_bottom, height, radial_segments,
              open_ended=False, theta_start=0.0, theta_length=None):
    """three.js CylinderGeometry 的参数版（桥洞内壁那种半开口圆管）。

    顶点位置按 three.js 的公式：x = r*sin(theta)，z = r*cos(theta)，
    theta 从 thetaStart 起算 —— 半圆管落在哪半边取决于这个，弄反了桥洞会朝天。
    """
    if theta_length is None:
        theta_length = TAU
    verts, faces, uvs, smooth = [], [], [], []
    half = height / 2

    for i in range(radial_segments + 1):
        u = i / radial_segments
        th = theta_start + u * theta_length
        s, c = math.sin(th), math.cos(th)
        verts.append((radius_top * s, half, radius_top * c))
        verts.append((radius_bottom * s, -half, radius_bottom * c))

    for i in range(radial_segments):
        a, b = 2 * i, 2 * i + 1
        c2, d2 = 2 * (i + 1), 2 * (i + 1) + 1
        faces.append((a, c2, d2, b))
        u0, u1 = i / radial_segments, (i + 1) / radial_segments
        uvs.append([(u0, 1.0), (u1, 1.0), (u1, 0.0), (u0, 0.0)])
        smooth.append(True)

    if not open_ended:
        base = len(verts)
        verts.append((0.0, half, 0.0))
        verts.append((0.0, -half, 0.0))
        for i in range(radial_segments):
            faces.append((base, 2 * (i + 1), 2 * i))
            uvs.append([(0.5, 0.5)] * 3)
            smooth.append(False)
            faces.append((base + 1, 2 * i + 1, 2 * (i + 1) + 1))
            uvs.append([(0.5, 0.5)] * 3)
            smooth.append(False)

    return Prim(verts, faces, smooth, uvs, "tube",
                {"rt": radius_top, "rb": radius_bottom, "h": height,
                 "rs": radial_segments, "open": open_ended,
                 "ts": theta_start, "tl": theta_length})


def flip_inside(p):
    """watertown.js:68 的 flipInside —— 翻成从里面看（桥洞内壁）。
    JS 那边是翻法线 + 翻三角绕序；Blender 的法线由绕序决定，翻绕序就够。"""
    return Prim([tuple(v) for v in p.verts],
                [f[::-1] for f in p.faces],
                list(p.smooth),
                [list(reversed(u)) for u in p.uvs],
                p.name, dict(p.extra or {}, flipped=True))


_cache = {}


def prim(name):
    """watertown.js:75-79 的 G.*"""
    if name not in _cache:
        makers = {
            "box": _make_box,
            "cyl": lambda: _make_cyl(8),
            "cyl6": lambda: _make_cyl(6),
            "sph": lambda: _make_sph(9, 7),
            "cone": lambda: _make_cone(8),
            "cone6": lambda: _make_cone(6),
            "plane": _make_plane,
        }
        if name not in makers:
            raise KeyError(f"未知原语 {name}")
        _cache[name] = makers[name]()
    return _cache[name]


# ---------------------------------------------------------------- 合批

class Batch:
    """watertown.js:39-66 的 Batch。颜色写进顶点，一个 Batch 出一个 mesh。

    顶点色和 UV 都保留：2A 的程序化材质用不到它们，但 2B 烘焙回 Three.js 时
    要靠 UV 贴 lightMap、靠顶点色还原原来的配色，所以几何上一律留着。
    """

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.cols = []
        self.faces = []
        self.smooth = []
        self.uvs = []
        self.log = None      # 设成 list 就记账，给 tests/ 比对 JS 用

    @property
    def empty(self):
        return not self.verts

    def add(self, prim_or_name, matrix=IDENTITY, col=(1, 1, 1), uv_box=None):
        """uv_box = [u0,v0,u1,v1]，把原语的 0..1 UV 压进图集里的一格
        （watertown.js:52-54 的同名参数）。"""
        p = prim(prim_or_name) if isinstance(prim_or_name, str) else prim_or_name
        rgb = _color.hex_to_rgb(col) if isinstance(col, int) else tuple(col[:3])
        lin = _color.srgb_to_linear(rgb)

        if self.log is not None:
            # 与 three.js Matrix4.elements 同样的列主序，方便逐个数比
            self.log.append((
                prim_or_name if isinstance(prim_or_name, str) else p.name,
                matrix.elements(),
                list(rgb),
                list(uv_box) if uv_box else None,
                None if isinstance(prim_or_name, str) else p.extra,
            ))

        base = len(self.verts)
        for v in p.verts:
            self.verts.append(matrix.xform(v))
            self.cols.append(lin)

        flip = matrix.det3() < 0
        for f, sm, uv in zip(p.faces, p.smooth, p.uvs):
            idx = tuple(i + base for i in f)
            if uv_box:
                u0, v0, u1, v1 = uv_box
                uv = [(u0 + u * (u1 - u0), v0 + v * (v1 - v0)) for u, v in uv]
            else:
                uv = list(uv)
            self.faces.append(idx[::-1] if flip else idx)
            self.uvs.append(uv[::-1] if flip else uv)
            self.smooth.append(sm)

    def add_raw(self, verts, faces, cols, uvs, smooth):
        """直接塞一块自造几何（地面网格那种），坐标同样是 three 空间。"""
        base = len(self.verts)
        self.verts.extend(verts)
        self.cols.extend(_color.srgb_to_linear(c) for c in cols)
        for f, uv, sm in zip(faces, uvs, smooth):
            self.faces.append(tuple(i + base for i in f))
            self.uvs.append(list(uv))
            self.smooth.append(sm)

    def build(self, collection, material=None):
        """出一个 Blender 物体。顶点在这里从 three 空间转到 Blender 空间。"""
        if self.empty:
            return None
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([to_blender(v) for v in self.verts], [], self.faces)
        mesh.validate(verbose=False)

        for poly, sm in zip(mesh.polygons, self.smooth):
            poly.use_smooth = sm

        attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        for i, c in enumerate(self.cols):
            attr.data[i].color = (c[0], c[1], c[2], 1.0)

        uv_layer = mesh.uv_layers.new(name="UVMap")
        for poly, corners in zip(mesh.polygons, self.uvs):
            for li, uv in zip(poly.loop_indices, corners):
                uv_layer.data[li].uv = uv

        if material is not None:
            mesh.materials.append(material)

        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------- 便捷写法
# 参数顺序刻意与 JS 保持一致，方便逐行对照。
# 注意 box() 的坑：第 9/10/11 个参数是 ry, rx, rz（不是 rx,ry,rz），
# 内部再按 M(x,y,z,w,h,d, rx,ry,rz) 装配。见 watertown.js:85-87。

def box(batch, col, w, h, d, x, y, z, ry=0.0, rx=0.0, rz=0.0, parent=None, uv_box=None):
    m = M(x, y, z, w, h, d, rx, ry, rz)
    if parent is not None:
        m = parent @ m
    batch.add("box", m, col, uv_box)


def shape(batch, col, geo, x, y, z, parent=None, ry=0.0):
    m = M(x, y, z, 1, 1, 1, 0, ry, 0)
    if parent is not None:
        m = parent @ m
    batch.add(geo, m, col)


TAU = math.pi * 2


def js_round(v):
    """JS 的 Math.round 是 floor(x+0.5)（.5 一律向上），Python 的 round() 是
    银行家舍入，两者在 x.5 上不一样。地面分段数用得到，必须用这个。"""
    return math.floor(v + 0.5)
