"""Derive display-only open-camera-side stairs, preserving all tread geometry.
blender -b --python /tmp/exo-m6-environment/build_open_view_stairs.py
"""
import bpy,bmesh,os,json,hashlib,struct,math
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
def xyz(p):return Vector((p[0],-p[2],p[1]))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'stairs.glb'))
objects=list(bpy.context.scene.objects)
rail_materials={'Brushed charcoal handrail','Satin bead-blasted aluminium'}
def hash_geometry(o):
    data=bytearray()
    for v in o.data.vertices:
        p=o.matrix_world@v.co;data.extend(struct.pack('<3f',*p))
    for p in o.data.polygons:
        data.extend(struct.pack('<I',len(p.vertices)))
        for i in p.vertices:data.extend(struct.pack('<I',i))
    return hashlib.sha256(data).hexdigest()
unchanged={o.name:hash_geometry(o) for o in objects if o.type=='MESH' and not any(m.name in rail_materials for m in o.data.materials)}
removed=[]
for o in objects:
    if o.type!='MESH' or not any(m.name in rail_materials for m in o.data.materials):continue
    bm=bmesh.new();bm.from_mesh(o.data);before=len(bm.faces)
    to_remove=[v for v in bm.verts if (o.matrix_world@v.co).x>0]
    bmesh.ops.delete(bm,geom=to_remove,context='VERTS');bm.to_mesh(o.data);o.data.update();bm.free()
    removed.append({'mesh':o.name,'removedVertices':len(to_remove),'facesBefore':before,'facesAfter':len(o.data.polygons)})
for o in objects:
    if o.name in unchanged:assert hash_geometry(o)==unchanged[o.name],o.name+' unexpectedly modified'
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'stairs-open-view.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT')
anchors={}
for name in ['First_tread_centre','Landing_drop_zone']:
    p=bpy.data.objects[name].matrix_world.translation;anchors[name]=[p.x,p.z,-p.y]
report={'source':'stairs.glb','derived':'stairs-open-view.glb','change':'Only +X handrail, posts and their side-mount fittings removed. -X far side remains complete. Display-stage variant.','unchangedGeometryHashes':unchanged,'removed':removed,'anchors':anchors,'triangles':sum(len(p.vertices)-2 for o in objects if o.type=='MESH' for p in o.data.polygons),'sha256':hashlib.sha256(open(os.path.join(OUT,'stairs-open-view.glb'),'rb').read()).hexdigest()}
json.dump(report,open(os.path.join(OUT,'stairs-open-view-validation.json'),'w'),indent=2)

# Load the existing crate as visual context, directly on the ground; no dolly.
before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'crate.glb'))
new=set(bpy.context.scene.objects)-before
for o in new:
    if o.parent is None:o.location+=xyz((0,.231,-.12))

def material(name,color,rough=.9):
    m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;return m
bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.001));bpy.context.object.data.materials.append(material('Neutral review ground',(.59,.62,.60)))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.77,.83,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4
for name,p,power,size in [('Key',(2,6,-3),1300,5),('Fill',(-4,3,-1),450,4),('Rim',(3,5,5),900,4)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(p));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(xyz((0,.9,.65))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz((5,2.5,-2.6)));cam=bpy.context.object;cam.rotation_euler=(xyz((0,1.05,.65))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=55
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.65
scene.render.filepath=os.path.join(OUT,'stairs-open-view-review.png');bpy.ops.render.render(write_still=True)
print(json.dumps(report,indent=2));print('OPEN VIEW COMPLETE')
