"""three.js r128 的颜色运算，逐函数复刻。

为什么不用 Python 的 colorsys：`tint()` 每次调用要**按固定顺序消耗 3 个随机数**
（h 偏移、s 偏移、l 偏移），而且 three.js 的 getHSL/setHSL 有自己的分支写法。
随机流一旦错位，整座镇子就变了，所以这里照抄 three.js 源码的算法。

色彩空间约定（重要）：
  watertown.js 的 renderer 没设 outputEncoding，r128 默认 LinearEncoding，
  即 MeshPhongMaterial 拿到的 hex 值原样送进帧缓冲。也就是说源码里的
  0xf1ece1 就是作者眼睛看到的那个颜色（sRGB 显示值）。
  Cycles 在线性空间算光照，所以顶点色要 sRGB -> Linear 解码后再喂给
  Principled BSDF，并把 view transform 设成 Standard，才能还原作者意图。
  见 lib/materials.py。
"""


def hex_to_rgb(hex_value):
    """three.js Color.setHex（r128，无色彩空间转换）"""
    if isinstance(hex_value, (tuple, list)):
        return tuple(hex_value[:3])
    return (
        ((hex_value >> 16) & 255) / 255.0,
        ((hex_value >> 8) & 255) / 255.0,
        (hex_value & 255) / 255.0,
    )


def get_hsl(rgb):
    """three.js Color.getHSL"""
    r, g, b = rgb
    mx = max(r, g, b)
    mn = min(r, g, b)
    lightness = (mn + mx) / 2.0
    if mn == mx:
        return 0.0, 0.0, lightness
    delta = mx - mn
    saturation = delta / (mx + mn) if lightness <= 0.5 else delta / (2 - mx - mn)
    if mx == r:
        hue = (g - b) / delta + (6 if g < b else 0)
    elif mx == g:
        hue = (b - r) / delta + 2
    else:
        hue = (r - g) / delta + 4
    return hue / 6.0, saturation, lightness


def _hue2rgb(p, q, t):
    """three.js 内部同名函数（注意调用处传的是 (q, p, t)）"""
    if t < 0:
        t += 1
    if t > 1:
        t -= 1
    if t < 1 / 6:
        return p + (q - p) * 6 * t
    if t < 1 / 2:
        return q
    if t < 2 / 3:
        return p + (q - p) * 6 * (2 / 3 - t)
    return p


def _euclidean_modulo(n, m):
    return ((n % m) + m) % m


def _clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def set_hsl(h, s, lightness):
    """three.js Color.setHSL"""
    h = _euclidean_modulo(h, 1)
    s = _clamp01(s)
    lightness = _clamp01(lightness)
    if s == 0:
        return (lightness, lightness, lightness)
    p = lightness * (1 + s) if lightness <= 0.5 else lightness + s - (lightness * s)
    q = 2 * lightness - p
    return (
        _hue2rgb(q, p, h + 1 / 3),
        _hue2rgb(q, p, h),
        _hue2rgb(q, p, h - 1 / 3),
    )


def tint(hex_value, amt, rng):
    """watertown.js:32-35 —— 轻微色偏。**消耗 3 个随机数，顺序 h/s/l 不能换。**

        const c=new T.Color(hex); const h={}; c.getHSL(h);
        return c.setHSL(h.h + rr(-0.008,0.008),
                        clamp(h.s + rr(-amt,amt),0,1),
                        clamp(h.l + rr(-amt,amt),0,1));

    JS 的实参从左到右求值，所以三次 rr 的顺序就是 h、s、l。
    """
    h, s, lightness = get_hsl(hex_to_rgb(hex_value))
    dh = rng.rr(-0.008, 0.008)
    ds = rng.rr(-amt, amt)
    dl = rng.rr(-amt, amt)
    return set_hsl(h + dh, _clamp01(s + ds), _clamp01(lightness + dl))


def srgb_to_linear(c):
    """把作者写的显示值解码成 Cycles 需要的线性值。"""
    r, g, b = c
    return tuple(
        (v / 12.92) if v <= 0.04045 else (((v + 0.055) / 1.055) ** 2.4)
        for v in (r, g, b)
    )


def lerp_color(a, b, t):
    """three.js Color.lerp"""
    a = hex_to_rgb(a) if isinstance(a, int) else a
    b = hex_to_rgb(b) if isinstance(b, int) else b
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
