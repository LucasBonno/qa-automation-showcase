import { h, money, percent } from './ui.js';

/**
 * The calculation panel, shared by the form (live preview) and the detail page (stored values).
 * Every amount carries data-cents so tests can compare exact integers as well as the formatted text.
 */
function row(key, label, cents, extraClass = '') {
  return h(
    'div',
    { class: `row ${extraClass}`.trim() },
    h('dt', {}, label),
    h('dd', { 'data-testid': `summary-${key}`, 'data-cents': String(cents) }, money(cents)),
  );
}

function textRow(key, label, text) {
  return h('div', { class: 'row' }, h('dt', {}, label), h('dd', { 'data-testid': `summary-${key}` }, text));
}

function leaseRows(c) {
  return [
    row('subtotal', 'Subtotal', c.subtotalCents),
    row('discount', 'Desconto', c.discountCents),
    row('net', 'Valor líquido', c.netCents),
    c.addOnFinancedCents > 0 && row('addon-financed', 'Adicional financiado', c.addOnFinancedCents),
    row('financed', 'Valor financiado', c.financedCents),
    textRow('rate', 'Taxa mensal', `${percent(c.rateBps)} a.m.`),
    textRow('term', 'Prazo', `${c.termMonths} meses`),
    row('installment', 'Parcela', c.installmentCents),
    c.addOnMonthlyCents > 0 && row('addon-monthly', 'Adicional mensal', c.addOnMonthlyCents),
    row('monthly-total', 'Mensalidade total', c.monthlyTotalCents, 'strong'),
    row('contract-total', 'Total do contrato', c.contractTotalCents, 'strong'),
    row('interest-total', 'Juros totais', c.interestTotalCents),
  ];
}

function saleRows(c) {
  const rows = [
    row('subtotal', 'Subtotal', c.subtotalCents),
    row('discount', 'Desconto', c.discountCents),
    row('net', 'Valor líquido', c.netCents),
    row('freight', `Frete (${percent(c.freightBps)})`, c.freightCents),
    row('taxable-base', 'Base de cálculo', c.taxableBaseCents),
    row('tax', `Impostos (${percent(c.taxBps)})`, c.taxCents),
    row('total', 'Total da venda', c.totalCents, 'strong'),
  ];
  if (c.chargeCents > 0) rows.push(row('charge', 'Encargos financeiros', c.chargeCents));
  rows.push(row('payable', 'Total a pagar', c.payableCents, 'strong'));
  rows.push(row('installment', c.installments > 1 ? 'Valor da parcela' : 'Valor do pagamento', c.installmentCents));
  return rows;
}

export function buildSummary(calc, state = 'ready', message = '') {
  const aside = h('aside', { class: 'summary', 'data-testid': 'summary', 'data-state': calc ? state : 'empty', 'aria-busy': state === 'loading' ? 'true' : 'false' });
  aside.append(h('h2', {}, 'Resumo do cálculo'));
  if (!calc) {
    aside.append(h('p', { class: 'muted', 'data-testid': 'summary-empty' }, message || 'Preencha os campos obrigatórios para ver o cálculo.'));
    return aside;
  }
  aside.append(h('dl', {}, calc.kind === 'lease' ? leaseRows(calc) : saleRows(calc)));
  if (calc.kind === 'sale') {
    aside.append(
      h(
        'ol',
        { class: 'schedule', 'data-testid': 'summary-schedule', 'aria-label': 'Cronograma de pagamento' },
        calc.schedule.map((s) =>
          h('li', { 'data-cents': String(s.amountCents) }, `Parcela ${s.number} · ${s.dueInDays === 0 ? 'à vista' : `${s.dueInDays} dias`} · ${money(s.amountCents)}`),
        ),
      ),
    );
  }
  aside.append(
    h(
      'p',
      { class: `approval ${calc.requiresApproval ? 'needs' : 'free'}`, 'data-testid': 'summary-approval', 'data-required': String(calc.requiresApproval) },
      calc.requiresApproval ? 'Requer aprovação' : 'Sem aprovação necessária',
    ),
  );
  return aside;
}
