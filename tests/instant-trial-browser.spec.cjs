const {test,expect}=require('@playwright/test');
const site='http://127.0.0.1:4173';
test('One-click trial opens fake office data with no private database reads or writes',async({page})=>{
  const privateCalls=[],errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',req=>{
    if(req.url().includes('.supabase.co/rest/v1/')||
       req.url().includes('.supabase.co/functions/v1/'))
      privateCalls.push(req.method()+' '+req.url());
  });
  await page.goto(site+'/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#trial-enter')).toBeVisible();
  await expect(page.locator('#login-form')).toBeHidden();
  await page.locator('#trial-enter').click();
  await expect(page.locator('#app-shell')).toBeVisible();
  await expect(page.locator('#besa-trial-banner')).toContainText('Example data only');
  await expect(page.locator('#kpi-vehicles')).toHaveText('4');
  await expect(page.locator('#kpi-drivers')).toHaveText('2');
  await page.locator('a[data-page=vehicles]').click();
  await expect(page.locator('#vehicle-rows')).toContainText('DEMO01');
  await page.locator('#primary-add').click();
  await expect(page.locator('#record-dialog')).toBeVisible();
  await page.locator('#field-registration').fill('DEMO99');
  await page.locator('#save-record').click();
  await expect(page.locator('#kpi-vehicles')).toHaveText('5');
  await expect(page.locator('#vehicle-rows')).toContainText('DEMO99');
  await expect(page.locator('#global-status')).toContainText('no live data was saved');
  await page.locator('a[data-page=drivers]').click();
  await expect(page.locator('#driver-rows')).toContainText('Sample');
  // Driver list is behind the recruitment spreadsheet view by default.
  // Dispatching this event tests the privacy guard even if that view is hidden.
  await page.locator('[data-driver-profile]').first().dispatchEvent('click');
  await expect(page.locator('#global-status')).toContainText('require secure sign-in');
  expect(privateCalls).toEqual([]);
  expect(errors).toEqual([]);
});
test('Trial exit and browser reload reset demo data; protected live access is still separate',async({page})=>{
  await page.goto(site+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#trial-enter').click();
  await expect(page.locator('#account-email')).toContainText('Demo');
  await page.locator('#signout-button').click();
  await expect(page.locator('#app-shell')).toBeHidden();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#live-login-toggle').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#app-shell')).toBeHidden();
  await expect(page.locator('#trial-enter')).toBeVisible();
  await expect(page.locator('#login-form')).toBeHidden();
});
