import type { Payment, PaymentEvent, PaymentStatus, RefundStatus } from '@mensa/api';
import type { ExportFailure, ReadFailure } from '@mensa/domain/finance';
import type { MessageKey } from '@mensa/shared';

export type Tone = 'ok' | 'pending' | 'warning' | 'error' | 'neutral';
export type AttentionReason = Payment['attentionReasons'][number];

export interface Badge {
  key: MessageKey;
  tone: Tone;
}

// The payment's status and its refunds' statuses are separate lifecycles. A confirmed payment
// whose refund failed is still a confirmed payment: the refund failure shows as its own badge (an
// attention reason), never by changing the payment's status label.
const PAYMENT_STATUS: Record<PaymentStatus, Badge> = {
  pending: { key: 'finance.status.pending', tone: 'pending' },
  confirmed: { key: 'finance.status.confirmed', tone: 'ok' },
  declined: { key: 'finance.status.declined', tone: 'error' },
};

const REFUND_STATUS: Record<RefundStatus, Badge> = {
  pending: { key: 'finance.refundStatus.pending', tone: 'pending' },
  completed: { key: 'finance.refundStatus.completed', tone: 'ok' },
  failed: { key: 'finance.refundStatus.failed', tone: 'error' },
};

export function paymentStatusBadge(status: PaymentStatus): Badge {
  return PAYMENT_STATUS[status];
}

export function refundStatusBadge(status: RefundStatus): Badge {
  return REFUND_STATUS[status];
}

export function attentionReasonKey(reason: AttentionReason): MessageKey {
  return `finance.reason.${reason}`;
}

/** The badges of one payment row: its own status first, then why it needs attention (if it does). */
export function paymentBadges(payment: Payment): Badge[] {
  return [
    paymentStatusBadge(payment.status),
    ...payment.attentionReasons.map((reason) => ({
      key: attentionReasonKey(reason),
      tone: 'warning' as const,
    })),
  ];
}

export function historyEventKey(type: PaymentEvent['type']): MessageKey {
  return `finance.event.${type}`;
}

/** Words for a failed read; 'error' is a payment list's catch-all (PaymentHistory). */
export function readFailureKey(failure: ReadFailure | 'wrong_day' | 'error'): MessageKey {
  return `finance.failure.${failure}`;
}

export function exportFailureKey(failure: ExportFailure): MessageKey {
  return failure.reason === 'page_failed'
    ? `finance.export.failed.${failure.failure}`
    : `finance.export.failed.${failure.reason}`;
}
