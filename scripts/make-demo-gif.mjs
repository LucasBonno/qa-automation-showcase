/**
 * Builds docs/img/demo.gif: a short animation of Playwright driving QuoteLab, ending with the run summary.
 * The key frame compares the value on screen with the independent oracle and aborts if they differ,
 * so the picture can never show a result the tests would not accept.
 *
 * Maintainers only. It needs two libraries that are deliberately not in package.json:
 *   npm install --no-save gifenc pngjs
 *   node --import tsx scripts/make-demo-gif.mjs        (tsx lets this script import the TypeScript oracle)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import * as gifenc from 'gifenc';
import pngjs from 'pngjs';
import { expectedLease } from '../framework/oracles/lease.ts';
import { formatBRL, normalizeSpaces } from '../framework/oracles/money.ts';

const { GIFEncoder, applyPalette, quantize } = gifenc.GIFEncoder ? gifenc : gifenc.default;
const { PNG } = pngjs;

const PORT = 4193;
const BASE = `http://localhost:${PORT}`;
const OUT = 'docs/img/demo.gif';
mkdirSync('docs/img', { recursive: true });

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
const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1000, height: 640 } })).newPage();

const frames = [];
async function caption(en, pt) {
  await page.evaluate(([e, p]) => {
    let box = document.getElementById('demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demo-caption';
      box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;background:#111a2e;color:#fff;font-family:system-ui,Segoe UI,sans-serif;padding:10px 20px;border-radius:14px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:90%';
      document.body.append(box);
    }
    const a = document.createElement('div');
    a.textContent = e;
    a.style.cssText = 'font-size:19px;font-weight:700';
    const b = document.createElement('div');
    b.textContent = p;
    b.style.cssText = 'font-size:14px;opacity:.8;margin-top:2px';
    box.replaceChildren(a, b);
  }, [en, pt]);
}
async function snap(en, pt, delay = 1500) {
  await caption(en, pt);
  const shot = await page.screenshot();
  // DEMO_DUMP=<folder> also keeps every frame as a PNG, to inspect the animation by eye.
  if (process.env.DEMO_DUMP) {
    mkdirSync(process.env.DEMO_DUMP, { recursive: true });
    writeFileSync(path.join(process.env.DEMO_DUMP, `frame-${String(frames.length + 1).padStart(2, '0')}.png`), shot);
  }
  const png = PNG.sync.read(shot);
  frames.push({ data: png.data, width: png.width, height: png.height, delay });
}

// 1. the app, signed out
await page.goto(`${BASE}/#/login`);
await page.getByRole('heading', { name: 'QuoteLab' }).waitFor();
await snap('Playwright opens the app', 'O Playwright abre o aplicativo');

// 2. signing in like a user
await page.getByLabel('Usuário').fill('admin');
await page.getByLabel('Senha').fill('Admin@123');
await snap('Signs in like a user', 'Entra como um usuário');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByTestId('quote-row').first().waitFor();
await snap('Signed in as Administrator', 'Logado como Administrador');

// 3. a new quote
await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Nova cotação', exact: true }).click();
await page.getByTestId('quote-form').waitFor();
await page.getByLabel('Cliente', { exact: true }).selectOption('c1');
await page.getByLabel('Item', { exact: true }).selectOption('NB-AUR-14');
await page.getByLabel('Quantidade', { exact: true }).fill('10');
await page.getByRole('button', { name: 'Adicionar item' }).click();
await snap('Fills in the form, field by field', 'Preenche o formulário, campo a campo');

await page.getByLabel('Item', { exact: true }).selectOption('NB-BOR-13');
await page.getByLabel('Quantidade', { exact: true }).fill('4');
await page.getByRole('button', { name: 'Adicionar item' }).click();
await page.getByLabel('Prazo (meses)').selectOption('36');
await page.getByLabel('Garantia estendida').check();
await page.getByLabel('Desconto (%)').fill('7,35');
await page.locator('[data-testid=summary][data-state=ready]').waitFor();
await snap('The panel recalculates live', 'O painel recalcula ao vivo');

// 4. the key frame: screen versus the independent calculation
const expected = expectedLease({
  category: 'notebooks',
  items: [
    { sku: 'NB-AUR-14', qty: 10 },
    { sku: 'NB-BOR-13', qty: 4 },
  ],
  termMonths: 36,
  discountBps: 735,
  addOn: true,
});
const row = page.getByTestId('summary-installment');
const onScreen = normalizeSpaces(await row.innerText());
const centsOnScreen = Number(await row.getAttribute('data-cents'));
if (centsOnScreen !== expected.installmentCents || onScreen !== formatBRL(expected.installmentCents)) {
  throw new Error(`Screen shows ${onScreen} (${centsOnScreen}) but the oracle expects ${formatBRL(expected.installmentCents)}`);
}
await row.scrollIntoViewIfNeeded();
await row.evaluate((el) => {
  el.parentElement.style.outline = '3px solid #1f8a4c';
  el.parentElement.style.background = '#e9f7ef';
});
// the highlighted row must really be inside the picture, or the caption would claim something the viewer cannot see
const box = await row.boundingBox();
if (!box || box.y < 0 || box.y + box.height > 640) throw new Error(`The compared row is outside the frame (y=${box?.y})`);
await snap(`Screen ${onScreen} = independent calculation ${formatBRL(expected.installmentCents)} ✓`, `Tela ${onScreen} = cálculo independente ${formatBRL(expected.installmentCents)} ✓`, 3000);

// 5. saving
await page.getByRole('button', { name: 'Salvar rascunho' }).click();
await page.getByTestId('status').waitFor();
await snap('Saves the quote and checks the stored values', 'Salva a cotação e confere os valores gravados');

// 6. the whole suite
const summaryJson = 'reports/summary/summary.json';
if (existsSync(summaryJson) && existsSync('reports/summary/index.en.html')) {
  const run = JSON.parse(readFileSync(summaryJson, 'utf8'));
  await page.goto(pathToFileURL(path.resolve('reports/summary/index.en.html')).href);
  await snap(`Then the whole suite runs: ${run.passed} of ${run.total} passed`, `Depois roda a suíte inteira: ${run.passed} de ${run.total} passaram`, 3500);
} else {
  console.warn('No run summary found (run "npm test" first): the last frame was skipped.');
}

await browser.close();
server.kill();

// encode
const gif = GIFEncoder();
for (const f of frames) {
  const palette = quantize(f.data, 256);
  gif.writeFrame(applyPalette(f.data, palette), f.width, f.height, { palette, delay: f.delay });
}
gif.finish();
writeFileSync(OUT, gif.bytes());
console.log(`${OUT}: ${frames.length} frames, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
