import type { RoleKey } from '../../framework/config/accounts.js';
import { baseLease } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';

/**
 * What each role may do. The sandbox has four real roles, so access control can be tested for real
 * (one table, one test per role, every action checked against the expected HTTP status).
 */
type Action = 'list' | 'read' | 'preview' | 'create' | 'update' | 'delete' | 'duplicate' | 'submit' | 'approve' | 'reject' | 'cancel' | 'report' | 'export';

const EXPECTED: Record<RoleKey, Record<Action, number>> = {
  admin: { list: 200, read: 200, preview: 200, create: 201, update: 200, delete: 204, duplicate: 201, submit: 200, approve: 200, reject: 200, cancel: 200, report: 200, export: 200 },
  seller: { list: 200, read: 200, preview: 200, create: 201, update: 200, delete: 204, duplicate: 201, submit: 200, approve: 403, reject: 403, cancel: 403, report: 200, export: 200 },
  approver: { list: 200, read: 200, preview: 403, create: 403, update: 403, delete: 403, duplicate: 403, submit: 403, approve: 200, reject: 200, cancel: 200, report: 200, export: 200 },
  viewer: { list: 200, read: 200, preview: 403, create: 403, update: 403, delete: 403, duplicate: 403, submit: 403, approve: 403, reject: 403, cancel: 403, report: 200, export: 200 },
};

const WRITERS: RoleKey[] = ['admin', 'seller'];

test.describe('Role-based access (API)', () => {
  for (const role of Object.keys(EXPECTED) as RoleKey[]) {
    test(`${role}: all ${Object.keys(EXPECTED[role]).length} actions answer as the permission table says`, async ({ api, apiAs, track }) => {
      const me = await apiAs(role);
      const owns = WRITERS.includes(role);
      // Fresh data per action, so one action never depends on another's outcome. Writers act on their own quotes.
      const owner = owns ? me : api;
      const draft = () => owner.createQuote(baseLease()).then(track);
      const pending = async () => {
        const quote = track(await owner.createQuote(baseLease({ discountBps: 2_000 })));
        return owner.submitQuote(quote.id);
      };
      const approved = async () => {
        const quote = await pending();
        return (await apiAs('approver')).approveQuote(quote.id);
      };

      const actual: Record<Action, number> = {} as Record<Action, number>;
      actual.list = (await me.send('GET', '/api/quotes')).status;
      actual.read = (await me.send('GET', `/api/quotes/${(await draft()).id}`)).status;
      actual.preview = (await me.preview(baseLease())).status;
      const created = await me.send('POST', '/api/quotes', { body: baseLease() });
      if (created.status === 201) track(created.body);
      actual.create = created.status;
      const toUpdate = await draft();
      actual.update = (await me.send('PUT', `/api/quotes/${toUpdate.id}`, { body: { ...baseLease({ discountBps: 100 }), version: toUpdate.version } })).status;
      actual.delete = (await me.deleteQuote((await draft()).id)).status;
      actual.duplicate = (await (async () => { const r = await me.send('POST', `/api/quotes/${(await draft()).id}/duplicate`); if (r.status === 201) track(r.body); return r; })()).status;
      actual.submit = (await me.send('POST', `/api/quotes/${(await draft()).id}/submit`)).status;
      actual.approve = (await me.send('POST', `/api/quotes/${(await pending()).id}/approve`)).status;
      actual.reject = (await me.send('POST', `/api/quotes/${(await pending()).id}/reject`, { body: { reason: 'valid reason' } })).status;
      actual.cancel = (await me.send('POST', `/api/quotes/${(await approved()).id}/cancel`)).status;
      actual.report = (await me.send('GET', '/api/reports/summary')).status;
      actual.export = (await me.send('GET', '/api/reports/export.csv')).status;

      expect(actual).toEqual(EXPECTED[role]);
    });
  }

  test('a seller can change only their own quotes, an administrator can change anyone\'s', async ({ api, apiAs, track }) => {
    const seller = await apiAs('seller');
    const adminQuote = track(await api.createQuote(baseLease()));
    const sellerQuote = track(await seller.createQuote(baseLease()));

    for (const [method, path, body] of [
      ['PUT', `/api/quotes/${adminQuote.id}`, { ...baseLease(), version: adminQuote.version }],
      ['DELETE', `/api/quotes/${adminQuote.id}`, undefined],
      ['POST', `/api/quotes/${adminQuote.id}/submit`, undefined],
    ] as const) {
      expect((await seller.send(method, path, { body })).status, `seller ${method} on an admin quote`).toBe(403);
    }
    expect((await seller.getQuote(adminQuote.id)).id, 'but a seller may read it').toBe(adminQuote.id);
    expect((await seller.duplicateQuote(adminQuote.id)).createdBy, 'and copy it into their own draft').toBe('vendedor');
    expect((await api.updateQuote(sellerQuote.id, baseLease({ discountBps: 50 }), sellerQuote.version)).updatedBy, 'admin edits a seller quote').toBe('admin');
  });

  test('the permission check comes before the state check: a forbidden role gets 403 even on a closed quote', async ({ api, apiAs, track }) => {
    const approved = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    const seller = await apiAs('seller');
    expect((await seller.send('POST', `/api/quotes/${approved.id}/cancel`)).status).toBe(403);
  });

  test('read access never leaks write data: viewers see the same quote an administrator sees', async ({ api, apiAs, track }) => {
    const created = track(await api.createQuote(baseLease({ notes: 'visible to all roles' })));
    const viewer = await apiAs('viewer');
    expect(await viewer.getQuote(created.id)).toEqual(created);
  });
});
