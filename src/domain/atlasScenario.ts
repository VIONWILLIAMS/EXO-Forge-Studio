import hands from './data/atlasHands.json';
import { applyHumanCarryContact } from './humanCarryContact';
import { Euler, Matrix3, Quaternion, Vector3 } from 'three';
import { blendMotion, clamp, motionClip, neutralRobotArm, radians, REST_ELBOW, sampleMotion, smooth, solveDisplayLeg, type MotionClipId, type MotionPose, type RobotArmPose } from './atlasMotion';

export type SequenceId='basic'|'carry'|'harvest'|'intro';
export type Vec3=[number,number,number];
export const SCENARIOS=[
  {id:'carry',label:'搬箱上楼',duration:14,description:'地面深蹲取箱 → 连续登上四级楼梯 → 平台落箱'},
  {id:'harvest',label:'提篮采苹果',duration:11,description:'人手提篮 · 机械臂摘取苹果并轻放入篮'},
] as const;
export const INTRO_DURATION=50;
export const INTRO_CHAPTERS=[
  {start:0,end:3,label:'总装',title:'ATLAS · 人体能力拓展',subtitle:'人体、支撑结构与双机械臂，组成一套可穿戴的概念系统。'},
  {start:3,end:6,label:'结构',title:'结构与支撑路径',subtitle:'从肩部桥架，经背轨与骨盆，连接腿侧承力链和足部。'},
  {start:6,end:9,label:'步行',title:'步行 · 左右协调',subtitle:'对侧摆臂，脚跟落地、支撑推进与收腿迈步。'},
  {start:9,end:12,label:'慢跑',title:'慢跑 · 连续响应',subtitle:'放松握拳，屈膝缓冲与短暂腾空，保持动作连贯。'},
  {start:12,end:17,label:'深蹲',title:'深蹲 · 姿态拓展',subtitle:'双足深蹲与单腿下蹲，观察重心转移和关节配合。'},
  {start:17,end:31,label:'搬箱上楼',title:'搬运 · 从地面到平台',subtitle:'深蹲取箱、双臂持物、连续登阶，再平稳落箱。'},
  {start:31,end:42,label:'提篮采摘',title:'采摘 · 人机协作',subtitle:'人手提着篮子，机械臂完成摘取和投放。'},
  {start:42,end:46,label:'三指操作',title:'三指 · 灵活操作',subtitle:'两节机械指协同开合，前臂旋转与腕部转向。'},
  {start:46,end:50,label:'招手',title:'ATLAS · 下一步走向实物',subtitle:'产品概念与动作展示。工程接口、承载与实机性能待验证。'},
] as const;
export function sequenceDuration(s:{sequence:SequenceId;clip:MotionClipId}) {return s.sequence==='basic'?motionClip(s.clip).duration:s.sequence==='intro'?INTRO_DURATION:s.sequence==='carry'?14:11;}
export type ScenarioFrame={
  pose:MotionPose;root:Vec3;environment:'studio'|'carry'|'harvest';chapter:number;action:string;
  camera:{position:Vec3;target:Vec3};shellOpacity:number;fade:number;
  box:Vec3|null;boxHeld:boolean;fruit:Vec3|null;fruitHeld:boolean;
  basket:Vec3|null;basketYaw:number;
  grips:Partial<Record<'L'|'R',Vec3>>;
};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const vlerp=(a:Vec3,b:Vec3,t:number):Vec3=>a.map((v,i)=>lerp(v,b[i],t)) as Vec3;
const ease=(time:number,start:number,end:number)=>smooth((time-start)/(end-start));
const rot=(x:number,y=0,z=0)=>new Quaternion().setFromEuler(new Euler(x,y,z));

/** The mean centre of the three articulated contact pads (M6).
 * This small forward-kinematic chain also makes target contact testable without rendering. */
export function robotGripPoint(p:MotionPose,side:'L'|'R',a:RobotArmPose):Vector3 {
  const s=side==='L'?-1:1,q=rot(p.pitch,p.pelvisYaw??0,p.pelvisRoll??0),point=new Vector3(p.swayX??0,p.height,p.offsetZ);
  point.add(new Vector3(0,.133,0).applyQuaternion(q));q.multiply(rot(...p.torso));
  point.add(new Vector3(s*.305,.320,-.159).applyQuaternion(q));q.multiply(rot(0,s*a.yaw));
  point.add(new Vector3(s*.075,.025,.064).applyQuaternion(q));q.multiply(rot(-a.lift,0,s*a.spread));
  point.add(new Vector3(s*.061,-.339,.075).applyQuaternion(q));q.multiply(rot(-(a.elbow-REST_ELBOW)));
  const fore=new Vector3(-s*.001,-.112,.288),axis=fore.clone().normalize();
  point.add(fore.applyQuaternion(q));q.multiply(new Quaternion().setFromAxisAngle(axis,a.roll));
  const yawAxis=new Vector3().crossVectors(axis,new Vector3(1,0,0)).normalize();
  q.multiply(rot(a.wristPitch)).multiply(new Quaternion().setFromAxisAngle(yawAxis,a.wristYaw));
  // Three-pad contact centre remains 148 mm along the wrist axis.
  return point.add(axis.multiplyScalar(.148).applyQuaternion(q));
}

/** Display IK: find shoulder/elbow angles that put the hand on a scripted handle.
 * It is geometric positioning, not a physical grasp or load calculation. */
export function armToTarget(p:MotionPose,side:'L'|'R',target:Vec3,grip=.38):RobotArmPose {
  const a={...neutralRobotArm(),grip};
  const keys=['lift','elbow','yaw'] as const,bounds=[[-15,110],[25,130],[-35,50]];
  const goal=new Vector3(...target),h=.0001;
  for(let i=0;i<28;i++){
    const here=robotGripPoint(p,side,a),error=goal.clone().sub(here);
    if(error.length()<.00005)break;
    const columns=keys.map(key=>{const b={...a,[key]:a[key]+h};return robotGripPoint(p,side,b).sub(here).multiplyScalar(1/h);});
    const j=new Matrix3().set(columns[0].x,columns[1].x,columns[2].x,columns[0].y,columns[1].y,columns[2].y,columns[0].z,columns[1].z,columns[2].z);
    const jt=j.clone().transpose(),normal=new Matrix3().multiplyMatrices(jt,j);
    for(const d of [0,4,8])normal.elements[d]+=.0003;
    const step=error.applyMatrix3(jt).applyMatrix3(normal.invert());
    keys.forEach((key,k)=>{a[key]=clamp(a[key]+clamp(step.getComponent(k),-.22,.22),radians(bounds[k][0]),radians(bounds[k][1]));});
  }
  return a;
}

type Foot={y:number;z:number;contact:boolean};
type Step={side:'L'|'R';y:number;z:number};
export const CARRY_STEPS:Step[]=[{side:'L',y:0,z:-.22},{side:'R',y:.20,z:.30},{side:'L',y:.40,z:.68},{side:'R',y:.60,z:1.06},{side:'L',y:.80,z:1.44},{side:'R',y:.80,z:1.44}];
export const FRUIT_START:Vec3=[-.47,1.60,.54];
export const CRATE_GROUND_Y=.231;
export const STAIR_START=3.6,STAIR_END=9.6;
// Continuous cubic body travel; only the beginning/end of the whole ascent stop.
// Feet keep their contact anchors while the pelvis passes over them.
function bodySpline(values:number[],phase:number){
  const x=clamp(phase,0,values.length-1),i=Math.min(values.length-2,Math.floor(x)),u=x-i;
  const tangent=(k:number)=>k===0||k===values.length-1?0:(values[k+1]-values[k-1])/2;
  return (2*u**3-3*u*u+1)*values[i]+(u**3-2*u*u+u)*tangent(i)+(-2*u**3+3*u*u)*values[i+1]+(u**3-u*u)*tangent(i+1);
}
function stairPose(time:number,squat=0){
  const feet:Record<'L'|'R',Foot>={L:{y:0,z:-.60,contact:true},R:{y:0,z:-.60,contact:true}};
  const phase=clamp((time-STAIR_START)/(STAIR_END-STAIR_START)*CARRY_STEPS.length,0,CARRY_STEPS.length);
  for(let i=0;i<CARRY_STEPS.length;i++){
    const step=CARRY_STEPS[i],f=feet[step.side],u=clamp(phase-i,0,1);if(u===0)break;
    const swing=clamp(u/.92,0,1);
    feet[step.side]={y:lerp(f.y,step.y,smooth(swing/.34))+.15*Math.sin(Math.PI*swing)**2,
      z:lerp(f.z,step.z,smooth((swing-.16)/.72)),contact:u===0||u>=.92};
  }
  const rootZ=bodySpline([-.60,-.41,.04,.49,.87,1.25,1.44],phase),p=sampleMotion('idle',0);
  let height=bodySpline([.937,.911,.891,1.111,1.311,1.511,1.737],phase);
  for(const f of Object.values(feet)){
    const cap=f.y+.112+Math.sqrt(Math.max(.01,.827**2-(f.z-rootZ)**2));
    height=(height+cap-Math.sqrt((height-cap)**2+.004**2))/2;
  }
  p.height=height-.525*squat;p.pitch=.055+.685*squat;p.offsetZ=-.26*squat;p.torso=[0,0,0];
  for(const side of ['L','R'] as const){const f=feet[side];p[side==='L'?'left':'right']=solveDisplayLeg(p.height,p.offsetZ,p.pitch,f.y+.112,f.z-rootZ,f.contact);}
  p.armL=[-.15-.55*squat,0,-.025];p.armR=[-.15-.55*squat,0,.025];p.forearmL=[-.75,0,0];p.forearmR=[-.75,0,0];
  p.handL.curl=.25;p.handR.curl=.25;
  return {pose:p,root:[0,0,rootZ] as Vec3};
}
/** Human grasp landmark, separate from the wrist pivot. The basket stays upright. */
export function humanGripPoint(p:MotionPose,side:'L'|'R'):Vector3{
  const metadata=hands.bones as Record<string,{rest:number[];parent:string|null}>;
  const chain=['pelvis','torso','arm_'+side,'forearm_'+side,'humanroll_'+side,'humanhand_'+side];
  const q=new Quaternion(),out=new Vector3();
  for(const name of chain){
    const b=metadata[name];
    if(name==='pelvis'){out.set(p.swayX??0,p.height,p.offsetZ);q.copy(rot(p.pitch,p.pelvisYaw??0,p.pelvisRoll??0));continue;}
    const parent=metadata[b.parent!];out.add(new Vector3().fromArray(b.rest).sub(new Vector3().fromArray(parent.rest)).applyQuaternion(q));
    const h=p[side==='L'?'handL':'handR'],j=hands.human[side];
    if(name==='torso')q.multiply(rot(...p.torso));
    else if(name.startsWith('arm_'))q.multiply(rot(...p[side==='L'?'armL':'armR']));
    else if(name.startsWith('forearm_'))q.multiply(rot(...p[side==='L'?'forearmL':'forearmR']));
    else if(name.startsWith('humanroll'))q.multiply(new Quaternion().setFromAxisAngle(new Vector3(...j.rollAxis),h.roll));
    else q.multiply(new Quaternion().setFromAxisAngle(new Vector3(...j.wristPitchAxis),h.pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(...j.wristYawAxis),h.yaw));
  }
  return out.add(new Vector3(side==='L'?.0135380148:-.0135380148,-.0566149145,.0689389260).applyQuaternion(q));
}
function baseFrame(pose=sampleMotion('idle',0)):ScenarioFrame {
  return {pose,root:[0,0,0],environment:'studio',chapter:0,action:'静态总装',camera:{position:[2.3,1.7,4.5],target:[0,.92,0]},shellOpacity:1,fade:0,box:null,boxHeld:false,fruit:null,fruitHeld:false,basket:null,basketYaw:0,grips:{}};
}
function targetArm(f:ScenarioFrame,side:'L'|'R',target:Vec3,grip:number,weight=1) {
  const local=target.map((v,i)=>v-f.root[i]) as Vec3;
  const home=robotGripPoint(f.pose,side,neutralRobotArm()).toArray() as Vec3;
  const key=side==='L'?'robotL':'robotR';
  // Interpolate the hand's path first. Solving an unreachable final target while
  // the body is still standing can otherwise flip the elbow during approach.
  f.pose[key]=weight===0?neutralRobotArm():armToTarget(f.pose,side,vlerp(home,local,weight),lerp(neutralRobotArm().grip,grip,weight));
  if(weight>.999)f.grips[side]=target;
}
export function sampleCarry(seconds:number):ScenarioFrame {
  const t=clamp(seconds,0,14),lower=ease(t,.2,1.6)*(1-ease(t,2,3.4))+ease(t,9.9,11.3)*(1-ease(t,12.4,14));
  const step=stairPose(t,lower),f={...baseFrame(step.pose),root:step.root,environment:'carry' as const};
  const carried:Vec3=[0,stairPose(t).pose.height-.08,step.root[2]+.48],pickup:Vec3=[0,CRATE_GROUND_Y,-.12],drop:Vec3=[0,.80+CRATE_GROUND_Y,1.92];
  f.box=t<3.4?vlerp(pickup,carried,ease(t,2,3.4)):t<9.9?carried:vlerp(carried,drop,ease(t,9.9,11.3));
  f.boxHeld=t>=1.85&&t<11.65;
  const reach=ease(t,.65,1.7)*(1-ease(t,12,13)),grip=lerp(.95,.06,ease(t,1.55,1.85))+(.95-.06)*ease(t,11.4,11.9);
  for(const side of ['L','R'] as const)targetArm(f,side,[side==='L'?-.455:.455,f.box[1]+.05,f.box[2]],grip,reach);
  applyHumanCarryContact(f.pose,t);
  // After release, lower the human forearms to a relaxed hanging posture.
  // The separate contact fade lifts the fingers clear before this return begins.
  const rest=ease(t,13.05,14);
  for(const side of ['L','R'] as const){
    f.pose[`arm${side}`]=f.pose[`arm${side}`].map((v,i)=>lerp(v,i===2?(side==='L'?-.035:.035):0,rest)) as [number,number,number];
    f.pose[`forearm${side}`]=[lerp(f.pose[`forearm${side}`][0],.69,rest),0,0];
    const h=f.pose[`hand${side}`];h.roll=lerp(h.roll,0,rest);h.pitch=lerp(h.pitch,0,rest);h.yaw=lerp(h.yaw,0,rest);h.curl=lerp(h.curl,.12,rest);h.thumbCurl=lerp(h.thumbCurl??h.curl,.12,rest);
  }
  f.action=t<1.55?'髋部后移 · 深蹲到地面箱体':t<2?'三指合拢 · 握住两侧把手':t<3.4?'连续伸髋伸膝 · 抬起箱体':t<9.6?'身体持续前移 · 交替登上四级楼梯':t<11.4?'深蹲放箱 · 箱底落在平台':t<12?'打开机械指 · 释放把手':'站起收臂 · 搬运完成';
  f.camera={position:[5.0,2.55,-2.6],target:[0,1.10,.72]};return f;
}
export function sampleHarvest(seconds:number):ScenarioFrame {
  const t=clamp(seconds,0,11),p=sampleMotion('idle',0),f={...baseFrame(p),environment:'harvest' as const};
  p.armL=[-.35,0,-.32];p.forearmL=[.44,0,0];p.handL={curl:1,roll:0,pitch:0,yaw:.298};f.basketYaw=Math.PI/2;
  p.robotR={...neutralRobotArm(),spread:radians(4),elbow:radians(64)};
  f.basket=humanGripPoint(p,'L').sub(new Vector3(0,.544,0)).toArray() as Vec3;
  const mouth:Vec3=[f.basket[0],f.basket[1]+.37,f.basket[2]+.12],retreat:Vec3=[-.53,1.46,.35];
  const carried=t<3.55?FRUIT_START:t<4.4?vlerp(FRUIT_START,retreat,ease(t,3.55,4.4)):vlerp(retreat,mouth,ease(t,4.4,7));
  const reach=ease(t,.35,2.8)*(1-ease(t,7.9,10.5));
  const grip=lerp(1,.57,ease(t,2.9,3.5))+.43*ease(t,7.1,7.6);
  targetArm(f,'L',carried,grip,reach);
  f.fruitHeld=t>=3.45&&t<7.45;
  const settled:Vec3=[f.basket[0],f.basket[1]+.058625,f.basket[2]+.12];
  f.fruit=t<3.45?[...FRUIT_START]:t<7.45?[...carried]:vlerp(mouth,settled,ease(t,7.45,7.85));
  f.action=t<.35?'人手提篮 · 机械臂准备采摘':t<2.9?'机械臂伸向枝头苹果':t<3.55?'三指轻合 · 摘下苹果':t<7?'机械臂避开身体 · 将苹果送到篮口':t<7.85?'机械指打开 · 苹果落入手提篮':'机械臂收回 · 完成一次采摘';
  const close=ease(t,1.5,3)*(1-ease(t,8,11));
  f.camera={position:vlerp([3.0,2.25,5.7],[2.45,2.10,5.1],close),target:vlerp([-.30,1.20,.50],[-.28,1.20,.40],close)};return f;
}
export function sampleScenario(sequence:Exclude<SequenceId,'basic'>,seconds:number):ScenarioFrame {
  if(sequence==='carry')return sampleCarry(seconds);if(sequence==='harvest')return sampleHarvest(seconds);
  const t=clamp(seconds,0,INTRO_DURATION),chapter=INTRO_CHAPTERS.findIndex(c=>t<c.end),index=chapter<0?INTRO_CHAPTERS.length-1:chapter,c=INTRO_CHAPTERS[index],local=t-c.start;
  let f:ScenarioFrame;
  if(index===5)f=sampleCarry(local);
  else if(index===6)f=sampleHarvest(local);
  else{
    const clip:MotionClipId=index===2?'walk':index===3?'run':index===4?(local<2?'squat':'singleLeg'):index===7?'dexterity':index===8?'wave':'idle';
    const duration=motionClip(clip).duration;
    const time=index===4?(local<2?local/2*5:(local-2)/3*6):index===7?local*1.5:index===8?local*1.2:local%duration;
    f=baseFrame(index<2?sampleMotion('idle',0):sampleMotion(clip,time));
    if(index===2||index===3)f.pose=blendMotion(sampleMotion('idle',0),f.pose,ease(local,0,.4)*(1-ease(local,c.end-c.start-.35,c.end-c.start)));
    const angle=index<2?.7+local*.18:index===4?.55:.45;
    f.camera={position:[Math.sin(angle)*4.7,1.75,Math.cos(angle)*4.7],target:[0,index===4?.77:.95,0]};
    if(index===7)f.camera={position:[1.6,1.9,3.3],target:[0,1.40,.32]};
    if(index===1)f.shellOpacity=1-.9*ease(local,0,.5)*(1-ease(local,2.5,3));
  }
  f.chapter=index;f.action=index===5||index===6?f.action:c.subtitle;
  f.fade=Math.max(index>0?1-ease(local,0,.25):0,index<INTRO_CHAPTERS.length-1?ease(local,c.end-c.start-.22,c.end-c.start):0);return f;
}
