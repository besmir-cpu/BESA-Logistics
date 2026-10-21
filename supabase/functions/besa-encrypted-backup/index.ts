import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
// Deno's WebCrypto build avoids Node-specific RSA APIs.
import * as openpgp from 'https://unpkg.com/openpgp@6.3.2/dist/openpgp.min.mjs';
const headers={'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
function fail(status:number,message:string){return new Response(JSON.stringify({error:message}),{status,headers:{...headers,'Content-Type':'application/json'}});}
Deno.serve(async req=>{
 let phase='authentication';
 try{
  if(req.method!=='POST')return fail(405,'Use the authenticated backup job.');
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[A-Za-z0-9_-]{64}$/.test(token))return fail(401,'Backup job authentication required.');
  const {data:config,error:configError}=await db.rpc('besa_backup_configuration');
  if(configError||!config?.public_key)return fail(503,'Backup configuration unavailable.');
  const hash=await digest(new TextEncoder().encode(token));let different=0;
  for(let i=0;i<64;i++)different|=hash.charCodeAt(i)^config.job_token_hash.charCodeAt(i);
  if(different)return fail(403,'Backup job authentication failed.');
  const mode=new URL(req.url).searchParams.get('action')||'manifest';
  if(mode==='rehearse'){
   if(Number(req.headers.get('content-length')||0)>100000000)return fail(413,'Recovery metadata is too large.');
   const payload=await req.json();
   if(!['besa-recovery-v1','besa-recovery-v2'].includes(payload.format))return fail(400,'Invalid recovery format.');
   // The established row rehearsal contract is independent of document format.
   const {data,error}=await db.rpc('besa_rehearse_backup',{p_snapshot:{...payload,format:'besa-recovery-v1'}});
   if(error)return fail(503,'Recovery rehearsal failed; production data was not modified.');
   return new Response(JSON.stringify(data),{headers:{...headers,'Content-Type':'application/json'}});
  }
  if(mode==='document'){
   phase='document';if(Number(req.headers.get('content-length')||0)>8192)return fail(413,'Invalid document descriptor.');
   const p=await req.json();
   if(typeof p.bucket!=='string'||typeof p.path!=='string'||p.path.length>2048||!p.id||!p.updated_at)return fail(400,'Invalid document descriptor.');
   const lookup=async()=>{
    const {data,error}=await db.rpc('besa_backup_object',{p_bucket:p.bucket,p_path:p.path});
    if(error||!data||data.id!==p.id||data.version!==p.version||data.updated_at!==p.updated_at)throw Error('Source object changed');
   };
   await lookup();
   const path=encodeURIComponent(p.bucket)+'/'+p.path.split('/').map(encodeURIComponent).join('/');
   const source=await fetch(url+'/storage/v1/object/'+path,{headers:{Authorization:'Bearer '+secret,apikey:secret}});
   if(!source.ok||!source.body)return fail(409,'The source document is unavailable.');
   // A changed/deleted source aborts the encrypted stream before its final
   // integrity packet. The runner never labels a truncated stream complete.
   const checked=source.body.pipeThrough(new TransformStream({transform(chunk,controller){controller.enqueue(chunk);},async flush(){await lookup();}}));
   const cipher=await openpgp.encrypt({message:await openpgp.createMessage({binary:checked}),encryptionKeys:await openpgp.readKey({armoredKey:config.public_key}),format:'binary'});
   return new Response(cipher,{headers});
  }
  if(!['manifest','export'].includes(mode))return fail(400,'Unsupported backup action.');
  phase='snapshot';const {data:snapshot,error}=await db.rpc('besa_export_backup_v2');
  if(error||!snapshot)return fail(503,'Could not read a consistent database snapshot.');
  snapshot.source_project=new URL(url).hostname.split('.')[0];
  const serialized=JSON.stringify(snapshot);if(serialized.length>96000000)return fail(413,'Database metadata exceeds the current request capacity.');
  phase='encryption';const cipher=await openpgp.encrypt({message:await openpgp.createMessage({text:serialized}),encryptionKeys:await openpgp.readKey({armoredKey:config.public_key}),format:'binary'});
  return new Response(cipher,{headers});
 }catch{return fail(503,'Backup did not complete during '+phase+'. No complete archive should be recorded.');}
});
