import {cpSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Additive, deterministic build. Upload only this dedicated output folder.
const source=resolve('company-site'), output=resolve('dist/company-site');
mkdirSync(output,{recursive:true});
for(const name of ['styles.css','site.js','site-config.js','favicon.svg','images'])cpSync(`${source}/${name}`,`${output}/${name}`,{recursive:true});
for(const name of ['_headers','_redirects','robots.txt','sitemap.xml'])cpSync(`${source}/hosting/${name}`,`${output}/${name}`);
let html=readFileSync(`${source}/index.html`,'utf8')
 .replace(/\s*<meta name="robots" content="noindex,nofollow">/,'')
 .replace(/\s*<div class="preview-banner"[\s\S]*?<\/div>/,'')
 .replace('Independent company website preview','UK final-mile delivery')
 .replace(/<div class="contact-placeholder" id="contact-placeholder">[\s\S]*?<\/div>/,readFileSync(`${source}/hosting/contact-form.html`,'utf8'))
 .replace('</head>','  <link rel="canonical" href="https://besalogistics.co.uk/">\n  <meta property="og:url" content="https://besalogistics.co.uk/">\n</head>');
writeFileSync(`${output}/index.html`,html);
for(const [name,title,message] of [['thanks','Thank you','Your enquiry has been received.'],['404','Page not found','The page you requested could not be found.']]){
 writeFileSync(`${output}/${name}.html`,`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | BESA Logistics</title><link rel="stylesheet" href="/styles.css?v=2"></head><body><main class="container section"><h1>${title}</h1><p>${message}</p><a href="/">Return to BESA Logistics</a></main></body></html>`);
}
if(!existsSync(`${output}/images/parcel-handover.jpg`))throw Error('Missing licensed hero photograph');
console.log(`Production website built at ${output}; office and onboarding proxy rules preserved.`);
