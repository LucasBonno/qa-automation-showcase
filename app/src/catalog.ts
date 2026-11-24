/**
 * Static reference data of QuoteLab. Every product, customer and rate here is fictional.
 */
export type CategoryId = 'notebooks' | 'printers' | 'mobile' | 'automation';

/**
 * How the optional add-on of a category is charged:
 *  - financed-percent:  % of the net amount, added to the financed amount
 *  - financed-per-unit: fixed cents per unit, added to the financed amount
 *  - monthly-per-unit:  fixed cents per unit, charged every month (not financed)
 *  - monthly-percent:   % of the net amount, charged every month (not financed)
 */
export type AddOnKind = 'financed-percent' | 'financed-per-unit' | 'monthly-per-unit' | 'monthly-percent';

export interface CatalogItem {
  sku: string;
  name: string;
  unitCents: number;
  category: CategoryId;
}

export interface AddOn {
  name: string;
  kind: AddOnKind;
  /** bps for the percent kinds, cents for the per-unit kinds */
  value: number;
  hint: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  leaseRateBps: number;
  maxQtyPerLine: number;
  addOn: AddOn;
}

export interface Customer {
  id: string;
  name: string;
  uf: string;
}

export const LEASE_TERMS = [12, 24, 36, 48, 60] as const;
export const SALE_INSTALLMENTS = [2, 3] as const;

export const MAX_DISCOUNT_BPS = 3_000; // 30%
export const APPROVAL_DISCOUNT_BPS = 1_000; // approval needed when discount is strictly above 10%
export const APPROVAL_VALUE_CENTS = 10_000_000; // ...or when the headline value is strictly above R$ 100.000,00
export const EXTENDED_CHARGE_BPS = 150; // 1.5% flat charge for the 30-day extended payment
export const EXTENDED_DAYS = 30;
export const INSTALLMENT_RATE_BPS = 199; // 1.99% per month on installment sales
export const MAX_NOTES_LENGTH = 200;
export const MAX_DISTINCT_ITEMS = 20;

export const CATEGORIES: readonly Category[] = [
  {
    id: 'notebooks',
    name: 'Notebooks',
    leaseRateBps: 190,
    maxQtyPerLine: 200,
    addOn: { name: 'Garantia estendida', kind: 'financed-percent', value: 400, hint: '4% do valor líquido, financiado' },
  },
  {
    id: 'printers',
    name: 'Impressoras',
    leaseRateBps: 240,
    maxQtyPerLine: 50,
    addOn: { name: 'Kit de suprimentos', kind: 'monthly-per-unit', value: 4_500, hint: 'R$ 45,00 por unidade ao mês' },
  },
  {
    id: 'mobile',
    name: 'Celulares e tablets',
    leaseRateBps: 290,
    maxQtyPerLine: 500,
    addOn: { name: 'Seguro', kind: 'monthly-percent', value: 120, hint: '1,2% do valor líquido ao mês' },
  },
  {
    id: 'automation',
    name: 'Automação',
    leaseRateBps: 220,
    maxQtyPerLine: 100,
    addOn: { name: 'Instalação', kind: 'financed-per-unit', value: 18_000, hint: 'R$ 180,00 por unidade, financiado' },
  },
];

export const ITEMS: readonly CatalogItem[] = [
  { sku: 'NB-AUR-14', name: 'Notebook Aurora 14', unitCents: 489_000, category: 'notebooks' },
  { sku: 'NB-AUR-16P', name: 'Notebook Aurora 16 Pro', unitCents: 735_000, category: 'notebooks' },
  { sku: 'NB-BOR-13', name: 'Notebook Boreal 13', unitCents: 329_990, category: 'notebooks' },
  { sku: 'PR-LUM-200', name: 'Impressora Lumen 200', unitCents: 189_900, category: 'printers' },
  { sku: 'PR-LUM-500', name: 'Impressora Lumen 500 Multifuncional', unitCents: 524_950, category: 'printers' },
  { sku: 'PR-TER-ET', name: 'Impressora de Etiquetas Terra', unitCents: 278_075, category: 'printers' },
  { sku: 'MB-NOV-5', name: 'Smartphone Nova 5', unitCents: 315_000, category: 'mobile' },
  { sku: 'MB-NOV-5P', name: 'Smartphone Nova 5 Plus', unitCents: 459_990, category: 'mobile' },
  { sku: 'MB-ORB-10', name: 'Tablet Orbit 10', unitCents: 239_900, category: 'mobile' },
  { sku: 'AU-ARG-1D', name: 'Leitor de código de barras Argos', unitCents: 64_990, category: 'automation' },
  { sku: 'AU-ARG-MB', name: 'Coletor de dados Argos Mobile', unitCents: 599_000, category: 'automation' },
  { sku: 'AU-VEG-4', name: 'Impressora térmica Vega 4', unitCents: 348_000, category: 'automation' },
];

export const CUSTOMERS: readonly Customer[] = [
  { id: 'c1', name: 'Alfa Comércio Ltda', uf: 'SP' },
  { id: 'c2', name: 'Beta Logística S.A.', uf: 'RJ' },
  { id: 'c3', name: 'Gama Serviços ME', uf: 'MG' },
  { id: 'c4', name: 'Delta Indústria Ltda', uf: 'RS' },
  { id: 'c5', name: 'Épsilon Varejo Ltda', uf: 'BA' },
  { id: 'c6', name: 'Zeta Tecnologia S.A.', uf: 'PE' },
];

/** Freight as a percentage of the net amount, by delivery region of the customer's state. */
const FREIGHT_BPS_BY_UF: Record<string, number> = { SP: 200, RJ: 200, MG: 200, RS: 300, BA: 500, PE: 500 };

/** Sales tax as a percentage of (net + freight), by the customer's state. */
const TAX_BPS_BY_UF: Record<string, number> = { SP: 1_800, RJ: 2_000, MG: 1_750, RS: 1_700, BA: 1_900, PE: 1_800 };

export const freightBpsFor = (uf: string): number => FREIGHT_BPS_BY_UF[uf] ?? 0;
export const taxBpsFor = (uf: string): number => TAX_BPS_BY_UF[uf] ?? 0;

export const findCategory = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);
export const findItem = (sku: string): CatalogItem | undefined => ITEMS.find((i) => i.sku === sku);
export const findCustomer = (id: string): Customer | undefined => CUSTOMERS.find((c) => c.id === id);
