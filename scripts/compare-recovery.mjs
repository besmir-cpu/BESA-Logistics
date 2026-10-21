import {readArchive,sha} from './backup-v2.mjs';
import {recoveryKey} from './backup-crypto.mjs';
import {writeFile} from 'node:fs/promises';
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const unordered=rows=>(rows||[]).map(canonical).sort().join('\n');
export function compareSnapshots(before,after,{businessOnly=false}={}){
 const counts={};for(const [name,rows] of Object.entries(before.data)){
  if(businessOnly&&!name.startsWith('public.'))continue;
  if(unordered(rows)!==unordered(after.data[name]))throw Error('Restored data does not match '+name);
  counts[name]=rows.length;
 }
 if(!businessOnly){
  for(const field of ['tables','sequences','enums'])if(unordered(before.schema[field])!==unordered(after.schema[field]))throw Error('Restored schema mismatch: '+field);
  for(const field of ['constraints','indexes','policies','grants','triggers'])if(unordered(before[field])!==unordered(after[field]))throw Error('Restored definitions mismatch: '+field);
  const functions=snapshot=>snapshot.schema.functions.map(fn=>({...fn,grants:[...(fn.grants||[])].sort((a,b)=>canonical(a).localeCompare(canonical(b)))}));
  if(unordered(functions(before))!==unordered(functions(after)))throw Error('Restored functions or grants do not match');
 }
 return {rows_match:true,counts,restored_rows:Object.values(counts).reduce((a,b)=>a+b,0),data_sha256:sha(Buffer.from(Object.keys(counts).sort().map(name=>name+'\n'+unordered(before.data[name])).join('\n'))),schema_definitions_match:!businessOnly};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/compare-recovery.mjs')){
 const key=await recoveryKey(),before=await readArchive(process.argv[2],key),after=await readArchive(process.argv[3],key);
 const report=compareSnapshots(before.snapshot,after.snapshot,{businessOnly:process.argv.includes('--business-only')});
 if(process.env.BESA_VERIFICATION_REPORT)await writeFile(process.env.BESA_VERIFICATION_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
