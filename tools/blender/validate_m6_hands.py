import bpy,json,math
from pathlib import Path
from mathutils import Vector,Quaternion
OUT=Path('/tmp/exo-m6-hands');r=json.loads((OUT/'rig.json').read_text());bpy.ops.wm.open_mainfile(filepath=str(OUT/'EXO_ATLAS_R04_MOTION_M6.blend'));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
def b(v):return Vector((v[0],-v[2],v[1]))
def posebone(name,axis,angle):rig.pose.bones[name].rotation_quaternion=Quaternion(Vector(axis),angle)
def point(bone,rest):return rig.matrix_world@rig.pose.bones[bone].matrix@(rig.data.bones[bone].matrix_local.inverted()@b(rest))
worst=0;tip_worst=0;k=r['fingerSolver']
for grip in [i/100 for i in range(101)]:
 radius=k['closedRadius']+(k['openRadius']-k['closedRadius'])*grip;dx=radius-k['baseRadial'];dz=k['contactAxial']-k['baseAxial'];a=k['proxLength'];bb=k['distLength'];q2=-math.acos((dx*dx+dz*dz-a*a-bb*bb)/(2*a*bb));q1=math.atan2(dx,dz)-math.atan2(bb*math.sin(q2),a+bb*math.cos(q2))
 for side in ['L','R']:
  for f in r['mechanical'][side]['fingers']:
   for bone,ang in zip(f['bones'],[q1-k['proxRestAngle'],q2-k['distRestAngle']]):posebone(bone,f['rotationAxis'],ang)
  bpy.context.view_layer.update();points=[point(f['bones'][1],f['restContact']) for f in r['mechanical'][side]['fingers']];centre=sum(points,Vector())/3;goal=b(r['mechanical'][side]['contactCentre']);worst=max(worst,(centre-goal).length)
  for p,f in zip(points,r['mechanical'][side]['fingers']):tip_worst=max(tip_worst,(p-goal-b(f['radialAxis'])*radius).length)
body=next(o for o in bpy.data.objects if o.name=='HUMAN__human__C__07__skin');err=0;influences=0;bad=0
for v in body.data.vertices:
 ws=[g.weight for g in v.groups if g.weight>1e-6];err=max(err,abs(sum(ws)-1));influences=max(influences,len(ws));bad+=len(ws)==0
assert worst<.000001 and tip_worst<.000001
assert bad==0 and err<.00001 and influences<=4
assert len(rig.data.bones)==73 and len(body.data.vertices)==47300
report={'status':'PASS','samplesPerHand':101,'maxMeanContactErrorMetres':worst,'maxIndividualContactErrorMetres':tip_worst,'maxWeightSumError':err,'maxVertexInfluences':influences,'unweightedVertices':bad,'bones':len(rig.data.bones),'humanBodyVerticesPreserved':len(body.data.vertices),'scope':'Bone hierarchy, contact-centre kinematics and weights. Rendered hand samples reviewed separately. Not self-collision, load or hardware validation.'}
(OUT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
