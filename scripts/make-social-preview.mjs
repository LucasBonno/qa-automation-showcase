/**
 * Builds docs/img/social-preview.jpg (2560x1280, shown at 1280x640): the card used when the repository link is shared.
 * It captures the real calculation panel of QuoteLab at 2x resolution, so it stays sharp when scaled down by LinkedIn.
 * GitHub does not let an API set it, so it is uploaded by hand in Settings > Social preview (limit: 1 MB).
 *   node scripts/make-social-preview.mjs
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4194;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/img/social-preview.jpg';

const server = spawn(process.execPath, ['--import', 'tsx', 'app/server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();

// 1. the real calculation panel, captured at 2x
const { token, user } = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123' }) })).json();
const appPage = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })).newPage();
await appPage.goto(`${BASE}/#/login`);
await appPage.evaluate(([t, u]) => {
  localStorage.setItem('ql_token', t);
  localStorage.setItem('ql_user', JSON.stringify(u));
}, [token, user]);
await appPage.goto(`${BASE}/#/quotes/new`);
await appPage.getByLabel('Cliente', { exact: true }).selectOption('c1');
await appPage.getByLabel('Item', { exact: true }).selectOption('NB-AUR-14');
await appPage.getByLabel('Quantidade', { exact: true }).fill('10');
await appPage.getByRole('button', { name: 'Adicionar item' }).click();
await appPage.getByLabel('Item', { exact: true }).selectOption('NB-BOR-13');
await appPage.getByLabel('Quantidade', { exact: true }).fill('4');
await appPage.getByRole('button', { name: 'Adicionar item' }).click();
await appPage.getByLabel('Prazo (meses)').selectOption('36');
await appPage.getByLabel('Garantia estendida').check();
await appPage.getByLabel('Desconto (%)').fill('7,35');
await appPage.locator('[data-testid=summary][data-state=ready]').waitFor();
await appPage.getByTestId('summary-installment').evaluate((el) => {
  el.parentElement.style.outline = '3px solid #1f8a4c';
  el.parentElement.style.background = '#e9f7ef';
});
const panel = (await appPage.getByTestId('summary').screenshot()).toString('base64');

// 2. the card
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:640px;background:linear-gradient(135deg,#0d1424 0%,#1a2a52 100%);font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff;position:relative;overflow:hidden}
  .left{position:absolute;left:80px;top:52px;width:680px}
  .tag{display:inline-block;background:#2457d6;border-radius:999px;padding:9px 20px;font-size:24px;font-weight:700}
  h1{font-size:112px;line-height:1;margin:26px 0 6px;font-weight:800;letter-spacing:-1px}
  .sub{font-size:38px;color:#b9c6e8;margin-bottom:26px}
  ul{list-style:none;padding:0}
  li{font-size:30px;margin:11px 0;display:flex;gap:16px;align-items:flex-start;line-height:1.2}
  li b{color:#6fe0a0;font-size:32px;line-height:1}
  .panel{position:absolute;right:80px;top:56px;width:400px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.2)}
  .panel img{display:block;width:100%}
  .foot{position:absolute;left:80px;bottom:24px;font-size:25px;color:#9db0de}
</style></head><body>
  <div class="left">
    <span class="tag">Playwright · TypeScript</span>
    <h1>QuoteLab</h1>
    <div class="sub">QA automation showcase</div>
    <ul>
      <li><b>✓</b> 415 tests · UI and API</li>
      <li><b>✓</b> Numbers verified independently</li>
      <li><b>✓</b> Mutation check: 10 of 10 caught</li>
      <li><b>✓</b> CI green on every push</li>
    </ul>
  </div>
  <div class="panel"><img src="data:image/png;base64,${panel}"></div>
  <div class="foot">github.com/LucasBonno/qa-automation-showcase</div>
</body></html>`;

const cardPage = await (await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 })).newPage();
await cardPage.setContent(html);
// JPEG keeps the 2x sharpness well under GitHub's 1 MB limit (the gradient makes PNG too big)
await cardPage.screenshot({ path: OUT, type: 'jpeg', quality: 92 });
await browser.close();
server.kill();

const kb = Math.round(statSync(OUT).size / 1024);
console.log(`${OUT}: 2560x1280, ${kb} KB${kb > 1000 ? '  <-- over the 1 MB limit of GitHub: reduce it before uploading!' : ''}`);
