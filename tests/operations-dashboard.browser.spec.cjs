const {test,expect}=require('@playwright/test');
const site=process.env.BESA_OFFICE_URL||'http://127.0.0.1:4173/index.html';
const date=offset=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const vehicles=[
 {id:'v1',registration:'TEST01',status:'Active',mot_due:date(-3),service_due:date(90),current_mileage:12000,service_due_mileage:10000},
 {id:'v2',registration:'TEST02',status:'In maintenance',mot_due:null,service_due:null,service_due_mileage:null},
 {id:'v3',registration:'TEST03',status:'Off hire',mot_due:null},
 {id:'v4',registration:'TEST04',status:'Active',mot_due:date(90),service_due:date(90)}
];
async function openWorkspace(page,{rows=vehicles,admin=true,checklists=true,activity=[]}={}){
 const calls=[];
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request();calls.push(request.method());
  const table=new URL(request.url()).pathname.split('/').pop();
  if(table==='besa_driver_journey'&&!checklists){await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST205',message:'not installed'})});return;}
  const body=table==='besa_admins'?(admin?[{email:'admin@example.test'}]:[]):table==='besa_vehicles'?rows:table==='besa_drivers'?[
   {id:'d1',first_name:'Test',last_name:'Active',status:'Active',licence_expiry:date(120)},
   {id:'d2',first_name:'Test',last_name:'Onboarding',status:'Onboarding',licence_expiry:date(120)}
  ]:table==='besa_activity'?activity:[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(site);
 await page.waitForFunction(()=>Boolean(window.besaClient));
 await page.evaluate(()=>{
  window.besaClient.auth.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null});
  window.besaClient.auth.signInWithPassword=async()=>({data:{session:{user:{id:'test-only-admin',email:'admin@example.test'},access_token:'test-only'}},error:null});
  window.besaClient.auth.signOut=async()=>({error:null});
 });
 await page.locator('#password-login-email').fill('admin@example.test');
 await page.locator('#password-login-password').fill('test-only-password');
 await page.locator('#password-login-submit').click();
 return calls;
}
test('MOT and service cards open matching operational tasks, including missing dates',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=await openWorkspace(page);
 await expect(page.locator('#kpi-vehicles')).toHaveText('4');
 await expect(page.locator('#kpi-mot')).toHaveText('2');
 await expect(page.locator('#kpi-service')).toHaveText('2');
 if(process.env.BESA_DASHBOARD_SCREENSHOT)await page.screenshot({path:process.env.BESA_DASHBOARD_SCREENSHOT});
 await page.locator('[data-dashboard-view="mot"]').click();
 await expect(page.locator('#compliance-requirement')).toHaveValue('MOT');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(2);
 await expect(page.locator('#compliance-rows')).not.toContainText('TEST03');
 await page.locator('#compliance-requirement').selectOption('Service');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(2);
 await page.locator('#compliance-filter').selectOption('overdue');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(1);
 await expect(page.locator('#compliance-rows')).toContainText('Service mileage reached');
 await page.locator('[data-page="dashboard"]').click();
 await page.locator('[data-dashboard-view="service"]').click();
 await expect(page.locator('#compliance-filter')).toHaveValue('attention');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(2);
 expect(calls.every(method=>method==='GET')).toBe(true);
 expect(errors).toEqual([]);
});
test('fleet shortcuts apply filters, reset old filters and preserve editing and sign-out',async({page})=>{
 const calls=await openWorkspace(page);
 await expect(page.locator('#missing-mot-note')).toContainText('1 operational');
 await page.locator('#missing-mot-note').click();
 await expect(page.locator('#vehicle-rows tr')).toHaveCount(1);
 await expect(page.locator('#vehicle-rows')).toContainText('TEST02');
 await page.locator('#vehicle-search').fill('does not exist');
 await expect(page.locator('#vehicle-rows tr')).toHaveCount(0);
 await page.locator('[data-page="dashboard"]').click();
 await page.locator('.fleet-status-link[data-vehicle-status="Off hire"]').click();
 await expect(page.locator('#vehicle-search')).toHaveValue('');
 await expect(page.locator('#vehicle-rows tr')).toHaveCount(1);
 await expect(page.locator('#vehicle-rows')).toContainText('TEST03');
 await page.locator('.vehicle-reg-edit').click();
 await expect(page.locator('#record-dialog')).toBeVisible();
 await expect(page.locator('#field-registration')).toHaveValue('TEST03');
 await page.locator('#cancel-dialog').click();
 await page.locator('[data-page="dashboard"]').click();
 await page.locator('.dashboard-stat[data-dashboard-view="vehicles"]').click();
 await expect(page.locator('#vehicle-rows tr')).toHaveCount(4);
 await page.locator('#signout-button').click();
 await expect(page.locator('#app-shell')).toBeHidden();
 await expect(page.locator('#password-login-form')).toBeVisible();
 expect(calls.every(method=>method==='GET')).toBe(true);
});
test('empty fleet is clear and non-administrators cannot open records',async({page})=>{
 await openWorkspace(page,{rows:[]});
 await expect(page.locator('#upcoming-list')).toContainText('No vehicles recorded yet');
 await page.locator('#signout-button').click();
 await openWorkspace(page,{admin:false});
 await expect(page.locator('#setup-description')).toContainText('does not have administrator access');
 await expect(page.locator('#data-content')).toBeHidden();
 await expect(page.locator('#primary-add')).toBeDisabled();
});
test('mobile login is direct and contains no trial workspace',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(site);
 await expect(page.locator('#password-login-form')).toBeVisible();
 await expect(page.locator('#trial-enter')).toHaveCount(0);
 await expect(page.locator('#live-login-toggle')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(process.env.BESA_OPERATIONS_SCREENSHOT)await page.screenshot({path:process.env.BESA_OPERATIONS_SCREENSHOT});
});
test('mobile dashboard opens active drivers with matching records',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await openWorkspace(page);
 await expect(page.locator('#kpi-vehicles')).toHaveText('4');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.locator('.dashboard-stat[data-dashboard-view="drivers"]').click();
 await expect(page.locator('#driver-filter')).toHaveValue('Active');
 await expect(page.locator('#journey-tracker-body tr')).toHaveCount(1);
 await expect(page.locator('#journey-tracker-body')).toContainText('Test Active');
});


test('review-status fleet counts match rows and mileage-only servicing is listed once',async({page})=>{
 await openWorkspace(page,{rows:[{id:'r1',registration:'REVIEW01',status:'Active',tracker_snapshot:{'Fleet status':'Needs review'},mot_due:null,service_due:null,current_mileage:20000,service_due_mileage:19000}]});
 await expect(page.locator('#kpi-vehicle-note')).toContainText('0 active');
 await expect(page.locator('.fleet-status-link[data-vehicle-status="Needs review"] strong')).toHaveText('1');
 await expect(page.locator('#kpi-service')).toHaveText('1');
 await page.locator('.fleet-status-link[data-vehicle-status="Needs review"]').click();
 await expect(page.locator('#vehicle-rows tr')).toHaveCount(1);await expect(page.locator('#vehicle-rows')).toContainText('REVIEW01');
 await page.locator('[data-page="compliance"]').click();await page.locator('#compliance-requirement').selectOption('Service');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(1);
});

test('local checklist changes are labelled and protected before leaving',async({page})=>{
 await openWorkspace(page);await page.locator('[data-page="drivers"]').click();
 await expect(page.locator('#journey-todo-count')).toHaveText('28');
 await page.locator('#signout-button').click();await openWorkspace(page,{checklists:false});await page.locator('[data-page="drivers"]').click();
 await expect(page.locator('#journey-todo-count')).toHaveText('Not connected');
 await page.locator('[data-tracker-field="requirements"]').first().selectOption('Yes');
 await expect(page.locator('#journey-status')).toContainText('Local draft only');
 expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
});


test('activity search and record-type filter show only matching saved changes',async({page})=>{
 await openWorkspace(page,{activity:[{id:'a1',record_label:'SYNTH01',entity:'besa_vehicles',action:'UPDATE',actor_email:'admin@example.test',created_at:new Date().toISOString()},{id:'a2',record_label:'Synthetic Driver',entity:'besa_drivers',action:'INSERT',actor_email:'admin@example.test',created_at:new Date().toISOString()}]});
 await page.locator('[data-page="activity"]').click();await expect(page.locator('#activity-count')).toHaveText('2 of 2 loaded changes');
 await page.locator('#activity-entity').selectOption('besa_vehicles');await expect(page.locator('#activity-list')).toContainText('SYNTH01');await expect(page.locator('#activity-list')).not.toContainText('Synthetic Driver');
 await page.locator('#activity-search').fill('missing record');await expect(page.locator('#activity-list')).toContainText('No matching saved changes');
});
