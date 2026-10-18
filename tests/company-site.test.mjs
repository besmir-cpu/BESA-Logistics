import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('company-site/index.html');
const css=read('company-site/styles.css');
const js=read('company-site/site.js');
const config=read('company-site/site-config.js');

test('company website is independent of operations dashboard and has BESA branding',()=>{
 for(const label of ['BESA Logistics','WHAT WE DO','CAREERS AT BESA','ABOUT US','GET IN TOUCH','14938271']){
  assert.ok(html.includes(label),label);
 }
 assert.ok(html.includes('noindex,nofollow'),'preview is not indexed before launch');
 assert.ok(html.includes('Independent company website preview'));
 assert.ok(html.includes('203 Kilburn High Road'));
 assert.ok(!html.includes('®'),'do not assume trademark registration');
});
test('internal links point to real semantic page sections',()=>{
 const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
 for(const href of [...html.matchAll(/href="#([^"]+)"/g)].map(x=>x[1])){
  assert.ok(ids.has(href),'Missing section ID for #'+href);
 }
 for(const section of ['main','services','approach','about','careers','contact'])assert.ok(ids.has(section),section);
});
test('mobile navigation, accessible focus and reduced motion support exist',()=>{
 for(const fragment of ['aria-expanded="false"','aria-controls="primary-nav"','aria-label="Main navigation"','Skip to content']){
  assert.ok(html.includes(fragment),fragment);
 }
 assert.ok(css.includes('@media(max-width:800px)'));
 assert.ok(css.includes('@media(max-width:560px)'));
 assert.ok(css.includes('prefers-reduced-motion'));
 assert.ok(js.includes("key === 'Escape'"));
 assert.ok(js.includes('menu.setAttribute(\'aria-expanded\''));
});
test('no invented contact details, public file submissions, or third-party tracking',()=>{
 assert.ok(config.includes("contactEmail: ''"));
 assert.ok(config.includes("contactPhone: ''"));
 assert.ok(!html.includes('<form'));
 assert.ok(!html.includes('getPublicUrl'));
 assert.ok(!html.includes('google-analytics'));
 assert.ok(!html.includes('https://cdn.'));
 assert.ok(!html.includes('candidate-onboarding.html#invite='));
 assert.ok(!html.includes('Amazon partner'));
 assert.ok(!html.includes('same-day guarantee'));
 assert.ok(js.includes("link.href = 'mailto:'"));
 assert.ok(js.includes("link.href = 'tel:'"));
});
test('no custom-domain CNAME is proposed in the existing operations repo',()=>{
 const readme=read('company-site/README.md');
 assert.ok(readme.includes('Do not do that'));
 assert.ok(readme.includes('company-site'));
 assert.ok(readme.includes('MX/SPF/DKIM/DMARC'));
 assert.ok(readme.includes('backup admin'));
});
