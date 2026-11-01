export type EuroInput =
  | { ok: true; cents: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'too_precise' | 'zero' | 'too_large' };

/** Larger than any mensa payment; keeps the result far inside safe integers. */
const MAX_EUROS_DIGITS = 6;

/**
 * Parses a euro amount typed by a cashier into integer cents, with string arithmetic only: no
 * floating point, so "0,29" is exactly 29 cents. Accepts "12", "12,5", "12,50", "12.50", with
 * optional spaces and a "€" sign. Rejects a sign, thousands separators ("1.234,50" and "1,234"
 * are ambiguous between languages), more than two decimals, zero, and anything else.
 */
export function parseEuroAmount(text: string): EuroInput {
  const value = text.replace(/€/g, '').trim();
  if (value === '') return { ok: false, reason: 'empty' };
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(value);
  if (!match) return { ok: false, reason: 'invalid' };
  const euros = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { ok: false, reason: 'too_precise' };
  if (euros.length > MAX_EUROS_DIGITS) return { ok: false, reason: 'too_large' };
  const cents = Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
  return cents === 0 ? { ok: false, reason: 'zero' } : { ok: true, cents };
}
