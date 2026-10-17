/**
 * BESA invoice calculator — draft-only and NOT a VAT/self-billing engine.
 *
 * An invoice has a supplying driver and BESA as the customer. Money is
 * calculated in integer pence; the caller provides invoice lines and
 * externally approved rate cards. No live files, taxpayer details or
 * banking credentials are handled here.
 *
 * VAT-registered and VAT-POT cases deliberately fail closed until BESA
 * and its accountant approve the accounting policy.
 */
export function poundsToPence(value) {
  const text = String(value).trim();
  if (!/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.test(text)) {
    throw new TypeError('A non-negative amount with at most two decimals is required.');
  }
  const [pounds, decimals = ''] = text.split('.');
  const pennies = Number(pounds) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(pennies)) throw new RangeError('Amount is too large.');
  return pennies;
}

function quantityHundredths(value) {
  const text = String(value).trim();
  if (!/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.test(text)) {
    throw new TypeError('Quantity must be non-negative with at most two decimals.');
  }
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new RangeError('Quantity is too large.');
  return result;
}

function lineTotals(lines, section) {
  if (!Array.isArray(lines)) throw new TypeError(section + ' must be a list.');
  let total = 0;
  const details = lines.map((line, index) => {
    if (!line || typeof line.description !== 'string' || !line.description.trim()) {
      throw new TypeError(section + ' line ' + (index + 1) + ' needs a description.');
    }
    const qty = quantityHundredths(line.quantity);
    const rate = poundsToPence(line.rate);
    const product = qty * rate;
    if (!Number.isSafeInteger(product)) throw new RangeError('Line amount is too large.');
    const pennies = Math.floor((product + 50) / 100); // round half up to 1 penny
    total += pennies;
    if (!Number.isSafeInteger(total)) throw new RangeError('Section total is too large.');
    return { description: line.description.trim(), quantity: line.quantity, ratePence: rate, totalPence: pennies };
  });
  return { totalPence: total, lines: details };
}

export function calculateDraftInvoice({
  income = [], deductions = [], adminFees = [], vatStatus = 'not_registered'
} = {}) {
  if (vatStatus !== 'not_registered') {
    throw new Error('VAT-registered or VAT-POT invoices require accountant-approved rules before calculation.');
  }
  const incomeResult = lineTotals(income, 'income');
  const deductionResult = lineTotals(deductions, 'deductions');
  const feesResult = lineTotals(adminFees, 'adminFees');
  const netPence = incomeResult.totalPence - deductionResult.totalPence - feesResult.totalPence;
  if (!Number.isSafeInteger(netPence)) throw new RangeError('Net amount is too large.');
  return {
    status: 'DRAFT_ONLY',
    income: incomeResult,
    deductions: deductionResult,
    adminFees: feesResult,
    netPence,
    vatPence: 0,
    grossToPayPence: netPence,
    vatPotRefundPence: 0,
    vatPotTransferPence: 0,
    totalToPayPence: netPence,
    grossTotalPence: netPence,
    requiresOfficeApproval: true,
    requiresAccountantApprovedInvoiceTemplate: true
  };
}
