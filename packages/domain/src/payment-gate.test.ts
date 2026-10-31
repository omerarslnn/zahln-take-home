import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareAppVersions, parseAppVersion } from './app-version';
import { evaluatePaymentPolicy } from './payment-gate';

const config = (minAppVersion: string, paymentsEnabled = true) => ({
  minAppVersion,
  paymentsEnabled,
});

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
