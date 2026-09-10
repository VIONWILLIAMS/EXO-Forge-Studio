"""Package exactly the current manifest, never stale files from a previous rebuild."""
from pathlib import Path
import json,csv,zipfile,shutil
import cadquery as cq
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'cad/v04/output';PUBLIC=ROOT/'public/assets/v04'
DRAW=PUBLIC/'drawings';DRAW.mkdir(exist_ok=True)
data=json.loads((OUT/'assembly.json').read_text())
selected=['L06_HEEL_PLATE','L06_FOREFOOT_PLATE','L05_ANKLE_FORK','A01_FLANGE','A03_FLANGE','A04_TOOL_FLANGE','F01_SCAPULAR_BRIDGE','L02_TIE_LUG','P02_HMI_CHEST_BEZEL','L06_HINGE_HEEL','L06_HINGE_TOE']
manifest=[]
for key in selected:
    shape=cq.importers.importStep(str(OUT/'step'/f'{key}.step'))
    cq.exporters.export(shape.section(),str(DRAW/f'{key}.dxf'))
    cq.exporters.export(shape,str(DRAW/f'{key}.svg'),opt={'width':800,'height':600,'marginLeft':70,'marginTop':50,'showAxes':False,'projectionDir':(0,0,1),'strokeWidth':.6,'strokeColor':(39,60,76),'showHidden':False})
    p=next(p for p in data['parts'] if p['id']==key);manifest.append({k:p[k] for k in ['id','name','boundsMm','process','quantity']})
(DRAW/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with (OUT/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['零件编号','名称','模块','数量','层','工艺候选','尺寸 mm','体积 mm3'])
    for p in data['parts']:w.writerow([p['id'],p['name'],p['family'],p['quantity'],p['layer'],p['process'],' x '.join(map(str,p['boundsMm'])),p['volumeMm3']])
with zipfile.ZipFile(PUBLIC/'ATLAS_R04_ENGINEERING.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(OUT/'EXO_ATLAS_R04_ASSEMBLY.step','EXO_ATLAS_R04_ASSEMBLY.step')
    for part in data['parts']:
        for ext in ['step','stl']:z.write(OUT/ext/f"{part['id']}.{ext}",f"{ext}/{part['id']}.{ext}")
    for key in selected:
        for ext in ['dxf','svg']:z.write(DRAW/f'{key}.{ext}',f'drawings/{key}.{ext}')
    z.write(DRAW/'index.json','drawings/index.json')
    for f in ['assembly.json','validation.json','interface-validation.json','BOM.csv']:z.write(OUT/f,f)
    for f in ['anatomy-validation.json','cad-display-alignment.json']:z.write(ROOT/'output/v04'/f,f)
    for relative in ['cad/v03/build_engineering.py','cad/v03/design.json','cad/v04/build_engineering.py','cad/v04/check_interfaces.py','cad/v04/engineering_package.py','cad/v04/design.json','cad/v04/README.zh-CN.md','tools/blender/build_atlas.py','tools/blender/build_atlas_r04.py','tools/blender/anatomy_r04.py','tools/validate_atlas.mjs','assets/vendor/makehuman/base.obj','assets/vendor/makehuman/LICENSE.md','assets/vendor/makehuman/SOURCE.md']:
        z.write(ROOT/relative,relative)
    z.write(ROOT/'cad/v04/README.zh-CN.md','README.zh-CN.md')
    z.writestr('requirements-cad.txt','cadquery==2.6.1\nnumpy==2.4.6\ntrimesh==4.11.4\n')
print(json.dumps({'parts':len(data['parts']),'drawings':len(selected),'zipBytes':(PUBLIC/'ATLAS_R04_ENGINEERING.zip').stat().st_size}))
