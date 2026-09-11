"""场地：镇子的布局常量与地形高度。

对应 watertown.js:131-158。目前只移植了柳树/宝塔需要的那部分（L 与 hillY），
河道、桥、驳岸随后补。
"""

import math

# watertown.js:132-137
L = {
    "canal": 6,                                  # 主河道半宽
    "laneIn": 6,
    "laneOut": 12,
    "hill": {"x": -112, "z": 84, "r": 60, "h": 20},
    "branch": {"x0": 60, "x1": 68, "z0": 6, "z1": 92},
}


def hill_y(x, z):
    """watertown.js:151 —— 山是个四次方凸包，不是噪声。"""
    h = L["hill"]
    d = math.hypot(x - h["x"], z - h["z"]) / h["r"]
    if d >= 1:
        return 0.0
    t = 1 - d * d
    return h["h"] * t * t
