import { GAIT_SETTINGS, gaitSpeed, gaitTargets } from './atlasGait';
import { Euler, Quaternion, Vector3 } from 'three';
/** Display choreography only. Metres/radians; these are not hardware joint limits. */
export type MotionClipId = 'idle' | 'walk' | 'run' | 'squat' | 'singleLeg' | 'reach' | 'wave' | 'dexterity' | 'grasp';
export type MotionTravel = 'inPlace' | 'orbit';
export type Rotation = [number, number, number];
export const MOTION_CLIPS = [
  { id:'idle', label:'待机', english:'IDLE', duration:4, description:'放松站姿 · 轻微呼吸' },
  { id:'walk', label:'步行', english:'WALK', duration:GAIT_SETTINGS.walk.duration, description:'健康步行曲线 · 落脚缓冲、支撑推进与收腿迈步' },
  { id:'run', label:'慢跑', english:'JOG', duration:GAIT_SETTINGS.run.duration, description:'2.5 m/s 跑步数据参考 · 屈膝缓冲、收腿与短暂腾空' },
  { id:'squat', label:'深蹲', english:'DEEP SQUAT', duration:5, description:'髋部后移并降至膝下 · 双脚全程支撑' },
  { id:'singleLeg', label:'单腿深蹲', english:'SINGLE LEG', duration:6, description:'右腿支撑下蹲 · 左腿向前伸直，起身后双脚落地' },
  { id:'reach', label:'抬臂', english:'REACH', duration:4.2, description:'肩部抬升与外展 · 腕部调整方向' },
  { id:'wave', label:'招手', english:'WAVE', duration:4.8, description:'抬臂、转腕与夹指开合' },
  { id:'dexterity', label:'灵活运臂', english:'REACH 3D', duration:12, description:'双臂独立扫掠 · 肩、肘、前臂与腕协同' },
  { id:'grasp', label:'抓放演示', english:'GRIP', duration:8, description:'空载演示：张开 → 合拢 → 抬起转腕 → 松开' },
] as const;
export function motionClip(id: MotionClipId) { return MOTION_CLIPS.find(c=>c.id===id)!; }
export const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
export const radians=(degrees:number)=>degrees*Math.PI/180;
export const degrees=(angle:number)=>angle*180/Math.PI;
export const smooth=(t:number)=>{const x=clamp(t,0,1);return x*x*x*(10+x*(-15+6*x));};
const TAU=Math.PI*2;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export type RobotArmPose = {lift:number;spread:number;yaw:number;elbow:number;roll:number;wristPitch:number;wristYaw:number;grip:number};
export type ArmJoint = keyof RobotArmPose;
export const ARM_CONTROLS: {id:ArmJoint;label:string;min:number;max:number;unit:string}[] = [
  {id:'lift',label:'肩部抬升',min:-15,max:110,unit:'°'},
  {id:'spread',label:'向外展开',min:0,max:70,unit:'°'},
  {id:'yaw',label:'前后回转',min:-35,max:50,unit:'°'},
  {id:'elbow',label:'肘部弯曲',min:25,max:130,unit:'°'},
  {id:'roll',label:'前臂旋转',min:-100,max:100,unit:'°'},
  {id:'wristPitch',label:'腕部俯仰',min:-45,max:45,unit:'°'},
  {id:'wristYaw',label:'腕部侧摆',min:-40,max:40,unit:'°'},
  {id:'grip',label:'三指张合',min:0,max:100,unit:'%'},
];
// The CAD forearm is already bent by ~56 degrees in its rest pose.
export const REST_ELBOW=radians(56);
export function neutralRobotArm():RobotArmPose {return {lift:0,spread:0,yaw:0,elbow:REST_ELBOW,roll:0,wristPitch:0,wristYaw:0,grip:16/52};}
export function jointDisplay(a:RobotArmPose,k:ArmJoint) {return k==='grip'?a.grip*100:degrees(a[k]);}
export function withArmJoint(a:RobotArmPose,k:ArmJoint,v:number):RobotArmPose {
  const spec=ARM_CONTROLS.find(c=>c.id===k)!,bounded=clamp(v,spec.min,spec.max);
  return {...a,[k]:k==='grip'?bounded/100:radians(bounded)};
}
export function mixArm(a:RobotArmPose,b:RobotArmPose,t:number):RobotArmPose {
  return Object.fromEntries(Object.keys(a).map(k=>[k,lerp(a[k as ArmJoint],b[k as ArmJoint],t)])) as RobotArmPose;
}
function arm(lift=0,spread=0,yaw=0,elbow=56,roll=0,wristPitch=0,wristYaw=0,grip=16/52):RobotArmPose {
  return {lift:radians(lift),spread:radians(spread),yaw:radians(yaw),elbow:radians(elbow),roll:radians(roll),wristPitch:radians(wristPitch),wristYaw:radians(wristYaw),grip};
}
function armTrack(phase:number,keys:[number,RobotArmPose][]):RobotArmPose {
  for(let i=1;i<keys.length;i++)if(phase<=keys[i][0]){const [t0,a]=keys[i-1],[t1,b]=keys[i];return mixArm(a,b,smooth((phase-t0)/(t1-t0)));}
  return {...keys[keys.length-1][1]};
}
export type LegPose={hip:number;knee:number;ankle:number;footPitch:number;target:[number,number];targetX?:number;footYaw?:number;contact:boolean;reachError:number};
export type HumanHandPose={curl:number;roll:number;pitch:number;yaw:number;runningFist?:number;thumbCurl?:number};
export const neutralHumanHand=():HumanHandPose=>({curl:.12,roll:0,pitch:0,yaw:0});
export type MotionPose={
  phase:number;height:number;offsetZ:number;pitch:number;torso:Rotation;
  pelvisYaw?:number;pelvisRoll?:number;swayX?:number;gait?:boolean;
  left:LegPose;right:LegPose;armL:Rotation;armR:Rotation;forearmL:Rotation;forearmR:Rotation;
  robotL:RobotArmPose;robotR:RobotArmPose;handL:HumanHandPose;handR:HumanHandPose;travelSpeed:number;
};
const UPPER=Math.hypot(.469,.004),LOWER=Math.hypot(.366,.001);
const REST_HIP=Math.atan2(.004,.469),REST_SHIN=Math.atan2(-.001,.366);
export function solveDisplayLeg(height:number,rootZ:number,pitch:number,footY:number,footZ:number,contact=true,footPitch=0):LegPose {
  const dy=height-footY,dz=footZ-rootZ,distance=Math.hypot(dy,dz);
  const reach=clamp(distance,Math.abs(UPPER-LOWER)+.000001,UPPER+LOWER-.000001);
  const knee=Math.acos(clamp((reach*reach-UPPER*UPPER-LOWER*LOWER)/(2*UPPER*LOWER),-1,1));
  const thigh=Math.atan2(dz,dy)+Math.atan2(LOWER*Math.sin(knee),UPPER+LOWER*Math.cos(knee));
  const hip=REST_HIP-thigh-pitch,localKnee=knee+REST_SHIN-REST_HIP;
  return {hip,knee:localKnee,ankle:footPitch-pitch-hip-localKnee,footPitch,target:[footY,footZ],contact,reachError:Math.max(0,distance-reach)};
}
// Conservative sole envelope keeps the toe/heel above ground as the foot rolls.
export function soleHeight(pitch:number) {return .112*Math.cos(pitch)+Math.max(.205*Math.sin(pitch),-.085*Math.sin(pitch));}
type FootTarget={y:number;z:number;x?:number;yaw?:number;pitch:number;contact:boolean};
export function footPath(phase:number,running:boolean):FootTarget {return gaitTargets(phase,running).left;}
export function sampleMotion(id:MotionClipId,seconds:number):MotionPose {
  const phase=clamp(seconds,0,motionClip(id).duration)/motionClip(id).duration;
  const cycle=TAU*phase,pulse=(1-Math.cos(cycle))/2;
  const p:MotionPose={phase,height:.945-.0005*pulse,offsetZ:0,pitch:0,torso:[0,0,0],left:null!,right:null!,armL:[0,0,0],armR:[0,0,0],forearmL:[.48,0,0],forearmR:[.48,0,0],robotL:neutralRobotArm(),robotR:neutralRobotArm(),handL:neutralHumanHand(),handR:neutralHumanHand(),travelSpeed:0};
  let left:FootTarget={y:.112,z:.003,pitch:0,contact:true},right={...left};
  if(id==='walk'||id==='run'){
    const running=id==='run',g=gaitTargets(phase,running);left=g.left;right=g.right;
    p.height=g.height;p.offsetZ=g.offsetZ;p.pelvisYaw=g.yaw;p.pelvisRoll=g.roll;p.swayX=g.swayX;p.gait=true;
    // Arm timing follows actual opposing foot advance, including unequal stance/swing.
    const rawOpposition=(left.z-right.z)/(running?.68:.60);
    const opposition=running?clamp(rawOpposition,-1,1):softOpposition(rawOpposition);
    p.pitch=running?.085:.015;
    // Counter-rotate in world space. Subtracting Euler angles leaks pelvic roll
    // into shoulder yaw and can briefly put the wrong hand ahead at foot crossing.
    const torsoQ=new Quaternion().setFromEuler(new Euler(p.pitch,g.yaw,g.roll)).invert()
      .multiply(new Quaternion().setFromEuler(new Euler(p.pitch,-.055*opposition,g.roll*.3,'ZYX')));
    const torsoEuler=new Euler().setFromQuaternion(torsoQ);p.torso=[torsoEuler.x,torsoEuler.y,torsoEuler.z];
    const swing=opposition*(running?.40:.24);
    p.armL=[swing-(running?.10:0),0,-.025];p.armR=[-swing-(running?.10:0),0,.025];
    // Human elbows in the source mesh are already flexed ~50°. Walking relaxes
    // them toward ~20°, jogging keeps them near a right angle.
    p.forearmL=[running?-.60:.48+.025*opposition,0,0];p.forearmR=[running?-.60:.48-.025*opposition,0,0];
    p.robotL=arm(3-3*opposition,3,0,60);p.robotR=arm(3+3*opposition,3,0,60);
    if(running){p.handL={curl:1,roll:0,pitch:0,yaw:0,runningFist:1};p.handR={...p.handL};}
    p.travelSpeed=gaitSpeed(id);
  }else if(id==='squat'||id==='singleLeg'){
    const single=id==='singleLeg';
    const depth=smooth(phase/.44)*(1-smooth((phase-.56)/.44));
    const weight=smooth(phase/.18)*(1-smooth((phase-.82)/.18));
    p.height=.945-(single?.475:.525)*depth;p.offsetZ=-(single?.235:.28)*depth;p.pitch=(single?.50:.62)*depth;
    p.torso=[-.04*depth,0,0];
    p.armL=[-1.55*depth,0,-.06*weight];p.armR=[-1.55*depth,0,.06*weight];
    p.forearmL=[.48-.06*depth,0,0];p.forearmR=[.48-.06*depth,0,0];
    p.robotL=arm(24*depth,10*depth,0,56+12*depth);p.robotR={...p.robotL};
    if(single){
      p.gait=true;p.swayX=.088*weight;
      // A nearly straight free leg sweeps forward from its own hip. Leave a
      // small 5-degree knee bend instead of solving exactly at full extension.
      const freeLength=Math.sqrt(UPPER*UPPER+LOWER*LOWER+2*UPPER*LOWER*Math.cos(radians(5)));
      const heading=-.12,footPitch=-(.16+1.16*depth)*weight;
      const footY=soleHeight(footPitch)+(.245*depth+.05*weight)*weight;
      const forward=Math.sqrt(Math.max(0,freeLength*freeLength-(p.height-footY)**2));
      const footX=p.swayX-.11+forward*Math.sin(heading),footZ=p.offsetZ+forward*Math.cos(heading);
      left={x:lerp(-.095,footX,weight),y:footY,z:lerp(.003,footZ,weight),pitch:footPitch,yaw:heading*weight,contact:weight<.001};
      right.yaw=.14*weight;
    }
  }else if(id==='reach'){
    p.armL=[-.72*pulse,0,-.12*pulse];p.armR=[-.72*pulse,0,.12*pulse];p.forearmL=[.48-.12*pulse,0,0];p.forearmR=[.48-.12*pulse,0,0];
    p.robotL=arm(54*pulse,20*pulse,8*pulse,56+12*pulse,-45*pulse,-18*pulse,10*pulse,.31+.45*pulse);p.robotR={...p.robotL,roll:-p.robotL.roll};
  }else if(id==='wave'){
    const e=smooth(phase/.24)*(1-smooth((phase-.76)/.24));
    const wave=.15*e*Math.sin(cycle*3);
    p.armR=[-.85*e,0,.28*e];p.forearmR=[.48*(1-e)-1.30*e,0,wave];
    p.handR={curl:.08,roll:(1.32-.77*wave)*e,pitch:-.26*e,yaw:0};
    p.robotR=arm(48*e,30*e,4*e,56+34*e,35*e*Math.sin(cycle*3),-10*e,22*e*Math.sin(cycle*3),.31+e*(.35+.3*Math.sin(cycle*3)));
  }else if(id==='dexterity'){
    p.robotL=armTrack(phase,[[0,arm()],[.18,arm(52,30,-10,90,-65,20,20,.85)],[.4,arm(92,48,18,62,70,-25,-25,.25)],[.63,arm(35,58,32,104,-50,30,20,.9)],[.82,arm(62,18,-8,80,50,0,-15,.15)],[1,arm()]]);
    p.robotR=armTrack(phase,[[0,arm()],[.18,arm(30,52,20,75,60,-15,-22,.25)],[.4,arm(68,20,-12,95,-65,25,25,.85)],[.63,arm(90,42,14,60,70,-20,-15,.35)],[.82,arm(38,48,25,100,-30,20,20,.9)],[1,arm()]]);
    p.torso=[0,.018*Math.sin(cycle),0];
  }else if(id==='grasp'){
    p.robotL=armTrack(phase,[[0,arm()],[.18,arm(25,16,-8,62,0,10,0,1)],[.34,arm(25,16,-8,62,0,10,0,0)],[.58,arm(54,24,8,88,75,-20,12,0)],[.76,arm(54,24,8,88,75,-20,12,1)],[1,arm()]]);
    p.robotR={...p.robotL,roll:-p.robotL.roll,wristYaw:-p.robotL.wristYaw};
  }
  p.left=solveDisplayLeg(p.height,p.offsetZ,p.pitch,left.y,left.z,left.contact,left.pitch);
  p.right=solveDisplayLeg(p.height,p.offsetZ,p.pitch,right.y,right.z,right.contact,right.pitch);
  p.left.targetX=left.x;p.right.targetX=right.x;p.left.footYaw=left.yaw;p.right.footYaw=right.yaw;
  if(p.gait){
    const rotation=new Euler(p.pitch,p.pelvisYaw??0,p.pelvisRoll??0);
    for(const [leg,s] of [[p.left,-1],[p.right,1]] as const){
      const hip=new Vector3(s*.11,0,0).applyEuler(rotation).add(new Vector3(p.swayX??0,p.height,p.offsetZ));
      const distance=hip.distanceTo(new Vector3(leg.targetX??s*.095,...leg.target));
      // The visible rig solves in 3D: a tilted pelvis has unequal hip heights.
      leg.reachError=Math.max(0,distance-(UPPER+LOWER-.000001),Math.abs(UPPER-LOWER)+.000001-distance);
    }
  }
  return p;
}
export function blendMotion(a:MotionPose,b:MotionPose,t:number):MotionPose {
  const weight=smooth(t),p={...b};
  if(t<=0)return {...a};if(t>=1)return {...b};
  p.gait=a.gait||b.gait;
  for(const k of ['pelvisYaw','pelvisRoll','swayX'] as const)p[k]=lerp(a[k]??0,b[k]??0,weight);
  for(const k of ['height','offsetZ','pitch','travelSpeed'] as const)p[k]=lerp(a[k],b[k],weight);
  for(const k of ['armL','armR','forearmL','forearmR','torso'] as const)p[k]=a[k].map((v,i)=>lerp(v,b[k][i],weight)) as Rotation;
  for(const k of ['handL','handR'] as const){
    p[k]=Object.fromEntries(['curl','roll','pitch','yaw','runningFist'].map(j=>[j,lerp(a[k][j as keyof HumanHandPose]??0,b[k][j as keyof HumanHandPose]??0,weight)])) as HumanHandPose;
    p[k].thumbCurl=lerp(a[k].thumbCurl??a[k].curl,b[k].thumbCurl??b[k].curl,weight);
  }
  p.robotL=mixArm(a.robotL,b.robotL,weight);p.robotR=mixArm(a.robotR,b.robotR,weight);
  for(const k of ['left','right'] as const){
    p[k]=solveDisplayLeg(p.height,p.offsetZ,p.pitch,lerp(a[k].target[0],b[k].target[0],weight),lerp(a[k].target[1],b[k].target[1],weight),weight<.5?a[k].contact:b[k].contact,lerp(a[k].footPitch,b[k].footPitch,weight));
    const restX=k==='left'?-.095:.095;
    p[k].targetX=lerp(a[k].targetX??restX,b[k].targetX??restX,weight);
    p[k].footYaw=lerp(a[k].footYaw??0,b[k].footYaw??0,weight);
  }
  return p;
}
export function advanceMotion(time:number,delta:number,speed:number,duration:number,loop:boolean) {
  const next=clamp(time,0,duration)+clamp(delta,0,.1)*clamp(speed,.25,1.5);
  return loop?{time:next%duration,finished:false}:{time:Math.min(next,duration),finished:next>=duration};
}

function softOpposition(value:number){
  const a=Math.abs(value);if(a<=.85)return value;if(a>=1.15)return Math.sign(value);
  const u=(a-.85)/.30;return Math.sign(value)*(.85+.30*(u-u*u*u+.5*u*u*u*u));
}
