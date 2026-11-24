/**
 * Do the tests actually catch bugs? This script injects one deliberate defect at a time into the application,
 * runs the suite that is supposed to notice it, and reports whether that suite failed. A defect that is not
 * caught ("SURVIVED") means a hole in the tests.
 *
 *   npm run mutation-check            all mutations
 *   npm run mutation-check -- M3 M5   only these
 *
 * The edited file is always restored, even if a run crashes or is interrupted.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';

const MUTATIONS = [
  { id: 'M1', title: 'rounding: half up becomes round down', file: 'app/src/money.ts', from: 'Math.floor((cents * bps * 2 + BPS) / (BPS * 2))', to: 'Math.floor((cents * bps) / BPS)', project: 'lease-notebooks' },
  { id: 'M2', title: 'approval line: "above 10%" becomes "10% or more"', file: 'app/src/calc.ts', from: 'discountBps > APPROVAL_DISCOUNT_BPS', to: 'discountBps >= APPROVAL_DISCOUNT_BPS', project: 'lease-printers' },
  { id: 'M3', title: 'permission: a seller may approve quotes', file: 'app/src/auth.ts', from: "canDecide = (role: Role): boolean => role === 'admin' || role === 'approver'", to: "canDecide = (role: Role): boolean => role === 'admin' || role === 'approver' || role === 'seller'", project: 'access' },
  { id: 'M4', title: 'limit: maximum quantity accepts one extra unit', file: 'app/src/validation.ts', from: 'raw.qty > max)', to: 'raw.qty > max + 1)', project: 'lease-mobile' },
  { id: 'M5', title: 'formula: installment compounds n-1 periods', file: 'app/src/money.ts', from: 'Math.pow(1 + i, months)', to: 'Math.pow(1 + i, months - 1)', project: 'sale-printers' },
  { id: 'M6', title: 'screen: the list shows every value one cent too high', file: 'app/public/js/views/list.js', from: 'money(q.headlineCents)', to: 'money(q.headlineCents + 1)', project: 'reports' },
  { id: 'M7', title: 'concurrency: stale versions are no longer detected', file: 'app/src/app.ts', from: 'if (version !== record.version) {', to: 'if (false as boolean) {', project: 'api' },
  { id: 'M8', title: 'tax: computed on the net value instead of net + freight', file: 'app/src/calc.ts', from: 'percentOf(taxableBaseCents, taxBps)', to: 'percentOf(netCents, taxBps)', project: 'sale-notebooks' },
  { id: 'M9', title: 'export: the UTF-8 byte order mark is dropped', file: 'app/src/app.ts', from: 'res.send(`\\uFEFF${', to: 'res.send(`${', project: 'reports' },
  { id: 'M10', title: 'screen: the add-on checkbox is ignored in the preview', file: 'app/public/js/views/form.js', from: "return { ...base, termMonths: model.termMonths, addOn: model.addOn };", to: "return { ...base, termMonths: model.termMonths, addOn: false };", project: 'lease-automation' },
];

const PORT = Number(process.env.PORT ?? 4173);

/** Resolves once nothing listens on the app port, so a run can never talk to the previous run's server. */
const portIsFree = () =>
  new Promise((resolve) => {
    const probe = net.createConnection({ port: PORT, host: '127.0.0.1' });
    probe.once('connect', () => (probe.destroy(), resolve(false)));
    probe.once('error', () => resolve(true));
  });
async function waitForFreePort() {
  for (let i = 0; i < 60; i += 1) {
    if (await portIsFree()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${PORT} is still in use: stop the other server first.`);
}

const wanted = process.argv.slice(2);
const selected = wanted.length ? MUTATIONS.filter((m) => wanted.includes(m.id)) : MUTATIONS;

const originals = new Map();
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
  originals.clear();
};
process.on('exit', restoreAll);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

const rows = [];
for (const m of selected) {
  await waitForFreePort();
  const original = readFileSync(m.file, 'utf8');
  if (!original.includes(m.from)) {
    rows.push({ ...m, verdict: 'SKIPPED (code to mutate not found: update the script)', failed: '-', passed: '-' });
    continue;
  }
  originals.set(m.file, original);
  writeFileSync(m.file, original.replace(m.from, m.to));
  process.stdout.write(`${m.id} ${m.title} ... `);
  const run = spawnSync('npx', ['playwright', 'test', '--no-deps', '--project', m.project, '--reporter=json'], { encoding: 'utf8', shell: true, maxBuffer: 1 << 30, env: { ...process.env, CI: '', PW_FRESH_SERVER: '1' } });
  restoreAll();
  let stats;
  try {
    stats = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))).stats;
  } catch {
    rows.push({ ...m, verdict: 'ERROR (no result)', failed: '-', passed: '-' });
    console.log('error');
    continue;
  }
  const caught = stats.unexpected > 0;
  rows.push({ ...m, verdict: caught ? 'CAUGHT' : 'SURVIVED', failed: stats.unexpected, passed: stats.expected });
  console.log(caught ? `caught (${stats.unexpected} failing tests)` : 'SURVIVED');
}

console.log('\nID   Verdict    Suite              Failed  Passed  Defect');
for (const r of rows) console.log(`${r.id.padEnd(4)} ${String(r.verdict).padEnd(10)} ${r.project.padEnd(18)} ${String(r.failed).padStart(6)}  ${String(r.passed).padStart(6)}  ${r.title}`);
const survived = rows.filter((r) => r.verdict !== 'CAUGHT');
console.log(`\n${rows.length - survived.length}/${rows.length} defects caught.`);
process.exitCode = survived.length ? 1 : 0;
