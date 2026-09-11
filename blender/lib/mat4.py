"""双精度 4x4 矩阵。

为什么不用 mathutils.Matrix：Blender 的 mathutils 内部是**单精度**，
而 three.js 的 Matrix4.elements 是普通 JS 数组（双精度）。用 mathutils 的话
每个坐标会在小数点后第七位就和 JS 分家，跟原场景做数值比对时全线报错。
几何上那点误差看不出来，但没必要丢 —— 4x4 的乘法自己写十几行就够。

副作用是好的：这个模块不依赖 bpy，纯 Python 就能跑，所以矩阵相关的比对
测试不必非得在 Blender 里执行。

行列约定与 three.js 一致：数学上的 M[row][col]，导出 elements() 时按
three.js Matrix4.elements 的列主序排。
"""

import math


class Mat4:
    __slots__ = ("m",)

    def __init__(self, rows=None):
        self.m = [list(r) for r in rows] if rows else [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]

    def __getitem__(self, r):
        return self.m[r]

    def __matmul__(self, o):
        a, b = self.m, o.m
        return Mat4([[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)]
                     for r in range(4)])

    def xform(self, v):
        """变换一个点（w=1）。"""
        a = self.m
        x, y, z = v
        return (a[0][0] * x + a[0][1] * y + a[0][2] * z + a[0][3],
                a[1][0] * x + a[1][1] * y + a[1][2] * z + a[1][3],
                a[2][0] * x + a[2][1] * y + a[2][2] * z + a[2][3])

    def det3(self):
        """左上 3x3 的行列式，负值说明这个变换带镜像，面的绕序要翻。"""
        a = self.m
        return (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
                - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
                + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))

    def elements(self):
        """列主序 16 个数，与 three.js Matrix4.elements 排布相同。"""
        a = self.m
        return [a[r][c] for c in range(4) for r in range(4)]


IDENTITY = Mat4()


def translation(x, y, z):
    return Mat4([[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]])


def scale(x, y, z):
    return Mat4([[x, 0, 0, 0], [0, y, 0, 0], [0, 0, z, 0], [0, 0, 0, 1]])


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return Mat4([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return Mat4([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return Mat4([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
