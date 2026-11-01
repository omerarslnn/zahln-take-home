import type { Locale } from '@mensa/shared';

const RELATIVE_LOCALES: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

/**
 * How long ago `since` was, by server time, in the largest whole unit that fits: "12 minutes ago",
 * "5 hours ago", "4 days ago". A clock difference can make `since` look like the future; that is
 * shown as "0 minutes ago" rather than a negative age.
 */
export function formatAge(since: string, nowMs: number, locale: Locale): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(since)) / 60_000));
  const format = new Intl.RelativeTimeFormat(RELATIVE_LOCALES[locale], { numeric: 'always' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return format.format(-hours, 'hour');
  return format.format(-Math.floor(hours / 24), 'day');
}
