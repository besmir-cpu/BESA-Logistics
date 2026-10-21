import {mkdirSync,writeFileSync} from 'node:fs';
// GitHub Pages is a bookmark compatibility service. All application content,
// headers and authentication now use the company domain on Netlify.
const root='dist/legacy-pages';mkdirSync(root,{recursive:true});
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; base-uri \'none\'"><title>BESA Logistics — moved</title><script defer src="legacy-redirect.js"></script></head><body><h1>BESA Logistics operations</h1><p>Our office is now on the company website.</p><a href="https://besalogistics.co.uk/office/">Open BESA operations</a></body></html>';
for(const name of ['index.html','404.html','rota.html','payments.html','payment-tracker.html','recruitment.html','candidate-onboarding.html'])writeFileSync(root+'/'+name,html);
writeFileSync(root+'/legacy-redirect.js',`(()=>{const file=location.pathname.split('/').pop();const pages=new Set(['rota.html','payments.html','payment-tracker.html','recruitment.html']);const destination=file==='candidate-onboarding.html'?'https://besalogistics.co.uk/onboarding/':pages.has(file)?'https://besalogistics.co.uk/office/'+file:'https://besalogistics.co.uk/office/';location.replace(destination+location.hash);})();`);
writeFileSync(root+'/.nojekyll','');
console.log('Built company-domain redirects; no application data or credentials are published on GitHub Pages.');
