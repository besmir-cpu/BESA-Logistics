import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./tracker.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
function editor(){
  const context=vm.createContext({Intl,Date,Map,Set,Array,Number,String,JSON,RegExp,Error,window:{confirm:()=>true}});
  vm.runInContext(source+\`
    render=function(){};
    message=function(){};
    state.start='2026-10-11';
    globalResult={parseDelimited,parseSourceDate,weekNumber,classifyMetric,classifySection,looksLikeWholeTab,importFullTab,parseDelimited,get,state};
  \`,context);
  return context.globalResult;
}
test('week numbers match BESA Sunday-based sheet',()=>{
  const e=editor();
  assert.equal(e.weekNumber('2026-10-11'),42);
  assert.equal(e.weekNumber('2026-08-23'),35);
  assert.equal(e.weekNumber('2027-01-01'),1);
});
test('Google tab-separated paste, embedded delimiters and CSV quotes',()=>{
  const e=editor();
  const x=e.parseDelimited('Metric\tSun\tMon\n"Driver, Jane"\t1\t2\n');
  assert.equal(x[1][0],'Driver, Jane');
  assert.equal(x[1][2],'2');
  const csv=e.parseDelimited('Day,Note\r\nSun,"driver, notes"\r\n');
  assert.equal(csv[1][1],'driver, notes');
});
test('source metric and section labels are recognised but unknown money rules are not invented',()=>{
  const e=editor();
  assert.equal(e.classifyMetric('No.of routes we did'),3);
  assert.equal(e.classifyMetric('No of Routes cancelled by Amazon'),4);
  assert.equal(e.classifyMetric('No of ridealong  (that were requested by siphon)'),5);
  assert.equal(e.classifyMetric('No of ridealongs that occurred'),6);
  assert.equal(e.classifySection('Ridealong occurred'),'ridealong');
  assert.equal(e.classifySection('Deductions'),'deductions');
  assert.equal(e.classifySection('Extra Pay'),'extra');
  assert.equal(e.classifySection('No call no Show'),'nocall');
  assert.equal(e.classifySection('Damages'),'damages');
});
test('full Google payment tracker copy maps to seven dates and separate notes',()=>{
  const e=editor();
  const rows=Array.from({length:60},()=>Array(10).fill(''));
  rows[0][2]='Date';
  const dates=['11/10/2026','12/10/2026','13/10/2026','14/10/2026','15/10/2026','16/10/2026','17/10/2026'];
  dates.forEach((date,i)=>rows[0][3+i]=date);
  rows[2][0]='No.of routes we did';rows[2][3]='20';
  rows[3][0]='No of Routes cancelled by Amazon';rows[3][3]='2';
  rows[4][0]='No of ridealong  (that were requested by siphon)';rows[4][3]='1';
  rows[5][0]='No of ridealongs that occurred';rows[5][3]='1';
  for(const [row,label] of [[9,'Ridealong occurred'],[18,'Deductions'],[29,'Extra Pay'],[40,'No call no Show'],[45,'Damages']]){
    rows[row][3]=label;
  }
  rows[11][3]='Training happened';
  rows[20][4]='Adjustment to review';
  rows[31][5]='Bonus to review';
  rows[42][6]='No show';
  rows[47][7]='Van repair detail';
  const n=e.importFullTab(rows);
  assert.ok(n>10);
  assert.equal(e.get(3,4),'20');
  assert.equal(e.get(4,4),'2');
  assert.equal(e.get(12,4),'Training happened');
  assert.equal(e.get(21,5),'Adjustment to review');
  assert.equal(e.get(32,6),'Bonus to review');
  assert.equal(e.get(43,7),'No show');
  assert.equal(e.get(48,8),'Van repair detail');
});
test('invalid dates are rejected',()=>{
  const e=editor();
  assert.equal(e.parseSourceDate('11/10/2026'),'2026-10-11');
  assert.equal(e.parseSourceDate('35/10/2026'),null);
});
