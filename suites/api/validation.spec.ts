import { baseLease, baseSale, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';

const preview = (api: { send: (m: string, p: string, o?: { body?: unknown; rawBody?: string }) => Promise<{ status: number; body: any }> }, body: unknown) =>
  api.send('POST', '/api/quotes/preview', { body });

test.describe('Quotes API · input validation', () => {
  test('an empty payload reports every required field at once', async ({ api }) => {
    const res = await preview(api, {});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['category', 'customerId', 'discountBps', 'items', 'type']);
  });

  test('a body that is not an object is refused: arrays by validation, bare JSON values by the parser', async ({ api }) => {
    const array = await api.send('POST', '/api/quotes/preview', { rawBody: '[]' });
    expect(array.status).toBe(400);
    expect(array.body.fields.body).toBe('Corpo da requisição inválido.');
    for (const bare of ['"text"', '42', 'null', 'true']) {
      const res = await api.send('POST', '/api/quotes/preview', { rawBody: bare });
      expect(res.status, bare).toBe(400);
      expect(res.body.error, bare).toBe('invalid_json');
    }
  });

  test('malformed JSON answers 400 invalid_json instead of a server error', async ({ api }) => {
    const res = await api.send('POST', '/api/quotes', { rawBody: '{"type": "lease", ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });

  test('an oversized body is refused with 413', async ({ api }) => {
    const res = await api.send('POST', '/api/quotes', { body: baseLease({ notes: 'x'.repeat(80_000) }) });
    expect(res.status).toBe(413);
  });

  test('unknown type, category and customer are rejected with a message per field', async ({ api }) => {
    const res = await preview(api, { ...baseLease(), type: 'rent', category: 'servers', customerId: 'c99' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toMatchObject({ type: 'Tipo inválido.', category: 'Selecione uma categoria.', customerId: 'Selecione um cliente.' });
  });

  test('discount accepts 0 and 30% and refuses everything outside, including non-integers and strings', async ({ api }) => {
    for (const discountBps of [0, 3_000]) expect((await preview(api, baseLease({ discountBps }))).status, `discount ${discountBps}`).toBe(200);
    for (const discountBps of [-1, 3_001, 10.5, '500', null, Number.MAX_SAFE_INTEGER]) {
      const res = await preview(api, { ...baseLease(), discountBps });
      expect(res.status, `discount ${JSON.stringify(discountBps)}`).toBe(400);
      expect(res.body.fields.discountBps).toBe('Desconto deve estar entre 0% e 30%.');
    }
  });

  test('lease term accepts only 12, 24, 36, 48 and 60 months', async ({ api }) => {
    for (const termMonths of [0, 6, 13, 35, 61, 36.5, '36', null]) {
      const res = await preview(api, { ...baseLease(), termMonths });
      expect(res.status, `term ${JSON.stringify(termMonths)}`).toBe(400);
      expect(res.body.fields.termMonths).toBe('Prazo inválido. Use 12, 24, 36, 48 ou 60 meses.');
    }
  });

  test('the lease add-on must be a boolean, and a sale cannot carry it', async ({ api }) => {
    const text = await preview(api, { ...baseLease(), addOn: 'yes' });
    expect(text.body.fields.addOn).toBe('Valor inválido para o adicional.');
    const onSale = await preview(api, { ...baseSale(), addOn: true });
    expect(onSale.body.fields.addOn).toBe('O adicional só se aplica à locação.');
  });

  test('sale payment condition and installment count are validated', async ({ api }) => {
    const bad = await preview(api, { ...baseSale(), paymentCondition: 'barter' });
    expect(bad.body.fields.paymentCondition).toBe('Condição de pagamento inválida.');
    for (const installments of [undefined, 0, 1, 4, 2.5, '2']) {
      const res = await preview(api, { ...baseSale(), paymentCondition: 'installments', installments });
      expect(res.status, `installments ${JSON.stringify(installments)}`).toBe(400);
      expect(res.body.fields.installments).toBe('Parcelas devem ser 2 ou 3.');
    }
    for (const installments of [2, 3]) expect((await preview(api, { ...baseSale(), paymentCondition: 'installments', installments })).status).toBe(200);
  });

  test('installments sent with cash or extended payment are ignored, not an error', async ({ api }) => {
    const res = await preview(api, { ...baseSale(), paymentCondition: 'cash', installments: 7 });
    expect(res.status).toBe(200);
    expect(res.body.calc.installments).toBe(1);
  });

  test('items: empty, repeated, unknown and malformed entries each get a clear message', async ({ api }) => {
    const cases: [string, unknown, string][] = [
      ['empty list', [], 'Adicione ao menos um item.'],
      ['not a list', 'NB-AUR-14', 'Adicione ao menos um item.'],
      ['repeated SKU', [{ sku: 'NB-AUR-14', qty: 1 }, { sku: 'NB-AUR-14', qty: 2 }], 'Item NB-AUR-14 repetido.'],
      ['unknown SKU', [{ sku: 'XX-000', qty: 1 }], 'Item XX-000 não existe no catálogo.'],
      ['entry that is not an object', ['NB-AUR-14'], 'Item inválido.'],
      ['entry without SKU', [{ qty: 1 }], 'Item inválido.'],
      ['quantity as text', [{ sku: 'NB-AUR-14', qty: '2' }], 'Quantidade de NB-AUR-14 deve estar entre 1 e 200.'],
    ];
    for (const [name, items, message] of cases) {
      const res = await preview(api, { ...baseLease(), items });
      expect(res.status, name).toBe(400);
      expect(res.body.fields.items, name).toBe(message);
    }
  });

  test('more than 20 distinct items is refused', async ({ api }) => {
    const items = Array.from({ length: 21 }, (_, i) => ({ sku: `NB-AUR-${i}`, qty: 1 }));
    const res = await preview(api, { ...baseLease(), items });
    expect(res.body.fields.items).toBe('Máximo de 20 itens distintos.');
  });

  test('notes accept exactly 200 characters, refuse 201 and are trimmed when stored', async ({ api, track }) => {
    expect((await preview(api, baseLease({ notes: 'a'.repeat(200) }))).status).toBe(200);
    const over = await preview(api, baseLease({ notes: 'a'.repeat(201) }));
    expect(over.body.fields.notes).toBe('Observações devem ter no máximo 200 caracteres.');
    const tag = uniqueTag();
    const stored = track(await api.createQuote(baseLease({ notes: `   ${tag}   ` })));
    expect(stored.notes).toBe(tag);
  });

  test('notes that are only spaces count as empty, and spaces do not count toward the 200', async ({ api }) => {
    expect((await preview(api, baseLease({ notes: ' '.repeat(300) }))).status).toBe(200);
    expect((await preview(api, baseLease({ notes: `${' '.repeat(50)}${'b'.repeat(200)}${' '.repeat(50)}` }))).status).toBe(200);
  });

  test('prototype-pollution style keys in the body do not reach the stored quote', async ({ api, track }) => {
    const res = await api.send('POST', '/api/quotes', { rawBody: JSON.stringify({ ...baseLease(), __proto__: { admin: true }, constructor: { prototype: { polluted: true } } }) });
    expect(res.status).toBe(201);
    track(res.body);
    const again = await api.send('GET', '/api/catalog');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(again.status).toBe(200);
  });
});
