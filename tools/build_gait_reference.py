"""Build an attributed 101-sample reference, without mixing it with rig corrections."""
from pathlib import Path
import csv, json, math, statistics

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'assets/reference/gait'

def mean_std(curves):
    return {'mean':[round(statistics.mean(v),5) for v in zip(*curves)],
            'sd':[round(statistics.stdev(v),5) for v in zip(*curves)]}

def build(mode,ids):
    subjects=[]
    for i in ids:
        file=DATA/(f'WBDS{i:02}walkT05ang.txt' if mode=='walk' else f'RBDS{i:03}processed.txt')
        rows=list(csv.DictReader(file.open(),delimiter='\t'))
        assert len(rows)==101
        fields={'hip':'Hip','knee':'Knee','ankle':'Ankle','foot':'Foot','pelvisTilt':'Pelvis'} if mode=='walk' else {'hip':'hip','knee':'knee','ankle':'ankle'}
        subject={}
        for key,col in fields.items():
            # Both limbs are normalized independently to ipsilateral contact.
            cs=[f'{s}{col}AngleZ' if mode=='walk' else f'{s}{col}AngZ25' for s in ['R','L']]
            subject[key]=[statistics.mean(float(r[c]) for c in cs) for r in rows]
        if mode=='walk':
            # Global pelvis axes from the right cycle; retain the original sign.
            for key,axis in [('pelvisObliquity','X'),('pelvisRotation','Y')]:
                subject[key]=[float(r['RPelvisAngle'+axis]) for r in rows]
        subjects.append(subject)
    return {'subjects':ids,'n':len(ids),'curves':{k:mean_std([s[k] for s in subjects]) for k in subjects[0]}}

out={'walk':build('walk',list(range(1,25))), 'run':build('run',list(range(1,29)))}
out['walk'].update({'source':'https://doi.org/10.7717/peerj.4640','dataset':'https://doi.org/10.6084/m9.figshare.5722711','condition':'Young adults, treadmill T05, self-selected comfortable speed, barefoot','sourceSpeed':1.2445833333333334,'sourceLegLength':.8784895833333334})
out['run'].update({'source':'https://doi.org/10.7717/peerj.3298','dataset':'https://doi.org/10.6084/m9.figshare.4543435','condition':'Original 28 regular runners, treadmill 2.5 m/s','sourceSpeed':2.5})
out['attribution']='Fukuchi, Fukuchi & Duarte (2018); Fukuchi, Fukuchi & Duarte (2017). CC BY 4.0. Derived: per-subject bilateral means, then across-subject mean and sample SD. Figures and rig retargeting are new adaptations.'
out['units']='degrees; 0–100% ipsilateral gait cycle. Positive hip/knee flexion and ankle dorsiflexion. Z is the source sagittal axis.'
dest=ROOT/'src/domain/data';dest.mkdir(exist_ok=True)
(dest/'gaitReference.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
for mode in ['walk','run']:
    print(mode, {k:[round(min(v['mean']),1),round(max(v['mean']),1)] for k,v in out[mode]['curves'].items()})

if not all(math.isfinite(x) for d in [out['walk'],out['run']] for c in d['curves'].values() for x in c['mean']):raise ValueError('non-finite source data')
