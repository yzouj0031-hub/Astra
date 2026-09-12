"""查 Cycles 能用什么设备。

    & $B --background --python blender\\tools\\probe_gpu.py

把每个后端（CUDA / OptiX / HIP / oneAPI / Metal）下检测到的设备名都打出来，
并明确说结论：到底能不能走独显。走不上就直说，不要硬把 device 设成 GPU ——
Cycles 在没有可用设备时会**静默退回 CPU**，只在日志里留一行，
很容易以为自己在用显卡。
"""

import bpy

GPU_BACKENDS = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def main():
    prefs = bpy.context.preferences.addons["cycles"].preferences

    # 这台机器的 Blender 编译时支持哪些后端
    try:
        available = [item.identifier for item in
                     prefs.bl_rna.properties["compute_device_type"].enum_items]
    except Exception as e:                                   # noqa: BLE001
        available = []
        print("取不到后端列表:", e)
    print("Blender 支持的后端:", ", ".join(available) or "(无)")

    found = {}
    for backend in available:
        if backend == "NONE":
            continue
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        try:
            devices = prefs.get_devices_for_type(backend)
        except Exception as e:                               # noqa: BLE001
            print(f"  {backend}: 查询失败 {e}")
            continue
        names = [d.name for d in devices]
        if names:
            found[backend] = names
        print(f"  {backend}: {names or '(没有设备)'}")

    # 所有设备（含 CPU），看清楚谁是谁
    print("\n全部设备:")
    try:
        prefs.refresh_devices()
    except Exception:                                        # noqa: BLE001
        pass
    for d in getattr(prefs, "devices", []):
        print(f"  [{d.type:8}] {d.name}  use={d.use}")

    gpu_backends = [b for b in found if b in GPU_BACKENDS]
    print()
    if gpu_backends:
        best = sorted(gpu_backends,
                      key=lambda b: GPU_BACKENDS.index(b))[0]
        print(f"结论：可以走 GPU。首选后端 {best}，设备 {found[best]}")
        print(f"RESULT GPU {best} {'|'.join(found[best])}")
    else:
        print("结论：**没有可用的 GPU 计算设备**，Cycles 只能走 CPU。")
        print("RESULT CPU")


if __name__ == "__main__":
    main()
