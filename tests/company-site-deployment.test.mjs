import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('dist/company-site/index.html');
test('production homepage launches with final-mile identity and working enquiry form',()=>{
 assert.match(html,/UK FINAL-MILE DELIVERY CARRIER/);
 assert.match(html,/official Amazon Delivery Service Partner/);
 assert.match(html,/independently owned and operated/);
 assert.doesNotMatch(html,/noindex|DESIGN PREVIEW|Contact details coming soon|is unchanged/);
 assert.match(html,/data-netlify="true"/);
 assert.match(html,/name="besa-contact"/);
 assert.match(html,/netlify-honeypot="bot-field"/);
 assert.match(html,/action="\/thanks"/);
 assert.match(html,/rel="canonical" href="https:\/\/besalogistics.co.uk\/"/);
 for(const f of ['parcel-handover','doorstep-delivery'])assert.ok(statSync(`dist/company-site/images/${f}.jpg`).size>10000);
});
test('office and onboarding are first-party static files with matching headers',()=>{
 for(const f of ['_headers','_redirects'])assert.equal(read('dist/company-site/'+f),read('company-site/hosting/'+f));
 assert.doesNotMatch(read('dist/company-site/_redirects'),/github\.io|https:\/\//);
 assert.match(read('dist/company-site/office/index.html'),/vendor\/supabase\.js/);
 assert.match(read('dist/company-site/onboarding/index.html'),/candidate-workspace/);
 assert.match(read('dist/company-site/_headers'),/Content-Security-Policy/);
 assert.match(read('dist/company-site/_headers'),/frame-ancestors 'none'/);
 assert.ok(statSync('dist/company-site/office/vendor/exceljs.min.js').size>100000);
});
