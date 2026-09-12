"""雨与雾。

这一块**不是移植**，是按 2A 重做的：

- 原作的雨是 1000 条 LineSegments，每帧在 CPU 上挪位置（watertown.js:556-572）。
  Cycles 里线段没有厚度也接不上光，所以改成真几何：每滴一片细长的四边形，
  朝相机立起来，材质是半透明 + 一点自发光。灯笼的光会照在雨丝上 ——
  这正是「烟雨」两个字要的东西，实时那边做不到。
- 原作的雾是 `scene.fog`（线性距离雾，watertown.js:580/615），只染颜色，
  不参与光照。这里换成 Volume Scatter：雨雾里会自然出现灯笼的光锥、
  桥洞的透光、远处房子被压淡 —— 不用再手工加 mkGlow 那种 sprite。

雨滴的位置和下落速度直接用模块级算出来的那 1000 滴（lib/rng.module_level），
不是另起一套随机 —— 那本来就是原作的雨，白算了可惜。

原作的雾参数（updateEnv）：
    晴 near=40  far=320  色 0xc9d4d8
    雨 near=18  far=150  色向 0x8b949c 偏
Volume Scatter 的密度按 far 反推：光学厚度约 1 时看不见 far 处的东西，
所以 density ~ 1/far。
"""

import math

from ..lib.geo import M
from ..lib.mat4 import Mat4

# watertown.js:565-568 —— 每滴一条 0.7 米的线，x 偏 -0.08 是风
STREAK_LEN = 0.7
STREAK_TILT = -0.08
STREAK_WIDTH = 0.03      # 10 米开外约 3 像素宽；再细会被降噪抹掉

# watertown.js:615
FOG_FAR_CLEAR = 320.0
FOG_FAR_RAIN = 150.0
FOG_COLOR_CLEAR = (0.788, 0.831, 0.847)      # 0xc9d4d8
FOG_COLOR_RAIN = (0.545, 0.580, 0.612)       # 0x8b949c


def rain_streaks(drops, center, count=None, face=None,
                 spread=22.0, y_lo=-1.0, y_hi=26.0):
    """把雨滴摊成一组细长四边形的变换矩阵。

    drops   lib/rng.module_level(rng)["rain"]
    center  (x, z)，雨只在相机周围下（原作也是这样，±22 米一个笼子）
    face    相机位置（three 空间）。每条雨丝绕 Y 轴转到正对相机 ——
            plane 原语的法线是 +Z，不转的话侧看就是一条线的边，等于没有。

    返回矩阵列表，交给 Batch 用 plane 原语去摆。
    """
    cx, cz = center
    out = []
    tilt = math.atan2(-STREAK_TILT, STREAK_LEN)
    for d in (drops if count is None else drops[:count]):
        x = cx + d["x"]
        z = cz + d["z"]
        y = y_lo + (d["y"] / 24.0) * (y_hi - y_lo)
        yaw = 0.0 if face is None else math.atan2(face[0] - x, face[2] - z)
        # 线段从 (x,y,z) 到 (x-0.08, y+0.7, z)：往 -x 方向斜一点，那是风
        out.append(M(x, y + STREAK_LEN / 2, z,
                     STREAK_WIDTH, STREAK_LEN, 1.0,
                     0, yaw, tilt))
    return out


def build_rain(batch, drops, center, count=None, face=None):
    """把雨丝加进一个 Batch。"""
    n = 0
    for m in rain_streaks(drops, center, count, face):
        batch.add("plane", m, (0.82, 0.87, 0.92))
        n += 1
    return n


def mist_bounds(center, radius=340.0, y_lo=-6.0, y_hi=120.0):
    """雨雾体的包围盒（three 空间）。要罩住镇子和远山。"""
    cx, cz = center
    return {"x0": cx - radius, "x1": cx + radius,
            "y0": y_lo, "y1": y_hi,
            "z0": cz - radius, "z1": cz + radius}


def mist_density(raining):
    """按原作的 fog.far 反推散射密度：光学厚度 ~1 处就看不清了。"""
    far = FOG_FAR_RAIN if raining else FOG_FAR_CLEAR
    return 1.0 / far
