"""Read-only GLB contract validator for EXO Forge exported assets."""
import json
import os
import struct
import sys

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
EXPECTED=['H01_HARNESS','H02_L','H02_R','H03_L','H03_R','F01_SHOULDER_FRAME','F02_SPINE_RAIL','F02_SPINE_SLIDER','F03_PELVIS_RING','L01_L','L01_R','L02_L','L02_R','L03_L','L03_R','L04_L','L04_R','L05_L','L05_R','L06_L','L06_R','A01_L','A01_R','A02_L','A02_R','A03_L','A03_R','A04_L','A04_R','P01_POWER_PACK','P02_CONTROL_CORE','P03_L','P03_R','P04_UTILITIES']
FAMILIES=['H01','H02','H03','F01','F02','F03','L01','L02','L03','L04','L05','L06','A01','A02','A03','A04','P01','P02','P03','P04']

def glb_json(path):
    with open(path,'rb') as handle:
        magic,version,length=struct.unpack('<4sII',handle.read(12))
        if magic!=b'glTF' or version!=2: raise ValueError(f'{path}: invalid GLB header')
        chunk_length,chunk_type=struct.unpack('<II',handle.read(8))
        if chunk_type!=0x4E4F534A: raise ValueError(f'{path}: JSON chunk missing')
        return json.loads(handle.read(chunk_length).decode('utf-8').rstrip('\x00 ')),length

def inspect(path):
    doc,length=glb_json(path); names={node.get('name','') for node in doc.get('nodes',[])}
    missing=[name for name in EXPECTED if name not in names]
    families=sorted({family for family in FAMILIES if any(name.startswith(family) for name in names)})
    root_extras={node.get('name'):node.get('extras',{}) for node in doc.get('nodes',[]) if node.get('name') in EXPECTED}
    axes_missing=[name for name,extras in root_extras.items() if not extras.get('local_axis') and name not in ('F02_SPINE_SLIDER',)]
    accessors=doc.get('accessors',[]); triangles=0; draw_calls=0
    for mesh in doc.get('meshes',[]):
        for primitive in mesh.get('primitives',[]):
            draw_calls+=1
            if primitive.get('mode',4)==4:
                accessor=primitive.get('indices',primitive.get('attributes',{}).get('POSITION'))
                if accessor is not None: triangles+=accessors[accessor].get('count',0)//3
    return {'path':os.path.relpath(path,ROOT),'bytes':length,'nodeCount':len(doc.get('nodes',[])),'meshCount':len(doc.get('meshes',[])),'materialCount':len(doc.get('materials',[])),'drawCalls':draw_calls,'trianglesFromAccessors':triangles,'familyCount':len(families),'families':families,'missingRequiredNodes':missing,'missingLocalAxes':axes_missing,'hasArmature':'HUMAN_ARMATURE' in names,'rootUnits':next((node.get('extras',{}).get('units') for node in doc.get('nodes',[]) if node.get('name')=='EXO_FORGE_V0_1'),None),'pass':not missing and len(families)==20 and not axes_missing and length<40*1024*1024}

report={'validator':'tools/validate_glb.py','format':'glTF 2.0 / meter convention','hero':inspect(os.path.join(ROOT,'public','assets','exo-forge-hero.glb')),'lod':inspect(os.path.join(ROOT,'public','assets','exo-forge-lod.glb'))}
report['pass']=report['hero']['pass'] and report['lod']['pass'] and report['hero']['trianglesFromAccessors']<=350000 and report['lod']['trianglesFromAccessors']<=100000
out=os.path.join(ROOT,'artifacts','glb-validation.json')
with open(out,'w',encoding='utf-8') as handle: json.dump(report,handle,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
