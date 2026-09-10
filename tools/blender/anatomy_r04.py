"""Spatially bounded posing of the CC0 hm08 body. No arm weights below the waist.

Pure Python, so the hip protection regression can run without Blender.
"""
from collections import defaultdict
from pathlib import Path
import math,json

ROOT=Path(__file__).resolve().parents[2]
SCALE=1.75/(8.4913+8.1676)

def read_body():
    vertices=[];faces=[];groups=defaultdict(set);group=''
    for line in (ROOT/'assets/vendor/makehuman/base.obj').read_text().splitlines():
        fields=line.split()
        if not fields:continue
        if fields[0]=='v':vertices.append(tuple(map(float,fields[1:4])))
        elif fields[0]=='g':group=fields[1]
        elif fields[0]=='f':
            face=[int(v.split('/')[0])-1 for v in fields[1:]];groups[group].update(face)
            if group=='body':faces.append(face)
    return vertices,faces,groups

def anatomical(v):return (v[0]*SCALE,-v[2]*SCALE,(v[1]+8.1676)*SCALE+.023)
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)

def arm_weight(x,z):
    # Separates arms from torso/hips in the original A pose. The previous
    # abs(x) > .152 and z > .82 mask also rotated the buttocks around a shoulder.
    if z<.84:return 0.0
    # Full rigid rotation through elbow/forearm; only the shoulder insertion blends.
    boundary=.160+.100*(1-smooth((z-1.10)/.12))
    return smooth((abs(x)-boundary)/.055)

def pose(v, arms=True):
    x,y,z=anatomical(v);side=1 if x>=0 else -1
    weight=arm_weight(x,z) if arms else 0
    if weight:
        cx,cz=side*.176,1.433;angle=side*math.radians(24)*weight
        dx,dz=x-cx,z-cz
        x=cx+math.cos(angle)*dx+math.sin(angle)*dz
        z=cz-math.sin(angle)*dx+math.cos(angle)*dz
    # Preserve the buttock/hip envelope completely. Move the lower legs smoothly,
    # with zero slope at the pelvis and sole, instead of a sign-based hard warp.
    if z<.92:
        t=smooth((.92-z)/.82)
        x-=side*.122*t
    return x,y,z

def legacy_pose(v):
    x,y,z=anatomical(v);s=1 if x>=0 else -1
    if z<1:x-=s*.122*max(0,min(1,(1-z)/.9))
    if abs(x)>.152 and z>.82:
        cx,cz=s*.176,1.433;w=max(0,min(1,(abs(x)-.153)/.064));a=s*math.radians(24)*w
        dx,dz=x-cx,z-cz;x=cx+math.cos(a)*dx+math.sin(a)*dz;z=cz-math.sin(a)*dx+math.cos(a)*dz
    return x,y,z

def audit():
    vs,faces,groups=read_body();used=set(i for f in faces for i in f)
    protected=[i for i in used if .92<=anatomical(vs[i])[2]<=1.07 and abs(anatomical(vs[i])[0])<.255]
    old=max(math.dist(anatomical(vs[i]),legacy_pose(vs[i])) for i in protected)*1000
    new=max(math.dist(anatomical(vs[i]),pose(vs[i])) for i in protected)*1000
    arm_leak=sum(arm_weight(anatomical(vs[i])[0],anatomical(vs[i])[2])>0 for i in protected)
    landmarks={k:anatomical(tuple(sum(vs[i][a] for i in ids)/len(ids) for a in range(3)))
               for k,ids in groups.items() if k in ['joint-l-upper-leg','joint-l-knee','joint-l-ankle','joint-l-shoulder','joint-l-elbow','joint-l-hand']}
    return {'protectedVertices':len(protected),'regionZMm':[920,1070],'regionHalfWidthMm':255,
        'legacyMaxDisplacementMm':round(old,3),'r04MaxDisplacementMm':round(new,6),
        'armWeightLeakCount':arm_leak,'pass':new<1e-6 and arm_leak==0,'restLandmarks':landmarks}

if __name__=='__main__':
    report=audit();print(json.dumps(report,indent=2))
    if not report['pass']:raise SystemExit(1)
