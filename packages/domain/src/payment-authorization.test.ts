import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RetryOutcome, StartOutcome } from './intent-controller';
import {
  PaymentAuthorizer,
  type LocalAuthResult,
  type PaymentBinding,
} from './payment-authorization';
import { PASSWORD } from './testing/fake-server';
import { TestEnvironment } from './testing/harness';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }]; // 500 cents at the student price

/** Local-auth prompts the test answers by hand, to interleave events while they are open. */
function prompt() {
  const open: ((result: LocalAuthResult) => void)[] = [];
  return {
    authenticate: () => new Promise<LocalAuthResult>((resolve) => open.push(resolve)),
    answer: (result: LocalAuthResult) => open.splice(0).forEach((resolve) => resolve(result)),
    shown: () => open.length,
  };
}

async function setup() {
  const env = new TestEnvironment();
  const app = await env.startApp('student');
  const orderId = env.server.seedOrder(PASTA);
  const authorizer = new PaymentAuthorizer(() => app.session.user()?.id ?? null);
  const binding: PaymentBinding = {
    userId: app.scope.userId,
    orderId,
    amountCents: 500,
    reviewId: 1,
  };
  return { env, app, orderId, authorizer, binding };
}

describe('PaymentAuthorizer', () => {
  it('sends nothing when the prompt is cancelled, fails or has no credential', async () => {
    const { env, app, authorizer, binding } = await setup();
    for (const reason of ['cancelled', 'failed', 'not_enrolled'] as const) {
      const outcome = await authorizer.run({
        binding,
        authenticate: () => Promise.resolve({ ok: false, reason }),
        current: () => binding,
        send: () => app.controller.payOrder(binding.orderId, binding.amountCents),
      });
      assert.deepEqual(outcome, { type: 'not_authorized', reason });
    }
    assert.equal(env.server.postedWrites('createPayment').length, 0);
    assert.deepEqual(app.controller.list(), []);
  });

  it('opens one prompt and sends one payment for a double tap', async () => {
    const { env, app, authorizer, binding } = await setup();
    const auth = prompt();
    const pay = () =>
      authorizer.run<StartOutcome>({
        binding,
        authenticate: auth.authenticate,
        current: () => binding,
        send: () => app.controller.payOrder(binding.orderId, binding.amountCents),
      });

    const first = pay();
    const second = pay(); // refused synchronously, before any await
    assert.equal(auth.shown(), 1);
    auth.answer({ ok: true });
    const [outcome, again] = await Promise.all([first, second]);
    assert.deepEqual(again, { type: 'busy' });
    assert.equal(outcome.type === 'done' && outcome.result.type, 'submitted');
    assert.equal(env.server.postedWrites('createPayment').length, 1);
  });

  it('drops a successful prompt when the account changed meanwhile', async () => {
    const { env, app, authorizer, binding } = await setup();
    const auth = prompt();
    const paying = authorizer.run({
      binding,
      authenticate: auth.authenticate,
      current: () => binding,
      send: () => app.controller.payOrder(binding.orderId, binding.amountCents),
    });
    await app.session.signIn({ username: 'staff', password: PASSWORD });
    auth.answer({ ok: true });
    assert.deepEqual(await paying, { type: 'invalidated' });
    assert.equal(env.server.postedWrites('createPayment').length, 0);
  });

  it('drops a successful prompt when the reviewed order or amount changed, or the screen left', async () => {
    const { env, app, authorizer, binding } = await setup();
    const changed: (PaymentBinding | null)[] = [
      { ...binding, amountCents: 650 }, // a new read showed a different amount
      { ...binding, reviewId: 2 }, // a new read showed a different order state
      null, // the review screen is gone
    ];
    for (const now of changed) {
      const outcome = await authorizer.run({
        binding,
        authenticate: () => Promise.resolve({ ok: true }),
        current: () => now,
        send: () => app.controller.payOrder(binding.orderId, binding.amountCents),
      });
      assert.deepEqual(outcome, { type: 'invalidated' });
    }
    assert.equal(env.server.postedWrites('createPayment').length, 0);
  });

  it('guards the same-key resend of an unknown payment the same way, keeping its key', async () => {
    const { env, app, authorizer, binding } = await setup();
    env.server.inject('createPayment', { type: 'lose_response', applied: false });
    const started = await app.controller.payOrder(binding.orderId, binding.amountCents);
    assert.ok('intent' in started && started.intent.state === 'unknown');
    const key = started.intent.key;
    const resend = (result: LocalAuthResult) =>
      authorizer.run<RetryOutcome>({
        binding,
        authenticate: () => Promise.resolve(result),
        current: () => binding,
        send: () => app.controller.retry(key),
      });

    assert.equal((await resend({ ok: false, reason: 'cancelled' })).type, 'not_authorized');
    assert.equal(env.server.postedWrites('createPayment').length, 1); // only the lost one
    const outcome = await resend({ ok: true });
    assert.equal(outcome.type === 'done' && outcome.result.type, 'attempted');
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
    assert.equal(app.controller.get(key)?.state, 'applied');
  });
});
