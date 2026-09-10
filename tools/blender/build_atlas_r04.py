"""R04 anatomy correction, faceted CAD assembly and three real HMI enclosures."""
import sys,math,json,importlib.util
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
import anatomy_r04 as anatomy
import build_atlas as b

b.CAD=ROOT/'cad/v04/output';b.PUBLIC=ROOT/'public/assets/v04'
b.SOURCE=ROOT/'assets/source/v04';b.OUT=ROOT/'output/v04';b.REVISION='R04'
b.POSE_TRANSFORM=anatomy.pose
b.SKIP_HERO='--skip-hero' in sys.argv
for p in [b.PUBLIC,b.SOURCE,b.OUT]:p.mkdir(parents=True,exist_ok=True)
original_mat=b.mat
def material(name,color,metal=0,rough=.4):
    settings={
        '01':('#8f9fae',.80,.24),'02':('#d3dce4',.45,.24),
        '03':('#23303b',.55,.29),'04':('#c8ee63',.32,.24),
        '07':('#b9c3cb',.05,.40),'08':('#344858',.04,.75)}
    if name[:2] in settings:color,metal,rough=settings[name[:2]]
    return original_mat(name,color,metal,rough)
b.mat=material

def extra_materials():
    screen=b.mat('12 Smoked display glass','#06151f',.28,.19)
    screen.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.65
    red=b.mat('14 Emergency stop orange red','#de563b',.15,.3)
    ink=b.mat('13 HMI phosphor / simulation','#a5efde',.1,.3)
    p=ink.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.25,.75,.6,1);p.inputs['Emission Strength'].default_value=2.1
    return {'screen':screen,'red':red,'ink':ink}
b.EXTRA_MATERIALS=extra_materials

def decorate(m):
    # The shoulder restraint is a broad textile band, not a round hose.
    profile_data=bpy.data.curves.new('HARNESS_FLAT_SECTION','CURVE');profile_data.dimensions='2D'
    spline=profile_data.splines.new('POLY');cross=[(-.022,-.003),(.022,-.003),(.024,-.001),(.024,.001),(.022,.003),(-.022,.003),(-.024,.001),(-.024,-.001)]
    spline.points.add(len(cross)-1)
    for p,(x,y) in zip(spline.points,cross):p.co=(x,y,0,1)
    spline.use_cyclic_u=True
    profile=bpy.data.objects.new('HARNESS_FLAT_SECTION',profile_data);bpy.context.collection.objects.link(profile);profile.hide_render=True
    for o in bpy.data.objects:
        if o.name.startswith('H01__SHOULDER_HARNESS'):
            o.data.bevel_depth=0;o.data.bevel_mode='OBJECT';o.data.bevel_object=profile;o.data.twist_mode='MINIMUM'
        if o.name.startswith(('HUMAN__WORK_BOOT','HUMAN__BOOT_LACE')):o.location.z-=.005
    # Remove the now-obsolete badge and the seams that did not follow the body.
    for o in list(bpy.data.objects):
        if o.name in ['H01__ATLAS_WORDMARK','H01__EDITION','HUMAN__ZIP'] or o.name.startswith(('HUMAN__TAILORED_SEAM','A02__MARK','L04__MARK')):
            bpy.data.objects.remove(o,do_unlink=True)
    body=next(o for o in bpy.data.objects if o.name=='HUMAN__ANATOMICAL_OPERATOR_1750')
    # Split the neck surface at the garment edge before assigning materials.
    # Face-centre assignment alone made a visibly jagged collar boundary.
    bm=bmesh.new();bm.from_mesh(body.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,
        plane_co=(0,0,1.507),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    bm.to_mesh(body.data);bm.free();body.data.update()
    verts=[v.co.copy() for v in body.data.vertices]
    faces=[list(p.vertices) for p in body.data.polygons]
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=False)
    for p in body.data.polygons:
        c=sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        if abs(c.x)>.255 and c.z<1.15:p.material_index=1
        if c.z>1.507:p.material_index=0
    # A rolled cloth collar covers the jagged material boundary at the neck.
    cv=[];cf=[];segments=64
    for z,rx,ry in [(1.489,.061,.062),(1.496,.058,.059),(1.507,.055,.057),(1.512,.056,.058)]:
        for j in range(segments):
            a=j*math.tau/segments;cv.append((rx*math.cos(a),-.025+ry*math.sin(a),z))
    for row in range(3):
        for j in range(segments):cf.append((row*segments+j,row*segments+(j+1)%segments,(row+1)*segments+(j+1)%segments,(row+1)*segments+j))
    collar=b.mesh_obj('HUMAN__ROLLED_COLLAR',cv,cf,m['suit']);collar['module']='HUMAN';collar['layer']='human'
    for p in collar.data.polygons:p.use_smooth=True
    solid=collar.modifiers.new('Cloth edge','SOLIDIFY');solid.thickness=.0018
    # Tailoring is sampled on the actual corrected body, not a guessed spline.
    for s in [-1,1]:
        points=[]
        for j in range(15):
            z=1.48-j*.030;x=s*(.11 if z>1.15 else .12)
            hit=tree.ray_cast(Vector((x,-.6,z)),Vector((0,1,0)),1)
            if hit[0]:points.append(tuple(hit[0]+Vector((0,-.0018,0))))
        seam=b.curve(f'HUMAN__FITTED_SEAM_{s}',points,.0011,m['seam']);seam['module']='HUMAN';seam['layer']='human'
    # Human-only diagnostic, retained with the source to prevent another hidden warp.
    report=anatomy.audit();(b.OUT/'anatomy-validation.json').write_text(json.dumps(report,indent=2))
    assembly=json.loads((b.CAD/'assembly.json').read_text())
    displays=[]
    for kind,w,h in [('CHEST',120,64),('SERVICE',110,42),('WRIST',64,38)]:
        inst=next(i for i in assembly['instances'] if i['part']==f'P02_HMI_{kind}_GLASS')
        matrix=Matrix(inst['matrix']);matrix.translation*=.001
        # A planar screen face in the exact CAD cover's coordinate system.
        v=[(-w*.00046,-h*.00044,.001),(w*.00046,-h*.00044,.001),
           (w*.00046,h*.00044,.001),(-w*.00046,h*.00044,.001)]
        panel=b.mesh_obj(f'P02__HMI_SURFACE_{kind}',v,[(0,1,2,3)],m['screen'])
        panel.matrix_world=matrix;panel['module']='P02';panel['layer']='screenSurface';panel['displayId']=kind
        uv=panel.data.uv_layers.new()
        for i,point in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=point
        def screen_text(s,y,size):
            o=b.label('P02__INK_'+kind+'_'+s,s,(0,0,0),(0,0,0),size,m['ink'],'P02')
            o.matrix_world=matrix@Matrix.Translation((0,y,.0013));o['layer']='screenInk'
            return o
        screen_text('A T L A S  /  0 4',h*.00025,.006 if kind!='WRIST' else .0038)
        screen_text('READY' if kind=='CHEST' else 'SERVICE' if kind=='SERVICE' else 'MANUAL',-.001,.012 if kind=='CHEST' else .008)
        screen_text('SIM  /  NO HARDWARE',-h*.00030,.0037 if kind!='WRIST' else .0027)
        displays.append({'id':kind,'matrix':inst['matrix'],'widthMm':w*.92,'heightMm':h*.88,'surfaceOffsetMm':1.0})
    (b.PUBLIC/'displays.json').write_text(json.dumps(displays,indent=2))
    def surface_hit(part,side,x,z):
        obj=next(o for o in bpy.data.objects if o.get('cadPart')==part and o.get('side')==side)
        v=[obj.matrix_world@v.co for v in obj.data.vertices]
        mesh=BVHTree.FromPolygons(v,[list(p.vertices) for p in obj.data.polygons])
        hit=mesh.ray_cast(Vector((x,-.7,z)),Vector((0,1,0)),1.4)
        return hit[0]+hit[1]*.0011 if hit[0] else None
    # Place markings on the actual CAD surface, not on a guessed front plane.
    for s in [-1,1]:
        side='L' if s<0 else 'R'
        for j in range(4):
            x=s*(.362+j*.020)
            points=[surface_hit('A01_DELTOID_INLAY',side,x,1.501),surface_hit('A01_DELTOID_INLAY',side,x+s*.012,1.501)]
            if all(p is not None for p in points):
                o=b.curve(f'A01__STATUS_{s}_{j}',points,.0013,m['ink']);o['module']='A01';o['side']=side;o['layer']='statusLight'
        for part,x,z,module in [('L02_COLOR_INSERT',s*.230,.786,'L02'),('L04_COLOR_INSERT',s*.188,.333,'L04')]:
            points=[surface_hit(part,side,x-.013,z),surface_hit(part,side,x+.013,z)]
            if all(p is not None for p in points):
                o=b.curve(f'{module}__ID_STRIPE_{side}',points,.0012,m['lime']);o['module']=module;o['side']=side;o['layer']='markings'
    p=surface_hit('H01_CHEST_PLATE','C',0,1.291)
    if p:b.label('H01__SMALL_WORDMARK','A T L A S',p,(math.pi/2,0,0),.008,m['graphite'],'H01')
b.DECORATE=decorate

def studio():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
    scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.18,.24,.32,1);bg.inputs[1].default_value=.35
    for name,pos,power,size in [('KEY',(2,-3.5,3.8),460,3),('FILL',(-2.5,-1.5,2.7),230,3),('RIM',(2,2.5,3.3),600,2),('TOP',(-1,0,5),320,2.5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos;b.look_at(o,(0,0,1))
    floor=b.mat('Studio slate','#2a3540',.2,.36)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));bpy.context.object.name='STUDIO_FLOOR';bpy.context.object.data.materials.append(floor)
    camera=bpy.data.cameras.new('PRESENTATION_CAMERA');o=bpy.data.objects.new('PRESENTATION_CAMERA',camera);bpy.context.collection.objects.link(o)
    o.location=(2.1,-4.8,2.1);b.look_at(o,(0,0,.90));camera.type='ORTHO';camera.ortho_scale=2.18;scene.camera=o
    scene.render.resolution_x=1800;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.image_settings.file_format='PNG'
b.studio=studio

if __name__=='__main__':b.main()
