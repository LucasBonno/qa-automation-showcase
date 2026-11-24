import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ACCOUNTS,
  DEFAULT_TTL_SECONDS,
  canDecide,
  canWrite,
  checkCredentials,
  requireAuth,
  signToken,
  userOf,
} from './auth.js';
import { calculate, priceLines } from './calc.js';
import {
  CATEGORIES,
  CUSTOMERS,
  ITEMS,
  LEASE_TERMS,
  MAX_DISCOUNT_BPS,
  MAX_NOTES_LENGTH,
  SALE_INSTALLMENTS,
  findCategory,
  findCustomer,
} from './catalog.js';
import { store } from './store.js';
import type { QuoteRecord, QuoteStatus } from './types.js';
import { parseQuoteInput } from './validation.js';

const TEST_MODE = process.env.QL_TEST_MODE === '1';
const STATUSES: readonly QuoteStatus[] = ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'];
const EDITABLE: readonly QuoteStatus[] = ['draft', 'rejected'];

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

const toListItem = (r: QuoteRecord) => ({
  id: r.id,
  code: r.code,
  version: r.version,
  type: r.input.type,
  category: r.input.category,
  customerName: findCustomer(r.input.customerId)!.name,
  status: r.status,
  headlineCents: r.calc.headlineCents,
  createdBy: r.createdBy,
  updatedAt: r.updatedAt,
});

const toDto = (r: QuoteRecord) => {
  const customer = findCustomer(r.input.customerId)!;
  return {
    id: r.id,
    code: r.code,
    version: r.version,
    type: r.input.type,
    category: r.input.category,
    customerId: customer.id,
    customerName: customer.name,
    customerUf: customer.uf,
    items: r.lines,
    termMonths: r.input.termMonths,
    discountBps: r.input.discountBps,
    addOn: r.input.addOn,
    paymentCondition: r.input.paymentCondition,
    installments: r.input.installments,
    notes: r.input.notes,
    status: r.status,
    rejectionReason: r.rejectionReason,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    calc: r.calc,
    history: r.history,
  };
};

const forbidden = (res: Response) => res.status(403).json({ error: 'forbidden', message: 'Seu perfil não tem permissão para esta ação.' });
const notFound = (res: Response) => res.status(404).json({ error: 'not_found', message: 'Cotação não encontrada.' });
const invalidState = (res: Response, record: QuoteRecord, what: string) =>
  res.status(409).json({
    error: 'invalid_state',
    message: `Não é possível ${what} uma cotação com status "${STATUS_LABEL[record.status]}".`,
  });

function loadQuote(req: Request, res: Response): QuoteRecord | null {
  const raw = String(req.params.id);
  const record = /^\d{1,9}$/.test(raw) ? store.get(Number(raw)) : undefined;
  if (!record) {
    notFound(res);
    return null;
  }
  return record;
}

/** Writers: admin on any quote, seller only on their own. */
function mayModify(req: Request, record: QuoteRecord): boolean {
  const user = userOf(req);
  if (!canWrite(user.role)) return false;
  return user.role === 'admin' || record.createdBy === user.username;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const decimal = (cents: number): string => `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

function filterByReportQuery(req: Request, res: Response): QuoteRecord[] | null {
  const { type, category } = req.query;
  if (type !== undefined && type !== 'lease' && type !== 'sale') {
    res.status(400).json({ error: 'validation', fields: { type: 'Tipo inválido.' } });
    return null;
  }
  if (category !== undefined && (typeof category !== 'string' || !findCategory(category))) {
    res.status(400).json({ error: 'validation', fields: { category: 'Categoria inválida.' } });
    return null;
  }
  return store.all().filter((q) => (!type || q.input.type === type) && (!category || q.input.category === category));
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  // ---- health (public)
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (_req, res) => res.json({ status: 'ready', quotes: store.all().length }));

  // ---- test mode helpers (only when QL_TEST_MODE=1)
  if (TEST_MODE) {
    app.post('/api/__test__/reset', (_req, res) => {
      store.reset();
      res.status(204).end();
    });
    app.get('/api/__test__/db', (_req, res) => res.json({ quotes: store.all() }));
  }

  // ---- auth
  app.post('/api/auth/login', (req, res) => {
    const { username, password, ttlSeconds } = (req.body ?? {}) as Record<string, unknown>;
    const user = checkCredentials(username, password);
    if (!user) {
      res.status(401).json({ error: 'invalid_credentials', message: 'Usuário ou senha inválidos.' });
      return;
    }
    const ttl =
      TEST_MODE && typeof ttlSeconds === 'number' && ttlSeconds >= 1 && ttlSeconds <= 86_400 ? ttlSeconds : DEFAULT_TTL_SECONDS;
    res.json({ token: signToken(user, ttl), user });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: userOf(req) }));

  // everything below needs a valid session
  app.use('/api', requireAuth);

  app.get('/api/catalog', (_req, res) => {
    res.json({
      categories: CATEGORIES,
      items: ITEMS,
      customers: CUSTOMERS,
      leaseTerms: LEASE_TERMS,
      installmentOptions: SALE_INSTALLMENTS,
      limits: { maxDiscountBps: MAX_DISCOUNT_BPS, maxNotesLength: MAX_NOTES_LENGTH },
      demoUsers: ACCOUNTS.map(({ username, name, role }) => ({ username, name, role })),
    });
  });

  // ---- quotes: list
  app.get('/api/quotes', (req, res) => {
    const { status, category, type, q } = req.query;
    const fields: Record<string, string> = {};
    if (status !== undefined && status !== '' && !STATUSES.includes(status as QuoteStatus)) fields.status = 'Status inválido.';
    if (category !== undefined && category !== '' && (typeof category !== 'string' || !findCategory(category))) fields.category = 'Categoria inválida.';
    if (type !== undefined && type !== '' && type !== 'lease' && type !== 'sale') fields.type = 'Tipo inválido.';
    if (q !== undefined && (typeof q !== 'string' || q.length > 60)) fields.q = 'Busca deve ter no máximo 60 caracteres.';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 10 : Number(req.query.pageSize);
    if (!Number.isInteger(page) || page < 1) fields.page = 'Página inválida.';
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) fields.pageSize = 'Tamanho de página deve estar entre 1 e 50.';
    if (Object.keys(fields).length > 0) {
      res.status(400).json({ error: 'validation', fields });
      return;
    }

    const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
    const filtered = store
      .all()
      .filter((r) => !status || r.status === status)
      .filter((r) => !category || r.input.category === category)
      .filter((r) => !type || r.input.type === type)
      .filter((r) => !needle || r.code.toLowerCase().includes(needle) || findCustomer(r.input.customerId)!.name.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);

    const start = (page - 1) * pageSize;
    res.json({
      items: filtered.slice(start, start + pageSize).map(toListItem),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    });
  });

  // ---- quotes: preview (no persistence)
  app.post('/api/quotes/preview', (req, res) => {
    if (!canWrite(userOf(req).role)) return void forbidden(res);
    const parsed = parseQuoteInput(req.body);
    if (!parsed.ok) return void res.status(400).json({ error: 'validation', fields: parsed.fields });
    const lines = priceLines(parsed.value.items);
    res.json({ items: lines, calc: calculate(parsed.value, lines) });
  });

  // ---- quotes: create
  app.post('/api/quotes', (req, res) => {
    const user = userOf(req);
    if (!canWrite(user.role)) return void forbidden(res);
    const parsed = parseQuoteInput(req.body);
    if (!parsed.ok) return void res.status(400).json({ error: 'validation', fields: parsed.fields });
    res.status(201).json(toDto(store.create(parsed.value, user.username)));
  });

  // ---- quotes: read
  app.get('/api/quotes/:id', (req, res) => {
    const record = loadQuote(req, res);
    if (record) res.json(toDto(record));
  });

  // ---- quotes: update
  app.put('/api/quotes/:id', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!mayModify(req, record)) return void forbidden(res);
    if (!EDITABLE.includes(record.status)) return void invalidState(res, record, 'alterar');
    const version = (req.body as Record<string, unknown> | undefined)?.version;
    if (typeof version !== 'number') {
      return void res.status(400).json({ error: 'validation', fields: { version: 'Informe a versão da cotação.' } });
    }
    const parsed = parseQuoteInput(req.body);
    if (!parsed.ok) return void res.status(400).json({ error: 'validation', fields: parsed.fields });
    if (version !== record.version) {
      return void res.status(409).json({
        error: 'conflict',
        message: 'Esta cotação foi alterada por outra pessoa. Recarregue a página.',
      });
    }
    res.json(toDto(store.update(record, parsed.value, userOf(req).username)));
  });

  // ---- quotes: delete
  app.delete('/api/quotes/:id', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!mayModify(req, record)) return void forbidden(res);
    if (!EDITABLE.includes(record.status)) return void invalidState(res, record, 'excluir');
    store.delete(record.id);
    res.status(204).end();
  });

  // ---- quotes: duplicate
  app.post('/api/quotes/:id/duplicate', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    const user = userOf(req);
    if (!canWrite(user.role)) return void forbidden(res);
    res.status(201).json(toDto(store.create({ ...record.input, items: record.input.items.map((i) => ({ ...i })) }, user.username)));
  });

  // ---- quotes: workflow
  app.post('/api/quotes/:id/submit', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!mayModify(req, record)) return void forbidden(res);
    if (!EDITABLE.includes(record.status)) return void invalidState(res, record, 'enviar');
    const by = userOf(req).username;
    if (record.calc.requiresApproval) store.transition(record, 'pending_approval', 'submitted', by);
    else store.transition(record, 'approved', 'auto_approved', by);
    res.json(toDto(record));
  });

  app.post('/api/quotes/:id/approve', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!canDecide(userOf(req).role)) return void forbidden(res);
    if (record.status !== 'pending_approval') return void invalidState(res, record, 'aprovar');
    res.json(toDto(store.transition(record, 'approved', 'approved', userOf(req).username)));
  });

  app.post('/api/quotes/:id/reject', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!canDecide(userOf(req).role)) return void forbidden(res);
    if (record.status !== 'pending_approval') return void invalidState(res, record, 'rejeitar');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 200) {
      return void res.status(400).json({ error: 'validation', fields: { reason: 'O motivo deve ter entre 5 e 200 caracteres.' } });
    }
    res.json(toDto(store.transition(record, 'rejected', 'rejected', userOf(req).username, reason)));
  });

  app.post('/api/quotes/:id/cancel', (req, res) => {
    const record = loadQuote(req, res);
    if (!record) return;
    if (!canDecide(userOf(req).role)) return void forbidden(res);
    if (record.status !== 'approved') return void invalidState(res, record, 'cancelar');
    res.json(toDto(store.transition(record, 'cancelled', 'cancelled', userOf(req).username)));
  });

  // ---- reports
  app.get('/api/reports/summary', (req, res) => {
    const quotes = filterByReportQuery(req, res);
    if (!quotes) return;
    const group = (key: (q: QuoteRecord) => string) => {
      const out: Record<string, { count: number; valueCents: number }> = {};
      for (const q of quotes) {
        const bucket = (out[key(q)] ??= { count: 0, valueCents: 0 });
        bucket.count += 1;
        bucket.valueCents += q.calc.headlineCents;
      }
      return out;
    };
    const sumOf = (status: QuoteStatus) => quotes.filter((q) => q.status === status).reduce((s, q) => s + q.calc.headlineCents, 0);
    res.json({
      totalCount: quotes.length,
      approvedValueCents: sumOf('approved'),
      pendingValueCents: sumOf('pending_approval'),
      byStatus: group((q) => q.status),
      byCategory: group((q) => q.input.category),
      byType: group((q) => q.input.type),
    });
  });

  app.get('/api/reports/export.csv', (req, res) => {
    const quotes = filterByReportQuery(req, res);
    if (!quotes) return;
    const header = ['codigo', 'tipo', 'categoria', 'cliente', 'status', 'valor', 'criado_por', 'criado_em'];
    const rows = quotes
      .sort((a, b) => a.id - b.id)
      .map((q) =>
        [
          q.code,
          q.input.type === 'lease' ? 'Locação' : 'Venda',
          findCategory(q.input.category)!.name,
          findCustomer(q.input.customerId)!.name,
          STATUS_LABEL[q.status],
          decimal(q.calc.headlineCents),
          q.createdBy,
          q.createdAt,
        ]
          .map(csvCell)
          .join(';'),
      );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="cotacoes.csv"');
    res.send(`\uFEFF${[header.join(';'), ...rows].join('\r\n')}\r\n`);
  });

  // unknown API routes
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Rota não encontrada.' }));

  // static front end (hash routing, so no history fallback is needed)
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  app.use(express.static(publicDir));

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid_json', message: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'too_large', message: 'Requisição grande demais.' });
    console.error(err);
    res.status(500).json({ error: 'internal', message: 'Erro interno.' });
  });

  return app;
}
