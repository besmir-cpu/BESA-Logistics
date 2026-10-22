const {test,expect}=require('@playwright/test');
const site=process.env.BESA_OFFICE_URL||'http://127.0.0.1:4173/index.html';
const date=offset=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const vehicles=[
 {id:'v1',registration:'TEST01',status:'Active',mot_due:date(-3),service_due:date(90),current_mileage:12000,service_due_mileage:10000},
 {id:'v2',registration:'TEST02',status:'In maintenance',mot_due:null,service_due:null,service_due_mileage:null},
 {id:'v3',registration:'TEST03',status:'Off hire',mot_due:null},
 {id:'v4',registration:'TEST04',status:'Active',mot_due:date(90),service_due:date(90)}
];
async function openWorkspace(page,{rows=vehicles,admin=true,checklists=true,activity=[],drivers}={}){
 const calls=[];
 await page.route('**/rest/v1/**',async route=>{
  const request=route.request();calls.push(request.method());
  const table=new URL(request.url()).pathname.split('/').pop();
  if(table==='besa_driver_journey'&&!checklists){await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST205',message:'not installed'})});return;}
  const body=table==='besa_admins'?(admin?[{email:'admin@example.test'}]:[]):table==='besa_vehicles'?rows:table==='besa_drivers'?(drivers||[
   {id:'d1',first_name:'Test',last_name:'Active',status:'Active',licence_expiry:date(120)},
   {id:'d2',first_name:'Test',last_name:'Onboarding',status:'Onboarding',licence_expiry:date(120)}
  ]):table==='besa_activity'?activity:[];
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

test('mileage-only service schedules distinguish approaching, future and overdue work',async({page})=>{
 await openWorkspace(page,{rows:[
  {id:'m1',registration:'MILES01',status:'Active',mot_due:date(90),current_mileage:19500,service_due_mileage:20000},
  {id:'m2',registration:'MILES02',status:'Active',mot_due:date(90),current_mileage:17000,service_due_mileage:20000},
  {id:'m3',registration:'MILES03',status:'Active',mot_due:date(90),current_mileage:21000,service_due_mileage:20000}
 ]});
 await expect(page.locator('#kpi-service')).toHaveText('2');
 await page.locator('[data-dashboard-view="service"]').click();
 await expect(page.locator('#compliance-rows tr')).toHaveCount(2);
 await expect(page.locator('#compliance-rows')).toContainText('500 miles');
 await page.locator('#compliance-filter').selectOption('missing');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(0);
 await page.locator('#compliance-filter').selectOption('all');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(3);
});

test('an overdue service date takes priority over approaching mileage and missing readings are explicit',async({page})=>{
 await openWorkspace(page,{rows:[{id:'s1',registration:'LATE01',status:'Active',mot_due:date(90),service_due:date(-2),current_mileage:19500,service_due_mileage:20000},{id:'s2',registration:'READ01',status:'Active',mot_due:date(90),service_due_mileage:20000}]});
 await page.locator('[data-dashboard-view="service"]').click();await expect(page.locator('#compliance-rows')).toContainText('2 days overdue');
 await expect(page.locator('#compliance-rows')).toContainText('Current mileage missing');
 await page.locator('#compliance-filter').selectOption('soon');await expect(page.locator('#compliance-rows tr')).toHaveCount(0);
 await page.locator('#compliance-filter').selectOption('overdue');await expect(page.locator('#compliance-rows tr')).toHaveCount(1);
});

test('closing or escaping an edited vehicle keeps entries unless discard is confirmed',async({page})=>{
 await openWorkspace(page);await page.locator('[data-page="vehicles"]').click();
 await page.locator('.vehicle-reg-edit').first().click();await page.locator('#field-notes').fill('Unsaved synthetic note');
 page.once('dialog',d=>d.dismiss());await page.locator('#cancel-dialog').click();
 await expect(page.locator('#record-dialog')).toBeVisible();await expect(page.locator('#field-notes')).toHaveValue('Unsaved synthetic note');
 expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(page.locator('#record-dialog')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.locator('#close-dialog').click();await expect(page.locator('#record-dialog')).toBeHidden();
});

test('daily priorities clear stale filters and include recorded cover and driver deadlines',async({page})=>{
 const calls=await openWorkspace(page,{rows:[{id:'a',registration:'COVER01',status:'Active',mot_due:date(90),service_due:date(90),tax_due:date(-2),insurance_due:date(10)},{id:'p',registration:'PRIVATE01',status:'Personal',mot_due:date(-5),service_due:date(-5)}],drivers:[{id:'d1',first_name:'Synthetic',last_name:'Driver',status:'Active',licence_expiry:date(5)}]});
 await expect(page.locator('#priority-cover')).toHaveText('2');await expect(page.locator('#priority-drivers')).toHaveText('1');
 await page.locator('[data-dashboard-view="cover"]').click();await expect(page.locator('#compliance-rows tr')).toHaveCount(2);
 await page.locator('#compliance-search').fill('old filter');await page.locator('#compliance-requirement').selectOption('MOT');
 await page.locator('[data-page="dashboard"]').click();await page.locator('[data-dashboard-view="driver-checks"]').click();
 await expect(page.locator('#compliance-search')).toHaveValue('');await expect(page.locator('#compliance-requirement')).toHaveValue('');
 await expect(page.locator('#compliance-rows tr')).toHaveCount(1);await expect(page.locator('#compliance-rows')).toContainText('Synthetic Driver');
 await page.locator('[data-page="dashboard"]').click();await page.locator('[data-dashboard-view="attention"]').click();
 await expect(page.locator('#compliance-group')).toHaveValue('');await expect(page.locator('#compliance-rows tr')).toHaveCount(3);
 expect(calls.every(method=>method==='GET')).toBe(true);
});

test('daily vehicle view keeps all 27 export columns and insurance renewal remains editable',async({page})=>{
 await openWorkspace(page);await page.locator('[data-page="vehicles"]').click();
 await expect(page.locator('#vehicle-headings th')).toHaveCount(9);
 await page.locator('#vehicle-view').selectOption('full');await expect(page.locator('#vehicle-headings th')).toHaveCount(27);
 const download=page.waitForEvent('download');await page.locator('#export-vehicles').click();
 const file=await download;const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 expect(Buffer.concat(chunks).toString('utf8').split('\r\n')[0].split(',')).toHaveLength(27);
 await page.locator('.vehicle-reg-edit').first().click();await expect(page.locator('#field-insurance_due')).toBeVisible();await page.locator('#cancel-dialog').click();
});

test('vehicle saves retain the concurrency guard and store an insurance renewal without a schema change',async({page})=>{
 let write;
 await openWorkspace(page,{rows:[{id:'v1',registration:'SYNTH01',status:'Active',updated_at:'2026-10-21T09:00:00Z'}]});
 await page.route('**/rest/v1/besa_vehicles?**',async route=>{
  if(route.request().method()!=='PATCH')return route.fallback();
  write={url:route.request().url(),payload:route.request().postDataJSON()};await route.fulfill({status:200,contentType:'application/json',body:'{"id":"v1"}'});
 });
 await page.locator('[data-page="vehicles"]').click();await page.locator('.vehicle-reg-edit').click();
 await page.locator('#field-insurance_due').fill('2027-01-15');await page.locator('#save-record').click();
 await expect(page.locator('#record-dialog')).toBeHidden();expect(write.payload.insurance_due).toBe('2027-01-15');
 expect(new URL(write.url).searchParams.get('updated_at')).toBe('eq.2026-10-21T09:00:00Z');
});

test('a delayed conflicting save keeps the vehicle form and unsaved entries intact',async({page})=>{
 let release;
 await openWorkspace(page,{rows:[{id:'v1',registration:'SYNTH01',status:'Active',updated_at:'2026-10-21T09:00:00Z'}]});
 await page.route('**/rest/v1/besa_vehicles?**',async route=>{
  if(route.request().method()!=='PATCH')return route.fallback();
  await new Promise(resolve=>release=resolve);await route.fulfill({status:200,contentType:'application/json',body:'null'});
 });
 await page.locator('[data-page="vehicles"]').click();await page.locator('.vehicle-reg-edit').click();await page.locator('#field-notes').fill('Keep this synthetic note');await page.locator('#save-record').click();
 await expect(page.locator('#field-notes')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.locator('#record-dialog')).toBeVisible();
 await expect.poll(()=>Boolean(release)).toBe(true);release();
 await expect(page.locator('#form-status')).toContainText('another window');await expect(page.locator('#field-notes')).toBeEnabled();await expect(page.locator('#field-notes')).toHaveValue('Keep this synthetic note');
 page.once('dialog',d=>d.accept());await page.locator('#cancel-dialog').click();
});

for(const width of [360,768,1440])test(`daily dashboard and vehicle controls fit a ${width}px screen`,async({page})=>{
 await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await openWorkspace(page);await expect(page.locator('#priority-data')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(process.env.BESA_OPS_SCREENSHOT_DIR)await page.screenshot({path:process.env.BESA_OPS_SCREENSHOT_DIR+`/dashboard-${width}.png`,fullPage:true});
 await page.locator('[data-page="vehicles"]').click();await expect(page.locator('#vehicle-headings th')).toHaveCount(9);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(process.env.BESA_OPS_SCREENSHOT_DIR)await page.screenshot({path:process.env.BESA_OPS_SCREENSHOT_DIR+`/vehicles-${width}.png`,fullPage:true});
 expect(errors).toEqual([]);
});
