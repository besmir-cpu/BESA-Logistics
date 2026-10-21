import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifySnapshot} from '../scripts/backup-verify.mjs';
const bytes=Buffer.from('%PDF-1.4\nSYNTHETIC BACKUP TEST\n');
const fixture=()=>({format:'besa-recovery-v1',files_included:true,data:{'public.besa_vehicles':[{id:'synthetic-vehicle'}],'public.besa_drivers':[],'auth.users':[]},storage_objects:[{bucket_id:'besa-test-private',name:'synthetic.pdf'}],files:[{bucket:'besa-test-private',path:'synthetic.pdf',mime:'application/pdf',bytes:bytes.length,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]});
test('backup verification covers database rows and each document byte',()=>{assert.deepEqual(verifySnapshot(fixture()),{counts:{'public.besa_vehicles':1,'public.besa_drivers':0,'auth.users':0},files:1});});
test('missing and modified documents invalidate the whole backup',()=>{
 const missing=fixture();missing.files=[];assert.throws(()=>verifySnapshot(missing),/manifest/);
 const changed=fixture();changed.files[0].base64=Buffer.from('changed').toString('base64');assert.throws(()=>verifySnapshot(changed),/integrity/);
});
test('database-only snapshots cannot be mistaken for a complete file backup',()=>{const partial=fixture();delete partial.files_included;assert.throws(()=>verifySnapshot(partial),/required/);});
