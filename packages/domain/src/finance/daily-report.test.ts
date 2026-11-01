import type { DailyTotals } from '@mensa/api';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CallResult } from '../session';
import { dailyTotals, noResponse, ok, problem } from '../testing/finance-fixtures';
import { DailyReportStore } from './daily-report';

/** A report fetch whose answers the test hands out one by one. */
function pendingFetches() {
  const calls: { day: string; answer: (result: CallResult<DailyTotals>) => Promise<void> }[] = [];
  const fetchDay = (day: string) =>
    new Promise<CallResult<DailyTotals>>((resolve) => {
      calls.push({
        day,
        answer: async (result) => {
          resolve(result);
          await new Promise((settled) => setImmediate(settled));
        },
      });
    });
  return { fetchDay, calls };
}

const deviceNow = () => new Date('2026-11-01T14:00:00Z');

describe('DailyReportStore', () => {
  it('shows no numbers when the first fetch fails, instead of zeros', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-25');
    void store.refresh();
    assert.deepEqual([store.state().loading, store.state().latest], [true, null]);
    await calls[0]?.answer(problem('unavailable', 503, true));
    assert.deepEqual(
      [store.state().loading, store.state().latest, store.state().failure],
      [false, null, 'unavailable'],
    );
  });

  it('keeps a successful report of zeros as real data, and a negative net as reported', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-11-02');
    void store.refresh();
    await calls[0]?.answer(ok(dailyTotals('2026-11-02')));
    assert.equal(store.state().latest?.report.grossCents, 0);
    assert.equal(store.state().failure, null);

    // 25 October 2026: no payments, but a refund of an earlier payment completed that day.
    void store.select('2026-10-25');
    await calls[1]?.answer(ok(dailyTotals('2026-10-25', { refundedCents: 270, netCents: -270 })));
    assert.equal(store.state().latest?.report.netCents, -270);
  });

  it('keeps the last good report and its own fetch time when a refresh fails', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-23');
    const served = new Date('2026-11-01T13:59:58Z');
    void store.refresh();
    await calls[0]?.answer(ok(dailyTotals('2026-10-23', { grossCents: 81160 }), served));
    void store.refresh();
    await calls[1]?.answer(noResponse);
    const state = store.state();
    assert.equal(state.latest?.report.grossCents, 81160);
    assert.equal(state.latest?.fetchedAt.toISOString(), served.toISOString());
    assert.equal(state.failure, 'offline');
  });

  it('drops the answer for a day that is no longer selected', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-25');
    void store.select('2026-10-25');
    void store.select('2026-10-26');
    await calls[1]?.answer(ok(dailyTotals('2026-10-26', { grossCents: 100 })));
    await calls[0]?.answer(ok(dailyTotals('2026-10-25', { grossCents: 999 }))); // late
    assert.equal(store.state().day, '2026-10-26');
    assert.equal(store.state().latest?.report.grossCents, 100);

    // The late answer was not kept for 25 October either.
    void store.select('2026-10-25');
    assert.equal(store.state().latest, null);
  });

  it('refuses a report for a different day than the one requested', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-25');
    void store.refresh();
    await calls[0]?.answer(ok(dailyTotals('2026-10-24', { grossCents: 500 })));
    assert.deepEqual([store.state().latest, store.state().failure], [null, 'wrong_day']);
  });

  it('shows the earlier report of a day at once when it is selected again', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-23');
    void store.refresh();
    await calls[0]?.answer(ok(dailyTotals('2026-10-23', { grossCents: 81160 })));
    void store.select('2026-10-24');
    await calls[1]?.answer(ok(dailyTotals('2026-10-24')));
    void store.select('2026-10-23');
    assert.deepEqual(
      [store.state().latest?.report.grossCents, store.state().loading],
      [81160, true],
    );
  });

  it('ignores answers that arrive after it was disposed (sign-out)', async () => {
    const { fetchDay, calls } = pendingFetches();
    const store = new DailyReportStore(fetchDay, deviceNow, '2026-10-23');
    let notified = 0;
    store.subscribe(() => (notified += 1));
    void store.refresh();
    const before = notified;
    store.dispose();
    await calls[0]?.answer(ok(dailyTotals('2026-10-23', { grossCents: 1 })));
    assert.equal(store.state().latest, null);
    assert.equal(notified, before);
  });
});
