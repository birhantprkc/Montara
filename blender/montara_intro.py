"""Montara 3D intro — a small Blender scene rendered to a PNG frame sequence.

Run headless:  blender --background --python blender/montara_intro.py -- <frames_dir>
The render-blender adapter then encodes the frames to MP4 with ffmpeg. Kept deliberately
small (720p, 48 frames, EEVEE, low samples) so a full render stays under a couple of minutes.
"""
import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frames_dir = argv[0] if argv else "blender_frames"
os.makedirs(frames_dir, exist_ok=True)

# --- clear the default scene ---
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

# --- 3D extruded title ---
bpy.ops.object.text_add(location=(0, 0, 0))
txt = bpy.context.object
txt.data.body = "MONTARA"
txt.data.extrude = 0.12
txt.data.bevel_depth = 0.015
txt.data.align_x = "CENTER"
txt.data.align_y = "CENTER"

mat = bpy.data.materials.new("MontaraMat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.13, 0.83, 0.93, 1)
    for slot in ("Emission Color",):
        if slot in bsdf.inputs:
            bsdf.inputs[slot].default_value = (0.13, 0.83, 0.93, 1)
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.5
    bsdf.inputs["Metallic"].default_value = 0.6
    bsdf.inputs["Roughness"].default_value = 0.25
txt.data.materials.append(mat)

# --- camera ---
bpy.ops.object.camera_add(location=(0, -6, 1.4), rotation=(math.radians(78), 0, 0))
bpy.context.scene.camera = bpy.context.object

# --- light ---
bpy.ops.object.light_add(type="SUN", location=(4, -4, 6))
bpy.context.object.data.energy = 4.0

# --- dark world background ---
world = bpy.context.scene.world
if world and world.use_nodes:
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.03, 0.04, 0.07, 1)

# --- animate a gentle turn ---
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 48
txt.rotation_euler = (math.radians(90), 0, math.radians(-22))
txt.keyframe_insert("rotation_euler", frame=1)
txt.rotation_euler = (math.radians(90), 0, math.radians(22))
txt.keyframe_insert("rotation_euler", frame=48)

# --- render settings (fast EEVEE) ---
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.fps = 24
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        scene.render.engine = engine
        break
    except Exception:
        continue
try:
    scene.eevee.taa_render_samples = 16
except Exception:
    pass
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(frames_dir, "frame_")

bpy.ops.render.render(animation=True)
print("BLENDER_DONE", frames_dir)
