import type { Payment, PaymentPage, PaymentQuery } from '@mensa/api';
import { isFinal, type IntentRecord, type PayOrderIntent } from './intent';
import type { ResourceCache } from './resource-cache';
import type { CallResult } from './session';

export type HistoryFailure = 'offline' | 'session' | 'error';

export interface HistoryState {
  /** Payment IDs in server order (newest first), each once. */
  ids: readonly string[];
  loading: boolean;
  /** The server has more pages: the list is not complete until the user loads them. */
  hasMore: boolean;
  /** Why the last load failed; the IDs loaded before it stay. */
  failure: HistoryFailure | null;
}

/**
 * A user's payments from `GET /payments`, one page at a time (newest first). A refresh starts over
 * and supersedes a page still on its way: a late page from an earlier load is dropped, never mixed
 * in. Every item goes through the cache, so an out-of-date list cannot replace a newer copy of a
 * payment, and an equal-version list item cannot erase a detail's refunds and history.
 */
export class PaymentHistory {
  private snapshot: HistoryState = { ids: [], loading: false, hasMore: false, failure: null };
  private cursor: string | null = null;
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly list: (query: PaymentQuery) => Promise<CallResult<PaymentPage>>,
    private readonly cache: ResourceCache,
    private readonly filter: Omit<PaymentQuery, 'cursor' | 'limit'> = {},
    private readonly pageSize = 50,
  ) {}

  state(): HistoryState {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads the first page again. */
  refresh(): Promise<void> {
    return this.load(null);
  }

  /** Loads the next page, if there is one and nothing is loading. */
  loadMore(): Promise<void> {
    if (this.snapshot.loading || !this.snapshot.hasMore) return Promise.resolve();
    return this.load(this.cursor);
  }

  /** Ignores every response still on its way, e.g. after a sign-out. */
  dispose(): void {
    this.generation += 1;
    this.listeners.clear();
  }

  private async load(cursor: string | null): Promise<void> {
    const generation = ++this.generation;
    this.set({ ...this.snapshot, loading: true, failure: null });
    const result = await this.list({
      ...this.filter,
      limit: this.pageSize,
      ...(cursor ? { cursor } : {}),
    });
    if (generation !== this.generation) return;
    if (result.kind !== 'success') {
      this.set({ ...this.snapshot, loading: false, failure: failureOf(result) });
      return;
    }
    const page = result.data.items.map((payment) => this.cache.putPayment(payment).id);
    const before = cursor ? this.snapshot.ids : [];
    this.cursor = result.data.nextCursor;
    this.set({
      ids: [...new Set([...before, ...page])],
      loading: false,
      hasMore: result.data.nextCursor !== null,
      failure: null,
    });
  }

  private set(next: HistoryState): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

function failureOf(result: Exclude<CallResult<unknown>, { kind: 'success' }>): HistoryFailure {
  if (result.kind === 'no_response') return 'offline';
  if (result.kind === 'session_unavailable' || result.kind === 'no_session') return 'session';
  return 'error';
}

export type HistoryEntry =
  | { kind: 'payment'; payment: Payment }
  /** A payment action the server has not answered with a payment ID (yet). */
  | { kind: 'unresolved'; intent: PayOrderIntent };

/**
 * The rows of a payer's history: payment actions still without a server answer, payments of this
 * user that are still pending but not listed yet, then the server's list. A payment is shown once,
 * as its newest copy. An action whose response was lost has no payment ID, and none is invented:
 * it is shown as "being checked" until its own resend or a read settles it.
 */
export function mergeHistory(
  ids: readonly string[],
  cache: ResourceCache,
  intents: readonly IntentRecord[],
): HistoryEntry[] {
  const listed = new Set(ids);
  const payments = intents.filter((record): record is PayOrderIntent => record.kind === 'payOrder');
  const unresolved = payments
    .filter((record) => !record.resource && !isFinal(record))
    .map((intent): HistoryEntry => ({ kind: 'unresolved', intent }));
  const pendingUnlisted = payments
    .filter((record) => record.resource && !isFinal(record))
    .flatMap((record) =>
      record.resource && !listed.has(record.resource.paymentId) ? [record.resource.paymentId] : [],
    );
  const rows = [...pendingUnlisted, ...ids].flatMap((id): HistoryEntry[] => {
    const view = cache.paymentView(id);
    return view ? [{ kind: 'payment', payment: view.payment }] : [];
  });
  return [...unresolved, ...rows];
}
