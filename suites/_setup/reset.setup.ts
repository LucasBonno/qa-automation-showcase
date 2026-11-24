import { test as setup } from '../../framework/fixtures/test.js';

/**
 * The report suites assert exact totals, so they start from the known seed data. This runs after every suite that
 * creates quotes, and before the report suites (see the project dependencies in playwright.config.ts).
 */
setup('restore the seed data before the read-only report suites', async ({ api }) => {
  await api.resetData();
});
