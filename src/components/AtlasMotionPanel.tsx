import { tr, useLocale } from '../i18n';
import { Pause, Play, RotateCcw, Activity, Footprints, Repeat2, X, Film } from 'lucide-react';
import { motionClip, sampleMotion } from '../domain/atlasMotion';
import { useAtlasMotion } from '../state/atlasMotionStore';
import { INTRO_CHAPTERS, sampleScenario, SCENARIOS, sequenceDuration } from '../domain/atlasScenario';
import { AtlasVideoDownload } from './AtlasVideoLibrary';

export function AtlasMotionPanel({onClose}:{onClose:()=>void}) {
  useLocale();
  const m=useAtlasMotion();
  const clip=motionClip(m.clip),frame=m.sequence==='basic'?null:sampleScenario(m.sequence,m.time),pose=frame?.pose??sampleMotion(m.clip,m.time),duration=sequenceDuration(m),intro=m.sequence==='intro';
  return <section className="atlas-motion-panel" aria-label={tr("动作播放台")} data-testid="motion-panel">
    <div className="motion-panel-heading"><span>{intro?<Film size={16}/>:<Activity size={16}/>} {tr(intro?'ATLAS · 50 秒演示介绍':m.sequence==='basic'?clip.label:SCENARIOS.find(s=>s.id===m.sequence)?.label)} <small>{tr("MOTION / 08")}</small></span><span className="motion-status">{tr(m.ready?(m.manual?'手动姿态':m.playing?'正在播放':m.time>=duration?'演示完成':'已暂停'):'正在载入动作模型…')}</span><button aria-label={tr("退出动作模式")} title={tr("退出动作模式")} onClick={onClose}><X size={16}/></button></div>
    {intro?<div className="intro-chapters" role="group" aria-label={tr("介绍章节")}>{INTRO_CHAPTERS.map((c,i)=><button key={c.start} aria-pressed={frame?.chapter===i} onClick={()=>m.seek(c.start+.3)} title={tr(c.title)}>{tr(c.label)}</button>)}</div>:m.sequence!=='basic'&&<div className="scenario-current-action" data-testid="scenario-action"><span>{tr("当前步骤")}</span><strong>{tr(frame?.action)}</strong></div>}
    <div className="motion-transport">
      <button className="motion-play" data-testid="motion-play" disabled={!m.ready} aria-label={tr(m.playing?'暂停动作':'播放动作')} onClick={()=>m.setPlaying(!m.playing)}>{m.playing?<Pause size={17}/>:<Play size={17}/>}</button>
      <button title={tr("回到动作起点")} aria-label={tr("回到动作起点")} onClick={m.reset}><RotateCcw size={16}/></button>
      <span className="motion-time" data-testid="motion-time">{tr(m.time.toFixed(2))}<small> / {tr(duration.toFixed(2))}{tr(" s")}</small></span>
      <input aria-label={tr("动作时间轴")} type="range" min="0" max={duration} step="0.01" value={m.time} onChange={e=>m.seek(Number(e.target.value))}/>
      <label className="motion-speed">{tr("速度")}<select aria-label={tr("动作速度")} value={m.speed} onChange={e=>m.setSpeed(Number(e.target.value))}>{[.25,.5,1,1.5].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
      <button title={tr("循环播放")} aria-label={tr("循环播放")} aria-pressed={m.loop} className={m.loop?'active':''} onClick={()=>m.setLoop(!m.loop)}><Repeat2 size={17}/></button>
    </div>
    <div className="motion-bottom-line">
      {intro?<><span>{tr("动作与场景概念演示 · 无实机连接")}</span><AtlasVideoDownload/></>:<span className="motion-contact"><Footprints size={14}/><i className={pose.left.contact?'contact':''}/>{tr("左脚 ")}<i className={pose.right.contact?'contact':''}/>{tr("右脚 ")}<small>{tr("亮灯为目标支撑相")}</small></span>}
      {m.sequence==='basic'?<label>{tr("路径")}<select aria-label={tr("动作路径")} value={m.travel} onChange={e=>m.setTravel(e.target.value as 'inPlace'|'orbit')}><option value="inPlace">{tr("原地步态")}</option><option value="orbit">{tr("环形行进")}</option></select></label>:<label><input type="checkbox" checked={m.autoCamera} onChange={e=>m.setAutoCamera(e.target.checked)}/>{tr("自动镜头")}</label>}
      {intro&&<button className="intro-return" onClick={()=>m.choose('walk')}>{tr("返回动作台")}</button>}
    </div>
    {!intro&&<p className="motion-disclaimer">{tr(m.sequence==='basic'?clip.description:'道具接触与场景动作编排')}{tr("。动作演示，不是实机步态、承重或稳定性验证。")}</p>}
  </section>;
}

export function AtlasScenarioOverlay(){
  useLocale();
  const m=useAtlasMotion();if(!m.enabled||m.sequence==='basic')return null;
  const frame=sampleScenario(m.sequence,m.time),intro=m.sequence==='intro',chapter=INTRO_CHAPTERS[frame.chapter];
  return <>
    <div className="scenario-title-card"><span>{intro?tr('ATLAS / 介绍 · {0}', [String(frame.chapter+1).padStart(2,'0')]):tr('ATLAS / FIELD SCENARIO')}</span><h2>{tr(intro?chapter.title:SCENARIOS.find(s=>s.id===m.sequence)?.label)}</h2><p>{tr(intro?chapter.subtitle:'连续任务演示 · 支持暂停和逐段查看')}</p></div>
    <div className="scenario-subtitle" data-testid="scenario-subtitle">{tr(frame.action)}</div>
    {intro&&<div className="intro-scene-fade" style={{opacity:frame.fade}}/>}
  </>;
}

export function AtlasScenarioInspector(){
  useLocale();
  const m=useAtlasMotion();return <section className="scenario-inspector">
    <span className="scenario-eyebrow">{tr("FIELD SCENARIOS / 02")}</span><h2>{tr("把能力放进任务里")}</h2><p>{tr("从接近目标到操作完成，查看身体、机械臂与环境的配合。")}</p>
    <div className="scenario-note"><strong>{tr("本次展示了什么")}</strong><p>{tr("箱体随双侧夹持点抬升，足部落在不同高度的台阶上；果实从枝头移动到收集篮。")}</p><p>{tr("尚未进行载荷、抓取力、全姿态碰撞与实机验证。")}</p></div>
    <button className="scenario-basic" onClick={()=>m.choose('dexterity')}>{tr("返回机械手自由调节")}</button>
  </section>;
}
