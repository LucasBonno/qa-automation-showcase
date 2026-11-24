/**
 * Single place that reads the environment. Everything else imports ENV.
 *
 *  BASE_URL     where QuoteLab is running. When unset, Playwright starts the app itself (webServer).
 *               A remote instance must run with QL_TEST_MODE=1 for the suites that reset or inspect data.
 *  REPORT_LANG  "pt" (default) or "en": language of the summary report.
 */
export const PORT = Number(process.env.PORT ?? 4173);

export const ENV = {
  port: PORT,
  baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
  startsOwnServer: !process.env.BASE_URL,
  isCI: Boolean(process.env.CI),
  reportLang: process.env.REPORT_LANG === 'en' ? 'en' : 'pt',
} as const;
