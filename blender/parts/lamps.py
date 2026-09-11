"""灯笼。移植自 watertown.js:720-727（commitBatches 的后半段）。

原作里灯笼是一个 InstancedMesh（球 SphereGeometry(0.28,10,8) 压成 1:1.22），
外加每盏三个木质配件（上盖、下盖、垂坠），再挑最多 9 盏挂 PointLight。

2A 的做法差一处：**不需要 PointLight**。灯笼纸本身是发光材质，
Cycles 里发光的网格就是光源，灯下的地面、水面倒影、雨雾里的光晕都会自然出现，
不用像实时渲染那样另外补光、再贴一张 sprite 假装光晕。
那个「最多 9 盏」的限制是 WebGL 的性能妥协，这里也不要照搬。

一个取数都不消耗 —— 位置全在 layoutTown 里就定好了（reg.lantern_spots）。
"""

from ..lib.geo import M, prim_sphere

C_WOOD_DK = 0x3A2716
C_LANTERN = 0xD94A35
C_TASSEL = 0xE0B040

# watertown.js:721 —— 灯笼那颗球的分段数与 G.sph(9,7) 不同
LANTERN_R = 0.28
LANTERN_SQUASH = 1.22


def build_lanterns(lantern_batch, cap_batch, reg):
    """把 reg.lantern_spots 里每一盏灯摆出来。

    lantern_batch 走发光的灯笼纸材质，cap_batch 走木头 —— 分开是因为
    这两样材质完全不同，合在一个网格里没法分别给。
    """
    sph = prim_sphere(10, 8)
    for s in reg.lantern_spots:
        x, y, z = s["x"], s["y"], s["z"]
        lantern_batch.add(sph, M(x, y, z, LANTERN_R, LANTERN_R * LANTERN_SQUASH,
                                 LANTERN_R), C_LANTERN)
        cap_batch.add("cyl", M(x, y + 0.36, z, 0.14, 0.08, 0.14), C_WOOD_DK)
        cap_batch.add("cyl", M(x, y - 0.36, z, 0.12, 0.08, 0.12), C_WOOD_DK)
        cap_batch.add("cyl", M(x, y - 0.55, z, 0.05, 0.3, 0.05), C_TASSEL)
    return len(reg.lantern_spots)
