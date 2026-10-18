// BESA administrator review for expiring candidate invitation links.
// Uses verified Supabase administrator JWT and Edge function; never puts
// passport images or applicant answers in public code or browser storage.
const API='https://xyicnwfwsmbfcputqrbn.supabase.co/functions/v1/besa-candidate-intake';
let currentDriver=null,currentRevision=0;
const DOC_NAMES={
 'passport':'Passport identity page',
 'right-to-work':'Right-to-work evidence',
 'driving-licence-front':'Driving licence — front',
 'driving-licence-back':'Driving licence — back',
 'dvla-evidence':'DVLA evidence',
 'proof-of-address':'Proof of address',
 'other':'Other document'
};
const FIELD_NAMES={
 first_name:'First name',last_name:'Last name',email:'Email address',phone:'Mobile phone',
 date_of_birth:'Date of birth',address_1:'Address line 1',address_2:'Address line 2',
 city:'Town / city',postcode:'Postcode',licence_type:'Driving licence type',
 licence_issue_date:'Licence issue date',licence_expiry:'Licence expiry date',
 licence_issuing_country:'Licence issuing country',right_to_work_type:'Right-to-work evidence',
 right_to_work_expiry:'Right-to-work expiry',right_to_work_share_code:'Right-to-work share code',
 passport_expiry:'Passport expiry date',emergency_contact_name:'Emergency contact',
 emergency_contact_phone:'Emergency contact phone'
};
const $=id=>document.getElementById(id);
function el(tag,label,className){
 const node=document.createElement(tag);
 if(label!==undefined&&label!==null)node.textContent=String(label);
 if(className)node.className=className;
 return node;
}
async function adminRequest(action,data={}){
 const client=window.besaClient;
 if(!client)throw new Error('Sign into BESA first.');
 const {data:session,error:sessionError}=await client.auth.getSession();
 if(sessionError||!session.session?.access_token)throw new Error('Administrator session required.');
 const response=await fetch(API,{
  method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
  headers:{'Content-Type':'application/json',
   'Authorization':'Bearer '+session.session.access_token},
  body:JSON.stringify({action,...data})
 });
 const result=await response.json().catch(()=>({error:'Invalid response'}));
 if(!response.ok)throw new Error(result.error||'Cannot contact onboarding service');
 return result;
}
function message(text,error=false){
 const node=$('journey-invite-message');
 if(!node)return;
 node.textContent=text;node.classList.toggle('error',error);
}
function safeDate(value){
 return value?new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
}
function linkbox(result,driver){
 const node=$('journey-invite-link');
 node.replaceChildren();
 if(!result?.link)return;
 const title=el('strong','Private candidate invitation — copy this link');
 const input=document.createElement('input');
 input.type='text';input.readOnly=true;input.value=result.link;
 input.setAttribute('aria-label','New candidate invitation link');
 const copy=el('button','Copy invitation link','button primary');copy.type='button';
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(result.link);message('Link copied. Send it privately to the candidate.');}
  catch{input.focus();input.select();message('Select and copy the highlighted link.');}
 });
 const email=document.createElement('a');email.className='button';email.textContent='Create email';
 email.href='mailto:'+encodeURIComponent(driver.email||'')+'?subject='+
  encodeURIComponent('BESA Logistics — complete your driver onboarding')+
  '&body='+encodeURIComponent('Hello,\n\nPlease complete your secure BESA driver onboarding form using this private link (valid until '+safeDate(result.expires_at)+'):\n\n'+result.link+'\n\nDo not forward the link.\n\nThank you,\nBESA Logistics');
 node.append(title,input,copy,email);
 node.hidden=false;
}
async function generate(driver){
 if(!driver||!driver.email){message('Add the candidate email in their BESA driver profile first.',true);return;}
 if(!confirm('Generate a private invitation for '+driver.first_name+
   '? This will revoke any older unfinished invitation links for this driver.'))return;
 const button=$('journey-create-invite');button.disabled=true;
 try{
  const result=await adminRequest('create',{driverId:driver.id});
  if(String(driver.id)!==currentDriver)return;
  linkbox(result,driver);
  message('Seven-day invitation created. You can now copy and send the secure link. No email has been sent automatically.');
  await loadCandidatePanel(driver);
 }catch(error){message(error.message,true);}
 finally{button.disabled=false;}
}
function drawDetails(payload){
 const pane=$('journey-invite-details');pane.replaceChildren();
 if(!payload||!Object.keys(payload).length){
  pane.append(el('p','The candidate has not submitted their personal details yet.','journey-profile-note'));return;
 }
 const info=el('div',null,'journey-overview-grid');
 for(const [key,label] of Object.entries(FIELD_NAMES)){
  if(!payload[key])continue;
  const cell=el('article');
  cell.append(el('span',label),el('strong',payload[key]));
  info.append(cell);
 }
 pane.append(info);
 pane.append(el('p','Submitted details are for office review only. Right-to-work checks and licence verification must be independently completed before any approval.','journey-profile-note warn'));
}
async function viewDocument(driverId,fileId){
 try{
  const data=await adminRequest('admin-view',{driverId,fileId});
  const a=document.createElement('a');a.href=data.url;
  a.target='_blank';a.rel='noopener noreferrer';a.click();
  message('Opened a temporary private document link (60 seconds). Never forward it.');
 }catch(error){message(error.message,true);}
}
function drawDocuments(list,driverId){
 const pane=$('journey-invite-files');pane.replaceChildren();
 if(!list.length){pane.append(el('p','No files have been uploaded.','journey-profile-note'));return;}
 for(const item of list){
  const row=el('div',null,'journey-evidence-file');
  const title=el('span',(DOC_NAMES[item.doc_type]||'Document')+' · '+item.original_name+
    ' · '+(item.byte_size/1024/1024).toFixed(1)+' MB');
  const button=el('button','Private view');
  button.type='button';button.addEventListener('click',()=>viewDocument(driverId,item.id));
  row.append(title,button);pane.append(row);
 }
}
export function clearCandidatePanel(){
 currentDriver=null;++currentRevision;
 for(const id of ['journey-invite-list','journey-invite-details','journey-invite-files','journey-invite-link']){
  const node=$(id);if(node)node.replaceChildren();
 }
 const text=$('journey-invite-message');if(text)text.textContent='';
}
export async function loadCandidatePanel(driver){
 if(!driver||!document.getElementById('journey-panel-invitation'))return;
 currentDriver=String(driver.id);
 const rev=++currentRevision;
 $('journey-invite-list').replaceChildren(el('p','Loading invitation details…'));
 try{
  const data=await adminRequest('admin-review',{driverId:driver.id});
  if(rev!==currentRevision||currentDriver!==String(driver.id))return;
  const list=$('journey-invite-list');list.replaceChildren();
  if(!data.invites.length)list.append(el('p','No invitation created yet. Use the button above after adding a driver.','journey-profile-note'));
  for(const invite of data.invites){
   const expired=Date.parse(invite.expires_at)<=Date.now();
   const mode=invite.submitted_at?'Submitted':invite.revoked_at?'Revoked':expired?'Expired':'Awaiting candidate';
   const row=el('div',null,'journey-invite-row');
   row.append(el('span',mode+' · created '+safeDate(invite.created_at)+' · expires '+safeDate(invite.expires_at)));
   if(!invite.submitted_at&&!invite.revoked_at&&!expired){
    const revoke=el('button','Revoke link','button');
    revoke.type='button';
    revoke.addEventListener('click',async()=>{
      if(!confirm('Revoke this candidate invitation? The link will stop working. Already uploaded documents stay private.'))return;
      try{
        await adminRequest('revoke',{driverId:driver.id,inviteId:invite.id});
        message('Invitation revoked.');await loadCandidatePanel(driver);
      }catch(error){message(error.message,true);}
    });
    row.append(revoke);
   }
   list.append(row);
  }
  const submitted=data.invites.find(i=>i.submitted_at);
  drawDetails(submitted?.candidate_payload||null);
  drawDocuments(data.documents||[],String(driver.id));
  if(submitted)message('Candidate submitted their details. Review evidence and perform independent checks before approving.');
 }catch(error){
  if(rev!==currentRevision)return;
  $('journey-invite-list').replaceChildren();
  message('Unable to load candidate intake: '+error.message,true);
 }
}
export function setupCandidatePanel(getDriver){
 const action=$('journey-create-invite');
 if(action){
  action.addEventListener('click',()=>{
   const d=getDriver();
   if(d)void generate(d);
   else message('Open a driver profile first.',true);
  });
 }
}
