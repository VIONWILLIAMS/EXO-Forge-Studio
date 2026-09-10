import { tr, useLocale } from '../i18n';
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  Line,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useState,
  useMemo,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { HmiScreens, type HmiMode } from "./HmiScreens";
import { StudioOcclusion } from "./StudioOcclusion";
import { AtlasMotionAssembly } from './AtlasMotionAssembly';
import { useAtlasMotion } from '../state/atlasMotionStore';
import type { ScenarioFrame } from '../domain/atlasScenario';

export type AtlasView =
  "hero" | "front" | "rear" | "side" | "foot" | "hmi" | "fit" | "hands";
export type AtlasLayers = {
  human: boolean;
  shell: boolean;
  utilities: boolean;
  hardware: boolean;
  xray: boolean;
  electronics: boolean;
};
export type AtlasSceneProps = {
  selected: string;
  onSelect: (module: string) => void;
  hidden: string[];
  isolated: string | null;
  layers: AtlasLayers;
  explode: number;
  section: boolean;
  measure: boolean;
  view: AtlasView;
  viewRevision: number;
  hmiMode: HmiMode;
  screenPower: boolean;
  studioLight: boolean;
  humanOnly: boolean;
  modelRef: MutableRefObject<THREE.Group | null>;
  onReady: (meshes: number) => void;
};

function Assembly(props: AtlasSceneProps) {
  useLocale();
  const gltf = useGLTF("/assets/v04/motion-m6/static-atlas-m6.glb?revision=m6.1");
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.material = Array.isArray(node.material)
        ? node.material.map((m) => m.clone())
        : node.material.clone();
      node.userData.restPosition = node.position.toArray();
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((m) => {
        const p = m as THREE.MeshStandardMaterial;
        p.userData.originalEmissive = p.emissive?.clone();
        p.userData.originalEmission = p.emissiveIntensity;
      });
      node.castShadow = true;
      node.receiveShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    [],
  );
  const dimensions = useMemo(() => {
    scene.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(scene);
  }, [scene]);
  useEffect(() => {
    let count = 0;
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) count++;
    });
    props.onReady(count);
  }, [scene, props.onReady]);
  useEffect(() => {
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const module = String(node.userData.module || node.name.split("__")[0]);
      const layer = String(node.userData.layer || "");
      const human = module === "HUMAN";
      node.visible = human
        ? props.layers.human && !props.isolated
        : !props.hidden.includes(module) &&
          (!props.isolated || props.isolated === module);
      if (layer === "shell" && !props.layers.shell) node.visible = false;
      if (props.humanOnly && !human) node.visible = false;
      if (layer === "screenSurface" || layer === "screenInk")
        node.visible = false;
      if (layer === "electronics" && !props.layers.electronics)
        node.visible = false;
      if (layer === "statusLight" && !props.screenPower) node.visible = false;
      if (
        (layer === "utilities" || module === "P04") &&
        !props.layers.utilities
      )
        node.visible = false;
      if (layer === "hardware" && !props.layers.hardware) node.visible = false;
      const rest = node.userData.restPosition as number[];
      node.position.set(rest[0], rest[1], rest[2]);
      if (!human && props.explode) {
        const side =
          node.userData.side === "L" ? -1 : node.userData.side === "R" ? 1 : 0;
        node.position.x +=
          props.explode * side * (module.startsWith("A") ? 0.28 : 0.18);
        node.position.z +=
          props.explode *
          (layer === "shell" ? 0.18 : module.startsWith("P") ? -0.22 : 0);
        if (module === "F01") node.position.y += props.explode * 0.12;
      }
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((m) => {
        const material = m as THREE.MeshStandardMaterial;
        material.clippingPlanes = props.section && !human ? [plane] : [];
        material.transparent = human && props.layers.xray;
        material.opacity = human && props.layers.xray ? 0.18 : 1;
        material.depthWrite = !material.transparent;
        if (layer === "statusLight") {
          material.emissive?.copy(
            material.userData.originalEmissive ?? new THREE.Color(),
          );
          material.emissiveIntensity = material.userData.originalEmission ?? 0;
        } else {
          material.emissive?.set(
            module === props.selected ? "#597070" : "#000000",
          );
          material.emissiveIntensity = module === props.selected ? 0.14 : 0;
        }
      });
    });
  }, [
    scene,
    props.layers,
    props.selected,
    props.hidden,
    props.isolated,
    props.explode,
    props.section,
    props.humanOnly,
    props.screenPower,
    plane,
  ]);
  const select = (event: ThreeEvent<MouseEvent>) => {
    const module = String(
      event.object.userData.module || event.object.name.split("__")[0],
    );
    if (module === "HUMAN") return;
    if (/^[HFLAP][0-9]{2}$/.test(module)) {
      event.stopPropagation();
      props.onSelect(module);
    }
  };
  return (
    <group ref={props.modelRef} onClick={select}>
      <primitive object={scene} />
      <HmiScreens
        mode={props.hmiMode}
        power={props.screenPower}
        explode={props.explode}
        section={props.section}
        visible={
          !props.humanOnly &&
          props.layers.electronics &&
          !props.hidden.includes("P02") &&
          (!props.isolated || props.isolated === "P02")
        }
        onSelect={() => props.onSelect("P02")}
      />
      {props.measure && (
        <group>
          <Line
            points={[
              [-0.64, dimensions.min.y, 0],
              [-0.64, dimensions.max.y, 0],
            ]}
            color="#497068"
            lineWidth={1}
          />
          <Line
            points={[
              [-0.66, dimensions.min.y, 0],
              [-0.6, dimensions.min.y, 0],
            ]}
            color="#497068"
          />
          <Line
            points={[
              [-0.66, dimensions.max.y, 0],
              [-0.6, dimensions.max.y, 0],
            ]}
            color="#497068"
          />
          <Html position={[-0.65, 0.94, 0]} center>
            <div className="atlas-dimension">
              {Math.round((dimensions.max.y - dimensions.min.y) * 1000)}{tr("mm")}</div>
          </Html>
          <Line
            points={[
              [-0.172, 0.019, 0.27],
              [0.172, 0.019, 0.27],
            ]}
            color="#497068"
          />
          <Html position={[0, 0.025, 0.3]} center>
            <div className="atlas-dimension">{tr("344 mm · 足部总宽")}</div>
          </Html>
        </group>
      )}
    </group>
  );
}

function CameraRig({ view, revision, modelRef }: { view: AtlasView; revision: number; modelRef: MutableRefObject<THREE.Group|null> }) {

  const { camera, controls, size, invalidate } = useThree();
  const moving=useAtlasMotion(s=>s.enabled);
  const travel=useAtlasMotion(s=>s.travel);
  const sequence=useAtlasMotion(s=>s.sequence);
  const focus=useRef({model:null as THREE.Group|null,meshes:[] as THREE.Mesh[],box:new THREE.Box3(),part:new THREE.Box3(),center:new THREE.Vector3(),size:new THREE.Vector3(),position:new THREE.Vector3()});
  useFrame((_,delta)=>{
    const state=useAtlasMotion.getState(),frame=modelRef.current?.userData.scenarioFrame as ScenarioFrame|undefined;
    if(controls){
      const orbit=controls as unknown as {enabled:boolean;target:THREE.Vector3;update:()=>void};
      orbit.enabled=!(moving&&state.sequence!=='basic'&&state.autoCamera);
      if(!orbit.enabled&&frame){
        const target=new THREE.Vector3(...frame.camera.target),position=new THREE.Vector3(...frame.camera.position);
        const fit=Math.max(1,.95/(size.width/size.height));
        camera.position.copy(position.sub(target).multiplyScalar(fit).add(target));orbit.target.copy(target);camera.lookAt(target);orbit.update();return;
      }
    }
    if(view!=='hands'||!controls||!modelRef.current)return;
    const f=focus.current;
    if(f.model!==modelRef.current){f.model=modelRef.current;f.meshes=[];f.model.traverse(n=>{if(!(n instanceof THREE.Mesh)||n.userData.module!=='A04')return;let owner=n.parent;while(owner&&!/^exowrist_[LR]$/.test(owner.name))owner=owner.parent;if(owner){n.userData.handFocusSide=owner.name.endsWith('_L')?'L':'R';f.meshes.push(n);}});}
    f.box.makeEmpty();
    for(const mesh of f.meshes){if(!mesh.visible||mesh.userData.handFocusSide!==(state.armTarget==='L'?'L':'R'))continue;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();f.part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);f.box.union(f.part);}
    if(f.box.isEmpty())return;
    f.box.expandByScalar(.10);f.box.getCenter(f.center);f.box.getSize(f.size);
    const tan=Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov/2));
    const d=Math.max((f.size.y+.2*f.size.z)/(2*tan),(f.size.x+.35*f.size.z)/(2*tan*(size.width/size.height)),.65)*1.18;
    f.position.set(.3,.12,1).normalize().multiplyScalar(d).add(f.center);
    const alpha=1-Math.exp(-delta*7),orbit=controls as unknown as {target:THREE.Vector3;update:()=>void};
    camera.position.lerp(f.position,alpha);orbit.target.lerp(f.center,alpha);orbit.update();
  });
  useLayoutEffect(() => {
    if (!controls) return;
    const states: Record<AtlasView, [number[], number[]]> = {
      hero: [
        [2.2, 1.55, 4.2],
        [0, 0.9, 0],
      ],
      front: [
        [0, 1.02, 4.2],
        [0, 0.9, 0],
      ],
      rear: [
        [2, 1.6, -4.5],
        [0, 0.92, 0],
      ],
      side: [
        [4.7, 1.25, 0],
        [0, 0.9, 0],
      ],
      foot: [
        [0.72, 0.4, 1.1],
        [0, 0.22, 0.05],
      ],
      hmi: [
        [0.63, 1.49, 1.08],
        [0, 1.34, 0.03],
      ],
      fit: [
        [1.45, 1.05, -2.65],
        [0, 1.0, 0],
      ],
      hands: [[1.25,1.65,2.35],[0,1.2,.30]],
    };
    if(moving&&travel==='orbit')states.hero=[[3.9,2.3,7.2],[0,.92,0]];
    if(moving&&sequence==='carry'){
      states.hero=[[4.6,3.2,5.3],[0,1.25,.72]];
      states.front=[[0,3.35,6.0],[0,1.25,.72]];
      states.rear=[[-3.8,3.0,-4.0],[0,1.25,.72]];
      states.side=[[5.8,2.6,.72],[0,1.25,.72]];
    }
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      enableDamping: boolean;
      update: () => void;
    };
    // Consume residual mouse damping before a deterministic engineering view.
    orbit.enableDamping = false;
    orbit.update();
    const target = new THREE.Vector3().fromArray(states[view][1]);
    const destination = new THREE.Vector3().fromArray(states[view][0]);
    // A narrow viewport needs extra distance to retain the external arms.
    const fit = ["foot", "hmi", "fit"].includes(view)
      ? 1
      : Math.max(1, 0.9 / (size.width / size.height));
    camera.position.copy(
      destination.sub(target).multiplyScalar(fit).add(target),
    );
    (camera as THREE.PerspectiveCamera).zoom = 1;
    camera.updateProjectionMatrix();
    orbit.target.copy(target);
    camera.lookAt(target);
    orbit.update();
    orbit.enableDamping = true;
    invalidate();
  }, [view, revision, camera, controls, size.width, size.height, invalidate,moving,travel,sequence]);
  return null;
}

// Store UI ticks do not request more frames. Paused seeks and manual changes do.
function MotionInvalidation(){

  const invalidate=useThree(s=>s.invalidate);
  useEffect(()=>useAtlasMotion.subscribe((s,p)=>{
    if(s.revision!==p.revision||s.playing!==p.playing||s.manual!==p.manual||s.armL!==p.armL||s.armR!==p.armR||s.armTarget!==p.armTarget||s.autoCamera!==p.autoCamera||s.travel!==p.travel)invalidate();
  }),[invalidate]);
  return null;
}
export function AtlasScene(props: AtlasSceneProps) {
  useLocale();
  const moving=useAtlasMotion(s=>s.enabled);
  const playing=useAtlasMotion(s=>s.playing);
  const [visible,setVisible]=useState(!document.hidden);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener("visibilitychange",change);return()=>document.removeEventListener("visibilitychange",change);},[]);
  return (
    <Canvas
      frameloop={moving&&playing&&visible?"always":"demand"}
      shadows="percentage"
      dpr={moving&&playing?[1,1.5]:[1,2]}
      camera={{ fov: 29, position: [2.2, 1.55, 4.2], near: 0.015, far: 45 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.03;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color
        attach="background"
        args={[props.studioLight ? "#e3e7eb" : "#202d3c"]}
      />
      <fog
        attach="fog"
        args={[props.studioLight ? "#e3e7eb" : "#202d3c", 7, 18]}
      />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.012}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
      />
      <directionalLight position={[-4, 2, 1]} intensity={1.5} color="#d0e5ff" />
      <directionalLight position={[1, 3, -3]} intensity={2.5} color="#b6d5ec" />
      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={3}
          color="white"
          scale={[4, 5, 1]}
          position={[3, 3, 2]}
          rotation={[0, -Math.PI / 3, 0]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          color="white"
          scale={[2, 4, 1]}
          position={[-3, 2, 1]}
          rotation={[0, Math.PI / 3, 0]}
        />
        <Lightformer
          form="rect"
          intensity={4}
          color="white"
          scale={[3, 4, 1]}
          position={[1, 3, -3]}
          rotation={[0, Math.PI, 0]}
        />
      </Environment>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.006, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color={props.studioLight ? "#cbd4da" : "#243447"}
          roughness={0.7}
          metalness={0.15}
        />
      </mesh>
      <Suspense
        fallback={
          <Html center>
            <div className="atlas-loading">{tr("正在载入 ATLAS 工程总装…")}</div>
          </Html>
        }
      >
        {moving?<AtlasMotionAssembly {...props}/>:<Assembly {...props} />}
      </Suspense>
      {!moving&&<ContactShadows
        position={[0, -0.004, 0]}
        opacity={0.3}
        scale={4}
        blur={2.7}
        far={2}
        frames={1}
      />}
      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        minDistance={0.35}
        maxDistance={8}
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI * 0.52}
      />
      <MotionInvalidation/>
      <CameraRig view={props.view} revision={props.viewRevision} modelRef={props.modelRef} />
      {!props.section && !props.layers.xray && !moving && <StudioOcclusion />}
    </Canvas>
  );
}
