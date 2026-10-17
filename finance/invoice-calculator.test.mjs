import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDraftInvoice, calculateSamStyleDraft, poundsToPence } from './invoice-calculator.mjs';

test('money parser is exact to pennies', () => {
  assert.equal(poundsToPence('3.05'), 305);
  assert.equal(poundsToPence('0'), 0);
  assert.equal(poundsToPence(12.5), 1250);
  assert.throws(() => poundsToPence('12.345'), /two decimals/);
  assert.throws(() => poundsToPence('-4'), /non-negative/);
});

test('draft includes separate income, deductions and admin fee sections', () => {
  // Synthetic numbers, NOT a real BESA supplier payment.
  const result = calculateDraftInvoice({
    income: [{ description: 'Route', quantity: 3, rate: '120.00' }],
    deductions: [
      { description: 'Rental', quantity: 3, rate: '5.00' },
      { description: 'Other adjustment', quantity: 1, rate: '20.00' }
    ],
    adminFees: [{ description: 'Administration', quantity: 1, rate: '15.00' }]
  });
  assert.equal(result.income.totalPence, 36000);
  assert.equal(result.deductions.totalPence, 3500);
  assert.equal(result.adminFees.totalPence, 1500);
  assert.equal(result.netPence, 31000);
  assert.equal(result.totalToPayPence, 31000);
  assert.equal(result.status, 'DRAFT_ONLY');
  assert.equal(result.requiresOfficeApproval, true);
});

test('half-up rounding with fractional quantities', () => {
  const result = calculateDraftInvoice({
    income: [{description: 'Half unit', quantity: '0.50', rate: '5.01'}]
  });
  assert.equal(result.netPence, 251);
});

test('blank, negative and malformed lines are rejected', () => {
  assert.throws(() => calculateDraftInvoice({income:[{description:'',quantity:1,rate:'5'}]}), /description/);
  assert.throws(() => calculateDraftInvoice({income:[{description:'Test',quantity:-1,rate:'5'}]}), /Quantity/);
  assert.throws(() => calculateDraftInvoice({income:[{description:'Test',quantity:1,rate:'-5'}]}), /non-negative/);
});

test('VAT-registered and VAT-POT calculations are blocked pending policy', () => {
  assert.throws(() => calculateDraftInvoice({vatStatus:'registered'}), /accountant-approved/);
});

test('empty, non-VAT supplier draft remains zero and cannot be issued', () => {
  const result = calculateDraftInvoice();
  assert.equal(result.netPence, 0);
  assert.equal(result.vatPence, 0);
  assert.equal(result.requiresAccountantApprovedInvoiceTemplate, true);
});


test('SAM-style rental is shown separately and £15 admin is charged once per invoiced driver week', () => {
  // Example from the supplied Week 40 SAM invoice; no personal data included.
  const r = calculateSamStyleDraft({
    routeCount: 3,
    sheetRouteRate: '137.70',
    otherDeductions: [{ description: 'Other deduction', quantity: 1, rate: '20.00' }]
  });
  assert.equal(r.sheetRouteRatePence, 13770);
  assert.equal(r.samDisplayedRouteRatePence, 14270);
  assert.equal(r.income.totalPence, 42810);
  assert.equal(r.deductions.lines[0].totalPence, 1500);
  assert.equal(r.deductions.totalPence, 3500);
  assert.equal(r.adminFees.lines.length, 1);
  assert.equal(r.adminFees.lines[0].totalPence, 1500);
  assert.equal(r.netPence, 37810);
  assert.equal(r.netPence + r.weeklyAdminFeePence, 39310);
  assert.equal(r.vatPence, 0);
  assert.equal(r.status, 'DRAFT_ONLY');
});

test('rental gross-up and rental deductions cancel for any positive number of routes', () => {
  const r = calculateSamStyleDraft({
    routeCount: 4, sheetRouteRate: '150.00', vanRentalPerRoute: '7.50',
    weeklyAdminFee: '15.00'
  });
  assert.equal(r.income.totalPence, 63000);
  assert.equal(r.deductions.totalPence, 3000);
  assert.equal(r.netPence, 58500);
  assert.equal(r.adminFees.totalPence, 1500);
});

test('weekly admin is not repeated per route; no rental can be configured explicitly', () => {
  const r = calculateSamStyleDraft({
    routeCount: 7, sheetRouteRate: '100.00',
    vanRentalPerRoute: '0.00', weeklyAdminFee: '15.00'
  });
  assert.equal(r.income.totalPence, 70000);
  assert.equal(r.deductions.totalPence, 0);
  assert.equal(r.adminFees.totalPence, 1500);
  assert.equal(r.netPence, 68500);
});

test('zero-route, bad routes and VAT-registered supplier are blocked for manual review', () => {
  assert.throws(() => calculateSamStyleDraft({routeCount: 0, sheetRouteRate: '137.70'}), /manual decision/);
  assert.throws(() => calculateSamStyleDraft({routeCount: 1.5, sheetRouteRate: '137.70'}), /whole number/);
  assert.throws(() => calculateSamStyleDraft({routeCount: 1, sheetRouteRate: '137.70', vanRentalPerRoute: '-5'}), /non-negative/);
  assert.throws(() => calculateSamStyleDraft({routeCount: 1, sheetRouteRate: '137.70', vatStatus:'registered'}), /accountant-approved/);
});
