import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDraftInvoice, poundsToPence } from './invoice-calculator.mjs';

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
