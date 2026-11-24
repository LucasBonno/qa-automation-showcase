import { baseLease, baseSale, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';

test.describe('Quotes API · create, read, update, delete', () => {
  test('creating a quote returns 201, a sequential code, version 1, draft status and audit fields', async ({ api, track }) => {
    const before = Date.now();
    const quote = track(await api.createQuote(baseLease({ notes: uniqueTag() })));
    expect(quote.code).toMatch(/^QL-\d{6}$/);
    expect(Number(quote.code.slice(3))).toBe(quote.id);
    expect(quote.version).toBe(1);
    expect(quote.status).toBe('draft');
    expect(quote.createdBy).toBe('admin');
    expect(quote.updatedBy).toBe('admin');
    expect(new Date(quote.createdAt).getTime()).toBeGreaterThanOrEqual(before - 2_000);
    expect(quote.updatedAt).toBe(quote.createdAt);
    expect(quote.history).toHaveLength(1);
    expect(quote.history[0]).toMatchObject({ action: 'created', from: null, to: 'draft', by: 'admin' });
  });

  test('reading a quote returns what was stored, including the price snapshot of each item', async ({ api, track }) => {
    const created = track(await api.createQuote(baseSale({ items: [{ sku: 'NB-AUR-14', qty: 2 }, { sku: 'NB-BOR-13', qty: 1 }], customerId: 'c2' })));
    const read = await api.getQuote(created.id);
    expect(read).toEqual(created);
    expect(read.items).toEqual([
      { sku: 'NB-AUR-14', name: 'Notebook Aurora 14', qty: 2, unitCents: 489_000, lineCents: 978_000 },
      { sku: 'NB-BOR-13', name: 'Notebook Boreal 13', qty: 1, unitCents: 329_990, lineCents: 329_990 },
    ]);
    expect(read.customerName).toBe('Beta Logística S.A.');
    expect(read.customerUf).toBe('RJ');
  });

  test('unknown or malformed quote ids answer 404 with the same body', async ({ api }) => {
    const bodies = new Set<string>();
    for (const id of ['999999', 'abc', '0', '-1', '1.5', '99999999999', '%20']) {
      const res = await api.send('GET', `/api/quotes/${id}`);
      expect(res.status, `id "${id}"`).toBe(404);
      bodies.add(res.text);
    }
    expect(bodies.size, 'one uniform error body').toBe(1);
  });

  test('updating a quote raises the version, refreshes the audit fields and recalculates', async ({ api, track }) => {
    const created = track(await api.createQuote(baseLease()));
    const updated = await api.updateQuote(created.id, baseLease({ items: [{ sku: 'NB-AUR-14', qty: 5 }], discountBps: 500 }), created.version);
    expect(updated.version).toBe(2);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
    expect(updated.calc.subtotalCents).toBe(489_000 * 5);
    expect(updated.history.map((h) => h.action)).toEqual(['created', 'updated']);
  });

  test('updating with a stale version is refused with 409 and changes nothing (two editors, one wins)', async ({ api, track }) => {
    const created = track(await api.createQuote(baseLease()));
    await api.updateQuote(created.id, baseLease({ discountBps: 100 }), created.version);
    const stale = await api.send('PUT', `/api/quotes/${created.id}`, { body: { ...baseLease({ discountBps: 900 }), version: created.version } });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('conflict');
    expect((await api.getQuote(created.id)).discountBps, 'the first writer kept its value').toBe(100);
  });

  test('updating without a version is rejected', async ({ api, track }) => {
    const created = track(await api.createQuote(baseLease()));
    const res = await api.send('PUT', `/api/quotes/${created.id}`, { body: baseLease() });
    expect(res.status).toBe(400);
    expect(res.body.fields.version).toBe('Informe a versão da cotação.');
  });

  test('deleting a draft answers 204 and the quote is gone', async ({ api }) => {
    const created = await api.createQuote(baseLease());
    expect((await api.deleteQuote(created.id)).status).toBe(204);
    expect((await api.send('GET', `/api/quotes/${created.id}`)).status).toBe(404);
    expect((await api.deleteQuote(created.id)).status, 'deleting twice').toBe(404);
  });

  test('duplicating copies the content into a new draft owned by the caller', async ({ api, apiAs, track }) => {
    const original = track(await api.createQuote(baseSale({ items: [{ sku: 'NB-AUR-14', qty: 3 }], paymentCondition: 'installments', installments: 3, discountBps: 250, customerId: 'c5' })));
    const seller = await apiAs('seller');
    const copy = track(await seller.duplicateQuote(original.id));
    expect(copy.id).not.toBe(original.id);
    expect(copy.code).not.toBe(original.code);
    expect(copy.status).toBe('draft');
    expect(copy.version).toBe(1);
    expect(copy.createdBy).toBe('vendedor');
    expect(copy.history).toHaveLength(1);
    expect({ ...copy.calc }).toEqual({ ...original.calc });
    expect(copy.items).toEqual(original.items);
  });

  test('mass assignment: id, status, owner and version in the request body are ignored', async ({ api, track }) => {
    const res = await api.send('POST', '/api/quotes', {
      body: { ...baseLease(), id: 999_999, status: 'approved', createdBy: 'someone-else', version: 50, code: 'QL-999999', calc: { headlineCents: 1 } },
    });
    expect(res.status).toBe(201);
    track(res.body);
    expect(res.body.id).not.toBe(999_999);
    expect(res.body.status).toBe('draft');
    expect(res.body.createdBy).toBe('admin');
    expect(res.body.version).toBe(1);
    expect(res.body.code).not.toBe('QL-999999');
    expect(res.body.calc.headlineCents).toBeGreaterThan(1);
  });

  test('a quote cannot be edited, deleted or resubmitted once approved', async ({ api, track }) => {
    const approved = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    expect(approved.status).toBe('approved');
    for (const [method, path, body] of [
      ['PUT', `/api/quotes/${approved.id}`, { ...baseLease(), version: approved.version }],
      ['DELETE', `/api/quotes/${approved.id}`, undefined],
      ['POST', `/api/quotes/${approved.id}/submit`, undefined],
    ] as const) {
      const res = await api.send(method, path, { body });
      expect(res.status, `${method} ${path}`).toBe(409);
      expect(res.body.error).toBe('invalid_state');
    }
  });
});
