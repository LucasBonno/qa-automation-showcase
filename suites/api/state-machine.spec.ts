import type { ApiClient } from '../../framework/api/client.js';
import type { QuoteStatus } from '../../framework/api/types.js';
import { baseLease } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';

/** A quote in the requested status, created through the real workflow. */
async function quoteIn(status: QuoteStatus, admin: ApiClient, approver: ApiClient) {
  const draft = await admin.createQuote(baseLease({ discountBps: status === 'draft' ? 0 : 1_500 }));
  if (status === 'draft') return draft;
  const pending = await admin.submitQuote(draft.id);
  if (status === 'pending_approval') return pending;
  if (status === 'rejected') return approver.rejectQuote(draft.id, 'discount too high');
  const approved = await approver.approveQuote(draft.id);
  if (status === 'approved') return approved;
  return approver.cancelQuote(draft.id); // cancelled
}

const STATUSES: QuoteStatus[] = ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'];

test.describe('Quotes API · approval workflow', () => {
  test('a quote with no discount and a small value is approved automatically on submit', async ({ api, track }) => {
    const submitted = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    expect(submitted.status).toBe('approved');
    expect(submitted.history.map((h) => h.action)).toEqual(['created', 'auto_approved']);
    expect(submitted.history[1]).toMatchObject({ from: 'draft', to: 'approved', by: 'admin' });
  });

  test('a discount above 10% sends the quote to the approver instead', async ({ api, track }) => {
    const submitted = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 1_001 }))).id));
    expect(submitted.status).toBe('pending_approval');
    expect(submitted.history.at(-1)).toMatchObject({ action: 'submitted', from: 'draft', to: 'pending_approval' });
  });

  test('exactly 10% discount is still approved automatically', async ({ api, track }) => {
    const submitted = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 1_000 }))).id));
    expect(submitted.status).toBe('approved');
  });

  test('the approver approves a pending quote and the history records who and when', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const pending = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 2_000 }))).id));
    const approved = await approver.approveQuote(pending.id);
    expect(approved.status).toBe('approved');
    expect(approved.version).toBe(pending.version + 1);
    expect(approved.updatedBy).toBe('aprovador');
    expect(approved.history.at(-1)).toMatchObject({ action: 'approved', by: 'aprovador', from: 'pending_approval', to: 'approved' });
  });

  test('rejecting needs a reason of 5 to 200 characters and stores it', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const pending = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 2_000 }))).id));
    for (const reason of [undefined, '', '    ', 'abcd', 'x'.repeat(201)]) {
      const res = await approver.send('POST', `/api/quotes/${pending.id}/reject`, { body: { reason } });
      expect(res.status, `reason ${JSON.stringify(reason)?.slice(0, 12)}`).toBe(400);
      expect(res.body.fields.reason).toBe('O motivo deve ter entre 5 e 200 caracteres.');
    }
    expect((await api.getQuote(pending.id)).status, 'still pending after the refused attempts').toBe('pending_approval');
    const rejected = await approver.rejectQuote(pending.id, '  abcde  ');
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason, 'the reason is trimmed').toBe('abcde');
  });

  test('a rejected quote can be corrected and sent again, and the old rejection reason disappears', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const created = track(await api.createQuote(baseLease({ discountBps: 2_000 })));
    await api.submitQuote(created.id);
    const rejected = await approver.rejectQuote(created.id, 'discount too high');
    const fixed = await api.updateQuote(created.id, baseLease({ discountBps: 500 }), rejected.version);
    expect(fixed.status, 'editing keeps the status').toBe('rejected');
    const resent = await api.submitQuote(created.id);
    expect(resent.status).toBe('approved');
    expect(resent.rejectionReason).toBeNull();
    expect(resent.history.map((h) => h.action)).toEqual(['created', 'submitted', 'rejected', 'updated', 'auto_approved']);
  });

  test('cancelling an approved quote is final: it can no longer change in any way', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const cancelled = track(await quoteIn('cancelled', api, approver));
    expect(cancelled.status).toBe('cancelled');
    expect((await api.send('POST', `/api/quotes/${cancelled.id}/submit`)).status, 'submit').toBe(409);
    for (const action of ['approve', 'cancel']) {
      expect((await approver.send('POST', `/api/quotes/${cancelled.id}/${action}`)).status, action).toBe(409);
    }
  });

  test('approving twice and submitting twice are refused the second time (double-click safety)', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const created = track(await api.createQuote(baseLease({ discountBps: 2_000 })));
    expect((await api.send('POST', `/api/quotes/${created.id}/submit`)).status).toBe(200);
    expect((await api.send('POST', `/api/quotes/${created.id}/submit`)).status).toBe(409);
    expect((await approver.send('POST', `/api/quotes/${created.id}/approve`)).status).toBe(200);
    expect((await approver.send('POST', `/api/quotes/${created.id}/approve`)).status).toBe(409);
  });

  test('two approvers acting at the same instant: exactly one succeeds', async ({ api, apiAs, track }) => {
    const approver = await apiAs('approver');
    const created = track(await api.createQuote(baseLease({ discountBps: 2_000 })));
    await api.submitQuote(created.id);
    const results = await Promise.all([approver.send('POST', `/api/quotes/${created.id}/approve`), api.send('POST', `/api/quotes/${created.id}/approve`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await api.getQuote(created.id)).history.filter((h) => h.action === 'approved')).toHaveLength(1);
  });

  // The complete matrix: for each action, what every status answers.
  const MATRIX: Record<string, Record<QuoteStatus, number>> = {
    update: { draft: 200, pending_approval: 409, approved: 409, rejected: 200, cancelled: 409 },
    delete: { draft: 204, pending_approval: 409, approved: 409, rejected: 204, cancelled: 409 },
    submit: { draft: 200, pending_approval: 409, approved: 409, rejected: 200, cancelled: 409 },
    approve: { draft: 409, pending_approval: 200, approved: 409, rejected: 409, cancelled: 409 },
    reject: { draft: 409, pending_approval: 200, approved: 409, rejected: 409, cancelled: 409 },
    cancel: { draft: 409, pending_approval: 409, approved: 200, rejected: 409, cancelled: 409 },
  };

  for (const [action, expectations] of Object.entries(MATRIX)) {
    test(`transition matrix: "${action}" answers ${STATUSES.map((s) => `${s}=${expectations[s]}`).join(', ')}`, async ({ api, apiAs }) => {
      const approver = await apiAs('approver');
      for (const status of STATUSES) {
        const quote = await quoteIn(status, api, approver);
        let res;
        if (action === 'update') res = await api.send('PUT', `/api/quotes/${quote.id}`, { body: { ...baseLease({ discountBps: 100 }), version: quote.version } });
        else if (action === 'delete') res = await api.deleteQuote(quote.id);
        else if (action === 'reject') res = await approver.send('POST', `/api/quotes/${quote.id}/reject`, { body: { reason: 'valid reason' } });
        else if (['approve', 'cancel'].includes(action)) res = await approver.send('POST', `/api/quotes/${quote.id}/${action}`);
        else res = await api.send('POST', `/api/quotes/${quote.id}/${action}`);
        expect(res.status, `${action} on ${status}`).toBe(expectations[status]);
        // leave nothing behind
        const now = await api.send('GET', `/api/quotes/${quote.id}`);
        if (now.status === 200) {
          if (now.body.status === 'pending_approval') await approver.send('POST', `/api/quotes/${quote.id}/reject`, { body: { reason: 'cleanup run' } });
          const after = await api.send<{ status: string }>('GET', `/api/quotes/${quote.id}`);
          if (['draft', 'rejected'].includes(after.body.status)) await api.deleteQuote(quote.id);
          else if (after.body.status === 'approved') await approver.send('POST', `/api/quotes/${quote.id}/cancel`);
        }
      }
    });
  }
});
