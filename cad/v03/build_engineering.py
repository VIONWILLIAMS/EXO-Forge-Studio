#!/usr/bin/env python3
"""ATLAS R03: dimensioned B-Rep parts and one shared assembly for CAD and renders.

Millimetres, Z up, -Y forward. No render-only substitution for CAD components.
CAD/STL validation checks geometry only; it does not certify a wearable device.
"""
from pathlib import Path
from collections import Counter
import json, math, zipfile, shutil
import cadquery as cq
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "cad/v03/output"
CFG = json.loads((ROOT / "cad/v03/design.json").read_text())
PARTS, INSTANCES = {}, []

def rounded(w, d, h, r=2):
    q = cq.Workplane("XY").box(w,d,h)
    return q.edges("|Z").fillet(min(r,w/5,d/5)) if r else q

def disc(r, h, bore=0):
    p=cq.Workplane("XY").circle(r)
    if bore: p=p.circle(bore/2)
    return p.extrude(h/2,both=True)

def bore(q, pts, diameter, depth=400):
    return q.cut(cq.Workplane("XY").pushPoints(pts).circle(diameter/2).extrude(depth,both=True))

def circular_holes(q, count, pcd, dia):
    return bore(q,[(pcd/2*math.cos(i*math.tau/count),pcd/2*math.sin(i*math.tau/count)) for i in range(count)],dia)

def flange(r,h,center,pcd,count=8):
    return circular_holes(disc(r,h,center),count,pcd,4.5).edges("%Circle").chamfer(.45)

def hollow_shell(length,width,depth,wall=3,open_back=True):
    def loft(inner=False):
        w=[]
        for t,scale in [(0,.65),(.12,.95),(.40,1),(.78,.78),(1,.56)]:
            rx=width/2*scale-(wall if inner else 0)
            ry=depth/2*scale-(wall if inner else 0)
            w.append(cq.Workplane("XY",origin=(0,0,(t-.5)*length)).ellipse(rx,ry).val())
        return cq.Workplane(obj=cq.Solid.makeLoft(w))
    q=loft().cut(loft(True))
    if open_back:q=q.cut(rounded(width*2,depth*2,length*1.2,0).translate((0,depth,0)))
    return q

def rail(length,width=42,depth=22):
    q=rounded(width,depth,length,3)
    inner=rounded(width-10,depth-8,length+2,1.5)
    q=q.cut(inner)
    # Structural tube walls have a longitudinal inspection channel.
    return q

def panel_pair(full,width,height,z):
    # Matched inset cut from the same loft. A 1 mm perimeter gap prevents coplanar seams.
    aperture=rounded(width+2,140,height+2,2).translate((0,-72,z))
    insert=full.intersect(rounded(width,140,height,2).translate((0,-72,z)))
    return full.cut(aperture),insert

def plate_outline(points,h):
    return cq.Workplane("XY").polyline(points).close().extrude(h/2,both=True).edges("|Z").fillet(3)

def add(key,family,name,shape,mat="titanium",layer="frame",process="机加工候选",notes=""):
    PARTS[key]={"family":family,"name":name,"shape":shape,"material":mat,"layer":layer,"process":process,"notes":notes}
    return key

def place(key,pos=(0,0,0),axis=(0,0,1),side="C",spin=0):
    v=np.asarray(axis,float); v/=np.linalg.norm(v)
    up=np.array([0.,0.,1.]); cross=np.cross(up,v); dot=np.clip(np.dot(up,v),-1,1)
    if np.linalg.norm(cross)<1e-8:
        rot=trimesh.transformations.rotation_matrix(math.pi if dot<0 else 0,[1,0,0])
    else: rot=trimesh.transformations.rotation_matrix(math.acos(dot),cross)
    if spin:rot=rot @ trimesh.transformations.rotation_matrix(math.radians(spin),[0,0,1])
    rot[:3,3]=pos
    INSTANCES.append({"part":key,"side":side,"matrix":rot.tolist(),"id":f"{key}_{side}_{len(INSTANCES):03d}"})

def between(key,a,b,side="C",spin=0):
    a,b=np.array(a),np.array(b)
    place(key,(a+b)/2,b-a,side,spin)

def bolts(center,axis,pcd,count=8,side="C",family="A01"):
    p=np.asarray(center,float); n=np.asarray(axis,float); n/=np.linalg.norm(n)
    u=np.cross(n,[0,0,1])
    if np.linalg.norm(u)<.01:u=np.array([1.,0.,0.])
    u/=np.linalg.norm(u);v=np.cross(n,u)
    for i in range(count):
        loc=p+pcd/2*(math.cos(i*math.tau/count)*u+math.sin(i*math.tau/count)*v)
        place(f"{family}_M4_SOCKET",loc,n,side)

def socket(family):
    key=f"{family}_M4_SOCKET"
    if key not in PARTS:
        q=disc(3.5,4).union(disc(2,10).translate((0,0,-5)))
        hexcut=cq.Workplane("XY").polygon(6,3.1).extrude(3).translate((0,0,.1))
        add(key,family,"M4 内六角紧固件示意",q.cut(hexcut),"steel","hardware","标准件占位")

def hub(family,diameter=98,width=42):
    r=diameter/2
    add(f"{family}_HOUSING",family,"同轴驱动壳 / 电机与减速器安装腔",disc(r,width,diameter*.48),"graphite","frame")
    add(f"{family}_FLANGE",family,"输出轴承法兰 / 8×Ø4.5 孔",flange(r+3,5,diameter*.45,diameter*.79),"steel","frame")
    add(f"{family}_COVER",family,"可拆驱动端盖 / 环形识别圈",disc(r-2,8,diameter*.56),"lime","shell","外壳打印样件候选")
    add(f"{family}_CAP",family,"编码器检查盖",disc(diameter*.26,5,10),"graphite","hardware")
    add(f"{family}_BEARING",family,"轴承占位环",disc(diameter*.255,12,diameter*.36),"steel","hardware","标准件包络，待选型")
    socket(family)

def place_hub(family,center,axis,side,diameter=98,width=42):
    c=np.asarray(center); n=np.asarray(axis,float);n/=np.linalg.norm(n)
    place(f"{family}_HOUSING",c,n,side)
    place(f"{family}_FLANGE",c+n*(width/2+2.5),n,side)
    place(f"{family}_COVER",c-n*(width/2+4),n,side)
    place(f"{family}_CAP",c-n*(width/2+10),n,side)
    place(f"{family}_BEARING",c,n,side)
    bolts(c+n*(width/2+7),n,diameter*.79,8,side,family)

def build():
    # Dorsal load frame: machined bridge, two rails, separate shoulder shells.
    bridge=[(-320,-40),(-264,-68),(-168,-35),(-68,-21),(68,-21),(168,-35),(264,-68),(320,-40),(320,32),(249,44),(150,18),(-150,18),(-249,44),(-320,32)]
    q=plate_outline(bridge,14)
    q=bore(q,[(-282,0),(282,0),(-66,0),(66,0)],8.5)
    add("F01_SCAPULAR_BRIDGE","F01","肩胛承力桥 / 640 mm",q,"titanium")
    place("F01_SCAPULAR_BRIDGE",(0,170,1400),(0,1,0))
    add("F02_DORSAL_RAIL","F02","双轨脊柱承力梁 / 370 mm",rail(370,32,26),"graphite")
    add("F02_SLIDE_BLOCK","F02","躯干长度调整滑块",bore(rounded(52,58,24,5),[(-15,0),(15,0)],5.5),"steel")
    for s in [-1,1]:
        side="L" if s<0 else "R"
        place("F02_DORSAL_RAIL",(s*62,149,1180),side=side)
        for z in [1040,1295]:place("F02_SLIDE_BLOCK",(s*62,149,z),(0,1,0),side)
    add("F02_VERTEBRA_GUARD","F02","分节防夹背甲",hollow_shell(66,104,62,3),"ceramic","shell","3 mm 外壳")
    for z in [1040,1110,1180,1250]:place("F02_VERTEBRA_GUARD",(0,194,z),spin=180)
    # Curved pelvic saddle, open anterior for entry; split rail segments.
    belt=cq.Workplane("XY").ellipse(228,155).ellipse(214,141).extrude(22,both=True)
    belt=belt.cut(rounded(500,260,70).translate((0,-220,0)))
    add("F03_PELVIC_SADDLE","F03","骨盆承力鞍 / 前开口",belt,"titanium")
    place("F03_PELVIC_SADDLE",(0,0,948))
    add("F03_SIDE_SHELL","F03","髋外侧曲面护盖",hollow_shell(164,118,62,3),"ceramic","shell","3 mm 外壳")
    add("H01_CHEST_PAD","H01","胸前承托垫",hollow_shell(200,270,50,7),"graphite","soft","软垫/织物")
    place("H01_CHEST_PAD",(0,-166,1315),spin=0)
    add("H01_CHEST_PLATE","H01","胸部快卸接口护板",hollow_shell(148,240,52,3),"ceramic","shell")
    place("H01_CHEST_PLATE",(0,-194,1330))
    add("H01_BADGE","H01","胸部设备标识面板",rounded(74,40,3,4),"lime","shell")
    place("H01_BADGE",(0,-224,1345),(0,-1,0))
    add("H02_CUFF","H02","大腿/小腿开放承托环",cq.Workplane("XY").ellipse(77,79).ellipse(69,71).extrude(18,both=True).cut(rounded(180,160,60).translate((0,-122,0))),"graphite","soft")
    # Conformal leg rails. Hubs sit outside anatomical joint centres.
    for fam,d,w in [("L01",92,36),("L03",86,32),("L05",66,26),("A01",112,48),("A03",96,40),("A04",68,30),("H03",34,17)]:hub(fam,d,w)
    add("L02_THIGH_RAIL","L02","大腿外侧承力管 / 350 mm",rail(350,43,27),"graphite")
    add("L04_SHANK_RAIL","L04","小腿外侧承力管 / 278 mm",rail(278,35,23),"graphite")
    thigh_shell,thigh_insert=panel_pair(hollow_shell(335,106,60,3),58,100,-70)
    shank_shell,shank_insert=panel_pair(hollow_shell(286,84,48,3),44,132,0)
    add("L02_THIGH_SHELL","L02","分离式大腿流线护壳",thigh_shell,"ceramic","shell","3 mm 曲面壳")
    add("L04_SHANK_SHELL","L04","小腿胫侧流线护壳",shank_shell,"ceramic","shell","3 mm 曲面壳")
    add("L02_COLOR_INSERT","L02","大腿外壳嵌件",thigh_insert,"lime","shell")
    add("L04_COLOR_INSERT","L04","胫侧识别护片",shank_insert,"lime","shell")
    add("L02_TIE_LUG","L02","承托环到承力轨连接耳",bore(rounded(87,25,8),[(-31,0),(31,0)],5.5),"steel")
    # The sole follows the shoe, split at the metatarsal flex line.
    outline=[(-40,72),(-55,46),(-57,-45),(-61,-130),(-47,-188),(-20,-209),(25,-207),(53,-184),(62,-120),(55,-20),(50,48),(32,74)]
    sole=plate_outline(outline,6)
    heel=sole.intersect(rounded(160,180,30).translate((0,-9,0)))
    toe=sole.intersect(rounded(160,115,30).translate((0,-159.5,0)))
    heel=bore(heel,[(-40,35),(40,35),(-41,-62),(41,-62)],5.5)
    toe=bore(toe,[(-30,-141),(30,-141)],5.5)
    add("L06_HEEL_PLATE","L06","足跟与足弓承力板 / 6 mm",heel,"titanium")
    add("L06_FOREFOOT_PLATE","L06","前掌分段承力板 / 6 mm",toe,"titanium")
    add("L06_TREAD_HEEL","L06","可更换足跟防滑垫",cq.Workplane(obj=heel.val().scale(.97)),"rubber","soft","橡胶件")
    add("L06_TREAD_TOE","L06","可更换前掌防滑垫",cq.Workplane(obj=toe.val().scale(.97)),"rubber","soft","橡胶件")
    heelcup=cq.Workplane("XY").ellipse(61,68).ellipse(55,62).extrude(32,both=True)
    heelcup=heelcup.cut(rounded(160,160,100).translate((0,-80,0)))
    add("L06_HEEL_CUP","L06","随鞋跟包覆的后跟杯",heelcup,"ceramic","shell")
    # Ankle fork: true pin bore and two mounting bores in the plane of the plate.
    ankle=plate_outline([(-45,-90),(-43,-54),(-20,8),(0,23),(22,9),(44,-54),(43,-90)],8)
    ankle=bore(ankle,[(0,0)],12)
    ankle=bore(ankle,[(-32,-74),(32,-74)],5.5)
    add("L05_ANKLE_FORK","L05","踝关节双耳叉架 / Ø12 轴孔",ankle,"titanium")
    add("L06_TOE_HINGE","L06","前掌横向转轴 / Ø8",disc(6,92,8),"steel")
    add("L06_HINGE_LUG","L06","前掌铰链座",disc(12,15,12).union(rounded(24,17,15).translate((0,-10,0))),"graphite")
    for s in [-1,1]:
        side="L" if s<0 else "R"
        hip=(s*235,0,947); knee=(s*193,-4,478); ankle=(s*176,-3,112)
        place_hub("L01",hip,(s,0,0),side,92,36)
        place_hub("L03",knee,(s,0,0),side,86,32)
        place_hub("L05",ankle,(s,0,0),side,66,26)
        between("L02_THIGH_RAIL",(s*231,7,890),(s*195,2,540),side)
        between("L04_SHANK_RAIL",(s*192,0,429),(s*177,-1,151),side)
        between("L02_THIGH_SHELL",(s*242,-30,881),(s*202,-29,546),side)
        between("L04_SHANK_SHELL",(s*189,-36,426),(s*175,-30,140),side)
        between("L02_COLOR_INSERT",(s*242,-30,881),(s*202,-29,546),side)
        between("L04_COLOR_INSERT",(s*189,-36,426),(s*175,-30,140),side)
        place("F03_SIDE_SHELL",(s*244,-6,979),(0,0,1),side,90*s)
        for z,x in [(775,116),(590,110),(337,107)]:
            place("H02_CUFF",(s*x,0,z),side=side)
            place("L02_TIE_LUG",(s*(x+46),7,z),side=side)
        for part,z in [("L06_HEEL_PLATE",16),("L06_FOREFOOT_PLATE",16),("L06_TREAD_HEEL",7),("L06_TREAD_TOE",7),("L06_HEEL_CUP",53)]:
            place(part,(s*110,0,z),side=side)
        place("L05_ANKLE_FORK",(s*166,-3,108),(s,0,0),side,90*s)
        place("L06_TOE_HINGE",(s*110,-99,20),(1,0,0),side)
        for x in [-44,44]:place("L06_HINGE_LUG",(s*110+x,-99,20),(1,0,0),side)
    # Bilateral external manipulators: 3 shoulder axes + elbow + forearm roll + 2 wrist axes.
    add("A01_YAW_BASE","A01","肩偏航基座",flange(57,26,36,86),"graphite")
    add("A01_YOKE","A01","肩关节正交叉架",plate_outline([(-74,-50),(-56,-64),(56,-64),(74,-50),(74,58),(48,58),(48,-31),(-48,-31),(-48,58),(-74,58)],14),"titanium")
    shoulder_shell,shoulder_insert=panel_pair(hollow_shell(158,156,96,3),90,66,12)
    add("A01_DELTOID_SHELL","A01","肩峰分体曲面护罩",shoulder_shell,"ceramic","shell")
    add("A01_DELTOID_INLAY","A01","肩峰识别嵌板",shoulder_insert,"lime","shell")
    add("A02_ARM_RAIL","A02","上臂封闭承力梁",rail(268,60,40),"graphite")
    arm_shell=hollow_shell(268,108,78,3)
    for z in [-40,-14,12,38]:arm_shell=arm_shell.cut(rounded(48,120,6,1).translate((0,0,z)))
    arm_shell,arm_insert=panel_pair(arm_shell,59,50,-87)
    add("A02_ARM_SHELL","A02","上臂通风分体护壳",arm_shell,"ceramic","shell")
    add("A02_ARM_INLAY","A02","上臂外侧识别板",arm_insert,"lime","shell")
    add("A04_FOREARM_RAIL","A04","前臂双壁承力梁",rail(227,48,32),"graphite")
    add("A04_FOREARM_SHELL","A04","前臂可拆服务护壳",hollow_shell(221,99,72,3),"ceramic","shell")
    add("A04_ROLL","A04","前臂轴向滚转支承",flange(42,25,31,66),"graphite")
    add("A04_TOOL_FLANGE","A04","末端四孔工具接口 / Ø50 孔距",circular_holes(disc(34,9,20),4,50,5.5),"steel")
    add("A04_PALM","A04","平行夹爪安装座",bore(rounded(93,50,26,8),[(-33,0),(33,0)],5.5),"graphite")
    jaw=plate_outline([(-12,-23),(-12,40),(-6,60),(15,60),(15,47),(2,47),(2,-23)],12)
    add("A04_JAW","A04","工具夹持指 / 可替换钳口",jaw,"titanium")
    add("A04_PAD","A04","夹爪摩擦垫",rounded(13,28,13,2),"rubber","soft")
    add("H03_MASTER_LINK","H03","低力主控臂连杆",rail(168,16,12),"graphite")
    add("H03_GRIP","H03","人体侧操纵握把",rounded(28,36,96,8),"rubber","soft")
    for s in [-1,1]:
        side="L" if s<0 else "R"
        shoulder=np.array((s*380,95,1425),float); elbow=np.array((s*441,20,1086),float); wrist=np.array((s*440,-268,974),float)
        place("A01_YAW_BASE",(s*305,159,1400),side=side)
        place("A01_YOKE",(s*345,90,1425),(0,1,0),side)
        place_hub("A01",shoulder,(s,0,0),side,112,48)
        place("A01_DELTOID_SHELL",shoulder+np.array([s*14,-24,52]),side=side)
        place("A01_DELTOID_INLAY",shoulder+np.array([s*14,-24,52]),side=side)
        v=(elbow-shoulder);v/=np.linalg.norm(v)
        between("A02_ARM_RAIL",shoulder+v*41,elbow-v*40,side)
        between("A02_ARM_SHELL",shoulder+v*44+np.array([0,-24,0]),elbow-v*40+np.array([0,-24,0]),side)
        between("A02_ARM_INLAY",shoulder+v*44+np.array([0,-24,0]),elbow-v*40+np.array([0,-24,0]),side)
        place_hub("A03",elbow,(s,0,0),side,96,40)
        w=wrist-elbow;w/=np.linalg.norm(w)
        between("A04_FOREARM_RAIL",elbow+w*42,wrist-w*43,side)
        between("A04_FOREARM_SHELL",elbow+w*45+np.array([0,0,18]),wrist-w*43+np.array([0,0,18]),side)
        place("A04_ROLL",elbow+w*62,w,side)
        place_hub("A04",wrist,(s,0,0),side,68,30)
        place("A04_TOOL_FLANGE",wrist+w*47,w,side)
        place("A04_PALM",wrist+w*76,w,side)
        for dx in [-36,36]:
            place("A04_JAW",wrist+w*116+np.array([dx,0,0]),(0,0,1),side,180 if dx<0 else 0)
            place("A04_PAD",wrist+w*154+np.array([dx*.55,0,0]),w,side)
        between("H03_MASTER_LINK",(s*218,-26,1277),(s*284,-65,1123),side)
        place_hub("H03",(s*284,-65,1123),(s,0,0),side,34,17)
        place("H03_GRIP",(s*296,-102,1000),side=side)
    # Power cassettes and servicing access are distinct removable bodies.
    back=rounded(206,90,292,18).cut(rounded(194,81,280,15).translate((0,-8,0)))
    add("P01_POWER_CARRIER","P01","双电源匣承载壳",back,"graphite")
    place("P01_POWER_CARRIER",(0,244,1246))
    battery=rounded(80,67,247,12)
    add("P01_CASSETTE","P01","可抽取电源匣包络",battery,"ceramic","shell","电池包络，电芯未选型")
    add("P01_LATCH","P01","电源匣快拆锁扣",rounded(54,12,28,4),"lime","hardware")
    for s in [-1,1]:
        place("P01_CASSETTE",(s*47,259,1245),side="L" if s<0 else "R")
        place("P01_LATCH",(s*47,300,1350),side="L" if s<0 else "R")
    add("P02_ECU","P02","背部控制器腔体",rounded(163,50,76,9),"graphite")
    place("P02_ECU",(0,218,1452))
    add("P02_ESTOP","P02","急停按钮包络",disc(16,15),"lime","hardware")
    place("P02_ESTOP",(103,-147,1330),(0,-1,0))
    add("P04_COOLING_FIN","P04","背包散热鳍片",rounded(150,27,3,1),"graphite","hardware")
    for i in range(9):place("P04_COOLING_FIN",(0,292,1085+i*8))
    add("P04_CONNECTOR","P04","密封快接头包络",disc(9,23,7),"steel","hardware")
    for x in [-66,-33,0,33,66]:place("P04_CONNECTOR",(x,225,1498))
    # P03 is now a stowed secondary stabilizer. Feet carry the normal ground path.
    add("P03_STOWED_STRUT","P03","收纳式辅助支撑 / 默认不接地",rail(245,18,15),"graphite")
    for s in [-1,1]:place("P03_STOWED_STRUT",(s*82,188,1090),side="L" if s<0 else "R")

def export():
    for d in [OUT,OUT/"step",OUT/"stl",OUT/"preview"]:d.mkdir(parents=True,exist_ok=True)
    records=[]; asm=cq.Assembly(name="EXO_ATLAS_R03")
    for i,(key,part) in enumerate(PARTS.items()):
        shape=part["shape"]
        if not shape.solids().size():raise ValueError(f"No solids: {key}")
        cq.exporters.export(shape,str(OUT/"step"/f"{key}.step"))
        cq.exporters.export(shape,str(OUT/"stl"/f"{key}.stl"),tolerance=.18,angularTolerance=.16)
        mesh=trimesh.load_mesh(OUT/"stl"/f"{key}.stl",process=True)
        verts,faces=shape.val().tessellate(.22,.18)
        (OUT/"preview"/f"{key}.json").write_text(json.dumps({"vertices":[list(v.toTuple()) for v in verts],"faces":faces},separators=(",",":")))
        record={k:v for k,v in part.items() if k!="shape"}
        record.update({"id":key,"validBRep":all(s.isValid() for s in shape.solids().vals()),"solidCount":shape.solids().size(),"watertight":bool(mesh.is_watertight),"positiveVolume":bool(mesh.volume>0),"boundsMm":np.round(mesh.extents,2).tolist(),"volumeMm3":round(float(mesh.volume),2),"triangles":len(mesh.faces),"quantity":sum(x["part"]==key for x in INSTANCES)})
        records.append(record)
        print(f"{i+1}/{len(PARTS)} {key}: {record['validBRep']} / {record['watertight']}",flush=True)
    for inst in INSTANCES:
        p=PARTS[inst["part"]];m=np.array(inst["matrix"])
        # Rotation goes through a proper rigid cq.Location, preserving analytic surfaces.
        from OCP.gp import gp_Trsf
        t=gp_Trsf();t.SetValues(*m[:3,:].reshape(-1).tolist())
        color=CFG["materialPalette"][p["material"]].lstrip("#")
        c=cq.Color(*[int(color[i:i+2],16)/255 for i in (0,2,4)])
        asm.add(p["shape"],name=inst["id"],loc=cq.Location(t),color=c)
    asm.save(str(OUT/"EXO_ATLAS_R03_ASSEMBLY.step"))
    validation={"revision":CFG["revision"],"units":"mm","partDefinitions":len(records),"instances":len(INSTANCES),"families":sorted(set(p["family"] for p in records)),"validBRep":sum(p["validBRep"] for p in records),"watertight":sum(p["watertight"] for p in records),"positiveVolume":sum(p["positiveVolume"] for p in records),"pass":all(p["validBRep"] and p["watertight"] and p["positiveVolume"] for p in records),"assemblyFit":"NOT VALIDATED","strength":"NOT VALIDATED","physicalPrint":"NOT RUN"}
    (OUT/"assembly.json").write_text(json.dumps({"config":CFG,"parts":records,"instances":INSTANCES},ensure_ascii=False,indent=2))
    (OUT/"validation.json").write_text(json.dumps(validation,indent=2))
    public=ROOT/"public/assets/v03";public.mkdir(exist_ok=True)
    shutil.copy2(OUT/"assembly.json",public/"assembly.json")
    shutil.copy2(OUT/"validation.json",public/"validation.json")
    (public/"step").mkdir(exist_ok=True)
    for path in (OUT/"step").glob('*.step'):shutil.copy2(path,public/"step"/path.name)
    # Focused, full-size foot interfaces as an immediately inspectable CAD package.
    with zipfile.ZipFile(public/"ATLAS_R03_ENGINEERING.zip","w",zipfile.ZIP_DEFLATED) as z:
        z.write(OUT/"EXO_ATLAS_R03_ASSEMBLY.step","EXO_ATLAS_R03_ASSEMBLY.step")
        for p in records:
            for ext in ["step","stl"]:z.write(OUT/ext/f"{p['id']}.{ext}",f"{ext}/{p['id']}.{ext}")
        for f in ["assembly.json","validation.json"]:z.write(OUT/f,f)
        z.write(ROOT/"cad/v03/design.json","design.json")
    print(json.dumps(validation,indent=2),flush=True)
    if not validation["pass"]:raise SystemExit(2)

if __name__=="__main__":
    build();export()
