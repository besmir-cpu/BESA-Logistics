// Owner-run only. New-project credentials come from the environment, never chat,
// command arguments or logs. Existing target objects are never overwritten.
import {createClient} from '@supabase/supabase-js';
import {readArchive,verifyPart,sha} from './backup-v2.mjs';
import {recoveryKey} from './backup-crypto.mjs';
import {assertRecoveryTarget} from './recovery-sql.mjs';
let phase='target verification';
try{
 const target=process.env.BESA_RECOVERY_PROJECT;assertRecoveryTarget(target);
 const secret=process.env.BESA_RECOVERY_SERVICE_KEY;if(!secret)throw Error('Separate recovery credentials are required');
 const folder=process.argv[2],key=await recoveryKey(),{snapshot}=await readArchive(folder,key);
 const db=createClient('https://'+target+'.supabase.co',secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:buckets,error}=await db.storage.listBuckets();if(error)throw Error('Target storage unavailable');
 for(const bucket of snapshot.storage_buckets||[])if(!buckets.some(b=>b.id===bucket.id&&b.public===false))throw Error('Restore private buckets before documents');
 phase='archive integrity';for(const file of snapshot.files)await verifyPart(folder,file,key);
 let restored=0,alreadyVerified=0,bytes=0;
 for(const file of snapshot.files){
  phase='private document restoration';const source=await verifyPart(folder,file,key);
  const upload=await db.storage.from(file.bucket).upload(file.path,source,{contentType:file.mime,upsert:false});
  // An interrupted restore may resume only when the existing object is identical.
  const download=await db.storage.from(file.bucket).download(file.path);
  if(download.error||!download.data)throw Error('Target verification failed');
  const actual=Buffer.from(await download.data.arrayBuffer());if(actual.length!==file.bytes||sha(actual)!==file.sha256)throw Error('Target content differs; retained without overwrite');
  if(upload.error)alreadyVerified++;else restored++;bytes+=file.bytes;
 }
 console.log(JSON.stringify({verified:true,target_project:target,restored_files:restored,already_verified_files:alreadyVerified,document_bytes:bytes,production_contacted:false}));
}catch{console.error('Document recovery stopped during '+phase+'. Existing source and target objects were retained.');process.exitCode=1;}
