// Server states in words. The student app has an identical copy. These are the server's own states,
// kept apart from the client's request states (sending, checking): a pending payment is not paid,
// and a pending refund is not completed.
import type {
  OrderStatus,
  PaymentEvent,
  PaymentStatus,
  PriceGroup,
  RefundStatus,
} from '@mensa/api';
import type { MessageKey } from '@mensa/shared';
import type { Tone } from './ui';

export function paymentStatusText(status: PaymentStatus): { tone: Tone; key: MessageKey } {
  switch (status) {
    case 'confirmed':
      return { tone: 'ok', key: 'status.payment.confirmed' };
    case 'declined':
      return { tone: 'error', key: 'status.payment.declined' };
    case 'pending':
      return { tone: 'pending', key: 'status.payment.pending' };
  }
}

export function refundStatusText(status: RefundStatus): { tone: Tone; key: MessageKey } {
  switch (status) {
    case 'completed':
      return { tone: 'ok', key: 'status.refund.completed' };
    case 'failed':
      return { tone: 'error', key: 'status.refund.failed' };
    case 'pending':
      return { tone: 'pending', key: 'status.refund.pending' };
  }
}

export function orderStatusText(status: OrderStatus): { tone: Tone; key: MessageKey } {
  switch (status) {
    case 'open':
      return { tone: 'neutral', key: 'status.order.open' };
    case 'paying':
      return { tone: 'pending', key: 'status.order.paying' };
    case 'paid':
      return { tone: 'ok', key: 'status.order.paid' };
    case 'expired':
      return { tone: 'warning', key: 'status.order.expired' };
  }
}

export function priceGroupKey(group: PriceGroup): MessageKey {
  return `group.${group}`;
}

export function historyEventKey(type: PaymentEvent['type']): MessageKey {
  return `event.${type}`;
}
