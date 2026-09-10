"""Render one task preset from the generated baseline .blend.

Usage: blender -b assets/source/exo-forge-v0.1.blend --python
tools/blender/render_task_view.py -- rescue|construction
"""
import bpy
import math
import os
import sys
from mathutils import Vector, Matrix

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
task=args[0] if args else 'rescue'
if task not in ('rescue','construction'): raise SystemExit('task must be rescue or construction')
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE' if task=='rescue' else 'BLENDER_WORKBENCH'
scene.render.resolution_x=1400; scene.render.resolution_y=900; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.view_settings.look='AgX - Medium High Contrast'
if task=='construction':
    scene.display.shading.light='FLAT'; scene.display.shading.color_type='MATERIAL'; scene.display.shading.show_shadows=False; scene.display.shading.show_cavity=True; scene.display.shading.cavity_type='WORLD'; scene.display.shading.background_type='VIEWPORT'; scene.display.shading.background_color=(.035,.045,.05)
for name in ('TASK_INDUSTRIAL_50KG','TASK_RESCUE_20KG','TASK_CONSTRUCTION_15KG'): bpy.data.objects[name].hide_render=True
if task=='rescue':
    bpy.data.objects['TASK_RESCUE_20KG'].hide_render=False
else:
    # A fresh unparented render proxy avoids a Blender 5 headless visibility
    # stall observed when unhiding the nested construction-tool source node.
    bpy.ops.mesh.primitive_cube_add(location=(0,1.95,-.28))
    tool=bpy.context.object; tool.name='TASK_CONSTRUCTION_RENDER_PROXY'; tool.dimensions=(.30,.42,.16); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); tool.data.materials.append(bpy.data.materials['M_CarbonFiber'])
    bevel=tool.modifiers.new('Tool edge radius','BEVEL'); bevel.width=.025; bevel.segments=2
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.035,depth=.36,location=(0,2.34,-.28))
    bit=bpy.context.object; bit.name='TASK_CONSTRUCTION_BIT_PROXY'; bit.data.materials.append(bpy.data.materials['M_SafetyOrange'])
cam=scene.camera
position=Vector((5.4,2.8,6.0) if task=='rescue' else (5.7,3.6,6.4))
target=Vector((0,.78,-.05) if task=='rescue' else (0,1.05,-.05))
forward=(target-position).normalized(); right=forward.cross(Vector((0,1,0))).normalized(); up=right.cross(forward).normalized()
cam.data.lens=58; cam.matrix_world=Matrix.Translation(position) @ Matrix((right,up,-forward)).transposed().to_4x4()
scene.render.filepath=os.path.join(ROOT,'artifacts','renders','06-rescue-20kg.png' if task=='rescue' else '07-construction-15kg.png')
bpy.ops.render.render(write_still=True)
print('EXO_TASK_RENDER_COMPLETE',task,scene.render.filepath)
