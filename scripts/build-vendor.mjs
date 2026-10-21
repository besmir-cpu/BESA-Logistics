import browserify from 'browserify';
import {minify} from 'terser';
import {mkdirSync,writeFileSync,cpSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Readable,Transform} from 'node:stream';
const notices=new Map();
// Rebuild from locked source dependencies, rather than shipping ExcelJS's
// precompiled bundle containing an older uuid dependency.
const entry="const ExcelJS={Workbook:require('exceljs/lib/doc/workbook')};Object.assign(ExcelJS,require('exceljs/lib/doc/enums'));module.exports=ExcelJS;";
const bundle=await new Promise((complete,reject)=>browserify({standalone:'ExcelJS'})
  .on('package',pkg=>{
    if(!pkg.__dirname||!pkg.name||notices.has(pkg.name+'@'+pkg.version))return;
    const files=readdirSync(pkg.__dirname).filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
    notices.set(pkg.name+'@'+pkg.version,files.map(name=>name+'\n'+readFileSync(pkg.__dirname+'/'+name,'utf8')).join('\n\n')||String(pkg.license||'See package metadata'));
  })
  .transform(file=>{
    let source='';
    return new Transform({transform(chunk,encoding,done){source+=chunk;done();},flush(done){
      // ExcelJS uses uuid solely for no-argument v4 IDs. Use the browser's
      // standard CSPRNG UUID API, avoiding unused legacy UUID algorithms.
      if(file.endsWith('cf-rule-ext-xform.js'))source=source.replace("require('uuid')","{v4:()=>globalThis.crypto.randomUUID()}");
      if(file.replaceAll('\\','/').endsWith('exceljs/lib/utils/encryptor.js'))source=source.replace("require('crypto')","require("+JSON.stringify(resolve('scripts/excel-crypto.cjs'))+")");
      this.push(source);done();
    }});
  },{global:true})
  .add(Readable.from([entry]),{basedir:process.cwd(),file:process.cwd()+'/besa-excel-entry.cjs'})
  .bundle((error,buffer)=>error?reject(new Error(error.message)):complete(buffer.toString())));
const {code}=await minify(bundle,{compress:true,mangle:true,format:{comments:false}});
mkdirSync('vendor',{recursive:true});
writeFileSync('vendor/exceljs.min.js',code);
cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js','vendor/supabase.js');
writeFileSync('vendor/LICENSES.txt',[
  'ExcelJS 4.4.0\n'+readFileSync('node_modules/exceljs/LICENSE','utf8'),
  'Supabase JS 2.117.3\n'+readFileSync('node_modules/@supabase/supabase-js/LICENSE','utf8'),
  ...[...notices].sort(([a],[b])=>a.localeCompare(b)).map(([name,license])=>name+'\n'+license)
].join('\n\n'));
console.log('Built pinned, self-hosted browser dependencies.');
