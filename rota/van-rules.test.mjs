import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationKey, driverKey, vanReadiness, reviewVanDay} from './van-rules.mjs';
const van = (id, reg, flags = ['Yes', 'Yes']) => ({id, cells: [reg, ...flags, '', '', ''], isNote: false});
test('registration and driver matching tolerates spaces, case and full-width characters', () => {
  assert.equal(registrationKey(' ab12 cde '), registrationKey('ＡＢ１２ＣＤＥ'));
  assert.equal(driverKey('  Synthetic   Driver '), driverKey('synthetic driver'));
});
test('readiness requires explicit flags and respects an unavailable fleet status', () => {
  assert.equal(vanReadiness(van('a', 'SYNTH01')).ready, true);
  assert.equal(vanReadiness(van('a', 'SYNTH01', ['', 'Yes'])).ready, false);
  assert.equal(vanReadiness({...van('a', 'SYNTH01'), fleetStatus: 'In maintenance'}).ready, false);
});
test('daily review finds legacy duplicate drivers and registrations without changing assignments', () => {
  const rows = [van('a', 'AB12 CDE'), van('b', 'ab12cde'), van('c', 'SYNTH03', ['No', 'Yes']), {id:'note',cells:['','','','','',''],isNote:true}];
  const assignments = new Map([['a|2026-10-22', 'Synthetic   Driver'], ['b|2026-10-22', 'synthetic driver'], ['c|2026-10-23', 'Other Day']]);
  const before = JSON.stringify([...assignments]);
  const review = reviewVanDay(rows, assignments, '2026-10-22');
  assert.deepEqual([review.total, review.assigned, review.unassigned, review.notReady, review.conflicts], [3, 2, 1, 3, 2]);
  assert.equal(review.entries[0].duplicateDriver, true);
  assert.equal(JSON.stringify([...assignments]), before);
});
