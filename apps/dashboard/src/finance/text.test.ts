import type { Payment } from '@mensa/api';
import { de, en } from '@mensa/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  exportFailureKey,
  historyEventKey,
  paymentBadges,
  paymentStatusBadge,
  refundStatusBadge,
} from './text';

// paymentBadges reads only these two fields.
const payment = (fields: Pick<Payment, 'status' | 'attentionReasons'>) => fields as Payment;

describe('status badges', () => {
  it('keep a confirmed payment confirmed when its refund failed', () => {
    const failedRefund = payment({ status: 'confirmed', attentionReasons: ['refund_failed'] });
    assert.deepEqual(paymentBadges(failedRefund), [
      { key: 'finance.status.confirmed', tone: 'ok' },
      { key: 'finance.reason.refund_failed', tone: 'warning' },
    ]);
    assert.equal(refundStatusBadge('failed').key, 'finance.refundStatus.failed');
  });

  it('never call a pending payment paid, and keep refund states apart from payment states', () => {
    assert.equal(paymentStatusBadge('pending').tone, 'pending');
    assert.notEqual(en[paymentStatusBadge('pending').key], en[paymentStatusBadge('confirmed').key]);
    assert.notEqual(en[refundStatusBadge('pending').key], en[paymentStatusBadge('pending').key]);
  });

  it('have German and English words for every state, reason and event', () => {
    const keys = [
      ...(['pending', 'confirmed', 'declined'] as const).map(
        (status) => paymentStatusBadge(status).key,
      ),
      ...(['pending', 'completed', 'failed'] as const).map(
        (status) => refundStatusBadge(status).key,
      ),
      ...paymentBadges(
        payment({
          status: 'pending',
          attentionReasons: ['pending_too_long', 'refund_pending_too_long', 'refund_failed'],
        }),
      ).map((badge) => badge.key),
      ...(
        [
          'payment_created',
          'payment_confirmed',
          'payment_declined',
          'refund_requested',
          'refund_completed',
          'refund_failed',
        ] as const
      ).map(historyEventKey),
      exportFailureKey({ reason: 'repeated_cursor' }),
      exportFailureKey({ reason: 'page_failed', failure: 'offline' }),
    ];
    for (const key of keys) {
      assert.ok(en[key] && de[key] && en[key] !== de[key], key);
    }
  });
});
