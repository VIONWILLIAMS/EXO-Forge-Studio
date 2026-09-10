import { tr, useLocale } from '../i18n';
import { Activity, Box, Trees } from 'lucide-react';
import { MOTION_CLIPS } from '../domain/atlasMotion';
import { SCENARIOS } from '../domain/atlasScenario';
import { useAtlasMotion } from '../state/atlasMotionStore';

export function AtlasMotionWorkbench() {
  useLocale();
  const m=useAtlasMotion();
  return <>
    <div className="atlas-panel-heading"><span>{tr("动作工作台")}</span><small>{tr("MOTION / 08")}</small></div>
    <nav className="atlas-motion-navigation" aria-label={tr("动作工作台")} data-testid="motion-workbench">
      <h3><Activity size={14}/>{tr("基础动作")}<small>09</small></h3>
      <div className="motion-workbench-clips">
        {MOTION_CLIPS.map(c=><button key={c.id} data-testid={`motion-${c.id}`} aria-pressed={m.sequence==='basic'&&m.clip===c.id} onClick={()=>m.choose(c.id)}><span>{tr(c.label)}</span><small>{tr(c.english)}</small></button>)}
      </div>
      <h3><Box size={14}/>{tr("场景动作")}<small>02</small></h3>
      <div className="motion-workbench-scenarios">
        {SCENARIOS.map((s,i)=><button key={s.id} data-testid={`scenario-${s.id}`} aria-pressed={m.sequence===s.id} onClick={()=>m.chooseSequence(s.id)}><span>{i===0?<Box size={17}/>:<Trees size={17}/>}<strong>{tr(s.label)}</strong><small>{s.duration}{tr("s")}</small></span><p>{tr(s.description)}</p></button>)}
      </div>
    </nav>
  </>;
}
