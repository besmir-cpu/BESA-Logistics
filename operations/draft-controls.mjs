import {loadDraft,saveDraft,draftHistory,readDraftVersion} from './secure-drafts.mjs';

// Reusable action bar for protected draft snapshots. No automatic uploading:
// staff must choose Load and then Save. Auth + RLS are checked each time.
function element(tag,text,klass){
  const n=document.createElement(tag);
  n.textContent=text||'';
  if(klass)n.className=klass;
  return n;
}
function api(){
  const bridge=window.besaDraftAPI;
  if(!bridge||typeof bridge.identify!=='function'||
     typeof bridge.snapshot!=='function'||typeof bridge.restore!=='function')
    throw new Error('This workspace is still loading. Please retry.');
  return bridge;
}
const bar=element('section',null,'besa-draft-bar');
const title=element('span','Secure drafts · Admin only','besa-draft-heading');
const message=element('span','Secure saving requires reviewed database setup. Current edits stay local.','besa-draft-message');
message.setAttribute('role','status');message.setAttribute('aria-live','polite');
const loadBtn=element('button','Load saved','besa-draft-button');
const saveBtn=element('button','Save securely','besa-draft-button besa-draft-save');
const historyBtn=element('button','Version history','besa-draft-button');
bar.append(title,loadBtn,saveBtn,historyBtn,message);
function report(text,isError=false){
  message.textContent=text;message.classList.toggle('error',isError);
}
async function run(button,task){
  for(const b of [loadBtn,saveBtn,historyBtn])b.disabled=true;
  try{await task();}
  catch(error){report(error.message||'Operation failed. Your current draft remains untouched.',true);}
  finally{for(const b of [loadBtn,saveBtn,historyBtn])b.disabled=false;}
}
loadBtn.addEventListener('click',()=>run(loadBtn,async()=>{
  const {workspace,key}=api().identify();
  const result=await loadDraft(workspace,key);
  if(!result.payload){report('No saved draft exists for '+workspace+' / '+key+'. You can now save a new version.');return;}
  const confirmed=window.confirm('A saved '+workspace+' draft (version '+result.version+') exists from '+
    new Date(result.updated_at).toLocaleString('en-GB')+
    '. Replace the current unsaved screen with that version? Export a CSV first if needed.');
  if(!confirmed){report('Saved version found. Current edits were not changed.');return;}
  api().restore(result.payload);
  report('Loaded secure saved version '+result.version+'. Check the figures against the original before using.');
}));
saveBtn.addEventListener('click',()=>run(saveBtn,async()=>{
  const bridge=api(),{workspace,key}=bridge.identify();
  if(!window.confirm('Save the current '+workspace+' draft securely? This stores an office DRAFT, not a live payment, invoice or Google Sheet update.'))return;
  const payload=bridge.snapshot();
  const result=await saveDraft(workspace,key,payload);
  report('Saved secure draft version '+result.version+'. History is retained; no operational posting occurred.');
}));
historyBtn.addEventListener('click',()=>run(historyBtn,async()=>{
  const {workspace,key}=api().identify();
  const versions=await draftHistory(workspace,key);
  if(!versions.length){report('No stored versions for this workspace yet.');return;}
  const newest=versions[0];
  const overview=versions.map(v=>'v'+v.version+' ('+new Date(v.change_at).toLocaleString('en-GB')+')').join(', ');
  const entered=window.prompt('Saved versions for '+workspace+'/'+key+':\\n'+overview+
    '\\n\\nEnter a version number to RESTORE INTO THIS BROWSER, or Cancel to keep the current draft.');
  if(entered===null||entered.trim()===''){
    report(versions.length+' saved version(s); latest v'+newest.version+'. No draft was changed.');
    return;
  }
  const version=Number(entered.trim());
  if(!Number.isSafeInteger(version)||!versions.some(v=>v.version===version))
    throw new Error('Choose a listed version number. Nothing was changed.');
  if(!window.confirm('Load version '+version+' into this screen? Unsaved browser changes will be replaced. Export first if you need them. This does NOT overwrite the latest saved version yet.'))return;
  const earlier=await readDraftVersion(workspace,key,version);
  // Record the CURRENT version for conflict-safe re-saving. This does not
  // replace the screen until the chosen historical payload is validated.
  await loadDraft(workspace,key);
  api().restore(earlier.payload);
  report('Recovered historical v'+version+' into this browser. Review and choose Save securely to create a NEW current version.');
}));
function mount(){
  if(document.getElementById('besa-draft-bar'))return;
  bar.id='besa-draft-bar';
  const target=document.querySelector('.operation-tabs,.tracker-nav');
  if(target)target.after(bar);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
