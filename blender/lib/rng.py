"""watertown.js 的随机源，逐位复刻。

JS 侧（journeys/watertown.js:13-21）:

    let _seed = 20260906;
    function rnd(){ _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }

这是一条 32 位 LCG（Numerical Recipes 常数）。JS 用 float64 做乘法后再 `>>>0`，
中间值 max ≈ 4294967295*1664525 ≈ 7.15e12 < 2^53，所以没有精度损失，
Python 的任意精度整数 + `& 0xFFFFFFFF` 与之逐位一致。

**重要**：镇子是一条全局流按调用顺序消费出来的，不是每个物件各自带种子。
Blender 端要复现同一座镇子，rnd() 的调用次数和顺序必须与 JS 完全一致；
少调一次，后面所有物件的位置、色偏、高度全部错位。
移植每个 build* 函数时都要照着原文的取数顺序写，不要图省事改写。
"""

import math

JS_SEED = 20260906
_MASK = 0xFFFFFFFF
_MUL = 1664525
_INC = 1013904223
_DIV = 4294967296.0


class Rng:
    """与 JS 全局流等价的可实例化 LCG。"""

    __slots__ = ("_seed", "calls")

    def __init__(self, seed=JS_SEED):
        self._seed = seed & _MASK
        self.calls = 0        # 取数计数，用来核对移植的取数顺序

    @property
    def seed(self):
        return self._seed

    def rnd(self):
        """JS: rnd() -> [0,1)"""
        self._seed = (self._seed * _MUL + _INC) & _MASK
        self.calls += 1
        return self._seed / _DIV

    def rr(self, a, b):
        """JS: rr(a,b) — 消耗一个数"""
        return a + (b - a) * self.rnd()

    def ri(self, a, b):
        """JS: ri(a,b) = Math.floor(rr(a,b+1)) — 闭区间整数"""
        return math.floor(self.rr(a, b + 1))

    def pick(self, arr):
        """JS: pick(arr) = arr[Math.floor(rnd()*arr.length)]"""
        return arr[math.floor(self.rnd() * len(arr))]


# 模块级默认流，对应 JS 里的那一条全局流
_default = Rng()

rnd = _default.rnd
rr = _default.rr
ri = _default.ri
pick = _default.pick


def reset(seed=JS_SEED):
    """把默认流重置回起点。整场生成开始前调一次。"""
    global _default, rnd, rr, ri, pick
    _default = Rng(seed)
    rnd, rr, ri, pick = _default.rnd, _default.rr, _default.ri, _default.pick
    return _default


# ---- JS 里与随机同段定义的纯函数工具（watertown.js:18-21）----

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(a, b, x):
    """JS: smoothstep, 注意入参顺序是 (edge0, edge1, x)"""
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


TAU = math.pi * 2
