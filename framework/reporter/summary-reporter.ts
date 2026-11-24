import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * A one-page summary of the run, per suite. It writes index.pt.html and index.en.html side by side, and index.html
 * in the language of REPORT_LANG (pt by default).
 * It complements Playwright's own HTML report: this one answers "is the build healthy?" at a glance.
 */
type Outcome = 'passed' | 'failed' | 'flaky' | 'skipped';

interface Row {
  suite: string;
  title: string;
  file: string;
  outcome: Outcome;
  durationMs: number;
  error?: string;
}

const TEXT = {
  pt: {
    title: 'Relatório da execução',
    generated: 'Gerado em',
    total: 'Total',
    passed: 'Passaram',
    failed: 'Falharam',
    flaky: 'Instáveis',
    skipped: 'Ignorados',
    duration: 'Duração',
    suite: 'Suíte',
    failures: 'Falhas',
    none: 'Nenhuma falha nesta execução.',
    test: 'Teste',
    file: 'Arquivo',
    error: 'Erro',
    verdict: { ok: 'Execução saudável', bad: 'Há falhas a investigar' },
  },
  en: {
    title: 'Run report',
    generated: 'Generated at',
    total: 'Total',
    passed: 'Passed',
    failed: 'Failed',
    flaky: 'Flaky',
    skipped: 'Skipped',
    duration: 'Duration',
    suite: 'Suite',
    failures: 'Failures',
    none: 'No failures in this run.',
    test: 'Test',
    file: 'File',
    error: 'Error',
    verdict: { ok: 'Healthy run', bad: 'Failures to investigate' },
  },
} as const;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');

export default class SummaryReporter implements Reporter {
  private rows: Row[] = [];
  private startedAt = Date.now();
  private readonly defaultLang: 'pt' | 'en' = process.env.REPORT_LANG === 'en' ? 'en' : 'pt';

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only the final attempt of a test counts.
    if (result.retry !== test.results.length - 1 && test.outcome() !== 'skipped') return;
    const outcome = test.outcome();
    const mapped: Outcome = outcome === 'expected' ? 'passed' : outcome === 'unexpected' ? 'failed' : outcome === 'flaky' ? 'flaky' : 'skipped';
    const suite = test.parent.project()?.name ?? 'default';
    this.rows.push({
      suite,
      title: test.title,
      file: path.relative(process.cwd(), test.location.file).replaceAll('\\', '/'),
      outcome: mapped,
      durationMs: result.duration,
      error: mapped === 'failed' ? stripAnsi(result.error?.message ?? '').split('\n')[0] : undefined,
    });
  }

  onEnd(result: FullResult): void {
    const dir = path.join(process.cwd(), 'reports', 'summary');
    mkdirSync(dir, { recursive: true });
    const failures = this.rows.filter((r) => r.outcome === 'failed');
    const count = (rows: Row[], o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const pt = this.render('pt', result);
    const en = this.render('en', result);
    writeFileSync(path.join(dir, 'index.pt.html'), pt);
    writeFileSync(path.join(dir, 'index.en.html'), en);
    writeFileSync(path.join(dir, 'index.html'), this.defaultLang === 'en' ? en : pt);
    writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), status: result.status, total: this.rows.length, passed: count(this.rows, 'passed'), failed: failures.length, flaky: count(this.rows, 'flaky'), skipped: count(this.rows, 'skipped'), suites: [...new Set(this.rows.map((r) => r.suite))].sort().map((s) => ({ suite: s, total: this.rows.filter((r) => r.suite === s).length })) }, null, 2),
    );
  }

  private render(lang: 'pt' | 'en', result: FullResult): string {
    const t = TEXT[lang];
    const suites = [...new Set(this.rows.map((r) => r.suite))].sort();
    const count = (rows: Row[], o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const failures = this.rows.filter((r) => r.outcome === 'failed');
    const healthy = failures.length === 0 && result.status !== 'failed' && result.status !== 'interrupted';

    const lines = suites.map((suite) => {
      const rows = this.rows.filter((r) => r.suite === suite);
      return `<tr><th scope="row">${esc(suite)}</th><td>${rows.length}</td><td class="ok">${count(rows, 'passed')}</td><td class="bad">${count(rows, 'failed')}</td><td>${count(rows, 'flaky')}</td><td>${count(rows, 'skipped')}</td><td>${seconds(rows.reduce((s, r) => s + r.durationMs, 0))}</td></tr>`;
    });

    const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.title}</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;margin:2rem auto;max-width:960px;color:#1c2433;padding:0 1rem}
h1{margin-bottom:.2rem}.muted{color:#667085}.verdict{display:inline-block;padding:.3rem .8rem;border-radius:999px;font-weight:600;margin:.8rem 0}
.verdict.good{background:#dcf3e5;color:#1f8a4c}.verdict.fail{background:#fbe1de;color:#c0392b}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.5rem .7rem;border-bottom:1px solid #d9dee8;text-align:left;font-size:.92rem}
thead th{background:#eef1f7}td.ok{color:#1f8a4c;font-weight:600}td.bad{color:#c0392b;font-weight:600}code{font-size:.85rem}
</style></head><body>
<h1>${t.title}</h1>
<p class="muted">${t.generated} ${new Date().toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')} · ${t.duration}: ${seconds(Date.now() - this.startedAt)}</p>
<span class="verdict ${healthy ? 'good' : 'fail'}">${healthy ? t.verdict.ok : t.verdict.bad}</span>
<table><thead><tr><th>${t.suite}</th><th>${t.total}</th><th>${t.passed}</th><th>${t.failed}</th><th>${t.flaky}</th><th>${t.skipped}</th><th>${t.duration}</th></tr></thead>
<tbody>${lines.join('')}
<tr><th scope="row">Total</th><td>${this.rows.length}</td><td class="ok">${count(this.rows, 'passed')}</td><td class="bad">${failures.length}</td><td>${count(this.rows, 'flaky')}</td><td>${count(this.rows, 'skipped')}</td><td>${seconds(this.rows.reduce((s, r) => s + r.durationMs, 0))}</td></tr></tbody></table>
<h2>${t.failures}</h2>
${failures.length === 0 ? `<p>${t.none}</p>` : `<table><thead><tr><th>${t.suite}</th><th>${t.test}</th><th>${t.error}</th></tr></thead><tbody>${failures.map((f) => `<tr><td>${esc(f.suite)}</td><td>${esc(f.title)}<br><code>${esc(f.file)}</code></td><td>${esc(f.error ?? '')}</td></tr>`).join('')}</tbody></table>`}
</body></html>`;

    return html;
  }
}
