import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=read('supabase/functions/besa-candidate-intake/index.ts');
const html=read('candidate-onboarding.html');
const frontend=read('candidate-onboarding.js');

test('candidate intake only accepts a 256-bit private fragment link',()=>{
 assert.ok(frontend.includes('location.hash'));
 assert.ok(frontend.includes("new URLSearchParams"));
 assert.ok(frontend.includes('[A-Za-z0-9_-]{43}'));
 assert.ok(!frontend.includes('localStorage'));
 assert.ok(!frontend.includes('sessionStorage'));
 assert.ok(!frontend.includes('SUPABASE_SERVICE_ROLE_KEY'));
 assert.ok(!frontend.includes('getPublicUrl'));
});
test('form is self-hosted with strict private document access and no analytics',()=>{
 assert.ok(html.includes('candidate-onboarding.css'));
 assert.ok(html.includes('meta name="referrer" content="no-referrer"'));
 assert.ok(html.includes("default-src 'none'"));
 assert.ok(!html.includes('fonts.googleapis.com'));
 assert.ok(!html.includes('cdn.jsdelivr'));
 for(const name of ['first_name','last_name','date_of_birth','email','phone','address_1','city','postcode','licence_type','licence_expiry','right_to_work_type']) {
  assert.ok(html.includes('name="'+name+'"'),name);
 }
 for(const kind of ['passport','right-to-work','driving-licence-front','driving-licence-back'])assert.ok(html.includes('data-doc="'+kind+'"'));
});
test('Edge function gates admin and applicant capabilities independently',()=>{
 for(const action of ["case 'create':","case 'revoke':","case 'admin-review':","case 'admin-view':","case 'status':","case 'submit':"])assert.ok(edge.includes(action),action);
 assert.ok(edge.includes('adminAuth(req)'));
 assert.ok(edge.includes('userDb.auth.getUser(jwt)'));
 assert.ok(edge.includes(".from('besa_admins')"));
 assert.ok(edge.includes('await digest(token)'));
 assert.ok(edge.includes("['application/pdf','pdf']"));
 assert.ok(edge.includes('fileMagic(head,file.type)'));
 assert.ok(edge.includes("const BUCKET='besa-candidate-private'"));
 assert.ok(edge.includes("if(invite.submitted_at&&!allowSubmitted)"));
 assert.ok(edge.includes('Date.parse(invite.expires_at)<=Date.now()'));
 assert.ok(edge.includes('File'));
 assert.ok(edge.includes('crypto.getRandomValues(new Uint8Array(32))'));
 assert.ok(!edge.includes('getPublicUrl'));
});
test('only secure server changes candidate details; account remains Onboarding',()=>{
 const schema=read('supabase/migrations/005_private_candidate_onboarding.sql');
 assert.ok(schema.includes('enable row level security'));
 assert.ok(schema.includes('to authenticated'));
 assert.ok(schema.includes('using((select public.besa_is_admin()))'));
 assert.ok(schema.includes('public=false'));
 assert.ok(schema.includes('references public.besa_drivers(id)'));
 assert.ok(!edge.includes(".from('besa_drivers').update"));
 assert.ok(!edge.includes("status:'Active'"));
});
test('Edge file signature checks reject renamed untrusted executables',()=>{
 const begin=edge.indexOf('function fileMagic(bytes,mime){');
 const end=edge.indexOf('async function upload(req)',begin);
 assert.ok(begin>0&&end>begin);
 const context={};
 vm.runInNewContext(edge.slice(begin,end),context);
 const check=vm.runInNewContext('fileMagic',context);
 assert.equal(check(new Uint8Array([37,80,68,70,45]),'application/pdf'),true);
 assert.equal(check(new Uint8Array([60,115,99,114,105,112,116]),'application/pdf'),false);
 assert.equal(check(new Uint8Array([255,216,255]),'image/jpeg'),true);
 assert.equal(check(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),true);
});
test('validation requires accurate contact, birth date and explicit declaration',()=>{
 const from=edge.indexOf('const validDate=(v)=>');
 const end=edge.indexOf('async function submit(data){',from);
 assert.ok(from>0&&end>from);
 const code=`const text=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):''; const error=(message,code=400)=>({message,code});`+edge.slice(from,end);
 const context={Date,Number};
 vm.runInNewContext(code,context);
 const check=vm.runInNewContext('validateCandidate',context);
 const good={first_name:'Test',last_name:'Applicant',email:'candidate@example.test',
  phone:'07700900123',date_of_birth:'1990-01-01',address_1:'1 Test Place',city:'London',
  postcode:'SW1A 1AA',licence_type:'Manual',licence_expiry:'2030-01-01',
  right_to_work_type:'UK or Irish passport',declaration:true,privacy_acknowledged:true};
 assert.equal(check(good).first_name,'Test');
 assert.throws(()=>check({...good,declaration:false}));
 assert.throws(()=>check({...good,licence_type:'Unknown'}));
 assert.throws(()=>check({...good,date_of_birth:'2022-01-01'}));
});
