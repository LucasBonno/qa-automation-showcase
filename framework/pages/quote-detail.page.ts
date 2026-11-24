import type { Locator } from '@playwright/test';
import { BasePage } from './base.page.js';
import { SummaryPanel } from './summary-panel.js';

export class QuoteDetailPage extends BasePage {
  readonly summary = new SummaryPanel(this.page);

  async goto(id: number): Promise<void> {
    await this.page.goto(`/#/quotes/${id}`);
    await this.ready(`#/quotes/${id}`);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }
  get status(): Locator {
    return this.page.getByTestId('status');
  }
  get history(): Locator {
    return this.page.getByTestId('history').locator('li');
  }
  get itemRows(): Locator {
    return this.page.getByTestId('items').getByTestId('item-row');
  }
  info(key: string): Locator {
    return this.page.getByTestId(`info-${key}`);
  }

  // ---- actions
  action(name: string): Locator {
    return this.page.getByTestId('actions').getByRole('button', { name, exact: true });
  }
  get editLink(): Locator {
    return this.page.getByTestId('actions').getByRole('link', { name: 'Editar', exact: true });
  }
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }
  get dialogError(): Locator {
    return this.page.getByTestId('dialog-error');
  }
  get rejectReason(): Locator {
    return this.dialog.getByLabel('Motivo da rejeição');
  }

  async submitForApproval(): Promise<void> {
    await this.action('Enviar cotação').click();
  }
  async approve(): Promise<void> {
    await this.action('Aprovar').click();
  }
  async reject(reason: string): Promise<void> {
    await this.action('Rejeitar').click();
    await this.rejectReason.fill(reason);
    await this.dialog.getByRole('button', { name: 'Confirmar rejeição' }).click();
  }
  async cancelQuote(): Promise<void> {
    await this.action('Cancelar cotação').click();
    await this.dialog.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  }
  async deleteQuote(): Promise<void> {
    await this.action('Excluir').click();
    await this.dialog.getByRole('button', { name: 'Confirmar exclusão' }).click();
  }
  async duplicate(): Promise<void> {
    await this.action('Duplicar').click();
  }
}
