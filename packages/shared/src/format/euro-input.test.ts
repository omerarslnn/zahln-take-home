import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEuroAmount } from './euro-input';

describe('parseEuroAmount', () => {
  it('reads German and English decimals into exact integer cents', () => {
    const cases: [string, number][] = [
      ['12', 1200],
      ['12,5', 1250],
      ['12,50', 1250],
      ['12.50', 1250],
      ['0,29', 29], // 0.29 * 100 is 28.999… in floating point
      ['1,10', 110],
      [' 4,05 € ', 405],
      ['€4.05', 405],
      ['007,10', 710],
    ];
    for (const [input, cents] of cases) {
      assert.deepEqual(parseEuroAmount(input), { ok: true, cents }, input);
    }
  });

  it('refuses ambiguous, negative, too precise, empty and oversized input', () => {
    const cases: [string, string][] = [
      ['', 'empty'],
      ['  ', 'empty'],
      ['1.234,50', 'invalid'], // thousands separator
      ['1,234.50', 'invalid'],
      ['1,234', 'too_precise'], // 1.234 € or 1234 €? Neither is guessed
      ['12,345', 'too_precise'],
      ['-5', 'invalid'],
      ['+5', 'invalid'],
      ['5e2', 'invalid'],
      [',50', 'invalid'],
      ['12,', 'invalid'],
      ['0', 'zero'],
      ['0,00', 'zero'],
      ['1234567', 'too_large'],
      ['abc', 'invalid'],
    ];
    for (const [input, reason] of cases) {
      assert.deepEqual(parseEuroAmount(input), { ok: false, reason }, input);
    }
  });
});
