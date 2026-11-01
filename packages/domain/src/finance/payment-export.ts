import type { Payment, PaymentPage, PaymentQuery } from '@mensa/api';
import type { CallResult } from '../session';
import { newerOf } from '../versioning';
import { readFailureOf, type ReadFailure } from './read-failure';

/** The contract's maximum page size for GET /payments. */
export const EXPORT_PAGE_SIZE = 200;

/** The filters of one export; paging is the export's own business. */
export type ExportFilter = Omit<PaymentQuery, 'cursor' | 'limit'>;

export interface ExportProgress {
  pages: number;
  payments: number;
}

export type ExportFailure =
  /** A page could not be read, even after the finance API's bounded retries. */
  | { reason: 'page_failed'; failure: ReadFailure }
  /** The server pointed back to a page this chain has already read: following it would loop. */
  | { reason: 'repeated_cursor' }
  /** A page without payments that still points to a next page: no progress, so no end in sight. */
  | { reason: 'no_progress' };

export type ExportOutcome =
  | { kind: 'complete'; payments: Payment[]; pages: number; duplicates: number }
  | { kind: 'cancelled'; pages: number }
  | { kind: 'failed'; failure: ExportFailure; pages: number; payments: number };

/**
 * Reads every payment that matches `filter`, following ONE cursor chain from the first page until
 * the server says there is no next page. It does not depend on what the table has loaded.
 *
 * - The filter is copied when the export starts; the caller cancels the export when the screen's
 *   filter or the session changes, so a file never mixes two filters or two accounts.
 * - Overlapping pages are merged by payment ID, keeping the highest version; the result is sorted
 *   newest first (then by ID), so the same data always gives the same file.
 * - It is complete only when the last page arrived. A failed page, a cursor that repeats, a page
 *   that makes no progress or a cancellation yields no payments at all, so no partial file can be
 *   offered as complete.
 *
 * The API has no snapshot or export token: payments can be created or change between two pages.
 * The result is every payment the cursor chain returned, each at the newest version seen; it is
 * not an atomic accounting extract as of one instant.
 */
export async function collectPayments(
  list: (query: PaymentQuery) => Promise<CallResult<PaymentPage>>,
  filter: ExportFilter,
  options: {
    isCancelled: () => boolean;
    onProgress?: (progress: ExportProgress) => void;
    pageSize?: number;
  },
): Promise<ExportOutcome> {
  const fixedFilter = { ...filter };
  const limit = options.pageSize ?? EXPORT_PAGE_SIZE;
  const byId = new Map<string, Payment>();
  const followed = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let received = 0;

  for (;;) {
    if (options.isCancelled()) return { kind: 'cancelled', pages };
    const result = await list({ ...fixedFilter, limit, ...(cursor ? { cursor } : {}) });
    if (options.isCancelled()) return { kind: 'cancelled', pages };
    if (result.kind !== 'success') {
      const failure = { reason: 'page_failed', failure: readFailureOf(result) } as const;
      return { kind: 'failed', failure, pages, payments: byId.size };
    }

    pages += 1;
    for (const payment of result.data.items) {
      received += 1;
      byId.set(payment.id, newerOf(byId.get(payment.id), payment));
    }
    options.onProgress?.({ pages, payments: byId.size });

    const next = result.data.nextCursor;
    if (next === null) break;
    if (followed.has(next)) {
      return { kind: 'failed', failure: { reason: 'repeated_cursor' }, pages, payments: byId.size };
    }
    if (result.data.items.length === 0) {
      return { kind: 'failed', failure: { reason: 'no_progress' }, pages, payments: byId.size };
    }
    followed.add(next);
    cursor = next;
  }

  const payments = [...byId.values()].sort(newestFirst);
  return { kind: 'complete', payments, pages, duplicates: received - payments.length };
}

/** Newest first by creation instant, then by ID: a stable order for identical data. */
function newestFirst(a: Payment, b: Payment): number {
  const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
