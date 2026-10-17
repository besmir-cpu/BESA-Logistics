'use strict';
(() => {
 const $=id=>document.getElementById(id), db=()=>window.besaClient;
 let user=null, selected=null, profiles=[];
 const msg=(value,error=false)=>{$('status').textContent=value;$('status').classList.toggle('error',error);};
 const el=(tag,text,cls='')=>{const x=document.createElement(tag);x.textContent=text||'';x.className=cls;return x;};
 async function list(){
  const {data,error}=await db().from('besa_portal_profiles').select('user_id,first_name,last_name,email,phone,submitted_at').order('created_at',{ascending:false});
  if(error)throw error;profiles=data;
  $('drivers').replaceChildren();
  if(!data.length)$('drivers').append(el('p','No driver portal profiles yet.','subtle'));
  for(const p of data){
    const card=el('div','','item'),desc=el('div');
    desc.append(el('strong',p.first_name+' '+p.last_name),el('small',p.email+' • '+(p.phone||'No phone number')));
    const button=el('button','Review');button.onclick=()=>choose(p.user_id);
    card.append(desc,button);$('drivers').append(card);
  }
  if(selected && data.some(p=>p.user_id===selected))await choose(selected);
 }
 async function choose(id){
  selected=id;const p=profiles.find(x=>x.user_id===id);if(!p)return;
  $('detail').hidden=false;$('driver-title').textContent=p.first_name+' '+p.last_name;
  $('driver-email').textContent=p.email;await Promise.all([docs(),shifts()]);
 }
 async function docs(){
  const {data,error}=await db().from('besa_portal_documents').select('id,document_type,original_name,review_status,storage_path,uploaded_at').eq('user_id',selected).order('uploaded_at',{ascending:false});
  if(error)throw error;const list=$('documents');list.replaceChildren();
  if(!data.length)list.append(el('p','No documents submitted.','subtle'));
  for(const d of data){
   const item=el('div','','item'),group=el('div');
   group.append(el('strong',d.document_type.replaceAll('_',' ')+' · '+d.original_name),el('small','Status: '+d.review_status));
   const actions=el('div',''),open=el('button','View'),approve=el('button','Approve'),reject=el('button','Reject');
   for(const b of [open,approve,reject]){b.style.margin='4px';actions.append(b);}
   open.onclick=async()=>{try{const {data:link,error:e}=await db().storage.from('besa-driver-documents').createSignedUrl(d.storage_path,60);if(e)throw e;window.open(link.signedUrl,'_blank','noopener,noreferrer');}catch(e){msg(e.message,true);}};
   for(const [b,status] of [[approve,'approved'],[reject,'rejected']])b.onclick=async()=>{
    if(!confirm('Mark document as '+status+'? This records a review decision.'))return;
    try{const {error:e}=await db().from('besa_portal_documents').update({review_status:status,reviewed_at:new Date().toISOString()}).eq('id',d.id);if(e)throw e;await docs();msg('Document '+status+'.');}catch(e){msg(e.message,true);}
   };
   item.append(group,actions);list.append(item);
  }
 }
 async function shifts(){
  const {data,error}=await db().from('besa_portal_shifts').select('shift_date,shift_code,is_working_day,note').eq('user_id',selected).order('shift_date',{ascending:false}).limit(60);
  if(error)throw error;
  $('shifts').replaceChildren();
  if(!data.length)$('shifts').append(el('p','No shifts published yet.','subtle'));
  for(const s of data){const line=el('div','','item');line.append(el('strong',s.shift_date+' · '+s.shift_code),el('span',s.is_working_day?'Working':'Non-driving','tag'));$('shifts').append(line);}
 }
 async function saveShift(event){
  event.preventDefault();if(!selected)return;
  const payload={user_id:selected,shift_date:$('shift-date').value,shift_code:$('shift-code').value,note:$('shift-note').value.trim()||null};
  try{const {error}=await db().from('besa_portal_shifts').upsert(payload,{onConflict:'user_id,shift_date'});if(error)throw error;await shifts();msg('Shift saved and available to driver.');}
  catch(e){msg(e.message,true);}
 }
 async function sessionChanged(session){
  user=session?.user||null;$('office-login').hidden=Boolean(user);$('office-app').hidden=!user;
  if(!user){selected=null;$('detail').hidden=true;return;}
  try{const {data,error}=await db().rpc('besa_portal_is_admin');if(error)throw error;if(!data)throw new Error('This account is not authorised for office access.');await list();}
  catch(e){$('office-app').hidden=true;msg(e.message,true);}
 }
 function start(){
  $('login-form').onsubmit=async e=>{e.preventDefault();try{const redirect=new URL('office.html',location.href);const {error}=await db().auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:redirect.href,shouldCreateUser:false}});if(error)throw error;msg('Check your email for your sign-in link.');}catch(x){msg(x.message,true);}};
  $('shift-form').onsubmit=saveShift;
  $('logout').onclick=async()=>{await db().auth.signOut();};
  db().auth.onAuthStateChange((_event,session)=>sessionChanged(session));
  db().auth.getSession().then(({data})=>sessionChanged(data.session)).catch(e=>msg(e.message,true));
 }
 if(!db())msg('Unable to load database connection. Refresh the page.',true);else start();
})();
