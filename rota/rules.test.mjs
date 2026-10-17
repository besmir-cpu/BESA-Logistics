import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHIFT_CODES, WORK_CODES, sundayOfWeek, weekDates, offsetWeeks, summarizeDay
} from './rules.mjs';

test('Sunday-to-Saturday planning period across month boundaries', () => {
  assert.equal(sundayOfWeek('2026-10-17'), '2026-10-11');
  assert.deepEqual(weekDates('2026-10-17'), [
    '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
    '2026-10-15', '2026-10-16', '2026-10-17'
  ]);
  assert.equal(offsetWeeks('2026-10-17', 1), '2026-10-18');
  assert.equal(offsetWeeks('2026-10-17', -1), '2026-10-04');
});

test('all working shift codes match current source sheet', () => {
  assert.deepEqual(WORK_CODES, ['W','RA','NL1','NL2','NL3','C1','C2','EW']);
  assert.ok(SHIFT_CODES.includes('Office'));
  assert.ok(SHIFT_CODES.includes('SB'));
  assert.ok(SHIFT_CODES.includes('NOT R'));
  const all = WORK_CODES.map(shift_code => ({shift_code}));
  const result = summarizeDay(all,{target_c1:3,target_c2:1});
  assert.equal(result.working,8);
  assert.equal(result.cycle1,3); // RA, EW, C1
  assert.equal(result.cycle2,1);
  assert.equal(result.totalGap,4);
  assert.equal(result.c1Gap,0);
  assert.equal(result.c2Gap,0);
});

test('rest, standby, office and unrostered do not count as working', () => {
  const result = summarizeDay(['R','OFF','SB','NOT R','Office'].map(shift_code => ({shift_code})));
  assert.equal(result.working,0);
  assert.equal(result.cycle1,0);
  assert.equal(result.cycle2,0);
  assert.equal(result.standby,1);
  assert.equal(result.notRostered,1);
  assert.equal(result.office,1);
});

test('working vehicle conflicts are surfaced but not silently deleted', () => {
  const result = summarizeDay([
    {shift_code:'C1',vehicle_id:'vehicle-1'},
    {shift_code:'RA',vehicle_id:'vehicle-1'},
    {shift_code:'R',vehicle_id:'vehicle-1'},
    {shift_code:'C2',vehicle_id:'vehicle-2'}
  ],{target_c1:3,target_c2:2});
  assert.equal(result.doubleAssignedVehicles,1);
  assert.equal(result.working,3);
  assert.equal(result.totalGap,-2);
});

test('invalid dates and targets fail fast', () => {
  assert.throws(()=>sundayOfWeek('2026-02-30'),/Invalid/);
  assert.throws(()=>weekDates('not a date'),/YYYY-MM-DD/);
  assert.throws(()=>summarizeDay([],{target_c1:-1,target_c2:0}),/Invalid/);
});
