import { create } from 'zustand';
import { clamp, neutralRobotArm, withArmJoint, type ArmJoint, type RobotArmPose, type MotionPose, type MotionClipId, type MotionTravel } from '../domain/atlasMotion';
import { sequenceDuration, type SequenceId } from '../domain/atlasScenario';
export type ArmTarget='both'|'L'|'R';
type MotionState = {
  sequence:SequenceId;autoCamera:boolean;chooseSequence:(v:Exclude<SequenceId,'basic'>)=>void;setAutoCamera:(v:boolean)=>void;
  enabled:boolean;clip:MotionClipId;playing:boolean;speed:number;loop:boolean;time:number;revision:number;travel:MotionTravel;ready:boolean;
  manual:boolean;armTarget:ArmTarget;armL:RobotArmPose;armR:RobotArmPose;liveL:RobotArmPose;liveR:RobotArmPose;
  setEnabled:(v:boolean)=>void;choose:(v:MotionClipId)=>void;setPlaying:(v:boolean)=>void;setSpeed:(v:number)=>void;
  seek:(v:number)=>void;reset:()=>void;setLoop:(v:boolean)=>void;setTravel:(v:MotionTravel)=>void;
  tick:(time:number,finished?:boolean,pose?:MotionPose)=>void;setReady:(v:boolean)=>void;
  setArmTarget:(v:ArmTarget)=>void;setArmJoint:(k:ArmJoint,v:number)=>void;
};
export const useAtlasMotion=create<MotionState>(set=>({
  sequence:'basic',autoCamera:true,
  chooseSequence:sequence=>set(s=>({sequence,enabled:true,time:0,playing:true,manual:false,speed:1,loop:false,autoCamera:true,travel:'inPlace',revision:s.revision+1})),
  setAutoCamera:autoCamera=>set({autoCamera}),
  enabled:false,clip:'walk',playing:false,speed:1,loop:true,time:0,revision:0,travel:'inPlace',ready:false,
  manual:false,armTarget:'both',armL:neutralRobotArm(),armR:neutralRobotArm(),liveL:neutralRobotArm(),liveR:neutralRobotArm(),
  setEnabled:enabled=>set(s=>({enabled,playing:enabled,manual:false,revision:s.revision+1,time:0})),
  choose:clip=>set(s=>({clip,sequence:'basic',time:0,playing:true,manual:false,...(s.sequence!=='basic'?{loop:true}:{}),revision:s.revision+1})),
  // Pause preserves the high-frequency render clock instead of seeking to a stale UI value.
  setPlaying:playing=>set(s=>({playing,manual:playing?false:s.manual,...(playing&&s.time>=sequenceDuration(s)?{time:0,revision:s.revision+1}:{})})),
  setSpeed:speed=>set({speed:clamp(speed,.25,1.5)}),
  seek:time=>set(s=>({time:clamp(time,0,sequenceDuration(s)),playing:false,manual:false,revision:s.revision+1})),
  reset:()=>set(s=>({time:0,playing:false,manual:false,revision:s.revision+1})),
  setLoop:loop=>set({loop}),
  // Path changes must not rewind the render clock to the UI sample.
  setTravel:travel=>set({travel}),
  tick:(time,finished=false,pose)=>set(s=>({time,playing:finished?false:s.playing,...(pose?{liveL:pose.robotL,liveR:pose.robotR}:{})})),
  setReady:ready=>set({ready}),setArmTarget:armTarget=>set({armTarget}),
  setArmJoint:(key,value)=>set(s=>{
    const a=s.manual?s.armL:s.liveL,b=s.manual?s.armR:s.liveR;
    return {manual:true,playing:false,armL:s.armTarget==='R'?{...a}:withArmJoint(a,key,value),armR:s.armTarget==='L'?{...b}:withArmJoint(b,key,value)};
  }),
}));
