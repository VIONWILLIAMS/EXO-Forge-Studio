"""Render repeatable review views from the unbatched Blender master."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['front']
view=args[0]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/v03/EXO_ATLAS_R03.blend'))
scene=bpy.context.scene
states={
 'front':((0,-4,1.2),(0,0,.9),2.12,'02-front'),
 'rear':((2.1,4,2),(0,.07,.94),2.22,'03-rear'),
 'foot':((.58,-.8,.42),(0,-.04,.17),.62,'04-foot-detail'),
 'exploded':((2.5,-4,2.1),(0,0,.94),2.45,'05-exploded'),
 'arm':((1.35,-1.55,1.75),(.40,-.04,1.27),.86,'06-arm-detail'),
}
pos,target,scale,name=states[view]
if view=='exploded':
 for o in scene.objects:
  if not o.get('module') or o.get('module')=='HUMAN':continue
  side=-1 if o.get('side')=='L' else 1 if o.get('side')=='R' else 0
  o.location.x+=side*.23
  if o.get('layer')=='shell':o.location.y-=.18
  if o.get('module').startswith('P'):o.location.y+=.2
if view=='foot':
 for o in scene.objects:
  if o.get('module') not in {'HUMAN','L04','L05','L06','H02'} and o.get('module'):o.hide_render=True
scene.camera.location=pos;scene.camera.rotation_euler=(Vector(target)-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=scale
scene.cycles.samples=64
scene.render.resolution_x=1800;scene.render.resolution_y=1800
scene.render.filepath=str(ROOT/'output/v03'/f'{name}.png')
bpy.ops.render.render(write_still=True)
