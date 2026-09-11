"""建筑：粉墙黛瓦的房子、马头墙、临街立面、石拱桥。

移植自 watertown.js:167-320。

屋顶是这一段的难点，做法说明一下：
- `roofProfile` 给的是**从脊到檐的下凹曲线**（幂 1.6），四个采样点，
  檐口再压低 0.12。整片屋面是把这条曲线镜像成一个「人字 + 厚度 0.3」的
  截面，沿房子长度方向 ExtrudeGeometry 拉出去 —— 不是两块斜板拼的。
- 瓦垄是在这片曲面上按段铺细条：每段坡面算出中点、长度、倾角，
  沿长度方向每米一根，两侧对称各来一根（`-sg.ang` / `+sg.ang`）。
- 山墙（马头墙）分三阶，每阶的顶高由 `roofYAt` 在该处的屋面高度 +0.6 决定，
  所以阶梯是贴着屋面走的。

`addBody` 的墙体也是挤出：山墙面的轮廓上边缘直接采样 `roofYAt`-0.26，
让墙顶严丝合缝顶住屋面，中间不留缝。

**取数**：整栋房子只有 buildHouse 头两行取随机（13 个），
addRoof/addBody/addGables/addFront 一个都不取 —— 它们的形状完全由参数决定。
"""

import math

from ..lib import atlas as _atlas
from ..lib import color as _color
from ..lib.geo import BATCH_KEYS as _BATCH_KEYS
from ..lib.geo import (M, TAU, box, extrude_prim, flip_inside, js_round,
                       tube_prim)

# watertown.js:24-32
C = {
    "wall": 0xF1ECE1, "wallWarm": 0xE9DFCD, "wallCool": 0xE3E6E2,
    "slate": 0x2C3137, "slateDk": 0x1D2125, "slateLt": 0x3A4048,
    "wood": 0x6B4A2B, "woodDk": 0x3A2716, "woodLt": 0x8C6A42,
    "stone": 0x9A978A, "stoneDk": 0x767468, "stoneLt": 0xB0AC9E,
    "lantern": 0xD94A35, "glowWin": 0xFFC27A,
}

HOUSE_DRAWS = 13        # wallC 4 + slateC 3 + stripC 3 + 台基 3
BRIDGE_DRAWS = 6        # stoneC 3 + stoneD 3


def _clamp(v, a, b):
    return a if v < a else (b if v > b else v)


# ---------------------------------------------------------------- 屋顶曲线

def roof_profile(H, r, half_d):
    """watertown.js:168 —— 从脊到檐的下凹曲线，檐口压低 0.12。"""
    return [[s * half_d, H + r * pow(1 - s, 1.6) - (0.12 if s == 1 else 0)]
            for s in (0, 0.34, 0.68, 1)]


def roof_y_at(H, r, half_d, z):
    """watertown.js:171 —— 屋面在 z 处的高度。"""
    s = _clamp(abs(z) / half_d, 0, 1)
    return H + r * pow(1 - s, 1.6)


# ---------------------------------------------------------------- 屋顶

def add_roof(bt, parent, w, d, H, r, ox, oz, slate_c, strip_c):
    """watertown.js:173"""
    half_d = d / 2 + oz
    prof = roof_profile(H, r, half_d)
    t = 0.3
    length = w + 2 * ox

    outer = [[-prof[i][0], prof[i][1]] for i in range(len(prof) - 1, -1, -1)]
    outer += [[prof[i][0], prof[i][1]] for i in range(1, len(prof))]
    poly = outer + [[p[0], p[1] - t] for p in reversed(outer)]

    bt["roof"].add(extrude_prim(poly, length),
                   parent @ M(-length / 2, 0, 0, 1, 1, 1, 0, math.pi / 2, 0),
                   slate_c)

    # 瓦垄：每段坡面铺细条
    segs = []
    for i in range(len(prof) - 1):
        z0, y0 = prof[i]
        z1, y1 = prof[i + 1]
        segs.append({"z": (z0 + z1) / 2, "y": (y0 + y1) / 2 + 0.09,
                     "len": math.hypot(z1 - z0, y1 - y0) + 0.05,
                     "ang": math.atan2(y1 - y0, z1 - z0)})
    n = max(2, js_round(length / 1.0))
    for k in range(n + 1):
        x = -length / 2 + 0.12 + (length - 0.24) * k / n
        for sg in segs:
            box(bt["roof"], strip_c, 0.13, 0.1, sg["len"],
                x, sg["y"], sg["z"], 0, -sg["ang"], 0, parent)
            box(bt["roof"], strip_c, 0.13, 0.1, sg["len"],
                x, sg["y"], -sg["z"], 0, sg["ang"], 0, parent)

    # 正脊与两端翘起的脊饰
    box(bt["roof"], C["slateDk"], length + 0.4, 0.36, 0.62, 0, H + r + 0.1, 0, 0, 0, 0, parent)
    box(bt["roof"], C["slateDk"], 0.5, 0.78, 0.34,
        length / 2 + 0.15, H + r + 0.4, 0, 0, 0, -0.35, parent)
    box(bt["roof"], C["slateDk"], 0.5, 0.78, 0.34,
        -length / 2 - 0.15, H + r + 0.4, 0, 0, 0, 0.35, parent)


# ---------------------------------------------------------------- 墙体

def add_body(bt, parent, w, d, H, r, y_base, color):
    """watertown.js:198 —— 墙体，山墙顶边贴着屋面走。"""
    hd = d / 2
    half_d = hd + 0.8
    poly = [[-hd, y_base], [hd, y_base], [hd, H]]
    for s in (0.85, 0.7, 0.5, 0.3, 0.15, 0, -0.15, -0.3, -0.5, -0.7, -0.85):
        poly.append([s * hd, roof_y_at(H, r, half_d, s * hd) - 0.26])
    poly.append([-hd, H])

    bt["wall"].add(extrude_prim(poly, w),
                   parent @ M(-w / 2, 0, 0, 1, 1, 1, 0, math.pi / 2, 0),
                   color)


# ---------------------------------------------------------------- 马头墙

def add_gables(bt, parent, w, d, H, r, oz, wall_c):
    """watertown.js:207 —— 山墙两端阶梯状高出屋面。"""
    half_d = d / 2 + oz
    bounds = [0, 0.2 * d, 0.42 * d, d / 2 + 0.5]
    for sx in (-1, 1):
        gx = sx * (w / 2 + 0.14)
        for k in range(3):
            z0, z1 = bounds[k], bounds[k + 1]
            top = roof_y_at(H, r, half_d, z0) + 0.6
            for sz in ([1] if k == 0 else [-1, 1]):
                zc = 0 if k == 0 else sz * (z0 + z1) / 2
                zl = 2 * z1 if k == 0 else (z1 - z0)
                box(bt["wall"], wall_c, 0.5, top, zl + 0.02, gx, top / 2, zc, 0, 0, 0, parent)
                box(bt["roof"], C["slateDk"], 0.82, 0.28, zl + 0.45,
                    gx, top + 0.12, zc, 0, 0, 0, parent)


# ---------------------------------------------------------------- 临街立面

def add_front(bt, parent, o, H, upper_only, reg):
    """watertown.js:221 —— 窗、门、铺面、招牌、酒旗、阳台、檐下灯笼。"""
    w, d = o["w"], o["d"]
    zf = d / 2
    wood = C["woodDk"]
    slots = max(1, int((w - 1.4) // 2.5))
    gap = (w - 1.4) / slots
    xs = [-w / 2 + 0.7 + gap * (i + 0.5) for i in range(slots)]

    def win(x, y):
        box(bt["wood"], wood, 1.32, 1.52, 0.14, x, y, zf + 0.03, 0, 0, 0, parent)
        box(bt["glow"], C["glowWin"], 1.1, 1.3, 0.06, x, y, zf + 0.08, 0, 0, 0, parent)
        box(bt["wood"], wood, 0.05, 1.3, 0.06, x - 0.2, y, zf + 0.11, 0, 0, 0, parent)
        box(bt["wood"], wood, 0.05, 1.3, 0.06, x + 0.2, y, zf + 0.11, 0, 0, 0, parent)
        box(bt["wood"], wood, 1.1, 0.05, 0.06, x, y - 0.22, zf + 0.11, 0, 0, 0, parent)
        box(bt["wood"], wood, 1.1, 0.05, 0.06, x, y + 0.22, zf + 0.11, 0, 0, 0, parent)

    if o.get("floors") == 2:
        for x in xs:
            win(x, 4.9)

    if upper_only:
        pass
    elif o.get("shop"):
        ow = min(w * 0.62, 7)
        box(bt["misc"], 0x120F0D, ow, 2.75, 0.5, 0, 1.4, zf - 0.15, 0, 0, 0, parent)   # 敞开的铺面
        box(bt["wood"], wood, ow + 0.5, 0.3, 0.4, 0, 2.95, zf + 0.1, 0, 0, 0, parent)  # 门楣
        box(bt["wood"], wood, 0.3, 2.9, 0.4, -ow / 2 - 0.1, 1.45, zf + 0.1, 0, 0, 0, parent)
        box(bt["wood"], wood, 0.3, 2.9, 0.4, ow / 2 + 0.1, 1.45, zf + 0.1, 0, 0, 0, parent)
        box(bt["wood"], C["woodLt"], ow * 0.85, 0.9, 0.7, 0, 0.45, zf + 0.3, 0, 0, 0, parent)  # 柜台

        if o.get("signKind") == "board":                                               # 竖招牌
            sx = w / 2 - 1.0
            key = "sign" + str(o["signIdx"] % len(_atlas.SIGNS))
            box(bt["wood"], wood, 0.08, 0.08, 1.1, sx, H - 0.3, zf + 0.55, 0, 0, 0, parent)
            box(bt["sign"], C["wood"], 0.56, 1.9, 0.07, sx, H - 1.35, zf + 1.05,
                0, 0, 0, parent, _atlas.uv_of(key))
        else:                                                                          # 酒旗
            sx = -w / 2 + 1.2
            key = "flag" + str(o["signIdx"] % len(_atlas.FLAGS))
            box(bt["wood"], wood, 0.07, 0.07, 2.4, sx, H - 0.6, zf + 1.1, 0, 0, 0.0, parent)
            box(bt["sign"], C["wood"], 0.06, 1.2, 1.0, sx + 0.04, H - 1.25, zf + 1.7,
                0, 0, 0, parent, _atlas.uv_of(key))

        if o.get("floors") == 1:
            for x in xs:
                if abs(x) > ow / 2 + 0.7:
                    win(x, 1.9)
    else:
        di = len(xs) // 2
        for i, x in enumerate(xs):
            if i == di:
                box(bt["wood"], wood, 1.3, 2.5, 0.12, x, 1.25, zf + 0.03, 0, 0, 0, parent)
            else:
                win(x, 1.9)
        box(bt["stone"], C["stoneDk"], 1.9, 0.25, 0.6, xs[di], 0.12, zf + 0.25,
            0, 0, 0, parent)                                                           # 门前台阶

    if o.get("floors") == 2 and o.get("balcony"):
        bw = w - 1.6
        box(bt["wood"], C["woodLt"], bw, 0.18, 1.1, 0, 3.2, zf + 0.5, 0, 0, 0, parent)
        box(bt["wood"], C["woodLt"], bw, 0.07, 0.07, 0, 4.1, zf + 1.02, 0, 0, 0, parent)
        box(bt["wood"], C["woodLt"], bw, 0.05, 0.05, 0, 3.6, zf + 1.02, 0, 0, 0, parent)
        x = -bw / 2
        while x <= bw / 2 + 0.01:
            box(bt["wood"], C["woodLt"], 0.08, 0.95, 0.08, x, 3.72, zf + 1.02, 0, 0, 0, parent)
            x += 0.9

    # 檐下灯笼（世界坐标，所以要过一遍 parent）
    for sx in (-1, 1):
        p = parent.xform((sx * (w / 2 - 0.9), H - 0.55, zf + 0.45))
        reg.lantern_spots.append({"x": p[0], "y": p[1], "z": p[2], "water": 0})


# ---------------------------------------------------------------- 房子

def build_house(batches, rng, reg, o):
    """watertown.js:262

    `bt` 是给茶馆用的：茶馆上半截要单独一套 batch 才能在人走进去时变透明
    （watertown.js:717-719）。但台基和 openGround 那几面墙在原文里写死走全局 B，
    照抄 —— 别顺手改成 bt，那会改变茶馆的可见性行为。
    """
    bt = o.get("batches") or batches
    facing = o.get("facing", 0)
    parent = M(o["x"], o.get("y", 0), o["z"], 1, 1, 1, 0, facing, 0)
    H = 6.3 if o.get("floors") == 2 else 3.7
    r = _clamp(o["d"] * 0.3, 2.0, 3.3)
    ox, oz = 0.55, 0.8

    wall_c = _color.tint(rng.pick([C["wall"], C["wall"], C["wallWarm"], C["wallCool"]]),
                         0.02, rng)
    slate_c = _color.tint(C["slate"], 0.03, rng)
    strip_c = _color.tint(C["slateDk"], 0.02, rng)

    box(batches["stone"], _color.tint(C["stone"], 0.03, rng),
        o["w"] + 0.3, 0.4, o["d"] + 0.3, 0, 0.2, 0, 0, 0, 0, parent)      # 台基

    if not o.get("openGround"):
        add_body(bt, parent, o["w"], o["d"], H, r, 0, wall_c)
    else:
        add_body(bt, parent, o["w"], o["d"], H, r, 3.0, wall_c)           # 二层以上
        hd, hw = o["d"] / 2, o["w"] / 2
        bw, bwd = batches["wall"], batches["wood"]
        box(bw, wall_c, o["w"], 3.05, 0.4, 0, 1.5, -hd + 0.2, 0, 0, 0, parent)   # 后墙
        box(bw, wall_c, 0.4, 3.05, o["d"], -hw + 0.2, 1.5, 0, 0, 0, 0, parent)
        box(bw, wall_c, 0.4, 3.05, o["d"], hw - 0.2, 1.5, 0, 0, 0, 0, parent)
        dw = 3.2
        side = (o["w"] - dw) / 2
        box(bw, wall_c, side, 3.05, 0.4, -hw + side / 2, 1.5, hd - 0.2, 0, 0, 0, parent)
        box(bw, wall_c, side, 3.05, 0.4, hw - side / 2, 1.5, hd - 0.2, 0, 0, 0, parent)
        box(bwd, C["woodDk"], 0.3, 3.0, 0.3, -dw / 2, 1.5, hd - 0.15, 0, 0, 0, parent)
        box(bwd, C["woodDk"], 0.3, 3.0, 0.3, dw / 2, 1.5, hd - 0.15, 0, 0, 0, parent)
        box(bwd, C["woodDk"], dw + 0.6, 0.35, 0.4, 0, 3.0, hd - 0.15, 0, 0, 0, parent)
        for i in range(4):
            box(bwd, C["woodDk"], 0.24, 3.0, 0.24,
                -hw + 0.9 + i * (o["w"] - 1.8) / 3, 1.5, hd - 0.5, 0, 0, 0, parent)

    add_roof(bt, parent, o["w"], o["d"], H, r, ox, oz, slate_c, strip_c)
    if o.get("gable"):
        add_gables(bt, parent, o["w"], o["d"], H, r, oz, wall_c)
    add_front(bt, parent, o, H, bool(o.get("openGround")), reg)

    sw = abs(math.sin(facing)) > 0.5
    ex = (o["d"] if sw else o["w"]) / 2 + 0.25
    ez = (o["w"] if sw else o["d"]) / 2 + 0.25
    if not o.get("noObstacle"):
        reg.obstacles.append({"x0": o["x"] - ex, "x1": o["x"] + ex,
                              "z0": o["z"] - ez, "z1": o["z"] + ez, "pad": 1.1})
    return {"H": H, "r": r, "parent": parent}


# ---------------------------------------------------------------- 石拱桥

def build_bridge(batches, rng, reg, b):
    """watertown.js:308 —— 本地坐标里桥面沿 z 走，axis=='x' 的桥整体转 90°。"""
    parent = M(b["x"], 0, b["z"], 1, 1, 1, 0,
               math.pi / 2 if b["axis"] == "x" else 0, 0)
    lh = b["len"]
    width = b["halfW"] * 2
    hb = b["h"]
    span = 6

    def y_of(z):
        return hb * (1 - (z / lh) * (z / lh))

    # 两侧栏墙：轮廓里挖出桥洞
    poly = [[-lh, -1.6], [-span - 0.6, -1.6]]
    cx, cy = 0, -1.3
    rx, ry = span, hb - 0.9 - cy
    for i in range(21):
        a = math.pi - math.pi * i / 20
        poly.append([cx + rx * math.cos(a), cy + ry * math.sin(a)])
    poly += [[span + 0.6, -1.6], [lh, -1.6], [lh, 0.05]]
    for i in range(20, -1, -1):
        z = -lh + 2 * lh * i / 20
        poly.append([z, y_of(z) + 0.95])
    poly.append([-lh, 0.05])

    wall_prim = extrude_prim(poly, 0.4)
    stone_c = _color.tint(C["stone"], 0.02, rng)
    stone_d = _color.tint(C["stoneDk"], 0.02, rng)
    for sx in (-1, 1):
        batches["stone"].add(
            wall_prim,
            parent @ M(width / 2 - 0.4 if sx > 0 else -width / 2, 0, 0,
                       1, 1, 1, 0, math.pi / 2, 0),
            stone_c)

    # 台阶式桥面
    stone_c2 = _color.lerp_color(stone_c, C["stoneDk"], 0.16)
    z = -lh + 0.4
    while z <= lh - 0.4:
        box(batches["stone"], stone_c if js_round(z / 0.8) % 2 else stone_c2,
            width - 0.5, 1.0, 0.82, 0, y_of(z) - 0.5, z, 0, 0, 0, parent)
        z += 0.8

    # 桥洞内壁 + 桥身
    arch = flip_inside(tube_prim(1, 1, width - 0.4, 16, True, 0, math.pi))
    batches["stone"].add(
        arch, parent @ M(0, cy, 0, ry - 0.05, 1, rx - 0.05, 0, 0, math.pi / 2), stone_d)
    box(batches["stone"], stone_c, width - 0.6, 1.2, 0.6, 0, hb - 1.5, -span - 0.3,
        0, 0, 0, parent)
    box(batches["stone"], stone_c, width - 0.6, 1.2, 0.6, 0, hb - 1.5, span + 0.3,
        0, 0, 0, parent)

    # 桥头石灯柱
    for sz in (-1, 1):
        for sx in (-1, 1):
            z = sz * (lh - 1.0)
            yy = y_of(z)
            box(batches["stone"], stone_d, 0.45, 2.2, 0.45,
                sx * (width / 2 + 0.05), yy + 1.1, z, 0, 0, 0, parent)
            p = parent.xform((sx * (width / 2 + 0.05), yy + 2.55, z))
            reg.lantern_spots.append({"x": p[0], "y": p[1], "z": p[2],
                                      "water": 0, "light": bool(b.get("big"))})
    reg.bridges.append(b)


# ---------------------------------------------------------------- 宝塔
PAGODA_DRAWS = 5 * 6        # 每层：墙身 tint 3 + 檐 tint 3


def build_pagoda(batches, rng, reg, x, z, hill_y):
    """watertown.js:365 —— 山顶的望江塔，五层。

    hill_y 是个函数（parts.site.hill_y），塔要坐在山上。
    """
    y = hill_y(x, z)
    parent = M(x, y, z)
    b_stone, b_wall, b_wood, b_roof, b_sign = (
        batches["stone"], batches["wall"], batches["wood"],
        batches["roof"], batches["sign"])

    box(b_stone, C["stone"], 14, 2.6, 14, 0, 0.5, 0, 0, 0, 0, parent)
    b_stone.add("cyl", parent @ M(0, 2.1, 0, 6.2, 0.6, 6.2), C["stoneLt"])

    r, yy = 3.4, 2.4
    for _i in range(5):
        h = 2.7
        b_wall.add("cyl", parent @ M(0, yy + h / 2, 0, r, h, r),
                   _color.tint(C["wallWarm"], 0.02, rng))
        b_wood.add("cyl", parent @ M(0, yy + h * 0.55, 0, r * 1.25, 0.14, r * 1.25),
                   C["woodDk"])                                          # 平座
        for k in range(8):
            a = k / 8 * TAU + math.pi / 8
            box(b_wood, C["woodDk"], 0.22, h, 0.22,
                math.cos(a) * (r - 0.05), yy + h / 2, math.sin(a) * (r - 0.05),
                -a, 0, 0, parent)
        b_roof.add("cone", parent @ M(0, yy + h + 0.55, 0, r * 1.75, 1.3, r * 1.75),
                   _color.tint(C["slate"], 0.02, rng))
        b_roof.add("cyl", parent @ M(0, yy + h + 0.1, 0, r * 1.75, 0.25, r * 1.75),
                   C["slateDk"])
        for k in (1, 5):
            a = k / 8 * TAU
            p = parent.xform((math.cos(a) * (r * 1.55), yy + h - 0.1,
                              math.sin(a) * (r * 1.55)))
            reg.lantern_spots.append({"x": p[0], "y": p[1], "z": p[2],
                                      "water": 0, "light": False})
        yy += h + 1.0
        r *= 0.86

    b_wood.add("cyl", parent @ M(0, yy + 1.4, 0, 0.18, 3.2, 0.18), C["woodDk"])
    b_sign.add("sph", parent @ M(0, yy + 3.0, 0, 0.5, 0.5, 0.5), 0xE8C66A)
    reg.obstacles.append({"x0": x - 7, "x1": x + 7, "z0": z - 7, "z1": z + 7})


# ---------------------------------------------------------------- 牌坊
GATE_DRAWS = 0


def build_gate(batches, rng, reg, x, z):
    """watertown.js:387 —— 四柱三间的石牌坊，顶上三段小屋顶。"""
    parent = M(x, 0, z)
    b_stone, b_wood, b_roof, b_sign = (
        batches["stone"], batches["wood"], batches["roof"], batches["sign"])

    xs = [-5.2, -1.9, 1.9, 5.2]
    hs = [5.6, 7.4, 7.4, 5.6]
    for i, px in enumerate(xs):
        box(b_stone, C["stoneLt"], 0.62, hs[i], 0.62, px, hs[i] / 2, 0, 0, 0, 0, parent)
        box(b_stone, C["stoneDk"], 1.1, 0.5, 1.1, px, 0.25, 0, 0, 0, 0, parent)

    box(b_wood, C["woodDk"], 4.4, 0.55, 0.7, 0, 6.6, 0, 0, 0, 0, parent)
    box(b_wood, C["woodDk"], 4.4, 0.42, 0.7, 0, 5.2, 0, 0, 0, 0, parent)
    for s in (-1, 1):
        box(b_wood, C["woodDk"], 3.9, 0.45, 0.6, s * 3.55, 4.9, 0, 0, 0, 0, parent)
    box(b_sign, C["woodDk"], 3.3, 1.0, 0.18, 0, 5.9, 0.42, 0, 0, 0, parent,
        _atlas.uv_of("gate"))

    def mini(px, w, yb):
        poly = [[-1.3, yb], [1.3, yb], [1.3, yb + 0.3], [0, yb + 1.25], [-1.3, yb + 0.3]]
        b_roof.add(extrude_prim(poly, w),
                   parent @ M(px - w / 2, 0, 0, 1, 1, 1, 0, math.pi / 2, 0),
                   C["slate"])
        box(b_roof, C["slateDk"], w + 0.5, 0.3, 0.4, px, yb + 1.3, 0, 0, 0, 0, parent)

    mini(0, 4.6, 7.6)
    mini(-3.55, 4.0, 5.9)
    mini(3.55, 4.0, 5.9)

    for px in xs:
        reg.obstacles.append({"x0": x + px - 0.45, "x1": x + px + 0.45,
                              "z0": z - 0.45, "z1": z + 0.45})


# ---------------------------------------------------------------- 茶馆
TEAHOUSE_DRAWS = HOUSE_DRAWS + 5     # 房子 13 + 五只茶壶各 pick 一次

TEAHOUSE_INFO = {
    "box": {"x0": 14, "x1": 28, "z0": 12, "z1": 24},
    "door": {"x": 21, "z": 12},
}


def build_teahouse(batches, rng, reg, make_batch):
    """watertown.js:404 —— 同福茶楼。

    上半截走**自己的一套 batch**（TH.batches），因为原场景里人走进去时
    要把它单独变透明（watertown.js:717-719）。2A 不需要这个交互，但保留
    分组有用：可以单独隐藏上半截渲室内。室内陈设、匾额仍然走全局 batch，
    照原文。

    make_batch(name) 由调用方给，用来造 TH 的那套 batch（测试里会让它们
    共用同一份记账流水，才能和 JS 的调用顺序对上）。
    """
    th = {k: make_batch("TH_" + k) for k in _BATCH_KEYS}

    o = {"x": 21, "z": 18, "w": 14, "d": 12, "floors": 2, "facing": math.pi,
         "openGround": True, "batches": th, "noObstacle": True, "gable": True}
    build_house(batches, rng, reg, o)

    box(batches["sign"], C["woodDk"], 3.4, 0.9, 0.16, 21, 3.55, 11.6, 0, 0, 0,
        None, _atlas.uv_of("tea"))                                        # 匾额

    # 室内：方桌、条凳、柜台、茶壶
    b_wood, b_misc = batches["wood"], batches["misc"]
    for tx, tz in ((17.5, 15.5), (24.5, 15.5), (17.5, 20.5), (24.5, 20.5)):
        box(b_wood, C["wood"], 1.5, 0.08, 1.5, tx, 0.8, tz)
        box(b_wood, C["woodDk"], 0.14, 0.76, 0.14, tx, 0.4, tz)
        for dx, dz in ((0, 1.15), (0, -1.15), (1.15, 0), (-1.15, 0)):
            box(b_wood, C["woodLt"], 0.9, 0.06, 0.3, tx + dx, 0.48, tz + dz,
                math.pi / 2 if dz == 0 else 0)
        b_misc.add("sph", M(tx + 0.2, 0.98, tz - 0.1, 0.16, 0.14, 0.16), 0xC9C0AA)
        b_misc.add("cyl", M(tx - 0.3, 0.9, tz + 0.25, 0.09, 0.12, 0.09), 0xC9C0AA)
        reg.obstacles.append({"x0": tx - 0.9, "x1": tx + 0.9,
                              "z0": tz - 0.9, "z1": tz + 0.9, "h": 1.1})

    box(b_wood, C["woodDk"], 6, 1.0, 0.8, 21, 0.5, 23.2)
    box(b_wood, C["wood"], 6, 0.1, 0.9, 21, 1.02, 23.2)
    box(b_wood, C["woodDk"], 5, 2.4, 0.3, 21, 2.0, 23.8)
    for i in range(5):
        b_misc.add("cyl", M(18.9 + i * 1.05, 1.65, 23.65, 0.2, 0.28, 0.2),
                   rng.pick([0x7A5230, 0xB5AC93, 0x4F6B6B]))
    reg.obstacles.append({"x0": 17.8, "x1": 24.2, "z0": 22.6, "z1": 24.4, "h": 1.2})

    # 墙体碰撞（留门）
    reg.obstacles += [
        {"x0": 14, "x1": 28, "z0": 23.6, "z1": 24.4},
        {"x0": 14, "x1": 14.5, "z0": 12, "z1": 24},
        {"x0": 27.5, "x1": 28, "z0": 12, "z1": 24},
        {"x0": 14, "x1": 19.4, "z0": 12, "z1": 12.5},
        {"x0": 22.6, "x1": 28, "z0": 12, "z1": 12.5},
    ]
    reg.lantern_spots += [
        {"x": 18, "y": 2.7, "z": 18, "water": 0, "light": True},
        {"x": 24, "y": 2.7, "z": 18, "water": 0, "light": True},
    ]
    return th
