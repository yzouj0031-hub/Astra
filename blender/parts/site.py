"""场地：布局常量、水域判定、地形、驳岸、地面、广场、远山、农田、河水。

移植自 watertown.js:131-158（布局与判定）、322-340（驳岸）、
429-476（地面/广场/远山/农田）、534-539（河水）。

生成顺序（watertown.js:644-687 layoutTown + 1108 init）：
    buildBridge x4 -> buildBanks -> 沿河房子 -> 支流房子
    -> buildPlaza -> buildGate -> buildTeahouse -> buildCamphor
    -> 柳树三批 -> buildPagoda -> buildMountains -> buildFields -> 灯笼
    然后 init 里：buildWater -> buildGround
这个顺序就是随机流的消费顺序，总装时（build_garden.py）必须照抄。
本模块只提供零件，不自己决定顺序。
"""

import math

from ..lib import color as _color
from ..lib.geo import TAU, M, box, js_round

# ---------------------------------------------------------------- 布局
# watertown.js:132-139
L = {
    "canal": 6,                                  # 主河道半宽
    "laneIn": 6, "laneOut": 12,
    "hill": {"x": -112, "z": 84, "r": 60, "h": 20},
    "branch": {"x0": 60, "x1": 68, "z0": 6, "z1": 92},
}

WATER_RECTS = [
    {"x0": -300, "x1": 300, "z0": -L["canal"], "z1": L["canal"]},
    {"x0": L["branch"]["x0"], "x1": L["branch"]["x1"],
     "z0": L["branch"]["z0"], "z1": L["branch"]["z1"]},
]

# 调色板（watertown.js:24-32 的相关项）
C = {
    "stone": 0x9A978A, "stoneDk": 0x767468, "stoneLt": 0xB0AC9E,
    "woodDk": 0x3A2716,
    "grass": 0x7C8F5F, "grassDk": 0x5F7348, "soil": 0x8A7A5C,
}


class Registry:
    """JS 里那几个模块级数组。总装时传同一个实例给所有 build*。"""

    def __init__(self):
        self.bridges = []        # {x, z, axis: "z"/"x", len, halfW, h}
        self.obstacles = []      # {x0, x1, z0, z1}
        self.lantern_spots = []  # {x, y, z, water: 1/-1/0, light: bool}


# ---------------------------------------------------------------- 判定
# watertown.js:141-152

def in_water_raw(x, z):
    for w in WATER_RECTS:
        if w["x0"] <= x <= w["x1"] and w["z0"] <= z <= w["z1"]:
            return True
    return False


def bridge_at(reg, x, z):
    for b in reg.bridges:
        if b["axis"] == "z":
            if abs(x - b["x"]) <= b["halfW"] and abs(z - b["z"]) <= b["len"]:
                return b
        else:
            if abs(z - b["z"]) <= b["halfW"] and abs(x - b["x"]) <= b["len"]:
                return b
    return None


def bridge_y(b, x, z):
    s = ((z - b["z"]) if b["axis"] == "z" else (x - b["x"])) / b["len"]
    return b["h"] * (1 - s * s)


def is_water(reg, x, z):
    return in_water_raw(x, z) and not bridge_at(reg, x, z)


def hill_y(x, z):
    """watertown.js:151 —— 山是解析式四次方凸包，不是噪声场。"""
    h = L["hill"]
    d = math.hypot(x - h["x"], z - h["z"]) / h["r"]
    if d >= 1:
        return 0.0
    t = 1 - d * d
    return h["h"] * t * t


def ground_y(reg, x, z):
    b = bridge_at(reg, x, z)
    return bridge_y(b, x, z) if b else hill_y(x, z)


# ---------------------------------------------------------------- 驳岸
BANKS_DRAWS = 2 * (3 + 8 * 4)   # 每侧：石板路 tint 3 + 8 处河埠头 x 4 级台阶


def build_banks(batches, rng, reg):
    """watertown.js:322 —— 驳岸墙、压顶、石板路、河埠头台阶、灯柱。"""
    stone_c, dk = C["stone"], C["stoneDk"]
    b_stone, b_wood = batches["stone"], batches["wood"]

    for s in (1, -1):
        box(b_stone, dk, 560, 1.5, 0.5, 0, -0.6, s * 6.15)                          # 驳岸墙
        box(b_stone, stone_c, 560, 0.16, 0.9, 0, 0.1, s * 6.3)                      # 压顶
        box(b_stone, _color.tint(stone_c, 0.02, rng), 280, 0.3, 6, 0, -0.13, s * 9)  # 石板路

        x = -118                                                                    # 河埠头
        while x <= 124:
            for k in range(4):
                box(b_stone, stone_c if k % 2 else dk, 3.2, 0.35, 0.7,
                    x + rng.rr(-4, 4), -0.05 - k * 0.32, s * (5.6 - k * 0.62))
            x += 34

        x = -124                                                                    # 灯柱
        while x <= 124:
            if not (abs(x - 64) < 7 and s == 1):
                box(b_wood, C["woodDk"], 0.16, 3.4, 0.16, x, 1.7, s * 5.55)
                box(b_wood, C["woodDk"], 0.7, 0.1, 0.1, x, 3.35, s * 5.55)
                box(b_wood, C["woodDk"], 0.16, 0.4, 0.16, x + 0.28, 3.15, s * 5.55)
                reg.lantern_spots.append({"x": x + 0.28, "y": 2.75, "z": s * 5.55,
                                          "water": s, "light": False})
            x += 9

    for x in (L["branch"]["x0"] - 0.15, L["branch"]["x1"] + 0.15):                  # 支流两岸
        box(b_stone, dk, 0.5, 1.5, 86, x, -0.6, 49)
        box(b_stone, stone_c, 0.9, 0.16, 86, x, 0.1, 49)


# ---------------------------------------------------------------- 地面
def _plane_grid(w, d, seg_x, seg_z, cx, cz):
    """three.js PlaneGeometry(w,d,segX,segZ).rotateX(-PI/2).translate(cx,0,cz)
    的顶点/面/UV。顶点遍历顺序（iy 外、ix 内）必须与 three.js 一致 ——
    groundPiece 每个顶点要取一个随机数。"""
    verts, uvs_v, faces = [], [], []
    for iy in range(seg_z + 1):
        for ix in range(seg_x + 1):
            verts.append((cx + ix * w / seg_x - w / 2, 0.0,
                          cz + iy * d / seg_z - d / 2))
            uvs_v.append((ix / seg_x, 1 - iy / seg_z))
    for iy in range(seg_z):
        for ix in range(seg_x):
            a = iy * (seg_x + 1) + ix
            b = a + 1
            c = a + seg_x + 1
            e = c + 1
            faces.append((a, b, e, c))
    return verts, faces, uvs_v


def ground_piece_draws(x0, x1, z0, z1):
    w, d = x1 - x0, z1 - z0
    return (max(2, js_round(w / 7)) + 1) * (max(2, js_round(d / 7)) + 1)


def ground_piece(batch, rng, x0, x1, z0, z1):
    """watertown.js:429 —— 一块地面。每个顶点取一次随机数做草色抖动。"""
    w, d = x1 - x0, z1 - z0
    seg_x = max(2, js_round(w / 7))
    seg_z = max(2, js_round(d / 7))
    verts, faces, uvs_v = _plane_grid(w, d, seg_x, seg_z, (x0 + x1) / 2, (z0 + z1) / 2)

    out_verts, cols = [], []
    for (x, _, z) in verts:
        in_town = abs(z) < 34 and abs(x) < 150
        y = hill_y(x, z)
        if not in_town:
            y += (math.sin(x * 0.13) * math.cos(z * 0.11) * 0.7
                  + math.sin(x * 0.31 + z * 0.17) * 0.3)
        out_verts.append((x, y - 0.02, z))

        hill_t = min(1.0, max(0.0, y / L["hill"]["h"]))
        c = _color.lerp_color(C["grass"], C["grassDk"], rng.rr(0, 0.4) + hill_t * 0.4)
        if abs(z) < 27 and abs(x) < 140:
            c = _color.lerp_color(c, C["soil"], 0.6)
        cols.append(c)

    face_uvs = [[uvs_v[i] for i in f] for f in faces]
    batch.add_raw(out_verts, faces, cols, face_uvs, [True] * len(faces))


GROUND_RECTS = [
    (-380, L["branch"]["x0"], L["canal"], 380),
    (L["branch"]["x1"], 380, L["canal"], 380),
    (L["branch"]["x0"], L["branch"]["x1"], L["branch"]["z1"], 380),
    (-380, 380, -380, -L["canal"]),
]
GROUND_DRAWS = sum(ground_piece_draws(*r) for r in GROUND_RECTS)


def build_ground(batch, rng):
    """watertown.js:446"""
    for r in GROUND_RECTS:
        ground_piece(batch, rng, *r)


# ---------------------------------------------------------------- 广场
PLAZA_DRAWS = 3


def build_plaza(batches, rng, reg, uv_of=None):
    """watertown.js:451 —— 石板广场、古井、石凳、渡口牌子。"""
    b_stone, b_wood, b_sign = batches["stone"], batches["wood"], batches["sign"]
    box(b_stone, _color.tint(C["stone"], 0.02, rng), 26, 0.3, 17, 1, -0.13, 20.5)

    b_stone.add("cyl", M(-3, 0.45, 25.5, 0.9, 0.9, 0.9), C["stoneLt"])          # 古井
    b_stone.add("cyl", M(-3, 0.92, 25.5, 0.6, 0.1, 0.6), 0x1B2A2E)              # 井里的水
    reg.obstacles.append({"x0": -4, "x1": -2, "z0": 24.5, "z1": 26.5, "h": 1.0})

    for x, z in ((-10.5, 16), (9, 25.5)):                                       # 石凳
        box(b_stone, C["stoneLt"], 2.2, 0.45, 0.6, x, 0.45, z)

    box(b_wood, C["woodDk"], 0.14, 2.6, 0.14, -42.5, 1.3, 7.6)                  # 渡口牌子
    box(b_sign, C["stone"], 1.4, 0.8, 0.1, -42.5, 2.4, 7.6, 0, 0, 0, None,
        uv_of("dock") if uv_of else None)


# ---------------------------------------------------------------- 远山与农田
def build_mountains(batch, rng):
    """watertown.js:460 —— 一圈远山，18 个方位各三座锥子。

    注意 continue 发生在头两个随机数**之后**，被跳过的方位仍然消耗 2 个数。
    """
    for i in range(18):
        a = i / 18 * TAU + rng.rr(-0.12, 0.12)
        dist = rng.rr(240, 320)
        x, z = math.cos(a) * dist, math.sin(a) * dist
        if abs(z) < 60 and abs(x) < 200:
            continue
        col = _color.lerp_color(0x4C6272, 0x5E7A86, rng.rnd())
        for k in range(3):
            h = rng.rr(40, 90) * (0.7 if k else 1)
            w = rng.rr(60, 120)
            batch.add("cone6",
                      M(x + rng.rr(-40, 40), h / 2 - 6, z + rng.rr(-30, 30),
                        w, h, w * rng.rr(0.7, 1), 0, rng.rr(0, TAU), 0),
                      col)


FIELDS_DRAWS = 6 * 5


def build_fields(batch, rng):
    """watertown.js:468 —— 六块菜畦"""
    for i in range(6):
        x = 120 + rng.rr(-8, 8) + (i % 3) * 18
        z = 40 + (i // 3) * 16 + rng.rr(-2, 2)
        box(batch, _color.tint(0x6F9A4E, 0.05, rng), 15, 0.3, 13, x, 0.05, z)
        for k in range(-5, 6):
            box(batch, 0x4F7A38, 15, 0.12, 0.25, x, 0.26, z + k * 1.2)
        box(batch, C["soil"], 15.6, 0.36, 0.5, x, 0.05, z - 6.75)
        box(batch, C["soil"], 15.6, 0.36, 0.5, x, 0.05, z + 6.75)


# ---------------------------------------------------------------- 河水
# watertown.js:534 —— 两片水面，y=-0.8。JS 那边是 ShaderMaterial 手写波纹，
# 2A 不照搬这个近似，改用真实折射（见 lib/materials.py 的 water_material）。
WATER_PLANES = [
    {"name": "Water_Canal", "w": 600, "d": 12, "x": 0, "y": -0.8, "z": 0},
    {"name": "Water_Branch", "w": 8, "d": 86, "x": 64, "y": -0.8, "z": 49},
]
