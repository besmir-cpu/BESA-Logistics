import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
// Use the WebCrypto distribution documented for Deno. The npm default selects
// Node's RSA implementation, which is incompatible with the Edge runtime.
import * as openpgp from 'https://unpkg.com/openpgp@6.3.2/dist/openpgp.min.mjs';
const headers={'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
function fail(status:number,message:string){return new Response(JSON.stringify({error:message}),{status,headers:{...headers,'Content-Type':'application/json'}});}
Deno.serve(async req=>{
 let phase='authentication';
 try{
  if(req.method!=='POST')return fail(405,'Use the authenticated backup job.');
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[A-Za-z0-9_-]{64}$/.test(token))return fail(401,'Backup job authentication required.');
  const {data:config,error:configError}=await db.rpc('besa_backup_configuration');
  if(configError||!config?.public_key)return fail(503,'Backup configuration unavailable.');
  const hash=await digest(new TextEncoder().encode(token));
  let different=0;for(let i=0;i<64;i++)different|=hash.charCodeAt(i)^config.job_token_hash.charCodeAt(i);
  if(different)return fail(403,'Backup job authentication failed.');
  const mode=new URL(req.url).searchParams.get('action')||'export';
  if(mode==='rehearse'){
   if(Number(req.headers.get('content-length')||0)>100000000)return fail(413,'Recovery rehearsal is too large.');
   const payload=await req.json();
   const {data,error}=await db.rpc('besa_rehearse_backup',{p_snapshot:payload});
   if(error)return fail(503,'Recovery rehearsal failed; production data was not modified.');
   return new Response(JSON.stringify(data),{headers:{...headers,'Content-Type':'application/json'}});
  }
  if(mode!=='export')return fail(400,'Unsupported backup action.');
  phase='snapshot';
  const {data:snapshot,error}=await db.rpc('besa_export_backup');
  if(error||!snapshot)return fail(503,'Could not read a consistent database snapshot.');
  phase='documents';const files=[];let bytes=0;
  for(const object of snapshot.storage_objects){
   if(!object.bucket_id.startsWith('besa-'))throw Error('Unexpected storage bucket');
   const {data:file,error:downloadError}=await db.storage.from(object.bucket_id).download(object.name);
   if(downloadError||!file)throw Error('A document changed or could not be downloaded');
   const body=new Uint8Array(await file.arrayBuffer());bytes+=body.length;
   if(bytes>64000000)throw Error('Backup exceeds the current in-memory export limit');
   files.push({bucket:object.bucket_id,path:object.name,mime:file.type,bytes:body.length,sha256:await digest(body),base64:base64(body)});
  }
  snapshot.files=files;snapshot.files_included=true;
  const serialized=JSON.stringify(snapshot);if(serialized.length>96000000)throw Error('Snapshot exceeds the current export limit');
  phase='encryption';
  const ciphertext=await openpgp.encrypt({message:await openpgp.createMessage({text:serialized}),encryptionKeys:await openpgp.readKey({armoredKey:config.public_key}),format:'binary'});
  return new Response(ciphertext,{headers:{...headers,'Content-Disposition':'attachment; filename="besa-encrypted-backup.pgp"'}});
 }catch{
  // Never log database payloads, document paths, credentials or cryptographic keys.
  return fail(503,'Backup did not complete during '+phase+'. No successful backup should be recorded.');
 }
});
