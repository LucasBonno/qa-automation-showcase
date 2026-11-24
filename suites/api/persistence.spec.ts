import { baseLease, baseSale, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';
import { expectedLease } from '../../framework/oracles/lease.js';
import { expectedSale } from '../../framework/oracles/sale.js';

/**
 * "Validate in the database": the test-mode endpoint dumps the raw store, so these tests check what was
 * actually persisted, not just what the API answers.
 */
test.describe('Persistence and audit trail', () => {
  test('a created quote is stored with the normalized input, the price snapshot and the calculation', async ({ api, track }) => {
    const tag = uniqueTag();
    const created = track(
      await api.createQuote(baseLease({ items: [{ sku: 'NB-AUR-16P', qty: 4 }], termMonths: 48, discountBps: 735, addOn: true, notes: ` ${tag} `, customerId: 'c6' })),
    );
    const row = (await api.dbDump()).quotes.find((q) => q.id === created.id)!;
    expect(row).toBeDefined();
    expect(row.input).toMatchObject({ type: 'lease', category: 'notebooks', customerId: 'c6', discountBps: 735, termMonths: 48, addOn: true, notes: tag, paymentCondition: null, installments: null });
    expect(row.lines).toEqual([{ sku: 'NB-AUR-16P', name: 'Notebook Aurora 16 Pro', qty: 4, unitCents: 735_000, lineCents: 2_940_000 }]);
    const expected = expectedLease({ category: 'notebooks', items: [{ sku: 'NB-AUR-16P', qty: 4 }], termMonths: 48, discountBps: 735, addOn: true });
    expect(row.calc).toMatchObject({ ...expected, kind: 'lease' });
  });

  test('sale fields that do not apply are stored as null, not as leftovers', async ({ api, track }) => {
    const created = track(await api.createQuote(baseSale({ paymentCondition: 'cash', installments: 3 })));
    const row = (await api.dbDump()).quotes.find((q) => q.id === created.id)!;
    expect(row.input).toMatchObject({ type: 'sale', termMonths: null, addOn: false, paymentCondition: 'cash', installments: 1 });
    expect(row.calc).toMatchObject({ kind: 'sale', ...expectedSale({ category: 'notebooks', customerId: 'c1', items: [{ sku: 'NB-AUR-14', qty: 1 }], discountBps: 0, paymentCondition: 'cash' }) });
  });

  test('audit fields follow every change: who, when, version and one history entry per step', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const created = track(await api.createQuote(baseLease({ discountBps: 1_500 })));
    const edited = await api.updateQuote(created.id, baseLease({ discountBps: 1_600 }), created.version);
    await api.submitQuote(created.id);
    await approver.approveQuote(created.id);

    const row = (await api.dbDump()).quotes.find((q) => q.id === created.id)!;
    expect(row.version).toBe(edited.version + 2);
    expect(row.createdBy).toBe('admin');
    expect(row.updatedBy).toBe('aprovador');
    expect(row.history.map((h) => [h.action, h.by])).toEqual([
      ['created', 'admin'],
      ['updated', 'admin'],
      ['submitted', 'admin'],
      ['approved', 'aprovador'],
    ]);
    const times = row.history.map((h) => new Date(h.at).getTime());
    expect(times, 'history is chronological').toEqual([...times].sort((a, b) => a - b));
    expect(row.updatedAt).toBe(row.history.at(-1)!.at);
    expect(row.createdAt).toBe(row.history[0]!.at);
  });

  test('every history entry links to the previous one: the "from" of a step is the "to" of the one before', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const created = track(await api.createQuote(baseLease({ discountBps: 2_000 })));
    await api.submitQuote(created.id);
    await approver.rejectQuote(created.id, 'needs a smaller discount');
    const { history } = await api.getQuote(created.id);
    for (let i = 1; i < history.length; i += 1) expect(history[i]!.from, `step ${i}`).toBe(history[i - 1]!.to);
  });

  test('deleting removes the quote from the store', async ({ api }) => {
    const created = await api.createQuote(baseLease());
    expect((await api.dbDump()).quotes.some((q) => q.id === created.id)).toBe(true);
    await api.deleteQuote(created.id);
    expect((await api.dbDump()).quotes.some((q) => q.id === created.id)).toBe(false);
  });

  test('the stored calculation is a snapshot: it is recomputed on update, never on read', async ({ api, track }) => {
    const created = track(await api.createQuote(baseLease({ items: [{ sku: 'NB-AUR-14', qty: 2 }] })));
    const first = await api.getQuote(created.id);
    const second = await api.getQuote(created.id);
    expect(second.calc).toEqual(first.calc);
    const updated = await api.updateQuote(created.id, baseLease({ items: [{ sku: 'NB-AUR-14', qty: 3 }] }), created.version);
    expect(updated.calc.subtotalCents).toBe(489_000 * 3);
    expect((await api.dbDump()).quotes.find((q) => q.id === created.id)!.calc.subtotalCents).toBe(489_000 * 3);
  });

  test('text in notes is stored verbatim: markup is escaped on output, never altered on input', async ({ api, track }) => {
    const payload = `<img src=x onerror=alert(1)> & "quotes" 'single' ${uniqueTag()}`;
    const created = track(await api.createQuote(baseLease({ notes: payload })));
    expect((await api.getQuote(created.id)).notes).toBe(payload);
  });

  test('accented and emoji text survives the round trip', async ({ api, track }) => {
    const payload = `Observação: instalação até às 14h — café ☕ ${uniqueTag()}`;
    const created = track(await api.createQuote(baseLease({ notes: payload })));
    expect((await api.getQuote(created.id)).notes).toBe(payload);
  });
});

test.describe('Listing', () => {
  test('page size and page number are validated', async ({ api }) => {
    for (const query of [{ pageSize: 0 }, { pageSize: 51 }, { pageSize: 'ten' }, { page: 0 }, { page: -2 }, { page: 'x' }, { page: 1.5 }]) {
      const res = await api.send('GET', '/api/quotes', { query: query as unknown as Record<string, string | number> });
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body.error).toBe('validation');
    }
    for (const pageSize of [1, 50]) expect((await api.send('GET', '/api/quotes', { query: { pageSize } })).status).toBe(200);
  });

  test('invalid filter values are rejected instead of silently ignored', async ({ api }) => {
    expect((await api.send('GET', '/api/quotes', { query: { status: 'done' } })).body.fields.status).toBe('Status inválido.');
    expect((await api.send('GET', '/api/quotes', { query: { category: 'servers' } })).body.fields.category).toBe('Categoria inválida.');
    expect((await api.send('GET', '/api/quotes', { query: { type: 'rent' } })).body.fields.type).toBe('Tipo inválido.');
    expect((await api.send('GET', '/api/quotes', { query: { q: 'x'.repeat(61) } })).body.fields.q).toBe('Busca deve ter no máximo 60 caracteres.');
  });
});
