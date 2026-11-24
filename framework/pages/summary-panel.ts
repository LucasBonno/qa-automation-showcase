import { expect, type Locator, type Page } from '@playwright/test';

/** The "Resumo do cálculo" panel, present on the form (live preview) and on the quote detail page. */
export class SummaryPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('summary');
  }
  get emptyMessage(): Locator {
    return this.page.getByTestId('summary-empty');
  }
  get approval(): Locator {
    return this.page.getByTestId('summary-approval');
  }

  /** The preview is debounced and asynchronous: wait for a finished calculation before reading it. */
  async waitReady(): Promise<void> {
    await expect(this.root).toHaveAttribute('data-state', 'ready');
  }

  /** The displayed text of one row ("R$ 1.234,56", "1,90% a.m.", "36 meses"). */
  value(key: string): Locator {
    return this.page.getByTestId(`summary-${key}`);
  }

  /** Exact integer cents of a row, or null when the row is not shown (some rows only exist when above zero). */
  async cents(key: string): Promise<number | null> {
    const row = this.value(key);
    if ((await row.count()) === 0) return null;
    const attr = await row.getAttribute('data-cents');
    return attr === null ? null : Number(attr);
  }

  async requiresApproval(): Promise<boolean> {
    return (await this.approval.getAttribute('data-required')) === 'true';
  }

  /** "Parcela 2 · 60 dias · R$ ..." entries of the payment schedule, as cents. */
  async scheduleCents(): Promise<number[]> {
    const items = this.page.getByTestId('summary-schedule').locator('li');
    return (await items.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-cents')))));
  }
}
