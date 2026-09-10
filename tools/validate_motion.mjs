import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh, Bone, SkinnedMesh, Vector3, Box3 } from 'three';
const root=resolve(import.meta.dirname,'..');
const revision=process.argv.includes('--m3')?'motion-m3':'motion';
const bytes=readFileSync(resolve(root,`public/assets/v04/${revision}/atlas-motion.glb`));
const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=loaded.scene;scene.updateMatrixWorld(true);
const rig=JSON.parse(readFileSync(resolve(root,`public/assets/v04/${revision}/rig.json`)));
let finite=true,weightError=0,skinVertices=0,meshes=0,bones=0;
const restErrors=[],rigidBounds={};
scene.traverse(n=>{
  if(n instanceof Bone){bones++;const expected=rig.bones[n.name].rest;const p=n.getWorldPosition(new Vector3());restErrors.push(p.distanceTo(new Vector3(...expected)));}
  if(!(n instanceof Mesh))return;
  meshes++;
  for(const attr of Object.values(n.geometry.attributes))for(const v of attr.array)if(!Number.isFinite(v))finite=false;
  if(n instanceof SkinnedMesh){
    const weights=n.geometry.getAttribute('skinWeight');skinVertices+=weights.count;
    for(let i=0;i<weights.count;i++)weightError=Math.max(weightError,Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1));
  }else{
    const key=n.name.split('__').slice(0,4).join('__');
    const box=rigidBounds[key]??=new Box3();n.geometry.computeBoundingBox();box.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
  }
});
// Compare CAD-containing rigid batches with their static R04 display geometry.
const original=readFileSync(resolve(root,'public/assets/v04/atlas-r04.glb'));
const staticGLTF=JSON.parse(original.toString('utf8',20,20+original.readUInt32LE(12)));
const checks=[],missing=[];
for(const n of staticGLTF.nodes){
  if(n.mesh===undefined||!n.extras?.cadPart)continue;
  const actual=rigidBounds[n.name];if(!actual){missing.push(n.name);continue;}
  const expected=new Box3();
  for(const prim of staticGLTF.meshes[n.mesh].primitives){const a=staticGLTF.accessors[prim.attributes.POSITION];expected.expandByPoint(new Vector3(...a.min));expected.expandByPoint(new Vector3(...a.max));}
  const error=Math.max(...actual.min.toArray().map((v,i)=>Math.abs(v-expected.min.toArray()[i])),...actual.max.toArray().map((v,i)=>Math.abs(v-expected.max.toArray()[i])))*1000;
  checks.push({group:n.name,deviationMm:error,pass:error<.1});
}
const report={purpose:'display rig verification, not dynamic interference or control validation',revision,bones,meshes,skinVertices,missing,
  allAttributesFinite:finite,maxWeightSumError:weightError,maxBoneRestErrorMm:Math.max(...restErrors)*1000,
  rigidGroupsCompared:checks.length,maxRigidRestDeviationMm:Math.max(...checks.map(c=>c.deviationMm)),checks,
  pass:finite&&bones===Object.keys(rig.bones).length&&missing.length===0&&weightError<1e-5&&restErrors.every(e=>e<1e-5)&&checks.length>100&&checks.every(c=>c.pass)};
writeFileSync(resolve(root,`output/v04/${revision}-rig-validation.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,checks:checks.filter(c=>!c.pass)},null,2));
if(!report.pass)process.exitCode=1;
