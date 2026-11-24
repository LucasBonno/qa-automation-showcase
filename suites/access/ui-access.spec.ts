import { ApiClient } from '../../framework/api/client.js';
import { ACCOUNTS } from '../../framework/config/accounts.js';
import { baseLease, uniqueTag } from '../../framework/factory/payloads.js';
import { expect, test } from '../../framework/fixtures/test.js';

test.describe('Route protection', () => {
  test('opening a protected URL without a session goes to the login and returns to that URL after signing in', async ({ page, api, track, loginPage }) => {
    const quote = track(await api.createQuote(baseLease()));
    await page.goto(`/#/quotes/${quote.id}`);
    await loginPage.ready('#/login');
    await loginPage.login(ACCOUNTS.admin);
    await loginPage.ready(`#/quotes/${quote.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Cotação ${quote.code}`);
  });

  test('the return address keeps the list filters', async ({ page, loginPage }) => {
    await page.goto('/#/quotes?status=draft&category=printers');
    await loginPage.ready('#/login');
    await loginPage.login(ACCOUNTS.seller);
    await loginPage.ready('#/quotes?status=draft&category=printers');
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('draft');
    await expect(page.getByLabel('Categoria', { exact: true })).toHaveValue('printers');
  });

  test('a signed-in user who opens the login URL is sent to the quote list', async ({ page, openAs }) => {
    await openAs('admin');
    await page.goto('/#/login');
    await expect(page.locator('#app')).toHaveAttribute('data-route', '#/quotes');
  });

  test('an unknown address shows a "not found" page that keeps the navigation', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/does-not-exist');
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(listPage.navLink('Cotações')).toBeVisible();
  });

  test('an unknown quote id shows "quote not found" instead of a blank page', async ({ openAs, page }) => {
    await openAs('admin', '#/quotes/987654');
    await expect(page.getByRole('heading', { name: 'Cotação não encontrada' })).toBeVisible();
  });

  test('an unauthenticated visitor to an unknown address is asked to log in first', async ({ page, loginPage }) => {
    await page.goto('/#/does-not-exist');
    await loginPage.ready('#/login');
  });
});

test.describe('Session lifecycle', () => {
  test('after signing out, the browser back button does not reopen the protected page', async ({ page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    await listPage.logoutButton.click();
    await listPage.ready('#/login');
    await page.goBack();
    await expect(page.locator('#app')).toHaveAttribute('data-route', '#/login');
    await expect(listPage.userName).toHaveCount(0);
  });

  test('an expired session sends the user to the login with an explanation', async ({ page, request, loginPage }) => {
    const shortLived = await ApiClient.login(request, 'admin', 1);
    await page.goto('/#/login');
    await page.evaluate(([token]) => {
      localStorage.setItem('ql_token', token as string);
      localStorage.setItem('ql_user', JSON.stringify({ username: 'admin', name: 'Ana Admin', role: 'admin' }));
    }, [shortLived.token]);
    await expect.poll(async () => (await shortLived.send('GET', '/api/auth/me')).status, { intervals: [250], timeout: 8_000 }).toBe(401);
    await page.goto('/#/quotes');
    await loginPage.ready('#/login');
    await expect(loginPage.notice).toHaveText('Sessão expirada. Faça login novamente.');
    expect(await page.evaluate(() => localStorage.getItem('ql_token')), 'the dead token is discarded').toBeNull();
  });

  test('a session that expires while the user is working is caught on the next action', async ({ page, request, loginPage, formPage }) => {
    const shortLived = await ApiClient.login(request, 'admin', 2);
    await page.goto('/#/login');
    await page.evaluate(([token]) => {
      localStorage.setItem('ql_token', token as string);
      localStorage.setItem('ql_user', JSON.stringify({ username: 'admin', name: 'Ana Admin', role: 'admin' }));
    }, [shortLived.token]);
    await formPage.gotoNew();
    await expect.poll(async () => (await shortLived.send('GET', '/api/auth/me')).status, { intervals: [250], timeout: 8_000 }).toBe(401);
    await formPage.saveDraftButton.click();
    await loginPage.ready('#/login');
    await expect(loginPage.notice).toBeVisible();
  });

  test('a corrupted token in the browser storage is discarded and the user must log in again', async ({ page, loginPage }) => {
    await page.goto('/#/login');
    await page.evaluate(() => {
      localStorage.setItem('ql_token', 'garbage.token');
      localStorage.setItem('ql_user', JSON.stringify({ username: 'admin', name: 'Ana Admin', role: 'admin' }));
    });
    await page.goto('/#/quotes');
    await loginPage.ready('#/login');
    await expect(loginPage.notice).toBeVisible();
  });

  test('signing out in one tab signs out the other tab too', async ({ context, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    const other = await context.newPage();
    await other.goto('/#/quotes');
    await expect(other.getByTestId('user-name')).toHaveText('Ana Admin');
    await listPage.logoutButton.click();
    await expect(other.locator('#app')).toHaveAttribute('data-route', '#/login');
  });

  test('signing in as someone else in another tab is picked up by the first tab on the next load', async ({ context, page, openAs, listPage }) => {
    await openAs('admin', '#/quotes');
    const other = await context.newPage();
    await other.goto('/#/quotes');
    await other.getByRole('button', { name: 'Sair' }).click();
    await expect(other.locator('#app')).toHaveAttribute('data-route', '#/login');
    await other.getByLabel('Usuário').fill(ACCOUNTS.viewer.username);
    await other.getByLabel('Senha').fill(ACCOUNTS.viewer.password);
    await other.getByRole('button', { name: 'Entrar' }).click();
    await expect(other.getByTestId('user-name')).toHaveText(ACCOUNTS.viewer.name);
    await page.reload();
    await expect(listPage.userName).toHaveText(ACCOUNTS.viewer.name);
  });

  test('the session survives a page reload', async ({ page, openAs, listPage }) => {
    await openAs('seller', '#/quotes');
    await page.reload();
    await expect(listPage.userName).toHaveText(ACCOUNTS.seller.name);
  });
});

test.describe('What each role sees', () => {
  test('viewer: no "Nova cotação" link, the form URL is blocked, and a quote shows no action buttons', async ({ api, track, page, openAs, listPage, detailPage }) => {
    const quote = track(await api.createQuote(baseLease()));
    await openAs('viewer', '#/quotes');
    await expect(listPage.navLink('Nova cotação')).toHaveCount(0);
    await page.goto('/#/quotes/new');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    await detailPage.goto(quote.id);
    await expect(page.getByTestId('actions').getByRole('button')).toHaveCount(0);
    await expect(detailPage.editLink).toHaveCount(0);
  });

  test('viewer can still read quotes and open the reports', async ({ openAs, listPage, reportsPage }) => {
    await openAs('viewer', '#/quotes');
    await expect(listPage.rows.first()).toBeVisible();
    await reportsPage.goto();
    await expect(reportsPage.exportButton).toBeEnabled();
  });

  test('approver: a pending quote offers Aprovar and Rejeitar but no editing actions', async ({ api, track, openAs, detailPage }) => {
    const pending = track(await api.submitQuote((await api.createQuote(baseLease({ discountBps: 2_000 }))).id));
    await openAs('approver', `#/quotes/${pending.id}`);
    await expect(detailPage.action('Aprovar')).toBeVisible();
    await expect(detailPage.action('Rejeitar')).toBeVisible();
    for (const name of ['Enviar cotação', 'Excluir', 'Duplicar']) await expect(detailPage.action(name)).toHaveCount(0);
    await expect(detailPage.editLink).toHaveCount(0);
  });

  test('approver: an approved quote offers cancellation, a draft offers nothing', async ({ api, track, openAs, detailPage }) => {
    const approved = track(await api.submitQuote((await api.createQuote(baseLease())).id));
    const draft = track(await api.createQuote(baseLease()));
    await openAs('approver', `#/quotes/${approved.id}`);
    await expect(detailPage.action('Cancelar cotação')).toBeVisible();
    await detailPage.goto(draft.id);
    await expect(detailPage.page.getByTestId('actions').getByRole('button')).toHaveCount(0);
  });

  test('seller: own draft offers edit, send, delete and duplicate; another user\'s draft only offers duplicate', async ({ api, apiAs, track, openAs, detailPage }) => {
    const seller = await apiAs('seller');
    const own = track(await seller.createQuote(baseLease()));
    const foreign = track(await api.createQuote(baseLease()));
    await openAs('seller', `#/quotes/${own.id}`);
    await expect(detailPage.editLink).toBeVisible();
    for (const name of ['Enviar cotação', 'Excluir', 'Duplicar']) await expect(detailPage.action(name)).toBeVisible();
    await detailPage.goto(foreign.id);
    await expect(detailPage.action('Duplicar')).toBeVisible();
    await expect(detailPage.editLink).toHaveCount(0);
    for (const name of ['Enviar cotação', 'Excluir', 'Aprovar']) await expect(detailPage.action(name)).toHaveCount(0);
  });

  test('seller: opening the edit URL of another user\'s quote is blocked', async ({ api, track, openAs, page }) => {
    const foreign = track(await api.createQuote(baseLease()));
    await openAs('seller', `#/quotes/${foreign.id}/edit`);
    await expect(page.getByTestId('forbidden')).toBeVisible();
  });

  test('administrator: sees every action on a seller\'s draft', async ({ apiAs, track, openAs, detailPage }) => {
    const seller = await apiAs('seller');
    const draft = track(await seller.createQuote(baseLease()));
    await openAs('admin', `#/quotes/${draft.id}`);
    await expect(detailPage.editLink).toBeVisible();
    for (const name of ['Enviar cotação', 'Excluir', 'Duplicar']) await expect(detailPage.action(name)).toBeVisible();
  });
});

test.describe('The server enforces what the screen hides', () => {
  test('a viewer who edits the role in the browser storage still cannot save: the API refuses', async ({ page, api, openAs, formPage }) => {
    await openAs('viewer', '#/quotes');
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('ql_user')!);
      localStorage.setItem('ql_user', JSON.stringify({ ...user, role: 'admin' }));
    });
    await formPage.gotoNew();
    const tag = uniqueTag('tamper');
    await formPage.chooseCustomer('c1');
    await formPage.addItem('NB-AUR-14', 1);
    await formPage.notes.fill(tag);
    await formPage.saveDraftButton.click();
    await expect(formPage.banner).toHaveText('Seu perfil não tem permissão para esta ação.');
    const stored = (await api.dbDump()).quotes.filter((q) => q.input.notes === tag);
    expect(stored, 'nothing was created').toHaveLength(0);
  });

  test('a seller who edits the role to approver still cannot approve', async ({ page, api, apiAs, track, openAs, detailPage }) => {
    const seller = await apiAs('seller');
    const pending = track(await seller.submitQuote((await seller.createQuote(baseLease({ discountBps: 2_000 }))).id));
    await openAs('seller', `#/quotes/${pending.id}`);
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('ql_user')!);
      localStorage.setItem('ql_user', JSON.stringify({ ...user, role: 'approver' }));
    });
    await page.reload();
    await detailPage.action('Aprovar').click();
    await expect(detailPage.toast('permissão')).toBeVisible();
    expect((await api.getQuote(pending.id)).status).toBe('pending_approval');
  });
});
