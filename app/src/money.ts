/**
 * Money is always an integer number of cents. Rates are integer basis points (bps): 100 bps = 1%.
 * Integer math avoids the classic floating point surprises (0.1 + 0.2) in totals.
 */
export const BPS = 10_000;

/** Applies a rate in bps to an amount in cents, rounding half up. Amounts are never negative here. */
export function percentOf(cents: number, bps: number): number {
  return Math.floor((cents * bps * 2 + BPS) / (BPS * 2));
}

/**
 * Installment of the Price table (constant payments):
 *   PMT = PV · i · (1 + i)^n / ((1 + i)^n − 1)
 * with i = monthlyRateBps / 10 000 and n = months. Result in cents, rounded half up.
 */
export function pmt(presentValueCents: number, monthlyRateBps: number, months: number): number {
  if (presentValueCents === 0) return 0;
  const i = monthlyRateBps / BPS;
  const growth = Math.pow(1 + i, months);
  return Math.round((presentValueCents * i * growth) / (growth - 1));
}
