"""Export exact planar profile DXFs, drawing previews and a BOM from the R03 source."""
from pathlib import Path
import json,csv,zipfile
import cadquery as cq

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'cad/v03/output'
PUBLIC=ROOT/'public/assets/v03'
DRAW=PUBLIC/'drawings';DRAW.mkdir(exist_ok=True)
data=json.loads((OUT/'assembly.json').read_text())
selected=['L06_HEEL_PLATE','L06_FOREFOOT_PLATE','L05_ANKLE_FORK','A01_FLANGE','A03_FLANGE','A04_TOOL_FLANGE','F01_SCAPULAR_BRIDGE','L02_TIE_LUG']
manifest=[]
for key in selected:
    shape=cq.importers.importStep(str(OUT/'step'/f'{key}.step'))
    cq.exporters.export(shape.section(),str(DRAW/f'{key}.dxf'))
    cq.exporters.export(shape,str(DRAW/f'{key}.svg'),opt={'width':800,'height':600,'marginLeft':70,'marginTop':50,'showAxes':False,'projectionDir':(0,0,1),'strokeWidth':.6,'strokeColor':(47,65,56),'showHidden':False})
    info=next(p for p in data['parts'] if p['id']==key)
    manifest.append({k:info[k] for k in ['id','name','boundsMm','process','quantity']})
(DRAW/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with (OUT/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['零件编号','名称','模块','数量','层','材料显示','工艺候选','尺寸 mm','体积 mm3'])
    for p in data['parts']:w.writerow([p['id'],p['name'],p['family'],p['quantity'],p['layer'],p['material'],p['process'],' x '.join(map(str,p['boundsMm'])),p['volumeMm3']])
with zipfile.ZipFile(PUBLIC/'ATLAS_R03_ENGINEERING.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(OUT/'EXO_ATLAS_R03_ASSEMBLY.step','EXO_ATLAS_R03_ASSEMBLY.step')
    for ext in ['step','stl']:
        for p in (OUT/ext).glob('*.'+ext):z.write(p,f'{ext}/{p.name}')
    for p in DRAW.iterdir():z.write(p,f'drawings/{p.name}')
    for name in ['assembly.json','validation.json','BOM.csv']:z.write(OUT/name,name)
    for name in ['design.json','README.zh-CN.md','build_engineering.py']:z.write(ROOT/'cad/v03'/name,name)
print(json.dumps({'drawings':len(manifest),'bomRows':len(data['parts']),'archive':str(PUBLIC/'ATLAS_R03_ENGINEERING.zip')},ensure_ascii=False))
