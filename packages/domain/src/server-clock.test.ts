import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { newIntent, replayPermission, REPLAY_WINDOW_MS } from './intent';
import { expiryState, ServerClock } from './server-clock';
import { TestEnvironment } from './testing/harness';

const T = Date.UTC(2026, 9, 31, 12, 0, 0);

function clockAt(mono: { value: number }) {
  return new ServerClock(() => mono.value);
}

describe('ServerClock', () => {
  afterEach(() => mock.restoreAll());

  it('bounds server time by the request delay and whole-second precision', () => {
    const mono = { value: 1_000 };
    const clock = clockAt(mono);
    assert.equal(clock.now(), null);

    clock.observe({ serverDate: new Date(T), sentAt: 1_000, receivedAt: 1_300 });
    mono.value = 1_300;
    assert.deepEqual(clock.now(), { earliest: T, latest: T + 999 + 300 });

    // A second, faster sample narrows the interval.
    mono.value = 5_000;
    clock.observe({ serverDate: new Date(T + 3_000), sentAt: 4_950, receivedAt: 5_000 });
    const now = clock.now();
    assert.ok(now && now.latest - now.earliest <= 999 + 50);
  });

  it('does not read the device clock: changing it moves nothing', () => {
    const mono = { value: 1_000 };
    const clock = clockAt(mono);
    clock.observe({ serverDate: new Date(T), sentAt: 1_000, receivedAt: 1_000 });
    const before = clock.now();

    mock.method(Date, 'now', () => T + 30 * 60 * 60 * 1000); // device clock set 30 h ahead
    assert.deepEqual(clock.now(), before);

    const intent = {
      ...newIntent({ kind: 'payOrder', payload: { orderId: 'o', amountCents: 1 } }, 'k', {
        candidateId: 'c',
        userId: 'u',
      }),
      firstSentAt: T - 60_000,
    };
    assert.deepEqual(replayPermission(intent, clock.now()), { allowed: true });
    assert.equal(expiryState(T + 5 * 60_000, clock.now()), 'not_expired');

    mock.method(Date, 'now', () => T - 30 * 60 * 60 * 1000); // and 30 h behind
    const old = { ...intent, firstSentAt: T - REPLAY_WINDOW_MS - 1 };
    assert.equal(replayPermission(old, clock.now()).allowed, false);
  });

  it('replaces its estimate when a sample contradicts it, and forgets it on invalidate', () => {
    const mono = { value: 0 };
    const clock = clockAt(mono);
    clock.observe({ serverDate: new Date(T), sentAt: 0, receivedAt: 100 });
    clock.observe({ serverDate: new Date(T + 60 * 60_000), sentAt: 100, receivedAt: 200 }); // server clock moved
    mono.value = 200;
    assert.ok((clock.now()?.earliest ?? 0) >= T + 60 * 60_000 - 200);
    clock.invalidate();
    assert.equal(clock.now(), null);
  });

  it('leaves time unknown on invalid Date headers, and then refuses to start a write', async () => {
    const env = new TestEnvironment();
    env.server.inject('createSession', { type: 'bad_date' });
    env.server.inject('getConfig', { type: 'bad_date' }, { type: 'bad_date' });
    const app = await env.startApp('student');
    assert.equal(app.clock.now(), null);

    const outcome = await app.controller.payOrder(
      env.server.seedOrder([{ itemId: 'itm_pasta', quantity: 1 }]),
      500,
    );
    assert.deepEqual(outcome, { type: 'not_allowed', reason: 'server_time_unknown' });
    assert.equal(env.server.postedWrites('createPayment').length, 0);
  });
});
