"""Render one deterministic EXO Forge validation view from the source .blend."""
import bpy
import os
import sys
from mathutils import Vector, Matrix

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
view=args[0] if args else 'isometric'
views={
    'front':('01-front.png',(0,1.08,7.8),(0,.86,0),58,'industrial'),
    'side':('02-side.png',(7.8,1.08,0),(0,.86,0),58,'industrial'),
    'isometric':('03-isometric.png',(5.4,3.35,6.0),(0,.88,0),58,'industrial'),
    'exploded':('04-exploded.png',(5.8,3.4,6.4),(0,.9,0),58,'industrial'),
    'industrial':('05-industrial-50kg.png',(5.5,3.0,6.1),(0,.88,-.08),58,'industrial'),
    'rescue':('06-rescue-20kg.png',(5.4,2.8,6.0),(0,.78,-.05),58,'rescue'),
    'construction':('07-construction-15kg.png',(5.7,3.6,6.4),(0,1.05,-.05),58,'construction'),
}
if view not in views: raise SystemExit(f'unknown view: {view}')
filename,position,target,lens,task=views[view]
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH' if view in ('exploded','construction') else 'BLENDER_EEVEE'
scene.render.resolution_x=1400; scene.render.resolution_y=900; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.view_settings.look='AgX - Medium High Contrast'
if scene.render.engine=='BLENDER_WORKBENCH':
    scene.display.shading.light='FLAT'; scene.display.shading.color_type='MATERIAL'; scene.display.shading.show_shadows=False; scene.display.shading.show_cavity=True; scene.display.shading.cavity_type='WORLD'; scene.display.shading.background_type='VIEWPORT'; scene.display.shading.background_color=(.035,.045,.05)
for name in ('TASK_INDUSTRIAL_50KG','TASK_RESCUE_20KG','TASK_CONSTRUCTION_15KG'): bpy.data.objects[name].hide_render=True
bpy.data.objects['TASK_INDUSTRIAL_50KG' if task=='industrial' else 'TASK_RESCUE_20KG' if task=='rescue' else 'TASK_CONSTRUCTION_15KG'].hide_render=False
if view=='exploded':
    names=['A02_UPPER_ARM_L','A02_UPPER_ARM_R','A04_FOREARM_L','A04_FOREARM_R','L02_THIGH_RAIL_L','L02_THIGH_RAIL_R','L04_SHIN_RAIL_L','L04_SHIN_RAIL_R','P01_BATTERY_ENCLOSURE','P03_TELESCOPIC_STRUT_L','P03_TELESCOPIC_STRUT_R','F02_INNER_SLIDER']
    for name in names:
        obj=bpy.data.objects[name]; matrix=obj.matrix_world.copy()
        if name.endswith('_L'): matrix.translation.x-=.18
        elif name.endswith('_R'): matrix.translation.x+=.18
        elif name.startswith('P01'): matrix.translation.z+=.24
        elif name.startswith('F02'): matrix.translation.y+=.18
        obj.matrix_world=matrix
if view=='construction':
    # Use a fresh render proxy to avoid a Blender 5 nested-visibility stall.
    bpy.data.objects['TASK_CONSTRUCTION_15KG'].hide_render=True
    bpy.ops.mesh.primitive_cube_add(location=(0,1.95,-.28)); tool=bpy.context.object; tool.dimensions=(.30,.42,.16); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); tool.data.materials.append(bpy.data.materials['M_CarbonFiber'])
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.035,depth=.36,location=(0,2.34,-.28)); bpy.context.object.data.materials.append(bpy.data.materials['M_SafetyOrange'])
cam=scene.camera; p=Vector(position); t=Vector(target); forward=(t-p).normalized(); right=forward.cross(Vector((0,1,0))).normalized(); up=right.cross(forward).normalized(); cam.data.lens=lens; cam.matrix_world=Matrix.Translation(p) @ Matrix((right,up,-forward)).transposed().to_4x4()
scene.render.filepath=os.path.join(ROOT,'artifacts','renders',filename)
bpy.ops.render.render(write_still=True)
print('EXO_FIXED_VIEW_COMPLETE',view,scene.render.filepath)
