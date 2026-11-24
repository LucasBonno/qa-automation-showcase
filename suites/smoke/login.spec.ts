import { ACCOUNTS, type RoleKey } from '../../framework/config/accounts.js';
import { expect, test } from '../../framework/fixtures/test.js';

const ROLES = Object.keys(ACCOUNTS) as RoleKey[];

test.describe('Login screen @smoke', () => {
  test('shows the form with the submit button disabled until both fields are filled', async ({ loginPage }) => {
    await loginPage.goto();
    await expect(loginPage.submit).toBeDisabled();
    await loginPage.username.fill('admin');
    await expect(loginPage.submit).toBeDisabled();
    await loginPage.password.fill('x');
    await expect(loginPage.submit).toBeEnabled();
    await loginPage.password.fill('');
    await expect(loginPage.submit).toBeDisabled();
  });

  test('lists the four demo accounts', async ({ loginPage }) => {
    await loginPage.goto();
    for (const account of Object.values(ACCOUNTS)) {
      await expect(loginPage.demoAccounts).toContainText(account.username);
      await expect(loginPage.demoAccounts).toContainText(account.password);
    }
  });

  for (const role of ROLES) {
    test(`profile "${role}" signs in through the UI and sees its name and role`, async ({ page, loginPage }) => {
      const account = ACCOUNTS[role];
      await loginPage.goto();
      await loginPage.login(account);
      await loginPage.ready('#/quotes');
      await expect(loginPage.userName).toHaveText(account.name);
      await expect(loginPage.userRole).toHaveText(account.roleLabel);
      expect(await page.evaluate(() => localStorage.getItem('ql_token'))).toBeTruthy();
    });
  }

  test('wrong password shows an error and keeps the user on the login screen', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login({ username: 'admin', password: 'wrong-password' });
    await expect(loginPage.error).toHaveText('Usuário ou senha inválidos.');
    await expect(page).toHaveURL(/#\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('ql_token'))).toBeNull();
  });

  test('signing out returns to the login screen and clears the stored session', async ({ page, loginPage, openAs }) => {
    await openAs('admin');
    await loginPage.logoutButton.click();
    await loginPage.ready('#/login');
    expect(await page.evaluate(() => localStorage.getItem('ql_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('ql_user'))).toBeNull();
  });
});
