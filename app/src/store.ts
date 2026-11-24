import { calculate, priceLines } from './calc.js';
import type { HistoryEntry, QuoteInput, QuoteRecord, QuoteStatus } from './types.js';

/** In-memory "database". Restarting the server (or calling the test-mode reset) restores the seed. */
class QuoteStore {
  private quotes = new Map<number, QuoteRecord>();
  private nextId = 1;

  all(): QuoteRecord[] {
    return [...this.quotes.values()];
  }

  get(id: number): QuoteRecord | undefined {
    return this.quotes.get(id);
  }

  create(input: QuoteInput, by: string, at = new Date().toISOString()): QuoteRecord {
    const id = this.nextId++;
    const lines = priceLines(input.items);
    const record: QuoteRecord = {
      id,
      code: `QL-${String(id).padStart(6, '0')}`,
      version: 1,
      input,
      lines,
      calc: calculate(input, lines),
      status: 'draft',
      rejectionReason: null,
      createdBy: by,
      createdAt: at,
      updatedBy: by,
      updatedAt: at,
      history: [{ at, by, action: 'created', from: null, to: 'draft' }],
    };
    this.quotes.set(id, record);
    return record;
  }

  update(record: QuoteRecord, input: QuoteInput, by: string): QuoteRecord {
    const at = new Date().toISOString();
    record.input = input;
    record.lines = priceLines(input.items);
    record.calc = calculate(input, record.lines);
    record.version += 1;
    record.updatedBy = by;
    record.updatedAt = at;
    record.history.push({ at, by, action: 'updated', from: record.status, to: record.status });
    return record;
  }

  transition(
    record: QuoteRecord,
    to: QuoteStatus,
    action: HistoryEntry['action'],
    by: string,
    note?: string,
  ): QuoteRecord {
    const at = new Date().toISOString();
    const entry: HistoryEntry = { at, by, action, from: record.status, to };
    if (note) entry.note = note;
    record.history.push(entry);
    record.status = to;
    record.version += 1;
    record.updatedBy = by;
    record.updatedAt = at;
    record.rejectionReason = to === 'rejected' ? (note ?? null) : null;
    return record;
  }

  delete(id: number): boolean {
    return this.quotes.delete(id);
  }

  reset(): void {
    this.quotes.clear();
    this.nextId = 1;
    seed(this);
  }
}

function seedQuote(
  store: QuoteStore,
  input: Omit<QuoteInput, 'notes'> & { notes?: string },
  by: string,
  at: string,
  finalStatus: QuoteStatus,
): void {
  const record = store.create({ notes: '', ...input }, by, at);
  const approver = 'aprovador';
  const steps: Record<QuoteStatus, () => void> = {
    draft: () => undefined,
    pending_approval: () => store.transition(record, 'pending_approval', 'submitted', by),
    approved: () => {
      store.transition(record, 'pending_approval', 'submitted', by);
      store.transition(record, 'approved', 'approved', approver);
    },
    rejected: () => {
      store.transition(record, 'pending_approval', 'submitted', by);
      store.transition(record, 'rejected', 'rejected', approver, 'Desconto acima da política.');
    },
    cancelled: () => {
      store.transition(record, 'pending_approval', 'submitted', by);
      store.transition(record, 'approved', 'approved', approver);
      store.transition(record, 'cancelled', 'cancelled', approver);
    },
  };
  steps[finalStatus]();
}

/** A small, deterministic data set so list, filters and reports have something to show. */
function seed(store: QuoteStore): void {
  const lease = (category: QuoteInput['category'], sku: string, qty: number, term: number, discountBps: number, addOn = false, customerId = 'c1') =>
    ({ type: 'lease', category, customerId, items: [{ sku, qty }], discountBps, termMonths: term, addOn, paymentCondition: null, installments: null }) satisfies Omit<QuoteInput, 'notes'>;
  const sale = (category: QuoteInput['category'], sku: string, qty: number, pc: 'cash' | 'extended' | 'installments', discountBps: number, installments: number, customerId = 'c2') =>
    ({ type: 'sale', category, customerId, items: [{ sku, qty }], discountBps, termMonths: null, addOn: false, paymentCondition: pc, installments }) satisfies Omit<QuoteInput, 'notes'>;

  seedQuote(store, lease('notebooks', 'NB-AUR-14', 10, 36, 500, true), 'vendedor', '2026-01-05T12:00:00.000Z', 'approved');
  seedQuote(store, lease('notebooks', 'NB-BOR-13', 40, 48, 1200, false, 'c3'), 'vendedor', '2026-01-08T12:00:00.000Z', 'pending_approval');
  seedQuote(store, lease('printers', 'PR-LUM-200', 20, 24, 0, true, 'c4'), 'admin', '2026-01-12T12:00:00.000Z', 'approved');
  seedQuote(store, lease('printers', 'PR-LUM-500', 5, 12, 300, false, 'c5'), 'vendedor', '2026-01-15T12:00:00.000Z', 'draft');
  seedQuote(store, lease('mobile', 'MB-NOV-5', 60, 24, 1500, true, 'c6'), 'vendedor', '2026-01-20T12:00:00.000Z', 'rejected');
  seedQuote(store, lease('automation', 'AU-ARG-MB', 12, 60, 0, true, 'c2'), 'admin', '2026-01-22T12:00:00.000Z', 'approved');
  seedQuote(store, sale('notebooks', 'NB-AUR-16P', 8, 'installments', 0, 3, 'c1'), 'vendedor', '2026-02-02T12:00:00.000Z', 'approved');
  seedQuote(store, sale('printers', 'PR-TER-ET', 15, 'extended', 200, 1, 'c2'), 'vendedor', '2026-02-04T12:00:00.000Z', 'approved');
  seedQuote(store, sale('mobile', 'MB-NOV-5P', 30, 'cash', 1100, 1, 'c3'), 'vendedor', '2026-02-09T12:00:00.000Z', 'pending_approval');
  seedQuote(store, sale('mobile', 'MB-ORB-10', 25, 'installments', 0, 2, 'c4'), 'admin', '2026-02-11T12:00:00.000Z', 'cancelled');
  seedQuote(store, sale('automation', 'AU-VEG-4', 6, 'cash', 0, 1, 'c5'), 'vendedor', '2026-02-16T12:00:00.000Z', 'draft');
  seedQuote(store, sale('automation', 'AU-ARG-1D', 80, 'extended', 100, 1, 'c6'), 'admin', '2026-02-18T12:00:00.000Z', 'approved');
}

export const store = new QuoteStore();
store.reset();
