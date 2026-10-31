import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Order, Payment, PaymentDetail } from '@mensa/api';
import {
  newIntent,
  withOrder,
  withPayment,
  type CreateOrderIntent,
  type PayOrderIntent,
} from './intent';
import { ResourceCache } from './resource-cache';

function order(version: number, status: Order['status']): Order {
  return {
    id: 'ord_1',
    status,
    mensa: { id: 'm', name: 'Mensa' },
    till: { id: 't', name: 'Till' },
    items: [],
    qrPayload: 'zahln://pay?order=ord_1',
    currency: 'EUR',
    createdAt: '2026-10-31T10:00:00.000Z',
    expiresAt: '2026-10-31T10:05:00.000Z',
    version,
  };
}

function payment(version: number, status: Payment['status']): Payment {
  return {
    id: 'pay_1',
    orderId: 'ord_1',
    status,
    amountCents: 500,
    currency: 'EUR',
    priceGroup: 'student',
    mensa: { id: 'm', name: 'Mensa' },
    till: { id: 't', name: 'Till' },
    payer: { id: 'usr_1', displayName: 'S' },
    items: [],
    refundedAmountCents: 0,
    pendingRefundAmountCents: version >= 4 ? 200 : 0,
    refundableAmountCents: version >= 4 ? 300 : 500,
    needsAttention: false,
    attentionReasons: [],
    createdAt: '2026-10-31T10:00:00.000Z',
    updatedAt: '2026-10-31T10:00:00.000Z',
    version,
  };
}

function detail(version: number): PaymentDetail {
  return {
    ...payment(version, 'confirmed'),
    refunds: [
      {
        id: 'ref_1',
        paymentId: 'pay_1',
        amountCents: 200,
        currency: 'EUR',
        status: 'pending',
        reason: null,
        createdAt: '2026-10-31T10:05:00.000Z',
        updatedAt: '2026-10-31T10:05:00.000Z',
      },
    ],
    history: [
      { at: '2026-10-31T10:00:00.000Z', type: 'payment_created', amountCents: 500, refundId: null },
    ],
  };
}

describe('ResourceCache and version rules', () => {
  it('never lets a lower version regress a confirmed payment, in the cache or in the intent', () => {
    const cache = new ResourceCache();
    cache.putPayment(payment(3, 'confirmed'));
    assert.equal(cache.putPayment(payment(2, 'pending')).status, 'confirmed');

    const base = newIntent(
      { kind: 'payOrder', payload: { orderId: 'ord_1', amountCents: 500 } },
      'k',
      {
        candidateId: 'c',
        userId: 'usr_1',
      },
    ) as PayOrderIntent;
    const confirmed = withPayment(base, payment(3, 'confirmed'));
    assert.equal(withPayment(confirmed, payment(2, 'pending')).resource?.status, 'confirmed');
  });

  it('keeps refunds and history from an equal-version detail when the list item was cached first', () => {
    const cache = new ResourceCache();
    cache.putPayment(payment(4, 'confirmed')); // from GET /payments
    cache.putPaymentDetail(detail(4)); // from GET /payments/{id}, same version

    const view = cache.paymentView('pay_1');
    assert.equal(view?.detail?.refunds.length, 1);
    assert.equal(view?.detail?.history.length, 1);
    assert.equal(view?.payment.refundableAmountCents, 300);
  });

  it('withholds a detail that is older than the newest summary instead of showing it as current', () => {
    const cache = new ResourceCache();
    cache.putPaymentDetail(detail(4));
    cache.putPayment(payment(5, 'confirmed'));
    const view = cache.paymentView('pay_1');
    assert.deepEqual([view?.detail, view?.detailOutdated], [null, true]);
  });

  it('accepts an order expiring at an equal version, as the live API reports it, but never the reverse', () => {
    const cache = new ResourceCache();
    cache.putOrder(order(1, 'open'));
    assert.equal(cache.putOrder(order(1, 'expired')).status, 'expired');
    assert.equal(cache.putOrder(order(1, 'open')).status, 'expired'); // stale read after expiry
    // No other equal-version change is accepted: it could be a stale read.
    const paying = new ResourceCache();
    paying.putOrder(order(2, 'paying'));
    assert.equal(paying.putOrder(order(2, 'open')).status, 'paying');

    // The intent applies the same rule, so it holds after a restart with an empty cache.
    const base = newIntent({ kind: 'createOrder', payload: { items: [] } }, 'k', {
      candidateId: 'c',
      userId: 'usr_cashier',
    }) as CreateOrderIntent;
    const expired = withOrder(withOrder(base, order(1, 'open')), order(1, 'expired'));
    assert.equal(expired.resource?.status, 'expired');
    assert.equal(withOrder(expired, order(1, 'open')).resource?.status, 'expired');
  });
});
