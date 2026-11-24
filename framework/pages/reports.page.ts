import type { Locator } from '@playwright/test';
import { BasePage } from './base.page.js';

export class ReportsPage extends BasePage {
  async goto(filters: { category?: string; type?: string } = {}): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const qs = params.toString();
    const hash = `#/reports${qs ? `?${qs}` : ''}`;
    await this.page.goto(`/${hash}`);
    await this.ready(hash);
  }

  get categoryFilter(): Locator {
    return this.page.getByLabel('Categoria', { exact: true });
  }
  get typeFilter(): Locator {
    return this.page.getByLabel('Tipo', { exact: true });
  }
  get exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Exportar CSV' });
  }
  card(key: 'total-count' | 'approved-value' | 'pending-value'): Locator {
    return this.page.getByTestId(`card-${key}`);
  }

  /** One row of a grouped table: group is "status", "category" or "type". */
  groupRow(group: 'status' | 'category' | 'type', key: string): Locator {
    return this.page.getByTestId(`report-by-${group}`).locator(`tr[data-key="${key}"]`);
  }

  async groupCount(group: 'status' | 'category' | 'type', key: string): Promise<number> {
    return Number(await this.groupRow(group, key).locator('[data-col="count"]').innerText());
  }

  async groupCents(group: 'status' | 'category' | 'type', key: string): Promise<number> {
    return Number(await this.groupRow(group, key).locator('[data-col="value"]').getAttribute('data-cents'));
  }

  async cardCents(key: 'approved-value' | 'pending-value'): Promise<number> {
    return Number(await this.card(key).getAttribute('data-cents'));
  }
}
