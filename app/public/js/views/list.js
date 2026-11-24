import { navigate } from '../nav.js';
import { api, getCatalog } from '../session.js';
import { STATUS_LABEL, TYPE_LABEL, fmtDate, h, money } from '../ui.js';

const PAGE_SIZE = 10;

// The search box is rebuilt on every render; this keeps the caret in it while the user is typing.
let refocusSearch = false;

function select(id, label, options, value) {
  const el = h('select', { id }, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
  return h('div', { class: 'field' }, h('label', { for: id }, label), el);
}

export async function listView({ query }) {
  const catalog = await getCatalog();
  const filters = {
    status: query.get('status') ?? '',
    category: query.get('category') ?? '',
    type: query.get('type') ?? '',
    q: query.get('q') ?? '',
  };
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1);

  const go = (patch) => navigate('/quotes', { ...filters, page: '1', ...patch });

  const search = h('input', { id: 'f-q', type: 'search', placeholder: 'Código ou cliente', value: filters.q, maxlength: '60' });
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refocusSearch = true;
      go({ q: search.value.trim() });
    }, 300);
  });
  if (refocusSearch) {
    refocusSearch = false;
    // The view is mounted only after its data arrives, so wait until the box is really in the page.
    let frames = 0;
    const focusWhenMounted = () => {
      if (search.isConnected) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      } else if (frames++ < 120) requestAnimationFrame(focusWhenMounted);
    };
    requestAnimationFrame(focusWhenMounted);
  }

  const bar = h(
    'form',
    { class: 'filters', 'data-testid': 'filters', onsubmit: (e) => e.preventDefault() },
    select('f-status', 'Status', [['', 'Todos'], ...Object.entries(STATUS_LABEL)], filters.status),
    select('f-category', 'Categoria', [['', 'Todas'], ...catalog.categories.map((c) => [c.id, c.name])], filters.category),
    select('f-type', 'Tipo', [['', 'Todos'], ...Object.entries(TYPE_LABEL)], filters.type),
    h('div', { class: 'field' }, h('label', { for: 'f-q' }, 'Buscar'), search),
    h('button', { type: 'button', class: 'btn', onclick: () => navigate('/quotes') }, 'Limpar filtros'),
  );
  bar.querySelector('#f-status').addEventListener('change', (e) => go({ status: e.target.value }));
  bar.querySelector('#f-category').addEventListener('change', (e) => go({ category: e.target.value }));
  bar.querySelector('#f-type').addEventListener('change', (e) => go({ type: e.target.value }));

  const wrapper = h('div', { 'data-testid': 'quotes-table', 'data-state': 'loading' });
  const count = h('p', { class: 'muted', 'data-testid': 'total-count' });
  const pager = h('nav', { class: 'pager', 'aria-label': 'Paginação' });

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);

  try {
    const data = await api(`/api/quotes?${params}`);
    count.textContent = `${data.total} ${data.total === 1 ? 'cotação' : 'cotações'}`;
    if (data.items.length === 0) {
      wrapper.append(h('div', { class: 'empty', 'data-testid': 'empty-state' }, 'Nenhuma cotação encontrada.'));
    } else {
      wrapper.append(
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, ['Código', 'Cliente', 'Tipo', 'Categoria', 'Valor total', 'Status', 'Atualizada em'].map((t) => h('th', { scope: 'col' }, t)))),
          h(
            'tbody',
            {},
            data.items.map((q) =>
              h(
                'tr',
                { 'data-testid': 'quote-row', 'data-id': q.id, 'data-code': q.code, 'data-status': q.status },
                h('td', { 'data-col': 'code' }, h('a', { href: `#/quotes/${q.id}` }, q.code)),
                h('td', { 'data-col': 'customer' }, q.customerName),
                h('td', { 'data-col': 'type' }, TYPE_LABEL[q.type]),
                h('td', { 'data-col': 'category' }, catalog.categories.find((c) => c.id === q.category)?.name ?? q.category),
                h('td', { 'data-col': 'value', 'data-cents': String(q.headlineCents), class: 'num' }, money(q.headlineCents)),
                h('td', { 'data-col': 'status' }, h('span', { class: 'badge', 'data-status': q.status }, STATUS_LABEL[q.status])),
                h('td', { 'data-col': 'updated' }, fmtDate(q.updatedAt)),
              ),
            ),
          ),
        ),
      );
    }
    pager.append(
      h('button', { type: 'button', class: 'btn', disabled: data.page <= 1, onclick: () => go({ page: String(data.page - 1) }) }, 'Anterior'),
      h('span', { 'data-testid': 'page-info' }, `Página ${data.page} de ${data.totalPages}`),
      h('button', { type: 'button', class: 'btn', disabled: data.page >= data.totalPages, onclick: () => go({ page: String(data.page + 1) }) }, 'Próxima'),
    );
    wrapper.dataset.state = 'ready';
  } catch (e) {
    if (e.status === 401) throw e;
    wrapper.dataset.state = 'error';
    wrapper.append(h('div', { class: 'error', role: 'alert', 'data-testid': 'list-error' }, 'Não foi possível carregar as cotações.'));
  }

  return h('section', {}, h('h1', {}, 'Cotações'), bar, count, wrapper, pager);
}
