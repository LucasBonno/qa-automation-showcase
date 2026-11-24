import type { CategoryId } from '../api/types.js';

/**
 * The business rules of QuoteLab as the tests understand them, written down independently from the
 * application code. If the app's tables drift from this file, the calculation tests fail on purpose.
 *
 * Money is integer cents, rates are integer basis points (100 bps = 1%).
 */
export const SPEC = {
  leaseTerms: [12, 24, 36, 48, 60],
  maxDiscountBps: 3_000,
  approvalDiscountBps: 1_000, // approval needed when the discount is strictly above 10%
  approvalValueCents: 10_000_000, // ...or the headline value is strictly above R$ 100.000,00
  extendedChargeBps: 150,
  extendedDays: 30,
  installmentRateBps: 199,
  installmentOptions: [2, 3],
  maxNotesLength: 200,
  maxDistinctItems: 20,

  categories: {
    notebooks: { name: 'Notebooks', rateBps: 190, maxQty: 200, addOn: { name: 'Garantia estendida', kind: 'financed-percent', value: 400 } },
    printers: { name: 'Impressoras', rateBps: 240, maxQty: 50, addOn: { name: 'Kit de suprimentos', kind: 'monthly-per-unit', value: 4_500 } },
    mobile: { name: 'Celulares e tablets', rateBps: 290, maxQty: 500, addOn: { name: 'Seguro', kind: 'monthly-percent', value: 120 } },
    automation: { name: 'Automação', rateBps: 220, maxQty: 100, addOn: { name: 'Instalação', kind: 'financed-per-unit', value: 18_000 } },
  } satisfies Record<CategoryId, { name: string; rateBps: number; maxQty: number; addOn: { name: string; kind: string; value: number } }>,

  prices: {
    'NB-AUR-14': 489_000,
    'NB-AUR-16P': 735_000,
    'NB-BOR-13': 329_990,
    'PR-LUM-200': 189_900,
    'PR-LUM-500': 524_950,
    'PR-TER-ET': 278_075,
    'MB-NOV-5': 315_000,
    'MB-NOV-5P': 459_990,
    'MB-ORB-10': 239_900,
    'AU-ARG-1D': 64_990,
    'AU-ARG-MB': 599_000,
    'AU-VEG-4': 348_000,
  } as Record<string, number>,

  skusByCategory: {
    notebooks: ['NB-AUR-14', 'NB-AUR-16P', 'NB-BOR-13'],
    printers: ['PR-LUM-200', 'PR-LUM-500', 'PR-TER-ET'],
    mobile: ['MB-NOV-5', 'MB-NOV-5P', 'MB-ORB-10'],
    automation: ['AU-ARG-1D', 'AU-ARG-MB', 'AU-VEG-4'],
  } as Record<CategoryId, string[]>,

  customers: {
    c1: { name: 'Alfa Comércio Ltda', uf: 'SP' },
    c2: { name: 'Beta Logística S.A.', uf: 'RJ' },
    c3: { name: 'Gama Serviços ME', uf: 'MG' },
    c4: { name: 'Delta Indústria Ltda', uf: 'RS' },
    c5: { name: 'Épsilon Varejo Ltda', uf: 'BA' },
    c6: { name: 'Zeta Tecnologia S.A.', uf: 'PE' },
  } as Record<string, { name: string; uf: string }>,

  freightBpsByUf: { SP: 200, RJ: 200, MG: 200, RS: 300, BA: 500, PE: 500 } as Record<string, number>,
  taxBpsByUf: { SP: 1_800, RJ: 2_000, MG: 1_750, RS: 1_700, BA: 1_900, PE: 1_800 } as Record<string, number>,
} as const;

export const CUSTOMER_IDS = Object.keys(SPEC.customers);
