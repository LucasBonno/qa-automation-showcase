import { navigate } from '../nav.js';
import { api, downloadFile, getCatalog } from '../session.js';
import { STATUS_LABEL, TYPE_LABEL, h, money, toast } from '../ui.js';

const card = (key, label, value, cents) =>
  h('div', { class: 'card stat', 'data-testid': `card-${key}`, 'data-cents': cents === undefined ? false : String(cents) }, h('span', { class: 'muted' }, label), h('strong', {}, value));

function groupTable(testid, title, rows, data) {
  return h(
    'section',
    {},
    h('h2', {}, title),
    h(
      'table',
      { 'data-testid': testid },
      h('thead', {}, h('tr', {}, ['Grupo', 'Cotações', 'Valor'].map((t) => h('th', { scope: 'col' }, t)))),
      h(
        'tbody',
        {},
        rows.map(([key, label]) => {
          const bucket = data[key] ?? { count: 0, valueCents: 0 };
          return h(
            'tr',
            { 'data-key': key },
            h('td', {}, label),
            h('td', { 'data-col': 'count', class: 'num' }, String(bucket.count)),
            h('td', { 'data-col': 'value', class: 'num', 'data-cents': String(bucket.valueCents) }, money(bucket.valueCents)),
          );
        }),
      ),
    ),
  );
}

export async function reportsView({ query }) {
  const catalog = await getCatalog();
  const filters = { category: query.get('category') ?? '', type: query.get('type') ?? '' };
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const summary = await api(`/api/reports/summary${qs ? `?${qs}` : ''}`);

  const select = (id, label, options, value, key) => {
    const el = h('select', { id }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
    el.addEventListener('change', () => navigate('/reports', { ...filters, [key]: el.value }));
    return h('div', { class: 'field' }, h('label', { for: id }, label), el);
  };

  let exporting = false;
  const exportButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onclick: async () => {
        if (exporting) return;
        exporting = true;
        exportButton.disabled = true;
        try {
          await downloadFile(`/api/reports/export.csv${qs ? `?${qs}` : ''}`, 'cotacoes.csv');
        } catch (e) {
          if (e.status !== 401) toast('Não foi possível exportar o arquivo.', 'error');
        } finally {
          exporting = false;
          exportButton.disabled = false;
        }
      },
    },
    'Exportar CSV',
  );

  return h(
    'section',
    {},
    h('h1', {}, 'Relatórios'),
    h(
      'form',
      { class: 'filters', onsubmit: (e) => e.preventDefault() },
      select('r-category', 'Categoria', [['', 'Todas'], ...catalog.categories.map((c) => [c.id, c.name])], filters.category, 'category'),
      select('r-type', 'Tipo', [['', 'Todos'], ...Object.entries(TYPE_LABEL)], filters.type, 'type'),
      exportButton,
    ),
    h(
      'div',
      { class: 'cards' },
      card('total-count', 'Cotações', String(summary.totalCount)),
      card('approved-value', 'Valor aprovado', money(summary.approvedValueCents), summary.approvedValueCents),
      card('pending-value', 'Aguardando aprovação', money(summary.pendingValueCents), summary.pendingValueCents),
    ),
    groupTable('report-by-status', 'Por status', Object.entries(STATUS_LABEL), summary.byStatus),
    groupTable('report-by-category', 'Por categoria', catalog.categories.map((c) => [c.id, c.name]), summary.byCategory),
    groupTable('report-by-type', 'Por tipo', Object.entries(TYPE_LABEL), summary.byType),
  );
}
