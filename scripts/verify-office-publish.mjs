import assert from 'node:assert/strict';
const checks=[
 ['https://besalogistics.co.uk/office/',text=>{assert.match(text,/compliance-requirement/);assert.match(text,/<div id="live-login-panel">/);assert.doesNotMatch(text,/trial-enter|besa-trial|trial-preview/);}],
 ['https://besalogistics.co.uk/office/app.js',text=>{assert.match(text,/data-dashboard-view/);assert.doesNotMatch(text,/state\.trial|enterTrial|loadTrialData/);}],
 ['https://besalogistics.co.uk/office/operations/dashboard.css',text=>assert.match(text,/dashboard-stat/)],
 ['https://besmir-cpu.github.io/BESA-Logistics/',text=>{assert.match(text,/compliance-requirement/);assert.doesNotMatch(text,/trial-enter/);}],
 ['https://besalogistics.co.uk/onboarding/',text=>assert.match(text,/candidate-form/)]
];
for(let attempt=1;attempt<=18;attempt++){
 try{
  for(const [url,check] of checks){
   const response=await fetch(url+'?release=operations-20261021',{signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});
   assert.equal(response.status,200,url);check(await response.text());
  }
  console.log('Published office login, dashboard, GitHub Pages and onboarding verified. No private records requested.');
  process.exit(0);
 }catch(error){
  if(attempt===18)throw error;
  console.log(`Waiting for office release propagation (${attempt}/18).`);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
}
