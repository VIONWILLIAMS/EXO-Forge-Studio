"""EXO Forge Studio V0.1 — deterministic Blender 5 source/model builder.

Creates an engineering concept digital mockup in meter units. It is not a
manufacturing CAD model and intentionally contains no FEA or certified data.
"""
import bpy
import bmesh
import math
import json
import os
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLIC = os.path.join(ROOT, 'public', 'assets')
SOURCE = os.path.join(ROOT, 'assets', 'source')
RENDERS = os.path.join(ROOT, 'artifacts', 'renders')
ARTIFACTS = os.path.join(ROOT, 'artifacts')
for folder in (PUBLIC, SOURCE, RENDERS, ARTIFACTS): os.makedirs(folder, exist_ok=True)

# ---------- scene and material helpers ----------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'METERS'
scene.unit_settings.scale_length = 1.0
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.color = (0.008, 0.011, 0.012)
scene.render.filepath = RENDERS

def material(name, rgba, metallic=0.0, roughness=0.45, emission=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = 5.0
    return m

MAT = {
    'titanium': material('M_Titanium_BeadBlast', (0.42,0.48,0.50,1), .82, .24),
    'titanium_dark': material('M_Titanium_Dark', (0.18,0.22,0.23,1), .78, .26),
    'carbon': material('M_CarbonFiber', (0.025,0.035,0.038,1), .34, .31),
    'polymer': material('M_BlackPolymer', (0.018,0.024,0.026,1), .08, .48),
    'orange': material('M_SafetyOrange', (1.0,.21,.025,1), .32, .28),
    'rubber': material('M_Rubber', (.012,.015,.016,1), .0, .84),
    'cloth': material('M_WorkwearGraphite', (.055,.075,.082,1), .0, .78),
    'cloth2': material('M_WorkwearReinforced', (.028,.04,.044,1), .0, .66),
    'skin': material('M_HumanNeutral', (.28,.19,.15,1), .0, .64),
    'light_green': material('M_StatusGreen', (.015,.22,.09,1), .05, .2, (0.03,1.0,.35,1)),
    'light_cyan': material('M_StatusCyan', (.01,.16,.20,1), .05, .18, (.03,.7,1.0,1)),
    'warning': material('M_WarningLabel', (.95,.55,.03,1), .05, .38),
    'crate': material('M_LoadCrate', (.34,.18,.07,1), .05, .58),
}

def tag(obj, family=None, side='C', detail=False, exportable=True, safety=None):
    obj['exportable'] = exportable
    obj['lod_detail'] = detail
    if family: obj['module_family'] = family
    obj['side'] = side
    if safety: obj['safety_labels'] = safety
    return obj

def finish_mesh(obj, mat, bevel=0.006, detail=False, family=None, side='C', exportable=True):
    if mat: obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new('Manufacturing edge radius', 'BEVEL')
        mod.width = bevel; mod.segments = 2
    for poly in obj.data.polygons: poly.use_smooth = False
    tag(obj, family, side, detail, exportable)
    return obj

def cube(name, loc, dims, mat, bevel=.008, parent=None, family=None, side='C', detail=False, exportable=True):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj=bpy.context.object; obj.name=name; obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish_mesh(obj,mat,bevel,detail,family,side,exportable)
    if parent: parent_keep(obj,parent)
    return obj

def cylinder(name, loc, radius, depth, mat, rotation=(0,0,0), vertices=32, parent=None, family=None, side='C', detail=False, exportable=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj=bpy.context.object; obj.name=name
    finish_mesh(obj,mat,.0025 if detail else .004,detail,family,side,exportable)
    if parent: parent_keep(obj,parent)
    return obj

def sphere(name, loc, radius, mat, parent=None, detail=False, exportable=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24 if not detail else 16, ring_count=12, radius=radius, location=loc)
    obj=bpy.context.object; obj.name=name; obj.data.materials.append(mat); tag(obj,None,'C',detail,exportable)
    for p in obj.data.polygons: p.use_smooth=True
    if parent: parent_keep(obj,parent)
    return obj

def torus(name, loc, major, minor, mat, rotation=(0,0,0), parent=None, family=None, side='C', detail=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=28, minor_segments=8, location=loc, rotation=rotation)
    obj=bpy.context.object; obj.name=name; obj.data.materials.append(mat); tag(obj,family,side,detail,True)
    if parent: parent_keep(obj,parent)
    return obj

def empty(name, loc, family=None, side='C', parent=None):
    obj=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(obj); obj.location=loc; tag(obj,family,side,False,True)
    if family: obj['local_axis'] = {'H01':'0,1,0','H02':'0,1,0','H03':'0,0,1','F01':'1,0,0','F02':'0,1,0','F03':'1,0,0','L01':'1,0,0','L02':'0,1,0','L03':'1,0,0','L04':'0,1,0','L05':'1,0,0','L06':'0,0,1','A01':'1,0,0','A02':'0,1,0','A03':'1,0,0','A04':'0,0,1','P01':'0,0,1','P02':'0,1,0','P03':'1,0,0','P04':'0,1,0'}[family]
    if parent: parent_keep(obj,parent)
    return obj

def parent_keep(obj,parent):
    world=obj.matrix_world.copy(); obj.parent=parent; obj.matrix_world=world

def beam(name, start, end, radius, mat, parent=None, family=None, side='C', detail=False):
    a,b=Vector(start),Vector(end); delta=b-a; mid=(a+b)*.5
    obj=cylinder(name,mid,radius,delta.length,mat,vertices=24 if not detail else 12,parent=None,family=family,side=side,detail=detail)
    obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(delta.normalized())
    if parent: parent_keep(obj,parent)
    return obj

def cable(name, points, radius, mat, parent=None, family='P04', side='C'):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=2; curve.bevel_depth=radius; curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for point,coord in zip(spline.bezier_points,points): point.co=coord; point.handle_left_type='AUTO'; point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(obj); curve.materials.append(mat); tag(obj,family,side,True,True)
    if parent: parent_keep(obj,parent)
    return obj

def joint_details(root, family, side, radius=.085, axis='Y'):
    rot=(math.pi/2,0,0) if axis=='Z' else (0,0,math.pi/2) if axis=='X' else (0,0,0)
    p=root.location
    cylinder(root.name+'_MOTOR',p,radius,radius*.82,MAT['orange'],rot,36,root,family,side)
    cylinder(root.name+'_REDUCER',p,radius*.76,radius*.98,MAT['titanium_dark'],rot,32,root,family,side)
    torus(root.name+'_BRAKE_RING',p,radius*.78,radius*.075,MAT['carbon'],rot,root,family,side,True)
    # six real fasteners, deliberately omitted from LOD
    for i in range(6):
        angle=2*math.pi*i/6
        if axis=='Z': pos=(p.x+math.cos(angle)*radius*.57,p.y+math.sin(angle)*radius*.57,p.z+radius*.46)
        else: pos=(p.x+math.cos(angle)*radius*.57,p.y+radius*.46,p.z+math.sin(angle)*radius*.57)
        cylinder(root.name+f'_FASTENER_{i+1:02d}',pos,.006,.008,MAT['titanium'],rot,12,root,family,side,True)
    led=sphere(root.name+'_STATUS_LED',(p.x,p.y+radius*.7,p.z+radius*.42),.009,MAT['light_green'],root,True)
    led['sensor_type']='joint_health'

def label_plate(name, loc, dims, text_tag, parent=None):
    obj=cube(name,loc,dims,MAT['warning'],.001,parent,detail=True)
    obj['label']=text_tag; return obj

# ---------- root engineering metadata ----------
root=empty('EXO_FORGE_V0_1',(0,0,0))
root['product']='EXO Forge Studio V0.1'
root['design_status']='Concept engineering digital mockup; non-FEA; non-certified'
root['units']='meters'
root['human_height_mm']=1750
root['human_height_range_mm']='1650..1850'
root['shoulder_frame_mm']=760
root['pelvis_ring_mm']=520
root['external_arm_reach_mm']=1000
root['foot_plate_mm']='360x180'
root['outrigger_span_mm']=1200
root['concept_load_case']='two-arm static 50 kg at 500 mm'

# ---------- industrial digital human and armature ----------
arm_data=bpy.data.armatures.new('HUMAN_ARMATURE_DATA'); arm=bpy.data.objects.new('HUMAN_ARMATURE',arm_data); bpy.context.collection.objects.link(arm); arm.show_in_front=True; tag(arm,None,'C',False,True); parent_keep(arm,root)
bpy.context.view_layer.objects.active=arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
bones=[('pelvis',(0,.88,0),(0,1.02,0),None),('spine',(0,1.02,0),(0,1.48,0),'pelvis'),('head',(0,1.48,0),(0,1.74,0),'spine')]
for side,sgn in [('L',-1),('R',1)]:
    bones += [(f'thigh.{side}',(sgn*.13,.92,0),(sgn*.13,.52,0),'pelvis'),(f'shin.{side}',(sgn*.13,.52,0),(sgn*.13,.10,0),f'thigh.{side}'),(f'foot.{side}',(sgn*.13,.10,0),(sgn*.13,.06,-.24),f'shin.{side}'),(f'upper_arm.{side}',(sgn*.21,1.43,0),(sgn*.28,1.12,-.04),'spine'),(f'forearm.{side}',(sgn*.28,1.12,-.04),(sgn*.29,.86,-.16),f'upper_arm.{side}')]
for name,head,tail,parent in bones:
    b=arm_data.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=arm_data.edit_bones.get(parent)
bpy.ops.object.mode_set(mode='OBJECT'); arm.select_set(False)

# Mannequin body, workwear and PPE (component geometry parented to actual rig object)
sphere('DIGITAL_HUMAN_HEAD',(0,1.64,0),.105,MAT['skin'],arm)
cylinder('DIGITAL_HUMAN_NECK',(0,1.50,0),.055,.11,MAT['cloth2'],parent=arm)
cube('DIGITAL_HUMAN_TORSO',(0,1.27,0),(.38,.43,.20),MAT['cloth'],.055,arm)
cube('DIGITAL_HUMAN_PELVIS',(0,.98,0),(.34,.18,.19),MAT['cloth2'],.04,arm)
for side,sgn in [('L',-1),('R',1)]:
    beam(f'DIGITAL_HUMAN_THIGH_{side}',(sgn*.13,.94,0),(sgn*.13,.53,0),.067,MAT['cloth'],arm)
    beam(f'DIGITAL_HUMAN_SHIN_{side}',(sgn*.13,.50,0),(sgn*.13,.12,-.025),.058,MAT['cloth2'],arm)
    cube(f'DIGITAL_HUMAN_BOOT_{side}',(sgn*.13,.07,-.105),(.13,.10,.29),MAT['rubber'],.03,arm)
    beam(f'DIGITAL_HUMAN_UPPER_ARM_{side}',(sgn*.20,1.42,0),(sgn*.28,1.15,-.04),.054,MAT['cloth'],arm)
    beam(f'DIGITAL_HUMAN_FOREARM_{side}',(sgn*.28,1.13,-.04),(sgn*.28,.91,-.18),.047,MAT['cloth2'],arm)
    sphere(f'DIGITAL_HUMAN_GLOVE_{side}',(sgn*.28,.87,-.21),.055,MAT['rubber'],arm)
# Helmet shell and visor
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.122, location=(0,1.685,0))
helmet=bpy.context.object; helmet.name='DIGITAL_HUMAN_HELMET'; helmet.scale.z=.64; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); helmet.data.materials.append(MAT['orange']); tag(helmet,None,'C',False,True); parent_keep(helmet,arm)
cube('DIGITAL_HUMAN_VISOR',(0,1.65,-.102),(.15,.07,.025),MAT['carbon'],.01,arm)

# ---------- torso load path F01-F03 ----------
F01=empty('F01_SHOULDER_FRAME',(0,1.49,.055),'F01','C',root); F01['parameter_range_mm']='680..840'; F01['safety_labels']='STRUCTURAL_PATH,LIFT_POINT'
cube('F01_CROSSBEAM',(0,1.49,.055),(.76,.075,.12),MAT['titanium'],.012,F01,'F01')
for sgn,side in [(-1,'L'),(1,'R')]:
    cube(f'F01_END_BLOCK_{side}',(sgn*.36,1.49,.055),(.11,.15,.17),MAT['orange'],.018,F01,'F01',side)
    torus(f'F01_LIFT_EYE_{side}',(sgn*.27,1.55,.055),.035,.008,MAT['titanium_dark'],(math.pi/2,0,0),F01,'F01',side,True)
F02=empty('F02_SPINE_RAIL',(0,1.22,.14),'F02','C',F01); F02['parameter_range_mm']='420..610'; F02['safety_labels']='TELESCOPIC,PINCH_GUARD'
cube('F02_OUTER_RAIL',(0,1.23,.14),(.13,.52,.105),MAT['carbon'],.012,F02,'F02')
F02S=empty('F02_SPINE_SLIDER',(0,1.37,.14),'F02','C',F02)
cube('F02_INNER_SLIDER',(0,1.38,.14),(.09,.28,.075),MAT['titanium'],.008,F02S,'F02')
for y in (1.08,1.18,1.28,1.38): cylinder('F02_LOCK_PIN_'+str(int(y*100)),(.072,y,.14),.011,.028,MAT['orange'],(0,math.pi/2,0),16,F02,'F02','C',True)
F03=empty('F03_PELVIS_RING',(0,.95,.055),'F03','C',F02); F03['parameter_range_mm']='460..600'; F03['safety_labels']='STRUCTURAL_PATH,BODY_CLEARANCE'
cube('F03_REAR_BEAM',(0,.96,.125),(.52,.11,.12),MAT['titanium'],.014,F03,'F03')
for sgn,side in [(-1,'L'),(1,'R')]: beam(f'F03_SIDE_RAIL_{side}',(sgn*.24,.96,.12),(sgn*.29,.92,-.08),.035,MAT['titanium'],F03,'F03',side)

# ---------- human interfaces H01-H03 ----------
H01=empty('H01_HARNESS',(0,1.26,-.11),'H01','C',F02); H01['parameter_range_mm']='chest 820..1180'; H01['safety_labels']='BODY_CONTACT,QUICK_RELEASE'
for sgn,side in [(-1,'L'),(1,'R')]:
    beam(f'H01_CHEST_STRAP_{side}',(sgn*.18,1.42,-.10),(sgn*.12,1.12,-.13),.017,MAT['orange'],H01,'H01',side)
    cube(f'H01_QUICK_RELEASE_{side}',(sgn*.115,1.26,-.145),(.055,.085,.035),MAT['warning'],.007,H01,'H01',side,True)

# ---------- lower limbs L01-L06 plus H02 ----------
LEG_ROOTS={}
for sgn,side in [(-1,'L'),(1,'R')]:
    L01=empty(f'L01_{side}',(sgn*.27,.94,.02),'L01',side,F03); L01['joint_axis']='X'; L01['joint_range_deg']='-30..100'; L01['safety_labels']='ACTIVE_JOINT,MECHANICAL_STOP'; joint_details(L01,'L01',side,.09,'Z')
    L02=empty(f'L02_{side}',(sgn*.27,.90,.02),'L02',side,L01); L02['parameter_range_mm']='360..520'
    beam(f'L02_THIGH_RAIL_{side}',(sgn*.27,.88,.02),(sgn*.27,.55,.00),.044,MAT['titanium'],L02,'L02',side)
    cube(f'L02_TELESCOPIC_SLEEVE_{side}',(sgn*.27,.71,.01),(.12,.18,.12),MAT['carbon'],.012,L02,'L02',side)
    H02=empty(f'H02_{side}',(sgn*.27,.72,-.04),'H02',side,L02); H02['safety_labels']='BODY_CONTACT,PINCH_GUARD'
    torus(f'H02_PAD_RING_{side}',(sgn*.27,.72,-.04),.075,.018,MAT['orange'],(math.pi/2,0,0),H02,'H02',side)
    L03=empty(f'L03_{side}',(sgn*.27,.50,0),'L03',side,L02); L03['joint_axis']='X'; L03['joint_range_deg']='0..120'; L03['safety_labels']='ACTIVE_JOINT,MECHANICAL_STOP'; joint_details(L03,'L03',side,.078,'Z')
    L04=empty(f'L04_{side}',(sgn*.27,.46,0),'L04',side,L03); L04['parameter_range_mm']='340..500'
    beam(f'L04_SHIN_RAIL_{side}',(sgn*.27,.44,0),(sgn*.27,.12,-.02),.039,MAT['titanium'],L04,'L04',side)
    cube(f'L04_GUARD_{side}',(sgn*.27,.29,-.045),(.13,.22,.08),MAT['carbon'],.025,L04,'L04',side)
    L05=empty(f'L05_{side}',(sgn*.27,.09,-.02),'L05',side,L04); L05['joint_axis']='X+Z'; L05['joint_range_deg']='-25..25'; joint_details(L05,'L05',side,.061,'Z')
    L06=empty(f'L06_{side}',(sgn*.27,.04,-.10),'L06',side,L05); L06['parameter_range_mm']='360x180'; L06['safety_labels']='GROUND_CONTACT,NON_SLIP'
    cube(f'L06_FOOT_PLATE_{side}',(sgn*.27,.035,-.12),(.18,.065,.36),MAT['carbon'],.025,L06,'L06',side)
    cube(f'L06_RUBBER_SOLE_{side}',(sgn*.27,.008,-.12),(.185,.025,.365),MAT['rubber'],.01,L06,'L06',side)
    for z in (-.23,-.12,-.01): cube(f'L06_TREAD_{side}_{z}',(sgn*.27,-.008,z),(.17,.012,.035),MAT['orange'],.002,L06,'L06',side,True)
    LEG_ROOTS[side]=(L01,L03)

# ---------- external seven-axis arms A01-A04 and H03 masters ----------
ARM_ROOTS={}
for sgn,side in [(-1,'L'),(1,'R')]:
    shoulder=(sgn*.43,1.49,.04); elbow=(sgn*.49,1.04,-.15); wrist=(sgn*.47,.80,-.48)
    A01=empty(f'A01_{side}',shoulder,'A01',side,F01); A01['joint_axis']='XYZ'; A01['joint_range_deg']='pitch -90..120,yaw -85..85'; A01['safety_labels']='ACTIVE_JOINT,BRAKE'; joint_details(A01,'A01',side,.112,'Z')
    A02=empty(f'A02_{side}',shoulder,'A02',side,A01); A02['parameter_range_mm']='380..560'; A02['safety_labels']='TELESCOPIC,CABLE_ROUTE'
    beam(f'A02_UPPER_ARM_{side}',shoulder,elbow,.052,MAT['titanium'],A02,'A02',side)
    cube(f'A02_CARBON_SHROUD_{side}',((shoulder[0]+elbow[0])/2,(shoulder[1]+elbow[1])/2,(shoulder[2]+elbow[2])/2),(.13,.23,.13),MAT['carbon'],.025,A02,'A02',side)
    A03=empty(f'A03_{side}',elbow,'A03',side,A02); A03['joint_axis']='XZ'; A03['joint_range_deg']='0..145'; A03['safety_labels']='ACTIVE_JOINT,BRAKE'; joint_details(A03,'A03',side,.09,'Z')
    A04=empty(f'A04_{side}',elbow,'A04',side,A03); A04['joint_axis']='XYZ'; A04['parameter_range_mm']='reach 800..1150'; A04['safety_labels']='QUICK_COUPLER,TOOL_LOCK'
    beam(f'A04_FOREARM_{side}',elbow,wrist,.047,MAT['titanium'],A04,'A04',side)
    joint_details(empty(f'A04_WRIST_AXIS_{side}',wrist,None,side,A04),'A04',side,.062,'X')
    cube(f'A04_QUICK_COUPLER_{side}',(wrist[0],wrist[1],wrist[2]-.08),(.12,.11,.18),MAT['carbon'],.025,A04,'A04',side)
    for finger in (-1,1): cube(f'A04_GRIP_FINGER_{side}_{finger}',(wrist[0]+sgn*0.028,wrist[1]+finger*.055,wrist[2]-.19),(.035,.04,.16),MAT['titanium_dark'],.008,A04,'A04',side,True)
    H03=empty(f'H03_{side}',(sgn*.20,1.38,-.08),'H03',side,F01); H03['safety_labels']='LOW_FORCE_MASTER,E_STOP_REACH'
    beam(f'H03_MASTER_LINK_{side}',(sgn*.20,1.38,-.08),(sgn*.27,1.10,-.18),.018,MAT['orange'],H03,'H03',side)
    sphere(f'H03_CONTROL_GRIP_{side}',(sgn*.27,1.06,-.20),.045,MAT['rubber'],H03)
    ARM_ROOTS[side]=(A01,A03)

# ---------- power, control, deployable supports and utilities ----------
P01=empty('P01_POWER_PACK',(0,1.27,.26),'P01','C',F02); P01['parameter_range_Wh']='1200..3000'; P01['safety_labels']='HIGH_VOLTAGE,THERMAL'
cube('P01_BATTERY_ENCLOSURE',(0,1.27,.27),(.32,.40,.16),MAT['carbon'],.025,P01,'P01')
for i in range(5): cube(f'P01_COOLING_FIN_{i+1}',(-.11+i*.055,1.27,.36),(.012,.30,.055),MAT['titanium_dark'],.002,P01,'P01','C',True)
P02=empty('P02_CONTROL_CORE',(0,1.42,.35),'P02','C',P01); P02['safety_labels']='SIL_CONCEPT,E_STOP'
cube('P02_ECU',(0,1.42,.35),(.20,.13,.055),MAT['orange'],.012,P02,'P02')
for x in (-.06,0,.06): sphere('P02_STATUS_'+str(x),(x,1.43,.382),.011,MAT['light_green' if x<.05 else 'light_cyan'],P02,True)
for sgn,side in [(-1,'L'),(1,'R')]:
    P03=empty(f'P03_{side}',(sgn*.22,.90,.14),'P03',side,F03); P03['parameter_range_mm']='span 760..1400'; P03['safety_labels']='GROUND_CONTACT,DEPLOYMENT_ZONE'
    beam(f'P03_TELESCOPIC_STRUT_{side}',(sgn*.22,.90,.14),(sgn*.60,.06,.16),.034,MAT['orange'],P03,'P03',side)
    beam(f'P03_INNER_STRUT_{side}',(sgn*.38,.54,.15),(sgn*.60,.06,.16),.024,MAT['titanium_dark'],P03,'P03',side)
    cube(f'P03_GROUND_PAD_{side}',(sgn*.60,.035,.16),(.22,.055,.28),MAT['rubber'],.025,P03,'P03',side)
P04=empty('P04_UTILITIES',(0,1.30,.32),'P04','C',P01); P04['safety_labels']='HOT_SURFACE,SERVICE_LOOP'
cable('P04_HV_ARM_L',[(-.11,1.38,.36),(-.30,1.43,.20),(-.48,1.12,-.10)],.009,MAT['orange'],P04,'P04','L')
cable('P04_HV_ARM_R',[(.11,1.38,.36),(.30,1.43,.20),(.48,1.12,-.10)],.009,MAT['orange'],P04,'P04','R')
cable('P04_COOLANT_LEG_L',[(-.08,1.17,.34),(-.20,.90,.20),(-.27,.50,.08)],.007,MAT['polymer'],P04,'P04','L')
cable('P04_COOLANT_LEG_R',[(.08,1.17,.34),(.20,.90,.20),(.27,.50,.08)],.007,MAT['polymer'],P04,'P04','R')
label_plate('P04_HIGH_VOLTAGE_LABEL',(0,1.18,.358),(.12,.055,.006),'HIGH VOLTAGE',P04)

# ---------- task payloads ----------
industrial=empty('TASK_INDUSTRIAL_50KG',(0,0,0),None,'C',root)
cube('TASK_CRATE_50KG',(0,.83,-.56),(.58,.38,.42),MAT['crate'],.025,industrial,exportable=True)
for x in (-.18,.18): cube('TASK_CRATE_STRAP_'+str(x),(x,.83,-.775),(.055,.39,.012),MAT['carbon'],.003,industrial,detail=True)
industrial['task']='50 kg crate, 500 mm reach'; tag(industrial,None,'C',False,True)
rescue=empty('TASK_RESCUE_20KG',(0,0,0),None,'C',root); rescue.hide_render=True
cylinder('TASK_BREAKER_TOOL',(0,.66,-.44),.075,.72,MAT['titanium_dark'],(0,math.pi/2,0),28,rescue)
cube('TASK_BREAKER_MOTOR',(.32,.66,-.44),(.19,.22,.18),MAT['orange'],.02,rescue)
rescue['task']='20 kg rescue breaker, low support'
construction=empty('TASK_CONSTRUCTION_15KG',(0,0,0),None,'C',root); construction.hide_render=True
cube('TASK_OVERHEAD_TOOL',(0,1.95,-.28),(.30,.42,.16),MAT['carbon'],.03,construction)
cylinder('TASK_TOOL_BIT',(0,2.26,-.28),.035,.36,MAT['orange'],vertices=16,parent=construction)
construction['task']='15 kg overhead construction tool'

# ---------- safety labels and detail guards ----------
for side,sgn in [('L',-1),('R',1)]:
    label_plate(f'SAFETY_PINCH_LABEL_{side}',(sgn*.315,.51,-.09),(.055,.09,.006),'PINCH',LEG_ROOTS[side][1])
    cube(f'A03_PINCH_GUARD_{side}',(sgn*.50,1.04,-.15),(.16,.12,.18),MAT['polymer'],.035,ARM_ROOTS[side][1],'A03',side,True)

# ---------- design bay, lights and cameras (not exported) ----------
floor=cube('ENV_FLOOR',(0,-.035,0),(7,.06,7),MAT['polymer'],.005,exportable=False)
for i in range(-30,31):
    cube(f'ENV_GRID_X_{i}',(i*.1,-.003,0),(.002,.003,6),MAT['titanium_dark'],0,exportable=False)
    cube(f'ENV_GRID_Z_{i}',(0,-.002,i*.1),(6,.003,.002),MAT['titanium_dark'],0,exportable=False)
for sgn in (-1,1):
    cube(f'ENV_COLUMN_{sgn}',(sgn*2.25,1.25,-1.4),(.09,2.5,.09),MAT['titanium_dark'],.01,exportable=False)
    cube(f'ENV_SAFETY_BASE_{sgn}',(sgn*2.25,.025,-1.4),(.55,.035,.25),MAT['orange'],.005,exportable=False)

def add_light(name, light_type, loc, energy, color, size=2.0):
    data=bpy.data.lights.new(name,light_type); data.energy=energy; data.color=color
    if light_type=='AREA': data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=loc; tag(obj,None,'C',False,False); return obj
key=add_light('KEY_AREA','AREA',(3.5,4,3.5),1250,(1.0,.88,.76),3.5); key.rotation_euler=(math.radians(27),0,math.radians(135))
fill=add_light('FILL_AREA','AREA',(-3,2.6,2),850,(.42,.75,1.0),3); fill.rotation_euler=(math.radians(55),0,math.radians(-60))
rim=add_light('RIM_AREA','AREA',(0,3,-3),1100,(1.0,.34,.10),2); rim.rotation_euler=(math.radians(-20),0,0)

cam_data=bpy.data.cameras.new('CAMERA_DATA'); cam=bpy.data.objects.new('CAMERA',cam_data); bpy.context.collection.objects.link(cam); scene.camera=cam; cam.data.lens=62; cam.data.sensor_width=36; tag(cam,None,'C',False,False)
def aim_camera(position,target=(0,.9,0),lens=62):
    position=Vector(position); target=Vector(target); forward=(target-position).normalized()
    right=forward.cross(Vector((0,1,0))).normalized(); up=right.cross(forward).normalized()
    cam.data.lens=lens; cam.matrix_world=Matrix.Translation(position) @ Matrix((right,up,-forward)).transposed().to_4x4()

def render(name,position,target=(0,.92,0),lens=62):
    aim_camera(position,target,lens); scene.render.filepath=os.path.join(RENDERS,name+'.png'); bpy.ops.render.render(write_still=True)

def set_scenario(which):
    industrial.hide_render=which!='industrial'; rescue.hide_render=which!='rescue'; construction.hide_render=which!='construction'
    # The source hierarchy keeps every module in its dimensionally auditable
    # baseline position. Runtime presets apply joint poses non-destructively.
    root['active_render_scenario']=which

# Save canonical industrial source, then export Hero and LOD.
set_scenario('industrial')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'exo-forge-v0.1.blend'))

def export_optimized(filepath,lod=False):
    """Batch evaluated geometry by module, side and material for runtime.

    The authored .blend remains fully separated; only export proxies are joined.
    """
    deps=bpy.context.evaluated_depsgraph_get(); groups={}; originals=[]
    for obj in list(scene.objects):
        if obj.type not in ('MESH','CURVE') or not obj.get('exportable',False) or (lod and obj.get('lod_detail',False)): continue
        family=obj.get('module_family') or ('HUMAN' if obj.name.startswith('DIGITAL_HUMAN') else 'TASK' if obj.name.startswith('TASK_') else 'AUX')
        side=obj.get('side','C'); mat=obj.active_material
        groups.setdefault((family,side,mat.name if mat else 'NONE'),[]).append(obj); originals.append(obj)
    roots={}
    for obj in scene.objects:
        if obj.type=='EMPTY' and obj.get('module_family'):
            key=(obj.get('module_family'),obj.get('side','C'))
            if key not in roots or len(obj.name)<len(roots[key].name): roots[key]=obj
    proxies=[]
    for (family,side,mat_name),objects in groups.items():
        bm=bmesh.new()
        for obj in objects:
            evaluated=obj.evaluated_get(deps); mesh=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps)
            mesh.transform(obj.matrix_world); bm.from_mesh(mesh); bpy.data.meshes.remove(mesh)
        out=bpy.data.meshes.new(f'EXP_{family}_{side}_{mat_name}'); bm.to_mesh(out); bm.free(); out.update()
        proxy=bpy.data.objects.new(f'EXP_{family}_{side}_{mat_name}',out); bpy.context.collection.objects.link(proxy); tag(proxy,family if family in [f'H{i:02d}' for i in range(1,4)]+[f'F{i:02d}' for i in range(1,4)]+[f'L{i:02d}' for i in range(1,7)]+[f'A{i:02d}' for i in range(1,5)]+[f'P{i:02d}' for i in range(1,5)] else None,side,False,True)
        if mat_name!='NONE': out.materials.append(bpy.data.materials[mat_name])
        parent=roots.get((family,side),root); parent_keep(proxy,parent); proxies.append(proxy)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if (obj.type in ('EMPTY','ARMATURE') and obj.get('exportable',False)) or obj in proxies: obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=filepath,export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_materials='EXPORT',export_extras=True)
    for proxy in proxies:
        mesh=proxy.data; bpy.data.objects.remove(proxy,do_unlink=True); bpy.data.meshes.remove(mesh)

# Fixed views are rendered one Blender process per view by rebuild_all.sh.
# This avoids a Blender 5/macOS headless multi-render driver stall.
export_optimized(os.path.join(PUBLIC,'exo-forge-hero.glb'),False)
export_optimized(os.path.join(PUBLIC,'exo-forge-lod.glb'),True)

def triangle_count(lod=False):
    total=0
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in scene.objects:
        if obj.type=='MESH' and obj.get('exportable',False) and not (lod and obj.get('lod_detail',False)):
            evaluated=obj.evaluated_get(deps); mesh=evaluated.to_mesh(); mesh.calc_loop_triangles(); total+=len(mesh.loop_triangles); evaluated.to_mesh_clear()
    return total

families=sorted(set(obj.get('module_family') for obj in scene.objects if obj.get('module_family')))
module_nodes=sorted(obj.name for obj in scene.objects if obj.get('module_family') and obj.name.split('_')[0] in families)
export_objs=[obj for obj in scene.objects if obj.get('exportable',False)]
mins=Vector((1e9,1e9,1e9)); maxs=Vector((-1e9,-1e9,-1e9))
for obj in export_objs:
    if obj.type=='MESH':
        for corner in obj.bound_box:
            world=obj.matrix_world@Vector(corner); mins=Vector(map(min,mins,world)); maxs=Vector(map(max,maxs,world))
validation={
    'generator':'tools/blender/build_exo_forge.py','blenderVersion':bpy.app.version_string,'units':'meters','sourceBlend':'assets/source/exo-forge-v0.1.blend',
    'families':families,'familyCount':len(families),'moduleNodes':module_nodes,'heroTriangles':triangle_count(False),'lodTriangles':triangle_count(True),
    'heroBytes':os.path.getsize(os.path.join(PUBLIC,'exo-forge-hero.glb')),'lodBytes':os.path.getsize(os.path.join(PUBLIC,'exo-forge-lod.glb')),
    'boundsMeters':{'min':[round(x,3) for x in mins],'max':[round(x,3) for x in maxs]},
    'materials':sorted(MAT.keys()),'renders':[f'{i:02d}-{n}.png' for i,n in enumerate(['front','side','isometric','exploded','industrial-50kg','rescue-20kg','construction-15kg'],1)],
    'budget':{'heroTrianglesUnder350k':triangle_count(False)<=350000,'lodTrianglesUnder100k':triangle_count(True)<=100000,'heroGlbUnder40MB':os.path.getsize(os.path.join(PUBLIC,'exo-forge-hero.glb'))<=40*1024*1024},
    'engineeringBoundary':'Concept estimate and digital mockup only; not manufacturing CAD, FEA, medical, or safety certification.'
}
with open(os.path.join(ARTIFACTS,'model-validation.json'),'w',encoding='utf-8') as handle: json.dump(validation,handle,ensure_ascii=False,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'exo-forge-v0.1.blend'))
print('EXO_FORGE_BUILD_COMPLETE',json.dumps(validation,ensure_ascii=False))
