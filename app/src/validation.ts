import {
  LEASE_TERMS,
  MAX_DISCOUNT_BPS,
  MAX_DISTINCT_ITEMS,
  MAX_NOTES_LENGTH,
  SALE_INSTALLMENTS,
  findCategory,
  findCustomer,
  findItem,
} from './catalog.js';
import type { PaymentCondition, QuoteInput } from './types.js';

export type FieldErrors = Record<string, string>;
export type ParseResult = { ok: true; value: QuoteInput } | { ok: false; fields: FieldErrors };

const PAYMENT_CONDITIONS: readonly PaymentCondition[] = ['cash', 'extended', 'installments'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an untrusted request body and returns a normalized quote input, or per-field messages (pt-BR). */
export function parseQuoteInput(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, fields: { body: 'Corpo da requisição inválido.' } };
  const fields: FieldErrors = {};

  const type = body.type;
  if (type !== 'lease' && type !== 'sale') fields.type = 'Tipo inválido.';

  const category = typeof body.category === 'string' ? findCategory(body.category) : undefined;
  if (!category) fields.category = 'Selecione uma categoria.';

  const customerId = body.customerId;
  if (typeof customerId !== 'string' || !findCustomer(customerId)) fields.customerId = 'Selecione um cliente.';

  const discountBps = body.discountBps;
  if (typeof discountBps !== 'number' || !Number.isInteger(discountBps) || discountBps < 0 || discountBps > MAX_DISCOUNT_BPS) {
    fields.discountBps = 'Desconto deve estar entre 0% e 30%.';
  }

  const notesRaw = body.notes ?? '';
  let notes = '';
  if (typeof notesRaw !== 'string') fields.notes = 'Observações inválidas.';
  else {
    notes = notesRaw.trim();
    if (notes.length > MAX_NOTES_LENGTH) fields.notes = `Observações devem ter no máximo ${MAX_NOTES_LENGTH} caracteres.`;
  }

  // items
  const items: QuoteInput['items'] = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    fields.items = 'Adicione ao menos um item.';
  } else if (body.items.length > MAX_DISTINCT_ITEMS) {
    fields.items = `Máximo de ${MAX_DISTINCT_ITEMS} itens distintos.`;
  } else {
    const seen = new Set<string>();
    for (const raw of body.items as unknown[]) {
      if (!isRecord(raw) || typeof raw.sku !== 'string') {
        fields.items ??= 'Item inválido.';
        continue;
      }
      const item = findItem(raw.sku);
      if (!item) {
        fields.items ??= `Item ${raw.sku} não existe no catálogo.`;
        continue;
      }
      if (category && item.category !== category.id) {
        fields.items ??= `Item ${item.sku} não pertence à categoria ${category.name}.`;
        continue;
      }
      if (seen.has(item.sku)) {
        fields.items ??= `Item ${item.sku} repetido.`;
        continue;
      }
      seen.add(item.sku);
      const max = category?.maxQtyPerLine ?? 0;
      if (typeof raw.qty !== 'number' || !Number.isInteger(raw.qty) || raw.qty < 1 || (category && raw.qty > max)) {
        fields.items ??= `Quantidade de ${item.sku} deve estar entre 1 e ${max}.`;
        continue;
      }
      items.push({ sku: item.sku, qty: raw.qty });
    }
  }

  let termMonths: number | null = null;
  let addOn = false;
  let paymentCondition: PaymentCondition | null = null;
  let installments: number | null = null;

  if (type === 'lease') {
    const term = body.termMonths;
    if (typeof term !== 'number' || !(LEASE_TERMS as readonly number[]).includes(term)) {
      fields.termMonths = 'Prazo inválido. Use 12, 24, 36, 48 ou 60 meses.';
    } else termMonths = term;
    if (body.addOn !== undefined && typeof body.addOn !== 'boolean') fields.addOn = 'Valor inválido para o adicional.';
    else addOn = body.addOn === true;
  } else if (type === 'sale') {
    const pc = body.paymentCondition;
    if (typeof pc !== 'string' || !(PAYMENT_CONDITIONS as readonly string[]).includes(pc)) {
      fields.paymentCondition = 'Condição de pagamento inválida.';
    } else {
      paymentCondition = pc as PaymentCondition;
      if (pc === 'installments') {
        const n = body.installments;
        if (typeof n !== 'number' || !(SALE_INSTALLMENTS as readonly number[]).includes(n)) {
          fields.installments = 'Parcelas devem ser 2 ou 3.';
        } else installments = n;
      } else installments = 1;
    }
    if (body.addOn === true) fields.addOn = 'O adicional só se aplica à locação.';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    value: {
      type: type as QuoteInput['type'],
      category: category!.id,
      customerId: customerId as string,
      items,
      discountBps: discountBps as number,
      notes,
      termMonths,
      addOn,
      paymentCondition,
      installments,
    },
  };
}
