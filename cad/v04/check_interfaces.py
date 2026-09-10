"""Exact B-Rep checks for the interfaces corrected in R04; not a full motion solve."""
from pathlib import Path
import json,sys
import cadquery as cq
from OCP.gp import gp_Trsf
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'cad/v04/output'
data=json.loads((OUT/'assembly.json').read_text());shapes={};checks=[]

def world(inst):
    key=inst['part']
    if key not in shapes:shapes[key]=cq.importers.importStep(str(OUT/'step'/f'{key}.step')).val()
    t=gp_Trsf();t.SetValues(*np.array(inst['matrix'])[:3,:].reshape(-1).tolist())
    return shapes[key].located(cq.Location(t))

def instances(key,side):return [i for i in data['instances'] if i['part']==key and i['side']==side]
def record(name,actual,limit,pass_):checks.append({'name':name,'actual':actual,'criterion':limit,'pass':bool(pass_)})

for side in ['L','R']:
    pin=world(instances('L06_TOE_PIN',side)[0])
    for key in ['L06_HINGE_HEEL','L06_HINGE_TOE']:
        for j,inst in enumerate(instances(key,side)):
            common=pin.intersect(world(inst));volume=common.Volume()
            record(f'{side} pin / {key} {j}',round(volume,6),'overlap <= 0.001 mm3',volume<=.001)
    for a,b in [('H03_PELVIC_MOUNT','H03_MASTER_LINK'),('H03_FOREARM_LINK','H03_GRIP_COLLAR'),('H03_GRIP_COLLAR','H03_GRIP')]:
        gap=world(instances(a,side)[0]).distance(world(instances(b,side)[0]))
        record(f'{side} {a} -> {b}',round(gap,4),'layout continuity: gap <= 0.5 mm',gap<=.5)
    jaws=instances('A04_PARALLEL_JAW',side)
    axes=[np.array(i['matrix'])[:3,2] for i in jaws];dot=float(np.dot(*axes))
    record(f'{side} parallel jaw direction',round(dot,6),'both jaws extend along same axis, dot > 0.999',dot>.999)
    for j,pad in enumerate(instances('A04_CONTACT_PAD',side)):
        gap=min(world(pad).distance(world(jaw)) for jaw in jaws)
        record(f'{side} jaw pad {j}',round(gap,5),'pad-to-finger gap <= 0.5 mm',gap<=.5)

report={'revision':'R04','method':'OpenCascade exact solid intersections and distances',
    'scope':'Only listed corrected interfaces; continuity is NOT a production fastening proof.',
    'pass':all(c['pass'] for c in checks),'checks':checks,
    'fullAssembly':'NOT RUN','dynamicInterference':'NOT RUN','manufacturingRelease':False}
(OUT/'interface-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
if not report['pass']:raise SystemExit(1)
