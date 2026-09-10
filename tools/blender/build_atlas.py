"""Build the R03 display assembly from the CAD tessellation and a CC0 fit mannequin.

CAD geometry is read unchanged; only the display copy is material-batched.
The editable .blend preserves every named CAD instance and the human mesh.
"""
from pathlib import Path
from collections import defaultdict
import bpy, math, json, sys
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
CAD=ROOT/'cad/v03/output'
PUBLIC=ROOT/'public/assets/v03'
SOURCE=ROOT/'assets/source/v03'
OUT=ROOT/'output/v03'
REVISION='R03'
POSE_TRANSFORM=None
DECORATE=None
EXTRA_MATERIALS=None
SKIP_HERO=False
for p in [PUBLIC,SOURCE,OUT]:p.mkdir(parents=True,exist_ok=True)

def mat(name,color,metal=0,rough=.4):
    m=bpy.data.materials.new(name);m.use_nodes=True
    if isinstance(color,str):
        srgb=[int(color.lstrip('#')[i:i+2],16)/255 for i in (0,2,4)]
        color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in srgb)+(1,)
    m.diffuse_color=color
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def mesh_obj(name,verts,faces,material,collection=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);(collection or bpy.context.collection).objects.link(obj)
    obj.data.materials.append(material)
    return obj

def curve(name,points,radius,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    c.bevel_depth=radius;c.bevel_resolution=3
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    o['module']='P04';o['layer']='utilities'
    return o

def sphere(name,pos,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def human(materials):
    verts=[];faces=[];groups=defaultdict(set);group=''
    for line in (ROOT/'assets/vendor/makehuman/base.obj').read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':verts.append(tuple(map(float,a[1:4])))
        elif a[0]=='g':group=a[1]
        elif a[0]=='f':
            f=[int(v.split('/')[0])-1 for v in a[1:]];groups[group].update(f)
            if group=='body':faces.append(f)
    scale=1.75/(8.4913+8.1676)
    def transform(v):
        if POSE_TRANSFORM is not None:return POSE_TRANSFORM(v)
        x,y,z=v[0]*scale,-v[2]*scale,(v[1]+8.1676)*scale+.023
        s=1 if x>=0 else -1
        if z<1.00:
            # Bring the base mesh's A-stance feet beneath its hips with a smooth lateral warp.
            t=max(0,min(1,(1.0-z)/.9));x-=s*.122*t
        if abs(x)>.152 and z>.82:
            cx,cz=s*.176,1.433
            weight=max(0,min(1,(abs(x)-.153)/.064))
            ang=s*math.radians(24)*weight
            dx,dz=x-cx,z-cz
            x=cx+math.cos(ang)*dx+math.sin(ang)*dz
            z=cz-math.sin(ang)*dx+math.cos(ang)*dz
        return (x,y,z)
    posed=[transform(v) for v in verts]
    used=sorted(set(i for f in faces for i in f));mapping={old:new for new,old in enumerate(used)}
    hv=[posed[i] for i in used]
    # Feet are covered by closed boot uppers; exclude the covered anatomical surface.
    hf=[[mapping[i] for i in f] for f in faces if sum(posed[i][2] for i in f)/len(f)>.124]
    o=mesh_obj('HUMAN__ANATOMICAL_OPERATOR_1750',hv,hf,materials['skin'])
    o.data.materials.append(materials['suit']);o.data.materials.append(materials['rubber'])
    for p in o.data.polygons:
        p.use_smooth=True
        c=sum((Vector(hv[i]) for i in p.vertices),Vector())/len(p.vertices)
        hands=abs(c.x)>.255 and c.z<.94
        p.material_index=0 if c.z>1.532 or hands else 2 if c.z<.13 else 1
    sub=o.modifiers.new('Anatomical surface / subdivision','SUBSURF');sub.levels=1;sub.render_levels=2
    o['module']='HUMAN';o['layer']='human';o['source']='MakeHuman hm08 / CC0';o['height_mm']=1750
    # Real geometry for the eyes; eyelids and facial anatomy are in the base mesh.
    for side in ['l','r']:
        indices=groups.get(f'joint-{side}-eye',[])
        if not indices:continue
        raw=[sum(verts[i][a] for i in indices)/len(indices) for a in range(3)]
        p=Vector(transform(raw))
        eye=sphere(f'HUMAN__EYE_{side}',p,(.011,.0108,.0108),materials['eye'])
        iris=sphere(f'HUMAN__IRIS_{side}',p+Vector((0,-.0101,0)),(.0041,.0012,.0041),materials['iris'])
        for a in [eye,iris]:a['module']='HUMAN';a['layer']='human'
    # Tailored undersuit seams follow actual body surfaces; no block/capsule body parts.
    for s in [-1,1]:
        seam=curve(f'HUMAN__TAILORED_SEAM_{s}',[(s*.12,-.111,1.47),(s*.132,-.133,1.29),(s*.126,-.132,1.11),(s*.13,-.114,.99)],.0018,materials['seam'])
        seam['module']='HUMAN';seam['layer']='human'
    zipper=curve('HUMAN__ZIP',[(0,-.110,1.51),(0,-.143,1.41),(0,-.152,1.30),(0,-.126,1.18)],.002,materials['graphite'])
    zipper['module']='HUMAN';zipper['layer']='human'
    for side in [-1,1]:
        sections=[(-.206,.023,.041),(-.180,.049,.066),(-.117,.054,.084),(-.057,.047,.101),(.008,.041,.136),(.057,.032,.115)]
        bv=[];bf=[];segments=24
        for y,width,top in sections:
            for i in range(segments):
                a=i*math.tau/segments
                bv.append((side*.110+width*math.cos(a),y,.024+(top-.024)*max(0,math.sin(a))))
        for j in range(len(sections)-1):
            for i in range(segments):bf.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
        bf.extend([tuple(range(segments-1,-1,-1)),tuple((len(sections)-1)*segments+i for i in range(segments))])
        boot=mesh_obj(f'HUMAN__WORK_BOOT_{side}',bv,bf,materials['rubber']);boot['module']='HUMAN';boot['layer']='human'
        for p in boot.data.polygons:p.use_smooth=True
        sub=boot.modifiers.new('Boot upper curvature','SUBSURF');sub.levels=2
        for j in range(5):
            y=-.082+j*.022;top=.104+j*.006
            lace=curve(f'HUMAN__BOOT_LACE_{side}_{j}',[(side*.11-.022,y,top),(side*.11,y-.009,top+.005),(side*.11+.022,y,top)],.0018,materials['seam'])
            lace['module']='HUMAN';lace['layer']='human'
    # Bone landmarks are preserved as an editable rig for later pose work.
    rig_data=bpy.data.armatures.new('HUMAN_FIT_RIG');rig=bpy.data.objects.new('HUMAN_FIT_RIG',rig_data)
    bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name,a,b,parent=None):
        b0=rig_data.edit_bones.new(name);b0.head=a;b0.tail=b
        if parent:b0.parent=rig_data.edit_bones[parent]
    bone('pelvis',(0,0,.95),(0,0,1.08));bone('spine',(0,0,1.08),(0,0,1.42),'pelvis');bone('head',(0,0,1.42),(0,0,1.75),'spine')
    for s,tag in [(-1,'L'),(1,'R')]:
        bone('thigh_'+tag,(s*.11,0,.947),(s*.108,0,.48),'pelvis')
        bone('shin_'+tag,(s*.108,0,.48),(s*.11,0,.1),'thigh_'+tag)
        bone('arm_'+tag,(s*.177,0,1.43),(s*.244,-.015,1.15),'spine')
        bone('forearm_'+tag,(s*.244,-.015,1.15),(s*.28,-.04,.9),'arm_'+tag)
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False);rig.hide_render=True
    return o

def label(name,body,pos,rot,size,material,module):
    c=bpy.data.curves.new(name,'FONT');c.body=body;c.size=size;c.extrude=.00008;c.align_x='CENTER'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=rot;o.data.materials.append(material)
    o['module']=module;o['layer']='markings'
    return o

def look_at(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def studio():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.world.color=(.7,.7,.7);scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.63,.68,.72,1);bg.inputs[1].default_value=.45
    for name,pos,power,size in [('KEY',(2,-3,4),420,4),('SOFT',(-3,-1,2.4),240,3),('EDGE',(1.5,2.5,3),550,2.4),('TOP',(-1,1,5),300,3)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
        o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=pos;look_at(o,(0,0,1))
    floor=mat('Studio neutral',(.72,.75,.76,1),0,.66)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));bpy.context.object.name='STUDIO_FLOOR';bpy.context.object.data.materials.append(floor)
    cam=bpy.data.cameras.new('PRESENTATION_CAMERA');o=bpy.data.objects.new('PRESENTATION_CAMERA',cam);bpy.context.collection.objects.link(o)
    o.location=(2.5,-4.8,2.12);look_at(o,(0,-.015,.88));cam.type='ORTHO';cam.ortho_scale=2.3;scene.camera=o
    scene.render.resolution_x=1800;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False

def main():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    data=json.loads((CAD/'assembly.json').read_text());defs={p['id']:p for p in data['parts']}
    materials={
        'titanium':mat('01 Satin titanium','#7e8a91',.78,.28),
        'ceramic':mat('02 Ceramic silver shell','#bdc5c9',.58,.27),
        'graphite':mat('03 Graphite structural composite','#252d32',.50,.34),
        'lime':mat('04 Acid lime equipment marking','#a7cf3b',.32,.29),
        'rubber':mat('05 Elastomer contact surfaces','#141a1e',.04,.66),
        'steel':mat('06 Brushed steel fasteners','#a2afb6',.85,.24),
        'skin':mat('07 Anatomical fit mannequin','#bbbcb9',.12,.44),
        'suit':mat('08 Technical tailored undersuit','#343d43',.05,.71),
        'eye':mat('09 Eye ceramic','#b4b7b4',.1,.28),
        'iris':mat('10 Iris','#4b565b',.15,.22),
        'seam':mat('11 Flatlock seams','#657177',.04,.65)
    }
    if EXTRA_MATERIALS:materials.update(EXTRA_MATERIALS())
    # Cloth microstructure is retained in the Blender source/render.
    nodes=materials['suit'].node_tree.nodes;links=materials['suit'].node_tree.links
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=360
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.0007
    links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
    mesh_cache={}
    for inst in data['instances']:
        key=inst['part'];p=defs[key]
        if key not in mesh_cache:
            g=json.loads((CAD/'preview'/f'{key}.json').read_text())
            m=bpy.data.meshes.new(key);m.from_pydata([[x*.001 for x in v] for v in g['vertices']],[],g['faces']);m.update();mesh_cache[key]=m
        # Single-user geometry is essential: joining one side must not mutate its mirrored peer.
        obj=bpy.data.objects.new(inst['id'],mesh_cache[key].copy());bpy.context.collection.objects.link(obj)
        matrix=Matrix(inst['matrix']);matrix.translation*=.001;obj.matrix_world=matrix
        if not obj.data.materials:obj.data.materials.append(materials[p['material']])
        obj['module']=p['family'];obj['layer']=p['layer'];obj['cadPart']=key;obj['process']=p['process'];obj['side']=inst['side']
        # Tessellation normals: smooth shallow angle transitions, preserve machined edges.
        for polygon in obj.data.polygons:polygon.use_smooth=True
        try:obj.data.set_sharp_from_angle(angle=math.radians(36))
        except AttributeError:pass
        if p['layer']!='shell':
            weighted=obj.modifiers.new('Machined face normals','WEIGHTED_NORMAL');weighted.keep_sharp=True;weighted.weight=40
    human(materials)
    for s in [-1,1]:
        curve(f'P04__ARM_SERVICE_LOOP_{s}',[(s*.12,.235,1.48),(s*.25,.225,1.53),(s*.39,.14,1.48),(s*.43,.10,1.33),(s*.465,.06,1.11)],.006,materials['graphite'])
        curve(f'P04__ARM_SIGNAL_{s}',[(s*.13,.235,1.48),(s*.26,.235,1.51),(s*.40,.15,1.46),(s*.44,.12,1.31)],.0025,materials['lime'])
        curve(f'P04__LEG_CONDUIT_{s}',[(s*.075,.23,1.08),(s*.19,.14,.98),(s*.238,.045,.87),(s*.211,.03,.62),(s*.192,.025,.48),(s*.177,.029,.15)],.0045,materials['graphite'])
        # Shoulder straps arc over the clavicle, with dedicated soft-contact surfaces.
        strap=curve(f'H01__SHOULDER_HARNESS_{s}',[(s*.13,.15,1.39),(s*.155,.02,1.49),(s*.143,-.11,1.43),(s*.12,-.14,1.27)],.014,materials['rubber'])
        strap['module']='H01';strap['layer']='soft'
    label('H01__ATLAS_WORDMARK','A T L A S',(0,-.228,1.346),(math.pi/2,0,0),.012,materials['graphite'],'H01')
    label('H01__EDITION','EXO  /  '+REVISION,(0,-.228,1.329),(math.pi/2,0,0),.006,materials['graphite'],'H01')
    for s in [-1,1]:
        label(f'A02__MARK_{s}','EXF  /  A02',(s*.405,-.044,1.23),(math.pi/2,0,0),.009,materials['graphite'],'A02')
        label(f'L04__MARK_{s}','L04',(s*.182,-.062,.27),(math.pi/2,0,0),.010,materials['graphite'],'L04')
    # Preserve a complete editable master before creating the optimized viewer copy.
    if DECORATE:DECORATE(materials)
    studio()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'EXO_ATLAS_{REVISION}.blend'))
    # Mesh conversion and batching is display-only. STEP retains each engineering component.
    buckets=defaultdict(list)
    for o in list(bpy.context.scene.objects):
        if o.type in {'MESH','CURVE','FONT'} and o.get('module'):
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.convert(target='MESH');o=bpy.context.object
            key=(o.get('module'),o.get('layer'),o.get('side','C'),o.data.materials[0].name)
            buckets[key].append(o)
    for (module,layer,side,material),items in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in items:o.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        if len(items)>1:bpy.ops.object.join()
        o=bpy.context.object;o.data=o.data.copy()
        o.name=f'{module}__{layer}__{side}__{material[:2]}'
        o['module']=module;o['layer']=layer;o['side']=side
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if len(o.data.polygons)>18000 and module!='HUMAN':
            dec=o.modifiers.new('Viewer tessellation','DECIMATE');dec.ratio=.7;bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.object.select_all(action='DESELECT')
    exported=[]
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.get('module'):o.select_set(True);exported.append(o)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/f'atlas-{REVISION.lower()}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_materials='EXPORT',export_animations=False)
    stats={'meshes':len(exported),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exported),'bytes':(PUBLIC/f'atlas-{REVISION.lower()}.glb').stat().st_size,'cadInstances':len(data['instances']),'humanSource':'MakeHuman hm08 CC0','humanHeightMm':1750}
    (OUT/'model-validation.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats),flush=True)
    if not SKIP_HERO:
        bpy.context.scene.render.filepath=str(OUT/'01-hero.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':main()
