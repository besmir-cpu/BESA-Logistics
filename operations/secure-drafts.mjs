// Secure draft transport. No localStorage of drivers, schedules or payments.
// Explicit Load => explicit Save. Server enforces administrator RLS and
// compare-and-swap versioning. No financial posting or system-of-record writes.
let loadPromise;
let sessionOwner;
const knownVersions=new Map();
function injectScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.async=true;
    script.onload=resolve;
    script.onerror=()=>reject(new Error('Could not load the secure connection. Check your internet connection.'));
    document.head.append(script);
  });
}
export async function secureClient(){
  if(window.besaClient)return window.besaClient;
  if(!loadPromise){
    loadPromise=(async()=>{
      if(!window.supabase)
        await injectScript('vendor/supabase.js');
      await injectScript('config.js?v=freeze-page-4');
      if(!window.besaClient)throw new Error('Secure connection unavailable.');
      return window.besaClient;
    })().catch(error=>{loadPromise=undefined;throw error;});
  }
  return loadPromise;
}
async function authenticated(){
  const client=await secureClient();
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  if(!data.session?.user)throw new Error('Sign into the BESA dashboard as an administrator first, then return here.');
  if(sessionOwner!==data.session.user.id){knownVersions.clear();sessionOwner=data.session.user.id;}
  // The database independently checks administrator membership on every read/write.
  const {data:admin,error:adminError}=await client.from('besa_admins')
    .select('email').eq('email',String(data.session.user.email||'').toLowerCase()).limit(1);
  if(adminError||!admin?.length)throw new Error('Administrator access is required.');
  const {data:assurance,error:mfaError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(mfaError||assurance?.currentLevel!=='aal2')throw new Error('Complete two-step verification in the main BESA dashboard, then return here.');
  return client;
}
function keyFor(workspace,key){
  if(!['rota','van-allocation','payment-tracker','work-summary'].includes(workspace)||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(key))throw new Error('Invalid saved draft key.');
  return workspace+':'+key;
}
export class DraftConflict extends Error{
  constructor(version){
    super('Another editor saved a newer version ('+version+'). Your changes have NOT been overwritten. Export a CSV before reloading.');
    this.name='DraftConflict';
    this.version=version;
  }
}
export async function loadDraft(workspace,key,{remember=true}={}){
  const ident=keyFor(workspace,key),client=await authenticated();
  const {data,error}=await client.from('besa_workspace_drafts')
    .select('payload,version,updated_at,updated_by')
    .eq('workspace',workspace).eq('workspace_key',key).maybeSingle();
  if(error)throw new Error(/42P01|PGRST205/.test(error.code||'')
    ?'Secure draft storage has not been installed yet; no data was loaded.'
    :'Could not read private saved draft: '+error.message);
  if(remember)knownVersions.set(ident,data?.version??0);
  return data??{payload:null,version:0,updated_at:null};
}
export async function saveDraft(workspace,key,payload){
  const ident=keyFor(workspace,key);
  const client=await authenticated();
  if(!knownVersions.has(ident))
    throw new Error('Choose “Load saved draft” once before your first secure save, to prevent overwriting someone else’s work.');
  if(payload===null||Array.isArray(payload)||typeof payload!=='object')
    throw new Error('Draft payload must be a structured object.');
  const raw=JSON.stringify(payload);
  if(raw.length>1700000)throw new Error('This draft is too large. Export it and ask for a larger storage plan.');
  const {data,error}=await client.rpc('besa_save_workspace_draft',{
    p_workspace:workspace,p_key:key,p_payload:payload,
    p_expected_version:knownVersions.get(ident)
  });
  if(error)throw new Error(/42883|PGRST202/.test(error.code||'')
    ?'Secure draft saving has not been enabled by an administrator.'
    :'Secure save failed: '+error.message);
  const result=Array.isArray(data)?data[0]:data;
  if(!result)throw new Error('The database did not confirm a save. Do not close the page.');
  if(result.conflict||!result.saved)throw new DraftConflict(result.current_version);
  knownVersions.set(ident,result.current_version);
  return {version:result.current_version};
}
export async function draftHistory(workspace,key){
  keyFor(workspace,key);
  const client=await authenticated();
  const {data,error}=await client.from('besa_workspace_draft_history')
    .select('version,change_at,changed_by')
    .eq('workspace',workspace).eq('workspace_key',key)
    .order('version',{ascending:false}).limit(25);
  if(error)throw new Error('Could not read version history: '+error.message);
  return data||[];
}
export async function readDraftVersion(workspace,key,version){
  keyFor(workspace,key);
  if(!Number.isSafeInteger(version)||version<1)
    throw new Error('Choose a valid positive version number.');
  const client=await authenticated();
  const {data,error}=await client.from('besa_workspace_draft_history')
    .select('payload,version,change_at')
    .eq('workspace',workspace).eq('workspace_key',key)
    .eq('version',version).maybeSingle();
  if(error)throw new Error('Could not read the saved version: '+error.message);
  if(!data)throw new Error('That version was not found. Your current draft remains unchanged.');
  return data;
}
export function clearDraftSession(){knownVersions.clear();sessionOwner=undefined;}
export function acceptDraftVersion(workspace,key,version){
  if(!Number.isSafeInteger(version)||version<0)throw new Error('Invalid draft version.');
  knownVersions.set(keyFor(workspace,key),version);
}

// Read only existing register fields. This never schedules a driver, allocates
// a van, or changes official account/vehicle status.
export async function loadPlanningRegister(kind){
  if(!['drivers','vehicles'].includes(kind))throw new Error('Unknown register.');
  const client=await authenticated(),rows=[];
  const table=kind==='drivers'?'besa_drivers':'besa_vehicles';
  const fields=kind==='drivers'?'id,first_name,last_name,status':'id,registration,status,tracker_snapshot';
  for(let offset=0;offset<5000;offset+=500){
    const {data,error}=await client.from(table).select(fields).order('id').range(offset,offset+499);
    if(error)throw new Error('Could not read your '+kind+' register: '+error.message);
    rows.push(...(data||[]));if((data||[]).length<500)break;
  }
  return rows.filter(row=>kind==='drivers'?['Active','Onboarding'].includes(row.status):row.status!=='Archived');
}
