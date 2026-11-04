import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldLabel, spokenPhrase } from './a11y-text';

describe('what the primitives say to screen readers', () => {
  it('reads a row as one phrase in reading order and skips empty parts', () => {
    assert.equal(
      spokenPhrase(['Mensa am Campus', 'Confirmed', '€7.20', '04/11/2026, 17:03']),
      'Mensa am Campus, Confirmed, €7.20, 04/11/2026, 17:03',
    );
    assert.equal(
      spokenPhrase(['Mensa am Campus', undefined, '', '  ', null, '€7.20']),
      'Mensa am Campus, €7.20',
    );
  });

  it('a field says its error as part of its label, so the error is heard even with hints off', () => {
    assert.equal(fieldLabel('Refund amount'), 'Refund amount');
    assert.equal(fieldLabel('Refund amount', null), 'Refund amount');
    assert.equal(
      fieldLabel('Refund amount', 'Use at most two decimal places.'),
      'Refund amount, Use at most two decimal places.',
    );
  });
});
