import { expect } from '@playwright/test';
import type { ExpectedLease } from '../oracles/lease.js';
import { formatBRL, formatPercent, normalizeSpaces } from '../oracles/money.js';
import type { ExpectedSale } from '../oracles/sale.js';
import type { SummaryPanel } from '../pages/summary-panel.js';

/** Row key in the panel -> value in the expected object. Rows that only appear above zero are listed apart. */
const LEASE_ALWAYS: [string, keyof ExpectedLease][] = [
  ['subtotal', 'subtotalCents'],
  ['discount', 'discountCents'],
  ['net', 'netCents'],
  ['financed', 'financedCents'],
  ['installment', 'installmentCents'],
  ['monthly-total', 'monthlyTotalCents'],
  ['contract-total', 'contractTotalCents'],
  ['interest-total', 'interestTotalCents'],
];
const LEASE_OPTIONAL: [string, keyof ExpectedLease][] = [
  ['addon-financed', 'addOnFinancedCents'],
  ['addon-monthly', 'addOnMonthlyCents'],
];

const SALE_ALWAYS: [string, keyof ExpectedSale][] = [
  ['subtotal', 'subtotalCents'],
  ['discount', 'discountCents'],
  ['net', 'netCents'],
  ['freight', 'freightCents'],
  ['taxable-base', 'taxableBaseCents'],
  ['tax', 'taxCents'],
  ['total', 'totalCents'],
  ['payable', 'payableCents'],
  ['installment', 'installmentCents'],
];

/**
 * Compares every row of the panel with the oracle, twice: the exact integer (data-cents) and the text the user
 * reads ("R$ 1.234,56"), so both the math and the pt-BR formatting are covered.
 */
export async function expectLeaseSummary(panel: SummaryPanel, expected: ExpectedLease): Promise<void> {
  await panel.waitReady();
  for (const [key, field] of LEASE_ALWAYS) {
    const cents = expected[field] as number;
    expect(await panel.cents(key), `row ${key}`).toBe(cents);
    expect(normalizeSpaces(await panel.value(key).innerText()), `text of ${key}`).toBe(formatBRL(cents));
  }
  for (const [key, field] of LEASE_OPTIONAL) {
    const cents = expected[field] as number;
    expect(await panel.cents(key), `optional row ${key}`).toBe(cents > 0 ? cents : null);
  }
  expect(normalizeSpaces(await panel.value('rate').innerText())).toBe(`${formatPercent(expected.rateBps)} a.m.`);
  expect(normalizeSpaces(await panel.value('term').innerText())).toBe(`${expected.termMonths} meses`);
  expect(await panel.requiresApproval(), 'approval flag').toBe(expected.requiresApproval);
}

export async function expectSaleSummary(panel: SummaryPanel, expected: ExpectedSale): Promise<void> {
  await panel.waitReady();
  for (const [key, field] of SALE_ALWAYS) {
    const cents = expected[field] as number;
    expect(await panel.cents(key), `row ${key}`).toBe(cents);
    expect(normalizeSpaces(await panel.value(key).innerText()), `text of ${key}`).toBe(formatBRL(cents));
  }
  expect(await panel.cents('charge'), 'financial charge row').toBe(expected.chargeCents > 0 ? expected.chargeCents : null);
  expect(await panel.scheduleCents(), 'payment schedule').toEqual(expected.schedule.map((s) => s.amountCents));
  expect(await panel.requiresApproval(), 'approval flag').toBe(expected.requiresApproval);
}
