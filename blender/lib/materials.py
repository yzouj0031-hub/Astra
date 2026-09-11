"""材质（阶段 2A：Cycles 程序化节点）。

思路：**顶点色当底色，程序化节点加细节。**

JS 那边是 MeshPhongMaterial + 顶点色，只有漫反射（watertown.js:707-714）。
2A 不照搬这个近似 —— 石头该有凹凸、木头该有纹理、水该真折射。但作者调好的
配色（粉墙、黛瓦、驳岸石、每块料的随机色偏）全在顶点色里，扔掉就变味了，
所以每个材质都拿 "Col" 属性当 Base Color 的底，节点只负责在它上面加变化。

顺带满足 2B 的前置条件：几何上的顶点色和 UV 一律保留（见 geo.Batch），
以后要烘 lightMap 直接就能用，不用重新展 UV、也不用回头找配色。

色彩空间：顶点色在 Batch 里已经 sRGB->Linear 解码过，节点里直接用。
配套要把 view transform 设成 Standard，否则 AgX 会把江南的灰调压没。
"""

import bpy


def _set(node, name, value):
    """输入名在各版本间改过，命中就设。"""
    if name in node.inputs:
        node.inputs[name].default_value = value
        return True
    return False


def _kill_specular(bsdf):
    if not _set(bsdf, "Specular IOR Level", 0.0):
        _set(bsdf, "Specular", 0.0)


def _fresh(name):
    """已经建过就直接复用，避免反复渲染时越堆越多。"""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat, None, None
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes, mat.node_tree.links


def _vcol(nt_nodes, x=-900, y=0):
    n = nt_nodes.new("ShaderNodeAttribute")
    n.attribute_name = "Col"
    n.location = (x, y)
    return n


def _noise(nt_nodes, scale, detail=6.0, rough=0.5, x=-900, y=-300):
    n = nt_nodes.new("ShaderNodeTexNoise")
    n.location = (x, y)
    _set(n, "Scale", scale)
    _set(n, "Detail", detail)
    _set(n, "Roughness", rough)
    return n


def _bump(nt_nodes, strength, x=-350, y=-400):
    n = nt_nodes.new("ShaderNodeBump")
    n.location = (x, y)
    _set(n, "Strength", strength)
    return n


# ---------------------------------------------------------------- 通用

def vertex_color_material(name="M_VColor"):
    """最朴素的一档：顶点色直出，没有任何细节。做几何验收时用。"""
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    bsdf = nodes["Principled BSDF"]
    _set(bsdf, "Roughness", 1.0)
    _kill_specular(bsdf)
    links.new(_vcol(nodes, bsdf.location.x - 320, bsdf.location.y).outputs["Color"],
              bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------- 石

def stone_material(name="M_Stone"):
    """驳岸、石板路、台阶、古井。粗粝、微凹凸、湿处偏暗。"""
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    bsdf = nodes["Principled BSDF"]
    _kill_specular(bsdf)

    col = _vcol(nodes)
    grain = _noise(nodes, scale=38.0, detail=8.0, rough=0.6, y=-260)
    blotch = _noise(nodes, scale=3.5, detail=4.0, y=-560)

    # 底色 x 大块深浅
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.location = (-520, 0)
    _set(mix, "Factor", 0.35)
    links.new(col.outputs["Color"], mix.inputs[6])       # A
    links.new(blotch.outputs["Color"], mix.inputs[7])    # B
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    # 粗糙度跟着颗粒走：0.72 ~ 0.95
    rough = nodes.new("ShaderNodeMapRange")
    rough.location = (-520, -300)
    _set(rough, "From Min", 0.0)
    _set(rough, "From Max", 1.0)
    _set(rough, "To Min", 0.72)
    _set(rough, "To Max", 0.95)
    links.new(grain.outputs["Fac"], rough.inputs["Value"])
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])

    bump = _bump(nodes, 0.35)
    links.new(grain.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------- 木

def wood_material(name="M_Wood"):
    """灯柱、栏杆、牌子。顺纹理，半哑光。"""
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    bsdf = nodes["Principled BSDF"]
    _set(bsdf, "Roughness", 0.62)
    if not _set(bsdf, "Specular IOR Level", 0.2):
        _set(bsdf, "Specular", 0.2)

    col = _vcol(nodes)
    # 木纹：坐标拉长后的噪声，做成条状
    coord = nodes.new("ShaderNodeTexCoord")
    coord.location = (-1250, -300)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-1080, -300)
    _set(mapping, "Scale", (1.0, 14.0, 1.0))
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    grain = _noise(nodes, scale=9.0, detail=6.0, y=-300)
    links.new(mapping.outputs["Vector"], grain.inputs["Vector"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.location = (-520, 0)
    _set(mix, "Factor", 0.30)
    links.new(col.outputs["Color"], mix.inputs[6])
    links.new(grain.outputs["Color"], mix.inputs[7])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    bump = _bump(nodes, 0.18)
    links.new(grain.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------- 地面

def ground_material(name="M_Ground"):
    """草地与土路。顶点色里已经有草/土的分区和抖动，这里只加破碎感。"""
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    bsdf = nodes["Principled BSDF"]
    _set(bsdf, "Roughness", 0.95)
    _kill_specular(bsdf)

    col = _vcol(nodes)
    fine = _noise(nodes, scale=120.0, detail=8.0, rough=0.65, y=-260)
    patch = _noise(nodes, scale=6.0, detail=6.0, y=-560)

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.location = (-520, 0)
    _set(mix, "Factor", 0.28)
    links.new(col.outputs["Color"], mix.inputs[6])
    links.new(patch.outputs["Color"], mix.inputs[7])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    bump = _bump(nodes, 0.22)
    links.new(fine.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ---------------------------------------------------------------- 植被

def foliage_material(name="M_Foliage"):
    """树冠、垂枝、菜畦、远山。加一点透光，逆光时叶子才不是死黑。"""
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    bsdf = nodes["Principled BSDF"]
    _set(bsdf, "Roughness", 0.85)
    _kill_specular(bsdf)

    col = _vcol(nodes)
    links.new(col.outputs["Color"], bsdf.inputs["Base Color"])

    trans = nodes.new("ShaderNodeBsdfTranslucent")
    trans.location = (-300, -260)
    links.new(col.outputs["Color"], trans.inputs["Color"])

    mix = nodes.new("ShaderNodeMixShader")
    mix.location = (120, -60)
    _set(mix, "Fac", 0.18)
    out = nodes["Material Output"]
    links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    links.new(trans.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- 水

def water_material(name="M_Water"):
    """河水：真折射 + 体积吸收。

    JS 那边是一段手写的 ShaderMaterial（watertown.js:505-533），用两组正弦
    伪造波纹和高光。2A 不搬这个近似：表面用 Glass（IOR 1.333），水色靠
    Volume Absorption 随深度累积 —— 所以**水体必须是闭合的实体**，
    不能是原来那张单面 plane，见 parts/site.py 的说明。
    """
    mat, nodes, links = _fresh(name)
    if nodes is None:
        return mat
    for n in list(nodes):
        if n.type != "OUTPUT_MATERIAL":
            nodes.remove(n)
    out = nodes["Material Output"]

    glass = nodes.new("ShaderNodeBsdfGlass")
    glass.location = (-200, 120)
    _set(glass, "IOR", 1.333)
    _set(glass, "Roughness", 0.02)
    _set(glass, "Color", (1.0, 1.0, 1.0, 1.0))
    links.new(glass.outputs["BSDF"], out.inputs["Surface"])

    # 波纹：两层不同尺度的噪声叠成法线扰动
    swell = _noise(nodes, scale=1.6, detail=3.0, rough=0.4, x=-1000, y=-100)
    ripple = _noise(nodes, scale=14.0, detail=6.0, rough=0.55, x=-1000, y=-400)

    add = nodes.new("ShaderNodeMix")
    add.data_type = "RGBA"
    add.blend_type = "ADD"
    add.location = (-700, -250)
    _set(add, "Factor", 0.35)
    links.new(swell.outputs["Color"], add.inputs[6])
    links.new(ripple.outputs["Color"], add.inputs[7])

    bump = _bump(nodes, 0.12, x=-450, y=-250)
    links.new(add.outputs[2], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], glass.inputs["Normal"])

    # 水色：越深越绿，取自 JS 里的 uA = 0x4f7f78
    absorb = nodes.new("ShaderNodeVolumeAbsorption")
    absorb.location = (-200, -220)
    _set(absorb, "Color", (0.086, 0.216, 0.196, 1.0))
    _set(absorb, "Density", 0.55)
    links.new(absorb.outputs["Volume"], out.inputs["Volume"])
    return mat


# ---------------------------------------------------------------- 场景设置

def setup_view_transform(scene):
    """顶点色是按显示值写的，用 Standard 才还原得回去。"""
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass


def for_batch_key(key):
    """把 JS 的 BATCH_KEYS 映到 2A 材质。

    sign 还没有材质 —— 它要 buildAtlas 那张画着招牌文字的图集，
    等图集移植了再补，现在先按木头处理。
    """
    return {
        "stone": stone_material,
        "wood": wood_material,
        "foliage": foliage_material,
        "ground": ground_material,
        "sign": wood_material,
        "wall": stone_material,
        "roof": stone_material,
        "misc": vertex_color_material,
        "glow": vertex_color_material,
    }.get(key, vertex_color_material)()
