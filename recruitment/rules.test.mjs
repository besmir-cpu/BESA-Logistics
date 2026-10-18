import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  RECRUITMENT_HEADERS, ONBOARDING_HEADERS, STAGES,
  normalizedName,normalizedPhone,normalizedEmail,
  stageFromSource,findMergeIndex,countProgress,displayCsvSafe
} from './rules.mjs';

test('headings mirror the two BESA source Google trackers',()=>{
  assert.deepEqual(RECRUITMENT_HEADERS,[
    'Driver','Phone Number','Requirements','SAM First Part','Amazon Account',
    'Accurate DBS','Amiigo Training','Sam 2nd Part','Notes','Status'
  ]);
  assert.equal(ONBOARDING_HEADERS.length,18);
  assert.deepEqual(ONBOARDING_HEADERS.slice(0,4),['Email','Phone number','Driver','CT date']);
  assert.deepEqual(ONBOARDING_HEADERS.slice(-4),['Notes','Review flags','Transporter ID','H&S completed']);
  assert.ok(STAGES.includes('Invited'));
});

test('normalize UK contact details conservatively',()=>{
  assert.equal(normalizedPhone('07700 900123'),'+447700900123');
  assert.equal(normalizedPhone('44 7700 900123'),'+447700900123');
  assert.equal(normalizedPhone('+44(7700)900123'),'+447700900123');
  assert.equal(normalizedPhone('00000'),'');
  assert.equal(normalizedEmail(' TEST@example.com '),'test@example.com');
  assert.equal(normalizedName('Jane   Test-Smith'),'jane testsmith');
});

test('onboarding and recruitment stage from actual source statuses',()=>{
  assert.equal(stageFromSource({status:'Active'}),'Active');
  assert.equal(stageFromSource({radone:'Yes'}),'Ridealong');
  assert.equal(stageFromSource({ra1:'2026-10-01'}),'Ridealong');
  assert.equal(stageFromSource({ctdone:'Yes'}),'Training');
  assert.equal(stageFromSource({dbs:'Yes'}),'Screening');
  assert.equal(stageFromSource({}),'Applicant');
});

test('match confirmed email first, then phone, then only unique compatible names',()=>{
  const records=[
    {name:'Alice Driver',email:'a@example.com',phone:'07700 900123'},
    {name:'Ben Driver',email:'',phone:'07700 900124'},
    {name:'Chris Driver',email:'c@example.com',phone:''},
    {name:'Chris Driver',email:'',phone:''}
  ];
  assert.equal(findMergeIndex(records,{name:'Wrong',email:'A@example.com'}).index,0);
  assert.equal(findMergeIndex(records,{name:'Wrong',phone:'+447700900124'}).index,1);
  assert.equal(findMergeIndex(records,{name:'Chris Driver'}).reason,'ambiguous name');
  assert.equal(findMergeIndex(records,{name:'Alice Driver',email:'other@example.com'}).reason,'conflicting email');
  assert.equal(findMergeIndex(records,{name:'Alice Driver',phone:'07700 999999'}).reason,'conflicting phone');
});

test('do not guess readiness from missing values; escape exported spreadsheet formulas',()=>{
  assert.deepEqual(countProgress({requirements:'Yes',sam1:'No'},['requirements','sam1','dbs']),{done:1,total:3});
  assert.ok(displayCsvSafe('=HYPERLINK("x","y")').startsWith('"\'='));
  assert.equal(displayCsvSafe('Normal name'),'"Normal name"');
});

test('admin UI has a locked screen and no sensitive data uploads, invitations or database writes',()=>{
  const html=readFileSync(new URL('../recruitment.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('./office.js',import.meta.url),'utf8');
  assert.ok(html.includes('id="recruit-locked"'));
  assert.ok(html.includes('id="recruit-workspace" hidden'));
  assert.ok(js.includes(".from('besa_admins')"));
  assert.ok(js.includes(".eq('status','Onboarding')"));
  assert.ok(!/\.from\('[^']+'\)\.(?:insert|upsert|update|delete)\(/.test(js));
  assert.ok(!js.includes('localStorage'));
  assert.ok(!js.includes('sessionStorage'));
});
