import {describe,it,expect} from 'vitest';
import {INTRO_CHAPTERS, sampleScenario, robotGripPoint, sequenceDuration} from '../src/domain/atlasScenario';
import {useAtlasMotion} from '../src/state/atlasMotionStore';
import {Vector3} from 'three';

describe('continuous display task scenes',()=>{
  it.each(['carry','harvest'] as const)('%s keeps both legs reachable and jaws on scripted contact targets',sequence=>{
    const duration=sequence==='carry'?14:11;let maxGrip=0,maxLeg=0,worst='';
    for(let i=0;i<=180;i++){
      const time=duration*i/180,f=sampleScenario(sequence,time);
      for(const l of [f.pose.left,f.pose.right]){maxLeg=Math.max(maxLeg,l.reachError);expect(l.target[0]).toBeGreaterThan(.11);}
      for(const side of ['L','R'] as const){const target=f.grips[side];if(!target)continue;
        const point=robotGripPoint(f.pose,side,side==='L'?f.pose.robotL:f.pose.robotR).add(new Vector3(...f.root));
        const error=point.distanceTo(new Vector3(...target));if(error>maxGrip){maxGrip=error;worst=`${sequence} ${side} at ${time}, target ${target}, arm ${JSON.stringify(side==='L'?f.pose.robotL:f.pose.robotR)}`;}
      }
    }
    expect(maxLeg).toBeLessThan(.00001);expect(maxGrip,worst).toBeLessThan(.004);
  });
  it.each(['carry','harvest'] as const)('%s has no internal root, prop or hand jumps when seeking',sequence=>{
    const duration=sequence==='carry'?14:11;
    for(let i=0;i<duration*100;i++){
      const a=sampleScenario(sequence,i/100),b=sampleScenario(sequence,(i+1)/100);
      expect(new Vector3(...a.root).distanceTo(new Vector3(...b.root))).toBeLessThan(.018);
      for(const key of ['box','fruit'] as const)if(a[key]&&b[key])expect(new Vector3(...a[key]!).distanceTo(new Vector3(...b[key]!))).toBeLessThan(.025);
      for(const side of ['L','R'] as const){const x=robotGripPoint(a.pose,side,side==='L'?a.pose.robotL:a.pose.robotR),y=robotGripPoint(b.pose,side,side==='L'?b.pose.robotL:b.pose.robotR);expect(x.distanceTo(y),`${sequence} ${side} ${i/100}: ${JSON.stringify(a.pose.robotL)} -> ${JSON.stringify(b.pose.robotL)}`).toBeLessThan(.04);}
    }
  });
  it('has a contiguous 50-second introduction including both complete tasks',()=>{
    expect(INTRO_CHAPTERS[0].start).toBe(0);expect(INTRO_CHAPTERS.at(-1)!.end).toBe(50);
    INTRO_CHAPTERS.slice(1).forEach((c,i)=>expect(c.start).toBe(INTRO_CHAPTERS[i].end));
    expect(sampleScenario('intro',30.99).boxHeld).toBe(false);
    expect(sampleScenario('intro',41.99).fruitHeld).toBe(false);
    expect(sampleScenario('intro',50).chapter).toBe(8);
    expect(sampleScenario('intro',4.5).shellOpacity).toBeLessThan(.2);
  });
  it('seeks, pauses, restarts and exits the introduction without a basic-clip duration clamp',()=>{
    const api=useAtlasMotion.getState();api.chooseSequence('intro');
    expect(sequenceDuration(useAtlasMotion.getState())).toBe(50);expect(useAtlasMotion.getState().loop).toBe(false);expect(useAtlasMotion.getState().speed).toBe(1);
    api.seek(30);expect(useAtlasMotion.getState().time).toBe(30);expect(useAtlasMotion.getState().playing).toBe(false);
    api.seek(100);expect(useAtlasMotion.getState().time).toBe(50);api.setPlaying(true);expect(useAtlasMotion.getState().time).toBe(0);
    api.choose('walk');expect(useAtlasMotion.getState().sequence).toBe('basic');expect(sequenceDuration(useAtlasMotion.getState())).toBe(1.10);
  });
});
