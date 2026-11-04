import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONNECTIVITY_SETTLE_MS, GateRecovery } from './gate-recovery';
import { FakeConnectivity } from './testing/fake-connectivity';
import type { Fault } from './testing/fake-server';
import { TestEnvironment } from './testing/harness';

/** No answer at all, like a request sent while the device is offline. */
const LOST: Fault = { type: 'lose_response', applied: false };
/** The network is fine, the API is not. */
const DOWN: Fault = { type: 'problem', status: 503, code: 'unavailable' };
const OPEN = { status: 'open' };
const UNAVAILABLE = { status: 'blocked', reason: 'config_unavailable' };
const MINUTES_10 = 10 * 60_000;

async function setup() {
  const env = new TestEnvironment();
  const app = await env.startApp('student');
  const connectivity = new FakeConnectivity();
  const recovery = new GateRecovery(app.gate, env.scheduler, { connectivity });
  const reads = () => env.server.requests.filter((request) => request.route === 'getConfig').length;
  return { env, gate: app.gate, connectivity, recovery, reads };
}

describe('payment availability recovery (BUG-01)', () => {
  it('offline → online in the foreground: the returned connection re-reads and opens payments', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST);
    recovery.start(); // the start-up read, offline
    connectivity.report(false);
    await gate.refresh(); // joins it
    assert.deepEqual(gate.state(), UNAVAILABLE);

    connectivity.report(true); // back, without leaving the screen or the app
    assert.equal(reads(), 1, 'nothing is read before the connection has settled');
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.equal(reads(), 2);
    assert.deepEqual(gate.state(), OPEN);

    await env.advance(MINUTES_10);
    assert.equal(reads(), 2, 'no polling once the server has answered');
    recovery.dispose();
  });

  it('a first report of a network after a failed start-up read re-reads at once', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST); // the network was not up yet at start-up
    recovery.start();
    await gate.refresh();
    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.equal(reads(), 2);
    assert.deepEqual(gate.state(), OPEN);
    recovery.dispose();
  });

  it('a returned connection sends a fresh GET /config instead of waiting for one that left offline', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    const releaseHung = env.server.holdNext('getConfig');
    recovery.start(); // this read hangs, as one sent on a dead connection can
    const startup = gate.refresh();
    connectivity.report(false);
    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.equal(reads(), 2, 'a second, fresh read');
    assert.deepEqual(gate.state(), OPEN);

    env.server.inject('getConfig', LOST);
    releaseHung(); // the hung read finally fails
    assert.deepEqual(await startup, OPEN, 'its caller gets the newest outcome');
    assert.deepEqual(gate.state(), OPEN, 'its late failure changes nothing');
    recovery.dispose();
  });

  it('connectivity back but the API unreachable: payments stay blocked, spaced re-reads stop after four', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST);
    recovery.start();
    connectivity.report(false);
    await gate.refresh();
    env.server.inject('getConfig', DOWN, DOWN, DOWN, DOWN, DOWN);
    const readAt: number[] = [];
    env.server.onRequest = (route) => {
      if (route === 'getConfig') readAt.push(env.scheduler.now());
    };

    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.equal(reads(), 2);
    assert.deepEqual(gate.state(), UNAVAILABLE, 'a network alone never opens payments');

    await env.advance(MINUTES_10);
    const gapsSeconds = readAt
      .slice(1)
      .map((at, index) => Math.round((at - (readAt[index] ?? 0)) / 1000));
    assert.deepEqual(gapsSeconds, [5, 15, 30, 60], 'four spaced re-reads after the failed one');
    assert.equal(reads(), 6, 'bounded: then it waits for an event or the user');
    assert.deepEqual(gate.state(), UNAVAILABLE);

    assert.deepEqual(await recovery.checkNow(), OPEN, 'the API is back; the user checks again');
    assert.equal(reads(), 7);
    recovery.dispose();
  });

  it('a spaced re-read that gets an answer opens payments and ends the retries', async () => {
    const { env, gate, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST, DOWN);
    recovery.start();
    await gate.refresh();
    await env.advance(6_000); // the first re-read, 5 s later: 503
    assert.equal(reads(), 2);
    await env.advance(16_000); // the second, 15 s after that: answered
    assert.equal(reads(), 3);
    assert.deepEqual(gate.state(), OPEN);
    await env.advance(MINUTES_10);
    assert.equal(reads(), 3);
    recovery.dispose();
  });

  it('reconnection with payments switched off meanwhile: paused, not open, and not re-read on a timer', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    recovery.start();
    connectivity.report(true);
    await gate.refresh();
    assert.deepEqual(gate.state(), OPEN);

    connectivity.report(false);
    env.server.config.paymentsEnabled = false; // the kill switch, while the phone was offline
    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.deepEqual(gate.state(), { status: 'blocked', reason: 'payments_paused' });
    await env.advance(MINUTES_10);
    assert.equal(reads(), 2, 'an answer is not a failure: no retries');
    recovery.dispose();
  });

  it('reconnection with a higher minimum version: blocked until an update', async () => {
    const { env, gate, connectivity, recovery } = await setup();
    recovery.start();
    connectivity.report(true);
    await gate.refresh();
    connectivity.report(false);
    env.server.config.minAppVersion = '1.1.0';
    connectivity.report(true);
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.deepEqual(gate.state(), {
      status: 'blocked',
      reason: 'update_required',
      current: '1.0.0',
      minimum: '1.1.0',
    });
    recovery.dispose();
  });

  it('repeated connectivity events: one read per settled return, none for repeats or joined checks', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    recovery.start();
    connectivity.report(true);
    await gate.refresh();
    assert.equal(reads(), 1);

    for (let flap = 0; flap < 5; flap += 1) {
      connectivity.report(false);
      await env.advance(200);
      connectivity.report(true);
      await env.advance(200);
    }
    assert.equal(reads(), 1, 'a handover burst is not read while it lasts');
    await env.advance(CONNECTIVITY_SETTLE_MS);
    assert.equal(reads(), 2, 'one read for the whole burst');

    connectivity.report(true);
    connectivity.report(true);
    await env.advance(MINUTES_10);
    assert.equal(reads(), 2, 'a repeated "online" is no change');

    await Promise.all([recovery.checkNow(), recovery.checkNow(), gate.refresh()]);
    assert.equal(reads(), 3, 'concurrent checks share one request');
    recovery.dispose();
  });

  it('a connection back while the app is away: the return reads afresh, not the read that hung', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    const releaseHung = env.server.holdNext('getConfig');
    recovery.start();
    const hung = gate.refresh();
    connectivity.report(false);
    recovery.setForeground(false);
    connectivity.report(true);
    await env.advance(MINUTES_10);
    assert.equal(reads(), 1, 'nothing is read in the background');

    recovery.setForeground(true);
    assert.equal(reads(), 2, 'a fresh read, not joining the hung one');
    assert.deepEqual(await gate.refresh(), OPEN);
    releaseHung();
    assert.deepEqual(await hung, OPEN);
    recovery.dispose();
  });

  it('a return still settling when the app leaves is read afresh when it comes back', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    const releaseHung = env.server.holdNext('getConfig');
    recovery.start();
    const hung = gate.refresh();
    connectivity.report(false);
    connectivity.report(true);
    recovery.setForeground(false); // within the settle time, e.g. a system prompt
    recovery.setForeground(true);
    assert.equal(reads(), 2);
    assert.deepEqual(await gate.refresh(), OPEN);
    releaseHung();
    await hung;
    recovery.dispose();
  });

  it('background and foreground: nothing runs away, one read on return, nothing after dispose', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST);
    recovery.start();
    connectivity.report(false);
    await gate.refresh();
    assert.equal(env.scheduler.pending(), 1, 'a spaced re-read is scheduled');

    recovery.setForeground(false);
    assert.equal(env.scheduler.pending(), 0, 'its timer stops in the background');
    connectivity.report(true); // back while the app is away
    await env.advance(MINUTES_10);
    assert.equal(reads(), 1, 'nothing is read in the background');

    recovery.setForeground(true);
    recovery.setForeground(false); // e.g. a system prompt
    recovery.setForeground(true);
    await gate.refresh();
    assert.equal(reads(), 2, 'one read for the return, joined by the second');
    assert.deepEqual(gate.state(), OPEN);

    recovery.dispose();
    assert.equal(connectivity.listenerCount(), 0, 'the connectivity listener is removed');
    assert.equal(env.scheduler.pending(), 0);
    env.server.inject('getConfig', LOST);
    await gate.refresh(); // e.g. the pre-payment check, offline
    connectivity.report(false);
    connectivity.report(true);
    recovery.setForeground(true);
    await env.advance(MINUTES_10);
    assert.equal(reads(), 3, 'a disposed recovery schedules and reads nothing');
    assert.equal(env.scheduler.pending(), 0);
  });

  it('dispose stops a scheduled re-read and a settling return', async () => {
    const { env, gate, connectivity, recovery, reads } = await setup();
    env.server.inject('getConfig', LOST);
    recovery.start();
    connectivity.report(false);
    await gate.refresh();
    assert.equal(env.scheduler.pending(), 1, 'a spaced re-read');
    recovery.dispose();
    assert.equal(env.scheduler.pending(), 0);

    const settling = new GateRecovery(gate, env.scheduler, { connectivity });
    settling.start();
    connectivity.report(false);
    connectivity.report(true);
    assert.equal(env.scheduler.pending(), 1, 'a return settling');
    settling.dispose();
    assert.equal(env.scheduler.pending(), 0);
    await env.advance(MINUTES_10);
    assert.equal(reads(), 2, 'only the two start-up reads');
  });
});
