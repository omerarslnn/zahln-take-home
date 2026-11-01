import { FINANCE_TIME_ZONE } from '@mensa/shared';
import type { TransactionFilter } from './filters';

const stampFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINANCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * A safe file name that says what the file holds: the chosen Berlin days (if any) and when it was
 * exported (Berlin time), e.g. "mensa-payments_2026-10-01_to_2026-10-31_exported-20261101-1531.csv".
 */
export function exportFileName(filter: TransactionFilter, exportedAt: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    stampFormat.formatToParts(exportedAt).find((candidate) => candidate.type === type)?.value ?? '';
  const stamp = `${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}`;
  const range =
    filter.fromDay || filter.toDay
      ? `_${filter.fromDay ?? 'start'}_to_${filter.toDay ?? 'now'}`
      : '';
  return `mensa-payments${range}_exported-${stamp}.csv`.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Offers `text` as a UTF-8 file download, then revokes the temporary object URL. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The click has started the download; the URL is not needed after that.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
