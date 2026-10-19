const {test,expect}=require('@playwright/test');
const site='http://127.0.0.1:4173';
test('Live login has password option, but the no-email trial has no private access',async({page})=>{
  const restCalls=[];
  page.on('request',r=>{
    if(r.url().includes('.supabase.co/rest/v1/')||r.url().includes('.supabase.co/functions/v1/'))
      restCalls.push(r.url());
  });
  await page.goto(site+'/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#password-login-form')).toBeHidden();
  await expect(page.locator('#email-link-login')).toBeHidden();
  await page.locator('#trial-enter').click();
  await expect(page.locator('#set-password-open')).toBeHidden();
  await expect(page.locator('#besa-trial-banner')).toBeVisible();
  expect(restCalls).toEqual([]);
});
test('Admin password sign-in calls Supabase Auth, then still checks database admin membership',async({page})=>{
  const events=[];
  await page.route('**/rest/v1/**',async route=>{
    const url=route.request().url();
    if(url.includes('/besa_admins')){
      events.push('admin-check');
      return route.fulfill({status:200,contentType:'application/json',body:'[{"email":"admin@example.test"}]'});
    }
    events.push('database');
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await page.goto(site+'/index.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    window.besaClient.auth.signInWithPassword=async({email,password})=>{
      window.__testSignIn={email,passwordWasProvided:password==='test-only-passphrase'};
      return {data:{session:{user:{id:'test-admin-id',email:'admin@example.test'},access_token:'test-no-real-token'}},error:null};
    };
    window.besaClient.auth.updateUser=async({password})=>{
      window.__testPasswordUpdated=password==='another-test-only-passphrase';
      return {data:{user:{id:'test-admin-id'}},error:null};
    };
  });
  await page.locator('#live-login-toggle').click();
  await page.locator('#password-login-email').fill('admin@example.test');
  await page.locator('#password-login-password').fill('test-only-passphrase');
  await page.locator('#password-login-submit').click();
  await expect.poll(()=>page.evaluate(()=>window.__testSignIn?.email)).toBe('admin@example.test');
  await expect.poll(()=>events.includes('admin-check')).toBeTruthy();
  await expect(page.locator('#set-password-open')).toBeVisible({timeout:12000});
  await page.locator('#set-password-open').click();
  await expect(page.locator('#set-password-dialog')).toBeVisible();
  await page.locator('#set-password-value').fill('another-test-only-passphrase');
  await page.locator('#set-password-confirm').fill('another-test-only-passphrase');
  await page.locator('#set-password-save').click();
  await expect.poll(()=>page.evaluate(()=>window.__testPasswordUpdated)).toBe(true);
  await expect(page.locator('#set-password-dialog')).toBeHidden();
});
test('Magic link callback stays at BESA office origin; request timing is clearly labelled',async({page})=>{
  await page.goto(site+'/index.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    history.replaceState(null,'','/office/');
    window.besaClient.auth.signInWithOtp=async(args)=>{
      window.__testOtp=args;
      return {error:null};
    };
  });
  await page.locator('#live-login-toggle').click();
  await page.locator('#email-link-login summary').click();
  await page.locator('#login-email').fill('admin@example.test');
  await page.locator('#login-submit').click();
  await expect.poll(()=>page.evaluate(()=>window.__testOtp?.options?.emailRedirectTo)).toBe(site+'/office/');
  await expect(page.locator('#login-status')).toContainText('Email delivery may take longer');
  await expect(page.locator('#login-submit')).toBeDisabled();
});
