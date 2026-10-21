const {test,expect}=require('@playwright/test');
const home=process.env.BESA_PRODUCTION_URL||'http://127.0.0.1:4173/dist/company-site/';
const drivers=new URL('drivers/',home).href;
for(const width of [360,768,1440])test(`driver page, confirmed offer and contacts at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(drivers);
 await expect(page.getByRole('heading',{level:1})).toHaveText(/Your next route\.Your next chapter\./);
 await expect(page.locator('.driver-rate')).toHaveText(/£140\.40per day, plus VAT where applicable/);
 for(const label of ['2026 automatic vans','Vehicle insurance','Fuel cards','Free accountancy benefits'])await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
 for(const img of await page.locator('.delivery-photo img').all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);}
 await expect(page.locator('form[name="driver-application"]')).toBeVisible();
 expect(await page.locator('input[type="file"]').count()).toBe(0);
 await expect(page.locator('.application-contact a').first()).toHaveAttribute('href','https://wa.me/447477177362');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
test('driver interest validates required details and posts only to its own form handler',async({page})=>{
 let submitted;await page.route('**/drivers/thanks/',async route=>{
  const request=route.request();if(request.method()!=='POST')return route.continue();
  submitted=new URLSearchParams(request.postData());await route.fulfill({status:303,headers:{location:new URL('thanks/',drivers).href},body:''});
 });
 await page.goto(drivers);await page.locator('.driver-interest-form button').click();expect(submitted).toBeUndefined();
 await page.locator('#driver-name').fill('BESA website validation test');await page.locator('#driver-email').fill('besa-website-test@example.test');
 await page.locator('#driver-mobile').fill('07700 900123');await page.locator('#driver-postcode').fill('ME20');await page.locator('#driver-start').selectOption({label:'Within two weeks'});
 await page.locator('.driver-interest-form button').click();expect(submitted).toBeUndefined();
 await page.locator('#driver-privacy').check();await page.locator('.driver-interest-form button').click();
 await expect(page).toHaveURL(new URL('thanks/',drivers).href);await expect(page.getByRole('heading',{level:1})).toHaveText('Thanks for getting in touch.');
 expect(submitted.get('form-name')).toBe('driver-application');expect(submitted.get('email')).toBe('besa-website-test@example.test');expect(submitted.get('postcode-area')).toBe('ME20');expect(submitted.get('privacy-notice-read')).toBe('yes');
 expect([...submitted.keys()]).not.toContain('password');
});
