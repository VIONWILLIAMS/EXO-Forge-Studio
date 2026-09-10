import { useLocale } from '../i18n';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { advanceMotion, blendMotion, sampleMotion, type MotionPose } from '../domain/atlasMotion';
import { createMotionRig } from '../domain/atlasMotionRig';
import { useAtlasMotion } from '../state/atlasMotionStore';
import { displayTexture } from './HmiScreens';
import type { AtlasSceneProps } from './AtlasScene';
import { sampleScenario, sequenceDuration, type ScenarioFrame } from '../domain/atlasScenario';
import { AtlasScenarioEnvironment } from './AtlasScenarioEnvironment';

declare global { interface Window { __ATLAS_MOTION_DEBUG__?: { snapshot:()=>Record<string,unknown> }; } }

export function AtlasMotionAssembly(props:AtlasSceneProps) {
  const locale = useLocale();
  const gl=useThree(s=>s.gl);
  const performanceFrames=useRef<number[]>([]);
  const resumed=useRef(true);
  const wasPlaying=useRef(false);
  useEffect(()=>{const visible=()=>{resumed.current=true;};document.addEventListener('visibilitychange',visible);return()=>document.removeEventListener('visibilitychange',visible);},[]);
  const sequence=useAtlasMotion(s=>s.sequence);
  const loaded=useGLTF('/assets/v04/motion-m6/atlas-motion.glb?revision=m6.2');
  const scene=useMemo(()=>{
    const copy=clone(loaded.scene);
    copy.traverse(n=>{
      if(!(n instanceof THREE.Mesh))return;
      n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();
      n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;
    });
    return copy;
  },[loaded.scene]);
  const rig=useMemo(()=>createMotionRig(scene),[scene]);
  const bones=rig.bones;
  const root=useRef<THREE.Group>(null);
  const clock=useRef({time:0,revision:-1,ui:0,route:0,clip:null as string|null,manual:false,transition:0,from:sampleMotion('idle',0) as MotionPose|null,pose:sampleMotion('idle',0)});
  const scenarioFrame=useRef<ScenarioFrame|null>(null);
  const shells=useMemo(()=>{const list:THREE.MeshStandardMaterial[]=[];scene.traverse(n=>{if(n instanceof THREE.Mesh&&n.userData.layer==='shell')for(const m of Array.isArray(n.material)?n.material:[n.material])if(m instanceof THREE.MeshStandardMaterial)list.push(m);});return list;},[scene]);
  const snapshot=useRef<Record<string,unknown>>({ready:false});
  useEffect(()=>{
    props.onReady((()=>{let n=0;scene.traverse(o=>{if(o instanceof THREE.Mesh)n++;});return n;})());
    useAtlasMotion.getState().setReady(true);
    window.__ATLAS_MOTION_DEBUG__=Object.freeze({snapshot:()=>structuredClone(snapshot.current)});
    return ()=>{useAtlasMotion.getState().setReady(false);delete window.__ATLAS_MOTION_DEBUG__;};
  },[scene,props.onReady]);
  useEffect(()=>{
    const textures:THREE.Texture[]=[];
    scene.traverse(n=>{
      if(!(n instanceof THREE.Mesh))return;
      const mod=String(n.userData.module||n.name.split('__')[0]);
      const layer=String(n.userData.layer||'');
      const human=mod==='HUMAN';
      const complete=sequence==='intro';
      n.visible=complete||(human?props.layers.human&&!props.isolated:!props.humanOnly&&!props.hidden.includes(mod)&&(!props.isolated||props.isolated===mod));
      if(!complete){
        if(layer==='shell'&&!props.layers.shell)n.visible=false;
        if((layer==='utilities'||mod==='P04')&&!props.layers.utilities)n.visible=false;
        if(layer==='hardware'&&!props.layers.hardware)n.visible=false;
        if((layer==='electronics'||layer==='screenSurface')&&!props.layers.electronics)n.visible=false;
      }
      if(layer==='screenInk'||(layer==='statusLight'&&!props.screenPower))n.visible=false;
      const materials=Array.isArray(n.material)?n.material:[n.material];
      materials.forEach(m=>{
        if(!(m instanceof THREE.MeshStandardMaterial))return;
        m.transparent=!complete&&human&&props.layers.xray;m.opacity=m.transparent?.18:1;m.depthWrite=!m.transparent;
        if(layer==='screenSurface'){
          const texture=displayTexture(n.userData.motionBinding==='pelvis'?'WRIST':'CHEST',props.hmiMode,props.screenPower);
          textures.push(texture);m.map=texture;m.emissiveMap=texture;m.emissive.set('#ffffff');m.emissiveIntensity=1;m.color.set('#ffffff');m.toneMapped=false;m.needsUpdate=true;
        } else if(layer!=='statusLight'){
          m.emissive.set(mod===props.selected?'#597070':'#000000');m.emissiveIntensity=mod===props.selected?.14:0;
        }
      });
    });
    return ()=>textures.forEach(t=>t.dispose());
  },[scene,props.layers,props.hidden,props.isolated,props.humanOnly,props.selected,props.screenPower,props.hmiMode,sequence,locale]);
  useFrame((_,delta)=>{
    const state=useAtlasMotion.getState(),c=clock.current;
    if(document.hidden)return;
    if(resumed.current||(!wasPlaying.current&&state.playing)){delta=0;resumed.current=false;}
    wasPlaying.current=state.playing;
    if(delta>0&&state.playing){performanceFrames.current.push(delta*1000);if(performanceFrames.current.length>120)performanceFrames.current.shift();}
    const key=state.sequence==='basic'?state.clip:state.sequence;
    if(c.clip!==key||(c.manual&&!state.manual&&state.playing)){
      c.from=state.sequence==='basic'&&['idle','walk','run','squat','singleLeg','reach','wave','dexterity','grasp'].includes(c.clip||'')?c.pose:null;c.transition=0;c.clip=key;
    }else if(c.revision!==state.revision){c.from=null;}
    c.manual=state.manual;
    if(c.revision!==state.revision){c.time=state.time;c.revision=state.revision;c.ui=.1;if(state.time===0)c.route=0;}
    let finished=false;
    if(state.playing){const next=advanceMotion(c.time,delta,state.speed,sequenceDuration(state),state.loop);c.time=next.time;finished=next.finished;}
    const frame=state.sequence==='basic'?null:sampleScenario(state.sequence,c.time);scenarioFrame.current=frame;
    if(props.modelRef.current)props.modelRef.current.userData.scenarioFrame=frame;
    let pose=frame?.pose??sampleMotion(state.clip,c.time);
    if(state.manual){pose={...c.pose,robotL:state.armL,robotR:state.armR};c.from=null;}
    else if(c.from){
      if(state.playing)c.transition+=Math.min(delta,.1);
      pose=blendMotion(c.from,pose,c.transition/.45);
      if(c.transition>=.45)c.from=null;
    }
    c.pose=pose;rig.apply(pose,false);
    for(const m of shells){const opacity=frame?.shellOpacity??1;m.opacity=opacity;m.transparent=opacity<1;m.depthWrite=opacity===1;}
    if(root.current){
      if(frame){root.current.position.set(...frame.root);root.current.rotation.y=0;}
      else if(state.travel==='orbit'&&pose.travelSpeed>0){
        if(state.playing)c.route+=Math.min(delta,.1)*state.speed*pose.travelSpeed/1.25;
        const angle=c.route-Math.PI/2;
        root.current.position.set(1.25*Math.sin(angle),0,1.25*Math.cos(angle));root.current.rotation.y=angle+Math.PI/2;
      }else{root.current.position.set(0,0,0);root.current.rotation.y=0;}
      root.current.updateMatrixWorld(true);
    }

    c.ui+=delta;
    if(c.ui>=.10||finished||!state.playing){
      c.ui=0;state.tick(c.time,finished,pose);
      const points:Record<string,number[]>={};
      for(const name of Object.keys(bones))
        points[name]=new THREE.Vector3().setFromMatrixPosition(bones[name].matrixWorld).toArray();
      snapshot.current={ready:true,clip:state.clip,sequence:state.sequence,time:c.time,duration:sequenceDuration(state),playing:finished?false:state.playing,speed:state.speed,travel:state.travel,manual:state.manual,transitioning:!!c.from,pose,points,scenario:frame,boneCount:Object.keys(bones).length,performance:{frameMs:performanceFrames.current.slice(),calls:gl.info.render.calls,triangles:gl.info.render.triangles,dpr:gl.getPixelRatio()}};
    }
  },-1);
  const select=(e:ThreeEvent<MouseEvent>)=>{
    const mod=String(e.object.userData.module||e.object.name.split('__')[0]);
    if(/^[HFLAP][0-9]{2}$/.test(mod)){e.stopPropagation();props.onSelect(mod);}
  };
  return <group ref={props.modelRef} onClick={select}><group ref={root}><primitive object={scene}/></group><AtlasScenarioEnvironment frame={scenarioFrame}/></group>;
}
