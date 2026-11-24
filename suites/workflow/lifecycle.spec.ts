import { baseLease, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';
import type { LeaseScenario } from '../../framework/oracles/lease.js';
import { idFromUrl } from '../../framework/util/url.js';

const small: LeaseScenario = { category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 1 }], termMonths: 12, discountBps: 0, addOn: false };
const discounted: LeaseScenario = { ...small, discountBps: 1_500 };

test.describe('Quote lifecycle through the UI', () => {
  test('sending a small quote without discount approves it automatically', async ({ page, openAs, formPage, detailPage, track }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(small);
    await formPage.submitButton.click();
    await detailPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
    await expect(detailPage.toast('aprovada automaticamente')).toBeVisible();
    await expect(detailPage.status).toHaveText('Aprovada');
    await expect(detailPage.status).toHaveAttribute('data-status', 'approved');
    await expect(detailPage.history.last()).toContainText('Aprovada automaticamente');
  });

  test('a quote with a 15% discount waits for an approver, who approves it from their own session', async ({ page, openAs, formPage, detailPage, track }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(discounted);
    await formPage.submitButton.click();
    await detailPage.ready(/^#\/quotes\/\d+$/);
    const id = idFromUrl(page.url());
    track({ id });
    await expect(detailPage.toast('enviada para aprovação')).toBeVisible();
    await expect(detailPage.status).toHaveText('Aguardando aprovação');
    await expect(detailPage.action('Aprovar')).toBeVisible();

    await openAs('approver', `#/quotes/${id}`);
    await detailPage.approve();
    await expect(detailPage.toast('Cotação aprovada.')).toBeVisible();
    await expect(detailPage.status).toHaveText('Aprovada');
    await expect(detailPage.history).toHaveCount(3);
    await expect(detailPage.history.last()).toContainText('aprovador');
  });

  test('rejecting asks for a reason: too short keeps the dialog open, a valid one rejects and shows the reason', async ({ api, track, openAs, detailPage }) => {
    const pending = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 2_000 }))).id));
    await openAs('approver', `#/quotes/${pending.id}`);
    await detailPage.action('Rejeitar').click();
    const confirm = detailPage.dialog.getByRole('button', { name: 'Confirmar rejeição' });

    await confirm.click();
    await expect(detailPage.dialogError).toHaveText('O motivo deve ter entre 5 e 200 caracteres.');
    await detailPage.rejectReason.fill('abcd');
    await confirm.click();
    await expect(detailPage.dialogError).toHaveText('O motivo deve ter entre 5 e 200 caracteres.');
    await expect(detailPage.dialog).toBeVisible();

    await detailPage.rejectReason.fill('Desconto acima da política comercial');
    await confirm.click();
    await expect(detailPage.dialog).toBeHidden();
    await expect(detailPage.status).toHaveText('Rejeitada');
    await expect(detailPage.info('rejection-reason')).toHaveText('Desconto acima da política comercial');
  });

  test('a rejected quote is corrected by its owner and approved after sending again', async ({ apiAs, track, openAs, detailPage, formPage, page }) => {
    const seller = await apiAs('seller');
    const approver = await apiAs('approver');
    const quote = track(await seller.createQuote(baseLease({ discountBps: 2_000 })));
    await seller.submitQuote(quote.id);
    await approver.rejectQuote(quote.id, 'Discount above policy');

    await openAs('seller', `#/quotes/${quote.id}`);
    await expect(detailPage.info('rejection-reason')).toHaveText('Discount above policy');
    await detailPage.editLink.click();
    await formPage.ready(`#/quotes/${quote.id}/edit`);
    await formPage.setDiscount('5');
    await formPage.summary.waitReady();
    await formPage.submitButton.click();
    await detailPage.ready(`#/quotes/${quote.id}`);
    await expect(detailPage.status).toHaveText('Aprovada');
    await expect(detailPage.info('rejection-reason')).toHaveCount(0);
    expect(idFromUrl(page.url())).toBe(quote.id);
  });

  test('cancelling an approved quote asks for confirmation, and "Voltar" changes nothing', async ({ api, track, openAs, detailPage }) => {
    const approved = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    await openAs('approver', `#/quotes/${approved.id}`);
    await detailPage.action('Cancelar cotação').click();
    await detailPage.dialog.getByRole('button', { name: 'Voltar' }).click();
    await expect(detailPage.dialog).toBeHidden();
    await expect(detailPage.status).toHaveText('Aprovada');

    await detailPage.cancelQuote();
    await expect(detailPage.toast('Cotação cancelada.')).toBeVisible();
    await expect(detailPage.status).toHaveText('Cancelada');
    await expect(detailPage.page.getByTestId('actions').getByRole('button')).toHaveCount(0);
  });

  test('deleting a draft asks for confirmation; "Voltar" keeps it, confirming removes it and returns to the list', async ({ api, openAs, detailPage, listPage }) => {
    const draft = await api.createQuote(baseLease());
    await openAs('admin', `#/quotes/${draft.id}`);
    await detailPage.action('Excluir').click();
    await expect(detailPage.dialog).toContainText(draft.code);
    await detailPage.dialog.getByRole('button', { name: 'Voltar' }).click();
    expect((await api.send('GET', `/api/quotes/${draft.id}`)).status, 'still there after "Voltar"').toBe(200);

    await detailPage.deleteQuote();
    await expect(detailPage.toast('Cotação excluída.')).toBeVisible();
    await listPage.ready('#/quotes');
    expect((await api.send('GET', `/api/quotes/${draft.id}`)).status).toBe(404);
  });

  test('duplicating opens a new draft with the same items', async ({ api, track, openAs, detailPage, page }) => {
    const original = track(await api.createQuote(baseLease({ items: [{ sku: 'NB-AUR-14', qty: 2 }, { sku: 'NB-BOR-13', qty: 1 }], discountBps: 300 })));
    await openAs('admin', `#/quotes/${original.id}`);
    await detailPage.duplicate();
    await expect(detailPage.toast('Cotação duplicada.')).toBeVisible();
    await expect.poll(() => idFromUrl(page.url())).not.toBe(original.id);
    track({ id: idFromUrl(page.url()) });
    await expect(detailPage.status).toHaveText('Rascunho');
    await expect(detailPage.itemRows).toHaveCount(2);
    await expect(detailPage.info('discount')).toHaveText('3,00%');
    await expect(detailPage.info('version')).toHaveText('1');
  });

  test('the history on the detail page names every step in order', async ({ api, apiAs, track, openAs, detailPage }) => {
    const approver = await apiAs('approver');
    const quote = track(await api.createQuote(baseLease({ discountBps: 2_000 })));
    await api.submitQuote(quote.id);
    await approver.approveQuote(quote.id);
    await openAs('admin', `#/quotes/${quote.id}`);
    await expect(detailPage.history).toHaveCount(3);
    await expect(detailPage.history.nth(0)).toContainText('Criada');
    await expect(detailPage.history.nth(0)).toContainText('admin');
    await expect(detailPage.history.nth(1)).toContainText('Enviada para aprovação (Rascunho → Aguardando aprovação)');
    await expect(detailPage.history.nth(2)).toContainText('Aprovada (Aguardando aprovação → Aprovada)');
    await expect(detailPage.history.nth(2)).toContainText('aprovador');
  });

  test('the detail page survives a reload and the browser back button returns to the list', async ({ page, api, track, openAs, listPage, detailPage }) => {
    const quote = track(await api.createQuote(baseLease({ notes: uniqueTag() })));
    await openAs('admin', '#/quotes');
    await detailPage.goto(quote.id);
    await page.reload();
    await detailPage.ready(`#/quotes/${quote.id}`);
    await expect(detailPage.heading).toHaveText(`Cotação ${quote.code}`);
    await page.goBack();
    await listPage.ready('#/quotes');
  });

  test('opening the edit URL of a quote that is already approved explains why it cannot be edited', async ({ api, track, openAs, page }) => {
    const approved = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    await openAs('admin', `#/quotes/${approved.id}/edit`);
    await expect(page.getByTestId('not-editable')).toHaveText('Esta cotação não pode mais ser editada.');
    await expect(page.getByRole('link', { name: 'Voltar para a cotação' })).toBeVisible();
  });
});
