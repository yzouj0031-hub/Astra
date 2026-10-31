# 云水行 · 开放世界（独立于 Astra 的新游戏）

一片 1.4 km × 1.4 km 的中式溪山：渡头村、东畈水田、竹坞、枫林里的山神祠、青屏山顶的烽台、
镜湖、松坡，以及两处山贼寨子。一个人、一把刀、一条乌篷船。

## 跑起来

```
node openworld/serve.mjs          # 然后打开 http://127.0.0.1:8777/
```

直接双击 `index.html` 打不开：ES 模块和 glTF 都要走 HTTP。

## 玩法

- **WASD / 方向键** 移动，**Shift** 跑，**空格** 跳，**拖动鼠标** 环顾，**滚轮** 缩放
- **J** 轻击 **K** 重击 **L** 翻滚，**E** 互动（说话 / 上香 / 点烽火 / 登船）
- **M** 舆图 **I** 行囊 **Q** 事务 **Esc** 停；触屏有摇杆和 疾 / 跃 / 攻 / 闪 / 互 五个键
- 六条任务从村里的人身上接；左上角追踪当前任务，画面里的红菱形是目标和距离
- 一天十二时辰，24 分钟过一天；天黑灯笼亮、窗纸透光、寨火跳动
- 血、气、铜钱、行囊、任务进度、时辰都存在本机（localStorage）

## 代码

```
index.html            界面与样式（印章按钮、宣纸面板）
src/main.js           入口：加载 → 建世界 → 主循环
src/world/layout.js   地理：河、村、山、路，全图坐标都从这里引用
src/world/terrain.js  地形高度场、顶点色、水面、俯视图
src/world/foliage.js  树（Quaternius glTF 实例化 + 风）、远树卡片、柳 / 竹 / 层叠松的 alpha 卡片、草
src/world/buildings.js 房、茶舍、祠、桥、埠头、井、烽台、牌坊、寨子、篱笆、路牌、灯笼
src/world/sky.js      昼夜：天穹着色器、太阳月亮、雾、时辰
src/world/textures.js 画布生成的贴图：瓦、墙、木、窗棂、石、草叶
src/player.js         玩家：移动、跳、游、攻击、翻滚、血气
src/npcs.js           村民（溜达 / 搭话）与山贼（巡逻 / 追 / 砍 / 掉落 / 复活）
src/quests.js         任务数据与推进
src/items.js          捡拾、行囊、茶舍买卖
src/boat.js           乌篷船
src/hud.js            小地图、时辰、血条、任务追踪、路标、对话、面板
src/input.js          键鼠与触屏
tests/shots.cjs       游戏内实拍：node openworld/tests/shots.cjs <目录> [机位]
```

模型来源与许可见 `assets/LICENSES.md`（树、人、动画：Quaternius CC0；乌篷船：Astra 自建；three.js：MIT）。
