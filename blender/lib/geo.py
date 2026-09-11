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
from mathutils import Matrix, Vector

from . import color as _color

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
    t = Matrix.Translation((px, py, pz))
    r = (Matrix.Rotation(rx, 4, "X")
         @ Matrix.Rotation(ry, 4, "Y")
         @ Matrix.Rotation(rz, 4, "Z"))
    s = Matrix.Diagonal((sx, sy, sz, 1.0))
    return t @ r @ s


IDENTITY = Matrix.Identity(4)


# ---------------------------------------------------------------- 原语
# 全部按 three.js 的分段数生成，并转回 three 空间（Y 轴朝上）存着。

class Prim:
    __slots__ = ("verts", "faces", "smooth")

    def __init__(self, verts, faces, smooth):
        self.verts = verts      # [(x,y,z), ...] three 空间
        self.faces = faces      # [(i,j,k[,l]), ...]
        self.smooth = smooth    # [bool, ...] 与 faces 等长


def _bm_to_prim(bm, smooth_fn):
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    verts = [from_blender(v.co) for v in bm.verts]
    faces, smooth = [], []
    for f in bm.faces:
        idx = [v.index for v in f.verts]
        # Z-up -> Y-up 是镜像无关的旋转，绕序不变；但 from_blender 里
        # y=z, z=-y 是纯旋转，行列式 +1，所以绕序保持。
        faces.append(tuple(idx))
        smooth.append(smooth_fn(f))
    bm.free()
    return Prim(verts, faces, smooth)


def _make_box():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    return _bm_to_prim(bm, lambda f: False)


def _make_cyl(segments):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=1.0, radius2=1.0, depth=1.0)
    # three.js 的柱面侧壁是平滑法线，顶底盖是平的
    return _bm_to_prim(bm, lambda f: len(f.verts) == 4)


def _make_cone(segments):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=1.0, radius2=0.0, depth=1.0)
    return _bm_to_prim(bm, lambda f: len(f.verts) == 3)


def _make_sph(u_segments, v_segments):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segments, v_segments=v_segments,
                              radius=1.0)
    return _bm_to_prim(bm, lambda f: True)


def _make_plane():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    # three.js PlaneGeometry 在 XY 平面、法线 +Z；create_grid 在 XY 平面法线 +Z(blender)
    # 转到 three 空间后会变成朝 -Y，这里绕回去。
    bm.verts.ensure_lookup_table()
    prim = _bm_to_prim(bm, lambda f: False)
    prim.verts = [(v[0], -v[2], v[1]) for v in prim.verts]
    return prim


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
    """watertown.js:39-66 的 Batch。颜色写进顶点，一个 Batch 出一个 mesh。"""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.cols = []
        self.faces = []
        self.smooth = []

    @property
    def empty(self):
        return not self.verts

    def add(self, prim_or_name, matrix=IDENTITY, col=(1, 1, 1)):
        p = prim(prim_or_name) if isinstance(prim_or_name, str) else prim_or_name
        rgb = _color.hex_to_rgb(col) if isinstance(col, int) else tuple(col[:3])
        lin = _color.srgb_to_linear(rgb)

        base = len(self.verts)
        for v in p.verts:
            w = matrix @ Vector(v)
            self.verts.append((w.x, w.y, w.z))
            self.cols.append(lin)

        flip = matrix.to_3x3().determinant() < 0
        for f, sm in zip(p.faces, p.smooth):
            idx = tuple(i + base for i in f)
            self.faces.append(idx[::-1] if flip else idx)
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

        if material is not None:
            mesh.materials.append(material)

        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


# ---------------------------------------------------------------- 便捷写法
# 参数顺序刻意与 JS 保持一致，方便逐行对照。
# 注意 box() 的坑：第 9/10/11 个参数是 ry, rx, rz（不是 rx,ry,rz），
# 内部再按 M(x,y,z,w,h,d, rx,ry,rz) 装配。见 watertown.js:85-87。

def box(batch, col, w, h, d, x, y, z, ry=0.0, rx=0.0, rz=0.0, parent=None):
    m = M(x, y, z, w, h, d, rx, ry, rz)
    if parent is not None:
        m = parent @ m
    batch.add("box", m, col)


def shape(batch, col, geo, x, y, z, parent=None, ry=0.0):
    m = M(x, y, z, 1, 1, 1, 0, ry, 0)
    if parent is not None:
        m = parent @ m
    batch.add(geo, m, col)


TAU = math.pi * 2
