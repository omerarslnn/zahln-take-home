import type { Locale } from '../i18n/translate';

/** Finance reports and daily totals count days in this zone, whatever the device's zone is. */
export const FINANCE_TIME_ZONE = 'Europe/Berlin';

const DATE_LOCALES: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

/**
 * Formats an instant as Berlin wall-clock time, e.g. "29.10.2026, 11:34".
 * Explicit fields instead of dateStyle/timeStyle keep the output consistent across JS engines.
 */
export function formatBerlinDateTime(instant: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    timeZone: FINANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
}

/** Berlin time of day with seconds, e.g. "15:31:05", for "last fetched" labels. */
export function formatBerlinTime(instant: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    timeZone: FINANCE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

/** Berlin time of day without seconds, e.g. "11:34", for list rows grouped by day. */
export function formatBerlinClock(instant: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    timeZone: FINANCE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

/**
 * The calendar day (YYYY-MM-DD) of an instant in Berlin, as GET /reports/daily-totals expects.
 * Near midnight this differs from the UTC date: 23:30 UTC on 28 March is already 29 March in Berlin.
 */
export function berlinDateKey(instant: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: FINANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
