# Blender 移植

把 `journeys/watertown.js`（烟雨渡 · 江南水乡，程序化生成）的生成逻辑翻译成 bpy，
让 Blender 端也能调参重生成，而不是导出一堆死网格。JS 原文件是参考源，不修改。

## 环境

Blender 5.2.1 LTS，装在 `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`（**不在 PATH 上**）。

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python blender\hello.py
```

## 目录

```
lib/rng.py        # watertown.js 的 LCG，逐位复刻
lib/color.py      # three.js Color 的 getHSL/setHSL/tint/lerp
lib/mat4.py       # 双精度 4x4（mathutils 是单精度，会和 JS 对不上）
lib/geo.py        # 坐标系转换、M() 矩阵、原语、顶点色 + UV 合批
lib/atlas.py      # 招牌字图集的格子布局（纯算术，无依赖）
lib/materials.py  # 2A 的程序化节点材质
tools/make_atlas.py  # 用 PIL 画图集（要用系统 Python 跑）
assets/           # 生成出来的图集
parts/site.py     # 布局、水域判定、地形、驳岸、地面、广场、远山、菜畦、河水
parts/plants.py   # 柳树、樟树
milestones/       # 每步一个可渲染的验收场景
tests/            # 与 JS 原函数的数值比对
```

## 阶段 2A + 保留 2B 的入口

材质按 2A 写（程序化节点、真折射的水），但几何上的**顶点色和 UV 一律保留**：
`Batch` 两样都写进网格，材质只是拿顶点色当底色。以后做 2B 烘 lightMap 时
不用重新展 UV，也不用回头找作者原来的配色。

## 招牌字图集

`buildAtlas` 在 JS 里是往 canvas 上写字。Blender 自带的 Python **没有 PIL**，
所以拆成两半：格子布局放 `lib/atlas.py`（纯算术，Blender 里能算），
画图交给系统 Python：

```powershell
python blender\tools\make_atlas.py 4      # 参数是放大倍率，默认 4 -> 4096x4096
```

字体写死 `C:\Windows\Fonts\simsun.ttc`，找不到就直接报错退出 ——
退回 PIL 默认字体的话中文全是方块，而且要等渲完才发现。
放大倍率不影响任何 UV：`cell()` 是按 W/H 取比例的，整张图等比放大，
格子坐标一个不变，所以想要多清晰就调多少，几何侧不用动。

## 三条硬性约束

1. **随机流顺序**。整座镇子由一条全局 LCG 按调用顺序生成（种子 20260906）。
   移植任何 `build*` 函数时，`rr/ri/pick/tint` 的调用次数和先后必须和 JS 一模一样，
   否则后面所有物件全部错位。每个函数都在 `parts/*.py` 里带一个 `*_DRAWS` 常量，
   milestones 启动时断言，改坏了立刻报错。
2. **坐标系只转一次**。parts 里全部按 three 空间（Y-up）写，数值可以逐行对照 JS；
   只有 `geo.Batch.build()` 出网格时做 `(x,y,z) -> (x,-z,y)`。别在别处再转。
3. **矩阵用 lib/mat4.py，不要用 mathutils**。mathutils 是单精度，跟 JS 比对时
   小数点后第七位就分家。mat4 是纯 Python 双精度，也不依赖 bpy。

## 跑验收

`tests/js_harness.mjs` 会把 `index.html` 里内嵌的真 three.js r128 抠出来，
再从 `watertown.js` 切出**原函数**在 node 里跑，报告它消耗的随机数个数、
结束时的种子、以及每一次 `Batch.add` 的原语/矩阵/颜色/uvBox。
`test_site_parity.py` 拿这份流水和 Python 侧逐项比 —— 移植对不对不靠眼看。

```powershell
$B = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
python blender\tests\test_rng_parity.py                        # 随机流位级一致（需要 node）
& $B --background --python blender\tests\test_site_parity.py   # 逐次调用比对
& $B --background --python blender\milestones\m01_trees.py
& $B --background --python blender\milestones\m02_site.py
```
