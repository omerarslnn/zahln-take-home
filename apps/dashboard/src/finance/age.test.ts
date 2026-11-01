import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAge } from './age';

const now = Date.parse('2026-11-01T12:00:00Z');

describe('formatAge', () => {
  it('uses the largest whole unit, by server time', () => {
    assert.equal(formatAge('2026-11-01T11:48:00Z', now, 'en'), '12 minutes ago');
    assert.equal(formatAge('2026-11-01T07:00:00Z', now, 'en'), '5 hours ago');
    assert.equal(formatAge('2026-10-28T12:00:00Z', now, 'de'), 'vor 4 Tagen');
  });

  it('never shows a negative age when the clocks disagree', () => {
    assert.equal(formatAge('2026-11-01T12:03:00Z', now, 'en'), '0 minutes ago');
  });
});
