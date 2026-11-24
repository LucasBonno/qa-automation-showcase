import { expect, test as base } from '@playwright/test';
import { ApiClient } from '../api/client.js';
import { ACCOUNTS, type RoleKey } from '../config/accounts.js';
import { LoginPage } from '../pages/login.page.js';
import { QuoteDetailPage } from '../pages/quote-detail.page.js';
import { QuoteFormPage } from '../pages/quote-form.page.js';
import { QuotesListPage } from '../pages/quotes-list.page.js';
import { ReportsPage } from '../pages/reports.page.js';

interface Fixtures {
  /** API client logged in as the administrator. */
  api: ApiClient;
  /** API client for any role (cached per test). */
  apiAs: (role: RoleKey) => Promise<ApiClient>;
  /** Registers a quote for automatic cleanup after the test, and returns it. */
  track: <T extends { id: number }>(quote: T) => T;
  /** Starts an authenticated browser session without going through the login screen, then opens `hash`. */
  openAs: (role: RoleKey, hash?: string) => Promise<void>;
  loginPage: LoginPage;
  listPage: QuotesListPage;
  formPage: QuoteFormPage;
  detailPage: QuoteDetailPage;
  reportsPage: ReportsPage;
}

/** Leaves no residue behind: drafts and rejected quotes are deleted, pending ones are rejected first, approved ones cancelled. */
async function cleanUp(api: ApiClient, ids: number[]): Promise<void> {
  for (const id of ids) {
    const found = await api.send<{ status: string }>('GET', `/api/quotes/${id}`);
    if (found.status !== 200) continue;
    let status = found.body.status;
    if (status === 'pending_approval') {
      await api.send('POST', `/api/quotes/${id}/reject`, { body: { reason: 'automatic cleanup' } });
      status = 'rejected';
    }
    if (status === 'draft' || status === 'rejected') await api.deleteQuote(id);
    else if (status === 'approved') await api.send('POST', `/api/quotes/${id}/cancel`);
  }
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(await ApiClient.login(request, 'admin'));
  },

  apiAs: async ({ request }, use) => {
    const cache = new Map<RoleKey, ApiClient>();
    await use(async (role) => {
      if (!cache.has(role)) cache.set(role, await ApiClient.login(request, role));
      return cache.get(role)!;
    });
  },

  track: async ({ api }, use) => {
    const ids: number[] = [];
    await use((quote) => {
      ids.push(quote.id);
      return quote;
    });
    await cleanUp(api, ids);
  },

  openAs: async ({ page, request }, use) => {
    await use(async (role, hash = '#/quotes') => {
      const client = await ApiClient.login(request, role);
      const { username, name } = ACCOUNTS[role];
      await page.goto('/#/login');
      await page.evaluate(
        ([token, user]) => {
          localStorage.setItem('ql_token', token as string);
          localStorage.setItem('ql_user', JSON.stringify(user));
        },
        [client.token, { username, name, role }] as const,
      );
      await page.goto(`/${hash}`);
      await expect(page.locator('#app')).toHaveAttribute('data-route', hash);
      await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
    });
  },

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  listPage: async ({ page }, use) => use(new QuotesListPage(page)),
  formPage: async ({ page }, use) => use(new QuoteFormPage(page)),
  detailPage: async ({ page }, use) => use(new QuoteDetailPage(page)),
  reportsPage: async ({ page }, use) => use(new ReportsPage(page)),
});

export { expect };
