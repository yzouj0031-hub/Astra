"""材质：把顶点色接到 Principled 上。

对应 watertown.js:707-714 的 makeMaterials()：
    MeshPhongMaterial({vertexColors:true, specular:0x000000, shininess:1})
即「只有漫反射、没有高光」。Cycles 里等价写法是 Principled 关掉镜面反射、
粗糙度拉满，Base Color 接顶点色属性 "Col"（geo.Batch 写入的那个）。

顶点色在 Batch 里已经做过 sRGB->Linear 解码，所以这里直接连，不再转换。
配套要把 view transform 设成 Standard（见 render 设置），否则 AgX 会把
作者调好的粉墙黛瓦压成灰的。
"""

import bpy


def _set(bsdf, name, value):
    """Principled 的输入名在各版本间改过，命中就设，没命中就算了。"""
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value
        return True
    return False


def vertex_color_material(name="M_VColor"):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    _set(bsdf, "Roughness", 1.0)
    # 关高光：新版叫 "Specular IOR Level"，旧版叫 "Specular"
    if not _set(bsdf, "Specular IOR Level", 0.0):
        _set(bsdf, "Specular", 0.0)

    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    attr.location = (bsdf.location.x - 320, bsdf.location.y)
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def setup_view_transform(scene):
    """顶点色是按显示值写的，用 Standard 才还原得回去。"""
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
