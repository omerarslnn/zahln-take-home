import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTimestamp } from './timestamp';

describe('parseTimestamp', () => {
  it('parses the observed API format and explicit offsets', () => {
    assert.equal(parseTimestamp('2026-10-31T10:00:00.123Z'), Date.UTC(2026, 9, 31, 10, 0, 0, 123));
    assert.equal(parseTimestamp('2026-10-31T11:00:00+01:00'), Date.UTC(2026, 9, 31, 10, 0, 0));
    assert.equal(
      parseTimestamp('2026-10-31T10:00:00.123456Z'),
      Date.UTC(2026, 9, 31, 10, 0, 0, 123),
    );
  });

  it('rejects timestamps without an offset or with impossible values', () => {
    assert.equal(parseTimestamp('2026-10-31T10:00:00'), null);
    assert.equal(parseTimestamp('2026-02-30T10:00:00Z'), null);
    assert.equal(parseTimestamp('2026-10-31T25:00:00Z'), null);
    assert.equal(parseTimestamp('31.10.2026 10:00'), null);
  });
});
