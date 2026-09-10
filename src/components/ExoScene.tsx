import { tr, useLocale } from '../i18n';
import { ContactShadows, Grid, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera, RoundedBox, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { MutableRefObject, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useExoStore } from '../lib/store'
import type { CameraView, ExoDesignConfig } from '../lib/types'

const V = (value: [number, number, number]) => new THREE.Vector3(...value)
const CLIP_PLANE = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.015)

function useModuleVisible(id: string) {
  const hidden = useExoStore((s) => s.hiddenModules)
  const isolated = useExoStore((s) => s.isolatedModule)
  return !hidden.includes(id) && (!isolated || isolated === id)
}

type PartProps = {
  id: string; name: string; position: [number, number, number]; scale: [number, number, number]; color?: string; rotation?: [number, number, number]; rounded?: boolean; opacity?: number; clip?: boolean
}

function Part({ id, name, position, scale, color = '#899397', rotation = [0, 0, 0], rounded = true, opacity = 1, clip = true }: PartProps) {

  const selected = useExoStore((s) => s.selectedModule)
  const setSelected = useExoStore((s) => s.setSelected)
  const section = useExoStore((s) => s.sectionEnabled)
  const visible = useModuleVisible(id)
  const active = selected === id
  if (!visible) return null
  const children = <><meshStandardMaterial color={active ? '#54d9e8' : color} metalness={color === '#20272a' ? 0.42 : 0.73} roughness={0.26} transparent={opacity < 1} opacity={opacity} depthWrite={opacity > 0.5} clippingPlanes={section && clip ? [CLIP_PLANE] : []} />{active && <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(...scale)]} /><lineBasicMaterial color="#d2fbff" transparent opacity={0.9} /></lineSegments>}</>
  const click = (event: { stopPropagation: () => void }) => { event.stopPropagation(); setSelected(id) }
  if (rounded) return <RoundedBox name={`${id}_${name}`} position={position} rotation={rotation} castShadow receiveShadow args={scale} radius={Math.min(...scale) * 0.12} smoothness={3} onClick={click}>{children}</RoundedBox>
  return <mesh name={`${id}_${name}`} position={position} rotation={rotation} castShadow receiveShadow onClick={click}><boxGeometry args={scale} />{children}</mesh>
}

function Beam({ id, name, start, end, radius = 0.037, color = '#899397', collars = true }: { id: string; name: string; start: [number, number, number]; end: [number, number, number]; radius?: number; color?: string; collars?: boolean }) {

  const a = V(start), b = V(end), delta = b.clone().sub(a), length = delta.length(), mid = a.clone().add(b).multiplyScalar(0.5)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  const selected = useExoStore((s) => s.selectedModule), setSelected = useExoStore((s) => s.setSelected), section = useExoStore((s) => s.sectionEnabled)
  const visible = useModuleVisible(id)
  if (!visible) return null
  return <group name={`${id}_${name}`}>
    <mesh position={mid} quaternion={quaternion} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); setSelected(id) }}>
      <cylinderGeometry args={[radius, radius * 0.92, length, 18]} /><meshStandardMaterial color={selected === id ? '#54d9e8' : color} metalness={0.78} roughness={0.23} clippingPlanes={section ? [CLIP_PLANE] : []} />
    </mesh>
    {collars && [a, b].map((point, index) => <mesh key={index} position={point} quaternion={quaternion} castShadow><cylinderGeometry args={[radius * 1.28, radius * 1.28, radius * 0.72, 18]} /><meshStandardMaterial color="#242b2e" metalness={0.65} roughness={0.28} clippingPlanes={section ? [CLIP_PLANE] : []}/></mesh>)}
  </group>
}

function Joint({ id, name, position, axis = 'z', size = 0.085 }: { id: string; name: string; position: [number, number, number]; axis?: 'x'|'y'|'z'; size?: number }) {

  const selected = useExoStore((s) => s.selectedModule), setSelected = useExoStore((s) => s.setSelected), section = useExoStore((s) => s.sectionEnabled)
  const visible = useModuleVisible(id)
  const rotation: [number, number, number] = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  if (!visible) return null
  return <group name={`${id}_${name}`} position={position} rotation={rotation} onClick={(event) => { event.stopPropagation(); setSelected(id) }}>
    <mesh castShadow><cylinderGeometry args={[size, size, size * 0.92, 28]} /><meshStandardMaterial color={selected === id ? '#54d9e8' : '#ff6a1a'} metalness={0.72} roughness={0.25} clippingPlanes={section ? [CLIP_PLANE] : []}/></mesh>
    <mesh position={[0, size * .54, 0]}><torusGeometry args={[size * .68, size * .09, 8, 24]} /><meshStandardMaterial color="#151a1d" metalness={0.6} roughness={0.25}/></mesh>
    <mesh position={[0, -size * .54, 0]}><torusGeometry args={[size * .68, size * .09, 8, 24]} /><meshStandardMaterial color="#151a1d" metalness={0.6} roughness={0.25}/></mesh>
    <mesh position={[0, size * .49, 0]}><cylinderGeometry args={[size * .17, size * .17, size * .12, 12]} /><meshStandardMaterial color="#d9dde0" metalness={.9} roughness={.16}/></mesh>
  </group>
}

function Cable({ points, color = '#202426', radius = 0.008 }: { points: [number,number,number][]; color?: string; radius?: number }) {

  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(V)), 32, radius, 8, false), [points, radius])
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color={color} roughness={0.58} metalness={0.12}/></mesh>
}

function Human({ hipY, shoulderY }: { hipY: number; shoulderY: number }) {

  const config = useExoStore((s) => s.config)
  const isolated = useExoStore((s) => s.isolatedModule)
  if (!config.visibility.human || (isolated && !isolated.startsWith('H'))) return null
  const scale = config.human.heightMm / 1750, halfShoulder = config.human.shoulderWidthMm / 2000
  const opacity = config.visibility.xrayHuman ? 0.22 : 0.94
  const material = <meshStandardMaterial color="#3a4447" roughness={0.76} transparent opacity={opacity} depthWrite={!config.visibility.xrayHuman} />
  return <group name="HUMAN_DIGITAL_OPERATOR">
    <mesh position={[0, shoulderY + .175 * scale, 0]} castShadow><capsuleGeometry args={[.15 * scale, .3 * scale, 8, 20]} />{material}</mesh>
    <mesh position={[0, shoulderY + .49 * scale, -.005]} castShadow><sphereGeometry args={[.105 * scale, 28, 18]} />{material}</mesh>
    <mesh position={[0, shoulderY + .555 * scale, 0]} castShadow><sphereGeometry args={[.12 * scale, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f2772f" metalness={0.28} roughness={0.38} transparent opacity={opacity}/></mesh>
    <mesh position={[0, hipY + .055, 0]} castShadow><RoundedBox args={[config.human.hipWidthMm/1000, .15, .18]} radius={.035} smoothness={3}/>{material}</mesh>
    {[-1,1].map((side) => <group key={side}>
      <mesh position={[side * config.human.hipWidthMm/2500, (hipY + .08)/2, .015]} castShadow><capsuleGeometry args={[.057*scale, Math.max(.26, hipY-.29), 6, 14]}/>{material}</mesh>
      <mesh position={[side * config.human.hipWidthMm/2500, .17, -.04]} castShadow><capsuleGeometry args={[.052*scale, .22*scale, 6, 14]}/>{material}</mesh>
      <mesh position={[side * halfShoulder, shoulderY - .13, -.02]} rotation={[0,0,side*.12]} castShadow><capsuleGeometry args={[.05*scale,.32*scale,6,14]}/>{material}</mesh>
      <mesh position={[side * (halfShoulder + .025), shoulderY - .37, -.13]} rotation={[.48,0,0]} castShadow><capsuleGeometry args={[.045*scale,.27*scale,6,14]}/>{material}</mesh>
      <mesh position={[side*.13,.045,-.075]} castShadow><RoundedBox args={[.115,.065,.265]} radius={.025} smoothness={3}/><meshStandardMaterial color="#1d2325" roughness={.88}/></mesh>
    </group>)}
    <Part id="H01" name="HARNESS" position={[0, shoulderY+.13, -.115]} scale={[halfShoulder*1.68,.28,.035]} color="#f27a30" opacity={opacity} clip={false}/>
  </group>
}

function Payload({ wrists, config }: { wrists: [THREE.Vector3, THREE.Vector3]; config: ExoDesignConfig }) {
  useLocale();
  if (!config.visibility.payload) return null
  const center = wrists[0].clone().add(wrists[1]).multiplyScalar(.5)
  if (config.preset === 'rescue') return <group position={center}><mesh rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[.07,.1,.72,18]}/><meshStandardMaterial color="#596266" metalness={.75} roughness={.3}/></mesh><mesh position={[.38,0,0]}><boxGeometry args={[.16,.19,.16]}/><meshStandardMaterial color="#ff6a1a"/></mesh></group>
  if (config.preset === 'construction') return <group position={center}><mesh position={[0,.15,0]} castShadow><boxGeometry args={[.32,.4,.14]}/><meshStandardMaterial color="#232a2d" metalness={.65}/></mesh><mesh position={[0,.41,0]}><cylinderGeometry args={[.035,.035,.34,12]}/><meshStandardMaterial color="#ff6a1a"/></mesh></group>
  return <group position={center}><RoundedBox args={[.58,.36,.42]} radius={.035} smoothness={3} castShadow><meshStandardMaterial color="#b9854b" roughness={.67}/></RoundedBox>{[-1,1].map(side=><mesh key={side} position={[side*.19,.19,.01]}><boxGeometry args={[.055,.015,.43]}/><meshStandardMaterial color="#2c3336"/></mesh>)}<Html center position={[0,0,.215]} transform distanceFactor={1.4}><div className="payload-label">{tr("50 KG")}<br/><small>{tr("STATIC LOAD")}</small></div></Html></group>
}

const moduleIdForObject = (source: THREE.Object3D | null) => {
  let object = source
  while (object) {
    const match = object.name.match(/(?:^|_)([HFLAP]\d{2})(?:_|$)/)
    if (match) return match[1]
    object = object.parent
  }
  return null
}

function CadAssembly({ modelRef }: { modelRef: MutableRefObject<THREE.Group | null> }) {

  const gltf = useGLTF('/assets/exo-forge-cad-v02.glb')
  const selected = useExoStore((s) => s.selectedModule)
  const setSelected = useExoStore((s) => s.setSelected)
  const hidden = useExoStore((s) => s.hiddenModules)
  const isolated = useExoStore((s) => s.isolatedModule)
  const section = useExoStore((s) => s.sectionEnabled)
  const measure = useExoStore((s) => s.measureEnabled)
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((item) => item.clone())
      else mesh.material = mesh.material.clone()
    })
    return clone
  }, [gltf.scene])

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const moduleId = moduleIdForObject(mesh)
      mesh.visible = !moduleId || (!hidden.includes(moduleId) && (!isolated || isolated === moduleId))
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((candidate) => {
        const material = candidate as THREE.MeshStandardMaterial
        if (moduleId) {
          const color = moduleId.startsWith('A') || moduleId === 'P03' ? '#ff6418'
            : moduleId.startsWith('F') ? '#879499'
              : moduleId.startsWith('L') ? '#69777c'
                : moduleId.startsWith('H') ? '#3d484c' : '#30383b'
          material.color.set(color)
          material.metalness = moduleId.startsWith('H') ? .28 : .62
          material.roughness = .28
        }
        material.clippingPlanes = section ? [CLIP_PLANE] : []
        if (!material.emissive) return
        material.emissive.set(moduleId === selected ? '#1b727c' : '#000000')
        material.emissiveIntensity = moduleId === selected ? 1.15 : 0
      })
    })
  }, [hidden, isolated, scene, section, selected])

  const selectCadPart = (event: ThreeEvent<MouseEvent>) => {
    const moduleId = moduleIdForObject(event.object)
    if (!moduleId) return
    event.stopPropagation()
    setSelected(moduleId)
  }

  return <group ref={modelRef} name="EXO_FORGE_CAD_V02" position={[0, .025, -.195]} scale={.005} onClick={selectCadPart}>
    <primitive object={scene}/>
    {measure && <group scale={200} position={[0, -5, 39]}><Measurements height={1.75} span={1.2} shoulderY={1.5}/></group>}
  </group>
}

function ExoAssembly({ modelRef }: { modelRef: MutableRefObject<THREE.Group | null> }) {

  const config = useExoStore((s) => s.config), explode = useExoStore((s) => s.explode), measure = useExoStore((s) => s.measureEnabled)
  const isolated = useExoStore((s) => s.isolatedModule), timeline = useExoStore((s) => s.timeline)
  const unit = 1/1000, halfShoulder = config.machine.shoulderFrameMm*unit/2, halfPelvis = config.machine.pelvisRingMm*unit/2
  const legLength = config.machine.legLengthMm*unit, thigh = legLength*.51, shin = legLength*.49
  const motion = Math.sin((timeline / 100) * Math.PI) * 6
  const hip = THREE.MathUtils.degToRad(config.joints.hipPitchDeg + motion * .25), knee = THREE.MathUtils.degToRad(config.joints.kneeDeg + motion)
  const hipY = .075 + Math.cos(hip)*thigh + Math.cos(hip-knee)*shin, shoulderY = hipY + .54*(config.human.heightMm/1750)
  const upper = config.machine.armReachMm*unit*.46, fore = config.machine.armReachMm*unit*.42
  const shoulderAngle = THREE.MathUtils.degToRad(config.joints.shoulderPitchDeg + motion), foreAngle = THREE.MathUtils.degToRad(config.joints.shoulderPitchDeg + config.joints.elbowDeg + motion * .5)
  const legs = [-1,1].map((side) => {
    const hipP = new THREE.Vector3(side*halfPelvis,hipY,0), kneeP = hipP.clone().add(new THREE.Vector3(0,-Math.cos(hip)*thigh,-Math.sin(hip)*thigh)), ankleP = kneeP.clone().add(new THREE.Vector3(0,-Math.cos(hip-knee)*shin,-Math.sin(hip-knee)*shin))
    return {side, hipP, kneeP, ankleP}
  })
  const arms = [-1,1].map((side) => {
    const sx = side*(halfShoulder+explode*.28), shoulderP=new THREE.Vector3(sx,shoulderY,.02), elbowP=shoulderP.clone().add(new THREE.Vector3(side*.08,-Math.cos(shoulderAngle)*upper,-Math.sin(shoulderAngle)*upper)), wristP=elbowP.clone().add(new THREE.Vector3(side*.015,-Math.cos(foreAngle)*fore,-Math.sin(foreAngle)*fore))
    return {side, shoulderP, elbowP, wristP}
  })
  if (!config.visibility.mechanism) return <Human hipY={hipY} shoulderY={shoulderY}/>
  return <group ref={modelRef} name="EXO_FORGE_ASSEMBLY">
    <Human hipY={hipY} shoulderY={shoulderY}/>
    <group position={[0,0,explode*.28]}>
      <Part id="F01" name="SHOULDER_FRAME" position={[0,shoulderY,.055]} scale={[halfShoulder*2,.075,.115]} />
      <Part id="F02" name="SPINE_RAIL" position={[0,(shoulderY+hipY)/2,.135]} scale={[.105,shoulderY-hipY,.09]} color="#20272a" />
      <Part id="F02" name="SPINE_SLIDER" position={[0,shoulderY-.17,.145]} scale={[.14,.17,.105]} color="#596367" />
      <Part id="F03" name="PELVIS_RING" position={[0,hipY,.05]} scale={[halfPelvis*2,.105,.17]} color="#737d81" />
      <Part id="P01" name="POWER_PACK" position={[0,shoulderY-.23,.255+explode*.18]} scale={[.31,.39,.14]} color="#20272a" />
      <Part id="P02" name="CONTROL_CORE" position={[0,shoulderY-.08,.342+explode*.18]} scale={[.19,.12,.045]} color="#ff6a1a" />
      {[0,1,2].map(i=><mesh key={i} position={[-.075+i*.075,shoulderY-.29,.328+explode*.18]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.024,.024,.016,20]}/><meshStandardMaterial color="#111719" metalness={.5}/></mesh>)}
    </group>
    {legs.map(({side,hipP,kneeP,ankleP}) => { const tag=side<0?'L':'R', dx=side*explode*.2; const shift=new THREE.Vector3(dx,0,0); const hp=hipP.clone().add(shift),kp=kneeP.clone().add(shift),ap=ankleP.clone().add(shift); return <group key={tag}>
      <Joint id="L01" name={`HIP_${tag}`} position={hp.toArray()} axis="z"/><Beam id="L02" name={`THIGH_${tag}`} start={hp.toArray()} end={kp.toArray()} radius={.043}/><Joint id="L03" name={`KNEE_${tag}`} position={kp.toArray()} axis="z" size={.074}/><Beam id="L04" name={`SHIN_${tag}`} start={kp.toArray()} end={ap.toArray()} radius={.038}/><Joint id="L05" name={`ANKLE_${tag}`} position={ap.toArray()} axis="z" size={.058}/>
      <Part id="L06" name={`FOOT_${tag}`} position={[ap.x,.04,ap.z-.075]} scale={[config.machine.footWidthMm*unit,.06,config.machine.footLengthMm*unit]} color="#202426"/>
      <Part id="H02" name={`THIGH_STRAP_${tag}`} position={hp.clone().lerp(kp,.45).toArray()} scale={[.13,.055,.16]} color="#ed742d" opacity={.86}/>
    </group>})}
    {arms.map(({side,shoulderP,elbowP,wristP}) => { const tag=side<0?'L':'R'; return <group key={tag}>
      <Joint id="A01" name={`SHOULDER_3AXIS_${tag}`} position={shoulderP.toArray()} axis="z" size={.105}/><Beam id="A02" name={`UPPER_ARM_${tag}`} start={shoulderP.toArray()} end={elbowP.toArray()} radius={.049}/><Joint id="A03" name={`ELBOW_2AXIS_${tag}`} position={elbowP.toArray()} axis="z" size={.086}/><Beam id="A04" name={`FOREARM_${tag}`} start={elbowP.toArray()} end={wristP.toArray()} radius={.044}/><Joint id="A04" name={`WRIST_${tag}`} position={wristP.toArray()} axis="x" size={.06}/>
      <Part id="A04" name={`GRIPPER_${tag}`} position={[wristP.x,wristP.y,wristP.z-.075]} scale={[.105,.095,.19]} color="#20272a"/>
      <Beam id="H03" name={`MASTER_ARM_${tag}`} start={[side*(config.human.shoulderWidthMm/2000),shoulderY-.08,-.09]} end={[side*.22,shoulderY-.32,-.23]} radius={.017} color="#ff6a1a" collars={false}/>
    </group>})}
    {[-1,1].map(side=>{const tag=side<0?'L':'R', start:[number,number,number]=[side*halfPelvis*.8,hipY-.04,.12], end:[number,number,number]=[side*config.machine.outriggerSpanMm*unit/2,.035,.15];return <group key={tag}><Beam id="P03" name={`OUTRIGGER_${tag}`} start={start} end={end} radius={.032} color="#ff6a1a"/><Part id="P03" name={`GROUND_PAD_${tag}`} position={end} scale={[.19,.045,.25]} color="#202426"/></group>})}
    {config.visibility.utilities && <group name="P04_UTILITIES"><Cable points={[[-.13,shoulderY-.12,.31],[-.32,shoulderY-.12,.18],[arms[0].elbowP.x,arms[0].elbowP.y,arms[0].elbowP.z+.06]]} color="#ed742d"/><Cable points={[[.13,shoulderY-.12,.31],[.32,shoulderY-.12,.18],[arms[1].elbowP.x,arms[1].elbowP.y,arms[1].elbowP.z+.06]]} color="#15191b"/><Cable points={[[-.08,shoulderY-.28,.31],[-.16,hipY+.1,.16],[legs[0].kneeP.x,legs[0].kneeP.y,legs[0].kneeP.z+.06]]} radius={.006}/><Cable points={[[.08,shoulderY-.28,.31],[.16,hipY+.1,.16],[legs[1].kneeP.x,legs[1].kneeP.y,legs[1].kneeP.z+.06]]} radius={.006}/></group>}
    {!isolated && <Payload wrists={[arms[0].wristP,arms[1].wristP]} config={config}/>}
    {measure && <Measurements height={config.human.heightMm/1000} span={config.machine.outriggerSpanMm/1000} shoulderY={shoulderY}/>}
  </group>
}

function Measurements({height,span,shoulderY}:{height:number;span:number;shoulderY:number}) {
  useLocale(); return <group name="MEASUREMENTS"><Line points={[[-.72,0,.22],[-.72,height,.22]]} color="#54d9e8" lineWidth={1}/><Html position={[-.72,height/2,.22]} center><div className="measure-label">↕ {tr((height*1000).toFixed(0))}{tr(" mm")}</div></Html><Line points={[[-span/2,.02,.35],[span/2,.02,.35]]} color="#ff8a46" lineWidth={1}/><Html position={[0,.02,.35]} center><div className="measure-label orange">↔ {tr((span*1000).toFixed(0))}{tr(" mm")}</div></Html><Html position={[0,shoulderY+.1,.3]} center><div className="measure-label subtle">{tr("肩框基准")}</div></Html></group> }

function DesignBay() {
   return <group name="PRECISION_DESIGN_BAY"><Grid position={[0,-.005,0]} args={[12,12]} cellSize={.1} sectionSize={1} cellColor="#273033" sectionColor="#49565a" fadeDistance={7} infiniteGrid/><mesh position={[0,-.035,0]} receiveShadow><boxGeometry args={[8,.06,8]}/><meshStandardMaterial color="#121719" roughness={.76}/></mesh>{[-1,1].map(side=><group key={side}><mesh position={[side*2.45,1.25,-1.3]}><boxGeometry args={[.08,2.5,.08]}/><meshStandardMaterial color="#2b3336" metalness={.65}/></mesh><mesh position={[side*2.45,.035,-1.3]}><boxGeometry args={[.48,.03,.2]}/><meshStandardMaterial color="#f06b25"/></mesh></group>)}</group> }

function CameraRig({view}:{view:CameraView}) {
   const {camera}=useThree(); useEffect(()=>{const positions:Record<CameraView,[number,number,number]>={iso:[2.6,1.72,2.9],front:[0,1.0,3.5],side:[3.5,1.0,0],top:[0,4.5,.001]};camera.position.set(...positions[view]);camera.up.set(0,1,0);camera.lookAt(0,.9,0);camera.updateProjectionMatrix()},[camera,view]); return null }
function FpsProbe({onFps}:{onFps?:(fps:number)=>void}) {
   const samples=useRef<number[]>([]),last=useRef(performance.now()),reported=useRef(performance.now()); useFrame(()=>{const now=performance.now(),delta=now-last.current;last.current=now;samples.current.push(delta);if(samples.current.length>30)samples.current.shift();if(samples.current.length===30&&onFps&&now-reported.current>600){reported.current=now;onFps(Math.round(1000/(samples.current.reduce((a,b)=>a+b,0)/samples.current.length)))}});return null }

export function ExoScene({ modelRef, mode, onFps }: { modelRef: MutableRefObject<THREE.Group | null>; mode: 'cad' | 'concept'; onFps?: (fps: number) => void }) {

  const view=useExoStore(s=>s.cameraView),projection=useExoStore(s=>s.projection),setSelected=useExoStore(s=>s.setSelected)
  return <Canvas shadows="basic" dpr={[1,1.65]} gl={{antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.localClippingEnabled=true;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.08}} onPointerMissed={()=>setSelected('F01')}>
    <color attach="background" args={['#101416']}/><fog attach="fog" args={['#101416',4.5,9]}/>
    <PerspectiveCamera makeDefault={projection==='perspective'} position={[2.6,1.72,2.9]} fov={35}/><OrthographicCamera makeDefault={projection==='orthographic'} position={[2.6,1.72,2.9]} zoom={320}/><CameraRig view={view}/>
    <ambientLight intensity={.58}/><directionalLight position={[3.5,5,3]} intensity={3.4} castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.0002}/><pointLight position={[-3,2.7,1]} color="#5ec9d9" intensity={18} distance={7}/><spotLight position={[0,4,-2]} target-position={[0,1,0]} color="#ffffff" intensity={13} angle={.7} penumbra={.8}/>
    <DesignBay/>{mode === 'cad' ? <CadAssembly modelRef={modelRef}/> : <ExoAssembly modelRef={modelRef}/>}<ContactShadows position={[0,.002,0]} opacity={.55} scale={4.5} blur={2.2}/><OrbitControls makeDefault target={[0,.9,0]} minDistance={1.3} maxDistance={6.5} enableDamping dampingFactor={.08}/><FpsProbe onFps={onFps}/>
  </Canvas>
}

useGLTF.preload('/assets/exo-forge-cad-v02.glb')
