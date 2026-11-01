import type { DailyTotals } from '@mensa/api';
import type { CallResult } from '../session';
import { readFailureOf, type ReadFailure } from './read-failure';

/** One successful report response and when it arrived. */
export interface FetchedReport {
  report: DailyTotals;
  /**
   * When this copy was fetched: the response's Date header, else the device clock. Reports carry no
   * version or snapshot time, so this dates the response, not the data behind it. Shown as
   * "last fetched", never as "data as of".
   */
  fetchedAt: Date;
}

export interface DailyReportState {
  /** The selected Berlin calendar day (YYYY-MM-DD). */
  day: string;
  /** The newest report fetched for `day`. Never another day's report, never invented zeros. */
  latest: FetchedReport | null;
  loading: boolean;
  /**
   * Why the most recent fetch for `day` failed. `latest`, if present, is from an earlier fetch and
   * stays on screen labelled with its own time. 'wrong_day': the server answered for another day.
   */
  failure: ReadFailure | 'wrong_day' | null;
}

/**
 * The daily totals screen's data: GET /reports/daily-totals for the selected day, nothing derived
 * from payment lists. Only the newest request counts: an answer for a day that is no longer
 * selected, or one overtaken by a later refresh, is dropped. A failed refresh keeps the last good
 * report of that day; a failure without one shows no numbers at all, so a zero on screen is always
 * a zero the server reported. Automatic repeats are the finance API's bounded retries; after that
 * the user refreshes explicitly. Create one per signed-in user and dispose it on sign-out.
 */
export class DailyReportStore {
  private snapshot: DailyReportState;
  private readonly fetched = new Map<string, FetchedReport>();
  private ticket = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly fetchDay: (day: string) => Promise<CallResult<DailyTotals>>,
    private readonly deviceNow: () => Date,
    day: string,
  ) {
    this.snapshot = { day, latest: null, loading: false, failure: null };
  }

  state(): DailyReportState {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Switches to `day`: shows its last fetched report (if any) at once, then fetches it again. */
  select(day: string): Promise<void> {
    this.set({ day, latest: this.fetched.get(day) ?? null, loading: false, failure: null });
    return this.refresh();
  }

  /** Fetches the selected day again. */
  async refresh(): Promise<void> {
    const ticket = (this.ticket += 1);
    const day = this.snapshot.day;
    this.set({ ...this.snapshot, loading: true, failure: null });
    const result = await this.fetchDay(day);
    if (ticket !== this.ticket) return;
    if (result.kind !== 'success') {
      this.set({ ...this.snapshot, loading: false, failure: readFailureOf(result) });
      return;
    }
    if (result.data.date !== day) {
      this.set({ ...this.snapshot, loading: false, failure: 'wrong_day' });
      return;
    }
    const fetched = { report: result.data, fetchedAt: result.meta.serverDate ?? this.deviceNow() };
    this.fetched.set(day, fetched);
    this.set({ day, latest: fetched, loading: false, failure: null });
  }

  /** Drops every answer still on its way, e.g. after a sign-out. */
  dispose(): void {
    this.ticket += 1;
    this.listeners.clear();
  }

  private set(next: DailyReportState): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
