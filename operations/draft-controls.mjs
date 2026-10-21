import {loadDraft,saveDraft,draftHistory,readDraftVersion,acceptDraftVersion} from './secure-drafts.mjs?v=2';
import {draftId,revision,changed,clean,isDirty,hasUnsaved,assertCurrent} from './draft-state.mjs';

const checked=new Set(),statuses=new Map();let busy=false;
const labels={'rota':'Rota','van-allocation':'Van allocation','payment-tracker':'Payment tracker','work-summary':'Work hours'};
function element(tag,text,klass){const n=document.createElement(tag);n.textContent=text||'';if(klass)n.className=klass;return n;}
function api(){
  const bridge=window.besaDraftAPI;
  if(!bridge||!bridge.identify||!bridge.snapshot||!bridge.restore)throw new Error('This workspace is still loading. Please retry.');
  return bridge;
}
const bar=element('section',null,'besa-draft-bar');
const title=element('span','Secure drafts · Admin only','besa-draft-heading');
const message=element('span','','besa-draft-message');
message.setAttribute('role','status');message.setAttribute('aria-live','polite');
const loadBtn=element('button','Load saved','besa-draft-button');
const saveBtn=element('button','Save securely','besa-draft-button besa-draft-save');
const historyBtn=element('button','Version history','besa-draft-button');
bar.append(title,loadBtn,saveBtn,historyBtn,message);
function report(text,isError=false,identity=api().identify()){
  statuses.set(draftId(identity),{text,isError});refresh();
}
function refresh(){
  if(!window.besaDraftAPI)return;
  const identity=api().identify(),id=draftId(identity),status=statuses.get(id);
  title.textContent=labels[identity.workspace]+(identity.key==='master'?'':' · '+new Date(identity.key+'T00:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC'}));
  message.textContent=(isDirty(identity)?'Unsaved changes. ':'')+(status?.text||'Load saved to check the latest secure version before saving.');
  message.classList.toggle('error',status?.isError||false);
  for(const b of [loadBtn,historyBtn])b.disabled=busy;
  saveBtn.disabled=busy||!checked.has(id);
}
async function run(task){
  const bridge=api(),identity=bridge.identify(),expected=revision(identity);
  busy=true;refresh();
  try{await task(bridge,identity,expected);}
  catch(error){report(error.message||'Operation failed. Your current draft remains untouched.',true,identity);}
  finally{busy=false;refresh();}
}
loadBtn.addEventListener('click',()=>run(async(bridge,identity,expected)=>{
  const result=await loadDraft(identity.workspace,identity.key,{remember:false});
  assertCurrent(bridge,identity,expected);
  if(result.payload){
    if(!window.confirm('Load saved version '+result.version+' from '+new Date(result.updated_at).toLocaleString('en-GB')+'? This replaces this workspace’s browser draft. Export first if needed.'))return;
    assertCurrent(bridge,identity,expected);bridge.restore(result.payload);clean(identity);
  }
  acceptDraftVersion(identity.workspace,identity.key,result.version);checked.add(draftId(identity));
  report(result.payload?'Loaded secure version '+result.version+'.':'No saved draft exists. You can save this draft securely.',false,identity);
}));
saveBtn.addEventListener('click',()=>run(async(bridge,identity,expected)=>{
  const payload=structuredClone(bridge.snapshot());
  if(!window.confirm('Save this '+identity.workspace+' draft securely? This does not issue a payment or update the source spreadsheet.'))return;
  const result=await saveDraft(identity.workspace,identity.key,payload);
  clean(identity,expected);
  report('Secure version '+result.version+' saved.'+(revision(identity)!==expected?' More recent edits still need saving.':''),false,identity);
}));
historyBtn.addEventListener('click',()=>run(async(bridge,identity,expected)=>{
  const {workspace,key}=identity,versions=await draftHistory(workspace,key);
  assertCurrent(bridge,identity,expected);
  if(!versions.length){report('No stored versions for this workspace yet.',false,identity);return;}
  const overview=versions.map(v=>'v'+v.version+' ('+new Date(v.change_at).toLocaleString('en-GB')+')').join('\n');
  const entered=window.prompt('Saved versions for '+workspace+'/'+key+':\n'+overview+'\n\nEnter a version to recover into this browser. Cancel keeps your draft.');
  if(entered===null||!entered.trim())return;
  const version=Number(entered.trim());
  if(!Number.isSafeInteger(version)||!versions.some(v=>v.version===version))throw new Error('Choose a listed version number. Nothing was changed.');
  if(!window.confirm('Recover version '+version+'? Unsaved browser edits will be replaced. The latest secure version stays unchanged until you save.'))return;
  const earlier=await readDraftVersion(workspace,key,version);
  const current=await loadDraft(workspace,key,{remember:false});
  assertCurrent(bridge,identity,expected);bridge.restore(earlier.payload);
  acceptDraftVersion(workspace,key,current.version);
  checked.add(draftId(identity));changed(identity);
  report('Recovered v'+version+'. Review and save to create a new secure version.',false,identity);
}));
function mount(){
  if(document.getElementById('besa-draft-bar'))return;
  bar.id='besa-draft-bar';document.querySelector('.operation-tabs,.tracker-nav')?.after(bar);refresh();
}
for(const event of ['besa:draft-state','besa:draft-context','hashchange'])window.addEventListener(event,refresh);
window.addEventListener('beforeunload',event=>{if(hasUnsaved()){event.preventDefault();event.returnValue='';}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
