import {createHash} from 'node:crypto';
export function verifySnapshot(snapshot){
 if(snapshot?.format!=='besa-recovery-v1'||!snapshot.data||snapshot.files_included!==true||!Array.isArray(snapshot.files)||!Array.isArray(snapshot.storage_objects))throw Error('Backup is missing required database or document content.');
 const objects=new Set(snapshot.storage_objects.map(o=>o.bucket_id+'/'+o.name));
 if(objects.size!==snapshot.storage_objects.length||snapshot.files.length!==objects.size)throw Error('Document manifest does not match the backup.');
 for(const file of snapshot.files){
  const name=file.bucket+'/'+file.path,bytes=Buffer.from(file.base64,'base64');
  if(!objects.delete(name)||bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Document integrity validation failed.');
 }
 const counts={};for(const [table,rows] of Object.entries(snapshot.data)){
  if(!/^(public|private|auth)\.[a-z_][a-z_0-9]*$/.test(table)||!Array.isArray(rows))throw Error('Invalid database table in backup.');
  counts[table]=rows.length;
 }
 for(const table of ['public.besa_vehicles','public.besa_drivers','auth.users'])if(!(table in counts))throw Error('A required database table is missing.');
 return {counts,files:snapshot.files.length};
}
