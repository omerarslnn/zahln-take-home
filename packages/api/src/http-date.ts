const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMF_FIXDATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/**
 * Parses an HTTP `Date` header (RFC 9110 IMF-fixdate, e.g. "Thu, 29 Oct 2026 10:34:12 GMT").
 *
 * Parsed explicitly instead of with `Date.parse`, whose handling of non-ISO strings is
 * implementation-defined, so Hermes, JavaScriptCore and V8 are not guaranteed to agree.
 * Precision is one second. Returns null when the header is absent or in another format.
 */
export function parseHttpDate(value: string | null | undefined): Date | null {
  const match = value ? IMF_FIXDATE.exec(value.trim()) : null;
  if (!match) return null;
  const [, day = '', monthName = '', year = '', hours = '', minutes = '', seconds = ''] = match;
  const month = MONTHS.indexOf(monthName);
  if (month < 0) return null;
  return new Date(
    Date.UTC(Number(year), month, Number(day), Number(hours), Number(minutes), Number(seconds)),
  );
}
