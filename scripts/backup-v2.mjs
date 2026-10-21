import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,rename,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {decryptBytes,encryptSnapshot} from './backup-crypto.mjs';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function partPath(root,name){
 if(!/^documents\/[0-9a-f-]{36}\.pgp$/.test(name))throw Error('Invalid encrypted document part');
 const path=resolve(root,name);if(!path.startsWith(resolve(root)+sep))throw Error('Invalid archive path');return path;
}
export function objectVersion(object){return JSON.stringify([object.id,object.version,object.updated_at,object.metadata?.size]);}
export function verifyDatabase(snapshot){
 if(!['besa-recovery-v1','besa-recovery-v2'].includes(snapshot?.format)||!snapshot.data||!Array.isArray(snapshot.storage_objects))throw Error('Invalid database backup');
 const counts={};for(const [name,rows] of Object.entries(snapshot.data)){
  if(!/^(public|private|auth)\.[a-z_][a-z_0-9]*$/.test(name)||!Array.isArray(rows))throw Error('Invalid recovery table');counts[name]=rows.length;
 }
 for(const name of ['public.besa_vehicles','public.besa_drivers','auth.users'])if(!(name in counts))throw Error('Required recovery table missing');
 if(snapshot.format==='besa-recovery-v2'&&(!snapshot.schema?.tables?.length||snapshot.schema.unsupported?.length))throw Error('Recovery schema is incomplete or unsupported');
 return counts;
}
export async function verifyPart(root,file,key){
 const cipher=await readFile(partPath(root,file.part));if(sha(cipher)!==file.cipher_sha256)throw Error('Encrypted document damaged');
 const plain=await decryptBytes(cipher,key);if(plain.length!==file.bytes||sha(plain)!==file.sha256)throw Error('Document content damaged');return plain;
}
export async function readArchive(root,key){
 const report=JSON.parse(await readFile(resolve(root,'verified.json'),'utf8')),cipher=await readFile(resolve(root,'snapshot.pgp'));
 if(report.format!=='besa-recovery-artifact-v2'||report.complete!==true||sha(cipher)!==report.snapshot_sha256)throw Error('Incomplete or damaged recovery archive');
 const snapshot=JSON.parse((await decryptBytes(cipher,key)).toString('utf8'));verifyDatabase(snapshot);
 if(snapshot.files_included!==true||snapshot.files?.length!==snapshot.storage_objects.length||report.files!==snapshot.files.length)throw Error('Incomplete document manifest');
 const objects=new Map(snapshot.storage_objects.map(o=>[o.bucket_id+'/'+o.name,o])),parts=new Set();
 if(objects.size!==snapshot.storage_objects.length)throw Error('Duplicate storage objects');
 for(const file of snapshot.files){const name=file.bucket+'/'+file.path,object=objects.get(name);
  if(!object||file.object_version!==objectVersion(object)||parts.has(file.part))throw Error('Mismatched document manifest');
  partPath(root,file.part);objects.delete(name);parts.add(file.part);
 }
 return {snapshot,report};
}
export async function runBackupV2({url,token,key,output,previous,fetchImpl=fetch,onPhase=()=>{}}){
 const auth={Authorization:'Bearer '+token};onPhase('database and recovery schema');
 const response=await fetchImpl(url+'?action=manifest',{method:'POST',headers:auth,signal:AbortSignal.timeout(140000)});
 if(!response.ok)throw Error('Snapshot request failed: '+response.status);
 const snapshot=JSON.parse((await decryptBytes(new Uint8Array(await response.arrayBuffer()),key)).toString('utf8'));
 const counts=verifyDatabase(snapshot);if(snapshot.format!=='besa-recovery-v2')throw Error('Streaming backup support is not deployed');
 const final=resolve(output),pending=resolve(dirname(final),'.pending-'+randomUUID());await mkdir(resolve(pending,'documents'),{recursive:true});
 let prior;try{if(previous)prior=await readArchive(previous,key);}catch{prior=null;}
 const cached=prior?.snapshot.source_project===snapshot.source_project?new Map(prior.snapshot.files.map(f=>[f.bucket+'/'+f.path,f])):new Map();
 const files=[];let total=0,downloaded=0,reused=0;
 for(const object of snapshot.storage_objects){
  onPhase('encrypted document '+(files.length+1)+' of '+snapshot.storage_objects.length);
  const old=cached.get(object.bucket_id+'/'+object.name);let file;
  if(old&&old.object_version===objectVersion(object)){
   try{await verifyPart(previous,old,key);file={...old};await copyFile(partPath(previous,old.part),partPath(pending,old.part));reused++;}catch{file=null;}
  }
  if(!file){
   const part='documents/'+randomUUID()+'.pgp',target=partPath(pending,part);
   // Documents are streamed separately; aggregate document bytes never enter
   // an Edge function's JSON snapshot or memory buffer.
   const document=await fetchImpl(url+'?action=document',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({bucket:object.bucket_id,path:object.name,id:object.id,version:object.version,updated_at:object.updated_at}),signal:AbortSignal.timeout(140000)});
   if(!document.ok||!document.body)throw Error('Document download failed: '+document.status);
   await pipeline(Readable.fromWeb(document.body),createWriteStream(target,{flags:'wx'}));
   const cipher=await readFile(target),plain=await decryptBytes(cipher,key);
   if(Number.isFinite(Number(object.metadata?.size))&&plain.length!==Number(object.metadata.size))throw Error('Source document size changed');
   file={bucket:object.bucket_id,path:object.name,object_version:objectVersion(object),mime:object.metadata?.mimetype||'application/octet-stream',part,bytes:plain.length,sha256:sha(plain),cipher_sha256:sha(cipher)};downloaded+=plain.length;
  }
  files.push(file);total+=file.bytes;
 }
 snapshot.files=files;snapshot.files_included=true;onPhase('isolated database row restoration');
 const rehearsalResponse=await fetchImpl(url+'?action=rehearse',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(140000)});
 if(!rehearsalResponse.ok)throw Error('Restore rehearsal failed');const rehearsal=await rehearsalResponse.json();
 if(rehearsal.verified!==true||rehearsal.production_modified!==false)throw Error('Restore rehearsal did not confirm safety');
 const cipher=await encryptSnapshot(snapshot,key);await writeFile(resolve(pending,'snapshot.pgp'),cipher);
 const report={format:'besa-recovery-artifact-v2',complete:true,created_at:snapshot.created_at,verified_at:new Date().toISOString(),source_project:snapshot.source_project,counts,files:files.length,document_bytes:total,downloaded_document_bytes:downloaded,reused_document_parts:reused,snapshot_sha256:sha(cipher),rehearsal};
 await writeFile(resolve(pending,'verified.json'),JSON.stringify(report,null,2));
 try{await stat(final);throw Error('Archive destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 await rename(pending,final);return {root:final,snapshot,report};
}
