import type { ApiResult, AppConfig } from '@mensa/api';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareAppVersions, parseAppVersion } from './app-version';
import { evaluatePaymentPolicy, PaymentGate } from './payment-gate';

const config = (minAppVersion: string, paymentsEnabled = true) => ({
  minAppVersion,
  paymentsEnabled,
});

const answer = (minAppVersion: string, paymentsEnabled = true): ApiResult<AppConfig> => ({
  kind: 'success',
  data: config(minAppVersion, paymentsEnabled),
  meta: { status: 200, durationMs: 5, serverDate: null, replayed: false },
});
const OFFLINE: ApiResult<AppConfig> = { kind: 'no_response', reason: 'network', durationMs: 1 };

/** Configuration reads that the test answers by hand, in any order. */
function heldReads() {
  const answers: ((result: ApiResult<AppConfig>) => void)[] = [];
  return {
    fetch: () => new Promise<ApiResult<AppConfig>>((resolve) => answers.push(resolve)),
    answer: (index: number, result: ApiResult<AppConfig>) => answers[index]?.(result),
    count: () => answers.length,
  };
}

describe('app versions', () => {
  it('compares numerically, part by part', () => {
    const v = (text: string) => parseAppVersion(text) ?? assert.fail(text);
    assert.equal(compareAppVersions(v('1.10.0'), v('1.2.0')), 1); // a string compare says the opposite
    assert.equal(compareAppVersions(v('1.0.0'), v('1.0.0')), 0);
    assert.equal(compareAppVersions(v('1.99.99'), v('2.0.0')), -1);
  });

  it('rejects anything that is not major.minor.patch', () => {
    for (const text of ['1.0', '1.0.0-beta', '01.0.0', 'v1.0.0', '', undefined]) {
      assert.equal(parseAppVersion(text), null, String(text));
    }
  });
});

describe('payment policy', () => {
  it('fails closed on missing configuration or invalid versions', () => {
    assert.deepEqual(evaluatePaymentPolicy(undefined, config('1.0.0')), {
      status: 'blocked',
      reason: 'invalid_app_version',
    });
    assert.deepEqual(evaluatePaymentPolicy('1.0.0', null), {
      status: 'blocked',
      reason: 'config_unavailable',
    });
    assert.deepEqual(evaluatePaymentPolicy('1.0.0', config('latest')), {
      status: 'blocked',
      reason: 'invalid_min_version',
    });
  });

  it('blocks below the minimum version or while payments are paused', () => {
    assert.deepEqual(evaluatePaymentPolicy('1.2.0', config('1.10.0')), {
      status: 'blocked',
      reason: 'update_required',
      current: '1.2.0',
      minimum: '1.10.0',
    });
    assert.deepEqual(evaluatePaymentPolicy('1.10.0', config('1.2.0', false)), {
      status: 'blocked',
      reason: 'payments_paused',
    });
    assert.deepEqual(evaluatePaymentPolicy('1.10.0', config('1.2.0')), { status: 'open' });
  });
});

describe('payment gate reads (BUG-01)', () => {
  it('a fresh read overtakes one that left before the connection came back', async () => {
    const reads = heldReads();
    const gate = new PaymentGate('1.0.0', reads.fetch);
    const offlineRead = gate.refresh(); // left while offline; may hang until the transport timeout
    const joined = gate.refresh();
    assert.equal(reads.count(), 1, 'a second caller joins the read on its way');

    const fresh = gate.refresh({ fresh: true }); // the connection is back
    assert.equal(reads.count(), 2);
    reads.answer(1, answer('1.0.0'));
    assert.deepEqual(await fresh, { status: 'open' });

    reads.answer(0, OFFLINE); // the old read fails late
    assert.deepEqual(await offlineRead, { status: 'open' }, 'its callers get the newest outcome');
    assert.deepEqual(await joined, { status: 'open' });
    assert.deepEqual(gate.state(), { status: 'open' });
  });

  it('an earlier read that answers after a newer one changes nothing', async () => {
    const reads = heldReads();
    const gate = new PaymentGate('1.0.0', reads.fetch);
    const older = gate.refresh();
    const newer = gate.refresh({ fresh: true });
    reads.answer(1, answer('1.0.0', false)); // the newer read: paused
    const paused = { status: 'blocked', reason: 'payments_paused' };
    assert.deepEqual(await newer, paused);

    reads.answer(0, answer('1.0.0')); // the older read said "open"
    assert.deepEqual(await older, paused);
    assert.deepEqual(gate.state(), paused, 'an older "open" never reopens payments');
  });

  it('a read that left before a server refusal cannot reopen payments', async () => {
    const reads = heldReads();
    const gate = new PaymentGate('1.0.0', reads.fetch);
    const before = gate.refresh();
    gate.noteServerRefusal('payments_disabled');
    reads.answer(0, answer('1.0.0')); // read before the server switched payments off
    const paused = { status: 'blocked', reason: 'payments_paused' };
    assert.deepEqual(await before, paused);
    assert.deepEqual(gate.state(), paused);

    const after = gate.refresh(); // a read that leaves after the refusal decides again
    assert.equal(reads.count(), 2, 'it does not join the overtaken read');
    reads.answer(1, answer('1.0.0'));
    assert.deepEqual(await after, { status: 'open' });
  });

  it('reports a read on its way to listeners, and fails closed when the read throws', async () => {
    const gate = new PaymentGate('1.0.0', () => Promise.reject(new Error('transport bug')));
    const seen: boolean[] = [];
    gate.subscribe(() => seen.push(gate.isRefreshing()));
    const reading = gate.refresh();
    assert.equal(gate.isRefreshing(), true);
    assert.deepEqual(await reading, { status: 'blocked', reason: 'config_unavailable' });
    assert.equal(gate.isRefreshing(), false);
    assert.deepEqual(seen, [true, false]);
  });
});
