// Candidate link uses a token in the URL fragment (never sent as a URL or
// referrer); all private data and files are sent directly to the vetted Edge
// Function. No third-party scripts, analytics or local browser persistence.
const API='https://xyicnwfwsmbfcputqrbn.supabase.co/functions/v1/besa-candidate-intake';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.hash.replace(/^#/, '')).get('invite')||'';
let currentStep=1,uploaded=[],busy=false,valid=false;
const panels=[...document.querySelectorAll('[data-panel]')];
const fields=$('candidate-form');
function status(message='',bad=false){
 const target=$('candidate-status');
 target.textContent=message;target.classList.toggle('error',bad);
}
async function request(action,params={},formData=null){
 const init={method:'POST',headers:{},cache:'no-store',referrerPolicy:'no-referrer'};
 if(formData){
   formData.set('token',token);
   init.body=formData;
 }else{
   init.headers['Content-Type']='application/json';
   init.body=JSON.stringify({action,token,...params});
 }
 let response;
 try{response=await fetch(API,init);}
 catch{throw new Error('Cannot connect to BESA. Check your internet connection and try again.');}
 const data=await response.json().catch(()=>({error:'Unexpected server response'}));
 if(!response.ok)throw new Error(data.error||'Something went wrong. Please retry.');
 return data;
}
function setStep(number){
 currentStep=number;
 for(const panel of panels)panel.hidden=Number(panel.dataset.panel)!==number;
 for(const step of document.querySelectorAll('[data-step]')){
   const n=Number(step.dataset.step);
   step.classList.toggle('active',n===number);
   step.classList.toggle('completed',n<number);
   if(n===number)step.setAttribute('aria-current','step');
   else step.removeAttribute('aria-current');
 }
 window.scrollTo({top:0,behavior:'instant'});
}
function validateStep(n){
 const element=document.querySelector('[data-panel="'+n+'"]');
 for(const input of element.querySelectorAll('input[required],select[required]')){
   if(!input.checkValidity()){input.reportValidity();input.focus();return false;}
 }
 if(n===1){
   const born=fields.elements.date_of_birth.value;
   const max=new Date();max.setFullYear(max.getFullYear()-18);
   if(born>max.toISOString().slice(0,10)){
     alert('Check your date of birth. Drivers must be at least 18.');
     fields.elements.date_of_birth.focus();return false;
   }
 }
 return true;
}
function formDetails(){
 const data=new FormData(fields),values={};
 for(const [key,value] of data.entries())values[key]=String(value).trim();
 values.declaration=$('declaration').checked;
 values.privacy_acknowledged=$('privacy_acknowledged').checked;
 return values;
}
function renderUploaded(){
 for(const card of document.querySelectorAll('.document-card')){
   const kind=card.dataset.doc;
   const count=uploaded.filter(x=>x===kind).length;
   const state=card.querySelector('.upload-state');
   const complete=count>0;
   card.classList.toggle('uploaded',complete);
   state.textContent=count?count+' file'+(count===1?'':'s')+' securely uploaded':'Not uploaded';
 }
}
async function uploadDocument(card){
 if(!valid||busy)return;
 const input=card.querySelector('input[type="file"]'),file=input.files?.[0];
 if(!file){status('Choose a document before pressing Upload.',true);input.focus();return;}
 if(file.size>8*1024*1024||file.size<1){status('Each file must be smaller than 8 MB.',true);return;}
 if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)){
   status('Only PDF, JPG, PNG and WEBP documents are accepted. Convert HEIC photos to JPG first.',true);return;
 }
 const button=card.querySelector('button'),kind=card.dataset.doc;
 busy=true;button.disabled=true;button.textContent='Uploading…';
 status('Uploading your '+card.querySelector('strong').textContent.trim()+' securely…');
 try{
   const form=new FormData();form.append('docType',kind);form.append('file',file);
   const result=await request(null,{},form);
   if(result.uploaded){uploaded.push(kind);input.value='';renderUploaded();status('Document securely received by BESA.');}
 }catch(err){status(err.message,true);}
 finally{button.disabled=false;button.textContent='Upload';busy=false;}
}
async function submit(event){
 event.preventDefault();
 if(!valid||busy)return;
 for(const n of [1,2]){
   if(!validateStep(n)){setStep(n);return;}
 }
 if(!uploaded.includes('driving-licence-front')){
   status('Please upload the front of your driving licence.',true);return;
 }
 if(!uploaded.includes('passport')&&!uploaded.includes('right-to-work')){
   status('Please upload your passport or other right-to-work evidence.',true);return;
 }
 if(!$('privacy_acknowledged').checked||!$('declaration').checked){
   status('Please tick both confirmation boxes before submitting.',true);return;
 }
 busy=true;
 const button=$('candidate-submit');button.disabled=true;button.textContent='Submitting securely…';
 status('Sending your application to BESA…');
 try{
   const result=await request('submit',{details:formDetails()});
   if(result.submitted){
     valid=false;
     fields.reset();
     document.querySelector('#candidate-workspace').hidden=true;
     $('candidate-finished').hidden=false;
     window.scrollTo({top:0,behavior:'instant'});
   }
 }catch(err){status(err.message,true);}
 finally{button.disabled=false;button.textContent='Submit securely to BESA ✓';busy=false;}
}
async function start(){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){
   $('candidate-loading').hidden=true;$('candidate-invalid').hidden=false;return;
 }
 try{
   const data=await request('status');
   $('candidate-loading').hidden=true;
   if(data.submitted){$('candidate-finished').hidden=false;return;}
   valid=true;uploaded=Array.isArray(data.uploaded_types)?data.uploaded_types:[];
   $('candidate-welcome').textContent=data.first_name?
     'Welcome, '+data.first_name+'. Complete your secure BESA application.':
     'Complete your secure BESA application.';
   $('candidate-expiry').textContent='Link expires '+new Date(data.expires_at).toLocaleDateString('en-GB',{
      day:'numeric',month:'short',year:'numeric'
   });
   $('candidate-workspace').hidden=false;
   renderUploaded();
   setStep(1);
 }catch(err){
   $('candidate-loading').hidden=true;$('candidate-invalid').hidden=false;
   $('candidate-invalid').textContent=err.message;
 }
}
$('next-1').addEventListener('click',()=>{if(validateStep(1))setStep(2);});
$('next-2').addEventListener('click',()=>{if(validateStep(2))setStep(3);});
$('back-2').addEventListener('click',()=>setStep(1));
$('back-3').addEventListener('click',()=>setStep(2));
for(const button of document.querySelectorAll('[data-step]')){
 button.addEventListener('click',()=>{
   const n=Number(button.dataset.step);
   if(n<=currentStep)setStep(n);
   else if(n===currentStep+1&&validateStep(currentStep))setStep(n);
 });
}
for(const card of document.querySelectorAll('.document-card')){
 card.querySelector('.upload-button').addEventListener('click',()=>uploadDocument(card));
}
fields.addEventListener('submit',submit);
start();
