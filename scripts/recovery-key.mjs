// Local recovery utility. Private material never enters the website build.
// Windows stores the passphrase with user-bound DPAPI protection.
import * as openpgp from 'openpgp';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const folder=resolve(process.env.BESA_RECOVERY_DIR||'../recovery');
mkdirSync(folder,{recursive:true});
const ps=code=>execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const action=process.argv[2];
if(action==='create'){
 if(!existsSync(resolve(folder,'private.asc'))){
  const passphrase=randomBytes(48).toString('base64');
  const {privateKey,publicKey}=await openpgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'BESA Logistics Recovery'}],passphrase,format:'armored'});
  const protectedPass=execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',"$secret=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $secret -AsPlainText -Force | ConvertFrom-SecureString"],{input:passphrase,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  writeFileSync(resolve(folder,'passphrase.dpapi'),protectedPass,{mode:0o600});
  writeFileSync(resolve(folder,'private.asc'),privateKey,{mode:0o600});
  writeFileSync(resolve(folder,'public.asc'),publicKey);
 }
 console.log(readFileSync(resolve(folder,'public.asc'),'utf8'));
}else if(['verify','rehearse-sql'].includes(action)){
 const source=resolve(process.argv[3]);
 const protectedFile=resolve(folder,'passphrase.dpapi').replaceAll("'","''");
 const passphrase=ps("$s=Get-Content -LiteralPath '"+protectedFile+"' -Raw | ConvertTo-SecureString; [System.Net.NetworkCredential]::new('', $s).Password").trim();
 const privateKey=await openpgp.decryptKey({privateKey:await openpgp.readPrivateKey({armoredKey:readFileSync(resolve(folder,'private.asc'),'utf8')}),passphrase});
 const {data}=await openpgp.decrypt({message:await openpgp.readMessage({binaryMessage:new Uint8Array(readFileSync(source))}),decryptionKeys:privateKey});
 const snapshot=JSON.parse(data);
 if(action==='rehearse-sql'){
  const schema='besa_recovery_check_'+randomBytes(6).toString('hex');
  const statements=['begin;',`create schema ${schema};`,`revoke all on schema ${schema} from public,anon,authenticated,service_role;`];
  for(const [name,rows] of Object.entries(snapshot.data)){
   if(!/^(public|auth)\.[a-z_]+$/.test(name))throw Error('Unexpected table name');
   const target=schema+'.'+name.replace('.','_');
   const json=JSON.stringify(rows).replaceAll("'","''");
   statements.push(`create table ${target} as select * from jsonb_populate_recordset(null::${name},'${json}'::jsonb);`);
   statements.push(`do $$ begin if (select count(*) from ${target})<>${rows.length} or (select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb)::text) from ${target} r)<>(select md5(coalesce(jsonb_agg(value order by value::text),'[]'::jsonb)::text) from jsonb_array_elements('${json}'::jsonb)) then raise exception 'Recovery validation failed for ${name}'; end if; end $$;`);
  }
  statements.push(`drop schema ${schema} cascade;`,'commit;',"select 'isolated restoration verified; production rows untouched' as result;");
  console.log(statements.join('\n'));process.exit(0);
 }
 const counts=Object.fromEntries(Object.entries(snapshot.data).map(([name,rows])=>[name,rows.length]));
 const report={format:snapshot.format,created_at:snapshot.created_at,sha256:createHash('sha256').update(data).digest('hex'),counts,files:snapshot.storage_objects?.length||0};
 writeFileSync(source+'.verified.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}else throw new Error('Choose create or verify.');
