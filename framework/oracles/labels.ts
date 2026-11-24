import type { QuoteKind, QuoteStatus } from '../api/types.js';

/** The words the user reads on screen (pt-BR), written down independently from the application. */
export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

export const TYPE_LABEL: Record<QuoteKind, string> = { lease: 'Locação', sale: 'Venda' };

export const STATUSES = Object.keys(STATUS_LABEL) as QuoteStatus[];
