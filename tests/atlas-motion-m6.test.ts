import {describe,it,expect} from 'vitest';
import {sampleMotion,motionClip,degrees} from '../src/domain/atlasMotion';
import {displayKneeFlexion} from '../src/domain/atlasMotionRig';
import {sampleCarry,sampleHarvest,STAIR_START,STAIR_END,humanGripPoint} from '../src/domain/atlasScenario';
import {Vector3} from 'three';

describe('M6 movement regressions',()=>{
  it('has continuous running root velocity at touchdown and liftoff',()=>{
    const duration=motionClip('run').duration,h=1e-6;
    const height=(phase:number)=>sampleMotion('run',((phase%1+1)%1)*duration).height;
    for(const p of [0,.16,.4,.5,.66,.9]){
      const before=(height(p)-height(p-h))/(h*duration),after=(height(p+h)-height(p))/(h*duration);
      expect(Math.abs(after-before)).toBeLessThan(.001);
    }
  });
  it('avoids the late-swing straight-knee snap in either running leg',()=>{
    const duration=motionClip('run').duration,n=2400;
    for(const side of ['L','R'] as const){
      let previous=degrees(displayKneeFlexion(sampleMotion('run',0),side)),peak=0;
      for(let i=1;i<=n;i++){
        const angle=degrees(displayKneeFlexion(sampleMotion('run',duration*i/n),side));
        peak=Math.max(peak,Math.abs(angle-previous)*n/duration);previous=angle;
        expect(angle).toBeGreaterThan(9);expect(angle).toBeLessThan(100);
      }
      expect(peak).toBeLessThan(850);
    }
  });
  it('moves the body continuously through the middle of the stair ascent',()=>{
    let maxVertical=0,minForward=Infinity;const dt=.001;
    for(let t=STAIR_START+.4;t<STAIR_END-.4;t+=dt){
      const a=sampleCarry(t),b=sampleCarry(t+dt);
      maxVertical=Math.max(maxVertical,Math.abs(b.pose.height-a.pose.height)/dt);
      minForward=Math.min(minForward,(b.root[2]-a.root[2])/dt);
    }
    expect(maxVertical).toBeLessThan(.40);expect(minForward).toBeGreaterThan(.08);
  });
  it('starts the crate on the floor clear of the first riser, and finishes on the platform',()=>{
    const a=sampleCarry(0),b=sampleCarry(14);
    expect(a.box![1]-.231).toBeCloseTo(0,6);
    expect(a.box![2]+.251).toBeLessThan(.16);
    expect(b.box![1]-.231).toBeCloseTo(.8,6);
    expect(b.box![2]-.251).toBeGreaterThan(b.root[2]+.205);
    expect(b.boxHeld).toBe(false);
  });
  it('keeps the basket handle in the human fist and deposits the apple inside it',()=>{
    for(let i=0;i<=50;i++){
      const f=sampleHarvest(11*i/50),handle=new Vector3(...f.basket!).add(new Vector3(0,.544,0));
      expect(handle.distanceTo(humanGripPoint(f.pose,'L'))).toBeLessThan(.000001);
      expect(f.basket![1]).toBeGreaterThan(.3);expect(f.pose.left.contact&&f.pose.right.contact).toBe(true);
    }
    const f=sampleHarvest(11);
    expect(f.fruit![1]-f.basket![1]).toBeCloseTo(.058625,6);
    expect(f.fruitHeld).toBe(false);expect(f.pose.handL.curl).toBe(1);
  });
});
