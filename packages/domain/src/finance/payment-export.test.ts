import type { PaymentPage, PaymentQuery } from '@mensa/api';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CallResult } from '../session';
import { page, payment, problem } from '../testing/finance-fixtures';
import { collectPayments, type ExportFilter } from './payment-export';

/** GET /payments answering by cursor ('' is the first page); records every query. */
function pagesByCursor(pages: Record<string, CallResult<PaymentPage>>) {
  const queries: PaymentQuery[] = [];
  const list = (query: PaymentQuery) => {
    queries.push(query);
    const answer = pages[query.cursor ?? ''];
    if (!answer) throw new Error(`unexpected cursor ${query.cursor ?? '(first)'}`);
    return Promise.resolve(answer);
  };
  return { list, queries };
}

const run = (
  list: (query: PaymentQuery) => Promise<CallResult<PaymentPage>>,
  filter: ExportFilter = {},
) => collectPayments(list, filter, { isCancelled: () => false });

describe('collectPayments', () => {
  it('reads every page of one cursor chain, 200 at a time, with the filter fixed at the start', async () => {
    const [a, b, c, d] = [payment(), payment(), payment(), payment()];
    const { list, queries } = pagesByCursor({
      '': page([a, b], 'c2'),
      c2: page([c], 'c3'),
      c3: page([d], null),
    });
    const filter: ExportFilter = { status: 'confirmed', mensaId: 'mensa_campus' };
    const progress: number[] = [];
    const exporting = collectPayments(list, filter, {
      isCancelled: () => false,
      onProgress: ({ payments }) => progress.push(payments),
    });
    filter.status = 'declined'; // the screen's filter changes while the export runs
    const outcome = await exporting;

    assert.equal(outcome.kind, 'complete');
    assert.equal(outcome.kind === 'complete' && outcome.payments.length, 4);
    assert.deepEqual(
      queries.map((query) => [query.cursor, query.limit, query.status, query.mensaId]),
      [
        [undefined, 200, 'confirmed', 'mensa_campus'],
        ['c2', 200, 'confirmed', 'mensa_campus'],
        ['c3', 200, 'confirmed', 'mensa_campus'],
      ],
    );
    assert.deepEqual(progress, [2, 3, 4]);
  });

  it('merges overlapping pages by ID, keeps the highest version and orders newest first', async () => {
    const newest = payment({ id: 'pay_a', createdAt: '2026-10-29T12:00:00.000Z', version: 2 });
    const middle = payment({ id: 'pay_b', createdAt: '2026-10-29T11:00:00.000Z', version: 1 });
    const middleLater = {
      ...middle,
      status: 'confirmed' as const,
      version: 3,
      refundedAmountCents: 100,
    };
    const tieLow = payment({ id: 'pay_c', createdAt: '2026-10-29T10:00:00.000Z' });
    const tieHigh = payment({ id: 'pay_d', createdAt: '2026-10-29T10:00:00.000Z' });
    const { list } = pagesByCursor({
      '': page([newest, middle], 'c2'),
      c2: page([middleLater, tieLow], 'c3'),
      c3: page([{ ...newest, version: 1 }, tieHigh], null), // a stale copy of pay_a
    });
    const outcome = await run(list);
    assert.ok(outcome.kind === 'complete');
    assert.deepEqual(
      outcome.payments.map((item) => [item.id, item.version]),
      [
        ['pay_a', 2],
        ['pay_b', 3],
        ['pay_d', 2],
        ['pay_c', 2],
      ],
    );
    assert.equal(outcome.duplicates, 2);
  });

  it('is complete with an empty last page, and with no payments at all', async () => {
    const one = payment();
    assert.equal(
      (await run(pagesByCursor({ '': page([one], 'c2'), c2: page([], null) }).list)).kind,
      'complete',
    );
    const empty = await run(pagesByCursor({ '': page([], null) }).list);
    assert.ok(empty.kind === 'complete' && empty.payments.length === 0 && empty.pages === 1);
  });

  it('fails as a whole when a middle page cannot be read', async () => {
    const { list } = pagesByCursor({
      '': page([payment()], 'c2'),
      c2: problem('unavailable', 503, true),
    });
    const outcome = await run(list);
    assert.deepEqual(outcome, {
      kind: 'failed',
      failure: { reason: 'page_failed', failure: 'unavailable' },
      pages: 1,
      payments: 1,
    });
    assert.equal('payments' in outcome && Array.isArray(outcome.payments), false);
  });

  it('stops instead of looping when the server repeats a cursor', async () => {
    const { list, queries } = pagesByCursor({
      '': page([payment()], 'c2'),
      c2: page([payment()], 'c3'),
      c3: page([payment()], 'c2'),
    });
    const outcome = await run(list);
    assert.deepEqual(outcome.kind === 'failed' && outcome.failure, { reason: 'repeated_cursor' });
    assert.equal(queries.length, 3);
  });

  it('stops when an empty page still points to a next page', async () => {
    const { list } = pagesByCursor({ '': page([payment()], 'c2'), c2: page([], 'c3') });
    const outcome = await run(list);
    assert.deepEqual(outcome.kind === 'failed' && outcome.failure, { reason: 'no_progress' });
  });

  it('returns nothing when cancelled, also while a page is on its way', async () => {
    let cancelled = false;
    const { list, queries } = pagesByCursor({
      '': page([payment()], 'c2'),
      c2: page([payment()], null),
    });
    const outcome = await collectPayments(
      (query) => {
        if (query.cursor === 'c2') cancelled = true; // cancel while page 2 is loading
        return list(query);
      },
      {},
      { isCancelled: () => cancelled },
    );
    assert.deepEqual(outcome, { kind: 'cancelled', pages: 1 });
    assert.equal(queries.length, 2);
  });

  it('fails when the session changes during the export', async () => {
    const { list } = pagesByCursor({
      '': page([payment()], 'c2'),
      c2: { kind: 'account_changed' },
    });
    const outcome = await run(list);
    assert.deepEqual(outcome.kind === 'failed' && outcome.failure, {
      reason: 'page_failed',
      failure: 'session',
    });
  });
});
