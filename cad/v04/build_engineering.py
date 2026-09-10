"""ATLAS R04 — corrective engineering review, not a released production design.

Reuses the R03 part definitions, but replaces the flawed joints and cosmetic
surfaces. Millimetres, Z up, -Y forward. All display metal/plastic comes from CAD.
"""
from pathlib import Path
import importlib.util
import json, math, shutil
import cadquery as cq
import numpy as np
import trimesh
from OCP.gp import gp_Trsf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'cad/v04/output'
PUBLIC = ROOT / 'public/assets/v04'
spec = importlib.util.spec_from_file_location('atlas_r03_cad', ROOT/'cad/v03/build_engineering.py')
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
CFG = dict(b.CFG)
CFG.update(revision='ATLAS-R04', hingePinDiameter=8, hingeBoreDiameter=8.4,
           shellStyle='faceted loft / removable skin', displays=3)
CFG['materialPalette'] = dict(CFG['materialPalette'], ceramic='#d4dbe1',
    titanium='#7f909d', graphite='#202b35', lime='#c3ed59', screen='#071b26', red='#e8583e')
CFG['designStatus'] = 'Detailed development input; NOT a manufacturing release. Fit and safety gates remain open.'

def faceted_shell(length, width, depth, wall=3, open_back=True):
    """Continuous tapered loft with broad faces and deliberate corner breaks."""
    def loft(inner):
        wires=[]
        for t,s in [(0,.60),(.10,.82),(.32,1),(.75,.95),(1,.66)]:
            x=width*s/2-(wall if inner else 0); y=depth*s/2-(wall if inner else 0)
            c=min(x*.28,y*.62)
            points=[(-x+c,-y),(x-c,-y),(x,-y+c),(x,y-c),
                    (x-c,y),(-x+c,y),(-x,y-c),(-x,-y+c)]
            wires.append(cq.Workplane('XY',origin=(0,0,(t-.5)*length)).polyline(points).close().val())
        return cq.Workplane(obj=cq.Solid.makeLoft(wires,ruled=False))
    q=loft(False).cut(loft(True))
    if open_back:q=q.cut(b.rounded(width*2,depth*2,length*1.2,0).translate((0,depth,0)))
    return q

def remove(*keys):
    b.INSTANCES[:]=[i for i in b.INSTANCES if i['part'] not in keys]
    for key in keys:b.PARTS.pop(key,None)

def display(key, size, position, axis, side='C'):
    w,h=size
    box=b.rounded(w+16,h+16,14,5).cut(b.rounded(w+8,h+8,14,3).translate((0,0,4)))
    rim=b.rounded(w+16,h+16,5,5).cut(b.rounded(w,h,20,3))
    holes=[(-w/2-4,-h/2-4),(w/2+4,-h/2-4),(-w/2-4,h/2+4),(w/2+4,h/2+4)]
    b.add(key+'_HOUSING','P02',key.split('_')[-1]+' 显示器底壳',box,'graphite','electronics','电子外壳样件')
    b.add(key+'_BEZEL','P02',key.split('_')[-1]+' 螺钉固定显示边框',b.bore(rim,holes,2.8),'titanium','electronics')
    b.add(key+'_GLASS','P02',key.split('_')[-1]+' 显示盖板 / '+str(w)+' × '+str(h),b.rounded(w-.8,h-.8,1.8,3),'screen','electronics','玻璃/聚合物盖板包络')
    p=np.array(position);n=np.array(axis,dtype=float);n/=np.linalg.norm(n)
    for suffix,offset in [('HOUSING',-7),('BEZEL',2.5),('GLASS',4.2)]:
        b.place(key+'_'+suffix,p+n*offset,n,side)

def build():
    b.PARTS.clear();b.INSTANCES.clear();b.hollow_shell=faceted_shell;b.build()
    # Previous cuffs were positioned for warped thighs; open them for fit review.
    for key in ['L02_COLOR_INSERT','L04_COLOR_INSERT','A01_DELTOID_INLAY','A02_ARM_INLAY']:
        b.PARTS[key]['material']='graphite'
    # A true opening for the chest HMI replaces the painted identification tile.
    remove('H01_BADGE')
    b.PARTS['H01_CHEST_PLATE']['shape']=b.PARTS['H01_CHEST_PLATE']['shape'].cut(
        b.rounded(132,130,74,3).translate((0,-35,12)))
    display('P02_HMI_CHEST',(120,64),(0,-223,1342),(0,-1,0))
    display('P02_HMI_SERVICE',(110,42),(0,244,1452),(0,1,0))
    display('P02_HMI_WRIST',(64,38),(-310,-211,1100),(0,-.65,.76),'L')
    b.add('H03_HMI_BRACKET','H03','前臂显示器固定支架',b.bore(b.rounded(58,34,6,3),[(-20,0),(20,0)],3.4),'titanium')
    b.place('H03_HMI_BRACKET',(-304,-197,1092),(0,-.65,.76),'L')
    # Link, pivot and grip now form one continuous master-control assembly.
    a=np.array([283,-110,1106]);c=np.array([309,-182,1050]);length=float(np.linalg.norm(c-a))
    b.add('H03_FOREARM_LINK','H03','连接肘轴与握把的闭口连杆',b.rail(length,18,14),'graphite')
    b.add('H03_GRIP_COLLAR','H03','握把上端固定套',b.rounded(34,41,24,5),'titanium')
    # Rebase the master-control arm on the pelvic interface instead of letting
    # its upper end float next to the upper arm. R04 remains a kinematic layout.
    h03keys={k for k,v in b.PARTS.items() if v['family']=='H03' and k not in ['H03_HMI_BRACKET']}
    b.INSTANCES[:]=[i for i in b.INSTANCES if i['part'] not in h03keys]
    upper_length=float(np.linalg.norm(np.array([283,-110,1106])-np.array([243,-40,996])))
    b.PARTS['H03_MASTER_LINK']['shape']=b.rail(upper_length,16,12)
    b.add('H03_PELVIC_MOUNT','H03','主控臂骨盆端固定座',b.bore(b.rounded(28,45,48,4),[(0,-13),(0,13)],5.5),'titanium')
    for s in [-1,1]:
        side='L' if s<0 else 'R'
        b.place('H03_PELVIC_MOUNT',(s*236,-39,977),side=side)
        b.between('H03_MASTER_LINK',(s*243,-40,996),(s*283,-110,1106),side)
        b.place_hub('H03',(s*283,-110,1106),(s,0,0),side,34,17)
        b.between('H03_FOREARM_LINK',(s*283,-110,1106),(s*309,-182,1050),side)
        b.place('H03_GRIP_COLLAR',(s*309,-182,1050),side=side)
        b.place('H03_GRIP',(s*311,-194,1006),side=side)
    # Parallel jaws extend along the same tool axis; rotation only mirrors the
    # inward-facing fingertips. The original XY jaw was reversed end-for-end.
    remove('A04_JAW','A04_PAD')
    finger=b.rounded(12,20,70,2).translate((0,0,24)).union(b.rounded(24,20,14,2).translate((-6,0,54)))
    b.add('A04_PARALLEL_JAW','A04','同向平行夹指 / 内扣指尖',finger,'titanium')
    b.add('A04_CONTACT_PAD','A04','夹指内侧摩擦垫',b.rounded(4,20,14,1),'rubber','soft')
    for s in [-1,1]:
        side='L' if s<0 else 'R';elbow=np.array((s*441,20,1086));wrist=np.array((s*440,-268,974));w=wrist-elbow;w=w/np.linalg.norm(w)
        for dx in [-30,30]:
            b.place('A04_PARALLEL_JAW',wrist+w*94+np.array([dx,0,0]),w,side,180 if dx<0 else 0)
            b.place('A04_CONTACT_PAD',wrist+w*148+np.array([10 if dx>0 else -10,0,0]),w,side)
    # Replace Ø12 tube / Ø12 lug with a real Ø8 pin and 8.4 prototype bore.
    remove('L06_TOE_HINGE','L06_HINGE_LUG')
    b.add('L06_TOE_PIN','L06','前掌铰链实体销轴 / Ø8 × 124',b.disc(4,124),'steel','hardware','金属销轴候选')
    ring=b.disc(7,8,8.4)
    for name,dy in [('HEEL',10),('TOE',-10)]:
        lug=b.bore(ring.union(b.rounded(13,18,8,1).translate((5,dy,0))),[(0,0)],8.4)
        b.add('L06_HINGE_'+name,'L06',('后足' if name=='HEEL' else '前掌')+'铰链耳 / Ø8.4',lug,'titanium')
    b.add('L06_PIN_RETAINER','L06','铰链销轴端部限位环',b.disc(6.5,3,8.2),'graphite','hardware')
    for s in [-1,1]:
        side='L' if s<0 else 'R'
        b.place('L06_TOE_PIN',(s*110,-99,22),(1,0,0),side)
        for dx in [-40,40]:b.place('L06_HINGE_HEEL',(s*110+dx,-99,22),(1,0,0),side)
        for dx in [-51,51]:b.place('L06_HINGE_TOE',(s*110+dx,-99,22),(1,0,0),side)
        for dx in [-59,59]:b.place('L06_PIN_RETAINER',(s*110+dx,-99,22),(1,0,0),side)
    # These adapters make the previously missing leg-to-drive connections visible.
    for fam,length,width in [('L02',90,43),('L04',64,35)]:
        clamp=b.rounded(width+12,36,length,4).cut(b.rounded(width+.6,28,length+2,2))
        b.add(fam+'_END_SOCKET',fam,'承力管端部插接套 / 待配合定型',clamp,'titanium')
    b.add('L05_AXLE','L05','踝叉实体轴 / Ø12 × 54',b.disc(6,54),'steel','hardware')
    b.add('L05_AXLE_ADAPTER','L05','踝轴到轴承内环适配套',b.disc(11.8,12,12.2),'steel','hardware')
    for s in [-1,1]:
        side='L' if s<0 else 'R'
        for z,x in [(881,230),(545,200)]:b.place('L02_END_SOCKET',(s*x,4,z),side=side)
        for z,x in [(419,191),(151,178)]:b.place('L04_END_SOCKET',(s*x,0,z),side=side)
        b.place('L05_AXLE',(s*180,-3,112),(s,0,0),side)
        b.place('L05_AXLE_ADAPTER',(s*176,-3,112),(s,0,0),side)
    # End caps no longer show an unexplained through-hole at the encoder cover.
    for fam,d in [('L01',92),('L03',86),('L05',66),('A01',112),('A03',96),('A04',68),('H03',34)]:
        b.PARTS[fam+'_CAP']['shape']=b.disc(d*.26,5).cut(b.rounded(d*.2,d*.12,3,1).translate((0,0,-2)))
    # Chest-accessible emergency stop retains a physical, independently named part.
    b.PARTS['P02_ESTOP']['material']='red'
    for inst in b.INSTANCES:
        if inst['part']=='P02_ESTOP':inst['matrix'][1][3]=-226
    # Thin vent dividers and service latches provide a readable surface hierarchy.
    b.add('A01_VENT_BLADE','A01','肩盖散热口分隔片',b.rounded(56,5,5,1),'titanium','hardware')
    b.add('A02_SERVICE_LATCH','A02','上臂护壳快拆锁扣',b.rounded(17,9,25,2),'lime','hardware')
    b.add('L04_SERVICE_LATCH','L04','小腿维护盖锁扣',b.rounded(13,8,19,2),'lime','hardware')
    for s in [-1,1]:
        side='L' if s<0 else 'R'
        for z in [1440,1451,1462]:b.place('A01_VENT_BLADE',(s*394,23,z),side=side)
        b.place('A02_SERVICE_LATCH',(s*415,-8,1190),side=side)
        b.place('L04_SERVICE_LATCH',(s*182,-61,310),side=side)
    return b.PARTS,b.INSTANCES

def export():
    for d in [OUT,OUT/'step',OUT/'stl',OUT/'preview',PUBLIC,PUBLIC/'step']:d.mkdir(parents=True,exist_ok=True)
    records=[];asm=cq.Assembly(name='EXO_ATLAS_R04')
    for key,part in b.PARTS.items():
        shape=part['shape'];solids=shape.solids().vals()
        if not solids:raise ValueError('Empty CAD part '+key)
        compound=cq.Compound.makeCompound(solids)
        cq.exporters.export(compound,str(OUT/'step'/f'{key}.step'))
        cq.exporters.export(compound,str(OUT/'stl'/f'{key}.stl'),tolerance=.10,angularTolerance=.12)
        mesh=trimesh.load_mesh(OUT/'stl'/f'{key}.stl',process=True)
        verts,faces=compound.tessellate(.12,.13)
        (OUT/'preview'/f'{key}.json').write_text(json.dumps({'vertices':[list(v.toTuple()) for v in verts],'faces':faces},separators=(',',':')))
        record={k:v for k,v in part.items() if k!='shape'}
        record.update(id=key,validBRep=all(s.isValid() for s in solids),solidCount=len(solids),
            watertight=bool(mesh.is_watertight),positiveVolume=bool(mesh.volume>0),
            boundsMm=np.round(mesh.extents,2).tolist(),volumeMm3=round(float(mesh.volume),2),
            triangles=len(mesh.faces),quantity=sum(i['part']==key for i in b.INSTANCES))
        records.append(record)
        shutil.copy2(OUT/'step'/f'{key}.step',PUBLIC/'step'/f'{key}.step')
        print(f"{len(records)}/{len(b.PARTS)} {key} valid={record['validBRep']} closed={record['watertight']}",flush=True)
    for inst in b.INSTANCES:
        p=b.PARTS[inst['part']];m=np.array(inst['matrix']);t=gp_Trsf();t.SetValues(*m[:3,:].reshape(-1).tolist())
        color=CFG['materialPalette'][p['material']].lstrip('#')
        asm.add(p['shape'],name=inst['id'],loc=cq.Location(t),color=cq.Color(*[int(color[i:i+2],16)/255 for i in (0,2,4)]))
    asm.save(str(OUT/'EXO_ATLAS_R04_ASSEMBLY.step'))
    # This is a dimensional gate only, not an implied assembly certification.
    interfaces={
        'hingePinDiameterMm':8,'hingeBoreDiameterMm':8.4,'diametralGapMm':.4,
        'pinLengthMm':124,'outerLugSpanMm':110,'pinProjectionEachEndMm':7,
        'gripLinkAdded':True,'ankleAxleAdded':True,
        'productionFit':'NOT SPECIFIED','wholeAssemblyInterference':'NOT VALIDATED',
        'hardwareSelection':'NOT COMPLETE','strength':'NOT RUN','physicalPrint':'NOT RUN'}
    validation={'revision':'ATLAS-R04','units':'mm','partDefinitions':len(records),
        'instances':len(b.INSTANCES),'families':sorted(set(p['family'] for p in records)),
        'validBRep':sum(p['validBRep'] for p in records),'watertight':sum(p['watertight'] for p in records),
        'positiveVolume':sum(p['positiveVolume'] for p in records),
        'pass':all(p['validBRep'] and p['watertight'] and p['positiveVolume'] for p in records),
        'interfaces':interfaces,'reviewGate':'DEVELOPMENT INPUT — NOT PRODUCTION RELEASE'}
    assembly={'config':CFG,'parts':records,'instances':b.INSTANCES}
    for name,data in [('assembly.json',assembly),('validation.json',validation)]:
        (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2));shutil.copy2(OUT/name,PUBLIC/name)
    (ROOT/'cad/v04/design.json').write_text(json.dumps(CFG,ensure_ascii=False,indent=2))
    print(json.dumps(validation,indent=2),flush=True)
    if not validation['pass']:raise SystemExit(2)

if __name__=='__main__':build();export()
