"""整镇总装：layoutTown。移植自 watertown.js:644-690。

这个函数本身几乎全是随机流的消费者 —— 房子摆在哪、多宽多深、几层、
挂招牌还是挂酒旗，全是按顺序取出来的。所以这里的每一行都必须与原文
一一对应，连**短路求值**和**对象字面量的属性求值顺序**都不能动：

- `const shop = row===0 && rnd()<0.5`
  row 不为 0 时 rnd **不会被调用**。写成 `rnd()<0.5 and row==0` 就错位了。
- `{..., gable:rnd()<0.5, balcony:rnd()<0.5, signKind:rnd()<0.7?...}`
  JS 的对象字面量按书写顺序求值，所以是 gable、balcony、signKind 三个数，
  而且它们在 buildHouse 那 13 个数**之前**。
- `for(let x=-122;x<=122;x+=rr(24,40))`
  增量在每轮**结束时**求值，所以写成 while + 末尾自增。
- `if(rnd()<0.8 && !(...))` 里的 rnd 每轮都消耗，跳过与否不影响取数。

调用它之前必须先 rng.module_preroll()：模块级的星空和雨滴先吃掉 6200 个数。
"""

import math

from ..lib import color as _color
from ..lib.geo import M, TAU, box
from . import hall, plants, site

C = hall.C

BRIDGES = [
    {"x": -72, "z": 0, "axis": "z", "len": 11, "halfW": 2.1, "h": 3.6},
    {"x": -4, "z": 0, "axis": "z", "len": 12, "halfW": 2.5, "h": 4.8, "big": True},
    {"x": 88, "z": 0, "axis": "z", "len": 11, "halfW": 2.1, "h": 3.6},
    {"x": 64, "z": 9, "axis": "x", "len": 10, "halfW": 2.0, "h": 3.0},
]

ALLEYS = {1: [-92, -46, 100], -1: [-92, -46, 46, 100]}

# 广场、牌坊、渡口的立灯（watertown.js:689）
STREET_LAMPS = [(-42, 7.3, True), (-10, 13, True), (12, 13, True),
                (-2, 28, False), (8, 28, False)]


def layout_town(batches, rng, reg, make_batch):
    """按 watertown.js 的顺序把整座镇子摆出来。返回茶馆那套 batch。"""
    L = site.L
    sign_counter = 0

    for b in BRIDGES:
        hall.build_bridge(batches, rng, reg, b)
    site.build_banks(batches, rng, reg)

    # 沿河两排房子
    for side in (1, -1):
        for row in (0, 1):
            x = -134 + rng.rr(0, 3)
            while x < 134:
                w = rng.rr(7, 13)
                if side == 1 and row == 0 and x + w > -13 and x < 30:
                    x = 30
                    continue
                if side == 1 and x + w > 44 and x < 84:
                    x = 84
                    continue
                if side == 1 and row == 1 and x + w > -14 and x < 30:
                    x = 30
                    continue
                if row == 1 and side == 1 and x < -85:
                    x = -85
                    continue

                skip = False
                for a in ALLEYS[side]:
                    if x < a + 3.6 and x + w > a - 0.2:
                        x = a + 3.6
                        skip = True
                        break
                if skip:
                    continue

                if row == 1 and rng.rnd() < 0.35:
                    x += w + rng.rr(2, 6)
                    continue

                d = rng.rr(8.5, 12)
                floors = 2 if rng.rnd() < (0.4 if row else 0.6) else 1
                zc = (side * (L["laneOut"] + d / 2 + rng.rr(0, 1.0)) if row == 0
                      else side * (28 + d / 2 + rng.rr(0, 3)))
                shop = row == 0 and rng.rnd() < 0.5      # 短路：row!=0 时不取数

                hall.build_house(batches, rng, reg, {
                    "x": x + w / 2, "z": zc, "w": w, "d": d, "floors": floors,
                    "facing": math.pi if side == 1 else 0,
                    "shop": shop,
                    "gable": rng.rnd() < 0.5,
                    "balcony": rng.rnd() < 0.5,
                    "signKind": "board" if rng.rnd() < 0.7 else "flag",
                    "signIdx": sign_counter,
                })
                sign_counter += 1
                x += w + rng.rr(0.5, 2.2)

    # 支流两岸：房子直接临水
    for xw, facing in ((L["branch"]["x0"], math.pi / 2),
                       (L["branch"]["x1"], -math.pi / 2)):
        z = 15
        while z < 88:
            w = rng.rr(7, 11)
            d = rng.rr(8, 11)
            xc = xw - d / 2 - 0.4 if facing > 0 else xw + d / 2 + 0.4
            hall.build_house(batches, rng, reg, {
                "x": xc, "z": z + w / 2, "w": w, "d": d,
                "floors": 2 if rng.rnd() < 0.6 else 1,
                "facing": facing, "shop": False,
                "gable": rng.rnd() < 0.6,
                "balcony": rng.rnd() < 0.6,
                "signIdx": sign_counter,
            })
            sign_counter += 1
            z += w + rng.rr(0.6, 2)

    # 广场、牌坊、茶馆、老樟树
    site.build_plaza(batches, rng, reg, _atlas_uv)
    hall.build_gate(batches, rng, reg, 1, 23)
    th = hall.build_teahouse(batches, rng, reg, make_batch)
    plants.build_camphor(batches["foliage"], rng, -7, 19, 1.1)

    # 柳树三批：沿河、山脚、野外
    x = -122
    while x <= 122:
        for s in (1, -1):
            if (rng.rnd() < 0.8
                    and not (s == 1 and 40 < x < 86)
                    and not (s == 1 and -14 < x < 30)
                    and not (s == 1 and abs(x + 34) < 14)):
                plants.build_willow(batches["foliage"], rng,
                                    x + rng.rr(-3, 3), s * rng.rr(6.9, 7.4),
                                    rng.rr(0.9, 1.1), True)
        x += rng.rr(24, 40)

    for _i in range(40):
        a = rng.rr(0, TAU)
        r = rng.rr(30, 58)
        wx = L["hill"]["x"] + math.cos(a) * r
        wz = L["hill"]["z"] + math.sin(a) * r
        if wz > 26:
            plants.build_willow(batches["foliage"], rng, wx, wz, rng.rr(0.8, 1.3))

    for _i in range(30):
        wx = rng.rr(-160, 180)
        wz = rng.pick([1, -1]) * rng.rr(44, 140)
        if not (100 < wx < 175 and 30 < wz < 62):
            plants.build_willow(batches["foliage"], rng, wx, wz, rng.rr(0.9, 1.4))

    hall.build_pagoda(batches, rng, reg, L["hill"]["x"], L["hill"]["z"], site.hill_y)
    site.build_mountains(batches["foliage"], rng)
    site.build_fields(batches["foliage"], rng)

    # 广场、牌坊、渡口的立灯
    for lx, lz, lit in STREET_LAMPS:
        box(batches["wood"], C["woodDk"], 0.16, 3.2, 0.16, lx, 1.6, lz)
        box(batches["wood"], C["woodDk"], 0.7, 0.1, 0.1, lx, 3.15, lz)
        box(batches["wood"], C["woodDk"], 0.16, 0.4, 0.16, lx + 0.28, 2.95, lz)
        reg.lantern_spots.append({"x": lx + 0.28, "y": 2.55, "z": lz,
                                  "water": 0, "light": lit})
    return th


def _atlas_uv(key):
    from ..lib import atlas
    return atlas.uv_of(key)


def build_streaks(batch, rng, reg):
    """watertown.js:549 —— 夜里灯笼在水面拉出的倒影片。

    2A 用不上这些片（水面是真折射，倒影自己就有），但它们**每片消耗一个
    随机数**，而且发生在 buildWater 之后、buildGround 之前 —— 不走这一段，
    地面的逐顶点草色全部错位。所以几何照出，放进单独的 batch，
    总装时默认不挂进场景。

    颜色的红通道存的是相位（原作的着色器拿它做闪烁），Blender 这边没有意义。
    """
    n = 0
    for s in reg.lantern_spots:
        if not s.get("water"):
            continue
        zc = s["water"] * 3.0
        batch.add("plane",
                  M(s["x"], -0.62, zc, 0.9, 5.5, 1,
                    -math.pi / 2, 0, 0 if s["water"] > 0 else math.pi),
                  (rng.rnd(), 0, 0))
        n += 1
    return n
