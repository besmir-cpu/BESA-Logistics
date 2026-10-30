const {test,expect}=require('@playwright/test');
const home=process.env.BESA_PRODUCTION_URL||'http://127.0.0.1:4173/dist/company-site/';
for(const width of [360,768,1440,1920])test(`production layout, photos and enquiry form at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(home);
 if(process.env.BESA_SCREENSHOT_DIR)await page.screenshot({path:process.env.BESA_SCREENSHOT_DIR+'/besa-'+width+'.png',fullPage:true});
 await expect(page.getByRole('heading',{level:1})).toHaveText('BESA Logistics.DeliveringAmazon parcels.');
 await expect(page.locator('.home-hero')).toContainText('OFFICIAL AMAZON DELIVERY SERVICE PARTNER');
 await expect(page.locator('.hero-description')).toContainText('Aylesford, Kent');
 await expect(page.locator('.home-hiring')).toContainText('2026 automatic van at no cost');
 await expect(page.locator('#approach')).toContainText('Fatigue, illness or an unsafe delivery stop');
 if(width>=1440){
  const contentWidth=await page.locator('.home-hero-grid').evaluate(e=>{const s=getComputedStyle(e);return e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);});
  expect(contentWidth).toBeGreaterThanOrEqual(width*.78);
 }
 for(const img of await page.locator('.delivery-photo img').all()){
  await img.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  await expect.poll(()=>img.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
 }
 await expect(page.locator('form[name="besa-contact"]')).toBeVisible();
 expect(await page.locator('input[type=file]').count()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
