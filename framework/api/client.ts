import type { APIRequestContext } from '@playwright/test';
import { ACCOUNTS, type RoleKey } from '../config/accounts.js';
import type { ListResponse, QuoteDto, QuotePayload, ReportSummary } from './types.js';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
  text: string;
}

export interface SendOptions {
  body?: unknown;
  /** Send this string as the request body instead of JSON-encoding `body` (used for malformed JSON). */
  rawBody?: string;
  /** Override the bearer token. `null` sends no Authorization header at all. */
  token?: string | null;
  query?: Record<string, string | number | undefined>;
  /** Extra request headers, applied last (so they can replace Authorization to test malformed values). */
  headers?: Record<string, string>;
}

/** Thin typed wrapper over Playwright's APIRequestContext. Low-level `send` never throws on HTTP errors. */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly token: string | null,
  ) {}

  static async login(request: APIRequestContext, role: RoleKey, ttlSeconds?: number): Promise<ApiClient> {
    const { username, password } = ACCOUNTS[role];
    const res = await request.post('/api/auth/login', { data: { username, password, ttlSeconds } });
    if (!res.ok()) throw new Error(`Login as ${role} failed: ${res.status()} ${await res.text()}`);
    const { token } = (await res.json()) as { token: string };
    return new ApiClient(request, token);
  }

  async send<T = any>(method: string, path: string, options: SendOptions = {}): Promise<ApiResponse<T>> {
    const token = options.token === undefined ? this.token : options.token;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    Object.assign(headers, options.headers);
    let data: unknown;
    if (options.rawBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      data = options.rawBody;
    } else if (options.body !== undefined) data = options.body;
    const params = Object.fromEntries(Object.entries(options.query ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    const res = await this.request.fetch(path, { method, headers, data: data as never, params });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null; // not JSON (an HTML error page, for example): tests read 	ext instead
    }
    return { status: res.status(), body: body as T, headers: res.headers(), text };
  }

  private async ok<T>(res: ApiResponse<T>, expected: number, what: string): Promise<T> {
    if (res.status !== expected) throw new Error(`${what}: expected ${expected}, got ${res.status} ${res.text}`);
    return res.body;
  }

  // ---- happy-path helpers (throw when the status is not the expected one)
  createQuote(payload: QuotePayload): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', '/api/quotes', { body: payload }).then((r) => this.ok(r, 201, 'create quote'));
  }
  getQuote(id: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('GET', `/api/quotes/${id}`).then((r) => this.ok(r, 200, `get quote ${id}`));
  }
  updateQuote(id: number, payload: QuotePayload, version: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('PUT', `/api/quotes/${id}`, { body: { ...payload, version } }).then((r) => this.ok(r, 200, `update quote ${id}`));
  }
  submitQuote(id: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', `/api/quotes/${id}/submit`).then((r) => this.ok(r, 200, `submit quote ${id}`));
  }
  approveQuote(id: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', `/api/quotes/${id}/approve`).then((r) => this.ok(r, 200, `approve quote ${id}`));
  }
  rejectQuote(id: number, reason: string): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', `/api/quotes/${id}/reject`, { body: { reason } }).then((r) => this.ok(r, 200, `reject quote ${id}`));
  }
  cancelQuote(id: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', `/api/quotes/${id}/cancel`).then((r) => this.ok(r, 200, `cancel quote ${id}`));
  }
  duplicateQuote(id: number): Promise<QuoteDto> {
    return this.send<QuoteDto>('POST', `/api/quotes/${id}/duplicate`).then((r) => this.ok(r, 201, `duplicate quote ${id}`));
  }
  deleteQuote(id: number): Promise<ApiResponse> {
    return this.send('DELETE', `/api/quotes/${id}`);
  }
  preview(payload: QuotePayload): Promise<ApiResponse<{ calc: QuoteDto['calc']; items: QuoteDto['items']; fields?: Record<string, string> }>> {
    return this.send('POST', '/api/quotes/preview', { body: payload });
  }
  list(query: Record<string, string | number | undefined> = {}): Promise<ListResponse> {
    return this.send<ListResponse>('GET', '/api/quotes', { query }).then((r) => this.ok(r, 200, 'list quotes'));
  }
  async listAll(query: Record<string, string | number | undefined> = {}): Promise<ListResponse['items']> {
    const first = await this.list({ ...query, page: 1, pageSize: 50 });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) items.push(...(await this.list({ ...query, page, pageSize: 50 })).items);
    return items;
  }
  reportSummary(query: Record<string, string | undefined> = {}): Promise<ReportSummary> {
    return this.send<ReportSummary>('GET', '/api/reports/summary', { query }).then((r) => this.ok(r, 200, 'report summary'));
  }

  // ---- test-mode endpoints (the app must run with QL_TEST_MODE=1)
  async resetData(): Promise<void> {
    await this.send('POST', '/api/__test__/reset').then((r) => this.ok(r, 204, 'reset data'));
  }
  async dbDump(): Promise<{ quotes: (Omit<QuoteDto, 'items' | 'customerName'> & { input: Record<string, unknown>; lines: QuoteDto['items'] })[] }> {
    return this.send('GET', '/api/__test__/db').then((r) => this.ok(r, 200, 'db dump'));
  }
}
