import { describe,it,expect,beforeEach } from 'vitest';
import { advanceMotion, MOTION_CLIPS, sampleMotion, soleHeight, footPath, blendMotion, ARM_CONTROLS, jointDisplay, motionClip } from '../src/domain/atlasMotion';
import { GAIT_SETTINGS } from '../src/domain/atlasGait';
import { useAtlasMotion } from '../src/state/atlasMotionStore';

describe('display motion trajectories',()=>{
  it('all clips keep leg targets within reach and respect the sole envelope',()=>{
    for(const clip of MOTION_CLIPS)for(let frame=0;frame<=160;frame++){
      const p=sampleMotion(clip.id,frame*clip.duration/160);
      for(const leg of [p.left,p.right]){
        expect(leg.reachError).toBeLessThan(.00001);
        expect(Number.isFinite(leg.hip+leg.knee+leg.ankle)).toBe(true);
        expect(leg.knee).toBeGreaterThan(-.02);
        expect(leg.knee).toBeLessThan(2.3);
        expect(Math.abs(p.pitch+leg.hip+leg.knee+leg.ankle-leg.footPitch)).toBeLessThan(1e-10);
        expect(leg.target[0]).toBeGreaterThanOrEqual(soleHeight(leg.footPitch)-1e-10);
      }
    }
  });
  it('foot velocity is continuous across lift-off, landing and loop boundaries',()=>{
    const h=1e-6;
    for(const running of [false,true])for(const t of [0,running?GAIT_SETTINGS.run.duty:GAIT_SETTINGS.walk.duty]){
      const a=footPath(t-h,running),b=footPath(t,running),c=footPath(t+h,running);
      for(const key of ['y','z','pitch'] as const)expect(Math.abs((b[key]-a[key])/h-(c[key]-b[key])/h)).toBeLessThan(.002);
    }
  });
  it('walking extends the supporting leg and keeps the torso upright',()=>{
    const p=sampleMotion('walk',.3125);
    expect(p.height).toBeGreaterThan(.933);expect(p.pitch).toBeLessThan(.03);
  });
  it('robot choreography stays in display ranges and moves wrists and fingers independently',()=>{
    for(const clip of MOTION_CLIPS)for(let i=0;i<=80;i++){
      const p=sampleMotion(clip.id,clip.duration*i/80);
      for(const a of [p.robotL,p.robotR])for(const c of ARM_CONTROLS){const v=jointDisplay(a,c.id);expect(v).toBeGreaterThanOrEqual(c.min-1e-6);expect(v).toBeLessThanOrEqual(c.max+1e-6);}
    }
    const p=sampleMotion('dexterity',4.8);expect(p.robotL).not.toEqual(p.robotR);expect(Math.abs(p.robotL.roll)).toBeGreaterThan(1);
    expect(sampleMotion('grasp',8*.18).robotL.grip).toBe(1);expect(sampleMotion('grasp',8*.34).robotL.grip).toBe(0);
  });
  it('pose crossfade starts at the current pose and ends at the requested pose',()=>{
    const a=sampleMotion('squat',2),b=sampleMotion('dexterity',4);
    expect(blendMotion(a,b,0).robotL).toEqual(a.robotL);expect(blendMotion(a,b,1).robotR).toEqual(b.robotR);
    const near=blendMotion(a,b,.01);expect(Math.abs(near.height-a.height)).toBeLessThan(.00001);
  });
  it('walk alternates legs and running includes a flight phase',()=>{
    const frames=(id:'walk'|'run')=>Array.from({length:100},(_,i)=>sampleMotion(id,i*motionClip(id).duration/100));
    expect(frames('walk').every(p=>p.left.contact||p.right.contact)).toBe(true);
    expect(frames('walk').some(p=>p.left.contact&&p.right.contact)).toBe(true);
    expect(frames('run').some(p=>!p.left.contact&&!p.right.contact)).toBe(true);
    const a=sampleMotion('walk',0),b=sampleMotion('walk',motionClip('walk').duration/2);
    expect(a.left.target[1]).toBeCloseTo(b.right.target[1]);
  });
  it('squat lowers the pelvis while both feet stay on their targets',()=>{
    const upright=sampleMotion('squat',0),low=sampleMotion('squat',2.5);
    expect(upright.height-low.height).toBeCloseTo(.525);
    expect(low.left.target).toEqual(upright.left.target);
    expect(low.left.knee).toBeGreaterThan(1.3);
  });
  it('clips have continuous loop endpoints',()=>{
    for(const clip of MOTION_CLIPS){
      const start=sampleMotion(clip.id,0),end=sampleMotion(clip.id,clip.duration);
      expect(start.left.hip).toBeCloseTo(end.left.hip,8);
      expect(start.right.knee).toBeCloseTo(end.right.knee,8);
      expect(start.armR[0]).toBeCloseTo(end.armR[0],8);
    }
  });
  it('time advance supports speed, loop and finite ending',()=>{
    expect(advanceMotion(1.23,.05,1,1.25,true).time).toBeCloseTo(.03);
    expect(advanceMotion(1.23,.05,1,1.25,false)).toEqual({time:1.25,finished:true});
    expect(advanceMotion(0,.04,.5,1.25,true).time).toBeCloseTo(.02);
    expect(advanceMotion(0,10,1,1.25,true).time).toBe(.1);
  });
});
describe('motion controls',()=>{
  beforeEach(()=>{useAtlasMotion.getState().setEnabled(false);useAtlasMotion.getState().choose('walk');useAtlasMotion.getState().setArmTarget('both');});
  it('enter, seek, pause and exit are explicit',()=>{
    const api=useAtlasMotion.getState();api.setEnabled(true);expect(useAtlasMotion.getState().playing).toBe(true);
    api.seek(.5);expect(useAtlasMotion.getState().time).toBe(.5);expect(useAtlasMotion.getState().playing).toBe(false);
    api.setEnabled(false);expect(useAtlasMotion.getState().enabled).toBe(false);expect(useAtlasMotion.getState().playing).toBe(false);
  });
  it('clip changes reset time and enforce speed and seek bounds',()=>{
    const api=useAtlasMotion.getState();api.seek(20);expect(useAtlasMotion.getState().time).toBe(motionClip('walk').duration);
    api.choose('run');expect(useAtlasMotion.getState().time).toBe(0);expect(useAtlasMotion.getState().clip).toBe('run');
    api.setSpeed(100);expect(useAtlasMotion.getState().speed).toBe(1.5);
    api.setSpeed(NaN);expect(useAtlasMotion.getState().speed).toBe(.25);
  });
  it('pause does not request a seek back to the UI sampling time',()=>{
    const api=useAtlasMotion.getState(),revision=api.revision;
    api.setPlaying(false);expect(useAtlasMotion.getState().revision).toBe(revision);
    api.seek(1.25);api.setPlaying(true);expect(useAtlasMotion.getState().time).toBe(0);
  });
  it('manual edits capture the live pose, pause playback, and change only the selected arm',()=>{
    const api=useAtlasMotion.getState(),pose=sampleMotion('dexterity',3);
    api.choose('dexterity');api.tick(3,false,pose);api.setArmTarget('R');api.setArmJoint('grip',100);
    const state=useAtlasMotion.getState();expect(state.manual).toBe(true);expect(state.playing).toBe(false);expect(state.time).toBe(3);
    expect(state.armL).toEqual(pose.robotL);expect(state.armR.grip).toBe(1);expect(state.armR.lift).toBe(pose.robotR.lift);
    api.setPlaying(true);expect(useAtlasMotion.getState().manual).toBe(false);
  });
  it('switching the travel path does not seek to an older UI sample',()=>{
    const api=useAtlasMotion.getState(),revision=api.revision;api.setTravel('orbit');expect(useAtlasMotion.getState().revision).toBe(revision);
  });
});
