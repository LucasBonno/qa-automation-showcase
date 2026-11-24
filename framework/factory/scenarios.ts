import type { CategoryId } from '../api/types.js';
import type { LeaseScenario } from '../oracles/lease.js';
import { expectedLease } from '../oracles/lease.js';
import type { SaleScenario } from '../oracles/sale.js';
import { expectedSale } from '../oracles/sale.js';
import { SPEC } from '../oracles/spec.js';

export interface NamedLease extends LeaseScenario {
  name: string;
}
export interface NamedSale extends SaleScenario {
  name: string;
}

const byPrice = (category: CategoryId) => [...SPEC.skusByCategory[category]].sort((a, b) => SPEC.prices[a]! - SPEC.prices[b]!);

/**
 * Lease scenarios chosen where calculation bugs hide: smallest and largest quantities, every kind of rounding
 * (fractional discounts, odd-cent prices), the shortest and longest terms, and both sides of the 10% approval line.
 */
export function leaseScenarios(category: CategoryId): NamedLease[] {
  const [cheapest, middle, priciest] = byPrice(category) as [string, string, string];
  const max = SPEC.categories[category].maxQty;
  return [
    { name: 'one unit, 12 months, no discount, no add-on', category, items: [{ sku: cheapest, qty: 1 }], termMonths: 12, discountBps: 0, addOn: false },
    { name: 'one unit with add-on, 24 months, 5% discount', category, items: [{ sku: middle, qty: 1 }], termMonths: 24, discountBps: 500, addOn: true },
    {
      name: 'three SKUs, 36 months, 7,35% discount, add-on',
      category,
      items: [
        { sku: cheapest, qty: 3 },
        { sku: middle, qty: 2 },
        { sku: priciest, qty: 1 },
      ],
      termMonths: 36,
      discountBps: 735,
      addOn: true,
    },
    { name: 'odd quantity, 48 months, 3,33% discount (rounding)', category, items: [{ sku: cheapest, qty: 7 }], termMonths: 48, discountBps: 333, addOn: false },
    { name: 'maximum quantity per line, 60 months', category, items: [{ sku: cheapest, qty: max }], termMonths: 60, discountBps: 0, addOn: true },
    { name: 'discount exactly 10% does not require approval by discount', category, items: [{ sku: cheapest, qty: 2 }], termMonths: 12, discountBps: 1_000, addOn: false },
    { name: 'discount of 10,01% requires approval', category, items: [{ sku: cheapest, qty: 2 }], termMonths: 12, discountBps: 1_001, addOn: false },
    { name: 'maximum discount of 30%, 48 months, add-on', category, items: [{ sku: priciest, qty: 4 }], termMonths: 48, discountBps: 3_000, addOn: true },
  ];
}

/** Sale scenarios: every payment condition, customers in different states (freight and tax differ), approval edges. */
export function saleScenarios(category: CategoryId): NamedSale[] {
  const [cheapest, middle, priciest] = byPrice(category) as [string, string, string];
  const max = SPEC.categories[category].maxQty;
  return [
    { name: 'cash, no discount, customer in SP', category, customerId: 'c1', items: [{ sku: cheapest, qty: 1 }], discountBps: 0, paymentCondition: 'cash' },
    { name: 'extended 30 days, 5% discount, customer in RJ', category, customerId: 'c2', items: [{ sku: middle, qty: 3 }], discountBps: 500, paymentCondition: 'extended' },
    { name: 'two installments, 2,5% discount, customer in MG', category, customerId: 'c3', items: [{ sku: priciest, qty: 2 }], discountBps: 250, paymentCondition: 'installments', installments: 2 },
    {
      name: 'three installments, multiple SKUs, customer in RS',
      category,
      customerId: 'c4',
      items: [
        { sku: cheapest, qty: 5 },
        { sku: priciest, qty: 1 },
      ],
      discountBps: 0,
      paymentCondition: 'installments',
      installments: 3,
    },
    { name: 'cash with exactly 10% discount, customer in BA', category, customerId: 'c5', items: [{ sku: middle, qty: 2 }], discountBps: 1_000, paymentCondition: 'cash' },
    { name: 'extended with 10,01% discount requires approval, customer in PE', category, customerId: 'c6', items: [{ sku: middle, qty: 2 }], discountBps: 1_001, paymentCondition: 'extended' },
    { name: 'three installments with the maximum 30% discount', category, customerId: 'c1', items: [{ sku: priciest, qty: 3 }], discountBps: 3_000, paymentCondition: 'installments', installments: 3 },
    { name: 'maximum quantity per line, extended, customer in BA', category, customerId: 'c5', items: [{ sku: cheapest, qty: max }], discountBps: 0, paymentCondition: 'extended' },
  ];
}

/** Same search for a sale: smallest quantity whose amount payable crosses the approval line. */
export function saleApprovalThresholdQty(category: CategoryId, sku: string, customerId: string, paymentCondition: NamedSale['paymentCondition']): number | null {
  const max = SPEC.categories[category].maxQty;
  const needs = (qty: number) => expectedSale({ category, customerId, items: [{ sku, qty }], discountBps: 0, paymentCondition }).requiresApproval;
  if (!needs(max)) return null;
  let lo = 1;
  let hi = max;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (needs(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Smallest quantity of one SKU whose lease crosses the R$ 100.000,00 approval line, found with the oracle itself.
 * The contract total grows with the quantity, so a binary search is exact.
 */
export function approvalThresholdQty(category: CategoryId, sku: string, termMonths: number): number | null {
  const max = SPEC.categories[category].maxQty;
  const needs = (qty: number) => expectedLease({ category, items: [{ sku, qty }], termMonths, discountBps: 0, addOn: false }).requiresApproval;
  if (!needs(max)) return null;
  let lo = 1;
  let hi = max;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (needs(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
