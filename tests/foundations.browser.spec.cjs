const {test,expect}=require('@playwright/test');
const site=process.env.BESA_OFFICE_URL||'http://127.0.0.1:4174/office/';
const driver={id:'10000000-0000-4000-8000-000000000001',first_name:'Synthetic',last_name:'Driver',status:'Onboarding'};
async function setup(page,{enrol=false,aal='aal1',shared}={}){
 const calls=[];
 await page.route('**/rest/v1/**',async route=>{
  const table=new URL(route.request().url()).pathname.split('/').pop();calls.push(table);
  if(shared&&table==='besa_save_driver_journey'){
   const p=route.request().postDataJSON();
   if(p.p_expected_version!==shared.version)return route.fulfill({json:[{saved:false,conflict:true,current_version:shared.version}]});
   shared.version++;shared.checklist=p.p_checklist;return route.fulfill({json:[{saved:true,conflict:false,current_version:shared.version}]});
  }
  if(shared?.fail&&table==='besa_driver_journey')return route.fulfill({status:403,json:{message:'Synthetic access failure'}});
  const rows=table==='besa_admins'?[{email:'admin@example.test'}]:table==='besa_drivers'?[driver]:table==='besa_driver_journey'&&shared?[{driver_id:driver.id,checklist:shared.checklist,details:{},version:shared.version}]:[];
  await route.fulfill({json:rows});
 });
 await page.goto(site);
 await page.waitForFunction(()=>Boolean(window.besaClient));
 await page.evaluate(({enrol,aal})=>{
  let current=aal,verified=!enrol,session={user:{id:'synthetic-admin',email:'admin@example.test'},access_token:'synthetic-only'};
  const auth=window.besaClient.auth;
  auth.signInWithPassword=async()=>({data:{session},error:null});
  auth.getSession=async()=>({data:{session},error:null});
  auth.signOut=async()=>{session=null;return {error:null};};
  auth.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:current,nextLevel:'aal2'},error:null});
  auth.mfa.listFactors=async()=>({data:{totp:verified?[{id:'synthetic-factor',status:'verified'}]:[]},error:null});
  auth.mfa.enroll=async()=>({data:{id:'synthetic-factor',totp:{qr_code:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'SYNTHETIC-TEST-KEY'}},error:null});
  auth.mfa.challenge=async()=>({data:{id:'synthetic-challenge'},error:null});
  auth.mfa.verify=async({code})=>{
   if(code!=='123456')return {error:{message:'Synthetic invalid code'}};
   current='aal2';verified=true;return {data:{},error:null};
  };
 },{enrol,aal});
 await page.locator('#password-login-email').fill('admin@example.test');
 await page.locator('#password-login-password').fill('synthetic-test-password');
 await page.locator('#password-login-submit').click();
 return calls;
}
test('MFA blocks business reads and invalid codes; verified sessions open the workspace',async({page})=>{
 const calls=await setup(page);
 await expect(page.locator('#mfa-form')).toBeVisible();
 await expect(page.locator('#app-shell')).toBeHidden();
 expect(calls.filter(t=>t!=='besa_admins')).toEqual([]);
 await page.locator('#mfa-code').fill('000000');await page.locator('#mfa-verify').click();
 await expect(page.locator('#mfa-status')).toContainText('could not be verified');
 expect(calls.filter(t=>t!=='besa_admins')).toEqual([]);
 await page.locator('#mfa-code').fill('123456');await page.locator('#mfa-verify').click();
 await expect(page.locator('#app-shell')).toBeVisible();await expect(page.locator('#nav-driver-count')).toHaveText('1');
});
test('human enrolment clears its setup key and QR after verification and supports sign-out',async({page})=>{
 await setup(page,{enrol:true});await expect(page.locator('#mfa-start')).toBeVisible();
 await page.locator('#mfa-start').click();await expect(page.locator('#mfa-secret')).toHaveText('SYNTHETIC-TEST-KEY');
 await page.locator('#mfa-code').fill('123456');await page.locator('#mfa-verify').click();
 await expect(page.locator('#app-shell')).toBeVisible();
 await expect(page.locator('#mfa-secret')).toBeEmpty();await expect(page.locator('#mfa-qr')).not.toHaveAttribute('src');
 await page.locator('#signout-button').click();await expect(page.locator('#app-shell')).toBeHidden();
});
test('two editors preserve conflicts and failed refreshes keep their unsaved draft',async({browser})=>{
 const shared={version:0,checklist:{}};
 const a=await browser.newPage(),b=await browser.newPage();
 await setup(a,{aal:'aal2',shared});await setup(b,{aal:'aal2',shared});
 for(const page of [a,b]){await expect(page.locator('#app-shell')).toBeVisible();await page.locator('[data-page="drivers"]').click();await expect(page.locator('#journey-status')).not.toContainText('Local draft only');}
 await a.locator('[data-tracker-field="requirements"]').first().selectOption('Yes');
 await expect.poll(()=>shared.version).toBe(1);
 await b.locator('[data-tracker-field="sam1"]').first().selectOption('Done');
 await expect(b.locator('#journey-status')).toContainText('Another editor');
 expect(shared.checklist.requirements).toBe(true);expect(shared.checklist.sam1).not.toBe(true);
 shared.fail=true;await b.bringToFront();await b.evaluate(()=>{window.confirm=()=>true;});await b.locator('#journey-reload-progress').click();
 await expect(b.locator('#journey-status')).toContainText('draft was kept');
 await expect(b.locator('[data-tracker-field="sam1"]').first()).toHaveValue('Done');
 shared.fail=false;await b.locator('#journey-reload-progress').click();
 await expect(b.locator('#journey-status')).toContainText('reloaded');
 await expect(b.locator('[data-tracker-field="requirements"]').first()).toHaveValue('Yes');
 await expect(b.locator('[data-tracker-field="sam1"]').first()).not.toHaveValue('Done');
 await a.close();await b.close();
});
test('the production package enforces CSP and imports real XLSX through the self-hosted bundle',async({page,request})=>{
 const response=await request.get(site);
 expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
 expect(response.headers()['cache-control']).toBe('no-store');
 await page.goto(site);
 const result=await page.evaluate(async()=>{
  const {loadExcelJS}=await import('./operations/lazy-excel.mjs');const ExcelJS=await loadExcelJS();
  const first=new ExcelJS.Workbook(),sheet=first.addWorksheet('Synthetic');sheet.addRow(['Registration','Status']);sheet.addRow(['SYNTH01','Active']);
  await sheet.protect('synthetic-only',{spinCount:10});sheet.unprotect();
  const bytes=await first.xlsx.writeBuffer(),second=new ExcelJS.Workbook();await second.xlsx.load(bytes);
  return {value:second.worksheets[0].getCell('A2').value,bytes:bytes.byteLength};
 });
 expect(result.value).toBe('SYNTH01');expect(result.bytes).toBeGreaterThan(1000);
 const blocked=await page.evaluate(()=>{const s=document.createElement('script');s.textContent='window.syntheticInlineExecuted=true';document.head.append(s);return window.syntheticInlineExecuted===true;});
 expect(blocked).toBe(false);
 for(const path of ['supabase/migrations/20261021091328_foundations_security_storage.sql','recovery/pre-foundations.pgp','package-lock.json','.env'])expect((await request.get(new URL('../'+path,site).href)).status()).toBe(404);
});
