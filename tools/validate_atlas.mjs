import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const version=process.argv.includes('--r04') ? 'v04' : 'v03'
const revision=version==='v04' ? 'r04' : 'r03'
const assembly=JSON.parse(readFileSync(resolve(root,`cad/${version}/output/assembly.json`)))
const b=readFileSync(resolve(root,`public/assets/${version}/atlas-${revision}.glb`))
const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)))
const defs=Object.fromEntries(assembly.parts.map(p=>[p.id,p]))
const colors={titanium:'01',ceramic:'02',graphite:'03',lime:'04',rubber:'05',steel:'06',screen:'12',red:'14'}
const bounds={}
const previews={}
for(const instance of assembly.instances){
  const p=defs[instance.part]
  const key=`${p.family}__${p.layer}__${instance.side}__${colors[p.material]}`
  const points=previews[p.id]??=JSON.parse(readFileSync(resolve(root,`cad/${version}/output/preview`,p.id+'.json'))).vertices
  const box=bounds[key]??={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}
  for(const v of points){
    const a=instance.matrix.slice(0,3).map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]+row[3])
    const world=[a[0]/1000,a[2]/1000,-a[1]/1000]
    world.forEach((c,i)=>{box.min[i]=Math.min(box.min[i],c);box.max[i]=Math.max(box.max[i],c)})
  }
}
const checks=[]
for(const [key,expected] of Object.entries(bounds)){
  const n=gltf.nodes.find(n=>n.name===key)
  if(!n){checks.push({node:key,pass:false,reason:'missing CAD display group'});continue}
  const actual={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}
  for(const p of gltf.meshes[n.mesh].primitives){
    const a=gltf.accessors[p.attributes.POSITION]
    for(let i=0;i<3;i++){actual.min[i]=Math.min(actual.min[i],a.min[i]);actual.max[i]=Math.max(actual.max[i],a.max[i])}
  }
  const deviation=Math.max(...['min','max'].flatMap(edge=>expected[edge].map((v,i)=>Math.abs(v-actual[edge][i]))))*1000
  checks.push({node:key,deviationMm:+deviation.toFixed(4),pass:deviation<2})
}
const report={revision:`ATLAS-${revision.toUpperCase()}`,displayGroupsCompared:checks.length,pass:checks.every(c=>c.pass),worstDeviationMm:Math.max(...checks.map(c=>c.deviationMm??Infinity)),checks}
writeFileSync(resolve(root,`output/${version}/cad-display-alignment.json`),JSON.stringify(report,null,2))
console.log(JSON.stringify({groups:checks.length,pass:report.pass,worstDeviationMm:report.worstDeviationMm,failures:checks.filter(c=>!c.pass)},null,2))
if(!report.pass)process.exitCode=1
