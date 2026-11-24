import {
  APPROVAL_DISCOUNT_BPS,
  APPROVAL_VALUE_CENTS,
  EXTENDED_CHARGE_BPS,
  EXTENDED_DAYS,
  INSTALLMENT_RATE_BPS,
  findCategory,
  findCustomer,
  findItem,
  freightBpsFor,
  taxBpsFor,
} from './catalog.js';
import { percentOf, pmt } from './money.js';
import type { Calc, LeaseCalc, QuoteInput, QuoteLine, SaleCalc, ScheduleEntry } from './types.js';

export function priceLines(items: QuoteInput['items']): QuoteLine[] {
  return items.map(({ sku, qty }) => {
    const item = findItem(sku);
    if (!item) throw new Error(`Unknown SKU ${sku}`);
    return { sku, name: item.name, qty, unitCents: item.unitCents, lineCents: item.unitCents * qty };
  });
}

const requiresApproval = (discountBps: number, headlineCents: number): boolean =>
  discountBps > APPROVAL_DISCOUNT_BPS || headlineCents > APPROVAL_VALUE_CENTS;

function calculateLease(input: QuoteInput, lines: QuoteLine[]): LeaseCalc {
  const category = findCategory(input.category)!;
  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const discountCents = percentOf(subtotalCents, input.discountBps);
  const netCents = subtotalCents - discountCents;

  let addOnFinancedCents = 0;
  let addOnMonthlyCents = 0;
  if (input.addOn) {
    const { kind, value } = category.addOn;
    if (kind === 'financed-percent') addOnFinancedCents = percentOf(netCents, value);
    else if (kind === 'financed-per-unit') addOnFinancedCents = value * units;
    else if (kind === 'monthly-per-unit') addOnMonthlyCents = value * units;
    else addOnMonthlyCents = percentOf(netCents, value);
  }

  const termMonths = input.termMonths!;
  const financedCents = netCents + addOnFinancedCents;
  const installmentCents = pmt(financedCents, category.leaseRateBps, termMonths);
  const monthlyTotalCents = installmentCents + addOnMonthlyCents;
  const contractTotalCents = monthlyTotalCents * termMonths;
  const interestTotalCents = installmentCents * termMonths - financedCents;

  return {
    kind: 'lease',
    subtotalCents,
    discountCents,
    netCents,
    addOnFinancedCents,
    financedCents,
    rateBps: category.leaseRateBps,
    termMonths,
    installmentCents,
    addOnMonthlyCents,
    monthlyTotalCents,
    contractTotalCents,
    interestTotalCents,
    requiresApproval: requiresApproval(input.discountBps, contractTotalCents),
    headlineCents: contractTotalCents,
  };
}

function calculateSale(input: QuoteInput, lines: QuoteLine[]): SaleCalc {
  const customer = findCustomer(input.customerId)!;
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const discountCents = percentOf(subtotalCents, input.discountBps);
  const netCents = subtotalCents - discountCents;

  const freightBps = freightBpsFor(customer.uf);
  const freightCents = percentOf(netCents, freightBps);
  const taxableBaseCents = netCents + freightCents;
  const taxBps = taxBpsFor(customer.uf);
  const taxCents = percentOf(taxableBaseCents, taxBps);
  const totalCents = taxableBaseCents + taxCents;

  const paymentCondition = input.paymentCondition!;
  let installments = 1;
  let installmentCents = totalCents;
  let payableCents = totalCents;
  let schedule: ScheduleEntry[];

  if (paymentCondition === 'cash') {
    schedule = [{ number: 1, dueInDays: 0, amountCents: totalCents }];
  } else if (paymentCondition === 'extended') {
    payableCents = totalCents + percentOf(totalCents, EXTENDED_CHARGE_BPS);
    installmentCents = payableCents;
    schedule = [{ number: 1, dueInDays: EXTENDED_DAYS, amountCents: payableCents }];
  } else {
    installments = input.installments!;
    installmentCents = pmt(totalCents, INSTALLMENT_RATE_BPS, installments);
    payableCents = installmentCents * installments;
    schedule = Array.from({ length: installments }, (_, k) => ({
      number: k + 1,
      dueInDays: EXTENDED_DAYS * (k + 1),
      amountCents: installmentCents,
    }));
  }

  return {
    kind: 'sale',
    subtotalCents,
    discountCents,
    netCents,
    freightBps,
    freightCents,
    taxableBaseCents,
    taxBps,
    taxCents,
    totalCents,
    paymentCondition,
    installments,
    chargeCents: payableCents - totalCents,
    payableCents,
    installmentCents,
    schedule,
    requiresApproval: requiresApproval(input.discountBps, payableCents),
    headlineCents: payableCents,
  };
}

export function calculate(input: QuoteInput, lines: QuoteLine[]): Calc {
  return input.type === 'lease' ? calculateLease(input, lines) : calculateSale(input, lines);
}
