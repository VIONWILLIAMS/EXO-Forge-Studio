import { tr, useLocale } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ExternalLink, X } from 'lucide-react';
import { GAIT_REFERENCE, GAIT_SETTINGS, gaitSpeed, gaitAngles, type GaitId } from '../domain/atlasGait';
import { degrees, motionClip, sampleMotion } from '../domain/atlasMotion';
import { displayKneeFlexion } from '../domain/atlasMotionRig';
import { useAtlasMotion } from '../state/atlasMotionStore';

const WALK_PHASES=[[0,'脚跟着地'],[.10,'承重缓冲'],[.30,'支撑中期'],[.50,'蹬离准备'],[.62,'脚趾离地'],[.72,'收腿迈出'],[.85,'小腿前摆'],[.97,'准备落脚']] as const;
const RUN_PHASES=[[0,'落脚'],[.15,'屈膝缓冲'],[.30,'支撑推进'],[.40,'蹬离'],[.45,'短暂腾空'],[.60,'折叠收腿'],[.75,'大腿前摆'],[.90,'准备落脚']] as const;
const label=(id:GaitId)=>id==='walk'?'步行':'慢跑';
const kneeAngle=(id:GaitId,phase:number)=>degrees(displayKneeFlexion(sampleMotion(id,phase*motionClip(id).duration),'L'));

function Curve({id,joint,phase}:{id:GaitId;joint:'hip'|'knee'|'ankle';phase:number}){
  useLocale();
  const c=GAIT_REFERENCE[id].curves[joint],lo=joint==='ankle'?-30:joint==='hip'?-20:0,hi=joint==='knee'?110:joint==='hip'?60:35;
  const xy=(v:number,i:number)=>`${(28+i*2.66).toFixed(2)},${(90-(v-lo)/(hi-lo)*72).toFixed(2)}`;
  const band=c.mean.map((v,i)=>xy(v+c.sd[i],i)).join(' ')+' '+[...c.mean].reverse().map((v,i)=>xy(v-c.sd[100-i],100-i)).join(' ');
  const model=useMemo(()=>joint==='knee'?Array.from({length:101},(_,i)=>kneeAngle(id,i/100)).map(xy).join(' '):'', [id,joint]);
  return <svg viewBox="0 0 316 116" className="gait-curve" role="img" aria-label={tr("{0}{1}角度参考图，横轴为步态周期百分比，纵轴为角度", [label(id), {hip:'髋关节',knee:'膝关节',ankle:'踝关节'}[joint]])}>
    <text x="3" y="11">{tr({hip:'髋 · 屈曲',knee:'膝 · 屈曲',ankle:'踝 · 背屈'}[joint])} °</text>
    <rect x="28" y="18" width={266*GAIT_SETTINGS[id].duty} height="72" fill="currentColor" opacity=".035"/>
    {[lo,0,hi].filter((v,i,a)=>a.indexOf(v)===i).map(v=><g key={v}><line x1="28" x2="294" y1={90-(v-lo)/(hi-lo)*72} y2={90-(v-lo)/(hi-lo)*72} stroke="currentColor" opacity=".13"/><text x="1" y={93-(v-lo)/(hi-lo)*72}>{v}</text></g>)}
    <polygon points={band} fill="#b9df76" opacity=".15"/>
    <polyline points={c.mean.map(xy).join(' ')} fill="none" stroke="#bfdf89" strokeWidth="2"/>
    {tr(model&&<polyline points={model} fill="none" stroke="#70c7ec" strokeWidth="1.8" strokeDasharray="4 3"/>)}
    <line x1={28+phase*266} x2={28+phase*266} y1="18" y2="92" stroke="#f4e7a2" opacity=".9"/>
    {[0,50,100].map(v=><text key={v} x={28+v*2.66} y="108" textAnchor="middle">{v}%</text>)}
  </svg>;
}

function KeyPose({id,phase}:{id:GaitId;phase:number}){
  useLocale();
  const p=sampleMotion(id,phase*motionClip(id).duration),scale=75;
  const pt=(z:number,y:number)=>`${84-z*scale},${145-y*scale}`;
  const hip=[p.offsetZ,p.height],head=[hip[0]+Math.sin(p.pitch)*.71,hip[1]+.71];
  return <svg viewBox="0 0 168 155" role="img" aria-label={tr("{0}周期 {1}% 的模型侧面姿态", [label(id), (phase*100).toFixed(0)])}>
    <line x1="8" x2="160" y1="145" y2="145" stroke="#ffffff30"/>
    {(['right','left'] as const).map(side=>{
      const l=p[side],thigh=Math.atan2(.004,.469)-p.pitch-l.hip;
      const kz=hip[0]+.469*Math.sin(thigh),ky=hip[1]-.469*Math.cos(thigh);
      const foot=l.target,pitch=l.footPitch;
      const toe=[foot[1]-.112*Math.sin(pitch)+.19*Math.cos(pitch),foot[0]-.112*Math.cos(pitch)-.19*Math.sin(pitch)];
      const heel=[foot[1]-.112*Math.sin(pitch)-.08*Math.cos(pitch),foot[0]-.112*Math.cos(pitch)+.08*Math.sin(pitch)];
      return <g key={side} fill="none" stroke={side==='left'?'#c9ec92':'#78909b'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><polyline points={`${pt(...hip as [number,number])} ${pt(kz,ky)} ${pt(foot[1],foot[0])}`}/><polyline points={`${pt(...heel as [number,number])} ${pt(...toe as [number,number])}`} strokeWidth="3"/><circle cx={84-kz*scale} cy={145-ky*scale} r="3" fill="#17262d" strokeWidth="1.5"/></g>;
    })}
    <line x1={84-hip[0]*scale} y1={145-hip[1]*scale} x2={84-head[0]*scale} y2={145-(head[1]-.12)*scale} stroke="#c0cdd0" strokeWidth="7" strokeLinecap="round"/>
    <circle cx={84-head[0]*scale} cy={145-head[1]*scale} r="7" fill="#c0cdd0"/>
    {[p.armR[0],p.armL[0]].map((a,i)=>{
      const z=hip[0]+.025,y=hip[1]+.48,ez=z-.23*Math.sin(a),ey=y-.23*Math.cos(a);
      return <polyline key={i} points={`${pt(z,y)} ${pt(ez,ey)} ${pt(ez-.21*Math.sin(a-(id==='run'?1.4:.35)),ey-.21*Math.cos(a-(id==='run'?1.4:.35)))}`} stroke={i?'#c9ec92':'#78909b'} fill="none" strokeWidth="3" strokeLinecap="round"/>;
    })}
  </svg>;
}

function ReferenceDialog({id,onClose}:{id:GaitId;onClose:()=>void}){
  useLocale();
  const dialog=useRef<HTMLDialogElement>(null),m=useAtlasMotion(),phase=m.time/motionClip(id).duration;
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  return createPortal(<dialog ref={dialog} className="gait-reference-dialog" onCancel={onClose} aria-label={tr("人体步态参考与模型对照")}>
    <header><div><span>{tr("HUMAN MOVEMENT / REFERENCE 05")}</span><h2>{tr("先理解人体，再让结构跟随。")}</h2></div><button onClick={onClose} aria-label={tr("关闭步态参考图")}><X/></button></header>
    <p>{tr("以下姿态图根据公开运动数据适配到现有人模；绿色为左腿，灰色为右腿。点击某个阶段，可在三维模型中停在同一时刻。")}</p>
    <div className="gait-mode-tabs">{(['walk','run'] as const).map(c=><button key={c} aria-pressed={id===c} onClick={()=>m.choose(c)}>{tr(label(c))} · {GAIT_REFERENCE[c].n}{tr(" 人参考")}</button>)}</div>
    <div className="gait-keyposes">{(id==='walk'?WALK_PHASES:RUN_PHASES).map(([t,title])=><button key={t} onClick={()=>m.seek(t*motionClip(id).duration)} aria-label={tr("查看{0} {1}%", [title, Math.round(t*100)])}><KeyPose id={id} phase={t}/><span>{Math.round(t*100)}%<b>{tr(title)}</b></span></button>)}</div>
    <div className="gait-reference-plots">{(['hip','knee','ankle'] as const).map(j=><Curve key={j} id={id} joint={j} phase={phase}/>)}</div>
    <p className="gait-legend"><i/>{tr("参考均值及样本 ±1 标准差 ")}<i className="model"/>{tr("虚线：模型膝角 ")}<span>{tr("标准差表示这组受试者的差异，并不是医学“合格线”。")}</span></p>
    <div className="gait-reference-notes"><div><h3>{tr("参考来自哪里")}</h3><p>{tr("步行：24 位年轻成人，自选舒适速度，跑步机赤足采集。慢跑：28 位跑者，跑步机 2.5 m/s。两侧先按各自落脚对齐，再求每人平均和组平均。")}</p><a href={GAIT_REFERENCE[id].source} target="_blank" rel="noreferrer">{tr("Fukuchi 等 · ")}{tr(id==='walk'?'2018 步行研究':'2017 跑步研究')} <ExternalLink size={12}/></a><a href="https://now.aapmr.org/biomechanics-normal-gait/" target="_blank" rel="noreferrer">{tr("AAPM&R · 临床正常步态分期与原图 ")}<ExternalLink size={12}/></a></div><div><h3>{tr("模型作了哪些适配")}</h3><p>{tr("根据现有腿长和刚性鞋底调整落地；配合骨盆转动与对侧摆臂。慢跑增加连续的骨盆起伏、收腿落地过渡与放松握拳；按刚性鞋底适配后的行进速度约 ")}{tr(gaitSpeed('run').toFixed(2))}{tr(" m/s，原始采集速度为 2.5 m/s。骨盆、上肢及节拍为展示编排。下蹲、上阶、搬箱和采摘仍按几何目标编排，未获得对应的完整动作采集数据。")}</p><p>{tr("这是动作参考与几何演示，不是临床验证，也不证明外骨骼能安全行走或承重。")}</p></div></div>
    <footer>{tr("数据：Fukuchi, Fukuchi & Duarte · CC BY 4.0 · 图表、左右平均与模型适配为本项目派生。")}</footer>
  </dialog>,document.body);
}

export function AtlasGaitInspector({onHuman,onAssembly}:{onHuman:()=>void;onAssembly:()=>void}){
  useLocale();
  const m=useAtlasMotion(),[expanded,setExpanded]=useState(false),id:GaitId=m.clip==='run'?'run':'walk';
  const phase=m.time/motionClip(id).duration,phases=id==='walk'?WALK_PHASES:RUN_PHASES;
  const clinicalPhases=id==='walk'?[[0,'初始接触'],[.02,'承重缓冲'],[.12,'支撑中期'],[.31,'支撑末期'],[.50,'预摆期'],[.62,'摆动初期'],[.75,'摆动中期'],[.87,'摆动末期']] as const:phases;
  const current=[...clinicalPhases].reverse().find(([t])=>phase>=t)??clinicalPhases[0],angles=gaitAngles(id,phase);
  return <section className="gait-inspector" aria-label={tr("人体步态参考")}>
    <div className="gait-inspector-heading"><BookOpen size={16}/><b>{tr("人体步态参考")}</b><span>{tr("M7")}</span></div>
    <p>{tr("让髋、膝、踝按人体步态配合，避免只靠脚部摆动推算姿态。")}</p>
    <div className="gait-view-switch"><button onClick={onHuman}>{tr("人体侧视")}</button><button onClick={onAssembly}>{tr("穿戴总装")}</button></div>
    <div className="gait-current"><small>{tr("左腿周期 · ")}{tr((phase*100).toFixed(0))}%</small><strong>{tr(current[1])}</strong><span>{tr(label(id))} · {GAIT_REFERENCE[id].n}{tr(" 人 / 101 个采样点")}</span></div>
    {(['hip','knee','ankle'] as const).map(j=><Curve key={j} id={id} joint={j} phase={phase}/>)}
    <p className="gait-small-legend">{tr("绿线：参考均值　色带：样本差异")}<br/>{tr("蓝色虚线：模型膝角 · 当前参考膝角 ")}{tr(angles.knee.toFixed(0))}°</p>
    <button className="gait-expand" onClick={()=>setExpanded(true)}><BookOpen size={15}/>{tr("展开步态图与来源")}</button>
    <p className="gait-small-note">{tr("同一周期的姿态图、关节曲线与来源说明。图示用于动作改进，未进行临床或实机验证。")}</p>
    <button className="gait-to-arms" onClick={()=>m.choose('dexterity')}>{tr("查看机械臂与三指机械手调节 →")}</button>
    {expanded&&<ReferenceDialog id={id} onClose={()=>setExpanded(false)}/>}
  </section>;
}
