// Read-only checks over existing planning rows. Never infer verified insurance.
export const registrationKey = value => String(value ?? '').normalize('NFKC').replace(/\s/g, '').toUpperCase();
export const driverKey = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
export function vanReadiness(row) {
  const reasons = [];
  for (const [index, label] of [[1, 'Insurance'], [2, 'Working condition']]) {
    const flag = String(row.cells[index] || '').trim().toLowerCase();
    if (flag !== 'yes') reasons.push(label + (flag === 'no' ? ' is marked No' : ' is unverified'));
  }
  if (['In maintenance', 'Off hire', 'SORN', 'Personal', 'Archived'].includes(row.fleetStatus)) reasons.push('Fleet status: ' + row.fleetStatus);
  return { ready: reasons.length === 0, reasons };
}
export function reviewVanDay(rows, assignments, day) {
  const vehicles = rows.filter(row => !row.isNote);
  const registrations = new Map(), drivers = new Map();
  for (const row of vehicles) {
    const reg = registrationKey(row.cells[0]);
    registrations.set(reg, (registrations.get(reg) || 0) + 1);
    const driver = driverKey(assignments.get(row.id + '|' + day));
    if (driver) drivers.set(driver, (drivers.get(driver) || 0) + 1);
  }
  const entries = vehicles.map(row => {
    const assignment = String(assignments.get(row.id + '|' + day) || '').trim();
    const readiness = vanReadiness(row), issues = [...readiness.reasons];
    const duplicateRegistration = registrations.get(registrationKey(row.cells[0])) > 1;
    const duplicateDriver = Boolean(assignment && drivers.get(driverKey(assignment)) > 1);
    if (duplicateRegistration) issues.push('Duplicate registration in this draft');
    if (duplicateDriver) issues.push('Driver is assigned to more than one van');
    return { row, assignment, ready: readiness.ready && !duplicateRegistration, issues, duplicateDriver, duplicateRegistration };
  });
  return {
    entries, total: entries.length,
    assigned: entries.filter(entry => entry.assignment).length,
    unassigned: entries.filter(entry => !entry.assignment).length,
    notReady: entries.filter(entry => !entry.ready).length,
    conflicts: entries.filter(entry => entry.duplicateDriver || entry.duplicateRegistration).length
  };
}
