# assets/ 的来源与许可

## trees/ · 烟雨渡的树

几何和贴图来自 **Quaternius · Ultimate Stylized Nature Pack**，**CC0 1.0**
（公共领域，商用和修改都不需要署名；这里记录出处是为了留下可追溯的链子）。

- 作者主页：<https://quaternius.com/>
- 资源包：<https://quaternius.com/packs/ultimatestylizednature.html>
- 本项目实际取用的分发页（Poly Pizza）：
  | 文件 | 用途 | 来源 |
  | --- | --- | --- |
  | `trees.glb`（NormalTree_1..5） | 杂树 | <https://poly.pizza/m/etFGNvsiFv> |
  | `maple.glb`（MapleTree_1..5） | 红枫 | <https://poly.pizza/m/iGFtQd0PJO> |
  | `birch.glb`（BirchTree_1..2） | 杂树 | <https://poly.pizza/m/R7qMWzb7nk> |
  | `deadtrees.glb`（DeadTree_1..3） | 垂柳与层叠松的枝干骨架 | <https://poly.pizza/m/26H2UlEtWA> |
  | `bushes.glb`（Bush） | 细叶灌木 | <https://poly.pizza/m/J2h3HrO356> |
  | `bamboo.glb`（Bamboo） | 竹竿（无叶） | <https://poly.pizza/m/xBPj13w3JQ> |
  | `bamboo_mid.glb`（Bamboo_Mid） | 矮竹竿（无叶） | <https://poly.pizza/m/z0d6CbNtrz> |

### 改动说明

`assets/trees/` 里的不是原件。原件直接用是 8.9MB，其中 6.6MB 是贴图。加工过程见
`scripts/fetch-tree-sources.mjs`（下载）和 `scripts/prepare-tree-assets.mjs`（打包）：

- 贴图从 GLB 里摘出来放到 `trees/tex/`，按内容去重（`trees.glb` 和 `deadtrees.glb`
  共用同一张树皮，原来各存一份）
- 贴图由 1024² 降到 512²；树皮转 JPEG（q88），叶片保持 PNG（镂空要 alpha）
- 每个包只留用得上的变体，删掉多余的第二层 UV
- 结果：2.5MB

CC0 允许这些修改，也允许不署名。

### cards/ · 自制的 alpha 镂空卡片

`cards/` 里的三张**是本项目自己生成的**，不是第三方资源，见 `scripts/make-plant-cards.mjs`：

| 文件 | 用在哪 | 为什么要自己画 |
| --- | --- | --- |
| `willow_frond.png` | 垂柳的柳条 | CC0 里没有能用的柳树 |
| `bamboo_leaf.png` | 竹叶簇 | CC0 的竹只有光竿，没有叶子 |
| `pine_pad.png` | 层叠松的针盘 | CC0 里没有迎客松那种分层的松 |

柳树的情况：Quaternius 的 `Willow` 是无贴图的纯色低多边形；Google Poly 那两棵
垂柳/蟠柳是 CC-BY 而非 CC0，且同样没有叶片贴图；Poly Haven 有带 alpha 叶片的 CC0 树，
但没有柳树，而且单棵的几何就有 59MB。

这三样都走同一条路子：**枝干用真模型，叶子用卡片按规则挂上去**。
柳树和层叠松借 `DeadTree` 的枝干，竹借 `bamboo.glb` 的竿子。

注意 `cards/` 和 `tex/` 是分开的：`tex/` 是 `scripts/prepare-tree-assets.mjs` 的输出目录，
那个脚本每次会把自己的输出目录整个清掉，手画的卡片混进去会被一并删掉。

## player/ · 玩家角色

模型、服装、发型和动画都来自 **Quaternius**，**CC0 1.0**（三个包里各自的 `License_Standard.txt` /
`License.txt` 原文都写着 "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication"）。
用的是 itch.io 上的免费 Standard 版：

| 包 | 用了什么 | 来源 |
| --- | --- | --- |
| Universal Base Characters | `Superhero_Male_FullBody` 的头、眼睛、眉毛；`Hair_SimpleParted` | <https://quaternius.itch.io/universal-base-characters> |
| Modular Character Outfits – Fantasy | `Male_Peasant`（农夫装：衣、裤、鞋、手臂） | <https://quaternius.itch.io/modular-character-outfits-fantasy> |
| Universal Animation Library | 12 条动画（清单见 `scripts/prepare-player-assets.mjs` 的 `CLIPS`） | <https://quaternius.itch.io/universal-animation-library> |

### 改动说明

`assets/player/` 里的不是原件。下载见 `scripts/fetch-player-sources.mjs`，加工见
`scripts/prepare-player-assets.mjs` + `blender/tools/compose_player.py`：

- 底模身体只留脖子和头（服装包 Readme 要求：穿衣服时只用头，否则穿模），交界一圈往里收 12mm
- 三件拼到同一副骨架上，导出一个 GLB，不带动画
- 头发、眉毛原贴图是灰度（颜色原本在引擎 shader 里染），乘了深棕黑色
- 皮肤贴图降饱和（×0.7）、提亮（×1.22）
- 农夫装贴图只保留明暗，重染成靛蓝土布
- 贴图 4096²/2048² 降到 1024²，转 JPEG（q85）
- 动画只留 12 条，删掉人偶网格；待机那条手指往静息姿态拉回一半；
  删掉整段不变且等于静息值的轨道
- 结果：`player.glb` 1.80MB，`anims.glb` 0.59MB（原件三个包合计 420MB）

## crowd/ · 港区路人

和玩家角色同一批 **Quaternius CC0** 原件（见上面的 player/）：`Superhero_Male` / `Superhero_Female` 的头、
`Male_Peasant` / `Female_Peasant` 农夫装、`Hair_SimpleParted` / `Hair_Buzzed` / `Hair_Long` / `Hair_Buns`。
四套各自按 `blender/tools/compose_player.py --decimate 0.12` 减面、`blender/tools/bake_crowd.py` 合成单网格并把颜色烘成一张
512² 贴图（靛蓝两套同玩家的重染，棕色两套是原色）。动画不另存，直接用 `player/anims.glb`。

| 文件 | 三角形 | 大小 |
| --- | --- | --- |
| `m_indigo_parted.glb` | 3,811 | 0.42MB |
| `m_brown_buzzed.glb` | 4,486 | 0.46MB |
| `f_indigo_long.glb` | 3,302 | 0.48MB |
| `f_brown_buns.glb` | 3,348 | 0.48MB |

## vehicles/ · 载具

**几何是本项目自己建的**，不是第三方模型：`blender/tools/build_roadster.py` 等脚本在 Blender 里
按截面放样、沿路径扫出车身和翼子板，不用方盒拼。能不登录下载、又带真实贴图的老式车和水上飞机
没有找到（带贴图的都在 Sketchfab，要登录），所以自建。

贴图来自 **Poly Haven**，**CC0 1.0**（<https://polyhaven.com/license>），降到 512² 后打包进 GLB：

| 贴图 | 用在哪 | 来源 |
| --- | --- | --- |
| `brown_leather` | 座椅 | <https://polyhaven.com/a/brown_leather> |
| `rough_linen` | 敞篷车帆布篷；飞机蒙皮用的是它重新上色的版本 `linen_cream`（原图是蓝布，只留布纹明暗，改成奶油色） | <https://polyhaven.com/a/rough_linen> |
| `teak_veneer` | 仪表板、木桨、翼间支柱、帆船船舱与桅杆 | <https://polyhaven.com/a/teak_veneer> |
| `wood_floor_deck` | 帆船、船只甲板；汽船用的是它重新上色的浅色版 `deck_light`（原图偏橙红） | <https://polyhaven.com/a/wood_floor_deck> |
| `weathered_planks` | 大眼鸡帆船船壳、乌篷船舱板；另有重新上色的 `planks_white`（汽船上层建筑、雨港船舱）和 `planks_tung`（乌篷船桐油船壳） | <https://polyhaven.com/a/weathered_planks> |
| `bamboo_wall_02` | 竹撑条、乌篷拱骨；重新上色的 `bamboo_black` 是乌篷的黑竹篾 | <https://polyhaven.com/a/bamboo_wall_02> |

`rough_linen` 另有重新上色的 `sail_rust`（大眼鸡帆船的红褐色硬帆）。重新上色的几张都只保留原图的明暗纹理、换掉颜色，
生成方式就是对灰度图 colorize，法线贴图照用原件。

原件在不入库的 `assets/_src/vehicles/tex/`。车漆、镀铬、铝件不贴图，是纯材质参数。

## journeys/vendor/GLTFLoader.js

Three.js r128 的 `examples/js/loaders/GLTFLoader.js`，Copyright © 2010–2021
Three.js Authors，MIT。完整许可见仓库根目录的 `THIRD_PARTY_NOTICES.md`。
