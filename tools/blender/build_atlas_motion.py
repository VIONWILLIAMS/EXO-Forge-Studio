"""Create a display-only articulation rig from the preserved R04 master.

CAD solids stay rigid. Only the operator and flexible service loops are skinned.
This is a presentation rig, not a controller or a validated mechanical assembly.
"""
from pathlib import Path
from collections import defaultdict
import bpy, json, math
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/v04/motion-m3'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/source/v04/EXO_ATLAS_R04.blend'))

# Parallel rest axes simplify runtime pitch rotations. Coordinates: metres, Z up.
BONES = {
    'pelvis': ((0, 0, .947), None),
    'torso': ((0, 0, 1.08), 'pelvis'),
    'head': ((0, -.015, 1.505), 'torso'),
}
for s, tag in [(-1, 'L'), (1, 'R')]:
    BONES.update({
        'thigh_'+tag: ((s*.110, 0, .947), 'pelvis'),
        'shin_'+tag: ((s*.110, -.004, .478), 'thigh_'+tag),
        'foot_'+tag: ((s*.110, -.003, .112), 'shin_'+tag),
        'arm_'+tag: ((s*.1761, -.0153, 1.432), 'torso'),
        'forearm_'+tag: ((s*.2403, -.0139, 1.2018), 'arm_'+tag),
        'exoshoulder_'+tag: ((s*.305, .159, 1.400), 'torso'),
        'exoarm_'+tag: ((s*.380, .095, 1.425), 'exoshoulder_'+tag),
        'exoforearm_'+tag: ((s*.441, .020, 1.086), 'exoarm_'+tag),
    })
    elbow=Vector((s*.441,.020,1.086));wrist=Vector((s*.440,-.268,.974))
    axis=(wrist-elbow).normalized()
    BONES['exoroll_'+tag]=(tuple(elbow+axis*.062),'exoforearm_'+tag)
    BONES['exowrist_'+tag]=(tuple(wrist),'exoroll_'+tag)
    for dx,label in [(-.030,'minus'),(.030,'plus')]:
        BONES['jaw_'+label+'_'+tag]=(tuple(wrist+axis*.094+Vector((dx,0,0))),'exowrist_'+tag)

# Presentation-only wrist adapter: the original CAD has a gap between its
# orthogonal wrist hub, tool flange and palm. Keep that CAD untouched, but make
# the display articulation visibly connected while pitching/yawing the hand.
def adapter_material(name, color, metal):
    material=bpy.data.materials.new(name);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=.32
    return material

adapter_steel=adapter_material('M3 wrist adapter titanium',(.36,.43,.49),.75)
adapter_dark=adapter_material('N3 wrist adapter graphite',(.055,.075,.09),.45)
for s,side in [(-1,'L'),(1,'R')]:
    wrist=Vector((s*.440,-.268,.974));axis=(wrist-Vector((s*.441,.020,1.086))).normalized()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.024,location=wrist)
    ball=bpy.context.object;ball.name='A04_M3_WRIST_BALL_'+side;ball.data.materials.append(adapter_steel)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.016,depth=.080,location=wrist+axis*.038)
    neck=bpy.context.object;neck.name='A04_M3_WRIST_NECK_'+side;neck.rotation_mode='QUATERNION';neck.rotation_quaternion=Vector((0,0,1)).rotation_difference(axis)
    neck.data.materials.append(adapter_dark)
    for obj in [ball,neck]:
        obj['module']='A04';obj['layer']='articulation';obj['side']=side;obj['cadPart']=obj.name
        obj['displayOnlyAddition']=True
        for face in obj.data.polygons:face.use_smooth=True

def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)

def mix(a, b, t):
    return {k: (1-t)*a.get(k, 0)+t*b.get(k, 0) for k in set(a)|set(b)}

def body_weights(v, arm_side=None):
    x,y,z = v; side = 'L' if x<0 else 'R'
    if z>1.49:
        return mix({'torso':1}, {'head':1}, smooth((z-1.49)/.05))
    torso = mix({'pelvis':1}, {'torso':1}, smooth((z-.97)/.19))
    if arm_side:
        # Membership follows the connected arm surface, not a height mask that
        # could jump from forearm to torso when the elbow is bent.
        sign=-1 if arm_side=='L' else 1
        elbow=Vector((sign*.2403,-.0139,1.2018))
        direction=Vector((sign*.069,-.1706,-.1504)).normalized()
        along=(Vector(v)-elbow).dot(direction)
        fore=smooth((along+.045)/.09)
        arm=smooth((abs(x)-.174)/.060) if z>1.34 else 1.
        return mix(torso, {'arm_'+arm_side:1-fore,'forearm_'+arm_side:fore},arm)
    if z<1.01:
        shin = 1-smooth((z-.424)/.108)
        foot = 1-smooth((z-.112)/.075)
        leg = mix({'thigh_'+side:1-shin, 'shin_'+side:shin}, {'foot_'+side:1}, foot)
        return mix(torso, leg, 1-smooth((z-.81)/.20))
    return torso

def connected_arm_vertices(o):
    if len(o.data.vertices)<10000:return {}
    adjacency=defaultdict(list)
    for e in o.data.edges:
        a,b=e.vertices;adjacency[a].append(b);adjacency[b].append(a)
    result={}
    for sign,side in [(-1,'L'),(1,'R')]:
        wrist=Vector((sign*.309,-.1845,1.0514))
        allowed={v.index for v in o.data.vertices if sign*v.co.x>.178 and v.co.z>.85}
        seed=min(allowed,key=lambda i:(o.data.vertices[i].co-wrist).length_squared)
        seen={seed};pending=[seed]
        while pending:
            current=pending.pop()
            for i in adjacency[current]:
                if i in allowed and i not in seen:seen.add(i);pending.append(i)
        for i in seen:result[i]=side
        print(f'{side} connected arm vertices: {len(seen)}',flush=True)
    return result

def binding(o, centre):
    mod = str(o.get('module', '')); part = str(o.get('cadPart', o.name))
    x,y,z = centre; side = 'L' if x<0 else 'R'
    if mod=='HUMAN':
        if 'BOOT' in o.name: return 'foot_'+side
        if 'EYE' in o.name or 'IRIS' in o.name: return 'head'
        return 'skin'
    if mod=='H02': return ('thigh_' if z>.48 else 'shin_')+side
    if mod=='H03': return 'pelvis'
    if mod=='L01': return 'thigh_'+side
    if mod=='L02': return ('shin_' if z<.48 else 'thigh_')+side
    if mod in ('L03','L04'): return 'shin_'+side
    if mod=='L05': return ('foot_' if 'FORK' in part or 'AXLE' in part else 'shin_')+side
    if mod=='L06': return 'foot_'+side
    if mod=='A01': return 'torso' if part=='A01_YAW_BASE' else 'exoshoulder_'+side
    if mod=='A02': return 'exoarm_'+side
    if mod=='A03': return 'exoforearm_'+side
    if mod=='A04':
        if part.startswith('A04_M3_WRIST_'): return 'exowrist_'+side
        if part in ('A04_PARALLEL_JAW','A04_CONTACT_PAD'):
            # Keep each pad on its own jaw; grouping by material used to fuse both fingers.
            jaw='minus' if x < (-.440 if side=='L' else .440) else 'plus'
            return 'jaw_'+jaw+'_'+side
        if part in ('A04_TOOL_FLANGE','A04_PALM'): return 'exowrist_'+side
        return 'exoroll_'+side
    if mod=='P02' and ('WRIST' in part or 'WRIST' in o.name): return 'pelvis'
    if mod in ('F03','P03'): return 'pelvis'
    if mod=='P04' and o.type=='CURVE': return 'cable'
    return 'torso'

def cable_weights(v):
    x,y,z=v; side='L' if x<0 else 'R'
    if abs(x)>.29 and z<1.43:
        upper=smooth((z-1.065)/.18)
        return {'exoarm_'+side:upper, 'exoforearm_'+side:1-upper}
    if z<.94 and abs(x)>.12:
        return body_weights(v)
    return {'torso':1}

# Remove presentation lighting and the previous landmark-only, unbound rig.
for o in list(bpy.context.scene.objects):
    if not o.get('module') and o.name!='HARNESS_FLAT_SECTION':
        bpy.data.objects.remove(o, do_unlink=True)

buckets=defaultdict(list)
for o in list(bpy.context.scene.objects):
    if o.type not in {'MESH','CURVE','FONT'} or not o.get('module'): continue
    centre = o.matrix_world @ (sum((Vector(c) for c in o.bound_box),Vector())/8)
    bind = binding(o,centre)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH'); o=bpy.context.object
    # A world-space rest mesh retains the original CAD shape and coordinates.
    o.data=o.data.copy()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o['motionBinding']=bind
    key=(o.get('module'),o.get('layer'),o.get('side','C'),o.data.materials[0].name,bind)
    buckets[key].append(o)

objects=[]
for (module,layer,side,material,bind),items in buckets.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    if len(items)>1:bpy.ops.object.join()
    o=bpy.context.object; o.name=f'{module}__{layer}__{side}__{material[:2]}__{bind}'
    o['module']=module; o['layer']=layer; o['side']=side; o['motionBinding']=bind
    objects.append(o)

rig_data=bpy.data.armatures.new('ATLAS_MOTION_SKELETON')
rig=bpy.data.objects.new('ATLAS_MOTION_RIG',rig_data)
bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
bpy.context.view_layer.objects.active=rig; bpy.ops.object.mode_set(mode='EDIT')
for name,(pos,parent) in BONES.items():
    bone=rig_data.edit_bones.new(name);bone.head=pos;bone.tail=Vector(pos)+Vector((0,0,.05))
    if parent:bone.parent=rig_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

weighted=0;bad=0
for o in objects:
    bind=o['motionBinding']
    if bind in ('skin','cable'):
        groups={name:o.vertex_groups.new(name=name) for name in BONES}
        arm_vertices=connected_arm_vertices(o) if bind=='skin' else {}
        for v in o.data.vertices:
            ws=body_weights(v.co,arm_vertices.get(v.index)) if bind=='skin' else cable_weights(v.co)
            ws={k:w for k,w in ws.items() if w>1e-6}; total=sum(ws.values())
            if not math.isfinite(total) or total<=0:bad+=1;continue
            for name,w in ws.items():groups[name].add([v.index],w/total,'REPLACE')
            weighted+=1
        modifier=o.modifiers.new('Motion display skin','ARMATURE');modifier.object=rig
        o.parent=rig
    else:
        # Rigid parts are parented to an empty at the bone origin after export;
        # bone parenting is exported as a standard glTF node hierarchy.
        world=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone=bind
        bpy.context.view_layer.update();o.matrix_world=world

assert bad==0, f'{bad} invalid skin weights'
source=ROOT/'assets/source/v04/EXO_ATLAS_R04_MOTION_M3.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'atlas-motion.glb'),export_format='GLB',use_selection=True,
    export_extras=True,export_yup=True,export_materials='EXPORT',export_animations=False,
    export_skins=True,export_all_influences=False)
report={'revision':'R04-M3','purpose':'display-only articulation; not hardware control or validated joint ranges',
    'bones':{k:{'rest':[v[0][0],v[0][2],-v[0][1]],'parent':v[1]} for k,v in BONES.items()},
    'weightedVertices':weighted,'invalidWeights':bad,'rigidMeshes':sum(o['motionBinding'] not in ('skin','cable') for o in objects),
    'meshObjects':len(objects),'bytes':(OUT/'atlas-motion.glb').stat().st_size,
    'source':'assets/source/v04/EXO_ATLAS_R04_MOTION_M3.blend','cadGeometryChanged':False,
    'articulation':'shoulder yaw/lift/spread, elbow, axial forearm roll, wrist pitch/yaw, parallel jaw translation',
    'displayOnlyAdditions':['wrist spherical adapter and connecting neck; no production joint design']}
(OUT/'rig.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
