// BESA rota rules, transcribed from the connected Google Sheet's
// "ROTA" tab summary formulas (Working / Cycle 1 / Cycle 2).
// Schedule the day entered; do not shift EW to a neighbouring date.
export const SHIFT_CODES = Object.freeze([
  'C1', 'C2', 'RA', 'EW', 'W', 'NL1', 'NL2', 'NL3',
  'SB', 'R', 'NOT R', 'Office', 'OFF'
]);
export const WORK_CODES = Object.freeze(['W', 'RA', 'NL1', 'NL2', 'NL3', 'C1', 'C2', 'EW']);
export const CYCLE_1_CODES = Object.freeze(['C1', 'RA', 'EW']);
export const CYCLE_2_CODES = Object.freeze(['C2']);

export function utcDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new TypeError('Expected a YYYY-MM-DD calendar date.');
  }
  const date = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new TypeError('Invalid calendar date.');
  }
  return date;
}
export const isoDate = date => date.toISOString().slice(0, 10);

export function sundayOfWeek(day) {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return isoDate(date);
}

export function weekDates(anyDate) {
  const start = utcDate(sundayOfWeek(anyDate));
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset);
    return isoDate(day);
  });
}

export function offsetWeeks(anyDate, weeks) {
  if (!Number.isSafeInteger(weeks) || Math.abs(weeks) > 5200) {
    throw new RangeError('Invalid week offset.');
  }
  const d = utcDate(sundayOfWeek(anyDate));
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return isoDate(d);
}

export function summarizeDay(shifts, target = { target_c1: 0, target_c2: 0 }) {
  if (!Array.isArray(shifts)) throw new TypeError('Expected shifts array.');
  const totalC1 = target?.target_c1 ?? 0;
  const totalC2 = target?.target_c2 ?? 0;
  if (![totalC1, totalC2].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new TypeError('Invalid daily targets.');
  }
  const codes = shifts.map(s => s.shift_code);
  const working = codes.filter(c => WORK_CODES.includes(c)).length;
  const cycle1 = codes.filter(c => CYCLE_1_CODES.includes(c)).length;
  const cycle2 = codes.filter(c => CYCLE_2_CODES.includes(c)).length;
  const vehicles = new Map();
  for (const shift of shifts) {
    if (shift.vehicle_id && WORK_CODES.includes(shift.shift_code)) {
      const prior = vehicles.get(shift.vehicle_id) || 0;
      vehicles.set(shift.vehicle_id, prior + 1);
    }
  }
  return {
    working, cycle1, cycle2,
    standby: codes.filter(c => c === 'SB').length,
    notRostered: codes.filter(c => c === 'NOT R').length,
    office: codes.filter(c => c === 'Office').length,
    targetC1: totalC1, targetC2: totalC2,
    target: totalC1 + totalC2,
    c1Gap: cycle1 - totalC1,
    c2Gap: cycle2 - totalC2,
    totalGap: working - totalC1 - totalC2,
    doubleAssignedVehicles: [...vehicles.values()].filter(c => c > 1).length
  };
}
