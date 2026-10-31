import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHttpDate } from './http-date';

describe('parseHttpDate', () => {
  it('parses the IMF-fixdate format servers send', () => {
    assert.equal(
      parseHttpDate('Thu, 29 Oct 2026 10:34:12 GMT')?.toISOString(),
      '2026-10-29T10:34:12.000Z',
    );
  });

  it('returns null for a missing or malformed header instead of guessing', () => {
    assert.equal(parseHttpDate(null), null);
    assert.equal(parseHttpDate(''), null);
    assert.equal(parseHttpDate('2026-10-29T10:34:12Z'), null);
    assert.equal(parseHttpDate('Thu, 29 Foo 2026 10:34:12 GMT'), null);
  });

  it('rejects impossible calendar values instead of normalising them', () => {
    assert.equal(parseHttpDate('Tue, 31 Feb 2026 10:00:00 GMT'), null); // would become 3 March
    assert.equal(parseHttpDate('Thu, 29 Oct 2026 24:00:00 GMT'), null);
    assert.equal(parseHttpDate('Thu, 29 Oct 2026 10:60:00 GMT'), null);
    assert.equal(parseHttpDate('Fri, 29 Oct 2026 10:34:12 GMT'), null); // 29 Oct 2026 is a Thursday
  });
});
