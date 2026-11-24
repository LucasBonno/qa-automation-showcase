/** Wire types of the QuoteLab API. Declared here on purpose: the tests never import application code. */
export type CategoryId = 'notebooks' | 'printers' | 'mobile' | 'automation';
export type QuoteKind = 'lease' | 'sale';
export type PaymentCondition = 'cash' | 'extended' | 'installments';
export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled';

export interface ItemLine {
  sku: string;
  qty: number;
}

export interface QuotePayload {
  type: QuoteKind;
  category: CategoryId;
  customerId: string;
  items: ItemLine[];
  discountBps: number;
  notes?: string;
  termMonths?: number;
  addOn?: boolean;
  paymentCondition?: PaymentCondition;
  installments?: number;
}

export interface LeaseCalcDto {
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

export interface SaleCalcDto {
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
  schedule: { number: number; dueInDays: number; amountCents: number }[];
  requiresApproval: boolean;
  headlineCents: number;
}

export interface QuoteDto {
  id: number;
  code: string;
  version: number;
  type: QuoteKind;
  category: CategoryId;
  customerId: string;
  customerName: string;
  customerUf: string;
  items: { sku: string; name: string; qty: number; unitCents: number; lineCents: number }[];
  termMonths: number | null;
  discountBps: number;
  addOn: boolean;
  paymentCondition: PaymentCondition | null;
  installments: number | null;
  notes: string;
  status: QuoteStatus;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  calc: LeaseCalcDto | SaleCalcDto;
  history: { at: string; by: string; action: string; from: QuoteStatus | null; to: QuoteStatus; note?: string }[];
}

export interface ListResponse {
  items: { id: number; code: string; type: QuoteKind; category: CategoryId; customerName: string; status: QuoteStatus; headlineCents: number; version: number; createdBy: string; updatedAt: string }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ReportSummary {
  totalCount: number;
  approvedValueCents: number;
  pendingValueCents: number;
  byStatus: Record<string, { count: number; valueCents: number }>;
  byCategory: Record<string, { count: number; valueCents: number }>;
  byType: Record<string, { count: number; valueCents: number }>;
}
