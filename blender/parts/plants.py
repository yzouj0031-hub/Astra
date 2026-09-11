"""树木：柳树、樟树。移植自 watertown.js:344-362。

**取数顺序即造型**：这两个函数把全局随机流按固定顺序消费掉，
下面每一行的 rr/pick/tint 位置都与 JS 原文一一对应，不要为了「好看」
调整顺序或合并表达式。每棵树消耗的随机数个数是固定的，
milestones 里有断言在守这条不变量。
"""

import math

from ..lib import color as _color
from ..lib.geo import M, TAU, box
from .site import hill_y

# 每棵树消耗的随机数个数（用来发现取数顺序被改坏）
WILLOW_DRAWS_FREE = 372   # 1(朝向) + 1(lean) + 4*10(树冠) + 30*11(垂条)
WILLOW_DRAWS_BANK = 371   # bank=true 时 lean 是常数，不取随机
CAMPHOR_DRAWS = 7 * 7     # 7 团树冠，每团 3(缩放) + 1(pick) + 3(tint)；位置是常数


def build_willow(batch, rng, x, z, scale=1.0, bank=False):
    """watertown.js:344"""
    y = hill_y(x, z)
    parent = M(x, y, z, scale, scale, scale, 0, rng.rr(0, TAU), 0)
    lean = (0.16 if z > 0 else -0.16) if bank else rng.rr(-0.08, 0.08)
    top = 6.6 if bank else 5.4

    trunk = 0x5A4634                                             # C.trunk
    box(batch, trunk, 0.55, top - 0.6, 0.55, 0, (top - 0.6) / 2, 0, 0, lean, 0, parent)
    box(batch, trunk, 0.32, 2.4, 0.32, 0.7, top - 1.0, 0.2, 0, 0.35, -0.6, parent)
    box(batch, trunk, 0.28, 2.2, 0.28, -0.6, top - 1.1, -0.3, 0, -0.3, 0.6, parent)

    greens = [0x8FAA6A, 0x7D9C5C, 0x6F8F52]
    for _ in range(4):
        batch.add(
            "sph",
            parent @ M(rng.rr(-1.4, 1.4), top + 0.4 + rng.rr(-0.3, 0.7), rng.rr(-1.4, 1.4),
                       rng.rr(2.0, 2.9), rng.rr(1.3, 1.7), rng.rr(2.0, 2.9)),
            _color.tint(rng.pick(greens), 0.03, rng),
        )

    for _ in range(30):
        a = rng.rr(0, TAU)
        rad = rng.rr(1.8, 3.1)
        length = rng.rr(0.9, 2.0)
        t0 = top + rng.rr(-0.4, 0.3)
        box(batch,
            _color.tint(rng.pick([0x6F8F52, 0x7D9C5C, 0x5F8A4C]), 0.04, rng),
            0.24, length, 0.05,
            math.cos(a) * rad, t0 - length / 2, math.sin(a) * rad,
            rng.rr(0, TAU), rng.rr(-0.08, 0.08), rng.rr(-0.08, 0.08),
            parent)

    return {"x0": x - 0.5, "x1": x + 0.5, "z0": z - 0.5, "z1": z + 0.5}


def build_camphor(batch, rng, x, z, scale=1.0):
    """watertown.js:356 —— 广场上的老樟树"""
    parent = M(x, 0, z, scale, scale, scale)
    trunk = 0x5A4634
    box(batch, trunk, 1.3, 4.5, 1.3, 0, 2.2, 0, 0, 0, 0, parent)
    for i in range(5):
        a = i / 5 * TAU
        box(batch, trunk, 0.5, 3.4, 0.5,
            math.cos(a) * 1.2, 5.2, math.sin(a) * 1.2,
            0, math.cos(a) * 0.55, -math.sin(a) * 0.55, parent)
    for i in range(7):
        a = i / 7 * TAU
        rad = 2.4 if i else 0
        batch.add(
            "sph",
            parent @ M(math.cos(a) * rad, 7.2 + (0 if i else 0.9), math.sin(a) * rad,
                       rng.rr(2.4, 3.2), rng.rr(1.8, 2.4), rng.rr(2.4, 3.2)),
            _color.tint(rng.pick([0x4F7A3E, 0x5E8A48, 0x476E38]), 0.04, rng),
        )
    return {"x0": x - 0.9, "x1": x + 0.9, "z0": z - 0.9, "z1": z + 0.9}
