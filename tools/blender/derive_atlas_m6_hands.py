"""Derive display hand articulation from the preserved R04-M3 source.
No original assets/CAD files are changed. All units are metres.
Run: Blender -b --python this.py -- --project <EXO root> --out <output directory>
"""
import bpy, sys, json, math, argparse
from pathlib import Path
from collections import defaultdict
from mathutils import Vector, Matrix
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p=argparse.ArgumentParser();p.add_argument('--project',default=str(Path(__file__).resolve().parents[2]));p.add_argument('--out',default='/tmp/exo-m6-hands');a=p.parse_args(args)
ROOT=Path(a.project);OUT=Path(a.out);OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/blender'));import anatomy_r04 as anatomy
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/v04/EXO_ATLAS_R04_MOTION_M3.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
base_bones=set(rig.data.bones.keys()); original_meshes=[o for o in bpy.data.objects if o.type=='MESH']
source_vertices={o.name:len(o.data.vertices) for o in original_meshes}
def gl(v):return [v[0],v[2],-v[1]]
def smooth(t):t=max(0.,min(1.,t));return t*t*(3-2*t)
def material(name,color,metal=0.,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m
mats={'metal':material('M6 Satin titanium',(.38,.46,.53),.78,.29),'dark':material('M6 Anodized graphite',(.04,.057,.068),.56,.3),'rubber':material('M6 Fine grip elastomer',(.025,.033,.035),.0,.72),'mark':material('M6 Lime finger index',(.61,.79,.21),.20,.34)}
# Hand landmarks come from the original CC0 MakeHuman joint markers, transformed
# through the same R04 anatomy function that produced this exact body surface.
vs,fs,groups=anatomy.read_body();landmarks={}
for side,rawside in [('L','r'),('R','l')]:
 for name in ['elbow','hand','hand-2','hand-3']+[f'finger-{d}-{j}' for d in range(1,6) for j in range(1,5)]:
  ids=groups[f'joint-{rawside}-{name}'];raw=tuple(sum(vs[i][k] for i in ids)/len(ids) for k in range(3));landmarks[side,name]=Vector(anatomy.pose(raw))
newbones={};human={};mechanical={}
for side in ['L','R']:
 wrist=landmarks[side,'hand'];axis=(wrist-landmarks[side,'elbow']).normalized();middle=(landmarks[side,'finger-3-1']-wrist).normalized()
 # In this rest pose the palm faces the body midline. Gram-Schmidt gives the
 # orthogonal palm normal used to flex fingers into a relaxed fist.
 palm=Vector((1 if side=='L' else -1,0,0));palm=(palm-middle*palm.dot(middle)).normalized()
 roll='humanroll_'+side;newbones[roll]=(landmarks[side,'elbow']+axis*.042,'forearm_'+side)
 hand='humanhand_'+side;newbones[hand]=(wrist,roll)
 h={'wrist':gl(wrist),'axis':gl(axis),'palmNormal':gl(palm),'handBone':hand,'rollBone':roll,'rollAxis':gl(axis),'wristPitchAxis':gl(middle.cross(palm).normalized()),'wristYawAxis':gl(palm),'fingers':[]}
 for d in range(1,6):
  points=[landmarks[side,f'finger-{d}-{j}'] for j in range(1,5)]
  # Thumb opposition combines a sweep across the palm with modest flexion.
  ddir=(points[-1]-points[0]).normalized();target=(landmarks[side,'finger-4-2']-points[0]).normalized() if d==1 else palm
  curl=ddir.cross(target).normalized()
  names=[]
  for j in range(1,4):
   name=f'humanfinger_{d}_{j}_{side}';newbones[name]=(points[j-1],hand if j==1 else names[-1]);names.append(name)
  h['fingers'].append({'digit':d,'bones':names,'points':list(map(gl,points)),'curlAxis':gl(curl),'relaxedFistDegrees':[36,32,24] if d==1 else [64,82,40], 'restOpenDegrees':[0,0,0]})
 human[side]=h
# Three two-link fingers are arranged at 120 degrees. Their contact centres
# lie on an invariant axial plane; varying aperture changes only radial distance.
PROX=.042;DIST=.038;BASE_Z=.083;BASE_R=.043;TARGET_Z=.148;R_CLOSED=.012;R_OPEN=.061

def finger_angles(radius):
 dx=radius-BASE_R;dz=TARGET_Z-BASE_Z;c=(dx*dx+dz*dz-PROX*PROX-DIST*DIST)/(2*PROX*DIST)
 q2=-math.acos(max(-1,min(1,c)));q1=math.atan2(dx,dz)-math.atan2(DIST*math.sin(q2),PROX+DIST*math.cos(q2));return q1,q2
Q1,Q2=finger_angles(R_OPEN)
for side,s in [('L',-1),('R',1)]:
 wrist=Vector((s*.440,-.268,.974));axis=(wrist-Vector((s*.441,.020,1.086))).normalized();u=Vector((1,0,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u)
 fingers=[]
 for d in range(1,4):
  theta=(d-1)*math.tau/3+math.pi/6;r=u*math.cos(theta)+v*math.sin(theta);t=axis.cross(r)
  base=wrist+axis*BASE_Z+r*BASE_R;direction1=axis*math.cos(Q1)+r*math.sin(Q1);joint=base+direction1*PROX;direction2=axis*math.cos(Q1+Q2)+r*math.sin(Q1+Q2);tip=joint+direction2*DIST
  b1=f'exofinger_{d}_prox_{side}';b2=f'exofinger_{d}_dist_{side}';newbones[b1]=(base,'exowrist_'+side);newbones[b2]=(joint,b1)
  fingers.append({'digit':d,'bones':[b1,b2],'rotationAxis':gl(t),'radialAxis':gl(r),'restBase':gl(base),'restJoint':gl(joint),'restContact':gl(tip),'distalContactLocal':gl(tip-joint),'proxRestAngle':Q1,'distRestAngle':Q2})
 mechanical[side]={'wrist':gl(wrist),'axis':gl(axis),'contactCentre':gl(wrist+axis*TARGET_Z),'fingers':fingers}
# Add new bones with the same parallel rest axes used by M3. Runtime rotations
# are axis-angle quaternions in unrotated glTF XYZ space, applied after the parent.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for name,(point,parent) in newbones.items():
 b=rig.data.edit_bones.new(name);b.head=point;b.tail=point+Vector((0,0,.025));b.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
# Reweight only distal forearm/hand vertices. Existing torso/arms/legs are untouched.
body=max((o for o in bpy.data.objects if o.get('module')=='HUMAN' and o.type=='MESH'),key=lambda o:len(o.data.vertices));new_groups={name:body.vertex_groups.new(name=name) for name in newbones if name.startswith('human')};changed=defaultdict(int)

def segment(p,a,b):
 d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));q=a+d*t;return (p-q).length,t
for vert in body.data.vertices:
 point=vert.co;side='L' if point.x<0 else 'R';wrist=landmarks[side,'hand'];fore=(wrist-landmarks[side,'elbow']).normalized();along=(point-wrist).dot(fore)
 if along<-.034 or (point-wrist).length>.215:continue
 oldweights={body.vertex_groups[g.group].name:g.weight for g in vert.groups}
 if oldweights.get('forearm_'+side,0)<.95:continue
 handamount=smooth((along+.030)/.05)
 if handamount<=0:continue
 best=(1e6,None,None,None)
 for d in range(1,6):
  pts=[landmarks[side,f'finger-{d}-{j}'] for j in range(1,5)]
  for j in range(3):
   dist,t=segment(point,pts[j],pts[j+1])
   if dist<best[0]:best=(dist,d,j,t)
 dist,d,j,t=best;pts=[landmarks[side,f'finger-{d}-{k}'] for k in range(1,5)];direction=(pts[1]-pts[0]).normalized();past=(point-pts[0]).dot(direction)
 # Finger influence starts just before MCP and cannot leak into adjacent palm.
 influence=smooth((past+.007)/.018) if j==0 else 1.
 influence*=1-smooth((dist-.017)/.017)
 ws={'humanhand_'+side:1-influence}
 curr=f'humanfinger_{d}_{j+1}_{side}'
 if j>0 and t<.26:
  w=smooth((t+.26)/.52);ws[curr]=influence*w;ws[f'humanfinger_{d}_{j}_{side}']=influence*(1-w)
 elif j<2 and t>.74:
  w=smooth((t-.74)/.52);ws[curr]=influence*(1-w);ws[f'humanfinger_{d}_{j+2}_{side}']=influence*w
 else:ws[curr]=influence
 for g in list(vert.groups):body.vertex_groups[g.group].remove([vert.index])
 body.vertex_groups['forearm_'+side].add([vert.index],1-handamount,'REPLACE')
 for name,w in ws.items():
  if w>1e-6:new_groups[name].add([vert.index],w*handamount,'REPLACE')
 changed[side]+=1
# Distribute forearm roll from elbow to wrist so pronation twists the forearm
# progressively instead of rotating only a detached wrist.
for vert in body.data.vertices:
 point=vert.co;side='L' if point.x<0 else 'R';elbow=landmarks[side,'elbow'];wrist=landmarks[side,'hand'];axis=(wrist-elbow).normalized();along=(point-elbow).dot(axis)
 fore_group=body.vertex_groups['forearm_'+side]
 old=next((g.weight for g in vert.groups if g.group==fore_group.index),0)
 if old>.00001 and (point-elbow).length<.30:
  twist=smooth((along-.055)/.14)
  fore_group.add([vert.index],old*(1-twist),'REPLACE');new_groups['humanroll_'+side].add([vert.index],old*twist,'REPLACE')
# Detailed human hand surface uses the existing anatomy; a sober charcoal glove
# prevents this from looking like an untextured mitten while preserving all digits.
glove=material('M6 Operator glove knit',(.14,.18,.205),.02,.78);body.data.materials.append(glove);glove_index=len(body.data.materials)-1
for poly in body.data.polygons:
 p=sum((body.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices);side='L' if p.x<0 else 'R';w=landmarks[side,'hand'];axis=(w-landmarks[side,'elbow']).normalized()
 if (p-w).dot(axis)>-.004 and (p-w).length<.21:poly.material_index=glove_index
# Surface-fitted glove cuffs hide the material boundary with a narrow sewn edge.
from mathutils.bvhtree import BVHTree
body_tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
for side in ['L','R']:
 wrist=landmarks[side,'hand'];axis=(wrist-landmarks[side,'elbow']).normalized();u=Vector((1,0,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u);verts=[];faces=[];N=48
 for along,offset in [(-.010,.0005),(-.009,.0014),(.001,.0014),(.002,.0005)]:
  origin=wrist+axis*along
  for i in range(N):
   radial=u*math.cos(math.tau*i/N)+v*math.sin(math.tau*i/N);hit=body_tree.ray_cast(origin,radial,.08)[0];point=hit if hit is not None else origin+radial*.022;verts.append(tuple(point+radial*offset))
 for row in range(3):
  for i in range(N):faces.append((row*N+i,row*N+(i+1)%N,(row+1)*N+(i+1)%N,(row+1)*N+i))
 mesh=bpy.data.meshes.new('M6 Fitted glove cuff '+side);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('HUMAN__M6_FITTED_CUFF_'+side,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(glove)
 for face in mesh.polygons:face.use_smooth=True
 o['module']='HUMAN';o['layer']='human';o['side']=side;o['motionBinding']='humanroll_'+side;o['displayOnlyAddition']=True
 world=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone='humanroll_'+side;bpy.context.view_layer.update();o.matrix_world=world
# Delete only the original two fingers and their obsolete rectangular palm/flange.
removed=[]
for o in list(bpy.data.objects):
 if o.get('module')=='A04' and (str(o.get('motionBinding','')).startswith('jaw_') or (o.get('motionBinding') in ['exowrist_L','exowrist_R'] and o.get('layer')=='frame')):
  removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
parts=[]
def register(o,side,bone,mat,layer='articulation'):
 o.data.materials.append(mat);o['module']='A04';o['layer']=layer;o['side']=side;o['motionBinding']=bone;o['displayOnlyAddition']=True;parts.append(o)
 for f in o.data.polygons:f.use_smooth=True
 return o

def box(name,centre,axes,size,side,bone,mat,bevel=.002):
 bpy.ops.mesh.primitive_cube_add(size=1,location=centre);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Matrix(tuple(zip(*axes))).to_quaternion();o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Small machined edge radii','BEVEL');m.width=bevel;m.segments=3
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 return register(o,side,bone,mat)

def cyl(name,centre,axis,radius,depth,side,bone,mat,n=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=radius,depth=depth,location=centre);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(axis)
 m=o.modifiers.new('Fine edge radii','BEVEL');m.width=.0007;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 return register(o,side,bone,mat)

def torus(name,centre,axis,major,minor,side,bone,mat):
 bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=36,minor_segments=8,location=centre);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(axis);return register(o,side,bone,mat)

for side,s in [('L',-1),('R',1)]:
 wrist=Vector((s*.440,-.268,.974));axis=(wrist-Vector((s*.441,.020,1.086))).normalized();u=Vector((1,0,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u);bone='exowrist_'+side
 cyl('M6_TOOL_TAPER_'+side,wrist+axis*.065,axis,.022,.025,side,bone,mats['metal'],32)
 cyl('M6_TRIPOD_PALM_'+side,wrist+axis*.080,axis,.046,.013,side,bone,mats['dark'],36)
 cyl('M6_PALM_FACE_'+side,wrist+axis*.087,axis,.034,.003,side,bone,mats['metal'],36)
 cyl('M6_PALM_TACTILE_INSERT_'+side,wrist+axis*.0895,axis,.023,.003,side,bone,mats['rubber'],32)
 torus('M6_PALM_INDEX_RING_'+side,wrist+axis*.086,axis,.042,.0012,side,bone,mats['mark'])
 for i in range(6):
  radial=u*math.cos(i*math.tau/6)+v*math.sin(i*math.tau/6)
  cyl('M6_FLANGE_FASTENER_'+side,wrist+axis*.088+radial*.030,axis,.002,.002,side,bone,mats['dark'],12)
 for d in range(1,4):
  theta=(d-1)*math.tau/3+math.pi/6;r=u*math.cos(theta)+v*math.sin(theta);t=axis.cross(r);base=wrist+axis*BASE_Z+r*BASE_R;dir1=axis*math.cos(Q1)+r*math.sin(Q1);joint=base+dir1*PROX;dir2=axis*math.cos(Q1+Q2)+r*math.sin(Q1+Q2);tip=joint+dir2*DIST
  b1=f'exofinger_{d}_prox_{side}';b2=f'exofinger_{d}_dist_{side}'
  # Each phalanx has a rounded chassis, a dark inset, a visible hinge axle,
  # small captive fasteners, and a replaceable textured contact pad.
  for label,origin,direction,length,bind in [('PROX',base,dir1,PROX,b1),('DIST',joint,dir2,DIST,b2)]:
   n=t.cross(direction).normalized();basis=(t,n,direction)
   box(f'M6_{label}_CHASSIS_{d}_{side}',origin+direction*length*.47,basis,(.017,.011,length*.97),side,bind,mats['metal'])
   box(f'M6_{label}_INSET_{d}_{side}',origin+direction*length*.47+n*.006,basis,(.012,.003,length*.62),side,bind,mats['dark'],.001)
   cyl(f'M6_{label}_HINGE_{d}_{side}',origin,t,.008,.022,side,bind,mats['dark'])
   for sign in [-1,1]:cyl(f'M6_{label}_AXLE_CAP_{d}_{side}',origin+t*.0113*sign,t,.0042,.0018,side,bind,mats['metal'],16)
   # One material-per-phalanx stripe instead of detached decorative tubes.
   box(f'M6_{label}_IDENT_{d}_{side}',origin+direction*length*.65+n*.0078,basis,(.010,.001,length*.055),side,bind,mats['mark'],.0003)
  # Inner surface passes through the kinematic contact point exactly.
  box(f'M6_CONTACT_PAD_{d}_{side}',tip+r*.003,(t,r,axis),(.017,.006,.019),side,b2,mats['rubber'],.002)
  for k in range(3):box(f'M6_CONTACT_GROOVE_{d}_{side}',tip+r*.0004+axis*(k-1)*.004,(t,r,axis),(.014,.001,.0007),side,b2,mats['dark'],.0002)
# Batch all subcomponents by side/bone/material, preserving independent motion.
buckets=defaultdict(list)
for o in parts:buckets[o['side'],o['motionBinding'],o.data.materials[0].name].append(o)
for (side,bind,mat),items in buckets.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in items:o.select_set(True)
 bpy.context.view_layer.objects.active=items[0]
 if len(items)>1:bpy.ops.object.join()
 o=bpy.context.object;o.name=f'A04__M6__{side}__{mat.split()[1]}__{bind}';world=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone=bind;bpy.context.view_layer.update();o.matrix_world=world
# Make rigid-parent meshes world-rest coordinates as in the M3 source.
for bone in rig.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0)
bpy.context.view_layer.update()
source=OUT/'EXO_ATLAS_R04_MOTION_M6.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in bpy.data.objects:
 if o.get('module'):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'atlas-motion.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_materials='EXPORT',export_animations=False,export_skins=True,export_all_influences=False)
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.get('module')]
report={'revision':'R04-M6-HANDS','sourceBase':'assets/source/v04/EXO_ATLAS_R04_MOTION_M3.blend','purpose':'display-only articulated anatomy and three-finger gripper; not production CAD or hardware validation','bones':{b.name:{'rest':gl(b.head_local),'parent':b.parent.name if b.parent else None} for b in rig.data.bones},'retiredBones':['jaw_minus_L','jaw_plus_L','jaw_minus_R','jaw_plus_R'],'baseBonesRetained':len(base_bones),'addedBones':len(newbones),'weightedHandVertices':dict(changed),'human':human,'mechanical':mechanical,'fingerSolver':{'proxLength':PROX,'distLength':DIST,'baseAxial':BASE_Z,'baseRadial':BASE_R,'contactAxial':TARGET_Z,'closedRadius':R_CLOSED,'openRadius':R_OPEN,'proxRestAngle':Q1,'distRestAngle':Q2,'gripSemantics':'grip 0=closed, 1=open; radius=closedRadius+(openRadius-closedRadius)*grip','rotation':'q2=-acos((dx²+dz²-L1²-L2²)/(2*L1*L2)); q1=atan2(dx,dz)-atan2(L2*sin(q2),L1+L2*cos(q2)); proximal quaternion=axisAngle(rotationAxis,q1-proxRestAngle); distal=axisAngle(rotationAxis,q2-distRestAngle)'},'removedDisplayMeshes':removed,'meshObjects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'bytes':(OUT/'atlas-motion.glb').stat().st_size,'originalBodyVertexCount':source_vertices[body.name],'bodyVertexCount':len(body.data.vertices),'cadGeometryChanged':False}
(OUT/'rig.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k in ['revision','meshObjects','addedBones','weightedHandVertices','bytes','bodyVertexCount']}),flush=True)
