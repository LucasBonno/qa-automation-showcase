import type { APIRequestContext } from '@playwright/test';
import { ApiClient } from '../../framework/api/client.js';
import { ACCOUNTS } from '../../framework/config/accounts.js';
import { expect, test } from '../../framework/fixtures/test.js';

const login = (request: APIRequestContext, data: unknown) => request.post('/api/auth/login', { data: data as never });

test.describe('Authentication API', () => {
  test('a valid login returns a token and the user, and never echoes the password', async ({ request }) => {
    const res = await login(request, { username: 'admin', password: 'Admin@123' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ username: 'admin', name: 'Ana Admin', role: 'admin' });
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(body)).not.toContain('Admin@123');
  });

  test('wrong password and unknown user get the same answer, so usernames cannot be probed', async ({ request }) => {
    const wrongPassword = await login(request, { username: 'admin', password: 'nope' });
    const unknownUser = await login(request, { username: 'ghost', password: 'nope' });
    expect(wrongPassword.status()).toBe(401);
    expect(unknownUser.status()).toBe(401);
    expect(await wrongPassword.text()).toBe(await unknownUser.text());
  });

  test('the password is case sensitive and not trimmed', async ({ request }) => {
    for (const password of ['admin@123', 'ADMIN@123', ' Admin@123', 'Admin@123 ', 'Admin@12']) {
      expect((await login(request, { username: 'admin', password })).status(), JSON.stringify(password)).toBe(401);
    }
  });

  test('missing, empty and non-string credentials are refused', async ({ request }) => {
    for (const data of [{}, { username: 'admin' }, { password: 'Admin@123' }, { username: '', password: '' }, { username: 123, password: 456 }, { username: ['admin'], password: ['Admin@123'] }, { username: null, password: null }]) {
      expect((await login(request, data)).status(), JSON.stringify(data)).toBe(401);
    }
  });

  test('every demo account can log in and receives its own role', async ({ request }) => {
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      const res = await login(request, { username: account.username, password: account.password });
      expect((await res.json()).user.role, account.username).toBe(role);
    }
  });

  test('"who am I" returns the user behind the token', async ({ apiAs }) => {
    const seller = await apiAs('seller');
    const res = await seller.send('GET', '/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ username: 'vendedor', name: 'Vitor Vendedor', role: 'seller' });
  });
});

test.describe('Token handling', () => {
  test('malformed Authorization headers are refused', async ({ api }) => {
    const token = api.token!;
    for (const header of ['', 'Bearer', 'Bearer ', `bearer ${token}`, `Basic ${token}`, token, `Bearer ${token} extra`, `Bearer ${token}.extra`]) {
      const res = await api.send('GET', '/api/auth/me', { token: null, headers: header ? { Authorization: header } : {} });
      expect(res.status, JSON.stringify(header.slice(0, 20))).toBe(401);
    }
  });

  test('a token with a changed signature is refused', async ({ api }) => {
    const [payload, signature] = api.token!.split('.');
    const flipped = `${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`;
    expect((await api.send('GET', '/api/auth/me', { token: `${payload}.${flipped}` })).status).toBe(401);
  });

  test('a token whose payload was edited to claim another role is refused', async ({ apiAs, api }) => {
    const seller = await apiAs('seller');
    const [payload, signature] = seller.token!.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    const forged = `${Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString('base64url')}.${signature}`;
    expect((await api.send('GET', '/api/auth/me', { token: forged })).status).toBe(401);
    expect((await api.send('POST', '/api/quotes/preview', { token: forged, body: {} })).status).toBe(401);
  });

  test('an unsigned token ("alg none" style) is refused', async ({ api }) => {
    const payload = Buffer.from(JSON.stringify({ username: 'admin', name: 'Ana Admin', role: 'admin', exp: 4_102_444_800 })).toString('base64url');
    for (const token of [`${payload}.`, payload, `${payload}.x`]) {
      expect((await api.send('GET', '/api/auth/me', { token })).status, token.slice(-6)).toBe(401);
    }
  });

  test('a token stops working when it expires', async ({ request }) => {
    const shortLived = await ApiClient.login(request, 'admin', 1);
    expect((await shortLived.send('GET', '/api/auth/me')).status, 'works right after login').toBe(200);
    await expect.poll(async () => (await shortLived.send('GET', '/api/auth/me')).status, { timeout: 8_000, intervals: [250] }).toBe(401);
  });

  test('401 (who are you?) and 403 (you may not) are used for the right situations', async ({ api, apiAs }) => {
    const viewer = await apiAs('viewer');
    const created = await api.send('POST', '/api/quotes', { body: { type: 'lease' }, token: null });
    expect(created.status, 'no token').toBe(401);
    const forbidden = await viewer.send('POST', '/api/quotes', { body: { type: 'lease' } });
    expect(forbidden.status, 'valid token, wrong role').toBe(403);
    expect(forbidden.body).toEqual({ error: 'forbidden', message: 'Seu perfil não tem permissão para esta ação.' });
  });
});
