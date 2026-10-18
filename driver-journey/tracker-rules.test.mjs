import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  COLUMNS,TRACKER_STATUSES,statusValue,setTaskValue,pillTone,sourceOptions
} from './tracker-rules.mjs';

test('recruitment spreadsheet matches BESA Google Sheet column order',()=>{
  assert.deepEqual(COLUMNS.map(x=>x.label),[
    'Requirements','SAM First Part','Amazon Account','Accurate DBS','Amiigo Training','Sam 2nd Part'
  ]);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const label of ['Driver','Phone Number',...COLUMNS.map(x=>x.label),'Notes','Status']){
    assert.ok(html.includes('>'+label+'</th>'),label);
  }
  assert.ok(html.includes('id="journey-tracker-body"'));
  assert.ok(html.includes('id="journey-tracker-scroll"')||html.includes('class="journey-tracker-scroll"'));
  assert.ok(html.includes('id="journey-show-tracker"'));
  assert.ok(html.includes('id="journey-show-drivers"'));
});
test('each dropdown is editable with Done, Pending, Yes and Active/Booked labels',()=>{
  const row={checklist:{},details:{}};
  setTaskValue(row,'requirements','Yes');
  setTaskValue(row,'sam1','Done');
  setTaskValue(row,'amazon','Pending');
  assert.equal(statusValue(row,'requirements'),'Yes');
  assert.equal(statusValue(row,'sam1'),'Done');
  assert.equal(statusValue(row,'amazon'),'Pending');
  assert.deepEqual(row.checklist,{requirements:true,sam1:true,amazon:false});
  assert.ok(TRACKER_STATUSES.includes('Active/Booked'));
  assert.equal(pillTone('Done'),'done');
  assert.equal(pillTone('Pending'),'pending');
  assert.equal(pillTone('Yes','requirements'),'yes');
  assert.equal(pillTone('Active/Booked'),'done');
});
test('legacy boolean checklist maps to colour pill values without losing progress',()=>{
  const row={checklist:{sam2:true,requirements:true,dbs:false},details:{}};
  assert.equal(statusValue(row,'sam2'),'Done');
  assert.equal(statusValue(row,'requirements'),'Yes');
  assert.equal(statusValue(row,'dbs'),'');
});
test('historical custom recruitment dropdown text is preserved',()=>{
  const list=sourceOptions(['','Done','Pending'],'Booked / confirmed');
  assert.ok(list.includes('Booked / confirmed'));
  assert.equal(list.filter(x=>x==='Booked / confirmed').length,1);
  assert.throws(()=>setTaskValue({checklist:{},details:{}},'sam1','Unexpected'),/Unknown/);
});
test('grid updates do not alter the operational BESA driver status or leak personal records',()=>{
  const src=readFileSync(new URL('./office.js',import.meta.url),'utf8');
  const styles=readFileSync(new URL('./profile.css',import.meta.url),'utf8');
  assert.ok(src.includes("function trackerFieldChanged(event)"));
  assert.ok(src.includes("record.details.recruitmentStatus=value"));
  assert.ok(src.includes("queueWrite(id)"));
  assert.ok(!src.includes("window.besaClient.from('besa_drivers').update"));
  assert.ok(styles.includes('position:sticky;top:0'));
  assert.ok(styles.includes('.journey-pill-select.tone-done'));
  assert.ok(styles.includes('.journey-pill-select.tone-pending'));
  assert.ok(!src.includes('getPublicUrl'));
});
