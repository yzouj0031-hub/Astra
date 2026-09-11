"""招牌字图集的布局（纯数据，不画图）。

对应 watertown.js:93-129 的 SIGNS/FLAGS/Atlas/buildAtlas/uvOf。
一张 1024x1024 上放着 24 块竖排招牌、4 面酒旗、4 块横匾，
房子和牌坊靠 uvBox 从里面取一格。

这里只放**格子的位置**（纯算术，Blender 里就能算），画图交给
tools/make_atlas.py 用 PIL 离线做 —— Blender 自带的 Python 没有 PIL。
两边共用这个模块的坐标，不会各写一份对不上。

坐标系：canvas 是 y 向下，cell() 里的 `1 - y/H` 负责翻成 UV 的 v 向上。
Blender 的图片 UV 原点在左下、PNG 第一行显示在 v=1，和 three.js
CanvasTexture 默认 flipY=true 的效果一致，所以 PNG 按 canvas 的画法
原样存就行，不用上下翻。
"""

W = 1024
H = 1024

# watertown.js:93-94
SIGNS = ['同福茶楼', '老酒坊', '米行', '绸缎庄', '书肆', '药铺', '悦来客栈',
         '张记豆腐', '糕团', '伞铺', '笔墨', '布庄', '醋坊', '船票', '面馆',
         '香烛', '铁铺', '酱园', '当铺', '裁缝', '馄饨', '茶叶', '渔具', '灯笼']
FLAGS = ['酒', '茶', '面', '客']

# 底色（watertown.js:100）
BACKDROP = "#5a3a22"

# 竖排招牌：每格 64x256，一行 16 个
SIGN_BG = ['#3a2716', '#5a3a22', '#6f4a2c']
SIGN_FG = '#f2e6c8'
SIGN_STROKE = (242, 230, 200, 102)      # rgba(242,230,200,.4)

# 酒旗：每格 128x128，第 512 行
FLAG_BG = ['#2f3a5c', '#f0e6d0', '#8c2f2f', '#3f5a6e']
FLAG_FG = ['#f0e6d0', '#2f3a5c', '#f0e6d0', '#f0e6d0']

# 横匾：key, 文字, x, y, w, h, 底色, 字色, 字号（watertown.js:123-126）
PLAQUES = [
    ('gate',   '烟雨渡',  0, 660, 320, 100, '#1f2327', '#e8c66a', 72),
    ('tea',    '同福茶楼', 340, 660, 320, 100, '#3a2716', '#f2e6c8', 66),
    ('dock',   '渡口',   680, 660, 160, 100, '#7e7c72', '#1f2327', 60),
    ('pagoda', '望江塔',  0, 780, 320, 100, '#8c2f2f', '#f2e6c8', 66),
]


def cell(x, y, w, h):
    """watertown.js:102 —— 画布矩形转 uvBox [u0, v0, u1, v1]。"""
    return [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]


def sign_rect(i):
    """第 i 块竖排招牌在画布上的位置。"""
    return ((i % 16) * 64, (i // 16) * 256, 64, 256)


def flag_rect(i):
    return (i * 128, 512, 128, 128)


def sign_layout(text):
    """竖排文字的字号、行距、首字中心 y 偏移（watertown.js:108）。"""
    n = len(text)
    size = 44 if n <= 2 else (40 if n == 3 else 36)
    step = 70 if n <= 2 else (60 if n == 3 else 54)
    y0 = 128 - (n - 1) * step / 2          # 相对格子顶边
    return size, step, y0


def cells():
    """全部格子：key -> uvBox。与 JS 的 Atlas.cells 一一对应。"""
    out = {}
    for i, s in enumerate(SIGNS):
        out['sign' + str(i)] = cell(*sign_rect(i))
    for i in range(len(FLAGS)):
        out['flag' + str(i)] = cell(*flag_rect(i))
    for key, _text, x, y, w, h, _bg, _fg, _size in PLAQUES:
        out[key] = cell(x, y, w, h)
    return out


_CELLS = None


def uv_of(key):
    """watertown.js:129 —— 取不到就返回 None（JS 那边是 null）。"""
    global _CELLS
    if _CELLS is None:
        _CELLS = cells()
    return _CELLS.get(key)


# 生成出来的图放这儿（tools/make_atlas.py 写，lib/materials.py 读）
IMAGE_NAME = "atlas_signs.png"
