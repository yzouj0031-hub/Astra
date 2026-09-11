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
lib/color.py      # three.js Color 的 getHSL/setHSL/tint
lib/geo.py        # 坐标系转换、M() 矩阵、原语、顶点色合批
lib/materials.py  # 顶点色 -> Principled
parts/site.py     # 布局常量、地形高度
parts/plants.py   # 柳树、樟树
milestones/       # 每步一个可渲染的验收场景
tests/            # JS/Python 数值一致性
```

## 两条硬性约束

1. **随机流顺序**。整座镇子由一条全局 LCG 按调用顺序生成（种子 20260906）。
   移植任何 `build*` 函数时，`rr/ri/pick/tint` 的调用次数和先后必须和 JS 一模一样，
   否则后面所有物件全部错位。每个函数都在 `parts/*.py` 里带一个 `*_DRAWS` 常量，
   milestones 启动时断言，改坏了立刻报错。
2. **坐标系只转一次**。parts 里全部按 three 空间（Y-up）写，数值可以逐行对照 JS；
   只有 `geo.Batch.build()` 出网格时做 `(x,y,z) -> (x,-z,y)`。别在别处再转。

## 跑验收

```powershell
python blender\tests\test_rng_parity.py                     # 需要 node
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python blender\milestones\m01_trees.py
```
