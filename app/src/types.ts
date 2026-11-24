import type { CategoryId } from './catalog.js';

export type QuoteType = 'lease' | 'sale';
export type PaymentCondition = 'cash' | 'extended' | 'installments';
export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';
export type Role = 'admin' | 'seller' | 'approver' | 'viewer';

export interface SessionUser {
  username: string;
  name: string;
  role: Role;
}

/** A quote request after validation and normalization. */
export interface QuoteInput {
  type: QuoteType;
  category: CategoryId;
  customerId: string;
  items: { sku: string; qty: number }[];
  discountBps: number;
  notes: string;
  /** lease only */
  termMonths: number | null;
  /** lease only */
  addOn: boolean;
  /** sale only */
  paymentCondition: PaymentCondition | null;
  /** sale only: 1 for cash and extended, 2 or 3 for installments */
  installments: number | null;
}

export interface LeaseCalc {
  kind: 'lease';
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  addOnFinancedCents: number;
  financedCents: number;
  rateBps: number;
  termMonths: number;
  installmentCents: number;
  addOnMonthlyCents: number;
  monthlyTotalCents: number;
  contractTotalCents: number;
  interestTotalCents: number;
  requiresApproval: boolean;
  headlineCents: number;
}

export interface ScheduleEntry {
  number: number;
  dueInDays: number;
  amountCents: number;
}

export interface SaleCalc {
  kind: 'sale';
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  freightBps: number;
  freightCents: number;
  taxableBaseCents: number;
  taxBps: number;
  taxCents: number;
  totalCents: number;
  paymentCondition: PaymentCondition;
  installments: number;
  chargeCents: number;
  payableCents: number;
  installmentCents: number;
  schedule: ScheduleEntry[];
  requiresApproval: boolean;
  headlineCents: number;
}

export type Calc = LeaseCalc | SaleCalc;

export interface QuoteLine {
  sku: string;
  name: string;
  qty: number;
  unitCents: number;
  lineCents: number;
}

export interface HistoryEntry {
  at: string;
  by: string;
  action: 'created' | 'updated' | 'submitted' | 'auto_approved' | 'approved' | 'rejected' | 'cancelled';
  from: QuoteStatus | null;
  to: QuoteStatus;
  note?: string;
}

export interface QuoteRecord {
  id: number;
  code: string;
  version: number;
  input: QuoteInput;
  lines: QuoteLine[];
  calc: Calc;
  status: QuoteStatus;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  history: HistoryEntry[];
}
