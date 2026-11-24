import type { Locator } from '@playwright/test';
import type { Account } from '../config/accounts.js';
import { BasePage } from './base.page.js';

export class LoginPage extends BasePage {
  get username(): Locator {
    return this.page.getByLabel('Usuário');
  }
  get password(): Locator {
    return this.page.getByLabel('Senha');
  }
  get submit(): Locator {
    return this.page.getByRole('button', { name: 'Entrar' });
  }
  get error(): Locator {
    return this.page.getByTestId('login-error');
  }
  get notice(): Locator {
    return this.page.getByTestId('login-notice');
  }
  get demoAccounts(): Locator {
    return this.page.getByTestId('demo-accounts');
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/login');
    await this.ready('#/login');
  }

  async fill(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
  }

  async login(account: Pick<Account, 'username' | 'password'>): Promise<void> {
    await this.fill(account.username, account.password);
    await this.submit.click();
  }
}
