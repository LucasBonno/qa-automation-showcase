import { navigate } from '../nav.js';
import { api, canDecide, canWrite, getCatalog } from '../session.js';
import { buildSummary } from '../summary.js';
import { ACTION_LABEL, PAYMENT_LABEL, STATUS_LABEL, TYPE_LABEL, fmtDate, h, money, openDialog, percent, toast } from '../ui.js';
import { quoteNotFoundView } from './misc.js';

const info = (key, label, value) => h('div', { class: 'row' }, h('dt', {}, label), h('dd', { 'data-testid': `info-${key}` }, value));

export async function detailView({ params, user }) {
  const id = Number(params[0]);
  const catalog = await getCatalog();
  let q;
  try {
    q = await api(`/api/quotes/${id}`);
  } catch (e) {
    if (e.status === 404) return quoteNotFoundView();
    throw e;
  }

  const category = catalog.categories.find((c) => c.id === q.category);
  const editable = q.status === 'draft' || q.status === 'rejected';
  const mine = user.role === 'admin' || q.createdBy === user.username;
  let busy = false;

  /** Runs one workflow action; the buttons stay disabled until it finishes (double-click safe). */
  async function act(buttonsHost, request, onDone) {
    if (busy) return;
    busy = true;
    for (const b of buttonsHost.querySelectorAll('button')) b.disabled = true;
    try {
      const result = await request();
      onDone(result);
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error');
      busy = false;
      for (const b of buttonsHost.querySelectorAll('button')) b.disabled = false;
    }
  }

  const actions = h('div', { class: 'actions', 'data-testid': 'actions' });
  const refresh = () => navigate(`/quotes/${id}`);

  if (canWrite(user) && mine && editable) {
    actions.append(h('a', { class: 'btn', href: `#/quotes/${id}/edit` }, 'Editar'));
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () =>
            act(
              actions,
              () => api(`/api/quotes/${id}/submit`, { method: 'POST' }),
              (r) => {
                toast(r.status === 'approved' ? 'Cotação aprovada automaticamente.' : 'Cotação enviada para aprovação.');
                refresh();
              },
            ),
        },
        'Enviar cotação',
      ),
    );
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          onclick: () =>
            openDialog({
              title: 'Excluir cotação?',
              body: h('p', {}, `A cotação ${q.code} será excluída. Esta ação não pode ser desfeita.`),
              confirmLabel: 'Confirmar exclusão',
              danger: true,
              onConfirm: async () => {
                await api(`/api/quotes/${id}`, { method: 'DELETE' });
                toast('Cotação excluída.');
                navigate('/quotes');
              },
            }),
        },
        'Excluir',
      ),
    );
  }

  if (canWrite(user)) {
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () =>
            act(
              actions,
              () => api(`/api/quotes/${id}/duplicate`, { method: 'POST' }),
              (copy) => {
                toast('Cotação duplicada.');
                navigate(`/quotes/${copy.id}`);
              },
            ),
        },
        'Duplicar',
      ),
    );
  }

  if (canDecide(user) && q.status === 'pending_approval') {
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () =>
            act(
              actions,
              () => api(`/api/quotes/${id}/approve`, { method: 'POST' }),
              () => {
                toast('Cotação aprovada.');
                refresh();
              },
            ),
        },
        'Aprovar',
      ),
    );
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          onclick: () => {
            const reason = h('textarea', { id: 'reject-reason', rows: '3' });
            openDialog({
              title: 'Rejeitar cotação',
              body: h('div', { class: 'field' }, h('label', { for: 'reject-reason' }, 'Motivo da rejeição'), reason),
              confirmLabel: 'Confirmar rejeição',
              danger: true,
              onConfirm: async () => {
                await api(`/api/quotes/${id}/reject`, { method: 'POST', body: { reason: reason.value } });
                toast('Cotação rejeitada.');
                refresh();
              },
            });
          },
        },
        'Rejeitar',
      ),
    );
  }

  if (canDecide(user) && q.status === 'approved') {
    actions.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          onclick: () =>
            openDialog({
              title: 'Cancelar cotação?',
              body: h('p', {}, `A cotação ${q.code} será marcada como cancelada.`),
              confirmLabel: 'Confirmar cancelamento',
              danger: true,
              onConfirm: async () => {
                await api(`/api/quotes/${id}/cancel`, { method: 'POST' });
                toast('Cotação cancelada.');
                refresh();
              },
            }),
        },
        'Cancelar cotação',
      ),
    );
  }

  const lease = q.type === 'lease';
  const details = h(
    'dl',
    { class: 'info' },
    info('customer', 'Cliente', `${q.customerName} (${q.customerUf})`),
    info('type', 'Tipo', TYPE_LABEL[q.type]),
    info('category', 'Categoria', category?.name ?? q.category),
    lease && info('term', 'Prazo', `${q.termMonths} meses`),
    lease && info('addon', 'Adicional', q.addOn ? `Sim (${category.addOn.name})` : 'Não'),
    !lease && info('payment', 'Pagamento', q.paymentCondition === 'installments' ? `Parcelado em ${q.installments}x` : PAYMENT_LABEL[q.paymentCondition]),
    info('discount', 'Desconto', percent(q.discountBps)),
    info('notes', 'Observações', q.notes || '—'),
    q.rejectionReason && info('rejection-reason', 'Motivo da rejeição', q.rejectionReason),
    info('created-by', 'Criada por', q.createdBy),
    info('created-at', 'Criada em', fmtDate(q.createdAt)),
    info('updated-by', 'Atualizada por', q.updatedBy),
    info('updated-at', 'Atualizada em', fmtDate(q.updatedAt)),
    info('version', 'Versão', String(q.version)),
  );

  const itemsTable = h(
    'table',
    { 'data-testid': 'items' },
    h('thead', {}, h('tr', {}, ['SKU', 'Item', 'Quantidade', 'Preço unitário', 'Total'].map((t) => h('th', { scope: 'col' }, t)))),
    h(
      'tbody',
      {},
      q.items.map((i) =>
        h(
          'tr',
          { 'data-testid': 'item-row', 'data-sku': i.sku },
          h('td', { 'data-col': 'sku' }, i.sku),
          h('td', { 'data-col': 'name' }, i.name),
          h('td', { 'data-col': 'qty', class: 'num' }, String(i.qty)),
          h('td', { 'data-col': 'unit', class: 'num', 'data-cents': String(i.unitCents) }, money(i.unitCents)),
          h('td', { 'data-col': 'line-total', class: 'num', 'data-cents': String(i.lineCents) }, money(i.lineCents)),
        ),
      ),
    ),
  );

  const history = h(
    'ol',
    { class: 'history', 'data-testid': 'history' },
    q.history.map((entry) =>
      h(
        'li',
        { 'data-action': entry.action },
        `${fmtDate(entry.at)} · ${entry.by} · ${ACTION_LABEL[entry.action]}`,
        entry.from ? ` (${STATUS_LABEL[entry.from]} → ${STATUS_LABEL[entry.to]})` : '',
        entry.note ? ` · ${entry.note}` : '',
      ),
    ),
  );

  return h(
    'section',
    {},
    h('div', { class: 'title-row' }, h('h1', {}, `Cotação ${q.code}`), h('span', { class: 'badge', 'data-testid': 'status', 'data-status': q.status }, STATUS_LABEL[q.status])),
    actions,
    h('div', { class: 'form-layout' }, h('div', {}, details, h('h2', {}, 'Itens'), itemsTable, h('h2', {}, 'Histórico'), history), buildSummary(q.calc)),
  );
}
