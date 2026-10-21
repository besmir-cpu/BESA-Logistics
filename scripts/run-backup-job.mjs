import * as openpgp from 'openpgp';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifySnapshot} from './backup-verify.mjs';
function localSecret(name){
 if(process.platform!=='win32')throw Error('Backup job credentials are not configured.');
 const file=resolve(process.env.BESA_RECOVERY_DIR||'../recovery',name).replaceAll("'","''");
 return execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',"$s=Get-Content -LiteralPath '"+file+"' -Raw|ConvertTo-SecureString;[System.Net.NetworkCredential]::new('', $s).Password"],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
let phase='initialisation';
try{
 const token=process.env.BESA_BACKUP_JOB_TOKEN||localSecret('job-token.dpapi');
 const armored=process.env.BESA_RECOVERY_PRIVATE_KEY||readFileSync(resolve(process.env.BESA_RECOVERY_DIR||'../recovery','private.asc'),'utf8');
 const passphrase=process.env.BESA_RECOVERY_PASSPHRASE||localSecret('passphrase.dpapi');
 const url='https://xyicnwfwsmbfcputqrbn.supabase.co/functions/v1/besa-encrypted-backup';
 phase='encrypted export';
 const exported=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(140000)});
 if(!exported.ok){phase+=' (HTTP '+exported.status+')';throw Error('Export was not confirmed');}
 const cipher=new Uint8Array(await exported.arrayBuffer());
 phase='decryption and content validation';
 const privateKey=await openpgp.decryptKey({privateKey:await openpgp.readPrivateKey({armoredKey:armored}),passphrase});
 const {data}=await openpgp.decrypt({message:await openpgp.readMessage({binaryMessage:cipher}),decryptionKeys:privateKey});
 const snapshot=JSON.parse(data),verified=verifySnapshot(snapshot);
 phase='isolated restore rehearsal';
 const response=await fetch(url+'?action=rehearse',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(140000)});
 if(!response.ok)throw Error('Restore rehearsal was not confirmed');
 const rehearsal=await response.json();
 if(rehearsal.verified!==true||rehearsal.production_modified!==false)throw Error('Restore verification did not succeed');
 phase='encrypted archive';
 const output=resolve(process.env.BESA_BACKUP_OUTPUT_DIR||'recovery/export');mkdirSync(output,{recursive:true});
 const filename='BESA-'+new Date().toISOString().replace(/[:.]/g,'-')+'.pgp';
 const report={created_at:snapshot.created_at,verified_at:new Date().toISOString(),...verified,rehearsal,cipher_sha256:createHash('sha256').update(cipher).digest('hex'),encrypted_bytes:cipher.length};
 writeFileSync(resolve(output,filename),cipher);writeFileSync(resolve(output,filename+'.verified.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({encrypted_archive:filename,...report}));
}catch{
 console.error('Backup failed during '+phase+'. No successful backup was recorded. Production records were not restored or overwritten.');process.exitCode=1;
}
