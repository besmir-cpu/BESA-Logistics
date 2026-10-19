// BESA secure candidate intake. Public transport, private bearer capability.
// Every call authenticates either a 256-bit expiring invitation token or a
// Supabase-verified administrator JWT. NEVER expose service credentials.
import {createClient} from 'npm:@supabase/supabase-js@2.57.2';

const BUCKET='besa-candidate-private';
const WEB_ORIGIN='https://besmir-cpu.github.io';
const ALLOWED_ORIGINS=new Set([WEB_ORIGIN,'https://besalogistics.co.uk','https://www.besalogistics.co.uk','https://besalogistics.netlify.app']);
const LINK_BASE='https://besalogistics.co.uk/onboarding/#invite=';
const MAX_FILE=8*1024*1024;
const DOC_TYPES=new Set(['passport','right-to-work','driving-licence-front',
 'driving-licence-back','dvla-evidence','proof-of-address','other']);
const FILE_TYPES=new Map([
 ['application/pdf','pdf'],['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']
]);
const jsonHeaders={'Content-Type':'application/json;charset=utf-8',
 'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const url=Deno.env.get('SUPABASE_URL');
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const legacyService=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const modernKeys=Deno.env.get('SUPABASE_SECRET_KEYS');
const serviceKey=legacyService||(modernKeys?JSON.parse(modernKeys)['default']:null);
if(!url||!publicKey||!serviceKey)throw new Error('Candidate intake environment is not configured');
const adminDb=createClient(url,serviceKey,{
 auth:{persistSession:false,autoRefreshToken:false}
});
const text=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
function error(message,code=400){return {error:message,code};}
function response(data,code=200,origin=''){
 const headers=new Headers(jsonHeaders);
 if(ALLOWED_ORIGINS.has(origin)||/^http:\/\/localhost(?::\d+)?$/.test(origin)){
   headers.set('Access-Control-Allow-Origin',origin);
   headers.set('Access-Control-Allow-Headers','authorization,apikey,content-type');
   headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
   headers.set('Vary','Origin');
 }
 return new Response(JSON.stringify(data),{status:code,headers});
}
async function adminAuth(req){
 const auth=req.headers.get('authorization')||'';
 const jwt=auth.replace(/^Bearer\s+/i,'');
 if(!jwt||jwt===publicKey)throw error('Administrator sign-in required',401);
 const userDb=createClient(url,publicKey,{
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data,error:jwtError}=await userDb.auth.getUser(jwt);
 if(jwtError||!data.user?.id||!data.user?.email)throw error('Administrator session expired',401);
 const {data:rows,error:roleError}=await adminDb.from('besa_admins')
   .select('email').eq('email',data.user.email.toLowerCase()).limit(1);
 if(roleError||!rows?.length)throw error('Only BESA administrators can access candidate records',403);
 return data.user;
}
const b64url=bytes=>btoa(String.fromCharCode(...bytes))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const randomToken=()=>b64url(crypto.getRandomValues(new Uint8Array(32)));
async function digest(token){
 const encoded=new TextEncoder().encode(token);
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))]
  .map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function invitation(token,{allowSubmitted=false}={}){
 if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(token))
   throw error('This invitation link is invalid. Ask BESA for a new one.',401);
 const {data:invite,error:dbError}=await adminDb.from('besa_candidate_invites')
  .select('id,driver_id,expires_at,revoked_at,submitted_at')
  .eq('token_hash',await digest(token)).maybeSingle();
 if(dbError)throw error('Cannot verify invitation right now',503);
 if(!invite||invite.revoked_at||Date.parse(invite.expires_at)<=Date.now())
  throw error('This invitation is unavailable or has expired. Ask BESA for a new link.',401);
 if(invite.submitted_at&&!allowSubmitted)
  throw error('This form has already been submitted to BESA.',409);
 return invite;
}
async function createInvite(req,data){
 const staff=await adminAuth(req);
 const driverId=text(data.driverId,80);
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(driverId))
   throw error('Select an existing BESA driver profile first');
 const {data:person,error:driverErr}=await adminDb.from('besa_drivers')
  .select('id,first_name,last_name,email,status').eq('id',driverId).maybeSingle();
 if(driverErr||!person)throw error('Driver was not found',404);
 if(person.status==='Archived')throw error('Archived drivers cannot be invited');
 if(!person.email)throw error('Add a driver email address before creating an invitation');
 // Previous invitations are invalidated to prevent multiple active bearer links.
 const {error:revokeError}=await adminDb.from('besa_candidate_invites')
  .update({revoked_at:new Date().toISOString()})
  .eq('driver_id',driverId).is('revoked_at',null).is('submitted_at',null);
 if(revokeError)throw error('Unable to revoke a previous invitation',503);
 const token=randomToken();
 const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
 const {data:created,error:insertErr}=await adminDb.from('besa_candidate_invites')
  .insert({driver_id:driverId,token_hash:await digest(token),
    created_by:staff.id,expires_at:expiresAt})
  .select('id,expires_at').single();
 if(insertErr||!created)throw error('Could not create an invitation',503);
 return {link:LINK_BASE+token,expires_at:created.expires_at,
   driver_name:[person.first_name,person.last_name].filter(Boolean).join(' '),
   email:person.email};
}
async function revokeInvite(req,data){
 await adminAuth(req);
 const id=text(data.inviteId,80),driverId=text(data.driverId,80);
 const {data:found,error:loadError}=await adminDb.from('besa_candidate_invites')
  .select('id,driver_id,submitted_at').eq('id',id).eq('driver_id',driverId).maybeSingle();
 if(loadError||!found)throw error('Invitation not found',404);
 if(found.submitted_at)throw error('Submitted records are retained for office review',409);
 const {error:revokeError}=await adminDb.from('besa_candidate_invites')
  .update({revoked_at:new Date().toISOString()}).eq('id',id);
 if(revokeError)throw error('Could not revoke invitation',503);
 return {revoked:true};
}
async function adminReview(req,data){
 await adminAuth(req);
 const driverId=text(data.driverId,80);
 if(!/^[0-9a-f-]{36}$/i.test(driverId))throw error('Invalid driver ID');
 const [{data:invites,error:inviteErr},{data:docs,error:docsErr}]=await Promise.all([
   adminDb.from('besa_candidate_invites')
     .select('id,created_at,expires_at,revoked_at,submitted_at,candidate_payload')
     .eq('driver_id',driverId).order('created_at',{ascending:false}).limit(20),
   adminDb.from('besa_candidate_documents')
     .select('id,invite_id,doc_type,original_name,mime_type,byte_size,uploaded_at')
     .eq('driver_id',driverId).order('uploaded_at',{ascending:false}).limit(100)
 ]);
 if(inviteErr||docsErr)throw error('Unable to load private candidate details',503);
 return {invites:invites||[],documents:docs||[]};
}
async function adminView(req,data){
 await adminAuth(req);
 const driverId=text(data.driverId,80),fileId=text(data.fileId,80);
 const {data:file,error:fileErr}=await adminDb.from('besa_candidate_documents')
  .select('driver_id,storage_path,original_name').eq('id',fileId).eq('driver_id',driverId).maybeSingle();
 if(fileErr||!file)throw error('Document not found or access denied',404);
 const {data:link,error:signErr}=await adminDb.storage.from(BUCKET)
  .createSignedUrl(file.storage_path,60);
 if(signErr||!link?.signedUrl)throw error('Could not create a private document link',503);
 return {url:link.signedUrl,expires_seconds:60};
}
async function candidateStatus(data){
 const invite=await invitation(data.token,{allowSubmitted:true});
 const {data:person}=await adminDb.from('besa_drivers')
  .select('first_name').eq('id',invite.driver_id).maybeSingle();
 const {data:docs,error:docsErr}=await adminDb.from('besa_candidate_documents')
  .select('doc_type').eq('invite_id',invite.id).limit(25);
 if(docsErr)throw error('Could not read upload status',503);
 return {first_name:person?.first_name||'',
   submitted:!!invite.submitted_at,
   expires_at:invite.expires_at,
   uploaded_types:(docs||[]).map(d=>d.doc_type)};
}
function fileMagic(bytes,mime){
 if(mime==='application/pdf')return [37,80,68,70,45].every((b,i)=>bytes[i]===b);
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 if(mime==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}
async function upload(req){
 const form=await req.formData();
 const invite=await invitation(form.get('token'));
 const type=text(form.get('docType'),50),file=form.get('file');
 if(!DOC_TYPES.has(type))throw error('Choose a valid document category');
 if(!(file instanceof File)||file.size<=0||file.size>MAX_FILE||!FILE_TYPES.has(file.type))
  throw error('Use one PDF, JPG, PNG or WEBP file, maximum 8 MB');
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
 if(!fileMagic(head,file.type))throw error('File contents do not match a supported image or PDF');
 const {data:existing,error:listErr}=await adminDb.from('besa_candidate_documents')
  .select('doc_type').eq('invite_id',invite.id).limit(30);
 if(listErr)throw error('Could not check document limits',503);
 if((existing||[]).length>=12||existing.filter(d=>d.doc_type===type).length>=3)
  throw error('Document limit reached. Contact BESA if you need to replace a file.');
 const path=invite.id+'/'+type+'/'+crypto.randomUUID()+'.'+FILE_TYPES.get(file.type);
 const {error:upErr}=await adminDb.storage.from(BUCKET).upload(path,file,{
  contentType:file.type,cacheControl:'0',upsert:false
 });
 if(upErr)throw error('Secure upload failed. Please retry.',503);
 const original=text(file.name.replace(/[\u0000-\u001f]/g,''),140)||'Document';
 const {error:recordErr}=await adminDb.from('besa_candidate_documents').insert({
  invite_id:invite.id,driver_id:invite.driver_id,doc_type:type,
  original_name:original,storage_path:path,mime_type:file.type,byte_size:file.size
 });
 if(recordErr){
  await adminDb.storage.from(BUCKET).remove([path]);
  throw error('Document could not be registered. Please retry.',503);
 }
 return {uploaded:true,doc_type:type};
}
const validDate=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v))&&v>='1900-01-01'&&v<='2100-12-31';
function validateCandidate(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))
  throw error('Personal details are missing');
 const specs={
  first_name:60,last_name:60,email:150,phone:40,date_of_birth:12,
  address_1:160,address_2:160,city:100,postcode:20,
  licence_type:20,licence_issue_date:12,licence_expiry:12,
  licence_issuing_country:80,right_to_work_type:60,
  right_to_work_expiry:12,right_to_work_share_code:40,passport_expiry:12,
  emergency_contact_name:120,emergency_contact_phone:40
 };
 const result={};
 for(const [key,max] of Object.entries(specs)){
   const input=payload[key];
   if(input!==undefined&&typeof input!=='string')throw error('Invalid field '+key);
   result[key]=text(input,max);
 }
 for(const key of ['first_name','last_name','email','phone','date_of_birth',
   'address_1','city','postcode','licence_type','licence_expiry','right_to_work_type']){
   if(!result[key])throw error('Please complete '+key.replace(/_/g,' '));
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
  throw error('Enter a valid email address');
 if(result.phone.length<7||result.phone.length>40)throw error('Enter a valid contact phone');
 if(!['Automatic','Manual'].includes(result.licence_type))
  throw error('Select your driving licence type');
 if(!['UK or Irish passport','Share code / immigration status','Other evidence'].includes(result.right_to_work_type))
  throw error('Select the type of right-to-work evidence');
 for(const key of ['date_of_birth','licence_issue_date','licence_expiry',
   'right_to_work_expiry','passport_expiry']){
   if(result[key]&&!validDate(result[key]))throw error('Check '+key.replace(/_/g,' ')+' date');
 }
 const eighteen=new Date();eighteen.setUTCFullYear(eighteen.getUTCFullYear()-18);
 if(result.date_of_birth>eighteen.toISOString().slice(0,10))
  throw error('Please check your date of birth');
 if(payload.declaration!==true||payload.privacy_acknowledged!==true)
  throw error('Please confirm the declaration and privacy notice');
 result.declaration=true;result.privacy_acknowledged=true;
 return result;
}
async function submit(data){
 const invite=await invitation(data.token);
 const payload=validateCandidate(data.details);
 const {data:docs,error:readErr}=await adminDb.from('besa_candidate_documents')
  .select('doc_type').eq('invite_id',invite.id).limit(20);
 if(readErr)throw error('Cannot check the uploaded evidence',503);
 const types=new Set((docs||[]).map(d=>d.doc_type));
 if(!types.has('driving-licence-front'))
  throw error('Upload a photo of the front of your driving licence');
 if(!types.has('driving-licence-back'))
  throw error('Upload a photo of the back of your driving licence');
 if(!types.has('passport')&&!types.has('right-to-work'))
  throw error('Upload a passport or other right-to-work evidence');
 const {data:changed,error:saveErr}=await adminDb.from('besa_candidate_invites')
  .update({candidate_payload:payload,submitted_at:new Date().toISOString()})
  .eq('id',invite.id).is('submitted_at',null).is('revoked_at',null)
  .select('id').maybeSingle();
 if(saveErr||!changed)throw error('Your link has expired or was already submitted',409);
 return {submitted:true};
}
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS'){
  const h=new Headers(jsonHeaders);
  if(ALLOWED_ORIGINS.has(origin)||/^http:\/\/localhost(?::\d+)?$/.test(origin)){
   h.set('Access-Control-Allow-Origin',origin);
   h.set('Access-Control-Allow-Headers','authorization,apikey,content-type');
   h.set('Access-Control-Allow-Methods','POST, OPTIONS');
   h.set('Vary','Origin');
  }
  return new Response(null,{status:204,headers:h});
 }
 if(origin&&!ALLOWED_ORIGINS.has(origin)&&!/^http:\/\/localhost(?::\d+)?$/.test(origin))
   return response({error:'Origin not permitted'},403,origin);
 if(req.method!=='POST')return response({error:'Method not allowed'},405,origin);
 try{
   const length=Number(req.headers.get('content-length')||'0');
   if(length>9*1024*1024)throw error('Request too large',413);
   const multipart=(req.headers.get('content-type')||'').startsWith('multipart/form-data');
   if(multipart){
     const result=await upload(req);
     return response(result,200,origin);
   }
   if(length>24000)throw error('Request too large',413);
   const data=await req.json();
   let result;
   switch(data.action){
    case 'create': result=await createInvite(req,data); break;
    case 'revoke': result=await revokeInvite(req,data); break;
    case 'admin-review': result=await adminReview(req,data); break;
    case 'admin-view': result=await adminView(req,data); break;
    case 'status': result=await candidateStatus(data); break;
    case 'submit': result=await submit(data); break;
    default: throw error('Unknown request');
   }
   return response(result,200,origin);
 }catch(err){
   // No personal data, auth tokens, uploads or request bodies in logs.
   const code=Number.isInteger(err?.code)&&err.code>=400&&err.code<=599?err.code:500;
   const message=code===500?'Unable to complete this request. Please try again.':
     (typeof err?.message==='string'?err.message:
       typeof err?.error==='string'?err.error:'Request could not be completed');
   return response({error:message},code,origin);
 }
});
