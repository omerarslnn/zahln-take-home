import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCents } from './money';

describe('formatCents', () => {
  it('formats integer cents per locale', () => {
    // Intl puts a no-break space (U+00A0) between the German amount and the euro sign.
    assert.equal(formatCents(1250, 'de'), '12,50 €');
    assert.equal(formatCents(1250, 'en'), '€12.50');
    assert.equal(formatCents(5, 'de'), '0,05 €');
  });

  it('formats negative amounts such as refunds', () => {
    assert.equal(formatCents(-350, 'en'), '-€3.50');
  });

  it('refuses fractional or unsafe numbers instead of rounding money', () => {
    assert.throws(() => formatCents(12.5, 'de'), RangeError);
    assert.throws(() => formatCents(Number.NaN, 'de'), RangeError);
    assert.throws(() => formatCents(2 ** 53, 'de'), RangeError);
  });
});
