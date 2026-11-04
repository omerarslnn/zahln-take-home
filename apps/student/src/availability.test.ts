// The review and result screens' availability rules (BUG-01), against the real controller, gate
// and GateRecovery on the simulated server. The screens render exactly these values: the live
// notice (`availabilityNotice`), the pay action (`paymentsOpen`) and the message kept after an
// action (`afterPayAttempt`, `afterResend`).
import {
  CONNECTIVITY_SETTLE_MS,
  GateRecovery,
  paymentDisplay,
  type GateState,
} from '@mensa/domain';
import type { MessageKey } from '@mensa/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// The domain's test doubles; never exported from @mensa/domain, so they stay out of app bundles.
import { FakeConnectivity } from '../../../packages/domain/src/testing/fake-connectivity';
import type { Fault } from '../../../packages/domain/src/testing/fake-server';
import { TestEnvironment } from '../../../packages/domain/src/testing/harness';
import { availabilityNotice, gateAnnouncement, paymentsOpen } from './availability';
import { afterPayAttempt, afterResend } from './payment-outcome';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }];
const LOST: Fault = { type: 'lose_response', applied: false };

const GATE_STATES: (GateState | null)[] = [
  null,
  { status: 'checking' },
  { status: 'open' },
  { status: 'blocked', reason: 'update_required', current: '1.0.0', minimum: '1.1.0' },
  { status: 'blocked', reason: 'update_required', current: '1.0.0', minimum: '' },
  { status: 'blocked', reason: 'payments_paused' },
  { status: 'blocked', reason: 'config_unavailable' },
  { status: 'blocked', reason: 'invalid_app_version' },
  { status: 'blocked', reason: 'invalid_min_version' },
];

/** The availability warnings a payment screen shows: its live notice and any kept message. */
function availabilityWarnings(gate: GateState | null, kept: MessageKey | null): MessageKey[] {
  return [availabilityNotice(gate)?.key, kept].filter(
    (key): key is MessageKey => key?.startsWith('payments.') ?? false,
  );
}

async function studentInFront() {
  const env = new TestEnvironment();
  const app = await env.startApp('student');
  const connectivity = new FakeConnectivity();
  const recovery = new GateRecovery(app.gate, env.scheduler, { connectivity });
  recovery.start();
  connectivity.report(true);
  await app.gate.refresh();
  return { env, app, connectivity, recovery };
}

describe('payment availability on the review and result screens (BUG-01)', () => {
  it('review: one warning while blocked, then none and "Pay" once the server answers', async () => {
    const { env, app, connectivity, recovery } = await studentInFront();
    const orderId = env.server.seedOrder(PASTA);
    assert.equal(paymentsOpen(app.gate.state()), true);
    const t = (key: MessageKey) => key;

    connectivity.report(false); // internet off with the review screen open
    env.server.inject('getConfig', LOST, LOST);
    const attempt = await app.controller.payOrder(orderId, 500); // its pre-payment check fails
    assert.equal(attempt.type, 'blocked');
    const next = afterPayAttempt({ type: 'done', result: attempt });
    assert.deepEqual(next, { type: 'message', message: null }, 'no copy of the gate is kept');
    assert.deepEqual(availabilityWarnings(app.gate.state(), null), ['payments.configUnavailable']);
    assert.equal(paymentsOpen(app.gate.state()), false, 'no "Pay" next to the warning');

    const spoken = gateAnnouncement(app.gate.state(), t);
    const reads = () => env.server.requests.filter((request) => request.route === 'getConfig');
    const readsBefore = reads().length;
    await env.advance(6_000); // the first spaced re-read, 5 s later, fails too
    assert.equal(reads().length, readsBefore + 1);
    assert.equal(gateAnnouncement(app.gate.state(), t), spoken, 'same words: not announced again');

    connectivity.report(true); // internet on: same screen, app in front
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.deepEqual(availabilityWarnings(app.gate.state(), null), [], 'the warning is gone');
    assert.equal(paymentsOpen(app.gate.state()), true, '"Pay" is back');
    assert.equal(gateAnnouncement(app.gate.state(), t), 'payments.open');
    assert.equal(env.server.postedWrites('createPayment').length, 0, 'nothing was sent');
    recovery.dispose();
  });

  it('result: a blocked resend keeps no copy, "Send again" waits for the gate, then sends once', async () => {
    const { env, app, connectivity, recovery } = await studentInFront();
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', LOST); // the payment request gets no answer
    const started = await app.controller.payOrder(orderId, 500);
    assert.ok(started.type === 'submitted');
    const key = started.intent.key;
    const record = app.controller.get(key);
    assert.ok(record?.kind === 'payOrder');
    assert.equal(paymentDisplay(record), 'checking', 'the result screen offers "Send again"');

    connectivity.report(false);
    env.server.inject('getConfig', LOST);
    const resent = await app.controller.retry(key);
    assert.equal(resent.type, 'blocked');
    assert.equal(afterResend({ type: 'done', result: resent }), null, 'no copy of the gate');
    assert.deepEqual(availabilityWarnings(app.gate.state(), null), ['payments.configUnavailable']);
    assert.equal(paymentsOpen(app.gate.state()), false, '"Send again" is disabled');

    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.deepEqual(availabilityWarnings(app.gate.state(), null), []);
    assert.equal(paymentsOpen(app.gate.state()), true, '"Send again" is enabled');

    const again = await app.controller.retry(key);
    assert.equal(again.type, 'attempted');
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts.length, 2, 'the blocked resend sent nothing');
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey, 'the same request again');
    assert.equal(env.server.applied.createPayment, 1, 'one payment');
    recovery.dispose();
  });

  it('every gate state shows either the notice or the pay action, never both', () => {
    for (const gate of GATE_STATES) {
      assert.equal(availabilityNotice(gate) === null, paymentsOpen(gate), JSON.stringify(gate));
    }
    assert.deepEqual(GATE_STATES.filter(paymentsOpen), [{ status: 'open' }], 'only "open" pays');
    const recheckable = GATE_STATES.filter((gate) => availabilityNotice(gate)?.recheck).map(
      (gate) => (gate?.status === 'blocked' ? gate.reason : gate?.status),
    );
    assert.deepEqual(
      recheckable,
      ['payments_paused', 'config_unavailable', 'invalid_min_version'],
      '"check again" only where a new answer could help without an update',
    );
  });

  it('a blocked attempt or resend keeps nothing; every other reason nothing was sent stays', () => {
    for (const gate of GATE_STATES) {
      if (gate?.status !== 'blocked') continue;
      const result = { type: 'blocked', gate } as const;
      assert.deepEqual(afterPayAttempt({ type: 'done', result }), {
        type: 'message',
        message: null,
      });
      assert.equal(afterResend({ type: 'done', result }), null);
    }
    assert.deepEqual(afterPayAttempt({ type: 'not_authorized', reason: 'cancelled' }), {
      type: 'message',
      message: { tone: 'neutral', key: 'auth.cancelled' },
    });
    assert.deepEqual(
      afterPayAttempt({
        type: 'done',
        result: { type: 'not_allowed', reason: 'server_time_unknown' },
      }),
      { type: 'message', message: { tone: 'error', key: 'notAllowed.serverTime' } },
    );
    assert.deepEqual(afterPayAttempt({ type: 'done', result: { type: 'storage_failed' } }), {
      type: 'message',
      message: { tone: 'error', key: 'review.storageFailed' },
    });
    assert.equal(afterResend({ type: 'not_authorized', reason: 'locked_out' }), 'auth.locked_out');
    assert.equal(afterResend({ type: 'invalidated' }), 'result.sendInvalidated');
  });
});
