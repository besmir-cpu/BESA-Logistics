import test from 'node:test';
import assert from 'node:assert/strict';
import * as openpgp from 'openpgp';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {runBackupV2,readArchive,verifyPart,sha,partPath} from '../scripts/backup-v2.mjs';
import {encryptSnapshot} from '../scripts/backup-crypto.mjs';
import {assertRecoveryTarget} from '../scripts/recovery-sql.mjs';
const {privateKey:key}=await openpgp.generateKey({type:'ecc',curve:'curve25519Legacy',userIDs:[{name:'Synthetic recovery test'}],format:'object'});
const base=resolve('recovery/unit-tests');await mkdir(base,{recursive:true});
async function temporary(t){const root=await mkdtemp(resolve(base,'case-'));t.after(async()=>{if(!root.startsWith(base+sep))throw Error('Unsafe test cleanup');await rm(root,{recursive:true,force:true});});return root;}
function fixture(){return {format:'besa-recovery-v2',source_project:'synthetic-project',created_at:new Date().toISOString(),data:{'public.besa_vehicles':[],'public.besa_drivers':[],'auth.users':[]},schema:{tables:[{schema:'public',name:'synthetic'}],unsupported:[]},storage_objects:[{bucket_id:'besa-test',name:'synthetic.pdf',id:'synthetic-id',version:'1',updated_at:'2026-10-21T00:00:00Z',metadata:{size:8,mimetype:'application/pdf'}}]};}
async function server(snapshot,{fail=false}={}){
 let downloads=0;const cipher=await openpgp.encrypt({message:await openpgp.createMessage({binary:new TextEncoder().encode('%PDFtest')}),encryptionKeys:key.toPublic(),format:'binary'});
 return {get downloads(){return downloads;},fetch:async(url)=>{
  const action=new URL(url).searchParams.get('action');
  if(action==='manifest')return new Response(await encryptSnapshot(snapshot,key));
  if(action==='document'){downloads++;return fail?new Response('failure',{status:503}):new Response(cipher);}
  if(action==='rehearse')return Response.json({verified:true,production_modified:false,restored_rows:0});throw Error('Unexpected request');
 }};
}
test('separate encrypted parts are complete, verifiable and reuse unchanged documents',async t=>{
 const root=await temporary(t),snapshot=fixture(),s=await server(snapshot),options={url:'https://example.test/backup',token:'synthetic',key,fetchImpl:s.fetch};
 const first=await runBackupV2({...options,output:resolve(root,'first')});assert.equal(first.report.document_bytes,8);assert.equal(s.downloads,1);
 const read=await readArchive(first.root,key);assert.equal((await verifyPart(first.root,read.snapshot.files[0],key)).toString(),'%PDFtest');
 const second=await runBackupV2({...options,output:resolve(root,'second'),previous:first.root});assert.equal(second.report.reused_document_parts,1);assert.equal(second.report.downloaded_document_bytes,0);assert.equal(s.downloads,1);
});
test('a changed version forces a new download and failed transfer cannot become complete',async t=>{
 const root=await temporary(t),snapshot=fixture(),s=await server(snapshot),options={url:'https://example.test/backup',token:'synthetic',key,fetchImpl:s.fetch};
 const first=await runBackupV2({...options,output:resolve(root,'first')});snapshot.storage_objects[0].version='2';
 const second=await runBackupV2({...options,output:resolve(root,'second'),previous:first.root});assert.equal(second.report.reused_document_parts,0);assert.equal(s.downloads,2);
 const broken=await server(snapshot,{fail:true});await assert.rejects(runBackupV2({...options,fetchImpl:broken.fetch,output:resolve(root,'broken')}));
 await assert.rejects(readFile(resolve(root,'broken','verified.json')));assert.ok((await readdir(root)).some(x=>x.startsWith('.pending-')));
});
test('missing, corrupted and traversal document parts are rejected',async t=>{
 const root=await temporary(t),s=await server(fixture());const first=await runBackupV2({url:'https://example.test/backup',token:'synthetic',key,fetchImpl:s.fetch,output:resolve(root,'first')});
 const file=first.snapshot.files[0];await writeFile(partPath(first.root,file.part),'damaged');await assert.rejects(verifyPart(first.root,file,key),/damaged/);
 assert.throws(()=>partPath(root,'../private.asc'));assert.throws(()=>partPath(root,'documents/not-a-uuid.pgp'));
 first.snapshot.files=[];const encrypted=await encryptSnapshot(first.snapshot,key);await writeFile(resolve(first.root,'snapshot.pgp'),encrypted);
 await writeFile(resolve(first.root,'verified.json'),JSON.stringify({...first.report,snapshot_sha256:sha(encrypted)}));await assert.rejects(readArchive(first.root,key),/manifest/);
});
test('restore tooling refuses the live project and requires an explicit separate target',()=>{
 assert.throws(()=>assertRecoveryTarget('xyicnwfwsmbfcputqrbn'));assert.throws(()=>assertRecoveryTarget(''));assertRecoveryTarget('qlfhacqhkeciyjhzwvkf');
});
test('a truncated encrypted stream cannot publish a complete archive or change an earlier backup',async t=>{
 const root=await temporary(t),s=await server(fixture()),options={url:'https://example.test/backup',token:'synthetic',key};
 const good=await runBackupV2({...options,fetchImpl:s.fetch,output:resolve(root,'good')});
 const fetchImpl=async(url,init)=>{const response=await s.fetch(url,init);if(new URL(url).searchParams.get('action')!=='document')return response;const bytes=new Uint8Array(await response.arrayBuffer());return new Response(bytes.slice(0,Math.floor(bytes.length/2)));};
 await assert.rejects(runBackupV2({...options,fetchImpl,output:resolve(root,'truncated')}));
 await assert.rejects(readFile(resolve(root,'truncated','verified.json')));
 const prior=await readArchive(good.root,key);assert.equal((await verifyPart(good.root,prior.snapshot.files[0],key)).toString(),'%PDFtest');
});
