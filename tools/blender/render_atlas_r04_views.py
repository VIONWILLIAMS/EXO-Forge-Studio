"""Repeatable R04 engineering review views and an actual-geometry hip comparison."""
from pathlib import Path
import bpy,sys,math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['rear']
view=args[0]

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()

if view=='compare':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/v03/EXO_ATLAS_R03.blend'))
    for o in bpy.context.scene.objects:
        if o.get('module')=='HUMAN':o.location.x+=.37
        elif o.get('module'):o.hide_render=True
    with bpy.data.libraries.load(str(ROOT/'assets/source/v04/EXO_ATLAS_R04.blend'),link=False) as (src,dst):
        dst.objects=[name for name in src.objects if name.startswith('HUMAN__')]
    for o in dst.objects:
        if o:
            bpy.context.collection.objects.link(o);o.location.x-=.37
    scene=bpy.context.scene;camera=scene.camera
    camera.location=(0,4.0,1.04);aim(camera,(0,0,1.02));camera.data.ortho_scale=1.43
    for x,title in [(.37,'R03 / BEFORE'),(-.37,'R04 / CORRECTED')]:
        data=bpy.data.curves.new(title,'FONT');data.body=title;data.align_x='CENTER';data.size=.032
        o=bpy.data.objects.new(title,data);bpy.context.collection.objects.link(o);o.location=(x,.31,1.365);o.rotation_euler=(math.pi/2,0,math.pi)
        mat=bpy.data.materials.new(title);mat.diffuse_color=(.08,.12,.16,1);o.data.materials.append(mat)
    name='02-human-fit-comparison';scene.render.resolution_x=2000;scene.render.resolution_y=1150
else:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/source/v04/EXO_ATLAS_R04.blend'))
    scene=bpy.context.scene
    states={
        'hero':((2.1,-4.8,2.1),(0,0,.90),2.18,'01-hero'),
        'rear':((1.9,4.4,2),(0,.06,.92),2.16,'03-rear-system'),
        'hmi':((.9,-1.8,1.67),(0,-.04,1.31),.74,'04-hmi-detail'),
        'foot':((.62,-.8,.40),(0,-.04,.17),.61,'05-foot-interface'),
        'gripper':((.95,-1.6,1.40),(.40,-.26,1.00),.62,'06-gripper-detail'),
    }
    position,target,scale,name=states[view]
    scene.camera.location=position;aim(scene.camera,target);scene.camera.data.ortho_scale=scale
    if view=='foot':
        for o in scene.objects:
            if o.get('module') and o.get('module') not in ['HUMAN','L04','L05','L06','H02']:o.hide_render=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1600
scene.cycles.samples=48
scene.render.filepath=str(ROOT/'output/v04'/f'{name}.png')
bpy.ops.render.render(write_still=True)
