import { describe,expect,it } from 'vitest';
import { writeFileSync,mkdirSync } from 'node:fs';
import { GAIT_REFERENCE,GAIT_SETTINGS,gaitAngles,gaitRockerOffset,gaitSpeed } from '../src/domain/atlasGait';
import { degrees,motionClip,sampleMotion } from '../src/domain/atlasMotion';
import { displayKneeFlexion } from '../src/domain/atlasMotionRig';

describe('healthy reference retargeting',()=>{
  it('retains two distinct attributed 101-point source datasets',()=>{
    expect(GAIT_REFERENCE.walk.n).toBe(24);expect(GAIT_REFERENCE.run.n).toBe(28);
    for(const id of ['walk','run'] as const)for(const k of ['hip','knee','ankle'] as const){
      expect(GAIT_REFERENCE[id].curves[k].mean).toHaveLength(101);
      expect(GAIT_REFERENCE[id].curves[k].mean.every(Number.isFinite)).toBe(true);
    }
    expect(GAIT_REFERENCE.walk.curves.knee.mean[10]).toBeGreaterThan(10);
    expect(GAIT_REFERENCE.run.curves.knee.mean[20]).toBeGreaterThan(30);
  });
  it('preserves walking loading response and a much deeper running recovery swing',()=>{
    const report:Record<string,unknown>={};
    for(const id of ['walk','run'] as const){
      const duration=motionClip(id).duration,duty=GAIT_SETTINGS[id].duty;
      const frames=Array.from({length:101},(_,i)=>sampleMotion(id,i*duration/100));
      const actual=frames.map(p=>degrees(displayKneeFlexion(p,'L'))),errors=actual.map((v,i)=>v-gaitAngles(id,i/100).knee);
      const stance=Math.max(...actual.slice(4,id==='walk'?25:32)),swing=Math.max(...actual.slice(Math.ceil(duty*100)));
      expect(stance).toBeGreaterThan(id==='walk'?10:30);expect(stance).toBeLessThan(id==='walk'?30:55);
      expect(swing).toBeGreaterThan(id==='walk'?50:80);expect(swing).toBeLessThan(id==='walk'?80:115);
      if(id==='walk')expect(actual[0]).toBeLessThan(12);
      report[id]={duration,cadenceStepsPerMinute:120/duration,retargetedTravelSpeed:gaitSpeed(id),initialContactKnee:actual[0],loadingKneePeak:stance,swingKneePeak:swing,kneeRmseDegrees:Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/101),height:[Math.min(...frames.map(p=>p.height)),Math.max(...frames.map(p=>p.height))]};
    }
    mkdirSync('output/v04',{recursive:true});writeFileSync('output/v04/motion-m5-gait-metrics.json',JSON.stringify(report,null,2)+'\n');
  });
  it('locks the rigid sole contact along a straight progression during stance',()=>{
    for(const id of ['walk','run'] as const){
      const duration=motionClip(id).duration,duty=GAIT_SETTINGS[id].duty;
      const origin=sampleMotion(id,0).left;
      const start=origin.target[1]-gaitRockerOffset(origin.footPitch);
      for(let i=0;i<100;i++){
        const time=duty*duration*i/100,p=sampleMotion(id,time),foot=p.left;
        expect(foot.target[1]-gaitRockerOffset(foot.footPitch)+p.travelSpeed*time).toBeCloseTo(start,8);
      }
    }
  });
  it('keeps target positions continuous at support changes, flight and the loop',()=>{
    for(const id of ['walk','run'] as const){
      const duration=motionClip(id).duration,duty=GAIT_SETTINGS[id].duty;
      for(const phase of [0,duty,.5,duty-.5].filter(p=>p>=0)){
        const a=sampleMotion(id,((phase-1e-5+1)%1)*duration),b=sampleMotion(id,((phase+1e-5)%1)*duration);
        expect(Math.abs(a.height-b.height)).toBeLessThan(.0003);
        for(const side of ['left','right'] as const){
          expect(Math.abs(a[side].target[0]-b[side].target[0])).toBeLessThan(.0003);
          expect(Math.abs(a[side].target[1]-b[side].target[1])).toBeLessThan(.0003);
        }
      }
    }
  });
});
