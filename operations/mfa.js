// Authenticator enrolment and verification run only on the user's device.
// No secrets or verification codes enter logs, URLs or business records.
(()=>{
 const $=id=>document.getElementById(id);
 let activeUser=null,factorId=null,enrolling=false,revision=0;
 const panel=()=>$('mfa-panel');
 function feedback(text,error=false){$('mfa-status').textContent=text;$('mfa-status').classList.toggle('error',error);}
 function clear(){
  revision++;activeUser=null;factorId=null;enrolling=false;
  if(!panel())return;
  panel().hidden=true;$('live-login-panel').hidden=false;
  $('mfa-qr').removeAttribute('src');$('mfa-secret').textContent='';$('mfa-code').value='';
 }
 function show(enrol){
  $('login-screen').hidden=false;$('app-shell').hidden=true;
  $('live-login-panel').hidden=true;panel().hidden=false;
  $('mfa-start').hidden=!enrol;$('mfa-form').hidden=enrol;
  $('mfa-setup').hidden=true;
  $('mfa-description').textContent=enrol?'Protect your office access with an authenticator app. Set it up once, then enter its six-digit code when signing in.':'Enter the current six-digit code from your authenticator app.';
  feedback('');
 }
 async function check(session){
  if(!session){clear();return false;}
  if(activeUser!==session.user.id){clear();activeUser=session.user.id;}
  const current=revision,client=window.besaClient;
  // Membership remains readable before MFA so that enrolment cannot grant a
  // non-administrator access. Database policies independently enforce MFA.
  const {data:members,error:memberError}=await client.from('besa_admins').select('email').eq('email',String(session.user.email||'').toLowerCase()).limit(1);
  if(memberError)throw memberError;
  if(!members?.length)return true; // Main workspace displays its existing access-denied screen.
  const {data:assurance,error}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error)throw error;if(current!==revision)return false;
  if(assurance.currentLevel==='aal2'){
   panel().hidden=true;$('live-login-panel').hidden=false;
   $('mfa-qr').removeAttribute('src');$('mfa-secret').textContent='';$('mfa-code').value='';return true;
  }
  const {data:factors,error:factorError}=await client.auth.mfa.listFactors();
  if(factorError)throw factorError;if(current!==revision)return false;
  const verified=factors.totp?.find(f=>f.status==='verified');
  factorId=verified?.id||null;enrolling=false;show(!factorId);return false;
 }
 async function start(){
  const button=$('mfa-start');button.disabled=true;
  try{
   const client=window.besaClient;
   const {data:factors,error:factorError}=await client.auth.mfa.listFactors();if(factorError)throw factorError;
   // Incomplete prior setup is not a valid second factor. Remove only this
   // account's unfinished factors before starting a fresh human enrolment.
   for(const f of factors.totp||[])if(f.status==='unverified'){
    const {error}=await client.auth.mfa.unenroll({factorId:f.id});if(error)throw error;
   }
   const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'BESA office',issuer:'BESA Logistics'});if(error)throw error;
   factorId=data.id;enrolling=true;
   $('mfa-qr').src=data.totp.qr_code;$('mfa-secret').textContent=data.totp.secret;
   $('mfa-setup').hidden=false;button.hidden=true;$('mfa-form').hidden=false;
   feedback('Scan the QR code with your authenticator app, then enter the code shown on your phone.');$('mfa-code').focus();
  }catch(error){feedback(error.message||'Could not start authenticator setup.',true);}
  finally{button.disabled=false;}
 }
 async function verify(event){
  event.preventDefault();const button=$('mfa-verify'),code=$('mfa-code').value.trim();
  if(!factorId||!/^\d{6}$/.test(code)){feedback('Enter the six-digit authenticator code.',true);return;}
  button.disabled=true;feedback('Verifying your office access…');
  try{
   const {data:challenge,error:challengeError}=await window.besaClient.auth.mfa.challenge({factorId});if(challengeError)throw challengeError;
   const {error}=await window.besaClient.auth.mfa.verify({factorId,challengeId:challenge.id,code});if(error)throw error;
   $('mfa-code').value='';$('mfa-qr').removeAttribute('src');$('mfa-secret').textContent='';
   enrolling=false;window.dispatchEvent(new Event('besa:mfa-verified'));
  }catch(error){feedback('The code could not be verified. Check the current code and your phone’s time, then retry.',true);}
  finally{button.disabled=false;$('mfa-code').value='';}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  $('mfa-start').addEventListener('click',start);$('mfa-form').addEventListener('submit',verify);
  $('mfa-signout').addEventListener('click',async()=>{const {error}=await window.besaClient.auth.signOut();if(error)feedback('Could not sign out. Retry.',true);else{clear();window.dispatchEvent(new Event('besa:mfa-verified'));}});
 });
 window.besaMFA={check,clear};
})();
