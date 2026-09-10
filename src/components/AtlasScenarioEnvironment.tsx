import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import { Group, Mesh } from 'three';
import type { ScenarioFrame } from '../domain/atlasScenario';

const urls=['stairs-open-view','apple-tree','crate','basket','apple'].map(n=>`/assets/v04/environment-m6/${n}.glb`);
export function AtlasScenarioEnvironment({frame}:{frame:MutableRefObject<ScenarioFrame|null>}){
  const loaded=useGLTF(urls);
  const assets=useMemo(()=>loaded.map(g=>{const scene=g.scene.clone(true);scene.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return scene;}),[loaded]);
  const carry=useRef<Group>(null),harvest=useRef<Group>(null),crate=useRef<Group>(null),basket=useRef<Group>(null),fruit=useRef<Group>(null);
  useFrame(()=>{
    const f=frame.current;
    if(carry.current)carry.current.visible=f?.environment==='carry';
    if(harvest.current)harvest.current.visible=f?.environment==='harvest';
    for(const [ref,position] of [[crate,f?.box],[basket,f?.basket],[fruit,f?.fruit]] as const){if(ref.current){ref.current.visible=!!position;if(position)ref.current.position.set(...position);}}
    if(basket.current)basket.current.rotation.y=f?.basketYaw??0;
  },-.5);
  return <group>
    <group ref={carry} visible={false}><primitive object={assets[0]}/></group>
    <group ref={harvest} visible={false} position={[-.95,0,1.1]} scale={[-1,1,1]}><primitive object={assets[1]}/></group>
    <group ref={crate} visible={false}><primitive object={assets[2]}/></group>
    <group ref={basket} visible={false}><primitive object={assets[3]}/></group>
    <group ref={fruit} visible={false}><primitive object={assets[4]}/></group>
  </group>;
}
