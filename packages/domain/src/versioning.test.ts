import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newerOf } from './versioning';

const order = (version: number, status: string) => ({ id: 'ord_1', version, status });

describe('newerOf', () => {
  it('accepts the first copy it sees', () => {
    assert.equal(newerOf(undefined, order(1, 'open')).status, 'open');
  });

  it('replaces the shown copy only with a higher version', () => {
    assert.equal(newerOf(order(2, 'paying'), order(3, 'paid')).status, 'paid');
  });

  it('ignores a stale read that arrives after a newer one', () => {
    const shown = order(3, 'paid');
    assert.equal(newerOf(shown, order(2, 'paying')), shown);
  });

  it('keeps the current object for an equal version', () => {
    const shown = order(3, 'paid');
    assert.equal(newerOf(shown, order(3, 'paid')), shown);
  });

  it('refuses to compare different resources', () => {
    assert.throws(() => newerOf(order(1, 'open'), { id: 'ord_2', version: 9, status: 'paid' }));
  });
});
