import {cpSync,readFileSync,writeFileSync,mkdirSync,existsSync,rmSync,readdirSync,statSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
// Publish an explicit allowlist. Source, migrations, tests and recovery files
// never enter the website package. Rebuilds remove obsolete public assets.
const source=resolve('company-site'), output=resolve('dist/company-site');
if(!output.startsWith(resolve('dist')+sep))throw Error('Invalid website output directory');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const name of ['styles.css','site.js','site-config.js','favicon.svg','images'])cpSync(`${source}/${name}`,`${output}/${name}`,{recursive:true});
for(const name of ['_headers','_redirects','robots.txt','sitemap.xml'])cpSync(`${source}/hosting/${name}`,`${output}/${name}`);
function buildPublicPage(path,route){
 const html=readFileSync(`${source}/${path}`,'utf8')
 .replace(/\s*<meta name="robots" content="noindex,nofollow">/,'')
 .replace(/\s*<div class="preview-banner"[\s\S]*?<\/div>/,'')
 .replace('Independent company website preview','UK final-mile delivery')
 .replace(/<div class="contact-placeholder" id="contact-placeholder"(?: hidden)?>[\s\S]*?<\/div>/,readFileSync(`${source}/hosting/contact-form.html`,'utf8'))
 .replace('</head>','  <link rel="canonical" href="https://besalogistics.co.uk'+route+'">\n  <meta property="og:url" content="https://besalogistics.co.uk'+route+'">\n</head>');
 const destination=resolve(output,path);mkdirSync(resolve(destination,'..'),{recursive:true});writeFileSync(destination,html);
}
for(const [path,route] of [['index.html','/'],['drivers/index.html','/drivers/'],['privacy/index.html','/privacy/']])buildPublicPage(path,route);
mkdirSync(`${output}/drivers/thanks`,{recursive:true});writeFileSync(`${output}/drivers/thanks/index.html`,readFileSync(`${source}/drivers/thanks/index.html`,'utf8').replace('Independent company website preview','UK final-mile delivery'));
for(const [name,title,message] of [['thanks','Thank you','Your enquiry has been received.'],['404','Page not found','The page you requested could not be found.']]){
 writeFileSync(`${output}/${name}.html`,`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | BESA Logistics</title><link rel="stylesheet" href="/styles.css?v=5"></head><body><main class="container section"><h1>${title}</h1><p>${message}</p><a href="/">Return to BESA Logistics</a></main></body></html>`);
}
const office=resolve(output,'office'),onboarding=resolve(output,'onboarding');
mkdirSync(office,{recursive:true});mkdirSync(onboarding,{recursive:true});
for(const name of ['index.html','app.js','config.js','styles.css','besa-theme.css','rota.html','payments.html','payment-tracker.html','recruitment.html'])cpSync(name,resolve(office,name));
function copyAssets(folder){
  for(const item of readdirSync(folder)){
    const path=resolve(folder,item);
    if(statSync(path).isDirectory()){copyAssets(folder+'/'+item);continue;}
    if(!['.js','.mjs','.css','.svg','.woff2'].includes(extname(item))||/\.test\.|\.spec\./.test(item))continue;
    const destination=resolve(office,folder,item);mkdirSync(resolve(destination,'..'),{recursive:true});cpSync(path,destination);
  }
}
for(const folder of ['operations','driver-journey','rota','payments'])copyAssets(folder);
mkdirSync(resolve(office,'driver'),{recursive:true});cpSync('driver/portal.css',resolve(office,'driver/portal.css'));
mkdirSync(resolve(office,'recruitment'),{recursive:true});cpSync('recruitment/rules.mjs',resolve(office,'recruitment/rules.mjs'));
mkdirSync(resolve(office,'vendor'),{recursive:true});
cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js',resolve(office,'vendor/supabase.js'));
cpSync('vendor/exceljs.min.js',resolve(office,'vendor/exceljs.min.js'));
cpSync('vendor/LICENSES.txt',resolve(office,'vendor/LICENSES.txt'));
for(const name of ['candidate-onboarding.js','candidate-onboarding.css'])cpSync(name,resolve(onboarding,name));
cpSync('candidate-onboarding.html',resolve(onboarding,'index.html'));
if(!existsSync(`${output}/images/parcel-handover.jpg`))throw Error('Missing licensed hero photograph');
console.log(`Production website built at ${output}; company, office and onboarding served directly by Netlify.`);
