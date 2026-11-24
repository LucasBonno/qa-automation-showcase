import { baseLease, baseSale, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';
import { expectedLease } from '../../framework/oracles/lease.js';
import { formatDecimal } from '../../framework/oracles/money.js';

/**
 * These tests change data and compare the reports before and after, so they run alone and in order
 * (serial mode, and a project that starts only after every other suite has finished).
 */
test.describe.configure({ mode: 'serial' });

const small = baseLease({ category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 2 }], termMonths: 24 });
const smallValue = expectedLease({ category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 2 }], termMonths: 24, discountBps: 0, addOn: false }).contractTotalCents;

test.describe('Reports react to what happens to quotes', () => {
  test('an approved quote adds its contract total to "approved" in the API and on the screen', async ({ api, track, openAs, reportsPage }) => {
    const before = await api.reportSummary();
    const quote = track(await api.submitQuote((await api.createQuote(small)).id));
    expect(quote.calc.headlineCents).toBe(smallValue);
    const after = await api.reportSummary();
    expect(after.totalCount).toBe(before.totalCount + 1);
    expect(after.approvedValueCents).toBe(before.approvedValueCents + smallValue);
    expect(after.byStatus.approved!.count).toBe(before.byStatus.approved!.count + 1);
    expect(after.byCategory.notebooks!.valueCents).toBe(before.byCategory.notebooks!.valueCents + smallValue);

    await openAs('admin', '#/reports');
    expect(await reportsPage.cardCents('approved-value')).toBe(after.approvedValueCents);
    await expect(reportsPage.card('total-count')).toContainText(String(after.totalCount));
  });

  test('cancelling an approved quote moves its value from "approved" to "cancelled"', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const quote = track(await api.submitQuote((await api.createQuote(small)).id));
    const before = await api.reportSummary();
    await approver.cancelQuote(quote.id);
    const after = await api.reportSummary();
    expect(after.approvedValueCents).toBe(before.approvedValueCents - smallValue);
    expect(after.byStatus.cancelled!.valueCents).toBe(before.byStatus.cancelled!.valueCents + smallValue);
    expect(after.totalCount).toBe(before.totalCount);
  });

  test('a quote waiting for approval counts as pending, and rejecting moves it to "rejected"', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const draft = track(await api.createQuote({ ...small, discountBps: 2_000 }));
    const pendingValue = (await api.submitQuote(draft.id)).calc.headlineCents;
    const mid = await api.reportSummary();
    await approver.rejectQuote(draft.id, 'Not within policy');
    const end = await api.reportSummary();
    expect(end.pendingValueCents).toBe(mid.pendingValueCents - pendingValue);
    expect(end.byStatus.rejected!.valueCents).toBe(mid.byStatus.rejected!.valueCents + pendingValue);
  });

  test('deleting a draft removes it from every total', async ({ api }) => {
    const draft = await api.createQuote(small);
    const withDraft = await api.reportSummary();
    await api.deleteQuote(draft.id);
    const without = await api.reportSummary();
    expect(without.totalCount).toBe(withDraft.totalCount - 1);
    expect(without.byStatus.draft!.count).toBe(withDraft.byStatus.draft!.count - 1);
    expect(without.byStatus.draft!.valueCents).toBe(withDraft.byStatus.draft!.valueCents - smallValue);
  });

  test('editing a draft changes the value reported for drafts by exactly the difference', async ({ api, track }) => {
    const draft = track(await api.createQuote(small));
    const before = await api.reportSummary();
    const bigger = baseLease({ ...small, items: [{ sku: 'NB-AUR-14', qty: 5 }] });
    await api.updateQuote(draft.id, bigger, draft.version);
    const biggerValue = expectedLease({ category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 5 }], termMonths: 24, discountBps: 0, addOn: false }).contractTotalCents;
    const after = await api.reportSummary();
    expect(after.byStatus.draft!.valueCents).toBe(before.byStatus.draft!.valueCents + (biggerValue - smallValue));
    expect(after.byStatus.draft!.count).toBe(before.byStatus.draft!.count);
  });

  test('a sale is reported by its amount payable, not by the total before financing', async ({ api, track }) => {
    const sale = baseSale({ items: [{ sku: 'NB-AUR-14', qty: 3 }], customerId: 'c3', paymentCondition: 'installments', installments: 3 });
    const before = await api.reportSummary();
    const created = track(await api.createQuote(sale));
    const after = await api.reportSummary();
    const calc = created.calc as { payableCents: number; totalCents: number };
    expect(calc.payableCents).toBeGreaterThan(calc.totalCents);
    expect(after.byType.sale!.valueCents).toBe(before.byType.sale!.valueCents + calc.payableCents);
  });

  test('the CSV includes a new quote with its value and creator', async ({ api, track }) => {
    const tag = uniqueTag();
    const created = track(await api.createQuote({ ...small, notes: tag }));
    const res = await api.send('GET', '/api/reports/export.csv');
    const line = res.text.split('\r\n').find((l) => l.startsWith(created.code));
    expect(line).toBeDefined();
    const cells = line!.split(';');
    expect(cells[5]).toBe(formatDecimal(smallValue));
    expect(cells[6]).toBe('admin');
  });
});

test.describe('Listing order and paging on stable data', () => {
  test('the most recently changed quote comes first, and an edit moves a quote back to the top', async ({ api, track }) => {
    const older = track(await api.createQuote(baseLease()));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const newer = track(await api.createQuote(baseLease()));
    expect((await api.list({ pageSize: 2 })).items.map((q) => q.code)).toEqual([newer.code, older.code]);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await api.updateQuote(older.id, baseLease({ discountBps: 50 }), older.version);
    expect((await api.list({ pageSize: 2 })).items.map((q) => q.code)).toEqual([older.code, newer.code]);
  });

  test('pages never overlap and together contain every quote exactly once', async ({ api }) => {
    const all = await api.listAll();
    const pageSize = 5;
    const first = await api.list({ pageSize, page: 1 });
    const collected: number[] = [];
    for (let page = 1; page <= first.totalPages; page += 1) collected.push(...(await api.list({ pageSize, page })).items.map((q) => q.id));
    expect(collected).toHaveLength(all.length);
    expect(new Set(collected).size).toBe(all.length);
    expect(first.totalPages).toBe(Math.ceil(all.length / pageSize));
  });
});
