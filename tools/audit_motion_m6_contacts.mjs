/** Actual M6 GLB geometry audit, without a browser or rendering.
 * Usage: node /tmp/exo-m6-environment/audit_carry_contacts.mjs [--hz=60] [--end=14]
 * The current checkout TS is loaded through Vite SSR with config disabled. All
 * caches/reports stay under /tmp. Embedded textures are omitted from this
 * geometry-only load, while mesh vertices, hierarchy and articulation are real.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const OUT=path.resolve(SCRIPT_DIR,'../output/v04/m6-contact-audit');
fs.mkdirSync(OUT,{recursive:true});
const ROOT=process.env.EXO_AUDIT_PROJECT??path.resolve(SCRIPT_DIR,'..');
const option=(name,fallback)=>Number(process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=')[1]??fallback);
const hz=option('hz',60),end=option('end',14);
const load=p=>import(pathToFileURL(path.join(ROOT,p)).href);
const THREE=await load('node_modules/three/build/three.module.js');
const {GLTFLoader}=await load('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {MeshBVH}=await load('node_modules/three-mesh-bvh/src/index.js');
const {createServer}=await load('node_modules/vite/dist/node/index.js');
const {Vector3,Box3,BufferGeometry,Float32BufferAttribute,Ray,DoubleSide}=THREE;
const server=await createServer({root:ROOT,configFile:false,cacheDir:path.join(OUT,'.vite-audit-cache'),logLevel:'error',server:{middlewareMode:true,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
const sourcePaths=['src/domain/atlasScenario.ts','src/domain/atlasMotion.ts','src/domain/atlasMotionRig.ts','src/domain/data/atlasHands.json','public/assets/v04/motion-m6/atlas-motion.glb','public/assets/v04/environment-m6/stairs-open-view.glb','public/assets/v04/environment-m6/crate.glb'];
const signatures=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')]));
const jsonFile=path.join(OUT,'carry-contact-audit.json');
const rounded=p=>p.toArray().map(x=>Number(x.toFixed(7)));
const metric=()=>({samples:0,worst:null});
const record=(m,value,detail,kind='min')=>{
  m.samples++;
  if(m.worst===null||(kind==='min'?value<m.worst.value:value>m.worst.value))m.worst={value,...detail};
};
const report={generatedAt:new Date().toISOString(),project:ROOT,hz,start:0,end,signatures,
  scope:'Actual M6 articulated mesh vertices; exact triangle/BVH stair heights; actual crate triangles and exported handle nodes; mean of the three real elastomer pads. Geometry display checks only.',
  limits:['Discrete time samples and mesh vertices, not continuous swept-volume collision detection.','Full-body, arm, rail and self-collision are outside this bounded audit.','Crate interior classification uses closed-piece triangle winding; nearest triangle distance is conservative where pieces overlap.','No load, friction, stability, motor control or physical grasp validation.'],
  geometry:{},footTerrain:metric(),footTerrainBySurface:{},boxTerrain:metric(),boxTerrainBySurface:{},bootInsideCrate:metric(),supportGap:metric(),ankleTargetError:metric(),poseReachError:metric(),plantedAnkleDrift:metric(),gripMeanToHandle:metric(),gripMeanToFK:metric(),events:[]};
const note=(t,type,data)=>{if(report.events.length<160)report.events.push({time:t,type,...data});};
function distinctIndices(mesh){
  const p=mesh.geometry.attributes.position,out=[],seen=new Set();
  for(let i=0;i<p.count;i++){const key=`${Math.round(p.getX(i)*1e6)}/${Math.round(p.getY(i)*1e6)}/${Math.round(p.getZ(i)*1e6)}`;if(!seen.has(key)){seen.add(key);out.push(i);}}
  return out;
}
async function glb(file){
  const bytes=fs.readFileSync(path.join(ROOT,file)),loader=new GLTFLoader();
  loader.register(()=>({name:'AuditGeometryOnlyTextures',loadTexture:()=>Promise.resolve(null)}));
  const loaded=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');loaded.scene.updateMatrixWorld(true);return loaded.scene;
}
function collider(scene){
  const positions=[],map=[],meshes=[];const v=new Vector3();
  scene.traverse(m=>{if(!m.isMesh)return;meshes.push(m);const attr=m.geometry.attributes.position,index=m.geometry.index;
    for(let j=0;j<(index?.count??attr.count);j++){
      v.fromBufferAttribute(attr,index?index.getX(j):j).applyMatrix4(m.matrixWorld);positions.push(v.x,v.y,v.z);
      if(j%3===0)map.push({mesh:m.name,triangle:Math.floor(j/3)});
    }
  });
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeBoundingBox();
  // indirect preserves original triangle indices, allowing exact source attribution.
  const bvh=new MeshBVH(geometry,{maxLeafTris:8,indirect:true});
  return {bvh,map,meshes,geometry,box:geometry.boundingBox.clone()};
}
try{
  const [{sampleScenario,robotGripPoint,sequenceDuration},{createMotionRig}]=await Promise.all([
    server.ssrLoadModule('/src/domain/atlasScenario.ts'),server.ssrLoadModule('/src/domain/atlasMotionRig.ts')]);
  const [human,stairs,crate]=await Promise.all([
    glb('public/assets/v04/motion-m6/atlas-motion.glb'),glb('public/assets/v04/environment-m6/stairs-open-view.glb'),glb('public/assets/v04/environment-m6/crate.glb')]);
  const rig=createMotionRig(human),terrain=collider(stairs),crateCollider=collider(crate);
  const feet={L:[],R:[]},pads={L:[],R:[]},handles={};
  for(const side of ['L','R']){
    rig.bones['foot_'+side].traverse(m=>{if(m.isMesh)feet[side].push({mesh:m,indices:distinctIndices(m)});});
    for(let digit=1;digit<=3;digit++){
      const bone=rig.bones[`exofinger_${digit}_dist_${side}`];if(!bone)throw new Error(`Missing actual M6 finger ${digit}/${side}`);
      const matches=[];bone.traverse(m=>{if(m.isMesh&&[].concat(m.material).some(mat=>/grip elastomer/i.test(mat.name)))matches.push(m);});
      if(matches.length!==1)throw new Error(`Expected one elastomer pad on finger ${digit}/${side}, found ${matches.length}`);
      const mesh=matches[0];mesh.geometry.computeBoundingBox();pads[side].push({mesh,centre:mesh.geometry.boundingBox.getCenter(new Vector3())});
    }
    handles[side]=crate.getObjectByName('Handle_'+side);if(!handles[side])throw new Error('Missing exported crate Handle_'+side);
  }
  const boxVertices=crateCollider.meshes.map(mesh=>({mesh,indices:distinctIndices(mesh)}));
  report.geometry={rigBones:Object.keys(rig.bones).length,feet:Object.fromEntries(['L','R'].map(s=>[s,feet[s].map(({mesh,indices})=>({name:mesh.name,vertices:indices.length}))])),pads:Object.fromEntries(['L','R'].map(s=>[s,pads[s].map(({mesh})=>mesh.name)])),stairsTriangles:terrain.map.length,crateTriangles:crateCollider.map.length,crateDistinctVertices:boxVertices.reduce((n,m)=>n+m.indices.length,0),durationFromCurrentCode:sequenceDuration({sequence:'carry',clip:'idle'})};
  const ray=new Ray(new Vector3(),new Vector3(0,-1,0)),sideRay=new Ray(new Vector3(),new Vector3(1,.000731,.000413).normalize());
  const v=new Vector3(),local=new Vector3(),surfacePoint=new Vector3(),worldBox=new Box3(),boxMatrixInverse=new THREE.Matrix4();
  const heightCache=new Map();
  function surfaceAt(x,z){
    // Cache only identical projected coordinates to 10 nm; never quantise away collisions.
    const key=`${Math.round(x*1e8)}/${Math.round(z*1e8)}`;if(heightCache.has(key))return heightCache.get(key);
    ray.origin.set(x,10,z);const hit=terrain.bvh.raycastFirst(ray,DoubleSide);let out;
    if(hit&&hit.point.y>0){
      const y=hit.point.y,stage=z<.54?'step1':z<.92?'step2':z<1.30?'step3':z<1.68?'step4':'landing';
      out={height:y,surface:stage,mesh:terrain.map[hit.faceIndex]?.mesh??'stairs',triangle:hit.faceIndex};
    }else out={height:0,surface:'floor',mesh:'ground',triangle:null};
    if(heightCache.size<500000)heightCache.set(key,out);return out;
  }
  const previous={};const started=Date.now();
  for(let frame=0;frame<=Math.round(end*hz);frame++){
    const t=Math.min(end,frame/hz),f=sampleScenario('carry',t);human.position.set(...f.root);rig.apply(f.pose);human.updateMatrixWorld(true);
    if(f.box){crate.position.set(...f.box);crate.updateMatrixWorld(true);worldBox.copy(crateCollider.box).translate(crate.position);boxMatrixInverse.copy(crate.matrixWorld).invert();}
    for(const side of ['L','R']){
      let soleGap=Infinity,soleRecord=null;
      for(const {mesh,indices} of feet[side])for(const j of indices){
        mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld);const surface=surfaceAt(v.x,v.z),clearance=v.y-surface.height;
        const detail={time:t,side,mesh:mesh.name,vertex:j,world:rounded(v),surface:surface.surface,surfaceY:surface.height,terrainMesh:surface.mesh,terrainTriangle:surface.triangle,action:f.action};
        record(report.footTerrain,clearance,detail);record(report.footTerrainBySurface[surface.surface]??=metric(),clearance,detail);
        if(clearance<soleGap){soleGap=clearance;soleRecord=detail;}
        if(f.box&&worldBox.containsPoint(v)){
          local.copy(v).applyMatrix4(boxMatrixInverse);sideRay.origin.copy(local);
          const hits=crateCollider.bvh.raycast(sideRay,DoubleSide),winding=hits.reduce((n,h)=>n+Math.sign(h.face.normal.dot(sideRay.direction)),0);
          if(winding!==0){
            const closest=crateCollider.bvh.closestPointToPoint(local),detail2={...detail,boxPosition:f.box,nearestBoxLocal:rounded(closest.point),crateTriangle:closest.faceIndex};
            record(report.bootInsideCrate,closest.distance,detail2,'max');
          }
        }
      }
      const p=f.pose[side==='L'?'left':'right'],ankle=rig.bones['foot_'+side].getWorldPosition(new Vector3());
      if(p.contact)record(report.supportGap,soleGap,{...soleRecord,contact:true,ankle:rounded(ankle)},'max');
      const desired=new Vector3(ankle.x,p.target[0]+f.root[1],p.target[1]+f.root[2]);
      record(report.ankleTargetError,ankle.distanceTo(desired),{time:t,side,actual:rounded(ankle),desired:rounded(desired),contact:p.contact,root:f.root,poseHeight:f.pose.height},'max');
      record(report.poseReachError,p.reachError,{time:t,side,contact:p.contact,target:p.target,root:f.root,poseHeight:f.pose.height},'max');
      if(previous[side]&&p.contact&&previous[side].contact&&desired.distanceTo(previous[side].desired)<.0001){
        record(report.plantedAnkleDrift,ankle.distanceTo(previous[side].ankle)*hz,{time:t,side,previousTime:t-1/hz,previous:rounded(previous[side].ankle),actual:rounded(ankle)},'max');
      }
      previous[side]={ankle,desired,contact:p.contact};
      const centers=pads[side].map(({mesh,centre})=>centre.clone().applyMatrix4(mesh.matrixWorld));
      const mean=centers.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(1/3);
      const expected=robotGripPoint(f.pose,side,side==='L'?f.pose.robotL:f.pose.robotR).add(new Vector3(...f.root));
      record(report.gripMeanToFK,mean.distanceTo(expected),{time:t,side,actual:rounded(mean),expected:rounded(expected),padCentres:centers.map(rounded)},'max');
      if(f.box&&f.boxHeld){
        const handle=handles[side].getWorldPosition(new Vector3());
        record(report.gripMeanToHandle,mean.distanceTo(handle),{time:t,side,mean:rounded(mean),handle:rounded(handle),delta:rounded(mean.clone().sub(handle)),padCentres:centers.map(rounded),grip:side==='L'?f.pose.robotL.grip:f.pose.robotR.grip,action:f.action},'max');
      }
    }
    if(f.box)for(const {mesh,indices} of boxVertices)for(const j of indices){
      v.fromBufferAttribute(mesh.geometry.attributes.position,j).applyMatrix4(mesh.matrixWorld);const surface=surfaceAt(v.x,v.z),clearance=v.y-surface.height;
      const detail={time:t,mesh:mesh.name,vertex:j,world:rounded(v),surface:surface.surface,surfaceY:surface.height,terrainMesh:surface.mesh,action:f.action};
      record(report.boxTerrain,clearance,detail);record(report.boxTerrainBySurface[surface.surface]??=metric(),clearance,detail);
    }
    if(frame%Math.max(1,Math.round(hz*2))===0)console.log(`sample ${t.toFixed(2)} s / ${end} s`);
  }
  report.elapsedSeconds=(Date.now()-started)/1000;report.thresholds={penetrationM:.002,gripMeanDistanceM:.004,ankleTargetM:.0001};
  report.result={footTerrain:report.footTerrain.worst.value>=-.002?'PASS':'FAIL',boxTerrain:report.boxTerrain.worst.value>=-.002?'PASS':'FAIL',bootInsideCrate:report.bootInsideCrate.worst?.value>.002?'FAIL':'PASS',gripMeanToHandle:report.gripMeanToHandle.worst.value<.004?'PASS':'FAIL',ankleTargets:report.ankleTargetError.worst.value<.0001?'PASS':'FAIL'};
  report.changedDuringRun=sourcePaths.filter(p=>createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')!==signatures[p]);
  if(report.changedDuringRun.length)console.log('SOURCE CHANGED DURING RUN',report.changedDuringRun.join(', '));
  fs.writeFileSync(jsonFile,JSON.stringify(report,null,2));
  const lines=['# M6 carry actual geometry contact audit','',`Sampled 0–${end}s at ${hz}Hz; ${report.elapsedSeconds.toFixed(2)}s computation.`, '',...Object.entries(report.result).map(([name,result])=>`- ${name}: ${result}`),''];
  for(const name of ['footTerrain','boxTerrain','bootInsideCrate','supportGap','ankleTargetError','poseReachError','plantedAnkleDrift','gripMeanToHandle','gripMeanToFK']){
    lines.push(`## ${name}`,'','```json',JSON.stringify(report[name].worst,null,2),'```','');
    console.log(name,JSON.stringify(report[name].worst));
  }
  lines.push('## Per-surface worst boot clearance','','```json',JSON.stringify(report.footTerrainBySurface,null,2),'```','',...report.limits.map(x=>'- '+x));
  fs.writeFileSync(path.join(OUT,'carry-contact-audit.md'),lines.join('\n'));
  console.log('REPORT',jsonFile);
}finally{await server.close();}
