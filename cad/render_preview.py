"""Render the CAD-derived assembly as a clean engineering preview in Blender."""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cad/output/EXO_FORGE_CAD_V02_PREVIEW.glb"
RENDER_DIR = ROOT / "cad/output/renders"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def add_label(text: str, location: tuple[float, float, float], size: float, color: tuple[float, float, float, float]) -> None:
    bpy.ops.object.text_add(location=location, rotation=(math.radians(76), 0, 0))
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.08
    obj.data.materials.append(material(f"label-{text}", color, 0.0, 0.45))


def render_view(name: str, direction: Vector, centre: Vector, span: float, floor_z: float) -> None:
    scene = bpy.context.scene
    camera = bpy.data.cameras.new(f"CAM_{name}")
    camera.type = "ORTHO"
    camera.ortho_scale = span * 1.55
    camera.lens = 55
    camera_obj = bpy.data.objects.new(f"CAM_{name}", camera)
    bpy.context.collection.objects.link(camera_obj)
    camera_obj.location = centre + direction.normalized() * span * 2.2
    look_at(camera_obj, centre)
    scene.camera = camera_obj
    scene.render.filepath = str(RENDER_DIR / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera_obj, do_unlink=True)


def main() -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE), merge_vertices=True)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    # The CAD exporter uses millimetres. Keep one Blender unit per millimetre so
    # the render and dimension labels remain directly readable.
    minimum, maximum = bounds(meshes)
    centre = (minimum + maximum) / 2
    span = max(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z)
    floor_z = minimum.z - 4

    for obj in meshes:
        bevel = obj.modifiers.new("CAD edge highlight", "BEVEL")
        bevel.width = 0.35
        bevel.segments = 2

    floor_mat = material("Graphite floor", (0.025, 0.031, 0.036, 1), 0.08, 0.32)
    bpy.ops.mesh.primitive_plane_add(size=span * 4, location=(centre.x, centre.y, floor_z))
    bpy.context.object.data.materials.append(floor_mat)

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=span * 0.39, depth=2.0, location=(centre.x, centre.y, floor_z + 1))
    plinth = bpy.context.object
    plinth.data.materials.append(material("Titanium plinth", (0.10, 0.12, 0.14, 1), 0.75, 0.24))

    add_label("EXO FORGE  CAD V0.2", (centre.x, centre.y + span * 0.50, floor_z + 2.2), span * 0.035, (0.98, 0.32, 0.06, 1))
    add_label("1:5 PRINTABLE ASSEMBLY  |  STEP + WATERTIGHT STL", (centre.x, centre.y + span * 0.43, floor_z + 2.2), span * 0.016, (0.45, 0.80, 0.91, 1))

    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.016, 0.021, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22

    bpy.ops.object.light_add(type="AREA", location=(centre.x - span, centre.y - span, centre.z + span * 1.6))
    key = bpy.context.object
    key.data.energy = 1450
    key.data.shape = "DISK"
    key.data.size = span * 1.1
    look_at(key, centre)

    bpy.ops.object.light_add(type="AREA", location=(centre.x + span, centre.y - span * 0.2, centre.z + span * 0.8))
    rim = bpy.context.object
    rim.data.energy = 1150
    rim.data.color = (0.20, 0.62, 1.0)
    rim.data.size = span * 0.8
    look_at(rim, centre)

    bpy.ops.object.light_add(type="AREA", location=(centre.x, centre.y + span, centre.z + span))
    fill = bpy.context.object
    fill.data.energy = 900
    fill.data.color = (1.0, 0.28, 0.06)
    fill.data.size = span
    look_at(fill, centre)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.curvature_ridge_factor = 2.0
    scene.display.shading.curvature_valley_factor = 1.4
    scene.display.shading.show_specular_highlight = True
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.018, 0.024, 0.030)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.color_depth = "8"
    RENDER_DIR.mkdir(parents=True, exist_ok=True)

    target = Vector((centre.x, centre.y, centre.z + span * 0.03))
    render_view("01-cad-isometric", Vector((1.35, -1.55, 0.95)), target, span, floor_z)
    render_view("02-cad-front", Vector((0, -1, 0.10)), target, span, floor_z)


if __name__ == "__main__":
    main()
