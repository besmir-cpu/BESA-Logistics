const {test,expect}=require('@playwright/test');
const base='http://127.0.0.1:4173';
const token='A'.repeat(43);
test('invitation without a valid private token cannot open onboarding',async({page})=>{
 let privateCalls=0;
 page.on('request',req=>{if(req.url().includes('/functions/v1/besa-candidate-intake'))privateCalls++;});
 await page.goto(base+'/candidate-onboarding.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#candidate-invalid')).toBeVisible();
 await expect(page.locator('#candidate-workspace')).toBeHidden();
 expect(privateCalls).toBe(0);
});
test('candidate submits personal details and mock passport/licence photos with mobile screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/functions/v1/besa-candidate-intake',async route=>{
  const req=route.request(),post=req.postData()||'';
  if(post.includes('"action":"status"')){
    calls.push('status');
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({first_name:'Sample',submitted:false,
       expires_at:'2030-10-25T12:00:00Z',uploaded_types:[]})});
  }
  if(post.includes('"action":"submit"')){
    calls.push('submit');
    const data=JSON.parse(post);
    expect(data.details.first_name).toBe('Alex');
    expect(data.details.declaration).toBe(true);
    expect(data.details.privacy_acknowledged).toBe(true);
    return route.fulfill({status:200,contentType:'application/json',
      body:'{"submitted":true}'});
  }
  calls.push('upload');
  return route.fulfill({status:200,contentType:'application/json',body:'{"uploaded":true}'});
 });
 await page.goto(base+'/candidate-onboarding.html#invite='+token,{waitUntil:'domcontentloaded'});
 await expect(page.locator('#candidate-workspace')).toBeVisible();
 const fill=async(name,value)=>page.locator('[name="'+name+'"]').fill(value);
 await fill('first_name','Alex');await fill('last_name','Example');
 await fill('date_of_birth','1990-04-03');await fill('email','alex@example.test');
 await fill('phone','07700900123');await fill('address_1','10 Example Street');
 await fill('city','London');await fill('postcode','SW1A 1AA');
 await page.locator('#next-1').click();
 await expect(page.locator('[data-panel="2"]')).toBeVisible();
 await page.locator('[name="licence_type"]').selectOption('Manual');
 await fill('licence_expiry','2030-04-03');
 await page.locator('[name="right_to_work_type"]').selectOption('UK or Irish passport');
 await page.locator('#next-2').click();
 await expect(page.locator('[data-panel="3"]')).toBeVisible();
 const pdf={name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic only')};
 for(const kind of ['driving-licence-front','driving-licence-back','passport']){
  const card=page.locator('.document-card[data-doc="'+kind+'"]');
  await card.locator('input[type=file]').setInputFiles(pdf);
  await card.locator('.upload-button').click();
  await expect(card.locator('.upload-state')).toContainText('securely uploaded');
 }
 await page.locator('#privacy_acknowledged').check();
 await page.locator('#declaration').check();
 await page.locator('#candidate-submit').click();
 await expect(page.locator('#candidate-finished')).toBeVisible();
 expect(calls).toEqual(['status','upload','upload','upload','submit']);
 expect(errors).toEqual([]);
});
