import { tr, useLocale } from '../i18n';
import { Hand, RotateCcw } from 'lucide-react';
import { ARM_CONTROLS, jointDisplay } from '../domain/atlasMotion';
import { useAtlasMotion, type ArmTarget } from '../state/atlasMotionStore';

export function AtlasArmInspector({onFocus}:{onFocus:()=>void}) {
  useLocale();
  const m=useAtlasMotion();
  const selected=m.armTarget==='R'?(m.manual?m.armR:m.liveR):(m.manual?m.armL:m.liveL);
  return <section className="atlas-arm-inspector" aria-label={tr("机械手调节")}>
    <div className="arm-inspector-title"><Hand size={18}/><strong>{tr("机械手调节")}</strong><span>{tr(m.manual?'手动姿态':'动作跟随')}</span></div>
    <p>{tr("肩、肘、腕独立活动，三指机械手可开合。拖动滑杆即可调整当前姿态。")}</p>
    <div className="arm-target" role="group" aria-label={tr("调节对象")}>
      {([['both','双臂'],['L','左侧臂'],['R','右侧臂']] as [ArmTarget,string][]).map(([id,label])=><button key={id} aria-pressed={m.armTarget===id} onClick={()=>m.setArmTarget(id)}>{tr(label)}</button>)}
    </div>
    <div className="arm-quick-actions">
      <button onClick={()=>m.setArmJoint('grip',100)} disabled={!m.ready}>{tr("张开三指")}</button>
      <button onClick={()=>m.setArmJoint('grip',0)} disabled={!m.ready}>{tr("合拢三指")}</button>
      <button onClick={onFocus}>{tr("近看机械手")}</button>
    </div>
    <div className="arm-sliders">
      {ARM_CONTROLS.map(c=><label key={c.id}>
        <span>{tr(c.label)}<output>{Math.round(jointDisplay(selected,c.id))}{tr(c.unit)}</output></span>
        <input type="range" aria-label={tr(c.label)} min={c.min} max={c.max} step={1} value={jointDisplay(selected,c.id)} disabled={!m.ready} onChange={e=>m.setArmJoint(c.id,Number(e.target.value))}/>
      </label>)}
    </div>
    <div className="arm-inspector-footer"><button onClick={()=>{m.choose('idle');m.reset();}}><RotateCcw size={13}/>{tr("姿态复位")}</button><span>{tr("播放键恢复动作编排")}</span></div>
    <small>{tr("展示范围 · 实机限位与碰撞尚未校验")}</small>
  </section>;
}
