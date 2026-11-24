import { randomBytes } from 'node:crypto';
import type { QuotePayload } from '../api/types.js';
import type { LeaseScenario } from '../oracles/lease.js';
import type { SaleScenario } from '../oracles/sale.js';

export interface PayloadExtras {
  customerId?: string;
  notes?: string;
}

export function leasePayload(s: LeaseScenario, extras: PayloadExtras = {}): QuotePayload {
  return {
    type: 'lease',
    category: s.category,
    customerId: extras.customerId ?? 'c1',
    items: s.items.map((i) => ({ ...i })),
    discountBps: s.discountBps,
    notes: extras.notes ?? '',
    termMonths: s.termMonths,
    addOn: s.addOn,
  };
}

export function salePayload(s: SaleScenario, extras: Omit<PayloadExtras, 'customerId'> = {}): QuotePayload {
  return {
    type: 'sale',
    category: s.category,
    customerId: s.customerId,
    items: s.items.map((i) => ({ ...i })),
    discountBps: s.discountBps,
    notes: extras.notes ?? '',
    paymentCondition: s.paymentCondition,
    installments: s.paymentCondition === 'installments' ? (s.installments ?? 2) : undefined,
  };
}

/** The smallest valid lease: one notebook, 12 months. Override only what a test is about. */
export const baseLease = (over: Partial<QuotePayload> = {}): QuotePayload => ({
  type: 'lease',
  category: 'notebooks',
  customerId: 'c1',
  items: [{ sku: 'NB-AUR-14', qty: 1 }],
  discountBps: 0,
  notes: '',
  termMonths: 12,
  addOn: false,
  ...over,
});

/** The smallest valid sale: one notebook, paid in cash. */
export const baseSale = (over: Partial<QuotePayload> = {}): QuotePayload => ({
  type: 'sale',
  category: 'notebooks',
  customerId: 'c1',
  items: [{ sku: 'NB-AUR-14', qty: 1 }],
  discountBps: 0,
  notes: '',
  paymentCondition: 'cash',
  ...over,
});

/** A short unique marker to put in a quote's notes, so a test can find its own data among everyone else's. */
export const uniqueTag = (prefix = 'e2e'): string => `${prefix}-${randomBytes(4).toString('hex')}`;
