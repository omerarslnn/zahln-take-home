import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IntentRecord, PayOrderIntent } from '@mensa/domain';
import { homeActivity, RECENT_LIMIT } from './home-activity';

const SCOPE = { candidateId: 'c_test', userId: 'usr_student' };

function payment(
  key: string,
  state: PayOrderIntent['state'],
  status: 'pending' | 'confirmed' | 'declined' | null,
  lastSentAt: number | null,
): PayOrderIntent {
  return {
    v: 1,
    key,
    kind: 'payOrder',
    scope: SCOPE,
    state,
    attempts: lastSentAt === null ? 0 : 1,
    maybeApplied: state !== 'ready',
    firstSentAt: lastSentAt,
    lastSentAt,
    refusal: state === 'rejected' ? 'order_expired' : null,
    payload: { orderId: `ord_${key}`, amountCents: 500 },
    resource: status ? { paymentId: `pay_${key}`, status, version: 1 } : null,
  };
}

describe('homeActivity', () => {
  it('lists every unfinished payment first and newest first, whatever their number', () => {
    const records: IntentRecord[] = [
      payment('paid', 'applied', 'confirmed', 9_000),
      payment('unknown', 'unknown', null, 5_000),
      payment('pending', 'applied', 'pending', 7_000),
      payment('notSent', 'ready', null, null),
      payment('sending', 'submitting', null, 8_000),
    ];
    const { attention } = homeActivity(records);
    assert.deepEqual(
      attention.map((record) => record.key),
      ['sending', 'pending', 'unknown', 'notSent'],
    );
  });

  it('shows at most a few final results, newest first, and never as unfinished', () => {
    const finals = Array.from({ length: RECENT_LIMIT + 2 }, (_, index) =>
      payment(
        `final${index}`,
        index % 2 ? 'rejected' : 'applied',
        index % 2 ? null : 'declined',
        index,
      ),
    );
    const { attention, recent } = homeActivity(finals);
    assert.deepEqual(attention, []);
    assert.equal(recent.length, RECENT_LIMIT);
    assert.deepEqual(
      recent.map((record) => record.key),
      ['final4', 'final3', 'final2'],
    );
  });

  it('ignores the till’s records (orders and refunds)', () => {
    const order = { ...payment('order', 'unknown', null, 1), kind: 'createOrder' } as unknown;
    assert.deepEqual(homeActivity([order as IntentRecord]), { attention: [], recent: [] });
  });
});
