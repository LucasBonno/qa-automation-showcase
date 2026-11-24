import type { CategoryId, LeaseCalcDto } from '../api/types.js';
import { expectLeaseSummary } from '../assertions/summary.js';
import { approvalThresholdQty, leaseScenarios } from '../factory/scenarios.js';
import { leasePayload, uniqueTag } from '../factory/payloads.js';
import { expect, test } from '../fixtures/test.js';
import { idFromUrl } from '../util/url.js';
import { amortizationResidue, formatBRL, maxResidueCents, normalizeSpaces } from '../oracles/money.js';
import { expectedLease } from '../oracles/lease.js';
import { SPEC } from '../oracles/spec.js';

/**
 * The lease roteiro shared by the four equipment categories. Each category brings its own interest rate, quantity
 * limit and add-on, so the same flow produces different numbers and every run is a distinct verification.
 */
export function defineLeaseSuite(category: CategoryId): void {
  const cat = SPEC.categories[category];
  const scenarios = leaseScenarios(category);
  const skus = [...SPEC.skusByCategory[category]].sort((a, b) => SPEC.prices[a]! - SPEC.prices[b]!);
  const [cheapest, middle, priciest] = skus as [string, string, string];

  test.describe(`Lease calculation by API · ${cat.name}`, () => {
    for (const s of scenarios) {
      test(`preview matches the oracle: ${s.name}`, async ({ api }) => {
        const res = await api.preview(leasePayload(s));
        expect(res.status).toBe(200);
        const expected = expectedLease(s);
        expect(res.body.calc).toMatchObject({ kind: 'lease', ...expected, headlineCents: expected.contractTotalCents });
      });
    }

    for (const term of SPEC.leaseTerms) {
      test(`${term}-month term: installment matches the oracle and amortizes the loan to zero`, async ({ api }) => {
        const s = { category, items: [{ sku: middle, qty: 2 }], termMonths: term, discountBps: 250, addOn: false };
        const res = await api.preview(leasePayload(s));
        const calc = res.body.calc as LeaseCalcDto;
        const expected = expectedLease(s);
        expect(calc.installmentCents).toBe(expected.installmentCents);
        expect(calc.contractTotalCents).toBe(expected.installmentCents * term);
        // Independent proof of the oracle itself: paying the installment n times leaves at most the rounding residue.
        const residue = amortizationResidue(expected.financedCents, cat.rateBps, term, expected.installmentCents);
        expect(Math.abs(residue)).toBeLessThanOrEqual(maxResidueCents(cat.rateBps, term));
      });
    }

    test(`quantities outside 1..${cat.maxQty} are rejected with a message naming the SKU and the limit`, async ({ api }) => {
      const valid = await api.preview(leasePayload({ category, items: [{ sku: cheapest, qty: cat.maxQty }], termMonths: 12, discountBps: 0, addOn: false }));
      expect(valid.status, `max quantity ${cat.maxQty} is accepted`).toBe(200);
      for (const qty of [0, -1, 1.5, cat.maxQty + 1]) {
        const res = await api.preview(leasePayload({ category, items: [{ sku: cheapest, qty }], termMonths: 12, discountBps: 0, addOn: false }));
        expect(res.status, `qty ${qty}`).toBe(400);
        expect(res.body.fields?.items, `qty ${qty}`).toBe(`Quantidade de ${cheapest} deve estar entre 1 e ${cat.maxQty}.`);
      }
    });

    test('a SKU from another category is rejected', async ({ api }) => {
      const foreign = Object.entries(SPEC.skusByCategory).find(([id]) => id !== category)![1][0]!;
      const res = await api.preview(leasePayload({ category, items: [{ sku: foreign, qty: 1 }], termMonths: 12, discountBps: 0, addOn: false }));
      expect(res.status).toBe(400);
      expect(res.body.fields?.items).toBe(`Item ${foreign} não pertence à categoria ${cat.name}.`);
    });

    test('approval line: the quantity just below R$ 100.000,00 is free, the threshold quantity needs approval', async ({ api }) => {
      const qty = approvalThresholdQty(category, priciest, 36);
      expect(qty, 'a quantity within the limit crosses the threshold').not.toBeNull();
      const at = (n: number) => api.preview(leasePayload({ category, items: [{ sku: priciest, qty: n }], termMonths: 36, discountBps: 0, addOn: false }));
      if (qty! > 1) {
        const below = await at(qty! - 1);
        expect((below.body.calc as LeaseCalcDto).requiresApproval).toBe(false);
        expect((below.body.calc as LeaseCalcDto).contractTotalCents).toBeLessThanOrEqual(SPEC.approvalValueCents);
      }
      const above = await at(qty!);
      expect((above.body.calc as LeaseCalcDto).requiresApproval).toBe(true);
      expect((above.body.calc as LeaseCalcDto).contractTotalCents).toBeGreaterThan(SPEC.approvalValueCents);
    });
  });

  test.describe(`Lease calculation in the form · ${cat.name}`, () => {
    for (const s of scenarios) {
      test(`summary panel shows the oracle values: ${s.name}`, async ({ openAs, formPage }) => {
        await openAs('admin', '#/quotes/new');
        await formPage.fillLease(s);
        await expectLeaseSummary(formPage.summary, expectedLease(s));
      });
    }

    test(`adding more than ${cat.maxQty} units of one item is refused on the form`, async ({ openAs, formPage }) => {
      await openAs('admin', '#/quotes/new');
      await formPage.chooseCategory(category);
      await formPage.addItem(cheapest, cat.maxQty + 1);
      await expect(formPage.error('items')).toHaveText(`Quantidade de ${cheapest} deve estar entre 1 e ${cat.maxQty}.`);
      await expect(formPage.page.getByTestId('items-empty')).toBeVisible();
    });

    test('the quantity that crosses the approval line shows "Requer aprovação"', async ({ openAs, formPage }) => {
      const qty = approvalThresholdQty(category, priciest, 36)!;
      await openAs('admin', '#/quotes/new');
      await formPage.fillLease({ category, items: [{ sku: priciest, qty }], termMonths: 36, discountBps: 0, addOn: false });
      await expect(formPage.summary.approval).toHaveText('Requer aprovação');
      if (qty > 1) {
        await formPage.setQuantity(priciest, qty - 1);
        await formPage.summary.waitReady();
        await expect(formPage.summary.approval).toHaveText('Sem aprovação necessária');
      }
    });

    test('saving as draft stores exactly what the summary showed', async ({ page, openAs, formPage, detailPage, api, track }) => {
      const s = scenarios[2]!;
      const expected = expectedLease(s);
      const tag = uniqueTag('lease');
      await openAs('admin', '#/quotes/new');
      await formPage.fillLease(s, 'c3');
      await formPage.notes.fill(tag);
      await formPage.saveDraftButton.click();
      await detailPage.ready(/^#\/quotes\/\d+$/);
      const id = idFromUrl(page.url());
      track({ id });

      await expect(detailPage.status).toHaveText('Rascunho');
      await expect(detailPage.info('category')).toHaveText(cat.name);
      await expect(detailPage.info('customer')).toHaveText('Gama Serviços ME (MG)');
      await expect(detailPage.info('term')).toHaveText(`${s.termMonths} meses`);
      await expect(detailPage.itemRows).toHaveCount(s.items.length);
      await expectLeaseSummary(detailPage.summary, expected);

      const stored = await api.getQuote(id);
      expect(stored.notes).toBe(tag);
      expect(stored.calc).toMatchObject({ ...expected, kind: 'lease' });
      expect(normalizeSpaces(await detailPage.summary.value('contract-total').innerText())).toBe(formatBRL(expected.contractTotalCents));
    });
  });
}

/**
 * The optional add-on of the category. Its kind decides whether it is financed (raises the installment)
 * or charged monthly on top of the installment.
 */
export function defineLeaseAddOnSuite(category: CategoryId): void {
  const cat = SPEC.categories[category];
  const addOn = cat.addOn;
  const financed = addOn.kind.startsWith('financed');
  const [cheapest, middle] = [...SPEC.skusByCategory[category]].sort((a, b) => SPEC.prices[a]! - SPEC.prices[b]!) as [string, string, string];

  const base = { category, items: [{ sku: middle, qty: 3 }], termMonths: 24, discountBps: 500 };

  test.describe(`Lease add-on "${addOn.name}" · ${cat.name}`, () => {
    test('the add-on is offered with its price hint and starts unchecked', async ({ openAs, formPage }) => {
      await openAs('admin', '#/quotes/new');
      await formPage.chooseCategory(category);
      await expect(formPage.addOnCheckbox(category)).not.toBeChecked();
      await expect(formPage.page.locator('label[for="f-addon"]')).toContainText(addOn.name);
    });

    test(`checking the add-on is ${financed ? 'financed into the installment' : 'charged as a separate monthly amount'}`, async ({ api }) => {
      const without = expectedLease({ ...base, addOn: false });
      const withIt = expectedLease({ ...base, addOn: true });
      const res = await api.preview(leasePayload({ ...base, addOn: true }));
      expect(res.body.calc).toMatchObject({ ...withIt, kind: 'lease' });
      if (financed) {
        expect(withIt.addOnFinancedCents).toBeGreaterThan(0);
        expect(withIt.addOnMonthlyCents).toBe(0);
        expect(withIt.installmentCents).toBeGreaterThan(without.installmentCents);
      } else {
        expect(withIt.addOnMonthlyCents).toBeGreaterThan(0);
        expect(withIt.addOnFinancedCents).toBe(0);
        expect(withIt.installmentCents, 'a monthly add-on does not change the installment').toBe(without.installmentCents);
        expect(withIt.monthlyTotalCents).toBe(without.monthlyTotalCents + withIt.addOnMonthlyCents);
      }
    });

    test('toggling the add-on on and off in the form restores the original values', async ({ openAs, formPage }) => {
      await openAs('admin', '#/quotes/new');
      await formPage.fillLease({ ...base, addOn: false });
      await expectLeaseSummary(formPage.summary, expectedLease({ ...base, addOn: false }));
      await formPage.addOnCheckbox(category).check();
      await formPage.summary.waitReady();
      await expectLeaseSummary(formPage.summary, expectedLease({ ...base, addOn: true }));
      await formPage.addOnCheckbox(category).uncheck();
      await formPage.summary.waitReady();
      await expectLeaseSummary(formPage.summary, expectedLease({ ...base, addOn: false }));
    });

    test('the add-on follows the quantity of units (and the net value for percentage add-ons)', async ({ api }) => {
      const one = { ...base, items: [{ sku: cheapest, qty: 1 }], discountBps: 0, addOn: true };
      const four = { ...one, items: [{ sku: cheapest, qty: 4 }] };
      const a = (await api.preview(leasePayload(one))).body.calc as LeaseCalcDto;
      const b = (await api.preview(leasePayload(four))).body.calc as LeaseCalcDto;
      expect(a).toMatchObject({ addOnFinancedCents: expectedLease(one).addOnFinancedCents, addOnMonthlyCents: expectedLease(one).addOnMonthlyCents });
      expect(b).toMatchObject({ addOnFinancedCents: expectedLease(four).addOnFinancedCents, addOnMonthlyCents: expectedLease(four).addOnMonthlyCents });
      const field = financed ? 'addOnFinancedCents' : 'addOnMonthlyCents';
      // Per-unit add-ons scale exactly by 4; percentage add-ons scale with the net value, within rounding of 4 cents.
      const perUnit = addOn.kind.endsWith('per-unit');
      if (perUnit) expect(b[field]).toBe(a[field] * 4);
      else expect(Math.abs(b[field] - a[field] * 4)).toBeLessThanOrEqual(4);
    });
  });
}
