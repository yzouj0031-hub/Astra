"""用 PIL 画招牌字图集，对应 watertown.js:97-128 的 buildAtlas()。

    python blender\\tools\\make_atlas.py

**要用系统 Python 跑，不是 Blender 的**：Blender 5.2 自带的 Python 没有 PIL。
产物是 blender/assets/atlas_signs.png，Blender 侧只负责加载。

字体显式用 C:\\Windows\\Fonts\\simsun.ttc（宋体）。不要退回 PIL 的默认位图字体 ——
它没有中文字形，招牌会整片变成方块。字体缺失时这个脚本直接报错退出，
不静默降级，免得渲了半天才发现招牌是空的。

和 canvas 的差异（都记在这里，免得以后怀疑是 bug）：
- JS 那边写的是 `600 44px` / `700 92px`，即半粗/粗体。宋体没有粗体字面，
  浏览器会合成加粗；PIL 不会。这里用 stroke_width 描边模拟，视觉接近。
- canvas 的 textBaseline='middle' 与 PIL 的 anchor='mm' 都是「按字面中线居中」，
  两者对同一字号的落点会差一两个像素，不影响格子边界。
- 格子的位置完全由 lib/atlas.py 提供，与 JS 的 cell() 是同一套算术，
  所以 uvBox 是精确对齐的 —— 会不一样的只有格子内部的字形。
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)

from blender.lib import atlas  # noqa: E402

# 放大倍率：cell() 是按 W/H 取比例算 uvBox 的，整张图等比放大不改变任何 UV，
# 所以想要 2A 的清晰度直接调这个就行，几何侧一个字都不用动。
# 用法：python blender/tools/make_atlas.py 4
SCALE = int(sys.argv[1]) if len(sys.argv) > 1 else 4

FONT_PATH = r"C:\Windows\Fonts\simsun.ttc"
FONT_INDEX = 0                      # ttc 里 0 是 SimSun，1 是 NSimSun
OUT_DIR = os.path.join(ROOT, "blender", "assets")
OUT_PNG = os.path.join(OUT_DIR, atlas.IMAGE_NAME)
OUT_JSON = os.path.join(OUT_DIR, "atlas_cells.json")


def font(size):
    if not os.path.exists(FONT_PATH):
        raise SystemExit(f"找不到字体 {FONT_PATH} —— 中文会变方块，不做降级，停在这里")
    return ImageFont.truetype(FONT_PATH, int(round(size * SCALE)), index=FONT_INDEX)


def S(v):
    """逻辑坐标（1024 那套）-> 实际像素"""
    return v * SCALE


def draw_text(d, xy, text, fill, size, bold=True):
    """canvas 的 fillText + textAlign=center + textBaseline=middle"""
    d.text((S(xy[0]), S(xy[1])), text, font=font(size), fill=fill, anchor="mm",
           stroke_width=SCALE if bold else 0, stroke_fill=fill)


def main():
    img = Image.new("RGB", (S(atlas.W), S(atlas.H)), atlas.BACKDROP)
    d = ImageDraw.Draw(img, "RGBA")

    # 竖排招牌（watertown.js:104-112）
    for i, s in enumerate(atlas.SIGNS):
        x, y, w, h = atlas.sign_rect(i)
        d.rectangle([S(x), S(y), S(x + w) - 1, S(y + h) - 1], fill=atlas.SIGN_BG[i % 3])
        # strokeRect(x+5,y+5,54,246)，线宽 2
        d.rectangle([S(x + 5), S(y + 5), S(x + 5 + 54), S(y + 5 + 246)],
                    outline=atlas.SIGN_STROKE, width=2 * SCALE)
        size, step, y0 = atlas.sign_layout(s)
        for k, ch in enumerate(s):
            draw_text(d, (x + 32, y + y0 + k * step), ch, atlas.SIGN_FG, size)

    # 酒旗（watertown.js:114-119）
    for i, s in enumerate(atlas.FLAGS):
        x, y, w, h = atlas.flag_rect(i)
        d.rectangle([S(x), S(y), S(x + w) - 1, S(y + h) - 1], fill=atlas.FLAG_BG[i])
        draw_text(d, (x + 64, y + 68), s, atlas.FLAG_FG[i], 92)

    # 横匾（watertown.js:121-126）
    for _key, text, x, y, w, h, bg, fg, size in atlas.PLAQUES:
        d.rectangle([S(x), S(y), S(x + w) - 1, S(y + h) - 1], fill=bg)
        draw_text(d, (x + w / 2, y + h / 2 + 4), text, fg, size)

    os.makedirs(OUT_DIR, exist_ok=True)
    img.save(OUT_PNG)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(atlas.cells(), f, ensure_ascii=False, indent=1)

    print(f"图集 -> {OUT_PNG}  ({img.width}x{img.height}, 倍率 x{SCALE})")
    print(f"格子 -> {OUT_JSON}  {len(atlas.cells())} 格")
    print(f"字体   {FONT_PATH} index={FONT_INDEX}")


if __name__ == "__main__":
    main()
