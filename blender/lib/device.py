"""挑渲染设备：有独显就用，没有就老实用 CPU，并且**一定要说出来用的是哪个**。

Cycles 有个很坑的行为：把 scene.cycles.device 设成 "GPU" 但一个可用设备都没有时，
它会**静默退回 CPU**，只在日志里留一行。于是你以为在用显卡跑，其实没有。
所以这里每次都打印实际结论。

后端优先级 OPTIX > CUDA > HIP > ONEAPI：
  OPTIX 走 RT core，同一块 N 卡通常比 CUDA 快一截。

这个模块让同一套脚本在本机（纯 CPU）和云上的 GPU 机器上都能直接跑，
不用改代码 —— 场景本身是代码生成的，上传两百来 KB 的 .py 就够，
不用传几十 MB 的 .blend。
"""

import bpy

BACKENDS = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def available_gpus():
    """返回 (后端, [设备名]) —— 没有可用 GPU 就返回 (None, [])。"""
    prefs = bpy.context.preferences.addons.get("cycles")
    if not prefs:
        return None, []
    prefs = prefs.preferences
    for backend in BACKENDS:
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue                      # 这个 Blender 版本没编译这个后端
        try:
            devices = prefs.get_devices_for_type(backend)
        except Exception:                 # noqa: BLE001
            continue
        names = [d.name for d in devices]
        if names:
            return backend, names
    return None, []


def configure(scene, prefer_gpu=True, quiet=False):
    """设好 scene.cycles.device，返回实际用的设备说明。"""
    backend, names = available_gpus() if prefer_gpu else (None, [])

    if backend:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = backend
        for device in prefs.devices:
            # GPU 全开；CPU 也一起上，多几个线程不亏
            device.use = device.type in (backend, "CPU")
        scene.cycles.device = "GPU"
        used = f"GPU / {backend} / {', '.join(names)}"
    else:
        scene.cycles.device = "CPU"
        cpu = next((d.name for d in
                    bpy.context.preferences.addons["cycles"].preferences.devices
                    if d.type == "CPU"), "CPU")
        used = f"CPU / {cpu}"

    if not quiet:
        print(f"[device] {used}")
    return used
