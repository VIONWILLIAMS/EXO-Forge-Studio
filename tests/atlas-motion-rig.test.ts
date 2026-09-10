import { CARRY_PALM_CONTACT } from '../src/domain/humanCarryContact';
import hands from '../src/domain/data/atlasHands.json';
import {readFileSync} from 'node:fs';
import {beforeAll,describe,it,expect} from 'vitest';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Mesh,SkinnedMesh,Vector3,Quaternion,type Group} from 'three';
import {createMotionRig,displayKneeFlexion} from '../src/domain/atlasMotionRig';
import {blendMotion,motionClip,sampleMotion} from '../src/domain/atlasMotion';
import {humanGripPoint,robotGripPoint,sampleScenario} from '../src/domain/atlasScenario';
let scene:Group,rig:ReturnType<typeof createMotionRig>;
beforeAll(async()=>{
  const bytes=readFileSync(new URL('../public/assets/v04/motion-m6/atlas-motion.glb',import.meta.url));
  scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  rig=createMotionRig(scene);
});
const point=(name:string)=>rig.bones[name].getWorldPosition(new Vector3());
const humanWrist=(side:'L'|'R')=>point('humanhand_'+side);
const contactPoints=(side:'L'|'R')=>hands.mechanical[side].fingers.map(f=>rig.bones[f.bones[1]].localToWorld(new Vector3(...f.distalContactLocal)));
const padCenter=(side:'L'|'R')=>contactPoints(side).reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(3);
describe('the actual M6 display model',()=>{
  it('places actual contact pads on scenario handles using the same kinematics as the authored rig',()=>{
    for(const sequence of ['carry','harvest'] as const)for(let i=0;i<=40;i++){
      const f=sampleScenario(sequence,(sequence==='carry'?14:11)*i/40);scene.position.set(...f.root);rig.apply(f.pose);
      for(const side of ['L','R'] as const){
        const actual=padCenter(side);
        const expected=robotGripPoint(f.pose,side,side==='L'?f.pose.robotL:f.pose.robotR).add(new Vector3(...f.root));
        expect(actual.distanceTo(expected)).toBeLessThan(.000002);
        const target=f.grips[side];if(target)expect(actual.distanceTo(new Vector3(...target))).toBeLessThan(.004);
      }
    }
    scene.position.set(0,0,0);
  });
  it.each(['carry','harvest'] as const)('clears the authored stair treads with actual rigid boots during %s',sequence=>{
    const meshes:Mesh[]=[];for(const side of ['L','R'])rig.bones['foot_'+side].traverse(n=>{if(n instanceof Mesh)meshes.push(n);});
    let penetration=0,worst='';const v=new Vector3();
    for(let i=0;i<=120;i++){
      const time=(sequence==='carry'?14:11)*i/120,f=sampleScenario(sequence,time);scene.position.set(...f.root);rig.apply(f.pose);
      for(const mesh of meshes){const attr=mesh.geometry.attributes.position;for(let j=0;j<attr.count;j++){
        v.fromBufferAttribute(attr,j).applyMatrix4(mesh.matrixWorld);
        const height=sequence==='carry'?(v.z>=1.30?.80:v.z>=.92?.60:v.z>=.54?.40:v.z>=.16?.20:0):0;
        if(height-v.y>penetration){penetration=height-v.y;worst=`${sequence} ${time} at ${v.toArray()}`;}
      }}
    }
    scene.position.set(0,0,0);expect(penetration,worst).toBeLessThan(.002);
  });
  it('has articulated human wrists/fingers and three two-link mechanical fingers per hand',()=>{
    expect(Object.keys(rig.bones)).toHaveLength(73);
    for(const side of ['L','R'] as const){
      expect(rig.bones['exowrist_'+side].parent).toBe(rig.bones['exoroll_'+side]);
      expect(rig.bones['humanhand_'+side].parent).toBe(rig.bones['humanroll_'+side]);
      for(const f of hands.mechanical[side].fingers)expect(rig.bones[f.bones[1]].parent).toBe(rig.bones[f.bones[0]]);
      for(const retired of ['jaw_minus_','jaw_plus_'])expect(rig.bones[retired+side].children).toHaveLength(0);
    }
  });
  it('keeps arm link lengths constant while exercising all axes',()=>{
    for(let i=0;i<=80;i++){
      rig.apply(sampleMotion('dexterity',12*i/80));
      for(const side of ['L','R']){
        expect(point('exoarm_'+side).distanceTo(point('exoforearm_'+side))).toBeCloseTo(Math.hypot(.061,.339,.075),6);
        expect(point('exoforearm_'+side).distanceTo(point('exowrist_'+side))).toBeCloseTo(Math.hypot(.001,.112,.288),6);
      }
    }
  });
  it('rotates the forearm about its own axis without moving the wrist pivot',()=>{
    const p=sampleMotion('dexterity',3);p.robotL.roll=0;rig.apply(p);const a=point('exowrist_L');
    p.robotL.roll=1.6;rig.apply(p);expect(point('exowrist_L').distanceTo(a)).toBeLessThan(1e-6);
  });
  it.each(['walk','run'] as const)('pairs each leading foot with the opposite human and robot hand during %s',clip=>{
    let leftLeads=0,rightLeads=0;
    for(let i=0;i<240;i++){
      const phase=i/240;rig.apply(sampleMotion(clip,motionClip(clip).duration*phase));
      // +Z is forward. Opposite signs mean left foot/right hand or vice versa.
      const feet=point('foot_L').z-point('foot_R').z;
      if(Math.abs(feet)<.002)continue; // Ignore the instant the feet cross.
      if(feet>0)leftLeads++;else rightLeads++;
      expect((humanWrist('L').z-humanWrist('R').z)*feet,`${clip} human phase ${phase}`).toBeLessThan(0);
      expect((point('exowrist_L').z-point('exowrist_R').z)*feet,`${clip} robot phase ${phase}`).toBeLessThan(0);
    }
    expect(leftLeads).toBeGreaterThan(100);expect(rightLeads).toBeGreaterThan(100);
  });
  it('articulates all three actual pads through the opening range without moving their grasp centre',()=>{
    for(const side of ['L','R'] as const){
      const p=sampleMotion('dexterity',4.8),arm=side==='L'?p.robotL:p.robotR;
      for(let i=0;i<=40;i++){
        arm.grip=i/40;rig.apply(p);const center=padCenter(side),expected=robotGripPoint(p,side,arm);
        expect(center.distanceTo(expected)).toBeLessThan(.000002);
        for(const point of contactPoints(side))expect(point.distanceTo(center)).toBeCloseTo(.012+.049*i/40,5);
      }
    }
  });
  it('curls every human digit for jogging and faces the waving palm toward the audience',()=>{
    rig.apply(sampleMotion('run',.2));
    for(const side of ['L','R'] as const)for(const finger of hands.human[side].fingers){
      expect(rig.bones[finger.bones[1]].quaternion.angleTo(new Quaternion())).toBeGreaterThan(.4);
    }
    for(let i=0;i<=24;i++){
      rig.apply(sampleMotion('wave',1.2+2.4*i/24));
      const normal=new Vector3(...hands.human.R.palmNormal).applyQuaternion(rig.bones.humanhand_R.getWorldQuaternion(new Quaternion()));
      expect(normal.z).toBeGreaterThan(.96);
    }
  });
  it('uses the real articulated human hand to hold the basket, away from the wrist pivot',()=>{
    const f=sampleScenario('harvest',5);rig.apply(f.pose);
    const grip=rig.bones.humanhand_L.localToWorld(new Vector3(.0135380148,-.0566149145,.0689389260));
    expect(grip.distanceTo(humanGripPoint(f.pose,'L'))).toBeLessThan(.000001);
    expect(grip.distanceTo(new Vector3(...f.basket!).add(new Vector3(0,.544,0)))).toBeLessThan(.000001);
    expect(grip.distanceTo(point('humanhand_L'))).toBeGreaterThan(.08);
  });
  it('blends the running fist without changing the fitted basket grip',()=>{
    const running=sampleMotion('run',.2),basket=sampleScenario('harvest',5).pose;
    for(const [p,mix] of [[running,1],[blendMotion(running,basket,.5),.5],[basket,0]] as const){
      rig.apply(p);
      for(const finger of hands.human.L.fingers)finger.bones.forEach((name,i)=>{
        const runDegrees=(finger.digit===1?[44,32,24]:[82,88,50])[i];
        const expected=(finger.relaxedFistDegrees[i]*(1-mix)+runDegrees*mix)*Math.PI/180;
        expect(rig.bones[name].quaternion.angleTo(new Quaternion())).toBeCloseTo(expected,6);
      });
    }
  });
  it('keeps actual human finger skin outside the carried crate',()=>{
    const samples:{mesh:SkinnedMesh;indices:number[]}[]=[];
    scene.traverse(n=>{
      if(!(n instanceof SkinnedMesh))return;
      const ids=n.geometry.attributes.skinIndex,weights=n.geometry.attributes.skinWeight;
      const handIds=new Set(n.skeleton.bones.map((b,i)=>/^human(hand|finger)_/.test(b.name)?i:-1).filter(i=>i>=0));
      const indices:number[]=[];
      for(let i=0;i<ids.count;i++){
        let w=0;for(let j=0;j<4;j++)if(handIds.has(ids.array[i*4+j]))w+=weights.array[i*4+j];
        if(w>.03)indices.push(i);
      }
      if(indices.length)samples.push({mesh:n,indices});
    });
    expect(samples.length).toBeGreaterThan(0);const v=new Vector3();
    let minimum=Infinity;
    for(let i=0;i<=30;i++){
      const f=sampleScenario('carry',14*i/30);scene.position.set(...f.root);rig.apply(f.pose);
      const box=new Box3(new Vector3(...f.box!).sub(new Vector3(.4,.21,.21)),new Vector3(...f.box!).add(new Vector3(.4,.21,.21)));
      for(const {mesh,indices} of samples){mesh.skeleton.update();for(const index of indices){mesh.getVertexPosition(index,v).applyMatrix4(mesh.matrixWorld);minimum=Math.min(minimum,box.distanceToPoint(v));}}
    }
    scene.position.set(0,0,0);expect(minimum).toBeGreaterThan(.00005);
    // The detailed lid sits 11 mm above this conservative body AABB.
    expect(minimum).toBeLessThan(.04);
  });
  it('rests both human palms on the upper box edges throughout lifting and climbing',()=>{
    for(let i=0;i<=140;i++){
      const t=1.6+(12.4-1.6)*i/140,f=sampleScenario('carry',t);scene.position.set(...f.root);rig.apply(f.pose);
      for(const side of ['L','R'] as const){
        const sign=side==='L'?-1:1;
        const palm=rig.bones['humanhand_'+side].localToWorld(new Vector3(-sign*.0208219897,-.0370011450,.0419411291));
        const target=new Vector3(...f.box!).add(new Vector3(sign*CARRY_PALM_CONTACT.x,CARRY_PALM_CONTACT.y,CARRY_PALM_CONTACT.z));
        expect(palm.distanceTo(target)).toBeLessThan(.0012);
        const normal=new Vector3(...hands.human[side].palmNormal).applyQuaternion(rig.bones['humanhand_'+side].getWorldQuaternion(new Quaternion()));
        expect(normal.y).toBeLessThan(-.95);
      }
    }
    scene.position.set(0,0,0);
  });
  it('plants the supporting leg under the shifted pelvis through the single-leg squat',()=>{
    for(let i=0;i<=100;i++){
      const p=sampleMotion('singleLeg',6*i/100);rig.apply(p);
      expect(point('foot_L').distanceTo(new Vector3(p.left.targetX??-.095,...p.left.target))).toBeLessThan(.0001);
      expect(point('foot_R').distanceTo(new Vector3(.095,...p.right.target))).toBeLessThan(.0001);
      if(i===50){
        expect(p.swayX).toBeGreaterThan(.08);expect(displayKneeFlexion(p,'R')*180/Math.PI).toBeGreaterThan(115);
        expect(displayKneeFlexion(p,'L')*180/Math.PI).toBeCloseTo(5,3);expect(p.left.target[1]).toBeGreaterThan(.55);expect(p.left.targetX).toBeLessThan(-.1);
        const toe=new Vector3(0,0,1).applyQuaternion(rig.bones.foot_L.getWorldQuaternion(new Quaternion()));
        expect(toe.y).toBeGreaterThan(.95);
      }
    }
  });
  it('lowers the human forearms after releasing the box',()=>{
    rig.apply(sampleScenario('carry',14).pose);
    for(const side of ['L','R'] as const){
      const elbow=point('forearm_'+side),wrist=point('humanhand_'+side),direction=wrist.sub(elbow).normalize();
      expect(direction.y).toBeLessThan(-.9);expect(Math.abs(direction.z)).toBeLessThan(.15);
    }
  });
  it('keeps rigid boots and foot plates above the floor through both gait cycles',()=>{
    const meshes:Mesh[]=[];for(const side of ['L','R'])rig.bones['foot_'+side].traverse(n=>{if(n instanceof Mesh)meshes.push(n);});
    const v=new Vector3();let lowest=Infinity;
    for(const clip of ['walk','run'] as const)for(let i=0;i<=24;i++){
      rig.apply(sampleMotion(clip,motionClip(clip).duration*i/24));
      for(const mesh of meshes){const pos=mesh.geometry.attributes.position;for(let j=0;j<pos.count;j++){v.fromBufferAttribute(pos,j).applyMatrix4(mesh.matrixWorld);lowest=Math.min(lowest,v.y);}}
    }
    expect(lowest).toBeGreaterThan(-.001);
  });
  it('keeps actual human knee near extension at heel strike and plants all 3D ankle targets',()=>{
    for(const clip of ['walk','run'] as const)for(let i=0;i<=120;i++){
      const p=sampleMotion(clip,motionClip(clip).duration*i/120);rig.apply(p);
      for(const side of ['L','R'] as const){
        const foot=p[side==='L'?'left':'right'];
        expect(point('foot_'+side).distanceTo(new Vector3(side==='L'?-.095:.095,...foot.target))).toBeLessThan(.0001);
        const upper=point('shin_'+side).sub(point('thigh_'+side)),lower=point('foot_'+side).sub(point('shin_'+side));
        expect(Math.abs(upper.angleTo(lower)-displayKneeFlexion(p,side))).toBeLessThan(.0001);
      }
      if(clip==='walk'&&i===0){
        const upper=point('shin_L').sub(point('thigh_L')),lower=point('foot_L').sub(point('shin_L'));
        expect(upper.angleTo(lower)*180/Math.PI).toBeLessThan(12);
      }
    }
  });
});
