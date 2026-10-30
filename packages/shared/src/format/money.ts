import type { Locale } from '../i18n/translate';

const NUMBER_LOCALES: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };
const formatters = new Map<Locale, Intl.NumberFormat>();

/**
 * Formats integer euro cents for display: 1250 → "12,50 €" (de) or "€12.50" (en).
 *
 * Money is integer cents everywhere in this codebase and is only divided here, for display.
 * A fractional or unsafe number means a bug upstream, so it throws instead of rounding silently.
 */
export function formatCents(cents: number, locale: Locale): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Expected integer cents, received ${cents}`);
  }
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(NUMBER_LOCALES[locale], {
      style: 'currency',
      currency: 'EUR',
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(cents / 100);
}
