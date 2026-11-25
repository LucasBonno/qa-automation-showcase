import type { CategoryId, QuoteKind, QuoteStatus } from '../../framework/api/types.js';
import { SEED } from '../../framework/factory/seed.js';
import { expect, test } from '../../framework/fixtures/test.js';
import { STATUSES, STATUS_LABEL, TYPE_LABEL } from '../../framework/oracles/labels.js';
import { formatBRL, normalizeSpaces } from '../../framework/oracles/money.js';
import { SPEC } from '../../framework/oracles/spec.js';

/** These tests run on the known seed data (the project starts right after a test-mode reset) and only read. */
const codesWhere = (filter: (q: (typeof SEED)[number]) => boolean): string[] => SEED.filter(filter).map((q) => q.code).sort();

test.describe('Quote list · paging and content', () => {
  test('the first page shows 10 of the 12 seeded quotes and offers only "Próxima"', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.expectTotal(12);
    await expect(listPage.rows).toHaveCount(10);
    await expect(listPage.pageInfo).toHaveText('Página 1 de 2');
    await expect(listPage.previousButton).toBeDisabled();
    await expect(listPage.nextButton).toBeEnabled();
  });

  test('"Próxima" shows the last 2 quotes and then only "Anterior" is available', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.nextButton.click();
    await listPage.ready('#/quotes?page=2');
    await expect(listPage.rows).toHaveCount(2);
    await expect(listPage.pageInfo).toHaveText('Página 2 de 2');
    await expect(listPage.nextButton).toBeDisabled();
    await expect(listPage.previousButton).toBeEnabled();
  });

  test('the two pages together list every seeded quote exactly once', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    const first = await listPage.codes();
    await listPage.goto({ page: 2 });
    const second = await listPage.codes();
    expect([...first, ...second].sort()).toEqual(SEED.map((q) => q.code).sort());
  });

  test('every row shows the right customer, type, category, value and status', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    const seen = new Map<string, { customer: string; type: string; category: string; value: string; status: string }>();
    for (const page of [1, 2]) {
      await listPage.goto({ page });
      for (const row of await listPage.rows.all()) {
        const code = (await row.getAttribute('data-code'))!;
        seen.set(code, {
          customer: (await listPage.cell(row, 'customer').innerText()).trim(),
          type: (await listPage.cell(row, 'type').innerText()).trim(),
          category: (await listPage.cell(row, 'category').innerText()).trim(),
          value: normalizeSpaces(await listPage.cell(row, 'value').innerText()),
          status: (await listPage.cell(row, 'status').innerText()).trim(),
        });
      }
    }
    expect(seen.size).toBe(12);
    for (const q of SEED) {
      expect(seen.get(q.code), q.code).toEqual({
        customer: q.customer,
        type: TYPE_LABEL[q.kind],
        category: SPEC.categories[q.category].name,
        value: formatBRL(q.headlineCents),
        status: STATUS_LABEL[q.status],
      });
    }
  });

  test('each status has its own badge value so the colour mapping can rely on it', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    for (const status of STATUSES) {
      await listPage.goto({ status });
      for (const row of await listPage.rows.all()) await expect(row.locator('.badge')).toHaveAttribute('data-status', status);
    }
  });

  test('a code in the list opens that quote', async ({ openAs, listPage, detailPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ q: 'QL-000003' });
    await listPage.rowOf('QL-000003').getByRole('link', { name: 'QL-000003' }).click();
    await detailPage.ready('#/quotes/3');
    await expect(detailPage.heading).toHaveText('Cotação QL-000003');
  });
});

test.describe('Quote list · filters', () => {
  for (const status of STATUSES) {
    test(`status filter "${STATUS_LABEL[status]}" lists exactly the quotes in that status`, async ({ openAs, listPage }) => {
      await openAs('admin', '#/quotes');
      await listPage.goto({ status });
      const expected = codesWhere((q) => q.status === status);
      await listPage.expectTotal(expected.length);
      expect((await listPage.codes()).sort()).toEqual(expected);
    });
  }

  for (const category of Object.keys(SPEC.categories) as CategoryId[]) {
    test(`category filter "${SPEC.categories[category].name}" lists exactly that category`, async ({ openAs, listPage }) => {
      await openAs('admin', '#/quotes');
      await listPage.goto({ category });
      const expected = codesWhere((q) => q.category === category);
      await listPage.expectTotal(expected.length);
      expect((await listPage.codes()).sort()).toEqual(expected);
    });
  }

  for (const type of ['lease', 'sale'] as QuoteKind[]) {
    test(`type filter "${TYPE_LABEL[type]}" lists exactly the ${type} quotes`, async ({ openAs, listPage }) => {
      await openAs('admin', '#/quotes');
      await listPage.goto({ type });
      const expected = codesWhere((q) => q.kind === type);
      await listPage.expectTotal(expected.length);
      expect((await listPage.codes()).sort()).toEqual(expected);
    });
  }

  test('filters combine with AND', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    const combos: [{ status?: QuoteStatus; category?: CategoryId; type?: QuoteKind }][] = [
      [{ status: 'approved', category: 'notebooks' }],
      [{ status: 'approved', type: 'sale' }],
      [{ category: 'mobile', type: 'sale', status: 'pending_approval' }],
      [{ category: 'printers', type: 'sale', status: 'draft' }],
    ];
    for (const [filters] of combos) {
      await listPage.goto(filters);
      const expected = codesWhere((q) => (!filters.status || q.status === filters.status) && (!filters.category || q.category === filters.category) && (!filters.type || q.kind === filters.type));
      if (expected.length === 0) await expect(listPage.emptyState, JSON.stringify(filters)).toBeVisible();
      else expect((await listPage.codes()).sort(), JSON.stringify(filters)).toEqual(expected);
      await listPage.expectTotal(expected.length);
    }
  });

  test('choosing a value in a dropdown filters the list and updates the address', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.statusFilter.selectOption('approved');
    await expect(page.locator('#app')).toHaveAttribute('data-route', /status=approved/);
    await listPage.ready(/status=approved/);
    await listPage.expectTotal(codesWhere((q) => q.status === 'approved').length);
    await listPage.categoryFilter.selectOption('printers');
    await listPage.ready(/category=printers/);
    await listPage.expectTotal(codesWhere((q) => q.status === 'approved' && q.category === 'printers').length);
  });

  test('changing a filter returns to page 1', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ page: 2 });
    await listPage.typeFilter.selectOption('sale');
    await listPage.ready(/type=sale/);
    await expect(listPage.pageInfo).toHaveText('Página 1 de 1');
  });

  test('a link with filters opens with the dropdowns already set', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ status: 'rejected', category: 'mobile', type: 'lease' });
    await expect(listPage.statusFilter).toHaveValue('rejected');
    await expect(listPage.categoryFilter).toHaveValue('mobile');
    await expect(listPage.typeFilter).toHaveValue('lease');
    await listPage.expectTotal(1);
  });

  test('"Limpar filtros" returns to the full list', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ status: 'draft', type: 'sale', q: 'epsilon' });
    await listPage.clearButton.click();
    await listPage.ready('#/quotes');
    await listPage.expectTotal(12);
    await expect(listPage.statusFilter).toHaveValue('');
    await expect(listPage.search).toHaveValue('');
  });

  test('the browser back button restores the previous filter', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.statusFilter.selectOption('draft');
    await listPage.ready(/status=draft/);
    await listPage.categoryFilter.selectOption('automation');
    await listPage.ready(/category=automation/);
    await page.goBack();
    await listPage.ready(/status=draft/);
    await expect(listPage.categoryFilter).toHaveValue('');
    await listPage.expectTotal(codesWhere((q) => q.status === 'draft').length);
  });

  test('a page number beyond the last page shows the empty state, not an error', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ page: 9 });
    await expect(listPage.emptyState).toHaveText('Nenhuma cotação encontrada.');
    await expect(listPage.pageInfo).toHaveText('Página 9 de 2');
  });

  test('an invalid filter in the address shows a friendly error and keeps the page usable', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await page.goto('/#/quotes?status=hacked');
    await listPage.ready('#/quotes?status=hacked');
    await expect(page.getByTestId('list-error')).toHaveText('Não foi possível carregar as cotações.');
    await listPage.clearButton.click();
    await listPage.ready('#/quotes');
    await listPage.expectTotal(12);
  });
});

test.describe('Quote list · search', () => {
  test('by code, ignoring case', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    for (const q of ['QL-000003', 'ql-000003', 'Ql-000003']) {
      await listPage.goto({ q });
      expect(await listPage.codes(), q).toEqual(['QL-000003']);
    }
  });

  test('by part of the customer name, ignoring case and accents as typed', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    for (const [term, customer] of [['alfa', 'Alfa Comércio Ltda'], ['ZETA', 'Zeta Tecnologia S.A.'], ['logística', 'Beta Logística S.A.'], ['ltda', 'Ltda']] as const) {
      await listPage.goto({ q: term });
      const expected = codesWhere((q) => q.customer.toLowerCase().includes(term.toLowerCase()));
      expect(expected.length, `seed has customers matching ${customer}`).toBeGreaterThan(0);
      expect((await listPage.codes()).sort(), term).toEqual(expected);
    }
  });

  test('typing in the search box filters the list and keeps the cursor in the box', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.search.click();
    await page.keyboard.type('alfa');
    await listPage.ready(/q=alfa/);
    await expect(listPage.rows).toHaveCount(codesWhere((q) => q.customer.toLowerCase().includes('alfa')).length);
    await expect(listPage.search).toBeFocused();
    await page.keyboard.type(' com');
    await listPage.ready(/q=alfa(\+|%20)com/);
    await expect(listPage.search).toHaveValue('alfa com');
  });

  test('no match shows the empty state and a zero count', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ q: 'zzz-no-such-quote' });
    await expect(listPage.emptyState).toHaveText('Nenhuma cotação encontrada.');
    await listPage.expectTotal(0);
  });

  test('characters that matter to databases and HTML are treated as plain text', async ({ openAs, listPage, page }) => {
    await openAs('admin', '#/quotes');
    for (const q of ["' OR '1'='1", '%', '_', '<script>alert(1)</script>', '\\', '"; DROP TABLE quotes;--']) {
      await listPage.goto({ q });
      await expect(listPage.emptyState, q).toBeVisible();
      await expect(page.getByTestId('list-error')).toHaveCount(0);
    }
    await listPage.goto();
    await listPage.expectTotal(12);
  });

  test('a search of only spaces is the same as no search', async ({ openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ q: '   ' });
    await listPage.expectTotal(12);
  });

  test('a search longer than 60 characters is refused with a friendly message', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.goto({ q: 'x'.repeat(61) });
    await expect(page.getByTestId('list-error')).toBeVisible();
  });
});
