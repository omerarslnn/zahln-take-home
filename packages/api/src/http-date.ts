import { isValidDateTime } from './timestamp';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const IMF_FIXDATE =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/**
 * Parses an HTTP `Date` header (RFC 9110 IMF-fixdate, e.g. "Thu, 29 Oct 2026 10:34:12 GMT").
 *
 * Parsed explicitly instead of with `Date.parse`, whose handling of non-ISO strings is
 * implementation-defined. Impossible calendar values (31 Feb, hour 24) and a weekday that does not
 * match the date are rejected rather than normalised. Precision is one second: the server truncates.
 * Returns null when the header is absent or invalid, so the caller simply learns nothing about time.
 */
export function parseHttpDate(value: string | null | undefined): Date | null {
  const match = value ? IMF_FIXDATE.exec(value.trim()) : null;
  if (!match) return null;
  const [
    ,
    weekday = '',
    day = '',
    monthName = '',
    year = '',
    hours = '',
    minutes = '',
    seconds = '',
  ] = match;
  const month = MONTHS.indexOf(monthName) + 1;
  const fields = [year, month, day, hours, minutes, seconds].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month === 0 || !isValidDateTime(...fields)) return null;
  const date = new Date(
    Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]),
  );
  return WEEKDAYS[date.getUTCDay()] === weekday ? date : null;
}
