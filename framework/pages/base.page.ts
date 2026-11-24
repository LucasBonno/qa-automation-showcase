import { expect, type Locator, type Page } from '@playwright/test';

/** What every screen has: the app root that reports which route is rendered, and the top bar. */
export abstract class BasePage {
  constructor(readonly page: Page) {}

  get root(): Locator {
    return this.page.locator('#app');
  }

  /** Waits until `route` (a hash like "#/quotes?status=draft") is the rendered screen, not the previous one. */
  async ready(route: string | RegExp): Promise<void> {
    await expect(this.root).toHaveAttribute('data-route', route);
    await expect(this.root).toHaveAttribute('data-state', 'ready');
  }

  // ---- top bar
  get userName(): Locator {
    return this.page.getByTestId('user-name');
  }
  get userRole(): Locator {
    return this.page.getByTestId('user-role');
  }
  get logoutButton(): Locator {
    return this.page.getByRole('button', { name: 'Sair' });
  }
  navLink(name: string): Locator {
    return this.page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name, exact: true });
  }

  // ---- feedback
  toast(text?: string | RegExp): Locator {
    const all = this.page.getByTestId('toast');
    return text === undefined ? all : all.filter({ hasText: text });
  }
}
