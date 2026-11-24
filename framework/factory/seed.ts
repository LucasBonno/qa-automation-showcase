import type { CategoryId, QuoteStatus } from '../api/types.js';
import { type ExpectedLease, expectedLease } from '../oracles/lease.js';
import { type ExpectedSale, expectedSale } from '../oracles/sale.js';

/**
 * The 12 quotes QuoteLab starts with (and returns to after a test-mode reset), described independently of the app.
 * Used to check the lists and the reports against numbers the oracles compute from scratch.
 */
export interface SeedQuote {
  id: number;
  createdAt: string;
  code: string;
  kind: 'lease' | 'sale';
  category: CategoryId;
  status: QuoteStatus;
  createdBy: string;
  customer: string;
  headlineCents: number;
  expected: ExpectedLease | ExpectedSale;
}

const SEED_CREATED_AT: Record<number, string> = {
  1: '2026-01-05T12:00:00.000Z',
  2: '2026-01-08T12:00:00.000Z',
  3: '2026-01-12T12:00:00.000Z',
  4: '2026-01-15T12:00:00.000Z',
  5: '2026-01-20T12:00:00.000Z',
  6: '2026-01-22T12:00:00.000Z',
  7: '2026-02-02T12:00:00.000Z',
  8: '2026-02-04T12:00:00.000Z',
  9: '2026-02-09T12:00:00.000Z',
  10: '2026-02-11T12:00:00.000Z',
  11: '2026-02-16T12:00:00.000Z',
  12: '2026-02-18T12:00:00.000Z',
};

const lease = (id: number, category: CategoryId, sku: string, qty: number, termMonths: number, discountBps: number, addOn: boolean, customer: string, createdBy: string, status: QuoteStatus): SeedQuote => {
  const expected = expectedLease({ category, items: [{ sku, qty }], termMonths, discountBps, addOn });
  return { id, createdAt: SEED_CREATED_AT[id]!, code: `QL-${String(id).padStart(6, '0')}`, kind: 'lease', category, status, createdBy, customer, headlineCents: expected.contractTotalCents, expected };
};

const sale = (id: number, category: CategoryId, sku: string, qty: number, paymentCondition: 'cash' | 'extended' | 'installments', discountBps: number, installments: number, customerId: string, customer: string, createdBy: string, status: QuoteStatus): SeedQuote => {
  const expected = expectedSale({ category, customerId, items: [{ sku, qty }], discountBps, paymentCondition, installments });
  return { id, createdAt: SEED_CREATED_AT[id]!, code: `QL-${String(id).padStart(6, '0')}`, kind: 'sale', category, status, createdBy, customer, headlineCents: expected.payableCents, expected };
};

export const SEED: SeedQuote[] = [
  lease(1, 'notebooks', 'NB-AUR-14', 10, 36, 500, true, 'Alfa Comércio Ltda', 'vendedor', 'approved'),
  lease(2, 'notebooks', 'NB-BOR-13', 40, 48, 1_200, false, 'Gama Serviços ME', 'vendedor', 'pending_approval'),
  lease(3, 'printers', 'PR-LUM-200', 20, 24, 0, true, 'Delta Indústria Ltda', 'admin', 'approved'),
  lease(4, 'printers', 'PR-LUM-500', 5, 12, 300, false, 'Épsilon Varejo Ltda', 'vendedor', 'draft'),
  lease(5, 'mobile', 'MB-NOV-5', 60, 24, 1_500, true, 'Zeta Tecnologia S.A.', 'vendedor', 'rejected'),
  lease(6, 'automation', 'AU-ARG-MB', 12, 60, 0, true, 'Beta Logística S.A.', 'admin', 'approved'),
  sale(7, 'notebooks', 'NB-AUR-16P', 8, 'installments', 0, 3, 'c1', 'Alfa Comércio Ltda', 'vendedor', 'approved'),
  sale(8, 'printers', 'PR-TER-ET', 15, 'extended', 200, 1, 'c2', 'Beta Logística S.A.', 'vendedor', 'approved'),
  sale(9, 'mobile', 'MB-NOV-5P', 30, 'cash', 1_100, 1, 'c3', 'Gama Serviços ME', 'vendedor', 'pending_approval'),
  sale(10, 'mobile', 'MB-ORB-10', 25, 'installments', 0, 2, 'c4', 'Delta Indústria Ltda', 'admin', 'cancelled'),
  sale(11, 'automation', 'AU-VEG-4', 6, 'cash', 0, 1, 'c5', 'Épsilon Varejo Ltda', 'vendedor', 'draft'),
  sale(12, 'automation', 'AU-ARG-1D', 80, 'extended', 100, 1, 'c6', 'Zeta Tecnologia S.A.', 'admin', 'approved'),
];

/** Sum and count of the seed, grouped by any key. */
export function groupSeed(key: (q: SeedQuote) => string, filter: (q: SeedQuote) => boolean = () => true): Record<string, { count: number; valueCents: number }> {
  const out: Record<string, { count: number; valueCents: number }> = {};
  for (const q of SEED.filter(filter)) {
    const bucket = (out[key(q)] ??= { count: 0, valueCents: 0 });
    bucket.count += 1;
    bucket.valueCents += q.headlineCents;
  }
  return out;
}
