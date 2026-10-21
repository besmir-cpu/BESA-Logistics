// Explicit disposable target guard prevents this test from calling production.
import {localSecret,recoveryKey} from './backup-crypto.mjs';
import {readArchive,verifyPart} from './backup-v2.mjs';
import {assertRecoveryTarget} from './recovery-sql.mjs';
import {writeFile} from 'node:fs/promises';
const project='qlfhacqhkeciyjhzwvkf';assertRecoveryTarget(project);
const root='https://'+project+'.supabase.co/functions/v1/besa-recovery-validation';
const headers={Authorization:'Bearer '+localSecret('dr-job-token.dpapi')};
async function call(action,options={}){
 const r=await fetch(root+'?action='+action,{method:'POST',headers,signal:AbortSignal.timeout(140000),...options});
 const result=await r.json();if(!r.ok)throw Error(JSON.stringify(result));return result;
}
const action=process.argv[2];
if(action==='auth'){
 const result=await call('validate-auth');await writeFile('../../outputs/disaster-recovery-authentication.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else if(action==='seed'){
 let bytes=0;for(let i=0;i<10;i++){const result=await call('seed&index='+i);bytes+=result.bytes||0;console.log('Synthetic document '+(i+1)+' of 10 ready.');}console.log(JSON.stringify({synthetic_seed_bytes:bytes,production_contacted:false}));
}else if(action==='restore-files'){
 const folder=process.argv[3],key=await recoveryKey(),{snapshot}=await readArchive(folder,key);
 if(snapshot.source_project!==project||snapshot.files.length!==11)throw Error('Unexpected recovery document archive');
 console.log(JSON.stringify(await call('remove-synthetic-files')));
 const expected=[];
 for(const file of snapshot.files){
  const bytes=await verifyPart(folder,file,key),form=new FormData();form.append('path',file.path);form.append('file',new Blob([bytes],{type:file.mime}),'synthetic.pdf');
  const restored=await call('restore-test-file',{body:form});if(restored.bytes!==file.bytes)throw Error('Restored byte count mismatch');expected.push({path:file.path,bytes:file.bytes,sha256:file.sha256});
  console.log('Encrypted document '+expected.length+' of '+snapshot.files.length+' restored in the test project.');
 }
 const result=await call('verify-files',{headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(expected)});
 await writeFile('../../outputs/disaster-recovery-document-restoration.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else throw Error('Choose auth, seed or restore-files');
