import {findMergeIndex,sourceYes,cleanText,normalizedPhone,displayCsvSafe} from '../recruitment/rules.mjs';
import {COLUMNS,TRACKER_STATUSES,statusValue,setTaskValue,pillTone,sourceOptions} from './tracker-rules.mjs';
import { loadExcelJS } from '../operations/lazy-excel.mjs';
import {loadCandidatePanel,setupCandidatePanel,clearCandidatePanel} from './candidate-invitations.mjs';

// BESA Drivers & Onboarding. The main dashboard remains the source of truth
// for driver creation/editing. The optional secure checklist/evidence backend
// is enabled ONLY after its reviewed SQL migration has been installed.
const $=id=>document.getElementById(id);
const RECRUIT=[
 ['requirements','Requirements','Eligibility and requirements reviewed'],
 ['sam1','SAM First Part','First SAM registration stage completed'],
 ['amazon','Amazon Account','Amazon account created and checked'],
 ['dbs','Accurate DBS','Background check recorded as completed'],
 ['amiigo','Amiigo Training','Amiigo training completed'],
 ['sam2','Sam 2nd Part','Second SAM registration stage completed']
];
const ONBOARD=[
 ['ctdone','CT completed','Classroom training completed'],
 ['samOn','SAM','SAM onboarding confirmed'],
 ['dvla','DVLA/BGC','DVLA and background checks completed'],
 ['ra1','RA 1','First ridealong completed'],
 ['ra2','RA 2','Second ridealong completed'],
 ['radone','RA Completed','All required ridealongs completed'],
 ['hs','H&S completed','Health and safety completed'],
 ['active','Active','Onboarding active status confirmed; does not activate account']
];
const GROUPS=[['Recruitment tracker',RECRUIT],['Onboarding tracker',ONBOARD]];
const TASKS=[...RECRUIT,...ONBOARD];
const DETAIL_FIELDS=[
 ['licenceType','Driving licence type','select'],
 ['ctDate','Classroom training date','date'],
 ['vendor','Training vendor','text'],
 ['week','Training week','text'],
 ['day','Training day','text'],
 ['ra1Date','RA 1 date','date'],
 ['ra2Date','RA 2 date','date'],
 ['transporter','Transporter ID','text'],
 ['flags','Review flags','text'],
 ['recruitmentNotes','Recruitment notes','textarea'],
 ['onboardingNotes','Onboarding notes','textarea']
];
const DOCS=[
 ['right-to-work','Right to Work','Right to work evidence and checks'],
 ['driving-licence-front','Driving Licence — Front','Private image of licence front'],
 ['driving-licence-back','Driving Licence — Back','Private image of licence back'],
 ['dvla-check','DVLA Check','Licence check evidence'],
 ['proof-of-address','Proof of Address','Address verification evidence'],
 ['kyc-selfie','KYC Selfie','Private identity verification photograph'],
 ['other','Other Document','Other recruitment evidence']
];
const BUCKET='besa-driver-private-evidence';
const state={drivers:[],vehicles:[],checklists:new Map(),pending:new Map(),files:[],profileId:null,
  checklistReady:false,evidenceReady:false,checked:false,rev:0,writeQueue:Promise.resolve(),
  trackerView:'spreadsheet',dirty:new Set()};
const msg=(text,err=false,id='journey-status')=>{
  const n=$(id);if(!n)return;n.textContent=text;n.classList.toggle('error',Boolean(err));
};
function textEl(tag,text,cls){
  const n=document.createElement(tag);
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(cls)n.className=cls;
  return n;
}
const labelName=d=>[d.first_name,d.last_name].filter(Boolean).join(' ')||d.email||'Unnamed driver';
const driver=id=>state.drivers.find(d=>String(d.id)===String(id));
function emptyJourney(){
  return {checklist:{},details:{}};
}
function stored(id){
  if(!state.checklists.has(String(id)))state.checklists.set(String(id),emptyJourney());
  return state.checklists.get(String(id));
}
function percentage(row,keys){
  const completed=keys.filter(([k])=>row.checklist?.[k]===true).length;
  return {completed,total:keys.length};
}
function safeDate(s){
  const str=String(s||'');
  return /^\d{4}-\d{2}-\d{2}$/.test(str)?str:'';
}
function mask(value){
  const s=String(value||'').replace(/\s+/g,'');
  return s.length>4?'•••• '+s.slice(-4):s?'Recorded':'Not recorded';
}
function mode(){
  const el=$('journey-storage-mode');
  el.textContent=state.checklistReady?'Secure checklists enabled':'Checklist changes are local drafts';
  el.classList.toggle('ready',state.checklistReady);
}
function updateCounters(){
  $('journey-all-count').textContent=String(state.drivers.length);
  $('journey-open-count').textContent=String(state.drivers.filter(d=>d.status==='Onboarding').length);
  $('journey-active-count').textContent=String(state.drivers.filter(d=>d.status==='Active').length);
  $('journey-todo-count').textContent='—';
}

// Excel-style recruitment tracker. Uses existing driver IDs — no second register.
function filteredTrackerDrivers(){
  const search=$('driver-search').value.trim().toLocaleLowerCase('en-GB');
  const status=$('driver-filter').value;
  return state.drivers.filter(d=>
    (status?d.status===status:d.status!=='Archived') &&
    (!search||[labelName(d),d.phone,d.email].join(' ').toLocaleLowerCase('en-GB').includes(search))
  ).sort((a,b)=>labelName(a).localeCompare(labelName(b),'en-GB',{sensitivity:'base',numeric:true}));
}
function makeDropdown(id,key,value,choices,name){
  const select=document.createElement('select');
  select.dataset.trackerDriver=String(id);
  select.dataset.trackerField=key;
  select.className='journey-pill-select tone-'+pillTone(value,key);
  select.setAttribute('aria-label',name+' — '+(COLUMNS.find(c=>c.key===key)?.label||'Recruitment status'));
  for(const optionValue of sourceOptions(choices,value)){
    const option=document.createElement('option');
    option.value=optionValue;
    option.textContent=optionValue||'—';
    select.append(option);
  }
  select.value=value||'';
  return select;
}
function renderTracker(){
  const body=$('journey-tracker-body');
  if(!body||!state.drivers.length){
    body?.replaceChildren();
    if($('journey-tracker-count'))$('journey-tracker-count').textContent='0 drivers';
    if($('journey-tracker-empty'))$('journey-tracker-empty').hidden=state.drivers.length!==0;
    return;
  }
  const all=filteredTrackerDrivers(),rows=all.slice(0,750);
  body.replaceChildren();
  $('journey-tracker-count').textContent=rows.length===all.length?
    rows.length+' drivers':('Showing '+rows.length+' of '+all.length+' drivers — narrow your search');
  $('journey-tracker-empty').hidden=all.length!==0;
  const frag=document.createDocumentFragment();
  for(const d of rows){
    const id=String(d.id),record=stored(id);
    const tr=document.createElement('tr');
    tr.dataset.trackerRow=id;
    const nameCell=textEl('td',null,'journey-name-cell');
    const nameBtn=textEl('button',labelName(d),'journey-grid-name');
    nameBtn.type='button';
    nameBtn.dataset.driverProfile=id;
    nameBtn.title='Open full driver profile and documents';
    nameCell.append(nameBtn);
    const phone=textEl('td',d.phone||'—','journey-phone-cell');
    phone.title=d.phone||'No phone recorded';
    tr.append(nameCell,phone);
    for(const col of COLUMNS){
      const cell=textEl('td',null,'journey-pill-cell');
      const value=statusValue(record,col.key);
      cell.append(makeDropdown(id,col.key,value,col.options,labelName(d)));
      tr.append(cell);
    }
    const notesCell=textEl('td',null,'journey-notes-cell');
    const notes=document.createElement('textarea');
    notes.rows=1;
    notes.maxLength=1000;
    notes.placeholder='Add notes…';
    notes.value=record.details?.recruitmentNotes||'';
    notes.setAttribute('aria-label','Recruitment notes for '+labelName(d));
    notes.dataset.trackerDriver=id;
    notes.dataset.trackerField='notes';
    notesCell.append(notes);
    tr.append(notesCell);
    const statusCell=textEl('td',null,'journey-pill-cell journey-final-status');
    const recStatus=record.details?.recruitmentStatus||'';
    statusCell.append(makeDropdown(id,'recruitmentStatus',recStatus,TRACKER_STATUSES,labelName(d)));
    tr.append(statusCell);
    frag.append(tr);
  }
  body.append(frag);
}
function trackerFieldChanged(event){
  const input=event.target.closest('[data-tracker-driver][data-tracker-field]');
  if(!input)return;
  const id=String(input.dataset.trackerDriver);
  if(!driver(id))return;
  const key=input.dataset.trackerField;
  const value=String(input.value||'').trim();
  const record=stored(id);
  if(key==='notes'){
    record.details.recruitmentNotes=value.slice(0,1000);
  }else if(key==='recruitmentStatus'){
    record.details.recruitmentStatus=value.slice(0,90);
  }else{
    try{setTaskValue(record,key,value);}
    catch(error){msg('Invalid recruitment task value.',true);return;}
  }
  if(input.matches('select')){
    input.className='journey-pill-select tone-'+pillTone(value,key);
  }
  if(state.profileId===id){overview();checklist();}
  queueWrite(id);
}
function exportTracker(){
  if(!state.drivers.length){msg('No driver records are loaded to export.',true);return;}
  const rows=[
    ['Driver','Phone Number',...COLUMNS.map(c=>c.label),'Notes','Status'],
    ...filteredTrackerDrivers().map(d=>{
      const r=stored(String(d.id));
      return [labelName(d),d.phone||'',...COLUMNS.map(c=>statusValue(r,c.key)),
        r.details?.recruitmentNotes||'',r.details?.recruitmentStatus||''];
    })
  ];
  const csv='\uFEFF'+rows.map(row=>row.map(displayCsvSafe).join(',')).join('\r\n');
  const link=document.createElement('a');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.href=url;
  link.download='BESA-DRIVER-RECRUITMENT-TRACKER-DRAFT.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  msg('Recruitment tracker exported to CSV. This contains driver contact details — keep it private.');
}
function switchDriverView(name){
  const grid=name!=='drivers';
  state.trackerView=grid?'spreadsheet':'drivers';
  $('journey-tracker-section').hidden=!grid;
  $('journey-driver-list').hidden=grid;
  for(const [id,on] of [['journey-show-tracker',grid],['journey-show-drivers',!grid]]){
    const button=$(id);
    button.classList.toggle('active',on);
    button.setAttribute('aria-pressed',on?'true':'false');
  }
  if(grid)renderTracker();
}

function profileMessage(text,error=false){msg(text,error,'driver-profile-feedback')}
function tabs(selected='overview'){
  for(const button of document.querySelectorAll('[data-journey-tab]')){
    const on=button.dataset.journeyTab===selected;
    button.classList.toggle('active',on);
    button.setAttribute('aria-selected',on?'true':'false');
  }
  for(const pane of ['overview','recruitment','evidence','invitation']){
    $('journey-panel-'+pane).hidden=pane!==selected;
  }
  if(selected==='evidence')void loadEvidence();
  if(selected==='invitation'&&state.profileId&&driver(state.profileId))void loadCandidatePanel(driver(state.profileId));
}
function closeProfile(){
  if($('driver-profile').open)$('driver-profile').close();
  state.profileId=null;
}
function clearSensitive(){
  state.rev++;
  state.drivers=[];state.vehicles=[];state.profileId=null;
  state.checklists.clear();state.pending.clear();state.files=[];state.dirty.clear();
  $('journey-tracker-body').replaceChildren();
  $('journey-tracker-count').textContent='0 drivers';
  state.checklistReady=false;state.evidenceReady=false;state.checked=false;
  state.writeQueue=Promise.resolve();
  closeProfile();
  $('journey-panel-overview').replaceChildren();
  $('journey-panel-recruitment').replaceChildren();
  $('journey-panel-evidence').replaceChildren();
  clearCandidatePanel();
  $('journey-import-results').replaceChildren();
  $('journey-import-panel').hidden=true;
  for(const id of ['journey-recruit-file','journey-onboard-file'])$(id).value='';
  updateCounters();mode();
}
async function probe(){
  const rev=state.rev;
  try{
    const {error}=await window.besaClient.from('besa_driver_journey').select('driver_id').limit(1);
    if(rev!==state.rev)return;
    state.checklistReady=!error;
    if(error&& !['42P01','PGRST205'].includes(error.code))msg('Recruitment checklist is not writable; ask your administrator to check the secure setup.',true);
  }catch{state.checklistReady=false;}
  try{
    const {error}=await window.besaClient.from('besa_driver_evidence').select('id').limit(1);
    if(rev!==state.rev)return;
    state.evidenceReady=!error;
  }catch{state.evidenceReady=false;}
  if(rev===state.rev){
    mode();
    if(state.checklistReady)await loadTrackerChecklists(rev);
    renderTracker();
  }
}
async function loadTrackerChecklists(rev=state.rev){
  if(!state.checklistReady)return;
  try{
    // Only rows for the currently authorised drivers. RLS also restricts access.
    const ids=new Set(state.drivers.map(d=>String(d.id)));
    if(!ids.size)return;
    for(let offset=0;offset<Math.min(state.drivers.length,5000);offset+=500){
      const {data,error}=await window.besaClient.from('besa_driver_journey')
        .select('driver_id,checklist,details')
        .range(offset,offset+499).order('driver_id');
      if(error)throw error;
      if(rev!==state.rev)return;
      for(const record of data||[]){
        const id=String(record.driver_id);
        if(!ids.has(id)||state.dirty.has(id))continue;
        state.checklists.set(id,{
          checklist:record.checklist&&typeof record.checklist==='object'?record.checklist:{},
          details:record.details&&typeof record.details==='object'?record.details:{}
        });
      }
      if((data||[]).length<500)break;
    }
    if(rev===state.rev)renderTracker();
  }catch(error){
    if(rev===state.rev)msg('Could not load saved recruitment progress: '+(error.message||'Unavailable')+'. Check the secure database setup.',true);
  }
}
async function loadChecklist(id){
  const rev=state.rev;
  if(!state.checklistReady)return stored(id);
  try{
    const {data,error}=await window.besaClient.from('besa_driver_journey')
      .select('driver_id,checklist,details').eq('driver_id',String(id)).maybeSingle();
    if(error)throw error;
    if(rev!==state.rev||state.profileId!==String(id))return stored(id);
    if(data){
      state.checklists.set(String(id),{checklist:data.checklist&&typeof data.checklist==='object'?data.checklist:{},
        details:data.details&&typeof data.details==='object'?data.details:{}});
    }
  }catch(error){
    profileMessage('Could not load saved checklist: '+(error.message||'Access error')+'. Changes will not be written unless secure storage is working.',true);
    state.checklistReady=false;mode();
  }
  return stored(id);
}
function queueWrite(id=state.profileId){
  if(!id)return;
  id=String(id);
  state.dirty.add(id);
  const data=stored(id),rev=state.rev;
  if(!state.checklistReady){
    const warning='Local draft only — secure checklist storage has not been installed. Export your tracker before refreshing.';
    if(state.profileId===id)profileMessage(warning);
    else msg(warning);
    return;
  }
  const payload={driver_id:id,checklist:{...data.checklist},details:{...data.details}};
  state.writeQueue=state.writeQueue.catch(()=>{}).then(async()=>{
    if(rev!==state.rev)return;
    const {error}=await window.besaClient.from('besa_driver_journey').upsert(payload,{onConflict:'driver_id'});
    if(error)throw error;
    if(rev===state.rev){
      state.dirty.delete(id);
      if(state.profileId===id)profileMessage('Checklist saved securely for this driver.');
      else msg('Recruitment tracker updated and securely saved for '+labelName(driver(id)||{} )+'.');
    }
  }).catch(error=>{
    if(rev===state.rev){
      const note='Could not save checklist: '+(error?.message||'Unknown error')+'. Export a draft before refreshing.';
      if(state.profileId===id)profileMessage(note,true);
      else msg(note,true);
    }
  });
}
function overview(){
  const d=driver(state.profileId);
  if(!d)return;
  const box=$('journey-panel-overview');box.replaceChildren();
  const grid=textEl('div',null,'journey-overview-grid');
  for(const [label,value] of [
    ['Full name',labelName(d)],['Email',d.email||'Not recorded'],['Phone',d.phone||'Not recorded'],
    ['Driver status',d.status||'Onboarding'],['Delivery partner',d.contract||'Not recorded'],
    ['Assigned vehicle',state.vehicles.find(v=>String(v.id)===String(d.vehicle_id))?.registration||'Unassigned'],
    ['Driving licence number',mask(d.licence_number)],['Licence type',stored(state.profileId).details.licenceType||'Not recorded'],
    ['Licence expiry',d.licence_expiry||'Not recorded'],
    ['Right to work expiry',d.right_to_work_expiry||'Not recorded'],['Start date',d.start_date||'Not recorded'],
    ['Recruitment checklist',state.checklistReady?'Securely saved':'Draft mode'],
    ['Evidence access',state.evidenceReady?'Private document library ready':'Private document setup pending']
  ]){
    const card=textEl('article');
    card.append(textEl('span',label),textEl('strong',value));grid.append(card);
  }
  box.append(grid);
  box.append(textEl('p',
    'Recruitment tasks are linked to this driver profile. Tick each completed item on the Recruitment checklist tab. Use Documents & evidence for secure files once the private document store is configured.',
    'journey-profile-note'));
  if(d.notes)box.append(textEl('p','Driver notes: '+d.notes,'journey-profile-note'));
}
function dateRow(parent,key,label,inputType='text'){
  const row=textEl('label',null,'journey-date-row');
  const title=textEl('span',label);
  const value=stored(state.profileId).details[key]||'';
  const input=document.createElement(inputType==='textarea'?'textarea':inputType==='select'?'select':'input');
  if(inputType!=='textarea'&&inputType!=='select')input.type=inputType;
  if(inputType==='select'){
    for(const [val,title] of [['','Not recorded'],['Auto','Automatic'],['Manual','Manual']]){
      const option=document.createElement('option');option.value=val;option.textContent=title;input.append(option);
    }
  }
  input.value=inputType==='date'?safeDate(value):String(value).slice(0,500);
  if(inputType!=='select')input.maxLength=inputType==='textarea'?500:120;
  input.dataset.detail=key;
  row.append(title,input);parent.append(row);
}
function checklist(){
  const id=state.profileId;if(!id)return;
  const data=stored(id);
  const body=$('journey-panel-recruitment');body.replaceChildren();
  let done=0;
  for(const [heading,keys] of GROUPS){
    const group=textEl('section',null,'journey-group');
    group.append(textEl('h3',heading));
    for(const [key,label,help] of keys){
      const checked=data.checklist[key]===true;
      if(checked)done++;
      const row=textEl('label',null,'journey-item'+(checked?' journey-completed':''));
      const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.dataset.check=key;
      const info=textEl('span',null,'journey-item-info');
      info.append(textEl('strong',label),textEl('small',help));
      const pill=textEl('span',checked?'Completed':'To do',checked?'journey-done':'');
      row.append(input,info,pill);group.append(row);
    }
    if(heading==='Onboarding tracker'){
      const extra=textEl('section',null,'journey-group');
      extra.append(textEl('h3','Dates, vendor & onboarding details'));
      for(const [key,title,kind] of DETAIL_FIELDS)dateRow(extra,key,title,kind);
      body.append(group,extra);
    }else body.append(group);
  }
  const bottom=textEl('div',null,'journey-section-footer');
  bottom.append(textEl('strong',done+' of '+TASKS.length+' tasks completed','journey-checklist-total'));
  const pending=state.pending.get(id);
  if(pending){
    const b=textEl('button','Review/apply imported tracker results','button');
    b.type='button';b.dataset.applyImport=id;bottom.append(b);
  }
  body.append(bottom);
  body.append(textEl('p',
    'These checks reflect your recruitment and onboarding Google trackers. A tick records an office checklist result; it does not independently verify documents, pass a legal check, or change driver employment/activation status.',
    'journey-profile-note warn'));
}
async function openProfile(id){
  const d=driver(id);
  if(!d)return;
  state.profileId=String(id);
  $('driver-profile-title').textContent=labelName(d);
  $('driver-profile-subtitle').textContent=[d.email||'',d.status||''].filter(Boolean).join(' · ');
  $('driver-profile-feedback').textContent='';
  overview();checklist();
  tabs('overview');
  if(!$('driver-profile').open)$('driver-profile').showModal();
  await loadChecklist(String(id));
  if(state.profileId===String(id)){overview();checklist();}
}
function detailsChange(ev){
  if(!state.profileId)return;
  const field=ev.target.dataset.detail;
  const key=ev.target.dataset.check;
  if(key){
    stored(state.profileId).checklist[key]=Boolean(ev.target.checked);
    const recruit=COLUMNS.find(c=>c.key===key);
    if(recruit){
      const value=ev.target.checked?(key==='requirements'?'Yes':'Done'):'Pending';
      setTaskValue(stored(state.profileId),key,value);
      renderTracker();
    }
    checklist();queueWrite();
  }else if(field){
    const original=String(ev.target.value||'').trim().slice(0,500);
    stored(state.profileId).details[field]=field.toLowerCase().endsWith('date')?safeDate(original):original;
    queueWrite();
  }
}
function privateDocsNotice(text,error=false){profileMessage(text,error)}
async function loadEvidence(){
  if(!state.profileId)return;
  const panel=$('journey-panel-evidence');panel.replaceChildren();
  const head=textEl('div',null,'journey-evidence-head');
  head.append(textEl('h3','Documents & evidence'));
  panel.append(head);
  panel.append(textEl('p',
    'Like the SAM evidence screen: documents are grouped under the driver profile. Files are private, and viewing requires an authorised administrator. Existing SAM files are not automatically connected.',
    'journey-profile-note'));
  if(!state.evidenceReady){
    panel.append(textEl('p','Private evidence storage is not configured. Document upload and viewing are disabled until the secure database and storage migration is installed.','journey-evidence-warning'));
    for(const [key,title,help] of DOCS){
      const card=textEl('article',null,'journey-evidence-card');
      card.append(textEl('h4',title),textEl('p',help),textEl('span','Not yet connected'));
      panel.append(card);
    }
    return;
  }
  const id=state.profileId,rev=state.rev;
  try{
    const {data,error}=await window.besaClient.from('besa_driver_evidence')
      .select('id,driver_id,doc_type,file_name,storage_path,created_at')
      .eq('driver_id',id).order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    if(rev!==state.rev||id!==state.profileId)return;
    state.files=data||[];
    const grid=textEl('div',null,'journey-evidence-grid');
    for(const [key,title,description] of DOCS){
      const card=textEl('article',null,'journey-evidence-card');
      card.append(textEl('h4',title),textEl('p',description));
      const files=state.files.filter(f=>f.doc_type===key);
      if(!files.length)card.append(textEl('span','No document uploaded'));
      for(const file of files){
        const el=textEl('div',null,'journey-evidence-file');
        el.append(textEl('span',file.file_name||'Document'));
        const btn=textEl('button','Secure view');btn.type='button';btn.dataset.evidence=file.id;
        el.append(btn);card.append(el);
      }
      grid.append(card);
    }
    panel.append(grid);
    const form=textEl('div',null,'journey-upload-grid');
    const typeLabel=textEl('label','Document type');
    const select=document.createElement('select');select.id='journey-upload-type';
    for(const [key,title] of DOCS){const option=document.createElement('option');option.value=key;option.textContent=title;select.append(option);}
    typeLabel.append(select);
    const fileLabel=textEl('label','Private PDF or image (maximum 8 MB)');
    const file=document.createElement('input');file.id='journey-upload-file';file.type='file';
    file.accept='.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/jpeg,image/png,image/webp';
    fileLabel.append(file);
    const btn=textEl('button','Upload evidence','button primary');btn.type='button';btn.id='journey-upload-button';
    form.append(typeLabel,fileLabel,btn);panel.append(form);
    panel.append(textEl('p','Only authorised administrators can upload and access this private evidence. No document is committed to GitHub or publicly linked.','journey-evidence-warning'));
  }catch(error){
    panel.append(textEl('p','Could not read private evidence: '+(error.message||'Access denied'),'journey-evidence-warning'));
  }
}
async function uploadEvidence(){
  if(!state.profileId||!state.evidenceReady)return;
  const id=state.profileId,file=$('journey-upload-file')?.files?.[0],type=$('journey-upload-type')?.value;
  if(!file){privateDocsNotice('Choose an image or PDF to upload.',true);return;}
  const types=['application/pdf','image/jpeg','image/png','image/webp'];
  if(!types.includes(file.type)||file.size>8*1024*1024||!file.size){
    privateDocsNotice('Use a PDF, PNG, JPG or WEBP file under 8 MB.',true);return;
  }
  if(!DOCS.some(x=>x[0]===type))return;
  const ext={ 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type];
  const objectPath=id+'/'+type+'/'+crypto.randomUUID()+'.'+ext;
  const button=$('journey-upload-button');button.disabled=true;
  const rev=state.rev;
  try{
    const {error:upErr}=await window.besaClient.storage.from(BUCKET).upload(objectPath,file,{
      contentType:file.type,upsert:false,cacheControl:'0'
    });
    if(upErr)throw upErr;
    const name=String(file.name).replace(/[\u0000-\u001f]/g,'').slice(0,140);
    const {error:dbErr}=await window.besaClient.from('besa_driver_evidence').insert({
      driver_id:id,doc_type:type,file_name:name,storage_path:objectPath,mime_type:file.type
    });
    if(dbErr){
      await window.besaClient.storage.from(BUCKET).remove([objectPath]);
      throw dbErr;
    }
    if(rev===state.rev&&state.profileId===id){
      privateDocsNotice('Evidence uploaded to the private store for this driver.');
      await loadEvidence();
    }
  }catch(error){if(rev===state.rev)privateDocsNotice('Upload failed: '+(error.message||'Access error'),true);}
  finally{if(button?.isConnected)button.disabled=false;}
}
async function viewEvidence(evidenceId){
  const file=state.files.find(f=>String(f.id)===String(evidenceId));
  if(!file||!state.profileId||file.driver_id!==state.profileId)return;
  try{
    const {data,error}=await window.besaClient.storage.from(BUCKET)
      .createSignedUrl(file.storage_path,60,{download:false});
    if(error)throw error;
    const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';
    a.click();
    privateDocsNotice('A temporary, 60-second evidence link was opened. Do not forward it.');
  }catch(error){privateDocsNotice('Unable to open private evidence: '+(error.message||'Access error'),true);}
}
function importValue(cell){
  if(cell==null)return '';
  if(typeof cell==='object'){
    if(cell instanceof Date)return cell.toISOString().slice(0,10);
    if('result'in cell)return importValue(cell.result);
    if('text'in cell)return String(cell.text);
    if(Array.isArray(cell.richText))return cell.richText.map(x=>x.text).join('');
  }
  return cleanText(cell,250);
}
function importDate(cell){
  if(typeof cell==='number'&&cell>25000&&cell<90000){
    return new Date(Date.UTC(1899,11,30)+Math.round(cell)*86400000).toISOString().slice(0,10);
  }
  const val=importValue(cell);
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val);
  if(m){
    const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));
    return d.getUTCDate()===+m[1]&&d.getUTCMonth()===+m[2]-1?d.toISOString().slice(0,10):'';
  }
  return safeDate(val);
}
const SHEETS={
  rec:{name:'Driver Recruitment Tracker',headers:['Driver','Phone Number','Requirements','SAM First Part','Amazon Account','Accurate DBS','Amiigo Training','Sam 2nd Part','Notes','Status']},
  on:{name:'Onboarding DA tracker',headers:['Email','Phone number','Driver','CT date','Day','Week','Vendor','CT completed','SAM','DVLA/BGC','RA 1','RA 2','RA Completed','Active','Notes','Review flags','Transporter ID','H&S completed']}
};
function extractSource(workbook,kind){
  const spec=SHEETS[kind];
  const sheet=workbook.getWorksheet(spec.name);
  if(!sheet)throw new Error('The workbook needs the "'+spec.name+'" tab.');
  const headers=spec.headers.map((_,i)=>importValue(sheet.getRow(1).getCell(i+1).value));
  if(spec.headers.some((h,i)=>headers[i]!==h))throw new Error('Headings differ from the expected BESA tracker.');
  const result=[];
  for(let n=2;n<=Math.min(sheet.rowCount,6500);n++){
    const val=spec.headers.map((_,i)=>sheet.getRow(n).getCell(i+1).value);
    const get=i=>importValue(val[i]);
    const name=kind==='rec'?get(0):get(2);
    if(!name)continue;
    const item={name,email:kind==='on'?get(0):'',phone:get(1),flags:{},details:{},progress:{}};
    if(kind==='rec'){
      for(const [idx,key] of [[2,'requirements'],[3,'sam1'],[4,'amazon'],[5,'dbs'],[6,'amiigo'],[7,'sam2']]){
        item.flags[key]=sourceYes(get(idx));
        item.progress[key]=get(idx).slice(0,60);
      }
      item.details.recruitmentNotes=get(8);item.details.recruitmentStatus=get(9);
    }else{
      for(const [idx,key] of [[7,'ctdone'],[8,'samOn'],[9,'dvla'],[12,'radone'],[13,'active'],[17,'hs']])
        item.flags[key]=sourceYes(get(idx));
      if(importDate(val[10])){item.flags.ra1=true;item.details.ra1Date=importDate(val[10]);}
      if(importDate(val[11])){item.flags.ra2=true;item.details.ra2Date=importDate(val[11]);}
      item.details.ctDate=importDate(val[3]);
      item.details.day=get(4);item.details.week=get(5);item.details.vendor=get(6);
      item.details.onboardingNotes=get(14);item.details.flags=get(15);item.details.transporter=get(16);
    }
    result.push(item);
  }
  return result;
}
async function importTracker(file,kind){
  if(!file||!file.name.toLowerCase().endsWith('.xlsx')||file.size>20*1024*1024)
    throw new Error('Choose the matching Excel (.xlsx) workbook, under 20 MB.');
  await loadExcelJS();
  const rev=state.rev;
  const book=new window.ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const rows=extractSource(book,kind);
  if(rev!==state.rev)return;
  const refs=state.drivers.map(d=>({id:String(d.id),name:labelName(d),email:d.email||'',phone:d.phone||''}));
  let matched=0,unmatched=0,ambiguous=0;
  for(const row of rows){
    const m=findMergeIndex(refs,row);
    if(m.index<0){unmatched++;if(m.reason!=='new')ambiguous++;continue;}
    matched++;
    const id=refs[m.index].id;
    const staging=state.pending.get(id)||{checklist:{},details:{},progress:{},sources:[]};
    for(const [k,v] of Object.entries(row.flags))staging.checklist[k]=v;
    for(const [k,v] of Object.entries(row.details))if(v)staging.details[k]=v;
    for(const [k,v] of Object.entries(row.progress||{}))if(v)staging.progress[k]=v;
    staging.sources.push(SHEETS[kind].name);
    state.pending.set(id,staging);
  }
  $('journey-import-results').textContent=SHEETS[kind].name+': '+rows.length+' rows read, '+matched+
    ' matched to existing drivers, '+unmatched+' not matched ('+ambiguous+' ambiguous). Review each driver before applying. No live records were overwritten.';
  if(state.profileId)checklist();
  msg('Imported tracker locally. Open a matched driver’s profile and choose Review/apply imported tracker results.');
}
function exportChecklist(){
  const id=state.profileId,d=driver(id);
  if(!id||!d)return;
  const record=stored(id);
  const rows=[
    ['Driver',labelName(d)],
    ['Email',d.email||''],
    ['Driver ID',id],
    ['Storage mode',state.checklistReady?'secure database (may contain unsaved latest changes)':'local draft only'],
    ['Section','Task','Completed'],
    ...GROUPS.flatMap(([section,tasks])=>tasks.map(([key,label])=>
      [section,label,record.checklist[key]===true?'Yes':'No'])),
    ['', 'Details', ''],
    ...DETAIL_FIELDS.map(([key,title])=>['Details',title,record.details[key]||''])
  ];
  const csv='\uFEFF'+rows.map(row=>row.map(displayCsvSafe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download='BESA-DRIVER-CHECKLIST-DRAFT.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
  profileMessage('Checklist CSV downloaded. It contains personal information: keep it private.');
}
function applyImported(id){
  const pending=state.pending.get(id);
  if(!pending||state.profileId!==id)return;
  const driverRow=driver(id);
  if(!window.confirm('Apply imported checklist results for '+labelName(driverRow)+'? This will update the driver checklist'+
    (state.checklistReady?' in the secure database.':' in the local draft only.')+' It will not change driver status.'))return;
  const record=stored(id);
  Object.assign(record.checklist,pending.checklist);
  Object.assign(record.details,pending.details);
  record.details.recruitmentProgress??={};
  for(const [key,value] of Object.entries(pending.progress||{})){
    // Preserve existing historical dropdown labels even when customised.
    record.details.recruitmentProgress[key]=value;
  }
  state.pending.delete(id);
  checklist();renderTracker();queueWrite(id);
}
function setup(){
  setupCandidatePanel(()=>driver(state.profileId));
  window.addEventListener('besa:driver-session-reset',clearSensitive);
  window.addEventListener('besa:drivers-loaded',event=>{
    state.drivers=event.detail.drivers||[];
    state.vehicles=event.detail.vehicles||[];
    updateCounters();
    renderTracker();
    if(!state.checked){state.checked=true;void probe();}
    else if(state.checklistReady)void loadTrackerChecklists(state.rev);
    if(state.profileId&&driver(state.profileId)){overview();checklist();}
  });
  window.addEventListener('besa:driver-created',event=>{
    if(driver(event.detail.id))void openProfile(event.detail.id).then(()=>tabs('invitation'));
  });
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-driver-profile]');
    if(trigger&&!$('app-shell').hidden)void openProfile(trigger.dataset.driverProfile);
  });
  $('driver-profile-close').addEventListener('click',closeProfile);
  $('driver-profile-done').addEventListener('click',closeProfile);
  $('driver-profile').addEventListener('close',()=>{state.profileId=null;state.files=[];});
  $('driver-profile-edit').addEventListener('click',()=>{
    const id=state.profileId;if(!id)return;
    closeProfile();
    window.dispatchEvent(new CustomEvent('besa:edit-driver',{detail:{id}}));
  });
  $('driver-profile-export').addEventListener('click',exportChecklist);
  $('journey-tracker-body').addEventListener('change',trackerFieldChanged);
  $('journey-export-tracker').addEventListener('click',exportTracker);
  $('journey-show-tracker').addEventListener('click',()=>switchDriverView('spreadsheet'));
  $('journey-show-drivers').addEventListener('click',()=>switchDriverView('drivers'));
  $('driver-search').addEventListener('input',renderTracker);
  $('driver-filter').addEventListener('change',renderTracker);
  switchDriverView('spreadsheet');
  for(const tab of document.querySelectorAll('[data-journey-tab]')){
    tab.addEventListener('click',()=>tabs(tab.dataset.journeyTab));
  }
  $('journey-panel-recruitment').addEventListener('change',detailsChange);
  $('journey-panel-recruitment').addEventListener('click',event=>{
    const btn=event.target.closest('[data-apply-import]');
    if(btn)applyImported(btn.dataset.applyImport);
  });
  $('journey-panel-evidence').addEventListener('click',event=>{
    if(event.target.closest('#journey-upload-button'))void uploadEvidence();
    const btn=event.target.closest('[data-evidence]');
    if(btn)void viewEvidence(btn.dataset.evidence);
  });
  $('journey-import-open').addEventListener('click',()=>$('journey-import-panel').hidden=false);
  $('journey-import-close').addEventListener('click',()=>$('journey-import-panel').hidden=true);
  for(const [id,kind] of [['journey-recruit-file','rec'],['journey-onboard-file','on']]){
    $(id).addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{await importTracker(file,kind);}catch(error){msg('Import failed: '+(error.message||'Error'),true);}
      finally{event.target.value='';}
    });
  }
  mode();
}
setup();
