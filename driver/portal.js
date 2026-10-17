'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let user = null;
  const client = () => window.besaClient;
  const message = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
  const safeDate = value => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '';
  const element = (tag, className, text) => { const node = document.createElement(tag); if(className)node.className=className;if(text !== undefined)node.textContent=text;return node; };
  function tabs() {
    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('active',el===button));
      document.querySelectorAll('.tab-panel').forEach(el => el.hidden = el.id !== 'tab-' + button.dataset.tab);
    }));
  }
  async function readProfile() {
    const {data,error} = await client().from('besa_portal_profiles').select('first_name,last_name,phone,submitted_at').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    if(data) {
      const form=$('profile-form');form.elements.first_name.value=data.first_name;form.elements.last_name.value=data.last_name;form.elements.phone.value=data.phone||'';
      $('profile-state').textContent=data.submitted_at ? 'Onboarding details submitted to the office.' : 'Profile saved. You can edit these details.';
    }else {$('profile-state').textContent='Add your details before uploading documents.';}
    return Boolean(data);
  }
  async function readDocuments(){
    const {data,error}=await client().from('besa_portal_documents').select('id,document_type,original_name,review_status,uploaded_at,storage_path').eq('user_id',user.id).order('uploaded_at',{ascending:false});
    if(error) throw error;
    const list=$('document-list');list.replaceChildren();
    if(!data.length){list.append(element('p','subtle','No documents uploaded yet.'));return;}
    for(const row of data){
      const wrapper=element('div','item'),description=element('div'),label=element('strong',null,row.document_type.replaceAll('_',' ')+' — '+row.original_name);
      const small=element('small',null,new Date(row.uploaded_at).toLocaleDateString('en-GB')+' • '+row.review_status);
      const button=element('button',null,'View securely');button.type='button';
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          const {data:link,error:linkError}=await client().storage.from('besa-driver-documents').createSignedUrl(row.storage_path,60);
          if(linkError)throw linkError;window.open(link.signedUrl,'_blank','noopener,noreferrer');
        }catch(e){message(e.message||'Unable to open document',true);}finally{button.disabled=false;}
      });
      description.append(label,small);wrapper.append(description,button);list.append(wrapper);
    }
  }
  async function readRota() {
    const start=new Date(),from=new Date(Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()-7)).toISOString().slice(0,10),end=new Date(Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()+42)).toISOString().slice(0,10);
    const {data,error}=await client().from('besa_portal_shifts').select('shift_date,shift_code,is_working_day,note').eq('user_id',user.id).gte('shift_date',from).lte('shift_date',end).order('shift_date');
    if(error)throw error;
    const list=$('rota-list');list.replaceChildren();
    if(!data.length){list.append(element('p','subtle','No published shifts yet. Please check with the office.'));return;}
    for(const row of data){
      const card=element('div','item'),group=element('div');
      group.append(element('strong',null,safeDate(row.shift_date)+' — '+row.shift_code),element('small',null,row.note|| (row.is_working_day?'Working shift':'Not a driving working day')));
      card.append(group,element('span','tag',row.is_working_day?'Working':'Non-driving'));list.append(card);
    }
  }
  async function refresh(){
    if(!user)return;
    try{await Promise.all([readProfile(),readDocuments(),readRota()]);message('');}
    catch(e){message('Unable to load the driver workspace: '+(e.message||'Try refreshing.'),true);}
  }
  async function saveProfile(event){
    event.preventDefault();const btn=$('save-profile');btn.disabled=true;
    try{
      const form=event.currentTarget;
      const details={user_id:user.id,email:user.email,first_name:form.elements.first_name.value.trim(),last_name:form.elements.last_name.value.trim(),phone:form.elements.phone.value.trim()||null};
      if(!details.first_name||!details.last_name)throw new Error('Enter your first and last name.');
      const {error}=await client().from('besa_portal_profiles').upsert(details,{onConflict:'user_id'});
      if(error)throw error;$('profile-state').textContent='Profile saved.';message('Your details were saved.');
    }catch(e){message(e.message||'Unable to save profile',true);}finally{btn.disabled=false;}
  }
  async function uploadDocument(event){
    event.preventDefault();const btn=$('upload-button');btn.disabled=true;
    try{
      const file=$('document-file').files[0],type=$('document-type').value;
      if(!file)throw new Error('Please select a file.');
      const types={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      const extension=types[file.type];
      if(!extension)throw new Error('Only PDF, JPG, PNG or WEBP files are supported.');
      if(file.size>10485760)throw new Error('Files must be 10 MB or smaller.');
      const {data:profile,error:profileError}=await client().from('besa_portal_profiles').select('user_id').eq('user_id',user.id).maybeSingle();
      if(profileError)throw profileError;if(!profile)throw new Error('Save your profile before uploading documents.');
      const path=user.id+'/'+crypto.randomUUID()+'.'+extension;
      const {error:uploadError}=await client().storage.from('besa-driver-documents').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:dbError}=await client().from('besa_portal_documents').insert({user_id:user.id,document_type:type,storage_path:path,original_name:file.name.substring(0,255)});
      if(dbError)throw new Error('Document uploaded, but could not be registered. Contact the office; do not keep uploading copies. '+dbError.message);
      $('document-form').reset();await readDocuments();message('Document uploaded securely. Awaiting office review.');
    }catch(e){message(e.message||'Upload failed.',true);}finally{btn.disabled=false;}
  }
  async function sendLink(event){
    event.preventDefault();const button=$('login-button');button.disabled=true;
    try{
      const redirect=new URL('driver.html',location.href);
      const {error}=await client().auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:redirect.href,shouldCreateUser:false}});
      if(error)throw error;message('Check your email for your sign-in link, including your spam folder.');
    }catch(e){message(e.message||'Could not send sign-in link.',true);}finally{button.disabled=false;}
  }
  function sessionChanged(session){
    user=session?.user||null;$('login-panel').hidden=Boolean(user);$('app').hidden=!user;
    $('account').textContent=user?.email||'';
    if(user)refresh();else message('');
  }
  function start(){
    if(!client()){message('Unable to load the secure sign-in service. Please refresh the page.',true);return;}
    tabs();$('login-form').addEventListener('submit',sendLink);$('profile-form').addEventListener('submit',saveProfile);$('document-form').addEventListener('submit',uploadDocument);
    $('logout').addEventListener('click',async()=>{const {error}=await client().auth.signOut();if(error)message(error.message,true);else sessionChanged(null);});
    client().auth.onAuthStateChange((_event,session)=>sessionChanged(session));
    client().auth.getSession().then(({data,error})=>{if(error)throw error;sessionChanged(data.session);}).catch(e=>message(e.message,true));
  }
  start();
})();
