"""Local shoulder skin-weight candidate. Original vertex positions/materials stay exact."""
import bpy,math,json,hashlib
from pathlib import Path
from collections import defaultdict
OUT=Path('/tmp/exo-m6-hands');bpy.ops.wm.open_mainfile(filepath=str(OUT/'EXO_ATLAS_R04_MOTION_M6.blend'));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=next(o for o in bpy.data.objects if o.name=='HUMAN__human__C__07__skin')
adj=defaultdict(set)
for e in body.data.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
old_positions=[tuple(v.co) for v in body.data.vertices];old_weights=[{body.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-8} for v in body.data.vertices];before={};after={};changed=[]
def smooth(t):t=max(0.,min(1.,t));return t*t*(3-2*t)
for side,sign in [('L',-1),('R',1)]:
 arm='arm_'+side;domain=[v.index for v in body.data.vertices if .135<sign*v.co.x<.29 and 1.23<v.co.z<1.485]
 field={i:old_weights[i].get(arm,0) for i in range(len(body.data.vertices))};orig=field.copy()
 before[side]=max(abs(field[a]-field[b]) for a in domain for b in adj[a])
 for iteration in range(48):
  nxt=field.copy()
  for i in domain:
   v=body.data.vertices[i].co
   # Fade the operation into unchanged surrounding skin; no hard mask edge.
   strength=smooth((sign*v.x-.135)/.025)*(1-smooth((sign*v.x-.265)/.025))*smooth((v.z-1.23)/.04)*(1-smooth((v.z-1.445)/.04))
   avg=sum(field[n] for n in adj[i])/len(adj[i]);nxt[i]=field[i]+.48*strength*(avg-field[i])
  field=nxt
 for i in domain:
  old=old_weights[i];capacity=old.get(arm,0)+old.get('torso',0)
  if capacity<.95:continue
  val=min(capacity,max(0,field[i]));delta=abs(val-orig[i])
  if delta<1e-6:continue
  body.vertex_groups[arm].add([i],val,'REPLACE');body.vertex_groups['torso'].add([i],capacity-val,'REPLACE');changed.append(i)
 after[side]=max(abs(field[a]-field[b]) for a in domain for b in adj[a])
assert all(tuple(v.co)==p for v,p in zip(body.data.vertices,old_positions))
changed_set=set(changed);outside_unchanged=0
for i,v in enumerate(body.data.vertices):
 if i not in changed_set:
  now={body.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-8};assert now==old_weights[i];outside_unchanged+=1
for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=(1,0,0,0)
bpy.context.view_layer.update();source=OUT/'EXO_ATLAS_R04_MOTION_M6_SHOULDER_CANDIDATE.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source));bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in bpy.data.objects:
 if o.get('module'):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'atlas-motion-m6-shoulder-candidate.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_materials='EXPORT',export_animations=False,export_skins=True,export_all_influences=False)
report={'status':'CANDIDATE','change':'Shoulder arm/torso weights only; no positions, topology, materials, forearm or finger weights changed','verticesTotal':len(body.data.vertices),'verticesWithWeightChanges':len(changed_set),'allVertexPositionsUnchanged':True,'untouchedVertexWeightSets':outside_unchanged,'smoothingIterations':48,'maximumAdjacentArmWeightJumpBefore':before,'maximumAdjacentArmWeightJumpAfter':after,'changedRegionMetres':{'absoluteX':[min(abs(body.data.vertices[i].co.x) for i in changed),max(abs(body.data.vertices[i].co.x) for i in changed)],'heightZ':[min(body.data.vertices[i].co.z for i in changed),max(body.data.vertices[i].co.z for i in changed)]},'reason':'M3 connected_arm_vertices membership stops abruptly at abs(x)=.178 and body_weights uses full arm weight below z=1.34, producing an arm/torso discontinuity across connected skin edges.'};(OUT/'shoulder-candidate-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
