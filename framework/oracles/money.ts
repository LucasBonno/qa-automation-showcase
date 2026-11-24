/**
 * Exact money math for the oracles. Everything is BigInt rational arithmetic, rounded half up once at the end,
 * so a result can be trusted down to the cent without depending on floating point behavior.
 */
const D = 10_000n; // basis points denominator

/** floor((2·num + den) / (2·den)): rounds num/den to the nearest integer, ties up. Non-negative inputs only. */
export function roundHalfUp(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}

/** `cents × bps / 10 000`, rounded half up. */
export function percentOf(cents: number, bps: number): number {
  return Number(roundHalfUp(BigInt(cents) * BigInt(bps), D));
}

/**
 * Constant installment of the Price table, in closed form with exact integers.
 * With i = b/D and A = D + b:   PMT = PV · i · (1+i)^n / ((1+i)^n − 1) = PV · b · Aⁿ / (D · (Aⁿ − Dⁿ))
 */
export function pmt(presentValueCents: number, rateBps: number, months: number): number {
  if (presentValueCents === 0) return 0;
  const n = BigInt(months);
  const a = D + BigInt(rateBps);
  const aN = a ** n;
  const dN = D ** n;
  return Number(roundHalfUp(BigInt(presentValueCents) * BigInt(rateBps) * aN, D * (aN - dN)));
}

/**
 * Independent proof that a PMT value is right: pay it n times against the loan balance. The rounded installment can
 * leave a residue of at most half a cent per payment, compounded. Returns the residue in cents (floating point is
 * fine here because it is only compared with a tolerance).
 */
export function amortizationResidue(presentValueCents: number, rateBps: number, months: number, installmentCents: number): number {
  const i = rateBps / 10_000;
  let balance = presentValueCents;
  for (let k = 0; k < months; k += 1) balance = balance * (1 + i) - installmentCents;
  return balance;
}

/** Largest residue a half-cent rounding error per installment can produce: 0.5 × ((1+i)^n − 1) / i. */
export function maxResidueCents(rateBps: number, months: number): number {
  const i = rateBps / 10_000;
  return (0.5 * (Math.pow(1 + i, months) - 1)) / i + 1;
}

/** "R$ 1.234,56", built by hand so it checks the application's pt-BR formatting instead of reusing Intl. */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** The CSV export writes money as plain decimals with a comma: 123456 -> "1234,56". */
export const formatDecimal = (cents: number): string => `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

/** Browsers format currency with a no-break space; compare text with plain spaces. */
export const normalizeSpaces = (text: string): string => text.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Percentage text of the UI: 190 bps -> "1,90%". */
export const formatPercent = (bps: number): string => `${(bps / 100).toFixed(2).replace('.', ',')}%`;

/** What the user types in "Desconto (%)" for a given number of bps: 1250 -> "12,5". */
export const bpsToTyped = (bps: number): string => String(bps / 100).replace('.', ',');
