import type { CategoryId, SaleCalcDto } from '../api/types.js';
import { expectSaleSummary } from '../assertions/summary.js';
import { salePayload, uniqueTag } from '../factory/payloads.js';
import { saleApprovalThresholdQty, saleScenarios } from '../factory/scenarios.js';
import { expect, test } from '../fixtures/test.js';
import { idFromUrl } from '../util/url.js';
import { amortizationResidue, formatBRL, maxResidueCents, normalizeSpaces } from '../oracles/money.js';
import { expectedSale } from '../oracles/sale.js';
import { SPEC } from '../oracles/spec.js';

/**
 * The sale roteiro shared by the equipment categories. Freight and tax depend on the customer's state, the
 * amount payable on the payment condition, so the scenarios vary all three.
 */
export function defineSaleSuite(category: CategoryId): void {
  const cat = SPEC.categories[category];
  const scenarios = saleScenarios(category);
  const skus = [...SPEC.skusByCategory[category]].sort((a, b) => SPEC.prices[a]! - SPEC.prices[b]!);
  const [cheapest, middle, priciest] = skus as [string, string, string];

  test.describe(`Sale calculation by API · ${cat.name}`, () => {
    for (const s of scenarios) {
      test(`preview matches the oracle: ${s.name}`, async ({ api }) => {
        const res = await api.preview(salePayload(s));
        expect(res.status).toBe(200);
        const expected = expectedSale(s);
        expect(res.body.calc).toMatchObject({ kind: 'sale', ...expected, paymentCondition: s.paymentCondition, headlineCents: expected.payableCents });
      });
    }

    test(`quantities outside 1..${cat.maxQty} are rejected with a message naming the SKU and the limit`, async ({ api }) => {
      const sale = (qty: number) => salePayload({ category, customerId: 'c1', items: [{ sku: cheapest, qty }], discountBps: 0, paymentCondition: 'cash' });
      expect((await api.preview(sale(cat.maxQty))).status, `max quantity ${cat.maxQty} is accepted`).toBe(200);
      for (const qty of [0, -1, 2.5, cat.maxQty + 1]) {
        const res = await api.preview(sale(qty));
        expect(res.status, `qty ${qty}`).toBe(400);
        expect(res.body.fields?.items, `qty ${qty}`).toBe(`Quantidade de ${cheapest} deve estar entre 1 e ${cat.maxQty}.`);
      }
    });

    test('approval line: the quantity just below R$ 100.000,00 payable is free, the threshold quantity needs approval', async ({ api }) => {
      const qty = saleApprovalThresholdQty(category, priciest, 'c1', 'cash');
      expect(qty, 'a quantity within the limit crosses the threshold').not.toBeNull();
      const at = (n: number) => api.preview(salePayload({ category, customerId: 'c1', items: [{ sku: priciest, qty: n }], discountBps: 0, paymentCondition: 'cash' }));
      if (qty! > 1) {
        const below = (await at(qty! - 1)).body.calc as SaleCalcDto;
        expect(below.requiresApproval).toBe(false);
        expect(below.payableCents).toBeLessThanOrEqual(SPEC.approvalValueCents);
      }
      const above = (await at(qty!)).body.calc as SaleCalcDto;
      expect(above.requiresApproval).toBe(true);
      expect(above.payableCents).toBeGreaterThan(SPEC.approvalValueCents);
    });
  });

  test.describe(`Sale calculation in the form · ${cat.name}`, () => {
    for (const s of scenarios) {
      test(`summary panel shows the oracle values: ${s.name}`, async ({ openAs, formPage }) => {
        await openAs('admin', '#/quotes/new');
        await formPage.fillSale(s);
        await expectSaleSummary(formPage.summary, expectedSale(s));
      });
    }

    test(`adding more than ${cat.maxQty} units of one item is refused on the form`, async ({ openAs, formPage }) => {
      await openAs('admin', '#/quotes/new');
      await formPage.chooseType('sale');
      await formPage.chooseCategory(category);
      await formPage.addItem(cheapest, cat.maxQty + 1);
      await expect(formPage.error('items')).toHaveText(`Quantidade de ${cheapest} deve estar entre 1 e ${cat.maxQty}.`);
    });

    test('saving as draft stores exactly what the summary showed', async ({ page, openAs, formPage, detailPage, api, track }) => {
      const s = scenarios[3]!; // three installments, several SKUs, customer in RS
      const expected = expectedSale(s);
      const tag = uniqueTag('sale');
      await openAs('admin', '#/quotes/new');
      await formPage.fillSale(s);
      await formPage.notes.fill(tag);
      await formPage.saveDraftButton.click();
      await detailPage.ready(/^#\/quotes\/\d+$/);
      const id = idFromUrl(page.url());
      track({ id });

      await expect(detailPage.status).toHaveText('Rascunho');
      await expect(detailPage.info('category')).toHaveText(cat.name);
      await expect(detailPage.info('customer')).toHaveText('Delta Indústria Ltda (RS)');
      await expect(detailPage.info('payment')).toHaveText('Parcelado em 3x');
      await expect(detailPage.itemRows).toHaveCount(s.items.length);
      await expectSaleSummary(detailPage.summary, expected);

      const stored = await api.getQuote(id);
      expect(stored.notes).toBe(tag);
      expect(stored.calc).toMatchObject({ ...expected, kind: 'sale' });
      expect(normalizeSpaces(await detailPage.summary.value('payable').innerText())).toBe(formatBRL(expected.payableCents));
    });
  });

  test.describe(`Payment conditions · ${cat.name}`, () => {
    const basket = [{ sku: middle, qty: 4 }];

    test('cash: no financial charge and a single payment today', async ({ openAs, formPage }) => {
      const s = { category, customerId: 'c1', items: basket, discountBps: 0, paymentCondition: 'cash' as const };
      await openAs('admin', '#/quotes/new');
      await formPage.fillSale(s);
      const expected = expectedSale(s);
      expect(expected.chargeCents).toBe(0);
      await expect(formPage.page.getByTestId('summary-charge')).toHaveCount(0);
      await expect(formPage.page.getByTestId('summary-schedule').locator('li')).toHaveText([`Parcela 1 · à vista · ${formatBRL(expected.payableCents)}`], { useInnerText: true });
    });

    test('extended 30 days: a 1,5% charge on the total, paid once after 30 days', async ({ api, openAs, formPage }) => {
      const s = { category, customerId: 'c2', items: basket, discountBps: 0, paymentCondition: 'extended' as const };
      const expected = expectedSale(s);
      const res = await api.preview(salePayload(s));
      expect((res.body.calc as SaleCalcDto).chargeCents).toBe(Math.floor((expected.totalCents * 150 * 2 + 10_000) / 20_000));
      await openAs('admin', '#/quotes/new');
      await formPage.fillSale(s);
      expect(await formPage.summary.cents('charge')).toBe(expected.chargeCents);
      await expect(formPage.page.getByTestId('summary-schedule').locator('li')).toHaveText([`Parcela 1 · 30 dias · ${formatBRL(expected.payableCents)}`], { useInnerText: true });
    });

    for (const n of SPEC.installmentOptions) {
      test(`${n} installments: the installment matches the oracle and amortizes the total to zero`, async ({ api }) => {
        const s = { category, customerId: 'c4', items: basket, discountBps: 100, paymentCondition: 'installments' as const, installments: n };
        const expected = expectedSale(s);
        const calc = (await api.preview(salePayload(s))).body.calc as SaleCalcDto;
        expect(calc.installmentCents).toBe(expected.installmentCents);
        expect(calc.schedule.map((e) => e.dueInDays)).toEqual(Array.from({ length: n }, (_, k) => 30 * (k + 1)));
        const residue = amortizationResidue(expected.totalCents, SPEC.installmentRateBps, n, expected.installmentCents);
        expect(Math.abs(residue)).toBeLessThanOrEqual(maxResidueCents(SPEC.installmentRateBps, n));
      });
    }

    test('switching the payment condition shows or hides the installments field and recalculates', async ({ openAs, formPage }) => {
      const s = { category, customerId: 'c3', items: basket, discountBps: 0, paymentCondition: 'cash' as const };
      await openAs('admin', '#/quotes/new');
      await formPage.fillSale(s);
      await expect(formPage.installments).toBeHidden();
      await formPage.choosePayment('installments');
      await expect(formPage.installments).toBeVisible();
      await formPage.chooseInstallments(3);
      await expectSaleSummary(formPage.summary, expectedSale({ ...s, paymentCondition: 'installments', installments: 3 }));
      await formPage.choosePayment('extended');
      await expect(formPage.installments).toBeHidden();
      await expectSaleSummary(formPage.summary, expectedSale({ ...s, paymentCondition: 'extended' }));
      await formPage.choosePayment('cash');
      await expectSaleSummary(formPage.summary, expectedSale(s));
    });

    test('the quantity that crosses the approval line shows "Requer aprovação"', async ({ openAs, formPage }) => {
      const qty = saleApprovalThresholdQty(category, priciest, 'c1', 'cash')!;
      await openAs('admin', '#/quotes/new');
      await formPage.fillSale({ category, customerId: 'c1', items: [{ sku: priciest, qty }], discountBps: 0, paymentCondition: 'cash' });
      await expect(formPage.summary.approval).toHaveText('Requer aprovação');
      if (qty > 1) {
        await formPage.setQuantity(priciest, qty - 1);
        await formPage.summary.waitReady();
        await expect(formPage.summary.approval).toHaveText('Sem aprovação necessária');
      }
    });
  });
}

/** Freight and tax depend on the customer's state: one test per state, API and screen against the oracle. */
export function defineSaleStateMatrix(category: CategoryId): void {
  const [sku] = SPEC.skusByCategory[category];

  test.describe(`Freight and tax by customer state · ${SPEC.categories[category].name}`, () => {
    for (const [customerId, customer] of Object.entries(SPEC.customers)) {
      test(`customer in ${customer.uf}: freight ${SPEC.freightBpsByUf[customer.uf]! / 100}% and tax ${SPEC.taxBpsByUf[customer.uf]! / 100}%`, async ({ api, openAs, formPage }) => {
        const s = { category, customerId, items: [{ sku: sku!, qty: 3 }], discountBps: 0, paymentCondition: 'cash' as const };
        const expected = expectedSale(s);
        const calc = (await api.preview(salePayload(s))).body.calc as SaleCalcDto;
        expect(calc).toMatchObject({ freightBps: expected.freightBps, freightCents: expected.freightCents, taxBps: expected.taxBps, taxCents: expected.taxCents, totalCents: expected.totalCents });

        await openAs('admin', '#/quotes/new');
        await formPage.fillSale(s);
        await expectSaleSummary(formPage.summary, expected);
        await expect(formPage.summary.value('freight').locator('xpath=preceding-sibling::dt')).toContainText(`${(expected.freightBps / 100).toFixed(2).replace('.', ',')}%`);
        await expect(formPage.summary.value('tax').locator('xpath=preceding-sibling::dt')).toContainText(`${(expected.taxBps / 100).toFixed(2).replace('.', ',')}%`);
      });
    }
  });
}
