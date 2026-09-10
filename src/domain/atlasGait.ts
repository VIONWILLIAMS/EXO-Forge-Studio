import reference from './data/gaitReference.json';

/** Healthy-subject reference curves; never a clinical prescription or device command. */
export const GAIT_REFERENCE=reference;
export const GAIT_SETTINGS={walk:{duration:1.10,duty:.62},run:{duration:.76,duty:.40}};
export type GaitId=keyof typeof GAIT_SETTINGS;
const rad=(v:number)=>v*Math.PI/180,TAU=Math.PI*2;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(10+t*(-15+6*t));};
export const gaitPhase=(p:number)=>((p%1)+1)%1;
/** Periodic cubic interpolation avoids a velocity discontinuity at the loop seam. */
export function gaitCurve(values:number[],phase:number) {
  const x=gaitPhase(phase)*100,i=Math.floor(x),t=x-i;
  const at=(n:number)=>values[(n+100)%100];
  const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
  return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
}
export function gaitAngles(id:GaitId,phase:number){
  const c=reference[id].curves,get=(k:'hip'|'knee'|'ankle')=>gaitCurve(c[k].mean,phase);
  return {hip:get('hip'),knee:get('knee'),ankle:get('ankle')};
}
const UPPER=Math.hypot(.469,.004),LOWER=Math.hypot(.366,.001);
export function gaitSole(pitch:number){return .112*Math.cos(pitch)+Math.max(.205*Math.sin(pitch),-.085*Math.sin(pitch));}
function referenceLeg(id:GaitId,phase:number){
  const a=gaitAngles(id,phase),walk=id==='walk';
  // Walking includes measured global pelvic tilt. Running has joint angles only:
  // the 10° pelvis/rest-axis offset is an explicit rig adaptation, not measured data.
  const tilt=walk?gaitCurve(reference.walk.curves.pelvisTilt.mean,phase):10;
  const thigh=rad(a.hip-tilt),knee=rad(walk?2+positiveC2(a.knee-2,1.5):Math.max(2,a.knee));
  const foot=walk?gaitCurve(reference.walk.curves.foot.mean,phase):a.hip-tilt-a.knee+a.ankle+2;
  const rawPitch=-rad(foot),pitch=walk?walkPitchFlat(rawPitch):rawPitch,z=UPPER*Math.sin(thigh)+LOWER*Math.sin(thigh-knee);
  const span=UPPER*Math.cos(thigh)+LOWER*Math.cos(thigh-knee);
  return {z,span,pitch,contact:gaitPhase(phase)<GAIT_SETTINGS[id].duty};
}
function pelvicMotion(phase:number,running:boolean){
  const p=gaitPhase(phase),anti=(values:number[])=>.5*(gaitCurve(values,p)-gaitCurve(values,p+.5));
  return {yaw:rad(anti(reference.walk.curves.pelvisRotation.mean))*(running?.7:1),
    roll:-rad(anti(reference.walk.curves.pelvisObliquity.mean))*(running?.6:.65),
    swayX:-(running?.009:.016)*Math.sin(TAU*p)};
}
function hipOffset(phase:number,running:boolean,s:number){
  const {yaw,roll,swayX}=pelvicMotion(phase,running),pitch=running?.085:.015;
  return {x:swayX+s*.11*Math.cos(yaw)*Math.cos(roll),
    y:s*.11*(Math.cos(pitch)*Math.sin(roll)+Math.sin(pitch)*Math.sin(yaw)*Math.cos(roll)),
    z:s*.11*(Math.sin(pitch)*Math.sin(roll)-Math.cos(pitch)*Math.sin(yaw)*Math.cos(roll))};
}
function supportCircle(id:GaitId,phase:number,bodyPhase:number,s:number){
  const f=referenceLeg(id,phase),route=progression(id),hip=hipOffset(bodyPhase,id==='run',s);
  const measuredKnee=gaitAngles(id,phase).knee,knee=rad(id==='walk'?2+positiveC2(measuredKnee-2,1.5):Math.max(2,measuredKnee));
  return {z:route.origin-route.perCycle*phase+gaitRockerOffset(f.pitch)-hip.z,y:gaitSole(f.pitch)-hip.y,
    r2:UPPER*UPPER+LOWER*LOWER+2*UPPER*LOWER*Math.cos(knee)-(s*.095-hip.x)**2};
}
function supportHeight(id:GaitId,phase:number,offsetZ=0){
  const c=supportCircle(id,phase,phase,-1);
  return c.y+Math.sqrt(Math.max(0,c.r2-(c.z-offsetZ)**2));
}
// Heel and toe pivots are 290 mm apart on the existing rigid sole. The two
// branches meet with equal value/velocity at foot-flat, avoiding stance skating.
export function gaitRockerOffset(pitch:number){return (pitch<0?-.085:.205)*(1-Math.cos(pitch))+.112*Math.sin(pitch);}
const progression=(id:GaitId)=>{
  const start=referenceLeg(id,0),end=referenceLeg(id,GAIT_SETTINGS[id].duty);
  const origin=start.z-gaitRockerOffset(start.pitch);
  return {origin,perCycle:(origin-end.z+gaitRockerOffset(end.pitch))/GAIT_SETTINGS[id].duty};
};
export function gaitSpeed(id:GaitId){return (id==='run'?runningRoute:progression(id)).perCycle/GAIT_SETTINGS[id].duration;}
function doubleSupport(phase:number){
  const a=supportCircle('walk',phase,phase,-1),b=supportCircle('walk',phase+.5,phase,1),dz=b.z-a.z,dy=b.y-a.y,d=Math.hypot(dz,dy);
  const along=(a.r2-b.r2+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r2-along*along)),sign=dz<0?-1:1;
  return {z:a.z+dz/d*along-sign*dy/d*h,y:a.y+dy/d*along+sign*dz/d*h};
}
const transferEnd=GAIT_SETTINGS.walk.duty-.5;
const rootStart=doubleSupport(0),rootEnd=doubleSupport(transferEnd);
const epsilon=.00001;
const startVelocity=(doubleSupport(epsilon).z-doubleSupport(-epsilon).z)/(2*epsilon);
const endVelocity=(doubleSupport(transferEnd+epsilon).z-doubleSupport(transferEnd-epsilon).z)/(2*epsilon);
function walkingRootRaw(half:number){
  if(half<transferEnd)return doubleSupport(half);
  const length=.5-transferEnd,u=(half-transferEnd)/length,u2=u*u,u3=u2*u;
  const z=(2*u3-3*u2+1)*rootEnd.z+(u3-2*u2+u)*length*endVelocity+(-2*u3+3*u2)*rootStart.z+(u3-u2)*length*startVelocity;
  return {z,y:supportHeight('walk',half,z)};
}


// C2 bridges only around load transfer. Match the original centre value and
// velocity, so a bridge cannot alter the touchdown target or step length.
const WALK_ROOT_BRIDGE=.012;
const walkingRootBridges=([0,transferEnd] as const).map(center=>{
  const get=(q:number)=>walkingRootRaw(gaitPhase(q)%.5),e=.00001;
  const at=(q:number)=>{const before=get(q-e),v=get(q),after=get(q+e);
    return {y:{p:v.y,v:(after.y-before.y)/(2*e),a:(after.y-2*v.y+before.y)/(e*e)},
      z:{p:v.z,v:(after.z-before.z)/(2*e),a:(after.z-2*v.z+before.z)/(e*e)}};};
  return {center,left:at(center-WALK_ROOT_BRIDGE),middle:at(center),right:at(center+WALK_ROOT_BRIDGE)};
});
function walkingRootReference(half:number){
  let root=walkingRootRaw(half);
  for(const edge of walkingRootBridges){
    const offset=(half-edge.center+.75)%.5-.25;
    if(Math.abs(offset)>=WALK_ROOT_BRIDGE)continue;
    const a=offset<0?edge.left:edge.middle,b=offset<0?edge.middle:edge.right,u=(offset<0?offset+WALK_ROOT_BRIDGE:offset)/WALK_ROOT_BRIDGE;
    root={y:quinticHermite(u,a.y.p,b.y.p,a.y.v,b.y.v,a.y.a,b.y.a,WALK_ROOT_BRIDGE),
      z:quinticHermite(u,a.z.p,b.z.p,a.z.v,b.z.v,a.z.a,b.z.a,WALK_ROOT_BRIDGE)};
    break;
  }
  // A 2.1 mm local clearance keeps touchdown away from straight-leg IK.
  return {z:root.z,y:root.y-.0021*(1-smooth(Math.min(half,.5-half)/.08))};
}


// Keep the ground anchors and stride. Only reduce the pelvis's fast fore/aft
// component, fitting three periodic terms once from the existing M7 root.
const walkingRootProjection=(()=>{
  const count=512,values=Array.from({length:count},(_,i)=>walkingRootReference(i/count*.5).z);
  const mean=values.reduce((sum,z)=>sum+z,0)/count;
  const terms=Array.from({length:3},(_,i)=>{
    let cosine=0,sine=0;const k=i+1;
    for(let j=0;j<count;j++){const a=TAU*k*j/count;cosine+=values[j]*Math.cos(a);sine+=values[j]*Math.sin(a);}
    return {cosine:cosine*2/count,sine:sine*2/count};
  });
  return {mean,terms};
})();
function walkingRootSupport(half:number){
  const referenceRoot=walkingRootReference(half);
  const z=walkingRootProjection.mean+.80*walkingRootProjection.terms.reduce((sum,term,i)=>{
    const a=2*TAU*(i+1)*half;return sum+term.cosine*Math.cos(a)+term.sine*Math.sin(a);
  },0);
  // Adjust height along the original support-leg radius. A Z-only reduction
  // can otherwise make the planted leg longer than its physical links.
  const supportY=(q:number,side:number)=>{
    const hip=hipOffset(half,false,side),f=referenceLeg('walk',q);
    const footY=gaitSole(f.pitch),footZ=walkingRoute.origin-walkingRoute.perCycle*q+gaitRockerOffset(f.pitch);
    const vertical2=(referenceRoot.y+hip.y-footY)**2+(footZ-referenceRoot.z-hip.z)**2-(footZ-z-hip.z)**2;
    return footY-hip.y+Math.sqrt(Math.max(.001,vertical2));
  };
  const leading=supportY(half,-1),transfer=.16;
  // This is a pelvis-height interpolation interval; contact duty remains .62.
  const y=half<transfer?lerp(supportY(half+.5,1),leading,smooth(half/transfer)):leading;
  return {y,z};
}

/** Retarget the measured cycle to the existing thigh/shin lengths and rigid shoes.
 * Joint curves supply the leg trajectory; stance/flight supply the root height.
 * Limited IK clearance corrections are intentionally separate from source data. */
// M6 rigid-boot retargeting: C2 pelvis and C1 touchdown; reference data unchanged.
function quinticHermite(u:number,p0:number,p1:number,v0:number,v1:number,a0:number,a1:number,L:number){
  const c0=p0,c1=v0*L,c2=.5*a0*L*L,d=p1-c0-c1-c2,v=v1*L-c1-2*c2,a=a1*L*L-2*c2;
  const c3=10*d-4*v+.5*a,c4=-15*d+7*v-a,c5=6*d-3*v+.5*a;
  return c0+u*(c1+u*(c2+u*(c3+u*(c4+u*c5))));
}
function runningRoot(phase:number){
  const p=gaitPhase(phase)%.5,duty=GAIT_SETTINGS.run.duty,D=GAIT_SETTINGS.run.duration;
  const h0=.918,ht=.938,hm=.890,T=(.5-duty)*D;
  const vt=(h0-ht)/T+9.81*T/2,v0=vt-9.81*T;
  if(p<.16)return quinticHermite(p/.16,h0,hm,v0,0,-9.81,12,.16*D);
  if(p<duty)return quinticHermite((p-.16)/(duty-.16),hm,ht,0,vt,12,-9.81,(duty-.16)*D);
  const t=(p-duty)*D;return ht+vt*t-.5*9.81*t*t;
}
function runningFootPitch(phase:number){
  const p=gaitPhase(phase),raw=referenceLeg('run',p).pitch;
  // The M3 rigid shoe has a 205 mm toe lever. Limit its late-stance rollover;
  // return to the source-derived foot angle during recovery swing.
  return raw*(1-.58*smooth((p-.22)/.18)*(1-smooth((p-.4)/.14)));
}
const runningRoute=(()=>{
  const start=referenceLeg('run',0),end=referenceLeg('run',GAIT_SETTINGS.run.duty);
  const origin=start.z-gaitRockerOffset(runningFootPitch(0));
  return {origin,perCycle:(origin-end.z+gaitRockerOffset(runningFootPitch(GAIT_SETTINGS.run.duty)))/GAIT_SETTINGS.run.duty};
})();
function positiveC2(x:number,e=.001){
  if(x<=-e)return 0;if(x>=e)return x;
  const u=(x+e)/(2*e);return 2*e*(u*u*u-.5*u*u*u*u);
}
const RUN_FOOT_Z_OFFSET=-.010;
const RUN_LANDING_START=.96;
function runningGroundKnee(q:number,s:number){
  const bodyPhase=gaitPhase(q+(s===1?.5:0)),hip=hipOffset(bodyPhase,true,s);
  const pitch=runningFootPitch(q),y=gaitSole(pitch),z=runningRoute.origin-runningRoute.perCycle*q+gaitRockerOffset(pitch)+RUN_FOOT_Z_OFFSET;
  const d2=(s*.095-hip.x)**2+(runningRoot(bodyPhase)+hip.y-y)**2+(z-hip.z)**2;
  return Math.acos(Math.max(-1,Math.min(1,(d2-UPPER*UPPER-LOWER*LOWER)/(2*UPPER*LOWER))))*180/Math.PI;
}
// Bake only the landing boundary conditions, not a new sampled gait curve.
const runningLanding=([-1,1] as const).map(s=>{
  const e=.00001,D=GAIT_SETTINGS.run.duration,t=RUN_LANDING_START;
  return {k0:gaitAngles('run',t).knee,
    v0:(gaitAngles('run',t+e).knee-gaitAngles('run',t-e).knee)/(2*e*D),
    k1:runningGroundKnee(0,s),
    v1:(-3*runningGroundKnee(0,s)+4*runningGroundKnee(e,s)-runningGroundKnee(2*e,s))/(2*e*D)};
});
function runningSwingKnee(q:number,s:number){
  if(q<=RUN_LANDING_START)return gaitAngles('run',q).knee;
  const {k0,k1,v0,v1}=runningLanding[s===-1?0:1],u=(q-RUN_LANDING_START)/(1-RUN_LANDING_START),u2=u*u,u3=u2*u,L=(1-RUN_LANDING_START)*GAIT_SETTINGS.run.duration;
  return (2*u3-3*u2+1)*k0+(u3-2*u2+u)*L*v0+(-2*u3+3*u2)*k1+(u3-u2)*L*v1;
}
function runningTargets(phase:number){
  const p=gaitPhase(phase),duty=GAIT_SETTINGS.run.duty,height=runningRoot(p);
  const {yaw,roll,swayX}=pelvicMotion(p,true);
  const foot=(q0:number,s:number)=>{
    const q=gaitPhase(q0),u=Math.max(0,(q-duty)/(1-duty)),f=referenceLeg('run',q),pitch=runningFootPitch(q);
    const planted=(t:number)=>runningRoute.origin-runningRoute.perCycle*t+gaitRockerOffset(pitch)+RUN_FOOT_Z_OFFSET;
    let z=planted(q),y=gaitSole(pitch);
    if(!f.contact){
      z=lerp(z,f.z,smooth(u/.20));z=lerp(z,planted(q-1),smooth((u-.80)/.20));
      const hip=hipOffset(p,true,s),knee=rad(Math.max(6,runningSwingKnee(q,s)));
      const r2=UPPER*UPPER+LOWER*LOWER+2*UPPER*LOWER*Math.cos(knee)-(s*.095-hip.x)**2;
      const kneeY=height+hip.y-Math.sqrt(Math.max(.001,r2-(z-hip.z)**2)),clearance=.025*Math.sin(Math.PI*u)**2;
      // Shrink the soft floor band to zero at contact. A fixed band would
      // leave 0.1875mm of clearance then drop it instantly at touchdown.
      const floorBand=.001*(1-smooth((q-RUN_LANDING_START)/(1-RUN_LANDING_START)));
      y+=clearance+positiveC2(kneeY-y-clearance,floorBand);
    }
    return {y,z,pitch,contact:f.contact};
  };
  return {height,offsetZ:0,left:foot(p,-1),right:foot(p+.5,1),yaw,roll,swayX};
}


const walkingRoute=progression('walk');

// The support-derived height is an initializer, not a per-frame constraint.
// Two periodic terms remove its extra rise/fall during load transfer.
const walkingHeightProjection=(()=>{
  const count=512,values=Array.from({length:count},(_,i)=>walkingRootSupport(i/count*.5).y);
  const mean=values.reduce((sum,y)=>sum+y,0)/count;
  const terms=Array.from({length:2},(_,i)=>{
    let cosine=0,sine=0;const k=i+1;
    for(let j=0;j<count;j++){const a=TAU*k*j/count;cosine+=values[j]*Math.cos(a);sine+=values[j]*Math.sin(a);}
    return {cosine:cosine*2/count,sine:sine*2/count};
  });return {mean,terms};
})();
function walkingRoot(half:number){
  const sample=(projection:{mean:number;terms:{cosine:number;sine:number}[]},scale=1)=>projection.mean+scale*projection.terms.reduce((sum,term,i)=>{
    const a=2*TAU*(i+1)*half;return sum+term.cosine*Math.cos(a)+term.sine*Math.sin(a);
  },0);
  // A fixed 0.5mm geometric margin, with no animated reach cap or contact lag.
  return {y:sample(walkingHeightProjection)-.0005,z:sample(walkingRootProjection,.80)};
}

const WALK_LANDING_START=.84;
function walkingGroundKnee(q:number,s:number){
  const p=gaitPhase(q+(s===1?.5:0)),root=walkingRoot(p%.5),hip=hipOffset(p,false,s),f=referenceLeg('walk',q);
  const y=gaitSole(f.pitch),z=walkingRoute.origin-walkingRoute.perCycle*q+gaitRockerOffset(f.pitch);
  const d2=(s*.095-hip.x)**2+(root.y+hip.y-y)**2+(z-root.z-hip.z)**2;
  return Math.acos(Math.max(-1,Math.min(1,(d2-UPPER*UPPER-LOWER*LOWER)/(2*UPPER*LOWER))))*180/Math.PI;
}
function walkingFoot(q:number,s:number,bodyPhase:number,root:{y:number;z:number},kneeDegrees:number,terminal=false){
  const f=referenceLeg('walk',q),duty=GAIT_SETTINGS.walk.duty,u=Math.max(0,(q-duty)/(1-duty));
  const planted=(t:number)=>walkingRoute.origin-walkingRoute.perCycle*t+gaitRockerOffset(f.pitch);
  let z=planted(q),y=gaitSole(f.pitch);
  if(!f.contact){
    z=lerp(z,f.z+root.z,smooth(u/.20));z=lerp(z,planted(q-1),smooth((u-.80)/.20));
    const hip=hipOffset(bodyPhase,false,s),knee=rad(Math.max(2,kneeDegrees));
    const r2=UPPER*UPPER+LOWER*LOWER+2*UPPER*LOWER*Math.cos(knee)-(s*.095-hip.x)**2;
    const kneeY=root.y+hip.y-Math.sqrt(Math.max(.0001,r2-(z-root.z-hip.z)**2)),clearance=.012*Math.sin(Math.PI*u)**2;
    // A finite floor blend avoids abrupt switching. It vanishes at toe-off;
    // terminal swing already starts from the actual cleared pose, so do not
    // add the clearance blend twice at that boundary.
    const band=terminal?0:.0015*smooth((q-duty)/.025);
    y+=clearance+positiveC2(kneeY-y-clearance,band);
  }
  return {y,z,pitch:f.pitch,contact:f.contact};
}
function walkingRecoveryKnee(q:number,s:number){
  const p=gaitPhase(q+(s===1?.5:0)),root=walkingRoot(p%.5),hip=hipOffset(p,false,s);
  const foot=walkingFoot(q,s,p,root,gaitAngles('walk',q).knee);
  const d2=(s*.095-hip.x)**2+(root.y+hip.y-foot.y)**2+(foot.z-root.z-hip.z)**2;
  return Math.acos(Math.max(-1,Math.min(1,(d2-UPPER*UPPER-LOWER*LOWER)/(2*UPPER*LOWER))))*180/Math.PI;
}
const walkingLanding=([-1,1] as const).map(s=>{
  const e=.00001,q=WALK_LANDING_START;
  return {k0:walkingRecoveryKnee(q,s),v0:(walkingRecoveryKnee(q+e,s)-walkingRecoveryKnee(q-e,s))/(2*e),
    k1:walkingGroundKnee(0,s),v1:(-3*walkingGroundKnee(0,s)+4*walkingGroundKnee(e,s)-walkingGroundKnee(2*e,s))/(2*e)};
});
// Match the actual toe-off pose before returning to the reference recovery.
// This keeps the new pelvis path from releasing the swing-foot floor abruptly.
const WALK_LIFT_END=.70;
const walkingLiftBoundary=([-1,1] as const).map(s=>{
  const e=.00001,at=(fn:(q:number)=>number,q:number)=>({p:fn(q),v:(fn(q+e)-fn(q-e))/(2*e),a:(fn(q+e)-2*fn(q)+fn(q-e))/(e*e)});
  return {start:at(q=>walkingGroundKnee(q,s),GAIT_SETTINGS.walk.duty),end:at(q=>walkingRecoveryKnee(q,s),WALK_LIFT_END)};
});
function walkingSwingKnee(q:number,s:number){
  if(q>=GAIT_SETTINGS.walk.duty&&q<WALK_LIFT_END){
    const b=walkingLiftBoundary[s===-1?0:1],L=WALK_LIFT_END-GAIT_SETTINGS.walk.duty;
    return quinticHermite((q-GAIT_SETTINGS.walk.duty)/L,b.start.p,b.end.p,b.start.v,b.end.v,b.start.a,b.end.a,L);
  }
  if(q<=WALK_LANDING_START)return gaitAngles('walk',q).knee;
  const b=walkingLanding[s===-1?0:1],L=1-WALK_LANDING_START,u=(q-WALK_LANDING_START)/L,u2=u*u,u3=u2*u;
  // Extra terminal-swing clearance has zero value, speed and acceleration at
  // both ends; it prevents the floor constraint from flattening this interval.
  return (2*u3-3*u2+1)*b.k0+(u3-2*u2+u)*L*b.v0+(-2*u3+3*u2)*b.k1+(u3-u2)*L*b.v1+7*64*u*u*u*(1-u)**3;
}
function walkingTargets(phase:number){
  const p=gaitPhase(phase),root=walkingRoot(p%.5),rightPhase=gaitPhase(p+.5);
  return {height:root.y,offsetZ:root.z,
    left:walkingFoot(p,-1,p,root,walkingSwingKnee(p,-1),p>=WALK_LANDING_START),
    right:walkingFoot(rightPhase,1,p,root,walkingSwingKnee(rightPhase,1),rightPhase>=WALK_LANDING_START),
    ...pelvicMotion(p,false)};
}
export function gaitTargets(phase:number,running:boolean){return running?runningTargets(phase):walkingTargets(phase);}



function walkPitchFlat(p:number){const band=.035,u=Math.abs(p)/band;return u>=1?p:Math.sign(p)*band*u*u*u*(6+u*(-8+3*u));}
