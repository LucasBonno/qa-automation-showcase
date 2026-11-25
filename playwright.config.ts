import { defineConfig, devices } from '@playwright/test';
import { ENV } from './framework/config/env.js';

/**
 * One config, one project per suite.
 *
 * Execution order is expressed with project dependencies:
 *   smoke  ->  access, api, workflow, lease-*, sale-*  ->  seed-reset  ->  reports  ->  reports-live
 * If the smoke suite fails, everything after it is skipped (there is no point testing a dead system).
 * `reports` only reads data, so it can run in parallel; `reports-live` changes data and runs alone, last.
 *
 * Run a single suite without its dependencies with `npm run suite -- <name>` (it adds --no-deps).
 */
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } };

const suite = (name: string, dependencies: string[] = ['smoke']) => ({
  name,
  testDir: `./suites/${name}`,
  dependencies,
  use: desktop,
});

const CORE_SUITES = ['access', 'api', 'workflow'];
const FEATURE_SUITES = ['lease-notebooks', 'lease-printers', 'lease-mobile', 'lease-automation', 'sale-notebooks', 'sale-printers', 'sale-mobile'];

export default defineConfig({
  // Set PW_OUTPUT_DIR to a folder outside OneDrive/Dropbox if a sync client locks the artifacts while tests run.
  outputDir: process.env.PW_OUTPUT_DIR ?? 'reports/test-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: ENV.isCI,
  retries: ENV.isCI ? 1 : 0,
  workers: ENV.isCI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['./framework/reporter/summary-reporter.ts'],
  ],
  use: {
    baseURL: ENV.baseURL,
    // PW_SLOWMO=300 waits 300 ms between browser actions, so a person can follow a test run with --headed.
    launchOptions: { slowMo: Number(process.env.PW_SLOWMO ?? 0) },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: ENV.startsOwnServer
    ? {
        command: 'npx tsx app/server.ts',
        url: `${ENV.baseURL}/health/ready`,
        // PW_FRESH_SERVER=1 forces a new server (used by the mutation check, which must never reuse a stale one).
        reuseExistingServer: !ENV.isCI && !process.env.PW_FRESH_SERVER,
        env: { QL_TEST_MODE: '1', PORT: String(ENV.port) },
        timeout: 30_000,
      }
    : undefined,
  projects: [
    suite('smoke', []),
    ...CORE_SUITES.map((name) => suite(name)),
    ...FEATURE_SUITES.map((name) => suite(name)),
    { name: 'seed-reset', testDir: './suites/_setup', testMatch: /reset\.setup\.ts/, dependencies: [...CORE_SUITES, ...FEATURE_SUITES], use: desktop },
    suite('reports', ['seed-reset']),
    suite('reports-live', ['reports']),
  ],
});
