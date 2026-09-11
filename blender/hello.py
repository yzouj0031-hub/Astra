"""Phase 0 pipeline check: cube + light, Cycles 128 samples, 512x512 -> renders/hello.png

Run:  blender --background --python blender/hello.py
"""
import os
import sys
import math

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "renders", "hello.png")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build():
    scene = bpy.context.scene

    # --- ground so the cube has something to cast onto -------------------
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"

    mat_ground = bpy.data.materials.new("M_Ground")
    mat_ground.use_nodes = True
    bsdf = mat_ground.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.30, 0.32, 0.30, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    ground.data.materials.append(mat_ground)

    # --- the cube --------------------------------------------------------
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
    cube = bpy.context.active_object
    cube.name = "HelloCube"
    cube.rotation_euler = (0, 0, math.radians(18))

    mat_cube = bpy.data.materials.new("M_Cube")
    mat_cube.use_nodes = True
    bsdf = mat_cube.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.65, 0.20, 0.16, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.35
    cube.data.materials.append(mat_cube)

    # --- light -----------------------------------------------------------
    light_data = bpy.data.lights.new("KeyLight", type="AREA")
    light_data.energy = 1200.0
    light_data.size = 4.0
    light = bpy.data.objects.new("KeyLight", light_data)
    light.location = (4.0, -4.0, 6.0)
    light.rotation_euler = (math.radians(45), 0.0, math.radians(45))
    scene.collection.objects.link(light)

    # --- camera ----------------------------------------------------------
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 50.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (7.0, -7.0, 5.0)
    cam.rotation_euler = (math.radians(63), 0.0, math.radians(45))
    scene.collection.objects.link(cam)
    scene.camera = cam

    # --- world (dim sky so nothing is pitch black) ------------------------
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.07, 0.10, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = OUT


def main():
    reset_scene()
    build()
    configure_render()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    ok = os.path.exists(OUT)
    print("PHASE0 output:", OUT, "exists=", ok,
          "bytes=", os.path.getsize(OUT) if ok else 0)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
