const TOKEN_KEY = 'ql_token';
const USER_KEY = 'ql_user';

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export const canWrite = (user) => user?.role === 'admin' || user?.role === 'seller';
export const canDecide = (user) => user?.role === 'admin' || user?.role === 'approver';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `Erro ${status}`);
    this.status = status;
    this.body = body;
  }
  get fields() {
    return this.body?.fields ?? null;
  }
}

/** JSON fetch with the bearer token. A 401 anywhere ends the session and sends the user to the login. */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/auth/login') {
    session.clear();
    sessionStorage.setItem('ql_notice', 'expired');
    window.dispatchEvent(new Event('ql:expired'));
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Downloads an authenticated file and hands it to the browser as a normal download. */
export async function downloadFile(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session.token}` } });
  if (res.status === 401) {
    session.clear();
    sessionStorage.setItem('ql_notice', 'expired');
    window.dispatchEvent(new Event('ql:expired'));
    throw new ApiError(401, null);
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let catalogPromise = null;
export const getCatalog = () => (catalogPromise ??= api('/api/catalog').catch((e) => ((catalogPromise = null), Promise.reject(e))));
export const resetCatalogCache = () => {
  catalogPromise = null;
};
