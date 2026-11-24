import type { CategoryId, ItemLine } from '../api/types.js';
import { percentOf, pmt } from './money.js';
import { SPEC } from './spec.js';

export interface LeaseScenario {
  category: CategoryId;
  items: ItemLine[];
  termMonths: number;
  discountBps: number;
  addOn: boolean;
}

export interface ExpectedLease {
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  addOnFinancedCents: number;
  financedCents: number;
  rateBps: number;
  termMonths: number;
  installmentCents: number;
  addOnMonthlyCents: number;
  monthlyTotalCents: number;
  contractTotalCents: number;
  interestTotalCents: number;
  requiresApproval: boolean;
}

/** Expected lease result, derived only from the written rules in spec.ts. */
export function expectedLease(s: LeaseScenario): ExpectedLease {
  const category = SPEC.categories[s.category];
  const units = s.items.reduce((sum, i) => sum + i.qty, 0);
  const subtotalCents = s.items.reduce((sum, i) => sum + SPEC.prices[i.sku]! * i.qty, 0);
  const discountCents = percentOf(subtotalCents, s.discountBps);
  const netCents = subtotalCents - discountCents;

  let addOnFinancedCents = 0;
  let addOnMonthlyCents = 0;
  if (s.addOn) {
    const { kind, value } = category.addOn;
    if (kind === 'financed-percent') addOnFinancedCents = percentOf(netCents, value);
    else if (kind === 'financed-per-unit') addOnFinancedCents = value * units;
    else if (kind === 'monthly-per-unit') addOnMonthlyCents = value * units;
    else addOnMonthlyCents = percentOf(netCents, value);
  }

  const financedCents = netCents + addOnFinancedCents;
  const installmentCents = pmt(financedCents, category.rateBps, s.termMonths);
  const monthlyTotalCents = installmentCents + addOnMonthlyCents;
  const contractTotalCents = monthlyTotalCents * s.termMonths;

  return {
    subtotalCents,
    discountCents,
    netCents,
    addOnFinancedCents,
    financedCents,
    rateBps: category.rateBps,
    termMonths: s.termMonths,
    installmentCents,
    addOnMonthlyCents,
    monthlyTotalCents,
    contractTotalCents,
    interestTotalCents: installmentCents * s.termMonths - financedCents,
    requiresApproval: s.discountBps > SPEC.approvalDiscountBps || contractTotalCents > SPEC.approvalValueCents,
  };
}
