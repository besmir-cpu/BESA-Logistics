const {test,expect}=require('@playwright/test');
const base=process.env.BESA_PLATFORM_URL||'http://127.0.0.1:4173/';
async function setup(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__saved=[];window.__draft=null;window.__defer=false;window.__deferSave=false;window.__conflict=false;
    window.besaClient={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'},error:null})},getSession:async()=>({data:{session:{user:{id:'synthetic-admin',email:'admin@example.test'}}}})},
      from(table){
        const q={select(){return q},eq(){return q},order(){return q},limit(){return q},range(){return q},
          async maybeSingle(){if(window.__defer)await new Promise(resolve=>window.__release=resolve);return {data:window.__draft,error:null}},
          then(resolve,reject){return Promise.resolve({data:table==='besa_admins'?[{email:'admin@example.test'}]:table==='besa_drivers'?[{id:'d1',first_name:'Synthetic',last_name:'Driver',status:'Onboarding'}]:table==='besa_vehicles'?[{id:'v1',registration:'SYNTH01',status:'Active',tracker_snapshot:{'Fleet status':'Needs review'}}]:[],error:null}).then(resolve,reject)}};
        return q;
      },async rpc(name,args){
        if(window.__deferSave)await new Promise(resolve=>window.__releaseSave=resolve);
        window.__saved.push(args);
        return {data:[{saved:!window.__conflict,conflict:window.__conflict,current_version:window.__conflict?9:args.p_expected_version+1}],error:null};
      }};
  });return errors;
}
async function unsaved(page){return page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;});}
async function load(page){await page.getByRole('button',{name:'Load saved',exact:true}).click();await expect(page.locator('.besa-draft-message')).toContainText('No saved draft exists');}
async function save(page){page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Save securely',exact:true}).click();await expect(page.locator('.besa-draft-message')).toContainText('Secure version');}

test('empty planners add real register rows without fictitious shifts or verified insurance',async({page})=>{
  const errors=await setup(page);await page.goto(base+'rota.html');
  await expect(page.locator('#sheet-body tr.driver-row')).toHaveCount(0);
  await page.locator('#load-driver-register').click();
  await expect(page.locator('#sheet-body tr.driver-row')).toHaveCount(1);
  await page.locator('#load-driver-register').click();await expect(page.locator('#sheet-body tr.driver-row')).toHaveCount(1);
  expect(await page.evaluate(()=>window.besaDraftAPI.snapshot().shifts)).toEqual([]);
  await load(page);await save(page);expect(await unsaved(page)).toBe(false);
  await page.locator('#show-vans-tab').click();expect(await page.evaluate(()=>window.besaDraftAPI.snapshot().rows)).toEqual([]);
  await expect(page.getByRole('button',{name:'Save securely',exact:true})).toBeDisabled();
  await page.locator('#load-van-register').click();
  const payload=await page.evaluate(()=>window.besaDraftAPI.snapshot());
  expect(payload.rows[0].cells).toEqual(['SYNTH01','','','Needs review','','']);expect(payload.assigns).toEqual([]);
  await load(page);await save(page);expect(await unsaved(page)).toBe(false);
  expect(await page.evaluate(()=>window.__saved.map(x=>x.p_workspace))).toEqual(['rota','van-allocation']);
  expect(errors).toEqual([]);
});

test('manual planning rows can be securely saved without a workbook import',async({page})=>{
  await setup(page);await page.goto(base+'rota.html');await page.locator('#add-driver').click();
  await page.locator('#new-driver-name').fill('Synthetic Manual Driver');await page.locator('#driver-licence-manual').check();
  await page.locator('#driver-form button[type="submit"]').click();await load(page);await save(page);
  await page.locator('#show-vans-tab').click();await page.locator('#van-add').click();await page.locator('#van-new-reg').fill('SYNTH02');
  await page.locator('#van-add-form button[type="submit"]').click();await load(page);await save(page);
  expect(await page.evaluate(()=>window.__saved[1].p_payload.rows[0].cells[0])).toBe('SYNTH02');
});

test('delayed loads cannot restore into another tab or erase edits made while loading',async({page})=>{
  await setup(page);await page.goto(base+'rota.html');
  await page.evaluate(()=>{window.__defer=true;window.__draft={version:1,updated_at:new Date().toISOString(),payload:{schema:1,start:'2026-10-18',drivers:[],shifts:[],daily:[],calendar:[]}}});
  await page.getByRole('button',{name:'Load saved',exact:true}).click();await page.waitForFunction(()=>window.__release);
  await page.locator('#show-vans-tab').click();await page.evaluate(()=>{window.__release();window.__release=null;});
  await expect(page.getByRole('button',{name:'Load saved',exact:true})).toBeEnabled();
  await page.locator('#show-rota-tab').click();await expect(page.locator('.besa-draft-message')).toContainText('Nothing was replaced');
  await page.getByRole('button',{name:'Load saved',exact:true}).click();await page.waitForFunction(()=>window.__release);
  await page.locator('#load-driver-register').click();await page.evaluate(()=>{window.__release();window.__release=null;});
  await expect(page.locator('.besa-draft-message')).toContainText('Nothing was replaced');
  await expect(page.locator('#sheet-body tr.driver-row')).toHaveCount(1);
});

test('tracker save status follows each week and retains edits made during a pending save',async({page})=>{
  await setup(page);await page.goto(base+'payment-tracker.html');
  await page.locator('[data-row="3"][data-col="4"]').fill('12');expect(await unsaved(page)).toBe(true);
  await load(page);await page.evaluate(()=>window.__deferSave=true);page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Save securely',exact:true}).click();await page.waitForFunction(()=>window.__releaseSave);
  await page.locator('[data-row="3"][data-col="4"]').fill('13');await page.evaluate(()=>window.__releaseSave());
  await expect(page.locator('.besa-draft-message')).toContainText('More recent edits still need saving');expect(await unsaved(page)).toBe(true);
  await page.evaluate(()=>window.__deferSave=false);await save(page);expect(await unsaved(page)).toBe(false);
  await page.locator('#next-week').click();await expect(page.getByRole('button',{name:'Save securely',exact:true})).toBeDisabled();
  await page.locator('[data-row="3"][data-col="4"]').fill('7');await page.locator('#prev-week').click();
  await expect(page.locator('#total-routes')).toHaveText('13');expect(await unsaved(page)).toBe(true);
});

test('conflicting secure save leaves current tracker values and unsaved warning intact',async({page})=>{
  await setup(page);await page.goto(base+'payment-tracker.html');await load(page);
  await page.locator('[data-row="3"][data-col="4"]').fill('23');await page.evaluate(()=>window.__conflict=true);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Save securely',exact:true}).click();
  await expect(page.locator('.besa-draft-message')).toContainText('Another editor');await expect(page.locator('#total-routes')).toHaveText('23');expect(await unsaved(page)).toBe(true);
});

test('work hours filters match totals and replacing a file cannot save an old summary',async({page})=>{
  await setup(page);await page.goto(base+'payments.html');
  await page.evaluate(()=>window.besaDraftAPI.restore({schema:1,kind:'review-only-hours',summary:[{driver:'Synthetic A',week:'2026-10-18',hours:8,shifts:1,dates:1},{driver:'Synthetic B',week:'2026-10-18',hours:5,shifts:1,dates:1}],warnings:[]}));
  await expect(page.locator('#payment-hours-total')).toHaveText('13.00');await page.locator('#payment-search').fill('Synthetic A');
  await expect(page.locator('#payment-hours-total')).toHaveText('8.00');await expect(page.locator('#payment-drivers-count')).toHaveText('1');
  await page.locator('#payment-file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('Driver,Hours\nSynthetic C,7\n')});
  await expect(page.locator('#payment-results')).toBeHidden();await load(page);
  await page.getByRole('button',{name:'Save securely',exact:true}).click();await expect(page.locator('.besa-draft-message')).toContainText('calculate its summary');
  expect(await page.evaluate(()=>window.__saved)).toEqual([]);
});

test('cancelling a newer load retains the previous conflict-check version',async({page})=>{
  await setup(page);await page.goto(base+'payment-tracker.html');
  await page.evaluate(()=>{const key=window.besaDraftAPI.identify().key;window.__draft={version:1,updated_at:new Date().toISOString(),payload:{schema:1,week:key,entries:[['3|4','23']]}}});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Load saved',exact:true}).click();await expect(page.locator('#total-routes')).toHaveText('23');
  await page.evaluate(()=>{window.__draft.version=9;window.__draft.payload.entries=[['3|4','99']];window.__conflict=true;});
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Load saved',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save securely',exact:true})).toBeEnabled();
  await page.locator('[data-row="3"][data-col="4"]').fill('24');page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Save securely',exact:true}).click();await expect(page.locator('.besa-draft-message')).toContainText('Another editor');
  expect(await page.evaluate(()=>window.__saved[0].p_expected_version)).toBe(1);await expect(page.locator('#total-routes')).toHaveText('24');
});

test('one driver cannot be assigned to two vans on the same day',async({page})=>{
  await setup(page);await page.goto(base+'rota.html#vans');
  await page.evaluate(()=>window.besaDraftAPI.restore({schema:1,start:'2026-10-18',rows:[{id:'a',cells:['SYNTH01','','','','','']},{id:'b',cells:['SYNTH02','','','','','']}],dateCols:[],sourceHead:[],generatedDates:[],assigns:[['a|2026-10-18','Synthetic Driver']]}));
  await page.locator('[data-vehicle="b"][data-day="2026-10-18"]').click();await page.locator('#van-assignment').fill('Synthetic Driver');await page.locator('#van-edit-form button[type="submit"]').click();
  await expect(page.locator('#van-status')).toContainText('already assigned');
  expect(await page.evaluate(()=>window.besaDraftAPI.snapshot().assigns)).toEqual([['a|2026-10-18','Synthetic Driver']]);
});

test('malformed planning snapshots are rejected before changing existing rows',async({page})=>{
  await setup(page);await page.goto(base+'rota.html');await page.locator('#load-driver-register').click();
  const preserved=await page.evaluate(()=>{const before=window.besaDraftAPI.snapshot();try{window.besaDraftAPI.restore({...before,start:'2027-02-31',drivers:[null]});}catch{}return JSON.stringify(before)===JSON.stringify(window.besaDraftAPI.snapshot());});expect(preserved).toBe(true);
  await page.locator('#show-vans-tab').click();await page.locator('#load-van-register').click();
  const vans=await page.evaluate(()=>{const before=window.besaDraftAPI.snapshot();try{window.besaDraftAPI.restore({...before,start:'2027-01-03',rows:[{id:'bad',cells:null}]});}catch{}return JSON.stringify(before)===JSON.stringify(window.besaDraftAPI.snapshot());});expect(vans).toBe(true);
});

test('all standalone operations pages keep mobile scrolling inside their worksheet',async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});
  for(const file of ['rota.html','payments.html','payment-tracker.html']){
    await page.goto(base+file);await expect(page.locator('#besa-draft-bar')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:file}).toBeLessThanOrEqual(1);
  }
});
