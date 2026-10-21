import {resolve} from 'node:path';
import {localSecret,recoveryKey} from './backup-crypto.mjs';
import {runBackupV2} from './backup-v2.mjs';
let phase='initialisation';
try{
 const project=process.env.BESA_BACKUP_PROJECT||'xyicnwfwsmbfcputqrbn';
 if(!/^[a-z]{20}$/.test(project))throw Error('Invalid project');
 const token=process.env.BESA_BACKUP_JOB_TOKEN||localSecret(project==='xyicnwfwsmbfcputqrbn'?'job-token.dpapi':'dr-job-token.dpapi');
 const output=resolve(process.env.BESA_BACKUP_OUTPUT_DIR||'recovery/export/BESA-'+new Date().toISOString().replace(/[:.]/g,'-'));
 const {report}=await runBackupV2({url:'https://'+project+'.supabase.co/functions/v1/besa-encrypted-backup',token,key:await recoveryKey(),output,previous:process.env.BESA_BACKUP_PREVIOUS_DIR,onPhase:value=>phase=value});
 console.log(JSON.stringify(report));
}catch{console.error('Backup failed during '+phase+'. No complete archive was recorded. Existing backups and production records were retained.');process.exitCode=1;}
