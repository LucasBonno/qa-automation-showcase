// Small DOM helpers and formatters shared by every view. All text goes through textContent,
// so user-provided strings (customer notes, rejection reasons) can never inject markup.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (cents) => brl.format(cents / 100);

export const percent = (bps) => `${(bps / 100).toFixed(2).replace('.', ',')}%`;

export const bpsToInput = (bps) => (bps / 100).toFixed(2).replace('.', ',');

/** "5", "5,5", "5.25", "12,50" -> basis points. Returns NaN for anything else. */
export function inputToBps(text) {
  const t = String(text).trim();
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number.parseFloat(t.replace(',', '.')) * 100);
}

export const fmtDate = (iso) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

export const STATUS_LABEL = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};
export const TYPE_LABEL = { lease: 'Locação', sale: 'Venda' };
export const PAYMENT_LABEL = { cash: 'À vista', extended: 'Estendido (30 dias)', installments: 'Parcelado' };
export const ACTION_LABEL = {
  created: 'Criada',
  updated: 'Alterada',
  submitted: 'Enviada para aprovação',
  auto_approved: 'Aprovada automaticamente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

const PROPERTY_ATTRS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

/** h('button', { class: 'btn', onclick: fn }, 'Salvar') */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPERTY_ATTRS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function toast(message, kind = 'success') {
  const el = h('div', { class: `toast toast-${kind}`, 'data-testid': 'toast', role: kind === 'error' ? 'alert' : 'status' }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 6000);
}

/** Native <dialog>: focus trap, Esc to close and role="dialog" for free. */
export function openDialog({ title, body, confirmLabel, onConfirm, danger = false }) {
  const dialog = h('dialog', { 'aria-labelledby': 'dlg-title', 'data-testid': 'dialog' });
  const error = h('p', { class: 'error', role: 'alert', 'data-testid': 'dialog-error', hidden: true });
  const confirm = h('button', { type: 'button', class: danger ? 'btn btn-danger' : 'btn btn-primary' }, confirmLabel);
  const cancel = h('button', { type: 'button', class: 'btn' }, 'Voltar');
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', () => setTimeout(() => dialog.remove(), 0));
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    error.hidden = true;
    try {
      const outcome = await onConfirm();
      if (outcome === false) confirm.disabled = false;
      else close();
    } catch (e) {
      error.textContent = e.fields ? Object.values(e.fields).join(' ') : e.message;
      error.hidden = false;
      confirm.disabled = false;
    }
  });
  dialog.append(h('h2', { id: 'dlg-title' }, title), body, error, h('div', { class: 'actions' }, cancel, confirm));
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
