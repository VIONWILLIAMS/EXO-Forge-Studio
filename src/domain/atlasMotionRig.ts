import * as THREE from 'three';
import hands from './data/atlasHands.json';
import { REST_ELBOW, type MotionPose } from './atlasMotion';

/** Flexion of the rendered 3D leg, including the pelvic correction used below. */
export function displayKneeFlexion(p:MotionPose,side:'L'|'R'){
  const leg=p[side==='L'?'left':'right'];
  if(!p.gait)return leg.knee+Math.atan2(.004,.469)-Math.atan2(-.001,.366);
  const s=side==='L'?-1:1,hip=new THREE.Vector3(s*.11,0,0)
    .applyEuler(new THREE.Euler(p.pitch,p.pelvisYaw??0,p.pelvisRoll??0))
    .add(new THREE.Vector3(p.swayX??0,p.height,p.offsetZ));
  const d2=hip.distanceToSquared(new THREE.Vector3(leg.targetX??s*.095,...leg.target)),a=Math.hypot(.469,.004),b=Math.hypot(.366,.001);
  return Math.acos(Math.max(-1,Math.min(1,(d2-a*a-b*b)/(2*a*b))));
}

export function createMotionRig(scene:THREE.Object3D) {
  const bones:Record<string,THREE.Bone>={},rest:Record<string,THREE.Vector3>={};
  scene.traverse(n=>{if(n instanceof THREE.Bone){bones[n.name]=n;rest[n.name]=n.position.clone();}});
  for(const side of ['L','R'])for(const name of ['exoshoulder','exoarm','exoforearm','exoroll','exowrist','jaw_minus','jaw_plus'])
    if(!bones[name+'_'+side])throw new Error('动作模型缺少关节：'+name+'_'+side);
  const x=new THREE.Vector3(1,0,0),q=new THREE.Quaternion();
  const axes={L:new THREE.Vector3(.001,-.112,.288).normalize(),R:new THREE.Vector3(-.001,-.112,.288).normalize()};
  const yawAxes={L:new THREE.Vector3().crossVectors(axes.L,x).normalize(),R:new THREE.Vector3().crossVectors(axes.R,x).normalize()};
  const apply=(p:MotionPose,updateWorld=true)=>{
    bones.pelvis.position.set(p.swayX??0,p.height,p.offsetZ);bones.pelvis.rotation.set(p.pitch,p.pelvisYaw??0,p.pelvisRoll??0);
    bones.torso.rotation.set(...p.torso);bones.head.rotation.set(-p.pitch*.3,-p.torso[1]*.5,-p.torso[2]*.5);
    for(const side of ['L','R'] as const){
      const leg=side==='L'?p.left:p.right,arm=side==='L'?p.robotL:p.robotR,s=side==='L'?-1:1;
      bones['thigh_'+side].rotation.set(leg.hip,0,0);bones['shin_'+side].rotation.set(leg.knee,0,0);bones['foot_'+side].rotation.set(leg.ankle,0,0);
      if(p.gait){
        // A small 3D two-link solve keeps the feet on their targets while the
        // pelvis rotates and shifts above them. Bone lengths never change.
        const pelvisQ=bones.pelvis.quaternion,hip=rest['thigh_'+side].clone().applyQuaternion(pelvisQ).add(bones.pelvis.position);
        const ankle=new THREE.Vector3(leg.targetX??s*.095,leg.target[0],leg.target[1]);
        const thighRest=rest['shin_'+side],shinRest=rest['foot_'+side],upper=thighRest.length(),lower=shinRest.length();
        const direction=ankle.clone().sub(hip),distance=Math.min(direction.length(),upper+lower-.000001);direction.normalize();
        const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
        const heading=new THREE.Vector3(Math.sin(leg.footYaw??0),0,Math.cos(leg.footYaw??0));
        const bend=heading.addScaledVector(direction,-heading.dot(direction)).normalize();
        const knee=hip.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
        const upperQ=new THREE.Quaternion().setFromUnitVectors(thighRest.clone().normalize(),knee.clone().sub(hip).normalize());
        const lowerQ=new THREE.Quaternion().setFromUnitVectors(shinRest.clone().normalize(),ankle.clone().sub(knee).normalize());
        bones['thigh_'+side].quaternion.copy(pelvisQ).invert().multiply(upperQ);
        bones['shin_'+side].quaternion.copy(upperQ).invert().multiply(lowerQ);
        bones['foot_'+side].quaternion.copy(lowerQ).invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(leg.footPitch,leg.footYaw??0,0,'YXZ')));
      }
      bones['arm_'+side].rotation.set(...(side==='L'?p.armL:p.armR));bones['forearm_'+side].rotation.set(...(side==='L'?p.forearmL:p.forearmR));
      bones['exoshoulder_'+side].rotation.set(0,s*arm.yaw,0);
      bones['exoarm_'+side].rotation.set(-arm.lift,0,s*arm.spread,'XYZ');
      bones['exoforearm_'+side].rotation.set(-(arm.elbow-REST_ELBOW),0,0);
      // Roll about the actual CAD forearm axis, not the global vertical axis.
      bones['exoroll_'+side].quaternion.setFromAxisAngle(axes[side],arm.roll);
      bones['exowrist_'+side].quaternion.setFromAxisAngle(x,arm.wristPitch).multiply(q.setFromAxisAngle(yawAxes[side],arm.wristYaw));
      if(bones['humanhand_'+side]){
        const human=hands.human[side],hand=side==='L'?p.handL:p.handR;
        bones[human.rollBone].quaternion.setFromAxisAngle(new THREE.Vector3(...human.rollAxis),hand.roll);
        bones[human.handBone].quaternion.setFromAxisAngle(new THREE.Vector3(...human.wristPitchAxis),hand.pitch)
          .multiply(q.setFromAxisAngle(new THREE.Vector3(...human.wristYawAxis),hand.yaw));
        // Running closes the fingers a little further; the basket grip keeps its
        // independently fitted shape. Blend this profile across clip transitions.
        for(const finger of human.fingers)finger.bones.forEach((name,i)=>{
          const runningDegrees=finger.digit===1?[44,32,24]:[82,88,50];
          const degrees=THREE.MathUtils.lerp(finger.relaxedFistDegrees[i],runningDegrees[i],hand.runningFist??0);
          const curl=finger.digit===1?(hand.thumbCurl??hand.curl):hand.curl;
          bones[name].quaternion.setFromAxisAngle(new THREE.Vector3(...finger.curlAxis),degrees*Math.PI/180*curl);
        });
        const f=hands.fingerSolver,r=f.closedRadius+(f.openRadius-f.closedRadius)*arm.grip;
        const dx=r-f.baseRadial,dz=f.contactAxial-f.baseAxial;
        const q2=-Math.acos(THREE.MathUtils.clamp((dx*dx+dz*dz-f.proxLength*f.proxLength-f.distLength*f.distLength)/(2*f.proxLength*f.distLength),-1,1));
        const q1=Math.atan2(dx,dz)-Math.atan2(f.distLength*Math.sin(q2),f.proxLength+f.distLength*Math.cos(q2));
        for(const finger of hands.mechanical[side].fingers){
          const axis=new THREE.Vector3(...finger.rotationAxis);
          bones[finger.bones[0]].quaternion.setFromAxisAngle(axis,q1-finger.proxRestAngle);
          bones[finger.bones[1]].quaternion.setFromAxisAngle(axis,q2-finger.distRestAngle);
        }
      }else{
        // Compatibility for archived M3, whose two-jaw meshes are retained there.
        const travel=-.008+.026*arm.grip;
        for(const [label,sign] of [['minus',-1],['plus',1]] as const){
          const name='jaw_'+label+'_'+side;bones[name].position.copy(rest[name]);bones[name].position.x+=sign*travel;
        }
      }
    }
    if(updateWorld)scene.updateMatrixWorld(true);
  };
  return {bones,rest,apply};
}
