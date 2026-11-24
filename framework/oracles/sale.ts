import type { CategoryId, ItemLine, PaymentCondition } from '../api/types.js';
import { percentOf, pmt } from './money.js';
import { SPEC } from './spec.js';

export interface SaleScenario {
  category: CategoryId;
  customerId: string;
  items: ItemLine[];
  discountBps: number;
  paymentCondition: PaymentCondition;
  /** only for `installments` (2 or 3) */
  installments?: number;
}

export interface ExpectedSale {
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  freightBps: number;
  freightCents: number;
  taxableBaseCents: number;
  taxBps: number;
  taxCents: number;
  totalCents: number;
  installments: number;
  chargeCents: number;
  payableCents: number;
  installmentCents: number;
  schedule: { number: number; dueInDays: number; amountCents: number }[];
  requiresApproval: boolean;
}

/** Expected sale result, derived only from the written rules in spec.ts. */
export function expectedSale(s: SaleScenario): ExpectedSale {
  const { uf } = SPEC.customers[s.customerId]!;
  const subtotalCents = s.items.reduce((sum, i) => sum + SPEC.prices[i.sku]! * i.qty, 0);
  const discountCents = percentOf(subtotalCents, s.discountBps);
  const netCents = subtotalCents - discountCents;
  const freightBps = SPEC.freightBpsByUf[uf]!;
  const freightCents = percentOf(netCents, freightBps);
  const taxableBaseCents = netCents + freightCents;
  const taxBps = SPEC.taxBpsByUf[uf]!;
  const taxCents = percentOf(taxableBaseCents, taxBps);
  const totalCents = taxableBaseCents + taxCents;

  let installments = 1;
  let installmentCents = totalCents;
  let payableCents = totalCents;
  let schedule = [{ number: 1, dueInDays: 0, amountCents: totalCents }];

  if (s.paymentCondition === 'extended') {
    payableCents = totalCents + percentOf(totalCents, SPEC.extendedChargeBps);
    installmentCents = payableCents;
    schedule = [{ number: 1, dueInDays: SPEC.extendedDays, amountCents: payableCents }];
  } else if (s.paymentCondition === 'installments') {
    installments = s.installments ?? 2;
    installmentCents = pmt(totalCents, SPEC.installmentRateBps, installments);
    payableCents = installmentCents * installments;
    schedule = Array.from({ length: installments }, (_, k) => ({ number: k + 1, dueInDays: SPEC.extendedDays * (k + 1), amountCents: installmentCents }));
  }

  return {
    subtotalCents,
    discountCents,
    netCents,
    freightBps,
    freightCents,
    taxableBaseCents,
    taxBps,
    taxCents,
    totalCents,
    installments,
    chargeCents: payableCents - totalCents,
    payableCents,
    installmentCents,
    schedule,
    requiresApproval: s.discountBps > SPEC.approvalDiscountBps || payableCents > SPEC.approvalValueCents,
  };
}
