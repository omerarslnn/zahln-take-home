import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { berlinDateKey, formatBerlinDateTime } from './datetime';

describe('berlinDateKey', () => {
  it('uses the Berlin day, not the UTC day, near midnight', () => {
    assert.equal(berlinDateKey('2026-03-28T23:30:00Z'), '2026-03-29'); // CET, UTC+1
    assert.equal(berlinDateKey('2026-07-15T22:30:00Z'), '2026-07-16'); // CEST, UTC+2
  });

  it('follows the end of daylight saving time (25 October 2026)', () => {
    assert.equal(berlinDateKey('2026-10-29T22:59:59Z'), '2026-10-29');
    assert.equal(berlinDateKey('2026-10-29T23:00:00Z'), '2026-10-30');
  });
});

describe('formatBerlinDateTime', () => {
  it('shows Berlin wall-clock time whatever the device zone is', () => {
    assert.equal(formatBerlinDateTime('2026-07-15T10:00:00Z', 'de'), '15.07.2026, 12:00');
    assert.equal(formatBerlinDateTime('2026-12-01T10:00:00Z', 'en'), '01/12/2026, 11:00');
  });
});
