import { expect, test } from '../../framework/fixtures/test.js';

test.describe('Service health @smoke', () => {
  test('liveness endpoint answers ok without authentication', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('readiness endpoint reports the data store as loaded', async ({ request }) => {
    const res = await request.get('/health/ready');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string; quotes: number };
    expect(body.status).toBe('ready');
    expect(Number.isInteger(body.quotes)).toBe(true);
  });

  test('protected API routes reject requests without a token', async ({ request }) => {
    for (const route of ['/api/quotes', '/api/catalog', '/api/reports/summary', '/api/auth/me']) {
      const res = await request.get(route);
      expect(res.status(), route).toBe(401);
    }
  });

  test('the web front end is served with the application title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QuoteLab/);
    await expect(page.getByRole('heading', { name: 'QuoteLab' })).toBeVisible();
  });

  test('responses do not advertise the server technology', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });
});
