import assert from 'node:assert/strict';
const checks=[
 ['https://besalogistics.co.uk/office/',text=>{assert.match(text,/compliance-requirement/);assert.match(text,/<div id="live-login-panel">/);assert.doesNotMatch(text,/trial-enter|besa-trial|trial-preview/);}],
 ['https://besalogistics.co.uk/office/app.js',text=>{assert.match(text,/data-dashboard-view/);assert.doesNotMatch(text,/state\.trial|enterTrial|loadTrialData/);}],
 ['https://besalogistics.co.uk/office/rota.html',text=>{assert.match(text,/load-driver-register/);assert.match(text,/load-van-register/);assert.doesNotMatch(text,/sample vehicle|Reset preview/);}],
 ['https://besalogistics.co.uk/office/operations/draft-state.mjs',text=>assert.match(text,/assertCurrent/)],
 ['https://besalogistics.co.uk/office/operations/draft-controls.mjs?v=2',text=>assert.match(text,/acceptDraftVersion/)],
 ['https://besalogistics.co.uk/onboarding/',text=>assert.match(text,/candidate-form/)]
];
for(let attempt=1;attempt<=18;attempt++){
 try{
  for(const [url,check] of checks){
   const response=await fetch(url+(url.includes('?')?'&':'?')+'release=platform-20261021',{signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});
   assert.equal(response.status,200,url);check(await response.text());
   assert.match(response.headers.get('content-security-policy')||'',/script-src 'self'/);
   assert.equal(response.headers.get('x-frame-options'),'DENY');
   assert.match(response.headers.get('cache-control')||'',/no-store/);
  }
  console.log('Published platform planners, draft protections, office login, onboarding and security headers verified. No private records requested.');
  process.exit(0);
 }catch(error){
  if(attempt===18)throw error;
  console.log(`Waiting for office release propagation (${attempt}/18).`);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
}
