import {describe,it,expect} from 'vitest';
import {sampleMotion,motionClip,degrees} from '../src/domain/atlasMotion';
import {displayKneeFlexion} from '../src/domain/atlasMotionRig';

describe('M7 walking smoothness regressions',()=>{
  it('does not pull down the pelvis or snap either knee in terminal swing',()=>{
    const n=5000,dt=motionClip('walk').duration/n;
    let a=sampleMotion('walk',0),b=sampleMotion('walk',dt),maxRootAcceleration=0,maxKneeSpeed=0;
    for(let i=2;i<=n;i++){
      const c=sampleMotion('walk',i*dt);
      maxRootAcceleration=Math.max(maxRootAcceleration,Math.abs(c.height-2*b.height+a.height)/(dt*dt));
      for(const side of ['L','R'] as const)maxKneeSpeed=Math.max(maxKneeSpeed,Math.abs(degrees(displayKneeFlexion(c,side)-displayKneeFlexion(b,side)))/dt);
      expect(c.left.reachError).toBeLessThan(1e-6);expect(c.right.reachError).toBeLessThan(1e-6);
      a=b;b=c;
    }
    expect(maxRootAcceleration).toBeLessThan(12);expect(maxKneeSpeed).toBeLessThan(370);
  });
});
