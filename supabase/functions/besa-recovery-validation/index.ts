// Disposable recovery project only. Even an accidental production deployment
// returns 410 before making any authentication, database or Storage requests.
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import * as OTPAuth from 'npm:otpauth@9.5.2';
const TARGET='qlfhacqhkeciyjhzwvkf',LIVE='xyicnwfwsmbfcputqrbn';
const TOKEN_HASH='35a05dd20cb5cf4f9e22b5df3a19b17ab7285b8d6ae06d0f970305948f5f5989';
const url=Deno.env.get('SUPABASE_URL')!,ref=new URL(url).hostname.split('.')[0];
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const client=()=>createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='besa-driver-private-evidence';
const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
class RecoveryCheck extends Error{}
function requireOK(condition:unknown,message:string){if(!condition)throw new RecoveryCheck(message);}
function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
async function driver(){const {data,error}=await db.from('besa_drivers').select('id').order('id').limit(1).single();requireOK(!error&&data?.id,'recovered driver');return data.id;}
async function files(){const id=await driver();const {data,error}=await db.storage.from(bucket).list(id+'/other',{limit:1000});requireOK(!error,'file list');return (data||[]).filter(f=>f.name.startsWith('dr-test-')).map(f=>id+'/other/'+f.name);}
Deno.serve(async req=>{
 if(ref!==TARGET||ref===LIVE)return json({error:'Recovery-only function is disabled on this project.'},410);
 if(req.method!=='POST')return json({error:'POST required'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{64}$/.test(token))return json({error:'Recovery authentication required'},401);
 const hash=await digest(new TextEncoder().encode(token));let different=0;for(let i=0;i<64;i++)different|=hash.charCodeAt(i)^TOKEN_HASH.charCodeAt(i);
 if(different)return json({error:'Recovery authentication denied'},403);
 let phase='validation';
 try{
  const query=new URL(req.url).searchParams,action=query.get('action');
  if(action==='seed'){
   phase='synthetic file seed';const index=Number(query.get('index'));requireOK(Number.isInteger(index)&&index>=0&&index<10,'synthetic index');
   const id=await driver(),path=id+'/other/dr-test-large-'+index+'.pdf';
   const {data:existing}=await db.storage.from(bucket).info(path);if(existing)return json({seeded:true,already_present:true});
   const bytes=new Uint8Array(7*1024*1024);for(let i=0;i<bytes.length;i+=65536)crypto.getRandomValues(bytes.subarray(i,i+65536));bytes.set(new TextEncoder().encode('%PDF-1.4\nSYNTHETIC RECOVERY TEST\n'));
   const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});requireOK(!error,'synthetic upload');return json({seeded:true,bytes:bytes.length});
  }
  if(action==='validate-auth'){
   phase='restored authentication';const {data:details,error:detailError}=await db.rpc('besa_recovery_auth_details');requireOK(!detailError&&details?.factor_id,'restored account and factor');
   // generateLink does not send email. New sessions belong solely to TARGET.
   const {data:link,error:linkError}=await db.auth.admin.generateLink({type:'magiclink',email:details.email});requireOK(!linkError&&link?.properties?.hashed_token,'recovery sign-in link');
   const staff=client();const {error:loginError}=await staff.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});requireOK(!loginError,'restored login');
   const before=await staff.from('besa_vehicles').select('id');requireOK(!before.error&&before.data?.length===0,'AAL1 database denial');
   const {data:challenge,error:challengeError}=await staff.auth.mfa.challenge({factorId:details.factor_id});requireOK(!challengeError&&challenge?.id,'restored MFA challenge');
   const code=new OTPAuth.TOTP({algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(details.secret)}).generate();
   const {error:verifyError}=await staff.auth.mfa.verify({factorId:details.factor_id,challengeId:challenge.id,code});requireOK(!verifyError,'restored MFA verification');
   const {data:assurance}=await staff.auth.mfa.getAuthenticatorAssuranceLevel();requireOK(assurance?.currentLevel==='aal2','restored AAL2 session');
   const vehicles=await staff.from('besa_vehicles').select('id'),drivers=await staff.from('besa_drivers').select('id');requireOK(!vehicles.error&&vehicles.data?.length===57&&!drivers.error&&drivers.data?.length===2,'recovered office reads');
   const id=await driver();const {data:journey}=await staff.from('besa_driver_journey').select('checklist,details,version').eq('driver_id',id).single();requireOK(journey,'shared checklist');
   const payload={p_driver_id:id,p_checklist:journey.checklist,p_details:journey.details,p_expected_version:journey.version};
   const saved=await staff.rpc('besa_save_driver_journey',payload),conflict=await staff.rpc('besa_save_driver_journey',payload);
   requireOK(!saved.error&&saved.data?.[0]?.saved&&!conflict.error&&conflict.data?.[0]?.conflict,'recovered conflict protection');
   const draft=await staff.rpc('besa_save_workspace_draft',{p_workspace:'van-allocation',p_key:'recovery-synthetic',p_payload:{rows:[],recovery_test:true},p_expected_version:0});requireOK(!draft.error&&draft.data?.[0]?.saved,'recovered draft sequence and permissions');
   const path=id+'/other/dr-test-auth.pdf',body=new TextEncoder().encode('%PDFtest');const upload=await staff.storage.from(bucket).upload(path,body,{contentType:'application/pdf',upsert:false});requireOK(!upload.error,'administrator private upload');
   const evidence=await staff.from('besa_driver_evidence').insert({driver_id:id,doc_type:'other',file_name:'Synthetic recovery test.pdf',storage_path:path,mime_type:'application/pdf'});requireOK(!evidence.error,'private evidence metadata');
   const signed=await staff.storage.from(bucket).createSignedUrl(path,60);requireOK(!signed.error&&signed.data?.signedUrl,'private signed view');const downloaded=await fetch(signed.data.signedUrl);requireOK(downloaded.ok&&await downloaded.text()==='%PDFtest','signed document bytes');
   const anonymous=client(),anon=await anonymous.from('besa_vehicles').select('id');requireOK(Boolean(anon.error)||anon.data?.length===0,'anonymous database denial');
   const anonFile=await anonymous.storage.from(bucket).createSignedUrl(path,60);requireOK(Boolean(anonFile.error)&&!anonFile.data?.signedUrl,'anonymous document denial');
   const password=crypto.randomUUID()+crypto.randomUUID(),email='dr-'+crypto.randomUUID()+'@example.test';
   const created=await db.auth.admin.createUser({email,password,email_confirm:true});requireOK(!created.error&&created.data.user,'synthetic non-admin');
   const outsider=client();const outsiderLogin=await outsider.auth.signInWithPassword({email,password});requireOK(!outsiderLogin.error,'password authentication');
   const denied=await outsider.from('besa_vehicles').select('id'),deniedFile=await outsider.storage.from(bucket).createSignedUrl(path,60);
   requireOK(!denied.error&&denied.data?.length===0&&Boolean(deniedFile.error),'non-administrator denial');
   const deniedWrite=await outsider.from('besa_vehicles').insert({registration:'DR-UNAUTHORISED',status:'Active'});requireOK(Boolean(deniedWrite.error),'non-admin write denial');
   await outsider.auth.signOut();await db.auth.admin.deleteUser(created.data.user.id);await staff.auth.signOut();
   return json({verified:true,target:TARGET,password_login:true,restored_magiclink_login:true,restored_authenticator_works:true,aal1_blocked:true,aal2_vehicle_count:vehicles.data.length,driver_count:drivers.data.length,checklist_save_and_conflict:true,draft_sequence_write:true,private_upload_and_signed_view:true,anonymous_denied:true,non_admin_read_write_and_files_denied:true,production_contacted:false});
  }
  if(action==='remove-synthetic-files'){
   phase='synthetic loss simulation';const paths=await files();requireOK(paths.length===11,'expected synthetic file count');
   const {error}=await db.storage.from(bucket).remove(paths);requireOK(!error,'synthetic file removal');requireOK((await files()).length===0,'synthetic files absent');return json({removed_test_files:paths.length,production_contacted:false});
  }
  if(action==='restore-test-file'){
   phase='document restoration';const form=await req.formData(),file=form.get('file'),path=String(form.get('path')||'');
   requireOK(file instanceof File&&path.startsWith(await driver()+'/other/dr-test-')&&file.size<=8*1024*1024,'synthetic restore descriptor');
   const {error}=await db.storage.from(bucket).upload(path,file,{contentType:'application/pdf',upsert:false});requireOK(!error,'document restoration upload');return json({restored:true,bytes:(file as File).size});
  }
  if(action==='verify-files'){
   phase='restored document verification';const expected=await req.json();requireOK(Array.isArray(expected)&&expected.length===11,'restored document manifest');let bytes=0;
   for(const entry of expected){requireOK(entry.path.startsWith(await driver()+'/other/dr-test-'),'synthetic path');const {data,error}=await db.storage.from(bucket).download(entry.path);requireOK(!error&&data,'restored document');const body=new Uint8Array(await data.arrayBuffer());requireOK(body.length===entry.bytes&&await digest(body)===entry.sha256,'restored document integrity');bytes+=body.length;}
   return json({verified:true,restored_files:expected.length,restored_bytes:bytes,production_contacted:false});
  }
  return json({error:'Unknown recovery action'},400);
 }catch(error){return json({error:'Recovery validation failed during '+phase,check:error instanceof RecoveryCheck?error.message:'internal check'},503);}
});
