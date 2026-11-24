import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page.js';

export interface ListFilters {
  status?: string;
  category?: string;
  type?: string;
  q?: string;
  page?: number;
}

export class QuotesListPage extends BasePage {
  get table(): Locator {
    return this.page.getByTestId('quotes-table');
  }
  get rows(): Locator {
    return this.page.getByTestId('quote-row');
  }
  get totalCount(): Locator {
    return this.page.getByTestId('total-count');
  }
  get pageInfo(): Locator {
    return this.page.getByTestId('page-info');
  }
  get emptyState(): Locator {
    return this.page.getByTestId('empty-state');
  }
  get statusFilter(): Locator {
    return this.page.getByLabel('Status', { exact: true });
  }
  get categoryFilter(): Locator {
    return this.page.getByLabel('Categoria', { exact: true });
  }
  get typeFilter(): Locator {
    return this.page.getByLabel('Tipo', { exact: true });
  }
  get search(): Locator {
    return this.page.getByLabel('Buscar');
  }
  get clearButton(): Locator {
    return this.page.getByRole('button', { name: 'Limpar filtros' });
  }
  get previousButton(): Locator {
    return this.page.getByRole('button', { name: 'Anterior' });
  }
  get nextButton(): Locator {
    return this.page.getByRole('button', { name: 'Próxima' });
  }

  static hash(filters: ListFilters = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
    const qs = params.toString();
    return `#/quotes${qs ? `?${qs}` : ''}`;
  }

  async goto(filters: ListFilters = {}): Promise<void> {
    const hash = QuotesListPage.hash(filters);
    await this.page.goto(`/${hash}`);
    await this.ready(hash);
  }

  rowOf(code: string): Locator {
    return this.rows.and(this.page.locator(`[data-code="${code}"]`));
  }

  /** Text of one cell of a row: code, customer, type, category, value, status or updated. */
  cell(row: Locator, column: string): Locator {
    return row.locator(`[data-col="${column}"]`);
  }

  async codes(): Promise<string[]> {
    return this.rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-code') ?? ''));
  }

  async expectTotal(count: number): Promise<void> {
    await expect(this.totalCount).toHaveText(`${count} ${count === 1 ? 'cotação' : 'cotações'}`);
  }
}
