// Local release verification only; production is served by Netlify.
import http from 'node:http';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
const root=resolve('dist/company-site'),rules=[];let rule;
for(const line of readFileSync(resolve(root,'_headers'),'utf8').split(/\r?\n/)){
 if(!line.trim()||line.startsWith('#'))continue;
 if(line.startsWith('/')){rule={pattern:new RegExp('^'+line.trim().replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')+'$'),headers:{}};rules.push(rule);}
 else{const colon=line.indexOf(':');if(colon>0)rule.headers[line.slice(0,colon).trim()]=line.slice(colon+1).trim();}
}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain'};
http.createServer((request,response)=>{
 let path;
 try{path=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400).end();return;}
 if(path==='/onboarding/candidate-onboarding.html')path='/onboarding/index.html';
 let target=resolve(root,'.'+path);
 if(target!==root&&!target.startsWith(root+sep)){response.writeHead(403).end();return;}
 if(existsSync(target)&&statSync(target).isDirectory())target=resolve(target,'index.html');
 const headers={};for(const item of rules)if(item.pattern.test(path))Object.assign(headers,item.headers);
 if(!existsSync(target)||!statSync(target).isFile()||path.includes('/_')){response.writeHead(404,headers).end('Not found');return;}
 response.writeHead(200,{'Content-Type':(types[extname(target)]||'application/octet-stream')+';charset=utf-8',...headers});
 response.end(readFileSync(target));
}).listen(Number(process.env.PORT||4174),'127.0.0.1',()=>console.log('Built website verification server ready.'));
