import type { Mensa } from '@mensa/api';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterFromParams,
  filterKey,
  filterProblem,
  filterToParams,
  knownFilter,
  NO_FILTER,
  toPaymentQuery,
  withMensa,
} from './filters';

const mensas = [
  { id: 'mensa_campus', tills: [{ id: 'till_campus_1' }, { id: 'till_campus_2' }] },
  { id: 'mensa_nord', tills: [{ id: 'till_nord_1' }] },
] as unknown as Mensa[];

describe('toPaymentQuery', () => {
  it('sends only the active filters', () => {
    assert.deepEqual(toPaymentQuery(NO_FILTER), {});
    assert.deepEqual(toPaymentQuery({ ...NO_FILTER, status: 'pending', q: 'pay_76' }), {
      status: 'pending',
      q: 'pay_76',
    });
  });

  it('distinguishes "all" from explicit yes and no for attention', () => {
    assert.equal('needsAttention' in toPaymentQuery({ ...NO_FILTER, attention: 'any' }), false);
    assert.equal(toPaymentQuery({ ...NO_FILTER, attention: 'yes' }).needsAttention, true);
    assert.equal(toPaymentQuery({ ...NO_FILTER, attention: 'no' }).needsAttention, false);
  });

  it('turns Berlin days into an inclusive start and the exclusive midnight after the last day', () => {
    assert.deepEqual(toPaymentQuery({ ...NO_FILTER, fromDay: '2026-10-25', toDay: '2026-10-25' }), {
      from: '2026-10-25T00:00:00+02:00',
      to: '2026-10-26T00:00:00+01:00',
    });
    assert.deepEqual(toPaymentQuery({ ...NO_FILTER, fromDay: '2026-03-29' }), {
      from: '2026-03-29T00:00:00+01:00',
    });
    assert.deepEqual(toPaymentQuery({ ...NO_FILTER, toDay: '2026-03-29' }), {
      to: '2026-03-30T00:00:00+02:00',
    });
  });

  it('flags a range that ends before it starts', () => {
    assert.equal(
      filterProblem({ ...NO_FILTER, fromDay: '2026-10-26', toDay: '2026-10-25' }),
      'range_reversed',
    );
    assert.equal(filterProblem({ ...NO_FILTER, fromDay: '2026-10-25', toDay: '2026-10-25' }), null);
  });
});

describe('mensa and till', () => {
  it('clears a till that does not belong to the newly chosen mensa', () => {
    const campusTill = { ...NO_FILTER, mensaId: 'mensa_campus', tillId: 'till_campus_2' };
    assert.equal(withMensa(campusTill, 'mensa_nord', mensas).tillId, null);
    assert.equal(withMensa(campusTill, 'mensa_campus', mensas).tillId, 'till_campus_2');
    assert.equal(withMensa(campusTill, null, mensas).tillId, 'till_campus_2');
  });

  it('drops IDs the server does not list, e.g. from an old link', () => {
    const stale = { ...NO_FILTER, mensaId: 'mensa_gone', tillId: 'till_nord_1' };
    assert.deepEqual(knownFilter(stale, mensas), { ...NO_FILTER, tillId: 'till_nord_1' });
    const mismatch = { ...NO_FILTER, mensaId: 'mensa_campus', tillId: 'till_nord_1' };
    assert.equal(knownFilter(mismatch, mensas).tillId, null);
  });
});

describe('URL parameters', () => {
  it('serialise only active filters and read back the same filter', () => {
    const filter = {
      ...NO_FILTER,
      mensaId: 'mensa_campus',
      status: 'confirmed' as const,
      fromDay: '2026-10-01',
      toDay: '2026-10-31',
      attention: 'no' as const,
      q: 'usr_student',
    };
    const params = filterToParams(filter);
    assert.equal(
      params.toString(),
      'mensa=mensa_campus&status=confirmed&from=2026-10-01&to=2026-10-31&attention=no&q=usr_student',
    );
    assert.deepEqual(filterFromParams(params), filter);
    assert.equal(filterToParams(NO_FILTER).toString(), '');
  });

  it('ignores values the API would refuse instead of sending them', () => {
    const params = new URLSearchParams({
      status: 'refunded',
      from: '2026-02-30',
      attention: 'maybe',
      q: 'x'.repeat(101),
    });
    assert.deepEqual(filterFromParams(params), NO_FILTER);
  });

  it('gives equal filters the same key, whatever order they were built in', () => {
    const a = { ...NO_FILTER, status: 'pending' as const, mensaId: 'mensa_nord' };
    const b = { ...NO_FILTER, mensaId: 'mensa_nord', status: 'pending' as const };
    assert.equal(filterKey(a), filterKey(b));
    assert.notEqual(filterKey(a), filterKey({ ...a, attention: 'yes' }));
  });
});
