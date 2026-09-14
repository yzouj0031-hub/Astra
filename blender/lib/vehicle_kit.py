"""载具建模的公共件：材质、放样、截面扫描、圆柱圆环、按对象写出。

build_roadster.py 里先写出来的一套，水上飞机、船要复用，挪到这里。
约定和 build_roadster.py 一样：Blender 里 Z 朝上、机头/车头朝 -Y；
导出 glTF（Y 朝上）后朝 +Z，和游戏里 buildCar / buildSeaplane 的朝向一致。
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


class Kit:
    """一个载具的材质表 + 建模函数。材质按添加顺序编号，所有网格共用同一张槽位表。"""

    def __init__(self, tex_dir, texres=512):
        self.tex_dir = tex_dir
        self.texres = texres
        self.M = {}
        self.order = []

    # ------------------------------------------------------------ 材质
    @staticmethod
    def _principled(m):
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

    def plain(self, key, rgb, metal=0.0, rough=0.5, alpha=1.0, emit=None):
        m = bpy.data.materials.new(key)
        nt, b = self._principled(m)
        b.inputs["Base Color"].default_value = (*rgb, 1.0)
        b.inputs["Metallic"].default_value = metal
        b.inputs["Roughness"].default_value = rough
        if alpha < 1.0:
            b.inputs["Alpha"].default_value = alpha
            m.surface_render_method = "BLENDED"
        if emit:
            b.inputs["Emission Color"].default_value = (*emit, 1.0)
            b.inputs["Emission Strength"].default_value = 1.0
        self.M[key] = m
        self.order.append(key)
        return m

    def _img(self, path, color=True):
        img = bpy.data.images.load(path, check_existing=True)
        if not color:
            img.colorspace_settings.name = "Non-Color"
        if img.size[0] > self.texres:
            img.scale(self.texres, self.texres)
            img.pack()
        return img

    def textured(self, key, folder, tint=None, rough_default=0.6, rough=None):
        """rough 给了就用固定粗糙度、不接粗糙度贴图：布料那张图偏光滑，蒙皮会反一大片天光，发蓝发灰。"""
        m = bpy.data.materials.new(key)
        nt, b = self._principled(m)
        d = os.path.join(self.tex_dir, folder)
        diff = nt.nodes.new("ShaderNodeTexImage")
        diff.image = self._img(os.path.join(d, "diff.jpg"))
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
            nor.image = self._img(os.path.join(d, "nor.jpg"), color=False)
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        if rough is not None:
            b.inputs["Roughness"].default_value = rough
            b.inputs["Specular IOR Level"].default_value = 0.2
        elif os.path.exists(os.path.join(d, "rough.jpg")):
            r = nt.nodes.new("ShaderNodeTexImage")
            r.image = self._img(os.path.join(d, "rough.jpg"), color=False)
            nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
        else:
            b.inputs["Roughness"].default_value = rough_default
        self.M[key] = m
        self.order.append(key)
        return m

    # ------------------------------------------------------------ 几何
    def part(self):
        return Part(self)

    def finish(self, part, name, smooth_angle=35.0, uv_scale=0.6, collection=None):
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
        for key in self.order:
            me.materials.append(self.M[key])
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


class Part:
    def __init__(self, kit):
        self.kit = kit
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def face(self, verts, mat):
        f = self.bm.faces.new(verts)
        f.material_index = self.kit.order.index(mat)
        return f

    def loft(self, rings, mat, cap0=True, cap1=True, closed=True):
        vs = [[self.bm.verts.new(Vector(p)) for p in r] for r in rings]
        n = len(rings[0])
        faces = []
        for a, b in zip(vs, vs[1:]):
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                faces.append(self.face((a[i], a[j], b[j], b[i]), mat))
        if cap0:
            faces.append(self.face(list(reversed(vs[0])), mat))
        if cap1:
            faces.append(self.face(vs[-1], mat))
        return faces

    def box(self, c, size, mat, bevel=0.0, seg=2, rot=None):
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        R = rot or Matrix.Identity(3)
        for v in verts:
            v.co = Vector(c) + R @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = self.kit.order.index(mat)
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
        return verts

    def cylinder(self, a, b, r, mat, seg=12, caps=True, r2=None):
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(ref).normalized()
        v = axis.cross(u)
        rings = []
        for p, rr in ((a, r), (b, r if r2 is None else r2)):
            rings.append([p + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * rr for i in range(seg)])
        return self.loft(rings, mat, caps, caps)

    def sphere(self, c, r, mat, nu=10, nv=6):
        c = Vector(c)
        rings = []
        for j in range(1, nv):
            ph = math.pi * j / nv
            rings.append([c + Vector((math.sin(ph) * math.cos(2 * math.pi * i / nu), math.sin(ph) * math.sin(2 * math.pi * i / nu), -math.cos(ph))) * r for i in range(nu)])
        faces = self.loft(rings, mat, cap0=False, cap1=False)
        bottom = self.bm.verts.new(c + Vector((0, 0, -r)))
        top = self.bm.verts.new(c + Vector((0, 0, r)))
        first = [v for v in self.bm.verts][-2 - nu * (nv - 1):-2 - nu * (nv - 2)]
        last = [v for v in self.bm.verts][-2 - nu:-2]
        for i in range(nu):
            self.face((bottom, first[(i + 1) % nu], first[i]), mat)
            self.face((top, last[i], last[(i + 1) % nu]), mat)
        return faces

    def torus(self, center, axis, R, ra, rw, mat, nu=36, nv=10):
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
        vs = [[self.bm.verts.new(p) for p in r] for r in rings]
        for i in range(nu):
            A, B = vs[i], vs[(i + 1) % nu]
            for j in range(nv):
                k = (j + 1) % nv
                self.face((A[j], A[k], B[k], B[j]), mat)


def superellipse(cx, cz, w, h, y, n=32, e=4.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        pts.append(Vector((cx + (w / 2) * math.copysign(abs(c) ** (2 / e), c), y, cz + (h / 2) * math.copysign(abs(s) ** (2 / e), s))))
    return pts


def smooth_keys(keys, steps):
    out = []
    for a, b in zip(keys, keys[1:]):
        for s in range(steps):
            t = s / steps
            t = t * t * (3 - 2 * t)
            out.append(tuple(pa + (pb - pa) * t for pa, pb in zip(a, b)))
    out.append(keys[-1])
    return out


def airfoil(chord, thick, n=16):
    """对称翼型截面，返回 (沿弦向 y, 厚度方向 z) 的闭合点列；前缘在 y=0，后缘在 y=chord。"""
    top = []
    for i in range(n + 1):
        t = (1 - math.cos(math.pi * i / n)) / 2
        half = 5 * thick * (0.2969 * math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1036 * t ** 4)
        top.append((t * chord, max(half, 0.004)))
    return top + [(y, -z) for y, z in reversed(top[1:-1])]


def report_and_export(objects, out, tag, limit=None):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objects:
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        for v in me.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        print(f"[{tag}] {ob.name:14s} tris {len(me.loop_triangles)}")
        ob.evaluated_get(dg).to_mesh_clear()
    size = hi - lo
    print(f"[{tag}] 三角形合计 {total}")
    print(f"[{tag}] 尺寸 宽 {size.x:.2f} × 长 {size.y:.2f} × 高 {size.z:.2f}  底 z={lo.z:.2f}")
    if limit:
        assert size.x <= limit[0] + 1e-6 and size.y <= limit[1] + 1e-6, f"超出尺寸上限 {limit}"
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=85, export_materials="EXPORT")
    print(f"[{tag}] 写出 {out}  {os.path.getsize(out) / 1048576:.2f}MB")
    return total, size
