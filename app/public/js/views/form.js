import { navigate } from '../nav.js';
import { ApiError, api, getCatalog } from '../session.js';
import { buildSummary } from '../summary.js';
import { PAYMENT_LABEL, bpsToInput, h, inputToBps, money, toast } from '../ui.js';
import { forbiddenView, quoteNotFoundView } from './misc.js';

const ERROR_FIELDS = ['customerId', 'type', 'category', 'items', 'termMonths', 'addOn', 'paymentCondition', 'installments', 'discountBps', 'notes'];

export async function formView({ params, user }) {
  const catalog = await getCatalog();
  const id = params[0] ? Number(params[0]) : null;

  let existing = null;
  if (id) {
    try {
      existing = await api(`/api/quotes/${id}`);
    } catch (e) {
      if (e.status === 404) return quoteNotFoundView();
      throw e;
    }
    if (user.role !== 'admin' && existing.createdBy !== user.username) return forbiddenView();
    if (!['draft', 'rejected'].includes(existing.status)) {
      return h(
        'section',
        {},
        h('h1', {}, `Editar cotação ${existing.code}`),
        h('p', { 'data-testid': 'not-editable' }, 'Esta cotação não pode mais ser editada.'),
        h('a', { href: `#/quotes/${id}` }, 'Voltar para a cotação'),
      );
    }
  }

  const model = existing
    ? {
        type: existing.type,
        category: existing.category,
        customerId: existing.customerId,
        items: existing.items.map((i) => ({ sku: i.sku, qty: i.qty })),
        termMonths: existing.termMonths ?? 36,
        addOn: existing.addOn,
        paymentCondition: existing.paymentCondition ?? 'cash',
        installments: existing.installments > 1 ? existing.installments : 2,
        discountText: bpsToInput(existing.discountBps),
        notes: existing.notes,
      }
    : { type: 'lease', category: 'notebooks', customerId: '', items: [], termMonths: 36, addOn: false, paymentCondition: 'cash', installments: 2, discountText: '0', notes: '' };

  const categoryOf = () => catalog.categories.find((c) => c.id === model.category);
  const itemInfo = (sku) => catalog.items.find((i) => i.sku === sku);

  // ---------------------------------------------------------------- errors
  const errorEl = Object.fromEntries(
    ERROR_FIELDS.map((key) => [key, h('p', { class: 'error', id: `err-${key}`, role: 'alert', 'data-testid': `error-${key}`, hidden: true })]),
  );
  const banner = h('div', { class: 'error banner', role: 'alert', 'data-testid': 'form-error', hidden: true });

  function clearErrors() {
    banner.hidden = true;
    for (const el of Object.values(errorEl)) {
      el.hidden = true;
      el.textContent = '';
    }
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  }

  function setErrors(fields) {
    for (const [key, message] of Object.entries(fields)) {
      const el = errorEl[key];
      if (!el) {
        banner.textContent = message;
        banner.hidden = false;
        continue;
      }
      el.textContent = message;
      el.hidden = false;
      const input = el.parentElement?.querySelector('input, select, textarea');
      if (input) input.setAttribute('aria-invalid', 'true');
    }
    form.querySelector('[aria-invalid="true"]')?.focus();
  }

  // ---------------------------------------------------------------- fields
  const customer = h(
    'select',
    { id: 'f-customer', 'aria-describedby': 'err-customerId', onchange: (e) => ((model.customerId = e.target.value), schedulePreview()) },
    h('option', { value: '' }, 'Selecione um cliente'),
    catalog.customers.map((c) => h('option', { value: c.id, selected: c.id === model.customerId }, `${c.name} (${c.uf})`)),
  );

  const typeRadio = (value, label) =>
    h(
      'label',
      { class: 'radio' },
      h('input', {
        type: 'radio',
        name: 'type',
        id: `f-type-${value}`,
        value,
        checked: model.type === value,
        disabled: Boolean(existing),
        onchange: () => {
          model.type = value;
          refreshVisibility();
          schedulePreview();
        },
      }),
      label,
    );

  const category = h(
    'select',
    {
      id: 'f-category',
      disabled: Boolean(existing),
      onchange: (e) => {
        model.category = e.target.value;
        model.items = [];
        model.addOn = false;
        refreshItemOptions();
        refreshItems();
        refreshAddOn();
        schedulePreview();
      },
    },
    catalog.categories.map((c) => h('option', { value: c.id, selected: c.id === model.category }, c.name)),
  );

  const term = h(
    'select',
    { id: 'f-term', onchange: (e) => ((model.termMonths = Number(e.target.value)), schedulePreview()) },
    catalog.leaseTerms.map((t) => h('option', { value: String(t), selected: t === model.termMonths }, `${t} meses`)),
  );

  const addOnBox = h('input', { type: 'checkbox', id: 'f-addon', checked: model.addOn, onchange: (e) => ((model.addOn = e.target.checked), schedulePreview()) });
  const addOnLabel = h('label', { class: 'check', for: 'f-addon' });
  function refreshAddOn() {
    const a = categoryOf().addOn;
    addOnBox.checked = model.addOn;
    addOnLabel.replaceChildren(`${a.name} (${a.hint})`);
  }

  const payment = h(
    'select',
    {
      id: 'f-payment',
      onchange: (e) => {
        model.paymentCondition = e.target.value;
        refreshVisibility();
        schedulePreview();
      },
    },
    Object.entries(PAYMENT_LABEL).map(([v, t]) => h('option', { value: v, selected: v === model.paymentCondition }, t)),
  );
  const installments = h(
    'select',
    { id: 'f-installments', onchange: (e) => ((model.installments = Number(e.target.value)), schedulePreview()) },
    catalog.installmentOptions.map((n) => h('option', { value: String(n), selected: n === model.installments }, `${n}x`)),
  );

  const discount = h('input', {
    id: 'f-discount',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    value: model.discountText,
    'aria-describedby': 'err-discountBps',
    oninput: (e) => ((model.discountText = e.target.value), schedulePreview()),
  });

  const notes = h('textarea', { id: 'f-notes', rows: '3', 'aria-describedby': 'err-notes' });
  notes.value = model.notes;
  const counter = h('span', { class: 'muted', 'data-testid': 'notes-counter' });
  const updateCounter = () => (counter.textContent = `${notes.value.length}/${catalog.limits.maxNotesLength}`);
  notes.addEventListener('input', () => {
    model.notes = notes.value;
    updateCounter();
  });
  updateCounter();

  // ---------------------------------------------------------------- items
  const itemSelect = h('select', { id: 'f-item' });
  const qtyInput = h('input', { id: 'f-qty', type: 'number', min: '1', step: '1', value: '1' });
  const itemsHost = h('div', { 'data-testid': 'items' });

  function refreshItemOptions() {
    itemSelect.replaceChildren(
      h('option', { value: '' }, 'Selecione um item'),
      ...catalog.items.filter((i) => i.category === model.category).map((i) => h('option', { value: i.sku }, `${i.sku} · ${i.name} · ${money(i.unitCents)}`)),
    );
  }

  function addItem() {
    errorEl.items.hidden = true;
    const sku = itemSelect.value;
    const qty = Number(qtyInput.value);
    const max = categoryOf().maxQtyPerLine;
    if (!sku) return setErrors({ items: 'Selecione um item.' });
    const current = model.items.find((i) => i.sku === sku);
    const total = (current?.qty ?? 0) + qty;
    if (!Number.isInteger(qty) || qty < 1 || total > max) return setErrors({ items: `Quantidade de ${sku} deve estar entre 1 e ${max}.` });
    if (current) current.qty = total;
    else model.items.push({ sku, qty });
    itemSelect.value = '';
    qtyInput.value = '1';
    refreshItems();
    schedulePreview();
  }

  function refreshItems() {
    if (model.items.length === 0) {
      itemsHost.replaceChildren(h('p', { class: 'muted', 'data-testid': 'items-empty' }, 'Nenhum item adicionado.'));
      return;
    }
    const body = h('tbody');
    for (const line of model.items) {
      const info = itemInfo(line.sku);
      const lineTotal = h('td', { class: 'num', 'data-col': 'line-total' });
      const paint = () => {
        const cents = Number.isInteger(line.qty) && line.qty > 0 ? info.unitCents * line.qty : 0;
        lineTotal.dataset.cents = String(cents);
        lineTotal.textContent = money(cents);
      };
      paint();
      const qty = h('input', {
        type: 'number',
        min: '1',
        step: '1',
        value: String(line.qty),
        'aria-label': `Quantidade de ${line.sku}`,
        oninput: (e) => {
          line.qty = e.target.value === '' ? 0 : Number(e.target.value);
          paint();
          schedulePreview();
        },
      });
      body.append(
        h(
          'tr',
          { 'data-testid': 'item-row', 'data-sku': line.sku },
          h('td', { 'data-col': 'sku' }, line.sku),
          h('td', { 'data-col': 'name' }, info.name),
          h('td', { class: 'num', 'data-col': 'unit' }, money(info.unitCents)),
          h('td', { 'data-col': 'qty' }, qty),
          lineTotal,
          h(
            'td',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-link',
                'aria-label': `Remover ${line.sku}`,
                onclick: () => {
                  model.items = model.items.filter((i) => i.sku !== line.sku);
                  refreshItems();
                  schedulePreview();
                },
              },
              'Remover',
            ),
          ),
        ),
      );
    }
    itemsHost.replaceChildren(
      h('table', {}, h('thead', {}, h('tr', {}, ['SKU', 'Item', 'Preço unitário', 'Quantidade', 'Total', ''].map((t) => h('th', { scope: 'col' }, t)))), body),
    );
  }

  // ---------------------------------------------------------------- preview
  const summaryHost = h('div', { 'data-testid': 'summary-host' });
  let lastCalc = null;
  let seq = 0;
  let timer;

  const mount = (calc, state, message) => summaryHost.replaceChildren(buildSummary(calc, state, message));

  const payload = () => {
    const bps = inputToBps(model.discountText);
    const base = {
      type: model.type,
      category: model.category,
      customerId: model.customerId,
      items: model.items.map(({ sku, qty }) => ({ sku, qty })),
      discountBps: Number.isNaN(bps) ? -1 : bps,
      notes: model.notes,
    };
    if (model.type === 'lease') return { ...base, termMonths: model.termMonths, addOn: model.addOn };
    return { ...base, paymentCondition: model.paymentCondition, installments: model.paymentCondition === 'installments' ? model.installments : undefined };
  };

  function schedulePreview() {
    clearTimeout(timer);
    mount(lastCalc, 'loading');
    timer = setTimeout(async () => {
      const mine = ++seq;
      if (Number.isNaN(inputToBps(model.discountText))) {
        lastCalc = null;
        return mount(null, 'empty', 'Informe um desconto válido para ver o cálculo.');
      }
      try {
        const result = await api('/api/quotes/preview', { method: 'POST', body: payload() });
        if (mine !== seq) return;
        lastCalc = result.calc;
        mount(result.calc, 'ready');
      } catch (e) {
        if (mine !== seq) return;
        lastCalc = null;
        if (e.status === 400) mount(null, 'empty');
        else if (e.status !== 401) mount(null, 'error', 'Não foi possível calcular agora.');
      }
    }, 150);
  }

  // ---------------------------------------------------------------- save / submit
  const buttons = {
    draft: h('button', { type: 'button', class: 'btn', 'data-testid': 'save-draft' }, 'Salvar rascunho'),
    submit: h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'submit' }, 'Enviar cotação'),
  };
  let busy = false;
  const setBusy = (value, active) => {
    busy = value;
    for (const [key, btn] of Object.entries(buttons)) {
      btn.disabled = value;
      btn.textContent = value && key === active ? 'Salvando…' : key === 'draft' ? 'Salvar rascunho' : 'Enviar cotação';
    }
  };

  async function save() {
    clearErrors();
    try {
      return id
        ? await api(`/api/quotes/${id}`, { method: 'PUT', body: { ...payload(), version: existing.version } })
        : await api('/api/quotes', { method: 'POST', body: payload() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.fields) setErrors(e.fields);
      else if (e instanceof ApiError && e.status !== 401) {
        banner.textContent = e.message;
        banner.hidden = false;
      }
      return null;
    }
  }

  async function run(kind) {
    if (busy) return;
    setBusy(true, kind);
    try {
      const saved = await save();
      if (!saved) return;
      if (kind === 'draft') {
        toast('Cotação salva.');
        navigate(`/quotes/${saved.id}`);
        return;
      }
      try {
        const sent = await api(`/api/quotes/${saved.id}/submit`, { method: 'POST' });
        toast(sent.status === 'approved' ? 'Cotação aprovada automaticamente.' : 'Cotação enviada para aprovação.');
      } catch (e) {
        if (e.status !== 401) toast(e.message, 'error');
      }
      navigate(`/quotes/${saved.id}`);
    } finally {
      setBusy(false);
    }
  }
  buttons.draft.addEventListener('click', () => run('draft'));
  buttons.submit.addEventListener('click', () => run('submit'));

  // ---------------------------------------------------------------- layout
  const leaseFields = h(
    'div',
    { 'data-testid': 'lease-fields' },
    h('div', { class: 'field' }, h('label', { for: 'f-term' }, 'Prazo (meses)'), term, errorEl.termMonths),
    h('div', { class: 'field' }, h('div', { class: 'check-row' }, addOnBox, addOnLabel), errorEl.addOn),
  );
  const saleFields = h(
    'div',
    { 'data-testid': 'sale-fields' },
    h('div', { class: 'field' }, h('label', { for: 'f-payment' }, 'Condição de pagamento'), payment, errorEl.paymentCondition),
  );
  const installmentsField = h('div', { class: 'field', 'data-testid': 'installments-field' }, h('label', { for: 'f-installments' }, 'Parcelas'), installments, errorEl.installments);

  function refreshVisibility() {
    leaseFields.hidden = model.type !== 'lease';
    saleFields.hidden = model.type !== 'sale';
    installmentsField.hidden = !(model.type === 'sale' && model.paymentCondition === 'installments');
  }

  const form = h(
    'form',
    { 'data-testid': 'quote-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    banner,
    h('div', { class: 'field' }, h('label', { for: 'f-customer' }, 'Cliente'), customer, errorEl.customerId),
    h('fieldset', { class: 'field' }, h('legend', {}, 'Tipo'), typeRadio('lease', 'Locação'), typeRadio('sale', 'Venda'), errorEl.type),
    h('div', { class: 'field' }, h('label', { for: 'f-category' }, 'Categoria'), category, errorEl.category),
    h(
      'fieldset',
      { class: 'field items' },
      h('legend', {}, 'Itens'),
      h(
        'div',
        { class: 'add-item' },
        h('div', { class: 'field' }, h('label', { for: 'f-item' }, 'Item'), itemSelect),
        h('div', { class: 'field narrow' }, h('label', { for: 'f-qty' }, 'Quantidade'), qtyInput),
        h('button', { type: 'button', class: 'btn', onclick: addItem }, 'Adicionar item'),
      ),
      itemsHost,
      errorEl.items,
    ),
    leaseFields,
    saleFields,
    installmentsField,
    h('div', { class: 'field narrow' }, h('label', { for: 'f-discount' }, 'Desconto (%)'), discount, errorEl.discountBps),
    h('div', { class: 'field' }, h('label', { for: 'f-notes' }, 'Observações'), notes, counter, errorEl.notes),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => navigate(id ? `/quotes/${id}` : '/quotes') }, 'Cancelar'),
      buttons.draft,
      buttons.submit,
    ),
  );

  refreshItemOptions();
  refreshItems();
  refreshAddOn();
  refreshVisibility();
  mount(null, 'empty');
  if (model.items.length > 0 && model.customerId) schedulePreview();

  return h(
    'section',
    {},
    h('h1', {}, existing ? `Editar cotação ${existing.code}` : 'Nova cotação'),
    h('div', { class: 'form-layout' }, form, summaryHost),
  );
}
