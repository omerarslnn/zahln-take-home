// Orchestration tests: the real IntentController, SessionCoordinator, transport and response
// validation against a SIMULATED server (testing/fake-server.ts). They prove client behaviour under
// simulated failures, not the real server's behaviour or an end-to-end device payment.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  paymentDisplay,
  type IntentRecord,
  type PayOrderIntent,
  type RefundIntent,
} from './intent';
import type { RetryOutcome, StartOutcome } from './intent-controller';
import { expiryState } from './server-clock';
import { TestEnvironment } from './testing/harness';
import { MemoryIntentStore } from './testing/memory-intent-store';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }]; // 500 cents at the student price

function intentOf(outcome: StartOutcome | RetryOutcome): IntentRecord {
  if ('intent' in outcome) return outcome.intent;
  throw new Error(`expected an intent, got ${outcome.type}`);
}

function payment(record: IntentRecord | undefined): PayOrderIntent {
  assert.ok(record?.kind === 'payOrder', 'expected a payment intent');
  return record;
}

function refund(record: IntentRecord | undefined): RefundIntent {
  assert.ok(record?.kind === 'refundPayment', 'expected a refund intent');
  return record;
}

describe('payment intents', () => {
  it('saves the intent before the request leaves, and sends nothing if saving fails', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);

    let storedWhenSent: string[] = [];
    env.server.onRequest = (route) => {
      if (route === 'createPayment') storedWhenSent = env.store.rawEntries(app.scope);
    };
    await app.controller.payOrder(orderId, 500);
    assert.equal(storedWhenSent.length, 1);
    assert.match(storedWhenSent[0] ?? '', /"state":"submitting"/);

    const other = env.server.seedOrder(PASTA);
    env.store.failNext();
    const outcome = await app.controller.payOrder(other, 500);
    assert.equal(outcome.type, 'storage_failed');
    assert.equal(env.server.postedWrites('createPayment').length, 1); // only the first order's
  });

  it('gives two rapid submissions one intent, one key and one request', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);

    const [first, second] = await Promise.all([
      app.controller.payOrder(orderId, 500),
      app.controller.payOrder(orderId, 500),
    ]);

    assert.deepEqual([first.type, second.type], ['submitted', 'existing']);
    assert.equal(intentOf(first).key, intentOf(second).key);
    assert.equal(env.server.postedWrites('createPayment').length, 1);
  });

  it('recovers a payment the server recorded when the response was lost, with the same key and body', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });

    const lost = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    assert.equal(lost.state, 'unknown');
    assert.equal(paymentDisplay(lost), 'checking');

    const retried = await app.controller.retry(lost.key);
    const recovered = payment(intentOf(retried));
    const [serverPayment] = env.server.paymentsForOrder(orderId);
    assert.equal(recovered.state, 'applied');
    assert.equal(recovered.resource?.paymentId, serverPayment?.id);

    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts.length, 2);
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
    assert.equal(posts[1]?.body, posts[0]?.body);
    assert.equal(env.server.applied.createPayment, 1);
  });

  it('after a restart, keeps the saved intent unknown until its own same-key resend settles it', async () => {
    const env = new TestEnvironment();
    const first = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const lost = intentOf(await first.controller.payOrder(orderId, 500));
    first.controller.dispose();

    const restarted = await env.startApp('student');
    assert.equal(restarted.controller.get(lost.key)?.state, 'unknown');
    await restarted.controller.reconcile(lost.key); // reads only: nothing is sent again
    assert.equal(restarted.controller.get(lost.key)?.state, 'unknown');
    assert.equal(env.server.postedWrites('createPayment').length, 1);

    const recovered = payment(intentOf(await restarted.controller.retry(lost.key)));
    assert.equal(recovered.state, 'applied');
    assert.equal(paymentDisplay(recovered), 'pending');
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
    assert.equal(env.server.applied.createPayment, 1);
  });

  it('keeps an unknown payment recoverable across an account switch', async () => {
    const env = new TestEnvironment();
    const student = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const lost = intentOf(await student.controller.payOrder(orderId, 500));
    student.controller.dispose();

    const staff = await env.startApp('staff'); // same device, another account
    assert.deepEqual(staff.controller.list(), []);
    staff.controller.dispose();

    const back = await env.startApp('student');
    assert.equal(back.controller.get(lost.key)?.state, 'unknown');
    assert.equal(payment(intentOf(await back.controller.retry(lost.key))).state, 'applied');
  });

  it('never turns an empty 2xx body or a proxy error into success or into a new intent', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'malformed_success', body: '' });

    const empty = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    assert.equal(empty.state, 'unknown');
    assert.notEqual(paymentDisplay(empty), 'confirmed');
    const tapAgain = await app.controller.payOrder(orderId, 500);
    assert.deepEqual([tapAgain.type, intentOf(tapAgain).key], ['existing', empty.key]);
    await app.controller.reconcile(empty.key); // a read cannot tie the payment to this attempt
    assert.equal(paymentDisplay(payment(app.controller.get(empty.key))), 'checking');
    await app.controller.retry(empty.key); // its own same-key resend can
    assert.equal(paymentDisplay(payment(app.controller.get(empty.key))), 'pending');

    const second = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'proxy_html', applied: false });
    const proxy = intentOf(await app.controller.payOrder(second, 500));
    assert.equal(proxy.state, 'unknown');
    await app.controller.reconcile(proxy.key); // reads show nothing, which proves nothing
    assert.equal(app.controller.get(proxy.key)?.state, 'unknown');
    await app.controller.retry(proxy.key);
    assert.equal(app.controller.get(proxy.key)?.state, 'applied');
    assert.equal(env.server.applied.createPayment, 2); // one per order
  });

  it('does not let a refusal on a retry settle an earlier ambiguous attempt', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject(
      'createPayment',
      { type: 'gateway', code: 'timeout', applied: true },
      { type: 'problem', status: 503, code: 'unavailable' },
    );

    const lost = intentOf(await app.controller.payOrder(orderId, 500));
    await app.controller.retry(lost.key);
    const afterRefusal = app.controller.get(lost.key);
    assert.deepEqual([afterRefusal?.state, afterRefusal?.refusal], ['unknown', 'unavailable']);

    await app.controller.reconcile(lost.key);
    assert.equal(app.controller.get(lost.key)?.state, 'unknown');
    await app.controller.retry(lost.key); // the next resend gets the original payment back
    assert.equal(app.controller.get(lost.key)?.state, 'applied');
    assert.equal(env.server.applied.createPayment, 1);
  });

  it('beyond the key retention window it never replays, and reads alone leave the outcome unknown', async () => {
    const env = new TestEnvironment();
    const first = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const lost = intentOf(await first.controller.payOrder(orderId, 500));
    const [recorded] = env.server.paymentsForOrder(orderId);
    env.server.settlePayment(recorded?.id ?? '', 'confirmed');
    first.controller.dispose();

    await env.advance(25 * 60 * 60 * 1000);
    const later = await env.startApp('student');
    const retried = await later.controller.retry(lost.key);
    assert.deepEqual(
      [retried.type, retried.type === 'replay_not_allowed' && retried.reason],
      ['replay_not_allowed', 'retention_may_have_expired'],
    );

    // The server's confirmed payment exists, but no read can show it came from this attempt.
    await later.controller.reconcile(lost.key);
    assert.equal(paymentDisplay(payment(later.controller.get(lost.key))), 'checking');
    assert.equal(env.server.postedWrites('createPayment').length, 1);
  });

  it('blocks new payments by maintenance or version but keeps reconciling earlier ones', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    const pending = payment(
      intentOf(await app.controller.payOrder(env.server.seedOrder(PASTA), 500)),
    );
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const lost = intentOf(await app.controller.payOrder(orderId, 500));

    env.server.config.paymentsEnabled = false;
    const blocked = await app.controller.payOrder(env.server.seedOrder(PASTA), 500);
    assert.deepEqual(blocked, {
      type: 'blocked',
      gate: { status: 'blocked', reason: 'payments_paused' },
    });
    assert.equal((await app.controller.retry(lost.key)).type, 'blocked'); // no write while paused
    env.server.settlePayment(pending.resource?.paymentId ?? '', 'confirmed');
    await app.controller.reconcile(pending.key); // reads still work
    assert.equal(paymentDisplay(payment(app.controller.get(pending.key))), 'confirmed');

    env.server.config.paymentsEnabled = true;
    env.server.config.minAppVersion = '1.10.0';
    const outdated = await env.startApp('staff', { appVersion: '1.2.0' });
    const update = await outdated.controller.payOrder(env.server.seedOrder(PASTA), 650);
    assert.equal(
      update.type === 'blocked' && update.gate.status === 'blocked' && update.gate.reason,
      'update_required',
    );

    // The server refuses after a passing pre-check: the gate closes, the intent is not settled as failed.
    env.server.config.minAppVersion = '1.0.0';
    env.server.inject('createPayment', {
      type: 'problem',
      status: 426,
      code: 'app_version_unsupported',
    });
    const refused = intentOf(await app.controller.payOrder(env.server.seedOrder(PASTA), 500));
    assert.deepEqual([refused.state, refused.refusal], ['ready', 'app_version_unsupported']);
    assert.equal(app.gate.state().status, 'blocked');
    assert.equal(env.server.postedWrites('createPayment').length, 3); // pending, lost and refused
  });

  it('tells a payer whose order was paid by someone else that they were not charged, never that they paid', async () => {
    const env = new TestEnvironment();
    const student = await env.startApp('student');
    const staff = await env.startApp('staff');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: false });

    const lost = intentOf(await student.controller.payOrder(orderId, 500));
    const other = payment(intentOf(await staff.controller.payOrder(orderId, 650)));
    env.server.settlePayment(other.resource?.paymentId ?? '', 'confirmed');

    await student.controller.reconcile(lost.key);
    const settled = payment(student.controller.get(lost.key));
    assert.deepEqual([settled.state, settled.refusal], ['rejected', 'order_paid_by_other']);
    assert.equal(paymentDisplay(settled), 'refused');
  });

  it('keeps a payment pending when its order expires meanwhile; polling stops without deciding', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student', {
      polling: { backoffMs: [1_000], budgetMs: 60_000 },
    });
    const orderId = env.server.seedOrder(PASTA);
    const pending = payment(intentOf(await app.controller.payOrder(orderId, 500)));

    await env.advance(6 * 60_000);
    assert.equal(expiryState(env.server.orderExpiresAt(orderId), app.clock.now()), 'expired');
    assert.equal(paymentDisplay(payment(app.controller.get(pending.key))), 'pending');
    assert.equal(app.controller.pollState(pending.key), 'stopped');

    env.server.settlePayment(pending.resource?.paymentId ?? '', 'confirmed');
    app.controller.setActive(false);
    app.controller.setActive(true); // back in the foreground: fresh budget, immediate read
    await env.advance(0);
    assert.equal(paymentDisplay(payment(app.controller.get(pending.key))), 'confirmed');
  });

  it('does not regress a confirmed payment when a stale read arrives', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    const intent = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    env.server.settlePayment(intent.resource?.paymentId ?? '', 'confirmed');
    await app.controller.reconcile(intent.key);
    assert.equal(paymentDisplay(payment(app.controller.get(intent.key))), 'confirmed');

    env.server.inject('getPayment', { type: 'stale' });
    await app.controller.reconcile(intent.key);
    const after = payment(app.controller.get(intent.key));
    assert.equal(paymentDisplay(after), 'confirmed');
    assert.equal(
      app.controller.cache.paymentView(after.resource?.paymentId ?? '')?.payment.status,
      'confirmed',
    );
  });

  it('treats a declined payment as final; only a deliberate new action gets a new key', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    const first = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    env.server.settlePayment(first.resource?.paymentId ?? '', 'declined');
    await app.controller.reconcile(first.key);
    assert.equal(paymentDisplay(payment(app.controller.get(first.key))), 'declined');

    const duplicate = await app.controller.payOrder(orderId, 500);
    assert.deepEqual([duplicate.type, intentOf(duplicate).key], ['existing', first.key]);
    const deliberate = await app.controller.payOrder(orderId, 500, { afterFinalKey: first.key });
    assert.equal(deliberate.type, 'submitted');
    assert.notEqual(intentOf(deliberate).key, first.key);
    assert.equal(env.server.applied.createPayment, 2);
  });
});

describe('payment recovery after an earlier declined attempt', () => {
  /**
   * Attempt A for order O declines; the payer deliberately starts B (new key, same order, payer and
   * amount), B reaches the server but its response is lost, A's record is removed, and the app
   * restarts with only B on disk. A and B now look alike in every read: same order, payer, amount.
   */
  async function declinedThenLost(env: TestEnvironment) {
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    const a = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    const paymentA = a.resource?.paymentId ?? '';
    env.server.settlePayment(paymentA, 'declined');
    await app.controller.reconcile(a.key);
    assert.equal(paymentDisplay(payment(app.controller.get(a.key))), 'declined');

    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const b = intentOf(await app.controller.payOrder(orderId, 500, { afterFinalKey: a.key }));
    assert.equal(b.state, 'unknown');
    assert.equal(app.controller.get(a.key), undefined); // A's record is gone
    app.controller.dispose();

    const restarted = await env.startApp('student'); // empty cache, only B's record on disk
    assert.deepEqual(
      restarted.controller.list().map((record) => record.key),
      [b.key],
    );
    return { restarted, orderId, paymentA, b };
  }

  it('does not let a stale order read that names A resolve B', async () => {
    const env = new TestEnvironment();
    const { restarted, paymentA, b } = await declinedThenLost(env);
    // Two versions back the order was "paying" with payment A; A itself now reads as declined.
    env.server.inject('getOrder', { type: 'stale', depth: 2 });

    await restarted.controller.reconcile(b.key);
    const after = payment(restarted.controller.get(b.key));
    assert.deepEqual([after.state, after.resource], ['unknown', null]);
    assert.equal(paymentDisplay(after), 'checking');

    // B's own same-key resend is the evidence: the server replays B, not A.
    const resent = payment(intentOf(await restarted.controller.retry(b.key)));
    assert.equal(resent.state, 'applied');
    assert.notEqual(resent.resource?.paymentId, paymentA);
    assert.equal(paymentDisplay(resent), 'pending');
    assert.equal(env.server.applied.createPayment, 2); // A and B, nothing more
  });

  it('does not let a payment search that returns A but not yet B resolve B', async () => {
    const env = new TestEnvironment();
    const { restarted, b } = await declinedThenLost(env);
    env.server.inject('getOrder', { type: 'stale' }); // "open" again after A, before B
    env.server.inject('listPayments', { type: 'stale' }); // B not listed yet; A is

    await restarted.controller.reconcile(b.key);
    assert.equal(paymentDisplay(payment(restarted.controller.get(b.key))), 'checking');
    assert.equal(restarted.controller.get(b.key)?.resource, null);
  });
});

describe('hostile responses', () => {
  it("never takes a payment that names another payer as this payer's, from a write or a read", async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'foreign_payer' });

    // The server applied it, but the 201 names someone else: not proof of our payment.
    const hostile = payment(intentOf(await app.controller.payOrder(orderId, 500)));
    assert.deepEqual([hostile.state, hostile.resource], ['unknown', null]);
    const resent = payment(intentOf(await app.controller.retry(hostile.key)));
    assert.equal(resent.state, 'applied'); // the replay names the right payer
    assert.equal(env.server.applied.createPayment, 1);

    // A read of a known payment that names someone else changes nothing.
    env.server.settlePayment(resent.resource?.paymentId ?? '', 'confirmed');
    env.server.inject('getPayment', { type: 'foreign_payer' });
    await app.controller.reconcile(resent.key);
    assert.equal(paymentDisplay(payment(app.controller.get(resent.key))), 'pending');
    await app.controller.reconcile(resent.key);
    assert.equal(paymentDisplay(payment(app.controller.get(resent.key))), 'confirmed');
  });
});

describe('refund intents', () => {
  it('counts pending refunds against capacity and never creates a second refund after a lost response', async () => {
    const env = new TestEnvironment();
    const student = await env.startApp('student');
    const orderId = env.server.seedOrder([{ itemId: 'itm_pasta', quantity: 2 }]); // 1000 cents
    const paid = payment(intentOf(await student.controller.payOrder(orderId, 1000)));
    const paymentId = paid.resource?.paymentId ?? '';
    env.server.settlePayment(paymentId, 'confirmed');

    const till = await env.startApp('cashier');
    env.server.inject('createRefund', { type: 'lose_response', applied: true });
    const lost = refund(intentOf(await till.controller.refund(paymentId, 600, 'wrong dish')));
    assert.equal(lost.state, 'unknown');
    assert.equal((await till.controller.refund(paymentId, 600, 'wrong dish')).type, 'existing');
    assert.equal((await till.controller.refund(paymentId, 300, null)).type, 'conflict');
    assert.equal(env.server.applied.createRefund, 1);

    await till.controller.retry(lost.key); // same key: the server returns the original refund
    const recovered = refund(till.controller.get(lost.key));
    assert.deepEqual([recovered.state, recovered.resource?.status], ['applied', 'pending']);
    assert.equal(env.server.refundsForPayment(paymentId).length, 1);

    // A second till device: the pending 600 reserves capacity, so only 400 remain.
    const otherDevice = await env.startApp('cashier', { store: new MemoryIntentStore() });
    const tooMuch = await otherDevice.controller.refund(paymentId, 500, null);
    assert.deepEqual(tooMuch, { type: 'not_allowed', reason: 'exceeds_refundable' });
    const rest = refund(intentOf(await otherDevice.controller.refund(paymentId, 400, null)));
    env.server.finishRefund(rest.resource?.refundId ?? '', 'completed');
    await otherDevice.controller.reconcile(rest.key);
    assert.equal(refund(otherDevice.controller.get(rest.key)).resource?.status, 'completed');

    // Nothing is left (zero is a legitimate refundable amount); a new refund is refused locally.
    const nothingLeft = await otherDevice.controller.refund(paymentId, 1, null, {
      afterFinalKey: rest.key,
    });
    assert.deepEqual(nothingLeft, { type: 'not_allowed', reason: 'exceeds_refundable' });
    assert.equal(env.server.applied.createRefund, 2);
  });
});

describe('unresolved refunds', () => {
  it('stay unresolved and keep blocking another refund: no dismissal, deadline or restart settles them', async () => {
    const env = new TestEnvironment();
    const student = await env.startApp('student');
    const orderId = env.server.seedOrder([{ itemId: 'itm_pasta', quantity: 2 }]); // 1000 cents
    const paid = payment(intentOf(await student.controller.payOrder(orderId, 1000)));
    const paymentId = paid.resource?.paymentId ?? '';
    env.server.settlePayment(paymentId, 'confirmed');

    const till = await env.startApp('cashier');
    env.server.inject('createRefund', { type: 'lose_response', applied: false });
    const lost = refund(intentOf(await till.controller.refund(paymentId, 400, null)));
    assert.equal(lost.state, 'unknown');
    assert.equal(await till.controller.acknowledge(lost.key), false); // cannot be dismissed

    await env.advance(25 * 60 * 60 * 1000); // past the replay window
    till.controller.dispose();
    const restarted = await env.startApp('cashier');
    assert.equal((await restarted.controller.retry(lost.key)).type, 'replay_not_allowed');
    await restarted.controller.reconcile(lost.key); // the history shows no refund: proves nothing
    assert.equal(restarted.controller.get(lost.key)?.state, 'unknown');
    assert.equal(await restarted.controller.acknowledge(lost.key), false);
    assert.equal((await restarted.controller.refund(paymentId, 300, null)).type, 'conflict');
    assert.equal(env.server.postedWrites('createRefund').length, 1);
  });
});

describe('order intents (till)', () => {
  it('recovers a lost create-order response only through a same-key replay', async () => {
    const env = new TestEnvironment();
    const till = await env.startApp('cashier');
    env.server.inject('createOrder', {
      type: 'gateway',
      code: 'connection_dropped',
      applied: true,
    });

    const lost = intentOf(await till.controller.createOrder(PASTA));
    assert.equal(lost.state, 'unknown');
    await till.controller.reconcile(lost.key); // no order list exists to read from
    assert.equal(till.controller.get(lost.key)?.state, 'unknown');

    await till.controller.retry(lost.key);
    const recovered = till.controller.get(lost.key);
    assert.ok(recovered?.kind === 'createOrder' && recovered.resource);
    assert.deepEqual([recovered.state, recovered.resource.status], ['applied', 'open']);
    assert.equal(env.server.applied.createOrder, 1);
    const posts = env.server.postedWrites('createOrder');
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
  });

  it('keeps one order in progress at a time; a new order needs the previous result acknowledged', async () => {
    const env = new TestEnvironment();
    const till = await env.startApp('cashier');
    const first = intentOf(await till.controller.createOrder(PASTA));
    assert.equal((await till.controller.createOrder(PASTA)).type, 'existing');
    const next = await till.controller.createOrder([{ itemId: 'itm_salad', quantity: 2 }], {
      afterFinalKey: first.key,
    });
    assert.equal(next.type, 'submitted');
    assert.equal(till.controller.get(first.key), undefined); // the acknowledged result is gone
    assert.equal(env.server.applied.createOrder, 2);
  });

  it('follows its order to expired although expiry keeps the version, and a stale read cannot undo it', async () => {
    const env = new TestEnvironment();
    const till = await env.startApp('cashier', {
      polling: { backoffMs: [30_000], budgetMs: 10 * 60_000 },
    });
    const created = intentOf(await till.controller.createOrder(PASTA));
    assert.equal(till.controller.pollState(created.key), 'polling');

    await env.advance(6 * 60_000); // past expiresAt; the server's version stays 1
    const expired = till.controller.get(created.key);
    assert.ok(expired?.kind === 'createOrder');
    assert.deepEqual(expired.resource && [expired.resource.status, expired.resource.version], [
      'expired',
      1,
    ]);
    assert.equal(till.controller.pollState(created.key), 'idle'); // nothing left to learn

    env.server.inject('getOrder', { type: 'stale' }); // answers with the earlier open copy
    await till.controller.reconcile(created.key);
    const after = till.controller.get(created.key);
    assert.equal(after?.kind === 'createOrder' && after.resource?.status, 'expired');
    assert.equal(till.controller.cache.order(expired.resource?.orderId ?? '')?.status, 'expired');
  });
});
