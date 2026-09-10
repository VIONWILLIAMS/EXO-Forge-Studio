/** Actual displayed meshes. Local geometric checks, no physical validation. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshBVH} from 'three-mesh-bvh';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'output/v04/m8');
fs.mkdirSync(OUT,{recursive:true});
const hz=Number(process.argv.find(a=>a.startsWith('--hz='))?.split('=')[1]??100);
const server=await createServer({root:ROOT,configFile:false,cacheDir:path.join(OUT,'.audit-cache'),logLevel:'error',server:{middlewareMode:true,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
const load=async file=>{const b=fs.readFileSync(path.join(ROOT,file)),loader=new GLTFLoader();loader.register(()=>({name:'GeometryOnly',loadTexture:()=>Promise.resolve(null)}));const s=(await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;s.updateMatrixWorld(true);return s;};
try {
  const [{sampleCarry},{sampleMotion},{createMotionRig}]=await Promise.all([server.ssrLoadModule('/src/domain/atlasScenario.ts'),server.ssrLoadModule('/src/domain/atlasMotion.ts'),server.ssrLoadModule('/src/domain/atlasMotionRig.ts')]);
  const scene=await load('public/assets/v04/motion-m6/atlas-motion.glb'),crate=await load('public/assets/v04/environment-m6/crate.glb'),rig=createMotionRig(scene);
  const roof=[],grid=new Map(),positions=[],v=new T.Vector3(),step=.02;
  crate.traverse(m=>{if(!m.isMesh)return;const g=m.geometry,p=g.attributes.position,idx=g.index;
    for(let i=0;i<(idx?.count??p.count);i+=3){const vs=[0,1,2].map(j=>v.fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(m.matrixWorld).toArray());positions.push(...vs.flat());const [a,b,c]=vs;
      if(Math.max(a[1],b[1],c[1])<.18)continue;const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-12)continue;
      const k=roof.push({a,b,c,den,mesh:m.name})-1;
      for(let x=Math.floor(Math.min(a[0],b[0],c[0])/step);x<=Math.floor(Math.max(a[0],b[0],c[0])/step);x++)for(let z=Math.floor(Math.min(a[2],b[2],c[2])/step);z<=Math.floor(Math.max(a[2],b[2],c[2])/step);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(k);}
    }
  });
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeBoundingBox();const bvh=new MeshBVH(geometry,{indirect:true}),bounds=geometry.boundingBox;
  const roofAt=(x,z)=>{let max=-Infinity;for(const i of grid.get(Math.floor(x/step)+','+Math.floor(z/step))??[]){const {a,b,c,den}=roof[i],u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,w=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;if(u>=-1e-8&&w>=-1e-8&&u+w<=1+1e-8)max=Math.max(max,u*a[1]+w*b[1]+(1-u-w)*c[1]);}return max;};
  const samples=[];
  scene.traverse(m=>{if(!m.isSkinnedMesh)return;const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight,handIds=new Set(m.skeleton.bones.map((b,i)=>/^human(hand|finger)_/.test(b.name)?i:-1).filter(i=>i>=0)),indices=[];
    for(let i=0;i<ids.count;i++){let sum=0;for(let j=0;j<4;j++)if(handIds.has(ids.array[i*4+j]))sum+=w.array[i*4+j];if(sum>.03)indices.push(i);}if(indices.length)samples.push({mesh:m,indices});});
  const result={hz,frames:14*hz+1,vertices:samples.reduce((s,m)=>s+m.indices.length,0),crateTriangles:positions.length/9,minRoofClearance:Infinity,roofPenetrationFrames:0,insideCrateVertices:0,maxInsideDepth:0,worstRoof:null,worstInside:null,contactClearance:[],finishedArm:{},singleLeg:{}};
  const ray=new T.Ray(new T.Vector3(),new T.Vector3(1,.000731,.000413).normalize()),local=new T.Vector3();
  for(let i=0;i<=14*hz;i++){
    const time=i/hz,f=sampleCarry(time);scene.position.set(...f.root);rig.apply(f.pose);for(const {mesh} of samples)mesh.skeleton.update();let hits=0,min=Infinity;
    for(const {mesh,indices} of samples)for(const j of indices){mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld);local.copy(v).sub(new T.Vector3(...f.box));const top=roofAt(local.x,local.z);if(Number.isFinite(top)){const gap=local.y-top;min=Math.min(min,gap);if(gap<result.minRoofClearance){result.minRoofClearance=gap;result.worstRoof={time,mesh:mesh.name,vertex:j,local:local.toArray(),gap};}if(gap<-.00001)hits++;}
      if(bounds.containsPoint(local)){ray.origin.copy(local);const winding=bvh.raycast(ray,T.DoubleSide).reduce((n,h)=>n+Math.sign(h.face.normal.dot(ray.direction)),0);if(winding!==0){const closest=bvh.closestPointToPoint(local);if(closest.distance>.00001){result.insideCrateVertices++;if(closest.distance>result.maxInsideDepth){result.maxInsideDepth=closest.distance;result.worstInside={time,mesh:mesh.name,vertex:j,local:local.toArray(),depth:closest.distance};}}}}
    }
    if(hits)result.roofPenetrationFrames++;if(i%hz===0){result.contactClearance.push({time,min});console.log('carry',time,'clearance mm',min*1000);}
  }
  scene.position.set(0,0,0);const point=name=>rig.bones[name].getWorldPosition(new T.Vector3());rig.apply(sampleCarry(14).pose);
  for(const side of ['L','R']){const forearm=point('humanhand_'+side).sub(point('forearm_'+side));result.finishedArm[side]={direction:forearm.clone().normalize().toArray(),downAngleDegrees:forearm.angleTo(new T.Vector3(0,-1,0))*180/Math.PI};}
  let reach=0,footError=0,minFeet=Infinity;
  for(let i=0;i<=600;i++){const p=sampleMotion('singleLeg',i/100);rig.apply(p);for(const side of ['L','R']){const l=p[side==='L'?'left':'right'];reach=Math.max(reach,l.reachError);footError=Math.max(footError,point('foot_'+side).distanceTo(new T.Vector3(l.targetX??(side==='L'?-.095:.095),...l.target)));}
    minFeet=Math.min(minFeet,point('foot_L').distanceTo(point('foot_R')));
    if(i===300)result.singleLeg.midpoint=Object.fromEntries(['thigh_L','shin_L','foot_L','thigh_R','shin_R','foot_R'].map(n=>[n,point(n).toArray()]));
  }
  Object.assign(result.singleLeg,{maxReachError:reach,maxFootTargetError:footError,minAnkleDistance:minFeet});
  result.sources=Object.fromEntries(['src/domain/atlasMotion.ts','src/domain/atlasScenario.ts','src/domain/humanCarryContact.ts','src/domain/atlasMotionRig.ts','public/assets/v04/motion-m6/atlas-motion.glb','public/assets/v04/environment-m6/crate.glb'].map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')]));
  fs.writeFileSync(path.join(OUT,'geometry-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await server.close();}
