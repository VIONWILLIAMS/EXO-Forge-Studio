"""Original procedural M6 display props, metres, exported +Y up / +Z forward.
Run: blender -b --python build_environment.py
No downloaded geometry, images, fonts or textures. Blender default font labels.
"""
import bpy, math, random, json, os
from mathutils import Vector
from math import sin, cos, pi

OUT=os.path.dirname(os.path.abspath(__file__))
random.seed(73491)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for dat in bpy.data.materials: bpy.data.materials.remove(dat)

def xyz(p): return Vector((p[0],-p[2],p[1]))
def mat(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    return m
M={
    'case':mat('Graphite olive · recycled polymer',(.105,.145,.120),.42),
    'panel':mat('Sage recessed side panels',(.175,.235,.182),.60),
    'rubber':mat('Soft charcoal rubber',(.021,.028,.024),.76),
    'alloy':mat('Satin bead-blasted aluminium',(.38,.43,.41),.34,.78),
    'orange':mat('Safety ochre hardware',(.90,.39,.065),.36,.22),
    'label':mat('Warm white engraved legends',(.88,.89,.76),.7),
    'concrete':mat('Warm architectural concrete',(.43,.45,.43),.93),
    'edge':mat('Tread nosing anodised aluminium',(.21,.26,.26),.45,.64),
    'rail':mat('Brushed charcoal handrail',(.10,.135,.135),.40,.7),
    'yellow':mat('Subtle safety stripe',(.68,.76,.34),.62),
    'bark':mat('Apple bark warm grey',(.235,.18,.115),.94),
    'twig':mat('Seasonal woody growth',(.32,.255,.15),.95),
    'leafA':mat('Apple leaves forest green',(.085,.19,.043),.86),
    'leafB':mat('Apple leaves sunlit green',(.16,.30,.065),.79),
    'leafC':mat('Apple leaves fresh green',(.255,.38,.105),.81),
    'appleA':mat('Apple skin scarlet',(.52,.026,.017),.28),
    'appleB':mat('Apple skin red orange',(.68,.066,.026),.31),
    'stem':mat('Apple stems',(.15,.105,.045),.86),
    'wickerA':mat('Honey willow natural',(.45,.27,.11),.75),
    'wickerB':mat('Honey willow light',(.63,.41,.19),.72),
    'soil':mat('Dry orchard earth',(.215,.175,.125),1),
    'grass':mat('Meadow blades',(.23,.29,.105),.91),
}
# Baked, original surface colour variation survives the glTF export. No runtime shaders.
def texture_material(m,kind,size=256):
    import numpy as np
    yy,xx=np.mgrid[0:size,0:size]; rng=np.random.default_rng(117 if kind=='bark' else 128)
    if kind=='bark':
        n=.12*np.sin(xx*.42+2*np.sin(yy*.034))+.075*np.sin(xx*.91+np.sin(yy*.023))+.03*rng.random((size,size))
        c=np.clip(np.array([.25,.195,.135])+n[...,None],0,1)
    else:
        n=rng.normal(0,.017,(size,size))+.012*np.sin(xx*.053)*np.sin(yy*.073)
        c=np.clip(np.array([.49,.50,.48])+n[...,None],0,1)
    pixels=np.concatenate((c,np.ones((size,size,1))),axis=2).astype('float32')
    im=bpy.data.images.new('Original '+kind+' microcolour',width=size,height=size);im.pixels.foreach_set(pixels.ravel());im.pack()
    nodes=m.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=im
    m.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
texture_material(M['bark'],'bark');texture_material(M['concrete'],'concrete')

groups={}; active=[]
def add_obj(o,name,material):
    o.name=name;o.data.materials.append(M[material]);active.append(o)
    return o
def mesh(name,verts,faces,material,smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata([xyz(v) for v in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);add_obj(o,name,material)
    if smooth:
        for p in me.polygons:p.use_smooth=True
    return o
def cube(name,p,size,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);add_obj(o,name,material)
    if bevel:
        mod=o.modifiers.new('Machined edge radii','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return o
def path(name,points,radius,material,segments=8,closed=False,radii=None):
    # Ring tube; stable tangent frames keep curved rails and branches continuous.
    vs=[];fs=[];n=len(points);previous_u=None
    for i,p in enumerate(points):
        p=Vector(p);d=Vector(points[(i+1)%n])-Vector(points[(i-1)%n]) if closed else Vector(points[min(n-1,i+1)])-Vector(points[max(0,i-1)])
        d.normalize()
        if previous_u is None:previous_u=Vector((0,1,0)) if abs(d.y)<.85 else Vector((1,0,0))
        u=(previous_u-d*previous_u.dot(d)).normalized();v=d.cross(u).normalized();previous_u=u.copy();r=radii[i] if radii else radius
        for k in range(segments):vs.append(p+r*(cos(2*pi*k/segments)*u+sin(2*pi*k/segments)*v))
    for i in range(n if closed else n-1):
        for k in range(segments):fs.append((i*segments+k,i*segments+(k+1)%segments,((i+1)%n)*segments+(k+1)%segments,((i+1)%n)*segments+k))
    if not closed:fs.extend([tuple(range(segments-1,-1,-1)),tuple((n-1)*segments+k for k in range(segments))])
    return mesh(name,vs,fs,material,True)
def sphere(name,p,scale,material,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=xyz(p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);add_obj(o,name,material)
    for poly in o.data.polygons:poly.use_smooth=True
    return o
def text(name,body,p,size,material):
    bpy.ops.object.text_add(location=xyz(p));o=bpy.context.object; o.name=name;o.data.body=body;o.data.size=size;o.data.extrude=.00015;o.data.align_x='CENTER';o.data.align_y='CENTER';o.rotation_euler=(pi/2,0,0);o.data.materials.append(M[material]);active.append(o);return o
def anchor(name,p):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(p);active.append(o);return o
def start():active.clear()
def finish(name):
    # Material batches: 6 leaf/fruit colours are a handful of draw calls, not thousands.
    objects=list(active)
    for o in objects:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        if o.type=='FONT':bpy.ops.object.convert(target='MESH')
        if o.type=='MESH':
            for mod in list(o.modifiers):
                bpy.context.view_layer.objects.active=o
                try:bpy.ops.object.modifier_apply(modifier=mod.name)
                except RuntimeError:pass
        o.select_set(False)
    extras=[o for o in objects if o.type=='EMPTY']
    mats={}
    for o in objects:
        if o.type=='MESH':mats.setdefault(o.data.materials[0].name,[]).append(o)
    joined=[]
    for m,obs in mats.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name+'__'+m.split(' · ')[0].replace(' ','_');joined.append(o)
        # Texture coordinates on woody/stair batches (box projection is intentionally subtle).
        if m in (M['bark'].name,M['concrete'].name):
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for o in joined+extras:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=True,export_materials='EXPORT')
    groups[name]=joined+extras
    corners=[o.matrix_world@Vector(v) for o in joined for v in o.bound_box]
    axes=[0,2,1]; signs=[1,1,-1]
    bounds=[[min(signs[i]*v[axes[i]] for v in corners) for i in range(3)],[max(signs[i]*v[axes[i]] for v in corners) for i in range(3)]]
    stats={'meshes':len(joined),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined),'bytes':os.path.getsize(os.path.join(OUT,name+'.glb')),'bounds':bounds}
    print('ASSET',name,json.dumps(stats));return stats

stats={}
start()
# Reusable heavy-duty carrying case: integrated base pads, lid seal, latches and true open handles.
cube('Case lower shell',(0,-.02,0),(.80,.38,.42),'case',.022)
cube('O-ring lid seal',(0,.161,0),(.806,.012,.426),'rubber',.010)
cube('Case lid',(0,.192,0),(.81,.058,.43),'case',.016)
for z in [-1,1]:
    cube('Recessed broad panel',(0,-.023,z*.211),(.62,.234,.006),'panel',.012)
    for x in [-.305,-.19,.19,.305]:cube('Moulded protective rib',(x,-.023,z*.221),(.019,.294,.017),'case',.008)
    for x in [-.255,.255]:
        cube('Latch base',(x,.128,z*.229),(.052,.097,.026),'alloy',.005)
        cube('Positive latch',(x,.123,z*.246),(.035,.067,.010),'orange',.004)
        for y in [.09,.167]:sphere('Latch screw',(x,y,z*.247),(.005,.005,.002),'rubber',8,6)
for x in [-1,1]:
    cube('Side reinforced panel',(x*.399,-.015,0),(.010,.26,.325),'panel',.008)
    for z in [-.082,.082]:
        cube('Handle boss',(x*.410,.05,z),(.032,.115,.038),'alloy',.008)
        path('Handle standoff',[(x*.42,.05,z),(x*.455,.05,z)],.011,'alloy',10)
    # Horizontal grip axis parallel Z. Its midpoint is an explicit contact marker.
    path('Rubber-cushioned side grip',[(x*.455,.05,-.083),(x*.455,.05,.083)],.014,'rubber',12)
    for z in [-.068,-.048,-.028,.028,.048,.068]:path('Handle tactile ring',[(x*.455,.05,z-.002),(x*.455,.05,z+.002)],.015,'case',10)
    anchor('Handle_L' if x<0 else 'Handle_R',(x*.455,.05,0))
for x in [-.335,.335]:
    for z in [-.15,.15]:cube('Stacking foot',(x,-.2175,z),(.091,.027,.072),'rubber',.008)
for z in [-.154,.154]:cube('Lid reinforcement',(0,.224,z),(.62,.012,.018),'panel',.006)
cube('Identification plate',(0,.013,.222),(.214,.082,.006),'rubber',.004)
text('Atlas case branding','ATLAS',(0,.024,.227),.033,'label');text('Equipment label','FIELD EQUIPMENT',(0,-.003,.227),.009,'label')
cube('Front identification plate',(0,.013,-.222),(.214,.082,.006),'rubber',.004)
o=text('Front Atlas case branding','ATLAS',(0,.024,-.227),.033,'label');o.rotation_euler=(pi/2,0,pi)
o=text('Front equipment label','FIELD EQUIPMENT',(0,-.003,-.227),.009,'label');o.rotation_euler=(pi/2,0,pi)
anchor('Ground_contact',(0,-.231,0));stats['crate']=finish('crate')

start()
for i in range(4):
    front=.16+i*.38;top=(i+1)*.20
    cube('Concrete stair riser '+str(i+1),(0,top/2,front+.19),(1.60,top,.38),'concrete',.005)
    cube('Nosing '+str(i+1),(0,top-.008,front+.014),(1.61,.026,.038),'edge',.004)
    cube('Nosing inlaid visibility stripe',(0,top+.001,front+.040),(1.43,.003,.018),'yellow',.001)
    for k in range(3):cube('Fine anti-slip groove',(0,top+.001,front+.095+k*.022),(1.44,.002,.004),'edge',.001)
cube('Continuous landing',(0,.40,(1.68+2.60)/2),(1.60,.80,.92),'concrete',.005)
for x in [-.89,.89]:
    rail=[(x,1.13,.045),(x,1.13,.10),(x,1.75,1.37),(x,1.75,2.57)]
    path('Continuous rounded handrail',rail,.024,'rail',12)
    path('Mid-height guard rail',[(x,.70,.10),(x,1.32,1.37),(x,1.32,2.57)],.013,'alloy',10)
    for i,z in enumerate([.28,1.04,1.80,2.48]):
        y=1.13+min(1,(z-.1)/1.27)*.62;floor=min(.8,.2*(math.floor((z-.16)/.38)+1))
        path('Guard rail post',[(x,floor,z),(x,y,z)],.021,'rail',10)
        cube('Flange plate',(x,floor+.008,z),(.09,.016,.09),'alloy',.006)
        sign=1 if x>0 else -1
        cube('Structural side mounting shelf',(sign*.875,floor-.008,z),(.15,.016,.12),'rail',.003)
        cube('Side wall mounting bracket',(sign*.807,floor-.073,z),(.014,.15,.12),'rail',.003)
        for dz in [-.04,.04]:sphere('Wall bracket bolt',(sign*.819,floor-.075,z+dz),(.004,.006,.006),'alloy',8,6)
        for dx in [-.031,.031]:
            for dz in [-.031,.031]:sphere('Flange bolt',(x+dx,floor+.020,z+dz),(.004,.003,.004),'alloy',8,6)
anchor('First_tread_centre',(0,.20,.35));anchor('Landing_drop_zone',(0,.80,2.13));stats['stairs']=finish('stairs')

def apple(p=(0,0,0),radius=.043,name='Apple',shade='appleA'):
    vs=[];fs=[]; seg=18;rings=12
    for j in range(rings+1):
        t=pi*j/rings;cy=cos(t);st=sin(t)
        for k in range(seg):
            a=2*pi*k/seg;lobes=1+.038*cos(5*a)*st
            r=radius*st*lobes*(1+.12*cy)
            y=radius*(.92*cy-.11*math.exp(-(t/.36)**2)+.045*math.exp(-((pi-t)/.3)**2))
            vs.append((p[0]+r*cos(a),p[1]+y,p[2]+r*sin(a)))
    for j in range(rings):
        for k in range(seg):fs.append((j*seg+k,j*seg+(k+1)%seg,(j+1)*seg+(k+1)%seg,(j+1)*seg+k))
    mesh(name,vs,fs,shade,True)
    path(name+' stem',[(p[0],p[1]+radius*.76,p[2]),(p[0]+.004,p[1]+radius*1.35,p[2]+.003)],.002,'stem',6)
def leaf(center,length,width,direction,roll,shade='leafA'):
    d=Vector(direction).normalized();u=d.cross(Vector((0,1,0)))
    if u.length<.1:u=d.cross(Vector((0,0,1)))
    u.normalize();u=u*cos(roll)+d.cross(u)*sin(roll);n=d.cross(u);c=Vector(center)
    verts=[]
    for t,w in [(0,0),(.24,.76),(.58,1),(1,0)]:
        mid=c+d*length*t+n*width*.12*sin(pi*t)
        verts.extend([mid-u*width*w/2,mid+n*width*.09*w,mid+u*width*w/2])
    faces=[]
    for i in range(3):faces.extend([(i*3,(i+1)*3,(i+1)*3+1,i*3+1),(i*3+1,(i+1)*3+1,(i+1)*3+2,i*3+2)])
    mesh('Individual curved leaf',verts,faces,shade)

start()
apple();leaf((.002,.047,0),.05,.023,(1,.05,.25),.7,'leafB');anchor('Fruit_contact_centre',(0,0,0));stats['apple']=finish('apple')

start()
# Trunk tapers and forks below a distributed crown; every leaf is an individual lamina.
trunk=[(0,0,0),(.025,.32,.008),(-.018,.80,.011),(.027,1.21,0),(.045,1.57,.055),(.12,1.91,.09),(.08,2.25,.10),(.14,2.55,.12)]
path('Irregular primary trunk',trunk,.08,'bark',12,radii=[.102,.083,.065,.052,.041,.026,.014,.005])
for a in [.2,1.8,3.4,4.9]:path('Visible root flare',[(.33*cos(a),.004,.24*sin(a)),(.09*cos(a),.05,.07*sin(a)),(0,.20,0)],.025,'bark',8,radii=[.008,.043,.055])
fruit_positions=[]
branches=[]
for i in range(15):
    az=i*2.39996;h=1.06+(i%5)*.24;length=.66+random.random()*.30; end=Vector((cos(az)*length,h+.32+random.random()*.20,sin(az)*length))
    origin=Vector((.015,h,.012));mid=origin.lerp(end,.52)+Vector((0,.12,0))
    path('Tapered primary fruit limb',[origin,mid,end],.018,'bark',8,radii=[.029-.001*(i%5),.015,.005])
    branches.append((origin,mid,end))
    for j in range(8):
        u=.32+j*.085;attach=origin.lerp(end,u)+Vector((0,.10*sin(pi*u),0));side=(-1)**j
        tangent=Vector((-sin(az),.26,cos(az)))*side
        tip=attach+tangent*(.15+random.random()*.17)+Vector((0,.08+random.random()*.1,0))
        path('Fine leafy spur',[attach,attach.lerp(tip,.55)+Vector((0,.03,0)),tip],.003,'twig',6,radii=[.0048,.0028,.0010])
        for k in range(9):
            tt=.12+k*.10;c=attach.lerp(tip,tt);d=(tip-attach).normalized()*.26+Vector((cos(az+k*2.4),random.uniform(-.4,.7),sin(az+k*2.4)))
            leaf(c,.082+random.random()*.057,.034+random.random()*.020,d,random.uniform(-1,1),['leafA','leafB','leafC'][(i+j+k)%3])
        if j in [3,6] and i%3!=1:
            p=attach.lerp(tip,.70);p.y-=.035
            apple(tuple(p),.036+random.random()*.009,'Hanging apple','appleA' if i%2 else 'appleB');fruit_positions.append(list(p))
    # Tip cluster disperses crown silhouette without opaque balls.
    for k in range(16):
        az2=k*2.4;c=end+Vector((.07*cos(az2),.025*(k%3),.07*sin(az2)))
        leaf(c,.10,.045,(cos(az2),.4+random.random()*.4,sin(az2)),random.uniform(-1,1),['leafA','leafB','leafC'][k%3])
# Accessible foreground spur. The detachable apple is supplied as a separate GLB.
pick=(-.48,1.60,-.56)
path('Accessible harvest branch',[(.01,1.33,.01),(-.24,1.58,-.25),(-.45,1.72,-.49),(-.48,1.66,-.56)],.01,'bark',8,radii=[.025,.015,.007,.003])
for k in range(18):
    a=k*2.4;leaf((-.28+cos(a)*.13,1.65+random.random()*.05,-.36+sin(a)*.12),.1,.044,(cos(a),.15,sin(a)),random.uniform(-1,1),'leafB' if k%2 else 'leafA')
anchor('Harvest_fruit_centre',pick)
# Small soil mound and naturally sparse grasses, no rectangular planter or riser.
sphere('Root-zone earth',(0,-.010,0),(.40,.03,.36),'soil',32,8)
for i in range(65):
    a=random.random()*2*pi;r=.26+random.random()*.16;c=Vector((cos(a)*r,.005,sin(a)*r))
    for j in range(3):
        d=Vector((random.uniform(-.035,.035),random.uniform(.035,.09),random.uniform(-.035,.035)))
        mesh('Meadow blade',[c+Vector((-.003,0,0)),c+Vector((.003,0,0)),c+d],[(0,1,2)],'grass')
stats['apple-tree']=finish('apple-tree')

start()
# Elliptic open weave basket. 40 vertical ribbons interlace with 18 hoop ribbons.
def basketpt(a,v,offset=0):
    rx=.177+.057*v;rz=.115+.048*v
    return Vector(((rx+offset)*cos(a),.020+.235*v,(rz+offset)*sin(a)))
for j in range(40):
    a=2*pi*j/40;verts=[]
    for k in range(73):
        v=k/72;off=.0022*cos(2*pi*v*18+pi*j)
        for da in [-.021,.021]:verts.append(basketpt(a+da,v,off))
    mesh('Interwoven upright willow',verts,[(2*k,2*k+1,2*k+3,2*k+2) for k in range(72)],'wickerA' if j%3 else 'wickerB',True)
for j in range(18):
    v=(j+.5)/18;verts=[]
    for k in range(161):
        a=2*pi*k/160;off=-.0024*cos(a*40+pi*j)
        for dv in [-.018,.018]:verts.append(basketpt(a,v+dv,off))
    mesh('Interwoven horizontal willow',verts,[(2*k,2*k+1,2*k+3,2*k+2) for k in range(160)],'wickerB' if j%3 else 'wickerA',True)
path('Bound open basket rim',[tuple(basketpt(2*pi*k/100,1)) for k in range(100)],.008,'wickerA',8,True)
path('Double rim weave',[tuple(basketpt(2*pi*k/100,.962,.003)) for k in range(100)],.005,'wickerB',8,True)
for j in range(-9,10):
    z=j*.012;half=.168*math.sqrt(max(0,1-(z/.112)**2))
    if half>0:cube('Flat woven basket base',(0,.017,z),(half*2,.006,.009),'wickerA',.002)
# One real bail handle, with leather grip; centre grip is human-hand target.
handle=[(.228*cos(pi*k/64),.244+.30*sin(pi*k/64),0) for k in range(65)]
path('Basket carrying arch',handle,.011,'wickerA',10)
path('Wrapped centre hand grip',handle[25:40],.014,'rubber',10)
for x in [-.228,.228]:sphere('Bail attachment',(x,.245,0),(.022,.025,.020),'wickerB',12,8)
anchor('Human_carry_grip',(0,.544,0));anchor('Basket_floor_centre',(0,.021,0));anchor('Fruit_drop_target',(0,.28,0));stats['basket']=finish('basket')

manifest={
 'coordinateSystem':'metres, +Y up, +Z forward; root rotations identity',
 'license':'Original procedural geometry and texture pixels generated for EXO Forge; no third-party downloaded assets',
 'crate':{'centreOnGround':[0,.231,0],'bodyDimensions':[.81,.461,.43],'handleTargets':[[-.455,.05,0],[.455,.05,0]],'handleAxis':[0,0,1],'handleRadius':.014,'groundOffset':-.231},
 'stairs':{'origin':[0,0,0],'width':1.60,'riserHeight':.20,'treadDepth':.38,'firstNoseZ':.16,'treadCentres':[[0,.20,.35],[0,.40,.73],[0,.60,1.11],[0,.80,1.49]],'landing':{'topY':.80,'frontZ':1.68,'backZ':2.60},'railX':[-.89,.89],'recommendedAnkleTargets':[[0,.20,.30],[0,.40,.68],[0,.60,1.06],[0,.80,1.44]]},
 'apple-tree':{'suggestedPosition':[.95,0,1.10],'harvestFruitLocal':list(pick),'harvestFruitWorld':[.47,1.60,.54],'attachedApples':fruit_positions,'roughBounds':[-1.1,0,-1.1,1.1,2.7,1.1]},
 'apple':{'radius':.043,'origin':'fruit centre','stemTopY':.058},
 'basket':{'origin':'lower datum; actual woven bottom y=.014','humanGripLocal':[0,.544,0],'floorCentre':[0,.021,0],'fruitRestCentre':[0,.058625,0],'dropTarget':[0,.28,0],'dimensions':[.49,.56,.35]},
 'stats':stats,
 'notes':['Named Empty anchors export as glTF nodes.','All meshes are merged per material for bounded draw calls.','Rendering-only design assets; no load-bearing or manufactured geometry claim.']
}
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)

# Collection scene is saved for review; exported prop transforms remain zero.
for name,objects in groups.items():
    for o in objects:o.hide_render=True
def show(name,pos):
    for o in groups[name]:o.hide_render=False;o.location+=xyz(pos)
show('stairs',(-.42,0,.15));show('crate',(-.50,.231,-.54));show('apple-tree',(1.75,0,.80));show('basket',(1.19,0,-.47));show('apple',(1.75-.48,1.60,.80-.56))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='Review floor';floor.data.materials.append(mat('Review floor',(.72,.745,.70),.92))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.77,.83,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
def area(name,p,power,size):
    bpy.ops.object.light_add(type='AREA',location=xyz(p));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(xyz((.3,1,.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(1,6,-3),1300,5);area('Cool fill',(-4,3,-1),450,4);area('Sunlit orchard rim',(3,5,5),900,4)
bpy.ops.object.camera_add(location=xyz((5.2,3.6,-6.2)));cam=bpy.context.object;cam.rotation_euler=(xyz((.45,1.15,.70))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=5.4;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True;scene.render.resolution_x=1440;scene.render.resolution_y=1120;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.65;scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'environment-review.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'environment-source.blend'));bpy.ops.render.render(write_still=True)
print('DONE',OUT)
