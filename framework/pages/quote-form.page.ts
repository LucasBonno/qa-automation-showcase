import { expect, type Locator } from '@playwright/test';
import type { CategoryId, PaymentCondition, QuoteKind } from '../api/types.js';
import type { LeaseScenario } from '../oracles/lease.js';
import { bpsToTyped } from '../oracles/money.js';
import type { SaleScenario } from '../oracles/sale.js';
import { SPEC } from '../oracles/spec.js';
import { BasePage } from './base.page.js';
import { SummaryPanel } from './summary-panel.js';

export type FormErrorField = 'customerId' | 'type' | 'category' | 'items' | 'termMonths' | 'addOn' | 'paymentCondition' | 'installments' | 'discountBps' | 'notes';

export class QuoteFormPage extends BasePage {
  readonly summary = new SummaryPanel(this.page);

  async gotoNew(): Promise<void> {
    await this.page.goto('/#/quotes/new');
    await this.ready('#/quotes/new');
    await expect(this.page.getByTestId('quote-form')).toBeVisible();
  }

  async gotoEdit(id: number): Promise<void> {
    await this.page.goto(`/#/quotes/${id}/edit`);
    await this.ready(`#/quotes/${id}/edit`);
  }

  // ---- fields
  get customer(): Locator {
    return this.page.getByLabel('Cliente', { exact: true });
  }
  get category(): Locator {
    return this.page.getByLabel('Categoria', { exact: true });
  }
  get itemSelect(): Locator {
    return this.page.getByLabel('Item', { exact: true });
  }
  get quantity(): Locator {
    return this.page.getByLabel('Quantidade', { exact: true });
  }
  get term(): Locator {
    return this.page.getByLabel('Prazo (meses)');
  }
  get payment(): Locator {
    return this.page.getByLabel('Condição de pagamento');
  }
  get installments(): Locator {
    return this.page.getByLabel('Parcelas', { exact: true });
  }
  get discount(): Locator {
    return this.page.getByLabel('Desconto (%)');
  }
  get notes(): Locator {
    return this.page.getByLabel('Observações');
  }
  get notesCounter(): Locator {
    return this.page.getByTestId('notes-counter');
  }
  get saveDraftButton(): Locator {
    return this.page.getByTestId('save-draft');
  }
  get submitButton(): Locator {
    return this.page.getByTestId('submit');
  }
  get banner(): Locator {
    return this.page.getByTestId('form-error');
  }
  typeRadio(type: QuoteKind): Locator {
    return this.page.locator(`#f-type-${type}`);
  }
  addOnCheckbox(category: CategoryId): Locator {
    return this.page.getByLabel(SPEC.categories[category].addOn.name);
  }
  error(field: FormErrorField): Locator {
    return this.page.getByTestId(`error-${field}`);
  }
  itemRow(sku: string): Locator {
    return this.page.getByTestId('items').getByTestId('item-row').and(this.page.locator(`[data-sku="${sku}"]`));
  }
  quantityOf(sku: string): Locator {
    return this.page.getByLabel(`Quantidade de ${sku}`);
  }

  // ---- actions
  async chooseCustomer(id: string): Promise<void> {
    await this.customer.selectOption(id);
  }
  async chooseType(type: QuoteKind): Promise<void> {
    await this.typeRadio(type).check();
  }
  async chooseCategory(category: CategoryId): Promise<void> {
    await this.category.selectOption(category);
  }
  async addItem(sku: string, qty: number | string): Promise<void> {
    await this.itemSelect.selectOption(sku);
    await this.quantity.fill(String(qty));
    await this.page.getByRole('button', { name: 'Adicionar item' }).click();
  }
  async setQuantity(sku: string, qty: number | string): Promise<void> {
    await this.quantityOf(sku).fill(String(qty));
  }
  async removeItem(sku: string): Promise<void> {
    await this.page.getByRole('button', { name: `Remover ${sku}` }).click();
  }
  async chooseTerm(months: number): Promise<void> {
    await this.term.selectOption(String(months));
  }
  async choosePayment(condition: PaymentCondition): Promise<void> {
    await this.payment.selectOption(condition);
  }
  async chooseInstallments(count: number): Promise<void> {
    await this.installments.selectOption(String(count));
  }
  async setDiscount(text: string): Promise<void> {
    await this.discount.fill(text);
  }

  /** Fills the whole form for a lease scenario, as a user would, and waits for the calculation. */
  async fillLease(s: LeaseScenario, customerId = 'c1'): Promise<void> {
    await this.chooseCustomer(customerId);
    await this.chooseType('lease');
    await this.chooseCategory(s.category);
    for (const item of s.items) await this.addItem(item.sku, item.qty);
    await this.chooseTerm(s.termMonths);
    if (s.addOn) await this.addOnCheckbox(s.category).check();
    await this.setDiscount(bpsToTyped(s.discountBps));
    await this.summary.waitReady();
  }

  async fillSale(s: SaleScenario): Promise<void> {
    await this.chooseCustomer(s.customerId);
    await this.chooseType('sale');
    await this.chooseCategory(s.category);
    for (const item of s.items) await this.addItem(item.sku, item.qty);
    await this.choosePayment(s.paymentCondition);
    if (s.paymentCondition === 'installments') await this.chooseInstallments(s.installments ?? 2);
    await this.setDiscount(bpsToTyped(s.discountBps));
    await this.summary.waitReady();
  }
}
