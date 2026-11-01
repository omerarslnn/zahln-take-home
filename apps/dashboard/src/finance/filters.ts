import type { Mensa, PaymentStatus } from '@mensa/api';
import type { ExportFilter } from '@mensa/domain/finance';
import { addCalendarDays, berlinDayBound, parseCalendarDay } from '@mensa/shared';

/** "All payments", or only those that do / do not need attention. */
export type AttentionFilter = 'any' | 'yes' | 'no';

/**
 * The transaction filters as the user chose them. Days are Berlin calendar days, inclusive at both
 * ends; they become instants only when the request is built (`toPaymentQuery`).
 */
export interface TransactionFilter {
  mensaId: string | null;
  tillId: string | null;
  status: PaymentStatus | null;
  fromDay: string | null;
  toDay: string | null;
  attention: AttentionFilter;
  /** Payment ID, order ID or payer ID, or the start of one. Not a search of names or dishes. */
  q: string | null;
}

export const NO_FILTER: TransactionFilter = {
  mensaId: null,
  tillId: null,
  status: null,
  fromDay: null,
  toDay: null,
  attention: 'any',
  q: null,
};

/** The contract's limit for `q`. */
export const SEARCH_MAX_LENGTH = 100;

const STATUSES: readonly PaymentStatus[] = ['pending', 'confirmed', 'declined'];

/**
 * GET /payments parameters for the active filters only; the server combines them with AND. A
 * day range becomes [start of the first Berlin day, start of the day after the last) with Berlin's
 * offset, so a 23- or 25-hour day is covered exactly, whatever the browser's time zone.
 */
export function toPaymentQuery(filter: TransactionFilter): ExportFilter {
  return {
    ...(filter.mensaId ? { mensaId: filter.mensaId } : {}),
    ...(filter.tillId ? { tillId: filter.tillId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.fromDay ? { from: berlinDayBound(filter.fromDay) } : {}),
    ...(filter.toDay ? { to: berlinDayBound(addCalendarDays(filter.toDay, 1)) } : {}),
    ...(filter.attention === 'any' ? {} : { needsAttention: filter.attention === 'yes' }),
    ...(filter.q ? { q: filter.q } : {}),
  };
}

export type FilterProblem = 'range_reversed';

/** A filter the screen should not send. */
export function filterProblem(filter: TransactionFilter): FilterProblem | null {
  return filter.fromDay && filter.toDay && filter.fromDay > filter.toDay ? 'range_reversed' : null;
}

/** Chooses a mensa and drops a till that does not belong to it. */
export function withMensa(
  filter: TransactionFilter,
  mensaId: string | null,
  mensas: readonly Mensa[],
): TransactionFilter {
  const tills = mensaId ? (mensas.find((mensa) => mensa.id === mensaId)?.tills ?? []) : null;
  const keepTill = tills === null || tills.some((till) => till.id === filter.tillId);
  return { ...filter, mensaId, tillId: keepTill ? filter.tillId : null };
}

/** Drops a mensa or till that the server does not list (e.g. from an old link). */
export function knownFilter(
  filter: TransactionFilter,
  mensas: readonly Mensa[],
): TransactionFilter {
  const mensaKnown = !filter.mensaId || mensas.some((mensa) => mensa.id === filter.mensaId);
  const tillKnown =
    !filter.tillId || mensas.some((mensa) => mensa.tills.some((till) => till.id === filter.tillId));
  return withMensa(
    { ...filter, tillId: tillKnown ? filter.tillId : null },
    mensaKnown ? filter.mensaId : null,
    mensas,
  );
}

const PARAM = {
  mensaId: 'mensa',
  tillId: 'till',
  status: 'status',
  fromDay: 'from',
  toDay: 'to',
  attention: 'attention',
  q: 'q',
} as const;

/** The active filters as URL parameters, in a fixed order; an inactive filter is left out. */
export function filterToParams(filter: TransactionFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, name] of Object.entries(PARAM) as [keyof TransactionFilter, string][]) {
    const value = filter[field];
    if (value && value !== 'any') params.set(name, value);
  }
  return params;
}

/** Filters from URL parameters; anything invalid is ignored rather than sent. */
export function filterFromParams(params: URLSearchParams): TransactionFilter {
  const text = (name: string) => params.get(name)?.trim() || null;
  const day = (name: string) => {
    const value = text(name);
    return value && parseCalendarDay(value) ? value : null;
  };
  const status = text(PARAM.status);
  const attention = text(PARAM.attention);
  const q = text(PARAM.q);
  return {
    mensaId: text(PARAM.mensaId),
    tillId: text(PARAM.tillId),
    status: STATUSES.find((candidate) => candidate === status) ?? null,
    fromDay: day(PARAM.fromDay),
    toDay: day(PARAM.toDay),
    attention: attention === 'yes' || attention === 'no' ? attention : 'any',
    q: q && q.length <= SEARCH_MAX_LENGTH ? q : null,
  };
}

/** Equal for equal filters: identifies one page chain (and one export). */
export function filterKey(filter: TransactionFilter): string {
  return filterToParams(filter).toString();
}
