import {
  RECRUITMENT_HEADERS, ONBOARDING_HEADERS, STAGES, EDIT_FIELDS,
  cleanText, normalizedEmail, normalizedPhone, normalizedName, findMergeIndex,
  stageFromSource, sourceYes, countProgress, displayCsvSafe, safeStage
} from './rules.mjs';

// Recruitment office: admin-authenticated view of current 'Onboarding'
// driver records and private, in-memory imports. Deliberately no mutation API.
const $=id=>document.getElementById(id);
const state={user:null,verified:false,records:[],editing:null,seq:0,generation:0,authGeneration:0,importedRecruitment:false,importedOnboarding:false};
const FIELDS={
  name:'rec-name',phone:'rec-phone',email:'rec-email',stage:'rec-stage',status:'rec-status',
  requirements:'rec-requirements',sam1:'rec-sam1',amazon:'rec-amazon',dbs:'rec-dbs',
  amiigo:'rec-amiigo',sam2:'rec-sam2',notes:'rec-notes',ctdate:'rec-ctdate',
  week:'rec-week',day:'rec-day',vendor:'rec-vendor',ctdone:'rec-ctdone',samOn:'rec-sam-on',
  dvla:'rec-dvla',ra1:'rec-ra1',ra2:'rec-ra2',radone:'rec-radone',active:'rec-active',
  hs:'rec-hs',flags:'rec-flags',transporter:'rec-transporter',onboardNotes:'rec-onboard-notes'
};
const SOURCE_REC=['name','phone','requirements','sam1','amazon','dbs','amiigo','sam2','notes','status'];
const SOURCE_ON=['email','phone','name','ctdate','day','week','vendor','ctdone','samOn','dvla',
  'ra1','ra2','radone','active','onboardNotes','flags','transporter','hs'];
const CHECKS=['requirements','sam1','amazon','dbs','sam2'];
const TRAINING=['amiigo','ctdone'];
const RIDEALONG=['radone'];
const MAX_MB=20;

function node(tag,text,klass){
  const n=document.createElement(tag);
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(klass)n.className=klass;
  return n;
}
function status(text,error=false){
  const target=$('recruit-status');
  target.textContent=text;target.classList.toggle('error',error);
}
function createNew(name=''){
  return {id:'local-'+(++state.seq),name,source:[],stage:'Applicant',localChanges:false};
}
function normaliseRec(record){
  for(const field of EDIT_FIELDS){
    if(field==='stage')record.stage=safeStage(record.stage);
    else record[field]=cleanText(record[field],field.endsWith('Notes')||field==='notes'?1000:150);
  }
  record.name=cleanText(record.name,120);
  record.phone=cleanText(record.phone,35);
  record.email=normalizedEmail(record.email);
  return record;
}
function displayName(row){return cleanText(row.name,120)||'Unnamed driver'}
function sortRecords(){
  state.records.sort((a,b)=>displayName(a).localeCompare(displayName(b),'en-GB',{numeric:true,sensitivity:'base'}));
}
function display(){
  if(!state.verified)return;
  sortRecords();
  const filter=$('recruit-filter').value,query=$('recruit-search').value.trim().toLowerCase();
  const visible=state.records.filter(row=>(!filter||row.stage===filter)&&(!query||
    [row.name,row.phone,row.email].some(val=>String(val||'').toLowerCase().includes(query))));
  $('recruit-count-all').textContent=String(state.records.length);
  $('recruit-count-invited').textContent=String(state.records.filter(r=>r.stage==='Invited'||r.stage==='Screening').length);
  $('recruit-count-checks').textContent=String(state.records.filter(r=>r.stage==='Training'||r.stage==='Screening').length);
  $('recruit-count-ridealong').textContent=String(state.records.filter(r=>r.stage==='Ridealong').length);
  $('recruit-count-active').textContent=String(state.records.filter(r=>r.stage==='Active').length);
  const shown=visible.slice(0,250);
  $('recruit-summary').textContent=(visible.length>250?'Showing first 250 of '+visible.length+' matching':'Showing '+visible.length+' matching')+
    ' of '+state.records.length+' applicants · '+(state.importedRecruitment?'Recruitment imported':'Recruitment not imported')+
    ' · '+(state.importedOnboarding?'Onboarding imported':'Onboarding not imported')+
    (visible.length>250?' · Use search to narrow results':'');
  const body=$('recruit-rows');body.replaceChildren();
  for(const r of shown){
    const tr=node('tr');
    const name=node('td');name.append(node('strong',displayName(r)));
    const provenance=(r.source||[]).join(', ')||'Local draft';
    name.append(node('span',(r.email||r.phone||'No contact recorded')+' · '+provenance));
    tr.append(name,node('td',r.status||'—'));
    for(const group of [CHECKS,TRAINING,RIDEALONG]){
      const progress=countProgress(r,group);
      const td=node('td');
      const displayProgress=node('span',progress.done+'/'+progress.total,'recruit-progress');
      const bar=node('i');bar.style.setProperty('--progress',Math.round(progress.done*100/progress.total)+'%');
      displayProgress.append(bar);
      td.append(displayProgress);tr.append(td);
    }
    const stage=node('td');stage.append(node('span',r.stage||'Applicant','recruit-stage '+String(r.stage||'Applicant').replace(/\s+/g,'-')));
    tr.append(stage);
    const actions=node('td');
    const btn=node('button','View / edit','recruit-edit');btn.type='button';btn.dataset.editId=r.id;
    actions.append(btn);tr.append(actions);body.append(tr);
  }
  $('recruit-empty').hidden=visible.length>0;
}
function openEditor(id){
  if(!state.verified)return;
  const found=id?state.records.find(r=>r.id===id):null;
  state.editing=found?.id||null;
  const model=found||createNew();
  // A newly drafted row is NOT added to the list until the form is saved.
  $('recruit-editor-title').textContent=found?'Driver profile · '+displayName(found):'Add candidate';
  for(const [field,elementId] of Object.entries(FIELDS)){
    const elem=$(elementId);elem.value=field==='stage'?safeStage(model.stage):model[field]||'';
  }
  $('recruit-delete').hidden=Boolean(found?.source?.includes('Existing drivers'));
  $('recruit-delete').disabled=!found;
  $('recruit-editor').showModal();
}
function saveDraft(event){
  event.preventDefault();
  if(!state.verified)return;
  const previous=state.editing?state.records.find(r=>r.id===state.editing):null;
  const model=previous?{...previous}:createNew();
  for(const [field,elementId] of Object.entries(FIELDS))model[field]=$(elementId).value;
  normaliseRec(model);
  if(!model.name){status('Enter the driver name.',true);return;}
  if(model.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(model.email)){
    status('Enter a valid email or leave it blank.',true);return;
  }
  // Do not overwrite a separate driver's record if an existing name conflicts.
  const duplicate=state.records.some(r=>r.id!==model.id&&
    ((model.email&&r.email&&normalizedEmail(r.email)===model.email)||
     (normalizedPhone(model.phone)&&normalizedPhone(r.phone)===normalizedPhone(model.phone))));
  if(duplicate){status('This email or UK phone is already used by another record. Review before editing.',true);return;}
  model.localChanges=true;model.source=[...new Set([...(model.source||[]),'Local edits'])];
  if(previous)Object.assign(previous,model);
  else state.records.push(model);
  $('recruit-editor').close();state.editing=null;
  display();
  status('Updated the local draft for '+model.name+'. No invitation has been sent and nothing was saved to the database.');
}
function removeLocal(){
  if(!state.verified)return;
  const row=state.records.find(r=>r.id===state.editing);
  if(!row||row.source?.includes('Existing drivers')){
    status('Existing driver records cannot be removed from this workspace.',true);return;
  }
  if(!window.confirm('Remove this candidate from the current browser draft?'))return;
  state.records=state.records.filter(r=>r.id!==row.id);
  $('recruit-editor').close();state.editing=null;display();
  status('Removed from this browser draft only.');
}
function fromCell(value){
  if(value==null)return '';
  if(value instanceof Date)return value;
  if(typeof value==='object'){
    if('result'in value)return fromCell(value.result);
    if('text'in value)return value.text;
    if(Array.isArray(value.richText))return value.richText.map(x=>x.text).join('');
  }
  return value;
}
function sourceDate(value){
  const v=fromCell(value);
  if(v instanceof Date){
    return v.toISOString().slice(0,10);
  }
  if(typeof v==='number'&&v>=25000&&v<=90000){
    return new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000).toISOString().slice(0,10);
  }
  const text=cleanText(v,35);
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if(m){
    const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
    const d=new Date(Date.UTC(year,month-1,day));
    if(d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day)return d.toISOString().slice(0,10);
  }
  const d=/^\d{4}-\d{2}-\d{2}$/.test(text)?new Date(text+'T00:00:00Z'):null;
  if(d&&!Number.isNaN(d.getTime())&&d.toISOString().startsWith(text))return text;
  return '';
}
function readSheet(workbook,expected){
  const sheet=workbook.getWorksheet(expected)||workbook.worksheets.find(s=>s.name.trim().toLowerCase()===expected.toLowerCase());
  if(!sheet)throw new Error('Expected worksheet "'+expected+'" was not found.');
  const columns=expected==='Driver Recruitment Tracker'?RECRUITMENT_HEADERS:ONBOARDING_HEADERS;
  const titles=columns.map((_,idx)=>cleanText(fromCell(sheet.getRow(1).getCell(idx+1).value),100));
  if(titles[0]!==columns[0]||titles[columns.length-1]!==columns[columns.length-1])
    throw new Error('Worksheet columns do not match the BESA '+expected+' tracker.');
  const mapped=[];
  for(let r=2;r<=Math.min(sheet.rowCount,6500);r++){
    const cells=columns.map((_,i)=>fromCell(sheet.getRow(r).getCell(i+1).value));
    const map={};
    const fields=expected==='Driver Recruitment Tracker'?SOURCE_REC:SOURCE_ON;
    for(let i=0;i<fields.length;i++){
      const field=fields[i];
      map[field]=['ctdate','ra1','ra2'].includes(field)?sourceDate(cells[i]):cleanText(cells[i],field.endsWith('Notes')||field==='notes'?1000:150);
    }
    if(!map.name)continue;
    mapped.push(map);
  }
  return mapped;
}
function mergeRows(incoming,sourceName){
  let added=0,updated=0,ambiguous=0;
  for(const raw of incoming){
    const item=normaliseRec({...raw,stage:stageFromSource(raw)});
    const found=findMergeIndex(state.records,item);
    if(found.index>=0){
      const current=state.records[found.index];
      // Never overwrite manually edited values. Never drop a field just because
      // an imported sheet has it blank. Preserve existing source references.
      for(const field of EDIT_FIELDS){
        if(field==='stage')continue;
        if(item[field]&&!current.localChanges)current[field]=item[field];
        else if(item[field]&&!current[field])current[field]=item[field];
      }
      if(!current.localChanges){
        const newly=stageFromSource(current);
        // Do not downgrade active records to earlier stages.
        const ranking=STAGES.indexOf(newly),existing=STAGES.indexOf(current.stage);
        if(ranking>existing&&current.stage!=='On hold')current.stage=newly;
      }
      current.source=[...new Set([...(current.source||[]),sourceName])];
      updated++;
    }else{
      const record={...item,id:'import-'+(++state.seq),source:[sourceName],localChanges:false};
      if(found.reason.startsWith('ambiguous')||found.reason.startsWith('conflicting')){
        record.review='Possible duplicate: '+found.reason;ambiguous++;
      }
      state.records.push(record);added++;
    }
  }
  display();
  return {added,updated,ambiguous};
}
async function importWorkbook(file,type){
  if(!state.verified)return;
  const authAttempt=state.authGeneration,originalUser=state.user?.id;
  if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Download the Google Sheet as a Microsoft Excel (.xlsx) file.');
  if(file.size>MAX_MB*1024*1024)throw new Error('The import must be smaller than 20 MB.');
  if(!window.ExcelJS)throw new Error('Excel importer did not load. Refresh the page.');
  const workbook=new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheetName=type==='recruitment'?'Driver Recruitment Tracker':'Onboarding DA tracker';
  const sourceName=type==='recruitment'?'Recruitment tracker':'Onboarding tracker';
  const rows=readSheet(workbook,sheetName);
  if(!state.verified||authAttempt!==state.authGeneration||state.user?.id!==originalUser)return;
  if(!rows.length)throw new Error('The '+sheetName+' sheet contains no readable driver rows.');
  const result=mergeRows(rows,sourceName);
  if(type==='recruitment')state.importedRecruitment=true;
  else state.importedOnboarding=true;
  status('Read '+rows.length+' records from '+sheetName+'. '+result.added+' added, '+result.updated+
    ' combined; '+result.ambiguous+' possible duplicate(s) kept separate for review. All data remains in this browser tab.');
}
function exportDraft(){
  if(!state.verified||!state.records.length){status('No records to export.');return;}
  const labels=['Driver','Phone','Email','Stage','Recruitment status',...EDIT_FIELDS.filter(x=>!['name','phone','email','stage','status'].includes(x)),'Source','Matching review'];
  const fields=['name','phone','email','stage','status',...EDIT_FIELDS.filter(x=>!['name','phone','email','stage','status'].includes(x))];
  const rows=[labels,...state.records.map(r=>[...fields.map(f=>r[f]||''),(r.source||[]).join('; '),r.review||''])];
  const csv='\uFEFF'+rows.map(row=>row.map(displayCsvSafe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='BESA-RECRUITMENT-ONBOARDING-LOCAL-DRAFT.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  status('Local CSV downloaded. It contains candidate contact details: store it securely. No source sheet was changed.');
}
async function allExistingOnboarding(){
  let combined=[];
  for(let from=0;from<5000;from+=500){
    const {data,error}=await window.besaClient.from('besa_drivers')
      .select('id,first_name,last_name,email,phone,status')
      .eq('status','Onboarding').order('id').range(from,from+499);
    if(error)throw error;
    combined.push(...data);
    if(data.length<500)break;
  }
  return combined;
}
async function refreshExisting(){
  if(!state.user||!state.verified)return;
  const current=++state.generation;
  try{
    const drivers=await allExistingOnboarding();
    if(current!==state.generation)return;
    let added=0,updated=0;
    for(const d of drivers){
      const incoming={name:cleanText([d.first_name,d.last_name].filter(Boolean).join(' '),120),
        email:normalizedEmail(d.email),phone:cleanText(d.phone,35)};
      if(!incoming.name)continue;
      const existing=state.records.findIndex(r=>r.registerId===d.id);
      const match=existing>=0?{index:existing,reason:'driver ID'}:findMergeIndex(state.records,incoming);
      if(match.index>=0){
        const row=state.records[match.index];
        row.registerId=d.id;row.source=[...new Set([...(row.source||[]),'Existing drivers'])];
        if(!row.email)row.email=incoming.email;
        if(!row.phone)row.phone=incoming.phone;
        updated++;
      } else {
        const row=createNew(incoming.name);
        row.email=incoming.email;row.phone=incoming.phone;
        row.stage='Invited'; // queue view only: NOT a verified invite event.
        row.status='Onboarding (existing driver register)';
        row.registerId=d.id;row.source=['Existing drivers'];
        row.inviteVerified=false;
        if(match.reason.startsWith('ambiguous')||match.reason.startsWith('conflicting'))row.review=match.reason;
        state.records.push(row);added++;
      }
    }
    display();
    status('Loaded '+drivers.length+' existing drivers marked Onboarding ('+added+' new to this view). Invitations have NOT been verified.');
  }catch(error){
    status('Could not load existing Onboarding drivers: '+(error.message||'Unknown error')+'. Imports and draft changes remain available.',true);
  }
}
function locked(message){
  state.verified=false;state.records=[];state.editing=null;
  state.importedRecruitment=false;state.importedOnboarding=false;
  ++state.generation;++state.authGeneration;
  if($('recruit-editor').open)$('recruit-editor').close();
  $('recruit-rows').replaceChildren();
  $('recruit-summary').textContent='Administrator sign-in required.';
  for(const elem of Object.values(FIELDS))$(elem).value='';
  $('recruit-locked').hidden=false;$('recruit-workspace').hidden=true;
  $('recruit-lock-status').textContent=message;
}
async function authorize(session){
  const next=session?.user||null;
  if(!next){
    state.user=null;locked('Administrator sign-in required. Open the BESA dashboard and sign in first.');
    return;
  }
  if(state.user?.id===next.id&&state.verified)return;
  if(state.user?.id&&state.user.id!==next.id){
    state.records=[];state.editing=null;
    state.importedRecruitment=false;state.importedOnboarding=false;
  }
  state.user=next;
  const attempt=++state.authGeneration;
  try{
    const {data,error}=await window.besaClient.from('besa_admins').select('email').eq('email',String(next.email||'').toLowerCase()).limit(1);
    if(attempt!==state.authGeneration||state.user?.id!==next.id)return;
    if(error)throw error;
    if(!data?.length){locked('This account does not have administrator access.');return;}
    state.verified=true;
    $('recruit-locked').hidden=true;$('recruit-workspace').hidden=false;
    await refreshExisting();
  }catch(error){
    if(attempt===state.authGeneration)locked('Unable to verify administrator permission. Please retry from the dashboard.');
  }
}
function setup(){
  if(!window.besaClient){
    locked('The sign-in connection is unavailable. Refresh the page or return to the dashboard.');
    return;
  }
  $('recruit-search').addEventListener('input',display);
  $('recruit-filter').addEventListener('change',display);
  $('recruit-refresh').addEventListener('click',refreshExisting);
  $('recruit-add').addEventListener('click',()=>openEditor(null));
  $('recruit-rows').addEventListener('click',event=>{
    const btn=event.target.closest('button[data-edit-id]');
    if(btn)openEditor(btn.dataset.editId);
  });
  $('recruit-form').addEventListener('submit',saveDraft);
  $('recruit-cancel').addEventListener('click',()=>$('recruit-editor').close());
  $('recruit-cancel-top').addEventListener('click',()=>$('recruit-editor').close());
  $('recruit-delete').addEventListener('click',removeLocal);
  $('recruit-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{status('Reading recruitment workbook locally…');await importWorkbook(file,'recruitment');}
    catch(error){status('Recruitment import: '+(error.message||'Unknown error'),true);}
    finally{event.target.value='';}
  });
  $('onboard-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{status('Reading onboarding workbook locally…');await importWorkbook(file,'onboarding');}
    catch(error){status('Onboarding import: '+(error.message||'Unknown error'),true);}
    finally{event.target.value='';}
  });
  $('recruit-export').addEventListener('click',exportDraft);
  $('recruit-signout').addEventListener('click',async()=>{
    try{await window.besaClient.auth.signOut();}
    catch(error){status('Sign-out failed. Use the dashboard to sign out.',true);}
  });
  window.besaClient.auth.onAuthStateChange((_event,session)=>{
    // Defer Supabase database calls outside auth callback.
    setTimeout(()=>authorize(session),0);
  });
  window.besaClient.auth.getSession().then(({data,error})=>{
    if(error)throw error;
    return authorize(data.session);
  }).catch(()=>locked('Could not check your login. Return to the dashboard.'));
  // When staff keep this tab open, newly created driver records with
  // status 'Onboarding' should appear without asking them to reload.
  setInterval(()=>{
    if(state.verified&&!document.hidden)refreshExisting();
  },120000);
}
setup();
