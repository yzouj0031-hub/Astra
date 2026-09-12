"""把 renders/sheet 里的 15 张拼成一张联系表，方便一眼比完。

    python blender\\tools\\contact_sheet.py

用系统 Python 跑（要 PIL，Blender 自带的 Python 没有）。
横轴是机位、纵轴是时段，每格左上角标机位_时段。缺图的格子留空并标出来 ——
别让人以为那个机位渲过了。
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHEET = os.path.join(ROOT, "renders", "sheet")
OUT = os.path.join(ROOT, "renders", "sheet_contact.png")

CAMS = ["canal", "bridge", "teahouse", "pagoda", "overview"]
TIMES = ["day", "dusk", "night"]

CELL_W = 640
PAD = 8
LABEL_H = 22
BG = (24, 24, 26)
FG = (235, 235, 230)
MISSING = (54, 40, 40)

FONT_PATH = r"C:\Windows\Fonts\consola.ttf"


def font(size=15):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def main():
    # 用第一张已存在的图定长宽比
    ratio = 9 / 16
    for c in CAMS:
        for t in TIMES:
            p = os.path.join(SHEET, f"{c}_{t}.png")
            if os.path.exists(p):
                with Image.open(p) as im:
                    ratio = im.height / im.width
                break
    cell_h = int(CELL_W * ratio)

    cols, rows = len(CAMS), len(TIMES)
    W = cols * CELL_W + (cols + 1) * PAD
    H = rows * (cell_h + LABEL_H) + (rows + 1) * PAD

    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font()

    found = 0
    for r, t in enumerate(TIMES):
        for c, cam in enumerate(CAMS):
            x = PAD + c * (CELL_W + PAD)
            y = PAD + r * (cell_h + LABEL_H + PAD)
            path = os.path.join(SHEET, f"{cam}_{t}.png")
            if os.path.exists(path):
                with Image.open(path) as im:
                    sheet.paste(im.convert("RGB").resize((CELL_W, cell_h),
                                                         Image.LANCZOS),
                                (x, y + LABEL_H))
                found += 1
                label, color = f"{cam}_{t}", FG
            else:
                d.rectangle([x, y + LABEL_H, x + CELL_W, y + LABEL_H + cell_h],
                            fill=MISSING)
                label, color = f"{cam}_{t}  (缺)", (240, 160, 160)
            d.text((x + 2, y + 3), label, fill=color, font=f)

    sheet.save(OUT)
    print(f"联系表 -> {OUT}  ({sheet.width}x{sheet.height})，{found}/{cols * rows} 张")
    if found < cols * rows:
        print("有缺图，重跑 render_sheet.py 会自动补上（已存在的会跳过）")
    return 0 if found else 1


if __name__ == "__main__":
    sys.exit(main())
