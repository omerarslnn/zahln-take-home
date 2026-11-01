import type { Locale } from '../i18n/translate';
import { FINANCE_TIME_ZONE } from './datetime';

// Calendar days in Europe/Berlin, and the instants where they start. A finance day is a Berlin
// calendar day, not 24 hours: on 29 March 2026 the clocks skip from 02:00 to 03:00 (23 hours), on
// 25 October 2026 they fall back from 03:00 to 02:00 (25 hours). Nothing here reads the host's own
// time zone: every conversion names Europe/Berlin explicitly, so a browser in Lisbon or New York
// gets the same boundaries as one in Berlin.

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** 'YYYY-MM-DD' for a real calendar date (no 30 February), or null. */
export function parseCalendarDay(text: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? { year, month, day } : null;
}

/** The calendar day `days` after `day` (before, if negative). Pure date arithmetic, no time zone. */
export function addCalendarDays(day: string, days: number): string {
  const parsed = requireDay(day);
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return shifted.toISOString().slice(0, 10);
}

const berlinParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINANCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Berlin's offset from UTC in minutes at an instant: 60 in winter (CET), 120 in summer (CEST). */
function berlinOffsetMinutes(epochMs: number): number {
  const parts = berlinParts.formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return Math.round((wallClockAsUtc - Math.floor(epochMs / 1000) * 1000) / 60_000);
}

/**
 * The instant (epoch ms) at which Berlin's calendar day `day` begins. Berlin changes its clocks at
 * 02:00/03:00, so local midnight always exists exactly once. The first guess uses the offset at
 * midnight UTC; the second corrects it when a clock change lies between the two.
 */
export function berlinDayStart(day: string): number {
  const { year, month, day: date } = requireDay(day);
  const wallClock = Date.UTC(year, month - 1, date);
  const guess = wallClock - berlinOffsetMinutes(wallClock) * 60_000;
  return wallClock - berlinOffsetMinutes(guess) * 60_000;
}

/** An instant as ISO 8601 with Berlin's offset, e.g. "2026-03-29T00:00:00+01:00". */
export function toBerlinIso(epochMs: number): string {
  const offset = berlinOffsetMinutes(epochMs);
  const wallClock = new Date(Math.floor(epochMs / 1000) * 1000 + offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  return `${wallClock.toISOString().slice(0, 19)}${sign}${hours}:${pad(Math.abs(offset) % 60)}`;
}

/**
 * The bounds of Berlin calendar days `first` to `last`, both inclusive, as instants with offset:
 * `from` is the start of `first` (inclusive), `to` the start of the day after `last` (exclusive).
 * This is what GET /payments `from`/`to` need. It is a different operation from the daily report,
 * which takes the calendar day itself (YYYY-MM-DD) and does the conversion on the server.
 */
export function berlinDayRange(first: string, last: string): { from: string; to: string } {
  return { from: berlinDayBound(first), to: berlinDayBound(addCalendarDays(last, 1)) };
}

const DAY_LOCALES: Record<Locale, string> = { de: 'de-DE', en: 'en-GB' };

/**
 * A calendar day in words, e.g. "Sonntag, 25. Oktober 2026". The day is formatted as a date in
 * UTC on purpose: it is a calendar date, not an instant, so no time zone may shift it.
 */
export function formatCalendarDay(day: string, locale: Locale): string {
  const { year, month, day: date } = requireDay(day);
  return new Intl.DateTimeFormat(DAY_LOCALES[locale], {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** The start of Berlin day `day` as ISO 8601 with offset (one side of a range). */
export function berlinDayBound(day: string): string {
  return toBerlinIso(berlinDayStart(day));
}

function requireDay(day: string): CalendarDay {
  const parsed = parseCalendarDay(day);
  if (!parsed) throw new RangeError(`Expected a calendar day as YYYY-MM-DD, received "${day}"`);
  return parsed;
}
