import { expectLeaseSummary, expectSaleSummary } from '../../framework/assertions/summary.js';
import { baseLease, baseSale, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';
import { type LeaseScenario, expectedLease } from '../../framework/oracles/lease.js';
import { formatBRL, normalizeSpaces, percentOf } from '../../framework/oracles/money.js';
import { expectedSale } from '../../framework/oracles/sale.js';
import { QuoteFormPage } from '../../framework/pages/quote-form.page.js';
import { idFromUrl } from '../../framework/util/url.js';

const lease: LeaseScenario = { category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 2 }], termMonths: 24, discountBps: 0, addOn: false };

test.describe('Form validation', () => {
  test('saving an empty form lists what is missing and focuses the first problem', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.saveDraftButton.click();
    await expect(formPage.error('customerId')).toHaveText('Selecione um cliente.');
    await expect(formPage.error('items')).toHaveText('Adicione ao menos um item.');
    await expect(formPage.customer).toBeFocused();
    await expect(formPage.customer).toHaveAttribute('aria-invalid', 'true');
  });

  test('errors disappear once the form is saved correctly after a failed attempt', async ({ page, openAs, formPage, track }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.saveDraftButton.click();
    await expect(formPage.error('customerId')).toBeVisible();
    await formPage.fillLease(lease);
    await formPage.saveDraftButton.click();
    await formPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
  });

  test('the summary stays empty (with an explanation) until customer and items are chosen', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await expect(formPage.summary.root).toHaveAttribute('data-state', 'empty');
    await expect(formPage.summary.emptyMessage).toBeVisible();
    await formPage.addItem('NB-AUR-14', 1);
    await expect(formPage.summary.root).toHaveAttribute('data-state', 'empty');
    await formPage.chooseCustomer('c1');
    await formPage.summary.waitReady();
  });

  test('invalid discounts are refused on save with the same message', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    for (const text of ['abc', '-1', '31', '30,01', '5,555', '1e1', '', '  ', '5%', '10,', ',5', '100']) {
      await formPage.setDiscount(text);
      await formPage.saveDraftButton.click();
      await expect(formPage.error('discountBps'), `discount "${text}"`).toHaveText('Desconto deve estar entre 0% e 30%.');
    }
  });

  test('a non-numeric discount replaces the summary with a hint instead of a wrong number', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.setDiscount('abc');
    await expect(formPage.summary.emptyMessage).toHaveText('Informe um desconto válido para ver o cálculo.');
    await formPage.setDiscount('5');
    await formPage.summary.waitReady();
  });

  for (const [typed, bps] of [['0', 0], ['0,01', 1], ['7,5', 750], ['12.5', 1_250], ['30', 3_000], ['30,00', 3_000]] as const) {
    test(`discount typed as "${typed}" is read as ${bps / 100}% and applied to the subtotal`, async ({ openAs, formPage }) => {
      await openAs('admin', '#/quotes/new');
      await formPage.fillLease(lease);
      await formPage.setDiscount(typed);
      await formPage.summary.waitReady();
      const expected = expectedLease({ ...lease, discountBps: bps });
      expect(await formPage.summary.cents('discount')).toBe(percentOf(expected.subtotalCents, bps));
      await expectLeaseSummary(formPage.summary, expected);
    });
  }

  test('notes: the counter follows the text, 200 characters save, 201 do not', async ({ page, openAs, formPage, track }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await expect(formPage.notesCounter).toHaveText('0/200');
    await formPage.notes.fill('abc');
    await expect(formPage.notesCounter).toHaveText('3/200');
    await formPage.notes.fill('x'.repeat(201));
    await expect(formPage.notesCounter).toHaveText('201/200');
    await formPage.saveDraftButton.click();
    await expect(formPage.error('notes')).toHaveText('Observações devem ter no máximo 200 caracteres.');
    await formPage.notes.fill('y'.repeat(200));
    await formPage.saveDraftButton.click();
    await formPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
    await expect(formPage.page.getByTestId('info-notes')).toHaveText('y'.repeat(200));
  });

  test('notes with HTML are shown as plain text and never run', async ({ page, openAs, formPage, detailPage, track }) => {
    let dialogOpened = false;
    page.on('dialog', (dialog) => {
      dialogOpened = true;
      void dialog.dismiss();
    });
    const payload = `<img src=x onerror=alert(1)><script>alert(2)</script>${uniqueTag()}`;
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.notes.fill(payload.slice(0, 200));
    await formPage.saveDraftButton.click();
    await detailPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
    await expect(detailPage.info('notes')).toHaveText(payload.slice(0, 200));
    await expect(detailPage.info('notes').locator('img, script')).toHaveCount(0);
    // let the browser run two more frames, enough for an onerror handler (if any had been created) to fire
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(dialogOpened, 'no script was executed').toBe(false);
  });
});

test.describe('Items', () => {
  test('adding the same SKU twice merges the quantities into one row', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.addItem('NB-AUR-14', 2);
    await formPage.addItem('NB-AUR-14', 3);
    await expect(formPage.page.getByTestId('items').getByTestId('item-row')).toHaveCount(1);
    await expect(formPage.quantityOf('NB-AUR-14')).toHaveValue('5');
  });

  test('merging cannot push a line over the category limit', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.addItem('NB-AUR-14', 150);
    await formPage.addItem('NB-AUR-14', 51);
    await expect(formPage.error('items')).toHaveText('Quantidade de NB-AUR-14 deve estar entre 1 e 200.');
    await expect(formPage.quantityOf('NB-AUR-14')).toHaveValue('150');
  });

  test('adding without choosing an item, or with an invalid quantity, is refused on the spot', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.page.getByRole('button', { name: 'Adicionar item' }).click();
    await expect(formPage.error('items')).toHaveText('Selecione um item.');
    for (const qty of ['0', '-3', '1.5', '']) {
      await formPage.addItem('NB-AUR-14', qty);
      await expect(formPage.error('items'), `quantity "${qty}"`).toHaveText('Quantidade de NB-AUR-14 deve estar entre 1 e 200.');
    }
    await expect(formPage.page.getByTestId('items-empty')).toBeVisible();
  });

  test('editing the quantity in the table updates the line total and the summary', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.setQuantity('NB-AUR-14', 5);
    await formPage.summary.waitReady();
    await expect(formPage.itemRow('NB-AUR-14').locator('[data-col="line-total"]')).toHaveAttribute('data-cents', String(489_000 * 5));
    expect(normalizeSpaces(await formPage.itemRow('NB-AUR-14').locator('[data-col="line-total"]').innerText())).toBe(formatBRL(489_000 * 5));
    await expectLeaseSummary(formPage.summary, expectedLease({ ...lease, items: [{ sku: 'NB-AUR-14', qty: 5 }] }));
  });

  test('clearing a quantity empties the summary and blocks saving with a clear message', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.setQuantity('NB-AUR-14', '');
    await expect(formPage.summary.root).toHaveAttribute('data-state', 'empty');
    await formPage.saveDraftButton.click();
    await expect(formPage.error('items')).toHaveText('Quantidade de NB-AUR-14 deve estar entre 1 e 200.');
  });

  test('removing items recalculates, and removing the last one empties the summary', async ({ openAs, formPage }) => {
    const two: LeaseScenario = { ...lease, items: [{ sku: 'NB-AUR-14', qty: 1 }, { sku: 'NB-BOR-13', qty: 1 }] };
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(two);
    await expectLeaseSummary(formPage.summary, expectedLease(two));
    await formPage.removeItem('NB-AUR-14');
    await expectLeaseSummary(formPage.summary, expectedLease({ ...two, items: [{ sku: 'NB-BOR-13', qty: 1 }] }));
    await formPage.removeItem('NB-BOR-13');
    await expect(formPage.summary.root).toHaveAttribute('data-state', 'empty');
    await expect(formPage.page.getByTestId('items-empty')).toBeVisible();
  });

  test('changing the category clears the items and the add-on, and offers only that category\'s items', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease({ ...lease, addOn: true });
    await formPage.chooseCategory('printers');
    await expect(formPage.page.getByTestId('items-empty')).toBeVisible();
    await expect(formPage.addOnCheckbox('printers')).not.toBeChecked();
    const options = await formPage.itemSelect.locator('option').allTextContents();
    expect(options.slice(1).every((text) => text.startsWith('PR-')), JSON.stringify(options)).toBe(true);
    await expect(formPage.summary.root).toHaveAttribute('data-state', 'empty');
  });
});

test.describe('Lease and sale on the same form', () => {
  test('switching the type shows only the fields of that type', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    const leaseFields = formPage.page.getByTestId('lease-fields');
    const saleFields = formPage.page.getByTestId('sale-fields');
    await expect(leaseFields).toBeVisible();
    await expect(saleFields).toBeHidden();
    await formPage.chooseType('sale');
    await expect(leaseFields).toBeHidden();
    await expect(saleFields).toBeVisible();
    await formPage.chooseType('lease');
    await expect(leaseFields).toBeVisible();
  });

  test('items and discount are kept when the type changes, and the summary is recalculated for the new type', async ({ openAs, formPage }) => {
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease({ ...lease, discountBps: 500 });
    await formPage.chooseType('sale');
    await formPage.summary.waitReady();
    await expectSaleSummary(formPage.summary, expectedSale({ category: 'notebooks', customerId: 'c1', items: lease.items, discountBps: 500, paymentCondition: 'cash' }));
    await formPage.chooseType('lease');
    await expectLeaseSummary(formPage.summary, expectedLease({ ...lease, discountBps: 500 }));
  });
});

test.describe('Editing', () => {
  test('the edit page opens prefilled with the stored values and locks type and category', async ({ api, track, openAs, formPage }) => {
    const tag = uniqueTag();
    const quote = track(await api.createQuote(baseSale({ category: 'printers', items: [{ sku: 'PR-LUM-200', qty: 4 }], customerId: 'c4', paymentCondition: 'installments', installments: 3, discountBps: 250, notes: tag })));
    await openAs('admin', `#/quotes/${quote.id}/edit`);
    await expect(formPage.page.getByRole('heading', { level: 1 })).toHaveText(`Editar cotação ${quote.code}`);
    await expect(formPage.customer).toHaveValue('c4');
    await expect(formPage.typeRadio('sale')).toBeChecked();
    await expect(formPage.typeRadio('sale')).toBeDisabled();
    await expect(formPage.typeRadio('lease')).toBeDisabled();
    await expect(formPage.category).toBeDisabled();
    await expect(formPage.category).toHaveValue('printers');
    await expect(formPage.payment).toHaveValue('installments');
    await expect(formPage.installments).toHaveValue('3');
    await expect(formPage.discount).toHaveValue('2,50');
    await expect(formPage.notes).toHaveValue(tag);
    await expect(formPage.quantityOf('PR-LUM-200')).toHaveValue('4');
    await expectSaleSummary(formPage.summary, expectedSale({ category: 'printers', customerId: 'c4', items: [{ sku: 'PR-LUM-200', qty: 4 }], discountBps: 250, paymentCondition: 'installments', installments: 3 }));
  });

  test('saving an edit stores the new values, raises the version and adds "Alterada" to the history', async ({ api, track, openAs, formPage, detailPage }) => {
    const quote = track(await api.createQuote(baseLease({ items: [{ sku: 'NB-AUR-14', qty: 1 }], termMonths: 24 })));
    await openAs('admin', `#/quotes/${quote.id}/edit`);
    await formPage.setQuantity('NB-AUR-14', 3);
    await formPage.chooseTerm(48);
    await formPage.setDiscount('4,5');
    await formPage.summary.waitReady();
    const scenario: LeaseScenario = { category: 'notebooks', items: [{ sku: 'NB-AUR-14', qty: 3 }], termMonths: 48, discountBps: 450, addOn: false };
    await expectLeaseSummary(formPage.summary, expectedLease(scenario));
    await formPage.saveDraftButton.click();
    await detailPage.ready(`#/quotes/${quote.id}`);
    await expect(detailPage.info('version')).toHaveText('2');
    await expect(detailPage.info('term')).toHaveText('48 meses');
    await expectLeaseSummary(detailPage.summary, expectedLease(scenario));
    await expect(detailPage.history.last()).toContainText('Alterada');
  });

  test('"Cancelar" on the form leaves without saving', async ({ api, track, openAs, formPage, detailPage }) => {
    const quote = track(await api.createQuote(baseLease()));
    await openAs('admin', `#/quotes/${quote.id}/edit`);
    await formPage.setDiscount('9');
    await formPage.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await detailPage.ready(`#/quotes/${quote.id}`);
    expect((await api.getQuote(quote.id)).discountBps).toBe(0);
  });

  test('"Cancelar" on a new quote returns to the list without creating anything', async ({ api, openAs, formPage, listPage }) => {
    const tag = uniqueTag('cancelled');
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.notes.fill(tag);
    await formPage.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await listPage.ready('#/quotes');
    expect((await api.dbDump()).quotes.filter((q) => q.input.notes === tag)).toHaveLength(0);
  });
});

test.describe('Concurrency and repeated actions', () => {
  test('a double click on "Salvar rascunho" creates exactly one quote', async ({ page, api, openAs, formPage, track }) => {
    const tag = uniqueTag('dbl');
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.notes.fill(tag);
    await formPage.saveDraftButton.dblclick();
    await formPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
    const copies = (await api.dbDump()).quotes.filter((q) => q.input.notes === tag);
    expect(copies).toHaveLength(1);
  });

  test('the save buttons are disabled and relabelled while the request is in flight', async ({ page, openAs, formPage, track }) => {
    await page.route('**/api/quotes', async (route) => {
      if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await openAs('admin', '#/quotes/new');
    await formPage.fillLease(lease);
    await formPage.saveDraftButton.click();
    await expect(formPage.saveDraftButton).toBeDisabled();
    await expect(formPage.saveDraftButton).toHaveText('Salvando…');
    await expect(formPage.submitButton).toBeDisabled();
    await formPage.ready(/^#\/quotes\/\d+$/);
    track({ id: idFromUrl(page.url()) });
  });

  test('two people editing the same quote: the second save is refused with a clear message', async ({ context, api, track, openAs, formPage }) => {
    const quote = track(await api.createQuote(baseLease()));
    await openAs('admin', `#/quotes/${quote.id}/edit`);
    const otherTab = await context.newPage();
    const otherForm = new QuoteFormPage(otherTab);
    await otherForm.gotoEdit(quote.id);

    await formPage.setDiscount('5');
    await formPage.summary.waitReady();
    await formPage.saveDraftButton.click();
    await formPage.ready(`#/quotes/${quote.id}`);

    await otherForm.setDiscount('9');
    await otherForm.summary.waitReady();
    await otherForm.saveDraftButton.click();
    await expect(otherForm.banner).toHaveText('Esta cotação foi alterada por outra pessoa. Recarregue a página.');
    expect((await api.getQuote(quote.id)).discountBps, 'the first save won').toBe(500);
  });
});
