import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Payment } from '@mensa/api';
import type { HistoryEntry, PayOrderIntent } from '@mensa/domain';
import { formatCents, translate, type MessageKey, type MessageParams } from '@mensa/shared';
import { spokenPhrase } from './components/ui/a11y-text';
import { historyEventVisual } from './components/payment-text';
import { historySections, paymentRowText } from './history-sections';

function payment(id: string, createdAt: string, extra: Partial<Payment> = {}): Payment {
  return {
    id,
    orderId: `ord_${id}`,
    status: 'confirmed',
    amountCents: 720,
    currency: 'EUR',
    priceGroup: 'student',
    mensa: { id: 'mns_1', name: 'Mensa am Campus' },
    till: { id: 'till_1', name: 'Kasse 1' },
    payer: { id: 'usr_student', displayName: 'Test Student' },
    items: [],
    refundedAmountCents: 0,
    pendingRefundAmountCents: 0,
    refundableAmountCents: 720,
    needsAttention: false,
    attentionReasons: [],
    createdAt,
    updatedAt: createdAt,
    version: 2,
    ...extra,
  };
}

const row = (p: Payment): HistoryEntry => ({ kind: 'payment', payment: p });
const unresolved = { kind: 'unresolved', intent: { key: 'k1' } as PayOrderIntent } as const;

describe('historySections', () => {
  it('puts unfinished actions first, then groups payments by Berlin day, newest first', () => {
    const rows: HistoryEntry[] = [
      unresolved,
      row(payment('a', '2026-11-05T10:00:00Z')),
      // 23:30 UTC on 4 November is already 5 November in Berlin (CET, UTC+1).
      row(payment('b', '2026-11-04T23:30:00Z')),
      row(payment('c', '2026-11-04T12:00:00Z')),
      row(payment('d', '2026-10-30T12:00:00Z')),
    ];

    const sections = historySections(rows, '2026-11-05');

    assert.deepEqual(
      sections.map((section) => [section.title, section.data.length]),
      [
        [{ kind: 'attention' }, 1],
        [{ kind: 'today' }, 2],
        [{ kind: 'yesterday' }, 1],
        [{ kind: 'day', day: '2026-10-30' }, 1],
      ],
    );
    assert.deepEqual(
      sections[1]?.data.map((entry) => entry.kind === 'payment' && entry.payment.id),
      ['a', 'b'],
    );
  });

  it('has no attention section when nothing is unfinished, and nothing for an empty list', () => {
    assert.deepEqual(historySections([], '2026-11-05'), []);
    const sections = historySections([row(payment('a', '2026-11-01T09:00:00Z'))], '2026-11-05');
    assert.deepEqual(
      sections.map((section) => section.key),
      ['2026-11-01'],
    );
  });
});

describe('paymentRowText', () => {
  const t =
    (locale: 'de' | 'en') =>
    (key: MessageKey, params?: MessageParams): string =>
      translate(locale, key, params);

  it('reads the status as part of the row, in both languages', () => {
    const declined = payment('a', '2026-11-04T16:03:00Z', { status: 'declined' });
    const en = paymentRowText(declined, t('en'), 'en');
    const label = spokenPhrase([en.title, en.status.label, en.value, en.subtitle]);
    assert.equal(label, 'Mensa am Campus, Declined, €7.20, 17:03 · Kasse 1');
    assert.equal(en.status.tone, 'error');
    const de = paymentRowText(declined, t('de'), 'de');
    assert.equal(de.status.label, 'Abgelehnt');
    assert.equal(de.value, formatCents(720, 'de')); // "7,20 €" with a no-break space
  });

  it('mentions completed and pending refunds with the server’s amounts', () => {
    const refunded = payment('a', '2026-11-04T16:03:00Z', {
      refundedAmountCents: 100,
      pendingRefundAmountCents: 50,
    });
    assert.equal(
      paymentRowText(refunded, t('en'), 'en').subtitle,
      '17:03 · Kasse 1 · €1.00 refunded · €0.50 being refunded',
    );
  });
});

describe('historyEventVisual', () => {
  it('gives every server event a tone; a requested refund is not yet done', () => {
    const types = [
      'payment_created',
      'payment_confirmed',
      'payment_declined',
      'refund_requested',
      'refund_completed',
      'refund_failed',
    ] as const;
    const tones = types.map((type) => historyEventVisual(type).tone);
    assert.deepEqual(tones, ['neutral', 'ok', 'error', 'pending', 'ok', 'error']);
  });
});
