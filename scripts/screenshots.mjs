/**
 * Captures the screenshots used in the README (docs/img/*.png) against a throw-away QuoteLab instance.
 *   npm run screenshots
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4192; // avoid ports that browsers block (4190, 6000, ...)
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/img';
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['--import', 'tsx', 'app/server.ts'], { env: { ...process.env, PORT: String(PORT), QL_TEST_MODE: '1' }, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const shot = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const { token, user } = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123' }) })).json();
const api = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });

// login screen (signed out)
await page.goto(`${BASE}/#/login`);
await page.getByRole('heading', { name: 'QuoteLab' }).waitFor();
await shot('login');

// signed in
await page.evaluate(([t, u]) => {
  localStorage.setItem('ql_token', t);
  localStorage.setItem('ql_user', JSON.stringify(u));
}, [token, user]);

await page.goto(`${BASE}/#/quotes`);
await page.getByTestId('quote-row').first().waitFor();
await shot('list');

// the form with a live calculation
await page.goto(`${BASE}/#/quotes/new`);
await page.getByLabel('Cliente', { exact: true }).selectOption('c1');
await page.getByLabel('Item', { exact: true }).selectOption('NB-AUR-14');
await page.getByLabel('Quantidade', { exact: true }).fill('10');
await page.getByRole('button', { name: 'Adicionar item' }).click();
await page.getByLabel('Item', { exact: true }).selectOption('NB-BOR-13');
await page.getByLabel('Quantidade', { exact: true }).fill('4');
await page.getByRole('button', { name: 'Adicionar item' }).click();
await page.getByLabel('Prazo (meses)').selectOption('36');
await page.getByLabel('Garantia estendida').check();
await page.getByLabel('Desconto (%)').fill('7,35');
await page.locator('[data-testid=summary][data-state=ready]').waitFor();
await shot('form-lease');

// a quote waiting for approval
const created = await (await api('/api/quotes', { method: 'POST', body: JSON.stringify({ type: 'sale', category: 'printers', customerId: 'c5', items: [{ sku: 'PR-LUM-500', qty: 12 }], discountBps: 1500, paymentCondition: 'installments', installments: 3, notes: 'Pedido de demonstração' }) })).json();
await api(`/api/quotes/${created.id}/submit`, { method: 'POST' });
await page.goto(`${BASE}/#/quotes/${created.id}`);
await page.getByTestId('status').waitFor();
await shot('detail-sale');

await page.goto(`${BASE}/#/reports`);
await page.getByTestId('card-total-count').waitFor();
await shot('reports');

await browser.close();
stop();
console.log(`Screenshots saved to ${OUT}/`);
