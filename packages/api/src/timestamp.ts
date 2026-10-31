// Explicit date parsing for the two formats the API uses. Engines disagree on lenient inputs and
// `Date.UTC` silently normalises impossible values (31 February becomes 3 March), so both parsers
// check the calendar themselves and return null instead of guessing.

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an ISO 8601 timestamp with an explicit offset, as the API sends them
 * (observed: "2026-10-29T10:34:12.123Z"). Returns epoch milliseconds, or null when the text or the
 * calendar values are invalid. A timestamp without an offset is rejected: its zone would be a guess.
 */
export function parseTimestamp(value: string): number | null {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;
  const [
    ,
    year = '',
    month = '',
    day = '',
    hour = '',
    minute = '',
    second = '',
    fraction,
    zone = '',
  ] = match;
  const parts = [year, month, day, hour, minute, second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (!isValidDateTime(...parts)) return null;
  const millis = fraction ? Number(fraction.slice(0, 3).padEnd(3, '0')) : 0;
  const local = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], millis);
  return local - offsetMinutes(zone) * 60_000;
}

/** True when the fields name a real UTC date and time (no leap seconds; months are 1-based). */
export function isValidDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function offsetMinutes(zone: string): number {
  if (zone === 'Z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const [hours = 0, minutes = 0] = zone.slice(1).split(':').map(Number);
  return sign * (hours * 60 + minutes);
}
