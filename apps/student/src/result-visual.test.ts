import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PaymentDisplay, PayOrderIntent } from '@mensa/domain';
import { countdownText, countdownTone } from './order-countdown';
import { describeOutcome } from './payment-outcome';
import { outcomeVisual } from './result-visual';

const DISPLAYS: PaymentDisplay[] = [
  'not_sent',
  'sending',
  'checking',
  'pending',
  'confirmed',
  'declined',
  'refused',
];

/** A payment intent that `paymentDisplay` maps to `display`. */
function intentShowing(display: PaymentDisplay): PayOrderIntent {
  const state = {
    not_sent: 'ready',
    sending: 'submitting',
    checking: 'unknown',
    refused: 'rejected',
    pending: 'applied',
    confirmed: 'applied',
    declined: 'applied',
  } as const;
  const status =
    display === 'pending' || display === 'confirmed' || display === 'declined' ? display : null;
  return {
    v: 1,
    key: 'k',
    kind: 'payOrder',
    scope: { candidateId: 'c', userId: 'u' },
    state: state[display],
    attempts: 1,
    maybeApplied: true,
    firstSentAt: 1,
    lastSentAt: 1,
    refusal: display === 'refused' ? 'order_expired' : null,
    payload: { orderId: 'ord_1', amountCents: 500 },
    resource: status ? { paymentId: 'pay_1', status, version: 1 } : null,
  };
}

describe('result visuals', () => {
  it('celebrates only a payment the server confirmed', () => {
    for (const display of DISPLAYS) {
      const { tone } = describeOutcome(intentShowing(display));
      assert.equal(outcomeVisual(display, tone).celebrate, display === 'confirmed', display);
    }
  });

  it('never shows an unknown outcome as paid or declined', () => {
    const unknown = describeOutcome(intentShowing('checking'));
    const visual = outcomeVisual('checking', unknown.tone);
    assert.notEqual(unknown.tone, 'ok');
    assert.notEqual(unknown.tone, 'error');
    assert.notEqual(visual.icon, outcomeVisual('confirmed', 'ok').icon);
    assert.notEqual(visual.icon, outcomeVisual('declined', 'error').icon);
    assert.notEqual(unknown.title, describeOutcome(intentShowing('confirmed')).title);
    assert.notEqual(unknown.title, describeOutcome(intentShowing('declined')).title);
  });

  it('gives every display its own icon, except two final "not paid" answers', () => {
    const icons = DISPLAYS.map((display) =>
      outcomeVisual(display, describeOutcome(intentShowing(display)).tone),
    ).map((visual) => visual.icon);
    // Declined and refused (for example, expired before the payment) are both "not paid".
    assert.equal(new Set(icons).size, DISPLAYS.length - 1);
  });
});

describe('order countdown', () => {
  it('formats minutes and seconds and warns in the last minute', () => {
    assert.equal(countdownText(245), '4:05');
    assert.equal(countdownText(9.8), '0:09');
    assert.equal(countdownText(-3), '0:00');
    assert.equal(countdownTone(60), 'neutral');
    assert.equal(countdownTone(59), 'warning');
  });
});
