#!/usr/bin/env python3
"""Build the EXO Forge CAD V0.2 printable demonstrator.

All source dimensions are millimetres.  The nominal machine dimensions remain
full-scale in config.v0.2.json; printable geometry is generated at the selected
prototype scale with print-specific minimum walls and clearances kept absolute.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import shutil
import zipfile
from typing import Iterable

import cadquery as cq
from cadquery import exporters
import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1]
CAD_DIR = ROOT / "cad"
CONFIG_PATH = CAD_DIR / "config.v0.2.json"
OUTPUT = CAD_DIR / "output"
STEP_DIR = OUTPUT / "step"
STL_DIR = OUTPUT / "stl"

REQUIRED_FAMILIES = {
    "H01", "H02", "H03",
    "F01", "F02", "F03",
    "L01", "L02", "L03", "L04", "L05", "L06",
    "A01", "A02", "A03", "A04",
    "P01", "P02", "P03", "P04",
}


@dataclass
class PartSpec:
    key: str
    family: str
    display_name: str
    shape: cq.Workplane
    quantity: int = 1
    material: str = "PETG"
    orientation: str = "largest flat face on build plate"
    notes: str = ""


@dataclass
class Placement:
    part_key: str
    shape: cq.Workplane


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def hole_tool(points: Iterable[tuple[float, float]], diameter: float, depth: float) -> cq.Workplane:
    return (
        cq.Workplane("XY")
        .pushPoints(list(points))
        .circle(diameter / 2)
        .extrude(depth, both=True)
    )


def rounded_plate(x: float, y: float, z: float, radius: float = 1.5) -> cq.Workplane:
    solid = cq.Workplane("XY").box(x, y, z, centered=(True, True, True))
    safe_radius = min(radius, x / 4, y / 4)
    if safe_radius > 0:
        solid = solid.edges("|Z").fillet(safe_radius)
    return solid


def capsule_link(length: float, width: float, thickness: float, bore: float, *, one_hole: bool = False) -> cq.Workplane:
    radius = width / 2
    straight = cq.Workplane("XY").box(
        max(length - width, 0.1), width, thickness, centered=(True, True, True)
    )
    left = cq.Workplane("XY").center(-length / 2 + radius, 0).circle(radius).extrude(thickness / 2, both=True)
    right = cq.Workplane("XY").center(length / 2 - radius, 0).circle(radius).extrude(thickness / 2, both=True)
    solid = straight.union(left).union(right)
    points = [(-length / 2 + radius, 0)] if one_hole else [
        (-length / 2 + radius, 0),
        (length / 2 - radius, 0),
    ]
    return solid.cut(hole_tool(points, bore, thickness * 2))


def joint_hub(outer_diameter: float, thickness: float, bore: float) -> cq.Workplane:
    return (
        cq.Workplane("XY")
        .circle(outer_diameter / 2)
        .circle(bore / 2)
        .extrude(thickness / 2, both=True)
    )


def open_cuff(outer_diameter: float, wall: float, thickness: float, opening: float) -> cq.Workplane:
    ring = (
        cq.Workplane("XY")
        .circle(outer_diameter / 2)
        .circle(outer_diameter / 2 - wall)
        .extrude(thickness / 2, both=True)
    )
    slot = (
        cq.Workplane("XY")
        .box(opening, outer_diameter, thickness * 2, centered=(True, True, True))
        .translate((0, outer_diameter / 2, 0))
    )
    return ring.cut(slot)


def u_frame(width: float, depth: float, beam: float, thickness: float, bore: float) -> cq.Workplane:
    back = rounded_plate(width, beam, thickness, 1.4).translate((0, -depth / 2 + beam / 2, 0))
    side_x = width / 2 - beam / 2
    side_y = beam / 2
    side = rounded_plate(beam, depth, thickness, 1.4)
    solid = back.union(side.translate((-side_x, side_y, 0))).union(side.translate((side_x, side_y, 0)))
    hole_y = depth / 2 - beam / 2
    return solid.cut(hole_tool([(-side_x, hole_y), (side_x, hole_y)], bore, thickness * 2))


def ventilated_backplate(width: float, height: float, thickness: float, bore: float) -> cq.Workplane:
    plate = rounded_plate(width, height, thickness, 3.0)
    mount_x = width / 2 - 7
    mount_y = height / 2 - 8
    plate = plate.cut(hole_tool([
        (-mount_x, -mount_y), (mount_x, -mount_y),
        (-mount_x, mount_y), (mount_x, mount_y),
    ], bore, thickness * 2))
    slot = rounded_plate(width * 0.46, 5.0, thickness * 2, 2.0)
    for y in (-height * 0.22, 0, height * 0.22):
        plate = plate.cut(slot.translate((0, y, 0)))
    return plate


def foot_plate(length: float, width: float, thickness: float, bore: float) -> cq.Workplane:
    plate = rounded_plate(length, width, thickness, 3.0)
    mount_x = -length / 2 + width * 0.46
    plate = plate.cut(hole_tool([(mount_x, -5), (mount_x, 5)], bore, thickness * 2))
    tread = rounded_plate(length * 0.72, 1.4, 1.0, 0.4)
    for y in (-width * 0.32, 0, width * 0.32):
        plate = plate.union(tread.translate((length * 0.06, y, -thickness / 2 - 0.5)))
    return plate


def gripper_link(length: float, width: float, thickness: float, bore: float) -> cq.Workplane:
    link = capsule_link(length, width, thickness, bore, one_hole=True)
    wrist_x = length / 2 - width / 2
    palm = rounded_plate(width * 1.35, width * 1.25, thickness, 1.2).translate((wrist_x + width * 0.42, 0, 0))
    finger = rounded_plate(width * 1.55, width * 0.28, thickness, 0.8)
    finger_x = wrist_x + width * 1.25
    return (
        link.union(palm)
        .union(finger.translate((finger_x, width * 0.47, 0)))
        .union(finger.translate((finger_x, -width * 0.47, 0)))
    )


def enclosure_body(x: float, y: float, z: float, wall: float) -> cq.Workplane:
    outer = rounded_plate(x, y, z, 2.4)
    inner = (
        cq.Workplane("XY")
        .box(x - wall * 2, y - wall * 2, z, centered=(True, True, False))
        .translate((0, 0, -z / 2 + wall))
    )
    body = outer.cut(inner)
    tab = rounded_plate(8, 5, wall, 0.8)
    return body.union(tab.translate((-x / 2 + 7, -y / 2 - 1.5, z / 2 - wall / 2))).union(
        tab.translate((x / 2 - 7, -y / 2 - 1.5, z / 2 - wall / 2))
    )


def cable_clip(outer_diameter: float, wall: float, thickness: float) -> cq.Workplane:
    return open_cuff(outer_diameter, wall, thickness, opening=outer_diameter * 0.42)


def outrigger(length: float, width: float, thickness: float, bore: float) -> cq.Workplane:
    link = capsule_link(length, width, thickness, bore, one_hole=True)
    pad = rounded_plate(width * 2.6, width * 1.9, thickness, 2.0)
    return link.union(pad.translate((length / 2 - width / 3, 0, 0)))


def align_x_to(shape: cq.Workplane, vector: tuple[float, float, float]) -> cq.Workplane:
    target = np.asarray(vector, dtype=float)
    target /= np.linalg.norm(target)
    source = np.asarray([1.0, 0.0, 0.0])
    axis = np.cross(source, target)
    axis_length = float(np.linalg.norm(axis))
    dot = float(np.clip(np.dot(source, target), -1.0, 1.0))
    angle = math.degrees(math.acos(dot))
    if axis_length < 1e-9:
        if dot < 0:
            return shape.rotate((0, 0, 0), (0, 0, 1), 180)
        return shape
    axis /= axis_length
    return shape.rotate((0, 0, 0), tuple(float(value) for value in axis), angle)


def place_link(shape: cq.Workplane, start: tuple[float, float, float], end: tuple[float, float, float]) -> cq.Workplane:
    vector = tuple(end[index] - start[index] for index in range(3))
    midpoint = tuple((start[index] + end[index]) / 2 for index in range(3))
    return align_x_to(shape, vector).translate(midpoint)


def place_disc_y(shape: cq.Workplane, location: tuple[float, float, float]) -> cq.Workplane:
    return shape.rotate((0, 0, 0), (1, 0, 0), 90).translate(location)


def shape_volume(shape: cq.Workplane) -> float:
    return float(sum(solid.Volume() for solid in shape.solids().vals()))


def build_parts(config: dict) -> tuple[list[PartSpec], list[Placement], dict]:
    nominal = config["nominalFullScale"]
    printing = config["printPrototype"]
    scale = float(printing["scale"])
    wall = float(printing["minimumWall"])
    bore = float(printing["pinBoreDiameter"])

    dims = {key: value * scale for key, value in nominal.items() if isinstance(value, (int, float))}
    shoulder = dims["shoulderFrameWidth"]
    pelvis = dims["pelvisFrameWidth"]
    torso = dims["torsoRailLength"]
    thigh = dims["thighLinkLength"]
    shin = dims["shinLinkLength"]
    upper_arm = dims["armUpperLength"]
    fore_arm = dims["armForeLength"]
    foot_length = dims["footLength"]
    foot_width = dims["footWidth"]
    out_span = dims["outriggerSpan"]

    link_width = 14.0
    link_thickness = 7.0
    arm_width = 15.0
    arm_thickness = 8.0

    parts: list[PartSpec] = []
    part_map: dict[str, PartSpec] = {}

    def add(spec: PartSpec) -> None:
        if spec.key in part_map:
            raise ValueError(f"duplicate part key: {spec.key}")
        parts.append(spec)
        part_map[spec.key] = spec

    add(PartSpec("H01_HARNESS_BACKPLATE", "H01", "胸背承托背板", ventilated_backplate(58, 78, 3.2, bore), material="PETG"))
    for side in ("L", "R"):
        add(PartSpec(f"H02_THIGH_CUFF_{side}", "H02", f"腿部承托环 {side}", open_cuff(23, wall, 7, 7), material="TPU/PETG"))
        add(PartSpec(f"H03_MASTER_ARM_{side}", "H03", f"内侧操纵臂 {side}", capsule_link(48, 8, 5, bore), material="PETG"))

    add(PartSpec("F01_SHOULDER_YOKE", "F01", "肩部主承力框", u_frame(shoulder, 26, 12, 8, bore), material="PETG-CF"))
    add(PartSpec("F02_SPINE_RAIL", "F02", "脊柱承力梁", capsule_link(torso, 14, 8, bore), material="PETG-CF"))
    add(PartSpec("F03_PELVIS_YOKE", "F03", "骨盆闭环框", u_frame(pelvis, 28, 12, 8, bore), material="PETG-CF"))

    for side in ("L", "R"):
        add(PartSpec(f"L01_HIP_HUB_{side}", "L01", f"髋关节轮毂 {side}", joint_hub(24, 9, bore), material="PETG-CF"))
        add(PartSpec(f"L02_THIGH_LINK_{side}", "L02", f"大腿承力连杆 {side}", capsule_link(thigh, link_width, link_thickness, bore), material="PETG-CF"))
        add(PartSpec(f"L03_KNEE_HUB_{side}", "L03", f"膝关节轮毂 {side}", joint_hub(22, 9, bore), material="PETG-CF"))
        add(PartSpec(f"L04_SHIN_LINK_{side}", "L04", f"小腿承力连杆 {side}", capsule_link(shin, link_width, link_thickness, bore), material="PETG-CF"))
        add(PartSpec(f"L05_ANKLE_HUB_{side}", "L05", f"踝关节轮毂 {side}", joint_hub(19, 8, bore), material="PETG-CF"))
        add(PartSpec(f"L06_FOOT_PLATE_{side}", "L06", f"接地脚板 {side}", foot_plate(foot_length, foot_width, 5.2, bore), material="PETG"))

        add(PartSpec(f"A01_SHOULDER_HUB_{side}", "A01", f"外臂肩关节座 {side}", joint_hub(26, 10, bore), material="PETG-CF"))
        add(PartSpec(f"A02_UPPER_ARM_{side}", "A02", f"外臂上臂连杆 {side}", capsule_link(upper_arm, arm_width, arm_thickness, bore), material="PETG-CF"))
        add(PartSpec(f"A03_ELBOW_HUB_{side}", "A03", f"外臂肘关节座 {side}", joint_hub(23, 10, bore), material="PETG-CF"))
        add(PartSpec(f"A04_FOREARM_GRIPPER_{side}", "A04", f"前臂与末端夹持器 {side}", gripper_link(fore_arm, 13, 7, bore), material="PETG"))

    power_body = enclosure_body(62, 28, 74, wall)
    power_lid = rounded_plate(62 - wall * 1.2, 28 - wall * 1.2, 2.4, 1.6)
    add(PartSpec("P01_POWER_BODY", "P01", "动力背包壳体", power_body, material="PETG", orientation="open face upward"))
    add(PartSpec("P01_POWER_LID", "P01", "动力背包上盖", power_lid, material="PETG"))
    add(PartSpec("P02_CONTROL_CORE", "P02", "控制与安全总线壳体", enclosure_body(36, 22, 28, wall), material="PETG"))

    hip_z = 188.0
    support_start = (pelvis * 0.36, 8.0, hip_z - 10)
    support_end = (out_span / 2, 8.0, 7.0)
    support_length = math.dist(support_start, support_end)
    for side in ("L", "R"):
        add(PartSpec(f"P03_OUTRIGGER_{side}", "P03", f"可展开接地支腿 {side}", outrigger(support_length, 12, 7, bore), material="PETG-CF"))
    add(PartSpec("P04_SERVICE_CLIP", "P04", "线束液路维护卡扣", cable_clip(13, 2.4, 6), quantity=8, material="PETG"))

    coupon = rounded_plate(42, 18, 3, 1.5).cut(hole_tool([(-12, 0), (0, 0), (12, 0)], 3.2, 8))
    coupon = coupon.cut(hole_tool([(0, 0)], 3.4, 8)).cut(hole_tool([(12, 0)], 3.6, 8))
    # The previous line intentionally replaces the centre/right bores with the
    # requested tolerance sizes after the common pilot cut.
    add(PartSpec("FIT_TEST_PIN", "TEST", "销轴孔径公差试片 3.2/3.4/3.6", coupon, material="selected print material"))

    placements: list[Placement] = []
    def place(key: str, shape: cq.Workplane) -> None:
        placements.append(Placement(key, shape))

    ground_z = 7.0
    ankle_z = 18.0
    knee_z = ankle_z + shin
    hip_z = knee_z + thigh
    pelvis_z = hip_z + 9.0
    shoulder_z = pelvis_z + torso
    leg_x = pelvis * 0.39

    place("F01_SHOULDER_YOKE", part_map["F01_SHOULDER_YOKE"].shape.translate((0, 0, shoulder_z)))
    place("F03_PELVIS_YOKE", part_map["F03_PELVIS_YOKE"].shape.translate((0, 0, pelvis_z)))
    place("F02_SPINE_RAIL", place_link(part_map["F02_SPINE_RAIL"].shape, (0, 10, pelvis_z), (0, 10, shoulder_z)))
    place("H01_HARNESS_BACKPLATE", part_map["H01_HARNESS_BACKPLATE"].shape.rotate((0, 0, 0), (1, 0, 0), 90).translate((0, 7, (pelvis_z + shoulder_z) / 2)))

    for side, sign in (("L", -1), ("R", 1)):
        hip = (sign * leg_x, 0.0, hip_z)
        knee = (sign * (leg_x + 3), -3.0, knee_z)
        ankle = (sign * (leg_x + 3), 2.0, ankle_z)
        place(f"L01_HIP_HUB_{side}", place_disc_y(part_map[f"L01_HIP_HUB_{side}"].shape, hip))
        place(f"L02_THIGH_LINK_{side}", place_link(part_map[f"L02_THIGH_LINK_{side}"].shape, hip, knee))
        place(f"L03_KNEE_HUB_{side}", place_disc_y(part_map[f"L03_KNEE_HUB_{side}"].shape, knee))
        place(f"L04_SHIN_LINK_{side}", place_link(part_map[f"L04_SHIN_LINK_{side}"].shape, knee, ankle))
        place(f"L05_ANKLE_HUB_{side}", place_disc_y(part_map[f"L05_ANKLE_HUB_{side}"].shape, ankle))
        foot = part_map[f"L06_FOOT_PLATE_{side}"].shape.rotate((0, 0, 0), (0, 0, 1), 90).translate((sign * (leg_x + 3), -foot_length * 0.18, ground_z))
        place(f"L06_FOOT_PLATE_{side}", foot)
        place(f"H02_THIGH_CUFF_{side}", part_map[f"H02_THIGH_CUFF_{side}"].shape.translate((sign * (leg_x + 3), -3, (hip_z + knee_z) / 2)))

        shoulder_point = (sign * (shoulder / 2 - 6), 0.0, shoulder_z)
        elbow = (sign * (shoulder / 2 + 23), -20.0, shoulder_z - upper_arm * 0.78)
        wrist = (sign * (shoulder / 2 + 12), -20.0 - fore_arm * 0.88, elbow[2] - fore_arm * 0.18)
        place(f"A01_SHOULDER_HUB_{side}", place_disc_y(part_map[f"A01_SHOULDER_HUB_{side}"].shape, shoulder_point))
        place(f"A02_UPPER_ARM_{side}", place_link(part_map[f"A02_UPPER_ARM_{side}"].shape, shoulder_point, elbow))
        place(f"A03_ELBOW_HUB_{side}", place_disc_y(part_map[f"A03_ELBOW_HUB_{side}"].shape, elbow))
        place(f"A04_FOREARM_GRIPPER_{side}", place_link(part_map[f"A04_FOREARM_GRIPPER_{side}"].shape, elbow, wrist))

        master_start = (sign * 23.0, -3.0, shoulder_z - 28)
        master_end = (sign * 23.0, -46.0, shoulder_z - 48)
        place(f"H03_MASTER_ARM_{side}", place_link(part_map[f"H03_MASTER_ARM_{side}"].shape, master_start, master_end))

        out_start = (sign * support_start[0], support_start[1], support_start[2])
        out_end = (sign * support_end[0], support_end[1], support_end[2])
        place(f"P03_OUTRIGGER_{side}", place_link(part_map[f"P03_OUTRIGGER_{side}"].shape, out_start, out_end))

    place("P01_POWER_BODY", part_map["P01_POWER_BODY"].shape.translate((0, 28, shoulder_z - 48)))
    place("P01_POWER_LID", part_map["P01_POWER_LID"].shape.translate((0, 28, shoulder_z - 10)))
    place("P02_CONTROL_CORE", part_map["P02_CONTROL_CORE"].shape.translate((0, 30, pelvis_z + 25)))
    for index, z in enumerate(np.linspace(pelvis_z + 18, shoulder_z - 18, 4)):
        place("P04_SERVICE_CLIP", part_map["P04_SERVICE_CLIP"].shape.rotate((0, 0, 0), (1, 0, 0), 90).translate((8, 16, float(z))))

    derived = {
        "scale": scale,
        "scaleLabel": printing["scaleLabel"],
        "assemblyHeightMm": shoulder_z + 22,
        "assemblyWidthMm": out_span,
        "jointBoreMm": bore,
        "minimumWallMm": wall,
        "individualPartCount": len(parts),
        "installedPartCount": sum(part.quantity for part in parts if part.family != "TEST"),
    }
    return parts, placements, derived


def pack_3mf_plate(
    plate_path: Path,
    instances: list[tuple[str, Path]],
    bed: np.ndarray,
    *,
    margin: float = 5.0,
    gap: float = 4.0,
) -> dict:
    """Pack printable STL instances onto one simple FDM plate."""
    scene = trimesh.Scene()
    cursor_x = margin
    cursor_y = margin
    row_height = 0.0
    maximum_z = 0.0
    placements: list[dict] = []

    loaded: list[tuple[str, trimesh.Trimesh]] = []
    for name, path in instances:
        mesh = trimesh.load_mesh(path, process=True)
        loaded.append((name, mesh))
    loaded.sort(key=lambda item: max(float(item[1].extents[0]), float(item[1].extents[1])), reverse=True)

    for name, original in loaded:
        mesh = original.copy()
        size_x, size_y, size_z = (float(value) for value in mesh.extents)

        # Rotate only in the build plane. This preserves the intentionally flat
        # print orientation while making better use of the bed.
        if size_x > bed[0] - margin * 2 and size_y <= bed[0] - margin * 2:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [0, 0, 1]))
            size_x, size_y, size_z = (float(value) for value in mesh.extents)

        if cursor_x + size_x > bed[0] - margin:
            cursor_x = margin
            cursor_y += row_height + gap
            row_height = 0.0
        if cursor_y + size_y > bed[1] - margin:
            raise ValueError(f"{plate_path.name} exceeds print bed while placing {name}")

        minimum = mesh.bounds[0]
        mesh.apply_translation((cursor_x - minimum[0], cursor_y - minimum[1], -minimum[2]))
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        placements.append({
            "part": name,
            "originMm": [round(cursor_x, 3), round(cursor_y, 3), 0.0],
            "extentsMm": [round(size_x, 3), round(size_y, 3), round(size_z, 3)],
        })
        cursor_x += size_x + gap
        row_height = max(row_height, size_y)
        maximum_z = max(maximum_z, size_z)

    plate_path.write_bytes(scene.export(file_type="3mf"))
    reloaded = trimesh.load(plate_path, force="scene")
    plate_extents = np.asarray(reloaded.extents, dtype=float)
    return {
        "plate": plate_path.name,
        "instances": len(instances),
        "geometryCount": len(reloaded.geometry),
        "extentsMm": [round(float(value), 3) for value in plate_extents],
        "fitsBuildVolume": bool(np.all(plate_extents <= bed + 1e-6)),
        "maxPartHeightMm": round(maximum_z, 3),
        "placements": placements,
    }


def create_print_plates(parts: list[PartSpec], bed: np.ndarray) -> list[dict]:
    plate_dir = OUTPUT / "3mf"
    plate_dir.mkdir(parents=True, exist_ok=True)
    central: list[tuple[str, Path]] = []
    left: list[tuple[str, Path]] = []
    right: list[tuple[str, Path]] = []
    test_and_clips: list[tuple[str, Path]] = []

    for part in parts:
        path = STL_DIR / f"{part.key}.stl"
        if part.key == "P04_SERVICE_CLIP":
            test_and_clips.extend((f"{part.key}_{index + 1:02d}", path) for index in range(part.quantity))
        elif part.family == "TEST":
            test_and_clips.append((part.key, path))
        elif part.key.endswith("_L"):
            left.append((part.key, path))
        elif part.key.endswith("_R"):
            right.append((part.key, path))
        else:
            central.append((part.key, path))

    groups = [
        ("PLATE_01_CORE.3mf", central),
        ("PLATE_02_LEFT.3mf", left),
        ("PLATE_03_RIGHT.3mf", right),
        ("PLATE_04_FIT_AND_CLIPS.3mf", test_and_clips),
    ]
    return [pack_3mf_plate(plate_dir / name, instances, bed) for name, instances in groups]


def create_print_pack() -> Path:
    archive = OUTPUT / "EXO_FORGE_CAD_V02_PRINT_PACK.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(STL_DIR.glob("*.stl")):
            bundle.write(path, Path("stl") / path.name)
        for path in sorted((OUTPUT / "3mf").glob("*.3mf")):
            bundle.write(path, Path("3mf") / path.name)
        for path in (OUTPUT / "bom.json", OUTPUT / "validation.json", CONFIG_PATH, CAD_DIR / "README.zh-CN.md"):
            bundle.write(path, path.name)
    return archive


def export_all(parts: list[PartSpec], placements: list[Placement], config: dict, derived: dict) -> dict:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    STEP_DIR.mkdir(parents=True)
    STL_DIR.mkdir(parents=True)

    tolerance = float(config["printPrototype"]["stlLinearTolerance"])
    angular = float(config["printPrototype"]["stlAngularTolerance"])
    bed = np.asarray(config["printPrototype"]["buildVolume"], dtype=float)

    cad_checks: list[dict] = []
    stl_checks: list[dict] = []
    bom_parts: list[dict] = []

    for part in parts:
        step_path = STEP_DIR / f"{part.key}.step"
        stl_path = STL_DIR / f"{part.key}.stl"
        exporters.export(part.shape, str(step_path), exportType="STEP")
        exporters.export(
            part.shape,
            str(stl_path),
            exportType="STL",
            tolerance=tolerance,
            angularTolerance=angular,
        )

        solids = part.shape.solids().vals()
        cad_valid = bool(solids) and all(solid.isValid() for solid in solids)
        volume = shape_volume(part.shape)
        bounds = part.shape.val().BoundingBox()
        cad_checks.append({
            "part": part.key,
            "family": part.family,
            "solidCount": len(solids),
            "validBRep": cad_valid,
            "volumeMm3": round(volume, 2),
            "boundsMm": [round(bounds.xlen, 3), round(bounds.ylen, 3), round(bounds.zlen, 3)],
        })

        mesh = trimesh.load_mesh(stl_path, process=True)
        extents = np.asarray(mesh.extents, dtype=float)
        fits_bed = bool(np.all(np.sort(extents) <= np.sort(bed) + 1e-6))
        stl_checks.append({
            "part": part.key,
            "watertight": bool(mesh.is_watertight),
            "windingConsistent": bool(mesh.is_winding_consistent),
            "positiveVolume": bool(mesh.volume > 0),
            "volumeMm3": round(float(mesh.volume), 2),
            "extentsMm": [round(float(value), 3) for value in extents],
            "fitsBuildVolumeAfterOrientation": fits_bed,
            "triangles": int(len(mesh.faces)),
        })

        bom_parts.append({
            "part": part.key,
            "family": part.family,
            "displayName": part.display_name,
            "quantity": part.quantity,
            "materialSuggestion": part.material,
            "orientation": part.orientation,
            "solidVolumeMm3": round(volume, 2),
            "notes": part.notes,
            "step": f"step/{part.key}.step",
            "stl": f"stl/{part.key}.stl",
        })

    assembly = cq.Assembly(name="EXO_FORGE_CAD_V02_ASSEMBLY")
    palette = {
        "H": cq.Color(0.16, 0.18, 0.20),
        "F": cq.Color(0.35, 0.38, 0.41),
        "L": cq.Color(0.26, 0.29, 0.32),
        "A": cq.Color(0.94, 0.31, 0.08),
        "P": cq.Color(0.08, 0.10, 0.12),
    }
    part_lookup = {part.key: part for part in parts}
    for index, placement in enumerate(placements):
        family = part_lookup[placement.part_key].family
        color = palette.get(family[:1], cq.Color(0.5, 0.5, 0.5))
        assembly.add(placement.shape, name=f"{placement.part_key}_{index:02d}", color=color)

    assembly_step = OUTPUT / "EXO_FORGE_CAD_V02_ASSEMBLY.step"
    preview_glb = OUTPUT / "EXO_FORGE_CAD_V02_PREVIEW.glb"
    assembly.save(str(assembly_step))
    assembly.save(str(preview_glb))
    shutil.copy2(preview_glb, ROOT / "public/assets/exo-forge-cad-v02.glb")
    print_plates = create_print_plates(parts, bed)

    hardware = [
        {"item": "M3 shoulder bolt or 3 mm steel pin", "quantity": 18, "purpose": "articulated joints"},
        {"item": "M3 washer", "quantity": 36, "purpose": "joint face spacing"},
        {"item": "M3 nylon lock nut", "quantity": 18, "purpose": "adjustable joint preload"},
    ]
    bom = {
        "schemaVersion": 1,
        "revision": config["revision"],
        "units": "mm",
        "derived": derived,
        "parts": bom_parts,
        "hardware": hardware,
        "engineeringBoundary": config["engineeringBoundary"],
    }
    (OUTPUT / "bom.json").write_text(json.dumps(bom, ensure_ascii=False, indent=2), encoding="utf-8")

    represented = {part.family for part in parts if part.family in REQUIRED_FAMILIES}
    validation = {
        "schemaVersion": 1,
        "revision": config["revision"],
        "cadKernel": f"CadQuery {cq.__version__} / OpenCascade",
        "units": "mm",
        "moduleFamilies": sorted(represented),
        "requiredModuleFamilies": sorted(REQUIRED_FAMILIES),
        "missingModuleFamilies": sorted(REQUIRED_FAMILIES - represented),
        "cad": cad_checks,
        "stl": stl_checks,
        "printPlates": print_plates,
        "summary": {
            "partFiles": len(parts),
            "validBRep": sum(item["validBRep"] for item in cad_checks),
            "watertightStl": sum(item["watertight"] for item in stl_checks),
            "positiveVolumeStl": sum(item["positiveVolume"] for item in stl_checks),
            "fitsBuildVolume": sum(item["fitsBuildVolumeAfterOrientation"] for item in stl_checks),
            "printPlates": len(print_plates),
            "validPrintPlates": sum(item["fitsBuildVolume"] for item in print_plates),
        },
        "pass": (
            not (REQUIRED_FAMILIES - represented)
            and all(item["validBRep"] and item["volumeMm3"] > 0 for item in cad_checks)
            and all(
                item["watertight"]
                and item["windingConsistent"]
                and item["positiveVolume"]
                and item["fitsBuildVolumeAfterOrientation"]
                for item in stl_checks
            )
            and all(item["fitsBuildVolume"] for item in print_plates)
        ),
        "engineeringBoundary": config["engineeringBoundary"],
    }
    (OUTPUT / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")
    print_pack = create_print_pack()
    validation["printPack"] = {
        "path": print_pack.name,
        "bytes": print_pack.stat().st_size,
    }
    (OUTPUT / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(print_pack, ROOT / "public/assets/EXO_FORGE_CAD_V02_PRINT_PACK.zip")
    shutil.copy2(OUTPUT / "validation.json", ROOT / "public/assets/exo-forge-cad-v02-validation.json")
    return validation


def main() -> None:
    config = load_config()
    parts, placements, derived = build_parts(config)
    validation = export_all(parts, placements, config, derived)
    summary = validation["summary"]
    print(json.dumps({
        "revision": validation["revision"],
        "parts": summary["partFiles"],
        "validBRep": summary["validBRep"],
        "watertightStl": summary["watertightStl"],
        "fitsBuildVolume": summary["fitsBuildVolume"],
        "moduleFamilies": len(validation["moduleFamilies"]),
        "pass": validation["pass"],
        "output": str(OUTPUT),
    }, ensure_ascii=False, indent=2))
    if not validation["pass"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
