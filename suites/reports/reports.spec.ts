import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { CategoryId, QuoteKind } from '../../framework/api/types.js';
import { SEED, groupSeed } from '../../framework/factory/seed.js';
import { expect, test } from '../../framework/fixtures/test.js';
import { STATUSES, STATUS_LABEL, TYPE_LABEL } from '../../framework/oracles/labels.js';
import { formatBRL, formatDecimal, normalizeSpaces } from '../../framework/oracles/money.js';
import { SPEC } from '../../framework/oracles/spec.js';

const CATEGORIES = Object.keys(SPEC.categories) as CategoryId[];
const sum = (n: number[]): number => n.reduce((a, b) => a + b, 0);

test.describe('Reports · totals on the seed data', () => {
  test('the summary cards show the number of quotes and the approved and pending values', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    await expect(reportsPage.card('total-count')).toContainText('12');
    const approved = sum(SEED.filter((q) => q.status === 'approved').map((q) => q.headlineCents));
    const pending = sum(SEED.filter((q) => q.status === 'pending_approval').map((q) => q.headlineCents));
    expect(await reportsPage.cardCents('approved-value')).toBe(approved);
    expect(await reportsPage.cardCents('pending-value')).toBe(pending);
    expect(normalizeSpaces(await reportsPage.card('approved-value').innerText())).toContain(formatBRL(approved));
    expect(normalizeSpaces(await reportsPage.card('pending-value').innerText())).toContain(formatBRL(pending));
  });

  test('the "by status" table matches the seed for all five statuses, including empty ones', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const expected = groupSeed((q) => q.status);
    for (const status of STATUSES) {
      expect(await reportsPage.groupCount('status', status), `${status} count`).toBe(expected[status]?.count ?? 0);
      expect(await reportsPage.groupCents('status', status), `${status} value`).toBe(expected[status]?.valueCents ?? 0);
    }
  });

  test('the "by category" table matches the seed for all four categories', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const expected = groupSeed((q) => q.category);
    for (const category of CATEGORIES) {
      expect(await reportsPage.groupCount('category', category), `${category} count`).toBe(expected[category]?.count ?? 0);
      expect(await reportsPage.groupCents('category', category), `${category} value`).toBe(expected[category]?.valueCents ?? 0);
    }
  });

  test('the "by type" table matches the seed for lease and sale', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const expected = groupSeed((q) => q.kind);
    for (const type of ['lease', 'sale'] as const) {
      expect(await reportsPage.groupCount('type', type), `${type} count`).toBe(expected[type]!.count);
      expect(await reportsPage.groupCents('type', type), `${type} value`).toBe(expected[type]!.valueCents);
    }
  });

  test('every grouping adds up to the same total count and the same total value', async ({ api }) => {
    const summary = await api.reportSummary();
    const totalValue = sum(SEED.map((q) => q.headlineCents));
    expect(summary.totalCount).toBe(12);
    for (const group of [summary.byStatus, summary.byCategory, summary.byType]) {
      expect(sum(Object.values(group).map((g) => g.count))).toBe(12);
      expect(sum(Object.values(group).map((g) => g.valueCents))).toBe(totalValue);
    }
  });

  test('the headline value of a lease is its contract total and of a sale its amount payable', async ({ api }) => {
    const summary = await api.reportSummary();
    expect(summary.byType.lease!.valueCents).toBe(sum(SEED.filter((q) => q.kind === 'lease').map((q) => ('contractTotalCents' in q.expected ? q.expected.contractTotalCents : 0))));
    expect(summary.byType.sale!.valueCents).toBe(sum(SEED.filter((q) => q.kind === 'sale').map((q) => ('payableCents' in q.expected ? q.expected.payableCents : 0))));
  });
});

test.describe('Reports · filters', () => {
  for (const category of CATEGORIES) {
    test(`filtering by "${SPEC.categories[category].name}" recalculates the cards and every table`, async ({ openAs, reportsPage }) => {
      await openAs('admin', '#/reports');
      await reportsPage.goto({ category });
      const rows = SEED.filter((q) => q.category === category);
      await expect(reportsPage.card('total-count')).toContainText(String(rows.length));
      expect(await reportsPage.cardCents('approved-value')).toBe(sum(rows.filter((q) => q.status === 'approved').map((q) => q.headlineCents)));
      const byStatus = groupSeed((q) => q.status, (q) => q.category === category);
      for (const status of STATUSES) expect(await reportsPage.groupCount('status', status), status).toBe(byStatus[status]?.count ?? 0);
      for (const other of CATEGORIES) expect(await reportsPage.groupCount('category', other), `category ${other}`).toBe(other === category ? rows.length : 0);
    });
  }

  for (const type of ['lease', 'sale'] as QuoteKind[]) {
    test(`filtering by ${TYPE_LABEL[type]} recalculates the cards and the status table`, async ({ openAs, reportsPage }) => {
      await openAs('admin', '#/reports');
      await reportsPage.goto({ type });
      const rows = SEED.filter((q) => q.kind === type);
      await expect(reportsPage.card('total-count')).toContainText(String(rows.length));
      expect(await reportsPage.cardCents('pending-value')).toBe(sum(rows.filter((q) => q.status === 'pending_approval').map((q) => q.headlineCents)));
      const byStatus = groupSeed((q) => q.status, (q) => q.kind === type);
      for (const status of STATUSES) expect(await reportsPage.groupCents('status', status), status).toBe(byStatus[status]?.valueCents ?? 0);
    });
  }

  test('both filters together intersect, and an empty intersection shows zeros instead of breaking', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    await reportsPage.goto({ category: 'mobile', type: 'sale' });
    const rows = SEED.filter((q) => q.category === 'mobile' && q.kind === 'sale');
    await expect(reportsPage.card('total-count')).toContainText(String(rows.length));
    expect(await reportsPage.groupCents('type', 'lease')).toBe(0);
    await reportsPage.goto({ category: 'automation', type: 'lease' });
    await expect(reportsPage.card('total-count')).toContainText('1');
  });

  test('changing a dropdown reloads the report for that filter and keeps it in the address', async ({ openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    await reportsPage.categoryFilter.selectOption('printers');
    await reportsPage.ready(/category=printers/);
    await expect(reportsPage.card('total-count')).toContainText(String(SEED.filter((q) => q.category === 'printers').length));
    await reportsPage.typeFilter.selectOption('sale');
    await reportsPage.ready(/category=printers&type=sale|type=sale&category=printers/);
    await expect(reportsPage.card('total-count')).toContainText(String(SEED.filter((q) => q.category === 'printers' && q.kind === 'sale').length));
  });

  test('the API refuses unknown filter values instead of ignoring them', async ({ api }) => {
    const badType = await api.send('GET', '/api/reports/summary', { query: { type: 'rent' } });
    expect(badType.status).toBe(400);
    expect(badType.body.fields.type).toBe('Tipo inválido.');
    const badCategory = await api.send('GET', '/api/reports/summary', { query: { category: 'servers' } });
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.fields.category).toBe('Categoria inválida.');
  });

  test('what the cards show is what the API returns', async ({ api, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const summary = await api.reportSummary();
    await expect(reportsPage.card('total-count')).toContainText(String(summary.totalCount));
    expect(await reportsPage.cardCents('approved-value')).toBe(summary.approvedValueCents);
    expect(await reportsPage.cardCents('pending-value')).toBe(summary.pendingValueCents);
  });
});

test.describe('Reports · CSV export', () => {
  const ROW = (q: (typeof SEED)[number]): string =>
    [q.code, TYPE_LABEL[q.kind], SPEC.categories[q.category].name, q.customer, STATUS_LABEL[q.status], formatDecimal(q.headlineCents), q.createdBy, q.createdAt].join(';');

  async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
    const [file] = await Promise.all([page.waitForEvent('download'), click()]);
    return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
  }

  test('the button downloads "cotacoes.csv" with the header and one line per quote', async ({ page, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const { name, text } = await download(page, () => reportsPage.exportButton.click());
    expect(name).toBe('cotacoes.csv');
    const lines = text.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('codigo;tipo;categoria;cliente;status;valor;criado_por;criado_em');
    expect(lines.slice(1)).toEqual(SEED.map(ROW));
  });

  test('the file starts with a UTF-8 byte order mark so spreadsheets read the accents correctly', async ({ page, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const { text } = await download(page, () => reportsPage.exportButton.click());
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Épsilon Varejo Ltda');
    expect(text).toContain('Locação');
  });

  test('the export respects the filters chosen on the screen', async ({ page, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    await reportsPage.goto({ category: 'printers', type: 'sale' });
    const { text } = await download(page, () => reportsPage.exportButton.click());
    const lines = text.replace(/^\uFEFF/, '').trimEnd().split('\r\n').slice(1);
    expect(lines).toEqual(SEED.filter((q) => q.category === 'printers' && q.kind === 'sale').map(ROW));
  });

  test('money is written as a plain decimal with a comma and no currency symbol', async ({ page, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    const { text } = await download(page, () => reportsPage.exportButton.click());
    for (const line of text.replace(/^\uFEFF/, '').trimEnd().split('\r\n').slice(1)) {
      const value = line.split(';')[5]!;
      expect(value, line).toMatch(/^\d+,\d{2}$/);
    }
  });

  test('the API export needs a session', async ({ request }) => {
    expect((await request.get('/api/reports/export.csv')).status()).toBe(401);
  });

  test('the API export serves a CSV attachment with the right headers', async ({ api }) => {
    const res = await api.send('GET', '/api/reports/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="cotacoes.csv"');
  });

  test('the export button is disabled while a download is running, so a double click downloads once', async ({ page, openAs, reportsPage }) => {
    await openAs('admin', '#/reports');
    let requests = 0;
    await page.route('**/api/reports/export.csv*', async (route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    const [file] = await Promise.all([page.waitForEvent('download'), reportsPage.exportButton.dblclick()]);
    await file.path();
    expect(requests).toBe(1);
  });
});
