"""把"建模感"往下压的两件小事：倒角 + 按角度平滑。

现实里没有数学上的完美尖边 —— 任何一块木头、一堵墙、一片瓦，边角都有
零点几毫米到几毫米的圆角，正是这道圆角会挂住一条细高光。少了它，
再好的材质看着也像 CG。这是每小时能换到最多真实感的一步。

两个前提让这件事在这个项目里特别便宜：
- Batch 是把成百上千个盒子合进一个网格，但**盒子之间的顶点没有焊接**，
  所以倒角是各倒各的，不会把相邻两栋房子的墙角连起来倒圆。
- 开 clamp_overlap：瓦垄那种 0.1 米厚的细条不会因为倒角过宽而自己翻出去。

修改器顺序要紧：先倒角、再按角度平滑。反过来的话，平滑只看得到原始的
90 度硬边，倒角新生出来的小面不会被纳入，边上会出现一圈死板的棱。
"""

import math

import bpy

# 4 毫米。房子按米建，这个量级相当于真实建筑的抹角和木料倒棱。
DEFAULT_WIDTH = 0.004
DEFAULT_SEGMENTS = 2
SMOOTH_ANGLE = math.radians(34)


def add_bevel(obj, width=DEFAULT_WIDTH, segments=DEFAULT_SEGMENTS,
              angle=math.radians(40)):
    """给一个物件加倒角修改器（不 apply，随时可关掉对比）。"""
    if obj is None or obj.type != "MESH":
        return None
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = angle
    mod.use_clamp_overlap = True     # 细条不会被倒穿
    mod.miter_outer = "MITER_ARC"    # 三面交汇的角落圆得自然些
    return mod


def auto_smooth(obj, angle=SMOOTH_ANGLE):
    """按夹角平滑：倒角面之间的小夹角变平滑，90 度的墙角仍然是硬的。"""
    if obj is None or obj.type != "MESH":
        return
    ctx = bpy.context
    prev = ctx.view_layer.objects.active
    ctx.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_auto_smooth(angle=angle)
    except Exception as e:                      # noqa: BLE001
        print(f"[detail] {obj.name} 平滑失败：{e}")
    obj.select_set(False)
    ctx.view_layer.objects.active = prev


def refine(obj, width=DEFAULT_WIDTH, segments=DEFAULT_SEGMENTS):
    """倒角 + 平滑，顺序固定。"""
    add_bevel(obj, width, segments)
    auto_smooth(obj)                 # 加在倒角之后，才能吃到倒角新生的面
    return obj


# 哪些东西该倒角。水面是玻璃、雨丝是薄片、远山是大块山影，倒了没意义还费时间。
SKIP = {"Foliage", "Streaks", "Rain", "Mist", "Ground"}

# 按材料给不同的倒角量 —— 统一给一个值是错的。
# 抹灰的粉墙阳角本来就是圆的，一两厘米；石作被磨圆的边更大；
# 木构件倒棱三五毫米；瓦当边缘薄，给大了会把瓦垄倒没。
# 距离也要算进去：20 米外 4 毫米不到一个像素，等于白做。
WIDTHS = {
    "Wall": 0.014, "TH_wall": 0.014,     # 粉墙：抹灰的阳角
    "Stone": 0.010,                       # 驳岸、石板、台阶
    "Roof": 0.005, "TH_roof": 0.005,     # 瓦：薄，不能多
    "Wood": 0.004, "TH_wood": 0.004,     # 木构件倒棱
    "Sign": 0.004, "Misc": 0.004,
    "Lanterns": 0.003, "Glow": 0.002, "TH_glow": 0.002,
}


def refine_scene(collections, segments=DEFAULT_SEGMENTS, quiet=False):
    """给若干 Collection 里的网格加倒角，宽度按材料查表。返回处理了几个。"""
    n = 0
    for col in collections:
        for obj in col.objects:
            if obj.type != "MESH" or obj.name in SKIP:
                continue
            refine(obj, WIDTHS.get(obj.name, DEFAULT_WIDTH), segments)
            n += 1
    if not quiet:
        print(f"[detail] 倒角 {n} 个网格：粉墙 14mm / 石作 10mm / 瓦 5mm / "
              f"木作 4mm，各 {segments} 段")
    return n
