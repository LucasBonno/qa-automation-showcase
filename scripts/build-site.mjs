/**
 * Assembles the GitHub Pages site from the last test run:
 *   site/index.html      landing page (PT/EN) with the numbers of the run
 *   site/playwright/     Playwright's own HTML report (traces, screenshots)
 *   site/summary/        the one-page run summary, in Portuguese and English
 *
 * Usage: npm run site   (after npm test)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SITE = 'site';
const REPO = process.env.GITHUB_REPOSITORY ?? 'LucasBonno/qa-automation-showcase';

if (!existsSync('reports/summary/summary.json')) {
  console.error('No test run found. Run "npm test" first.');
  process.exit(1);
}

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
if (existsSync('reports/html')) cpSync('reports/html', `${SITE}/playwright`, { recursive: true });
cpSync('reports/summary', `${SITE}/summary`, { recursive: true });

const run = JSON.parse(readFileSync('reports/summary/summary.json', 'utf8'));
const when = new Date(run.generatedAt).toUTCString();
const suites = run.suites.filter((s) => s.suite !== 'seed-reset');
const total = run.total - (run.suites.find((s) => s.suite === 'seed-reset')?.total ?? 0);
const ok = run.failed === 0 && run.status === 'passed';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QuoteLab · QA automation showcase</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;margin:0;background:#f4f6fa;color:#1c2433}
  main{max-width:960px;margin:0 auto;padding:2.5rem 1.2rem}
  h1{margin:0 0 .3rem}.muted{color:#667085}
  .status{display:inline-block;margin:1rem 0;padding:.35rem .9rem;border-radius:999px;font-weight:700;background:${ok ? '#dcf3e5' : '#fbe1de'};color:${ok ? '#1f8a4c' : '#c0392b'}}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0 2rem}
  .card{background:#fff;border:1px solid #d9dee8;border-radius:10px;padding:1rem 1.2rem}.card strong{display:block;font-size:1.8rem}
  .links a{display:inline-block;margin:.25rem .6rem .25rem 0;padding:.6rem 1rem;border-radius:8px;background:#2457d6;color:#fff;text-decoration:none;font-weight:600}
  .links a.alt{background:#fff;color:#2457d6;border:1px solid #2457d6}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9dee8;border-radius:8px;overflow:hidden}
  th,td{padding:.5rem .8rem;text-align:left;border-bottom:1px solid #e6e9f0;font-size:.92rem}th{background:#eef1f7}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:2rem}@media(max-width:700px){.cols{grid-template-columns:1fr}}
</style></head><body><main>
<h1>QuoteLab · QA automation showcase</h1>
<p class="muted">Playwright + TypeScript · last run: ${when}</p>
<span class="status">${ok ? 'All tests passed · Todos os testes passaram' : 'Failures in this run · Há falhas nesta execução'}</span>
<div class="grid">
  <div class="card"><strong>${total}</strong>tests · testes</div>
  <div class="card"><strong>${run.passed - (run.suites.find((s) => s.suite === 'seed-reset')?.total ?? 0)}</strong>passed · passaram</div>
  <div class="card"><strong>${run.failed}</strong>failed · falharam</div>
  <div class="card"><strong>${suites.length}</strong>suites · suítes</div>
</div>
<div class="cols">
<section><h2>Reports</h2><div class="links">
  <a href="playwright/index.html">Playwright report</a>
  <a class="alt" href="summary/index.en.html">Run summary (EN)</a>
  <a class="alt" href="summary/index.pt.html">Resumo (PT)</a></div>
  <p><a href="https://github.com/${REPO}">Source code on GitHub · Código no GitHub</a></p></section>
<section><h2>Suites · Suítes</h2><table><thead><tr><th>Suite</th><th>Tests</th></tr></thead><tbody>
${suites.map((s) => `<tr><td>${s.suite}</td><td>${s.total}</td></tr>`).join('\n')}
</tbody></table></section></div>
</main></body></html>
`;
writeFileSync(`${SITE}/index.html`, html);
writeFileSync(`${SITE}/.nojekyll`, '');
console.log(`Site written to ${SITE}/ (${total} tests, ${run.failed} failed).`);
