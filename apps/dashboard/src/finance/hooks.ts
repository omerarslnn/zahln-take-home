import type { Mensa } from '@mensa/api';
import { PaymentHistory } from '@mensa/domain';
import {
  collectPayments,
  DailyReportStore,
  paymentsToCsv,
  readFailureOf,
  type ExportFailure,
  type ExportProgress,
  type ReadFailure,
} from '@mensa/domain/finance';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { downloadText, exportFileName } from './download';
import { filterFromParams, filterKey, toPaymentQuery, type TransactionFilter } from './filters';
import { useCacheRevision, type FinanceServices } from './session';

/** Subscribes a component to a store with `subscribe` and `state` methods. */
function useStore<T>(store: { subscribe(listener: () => void): () => void; state(): T }): T {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => store.state(), [store]);
  return useSyncExternalStore(subscribe, snapshot);
}

/** The daily report of `day` (from the route); one store per session, so old answers are dropped. */
export function useDailyReport(services: FinanceServices, day: string) {
  const [firstDay] = useState(day);
  const store = useMemo(
    () =>
      new DailyReportStore(
        (date) => services.api.getDailyTotals(date),
        () => new Date(),
        firstDay,
      ),
    [services, firstDay],
  );
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => {
    void store.select(day);
  }, [store, day]);
  const state = useStore(store);
  const refresh = useCallback(() => void store.refresh(), [store]);
  return { state, refresh };
}

/**
 * One chain of GET /payments pages for one filter (PaymentHistory: newest first, cursor pages on
 * request, late pages of an earlier filter dropped, every item through the version-safe cache). A
 * new filter starts a new chain; the old one is disposed with whatever it still had on its way.
 */
export function usePaymentList(
  services: FinanceServices,
  filter: TransactionFilter,
  pageSize = 50,
) {
  const key = filterKey(filter);
  const history = useMemo(
    () =>
      new PaymentHistory(
        (query) => services.api.listPayments(query),
        services.cache,
        // Built from the key, the filter's stable identity, so a re-render cannot start a new chain.
        toPaymentQuery(filterFromParams(new URLSearchParams(key))),
        pageSize,
      ),
    [services, key, pageSize],
  );
  // The state before the first request; until it changes, an empty list means "not loaded yet".
  const pristine = useMemo(() => history.state(), [history]);
  useEffect(() => {
    void history.refresh();
    return () => history.dispose();
  }, [history]);
  const state = useStore(history);
  useCacheRevision(services);
  const rows = state.ids.flatMap((id) => {
    const view = services.cache.paymentView(id);
    return view ? [view.payment] : [];
  });
  const loadMore = useCallback(() => void history.loadMore(), [history]);
  /** After a failure: the first page again if nothing loaded, otherwise the page that failed. */
  const retry = useCallback(
    () => void (history.state().ids.length === 0 ? history.refresh() : history.loadMore()),
    [history],
  );
  return { state, started: state !== pristine, rows, loadMore, retry };
}

export interface DetailRequest {
  loading: boolean;
  failure: ReadFailure | null;
  /** When the last successful detail response arrived (its Date header, else the device clock). */
  fetchedAt: Date | null;
}

/**
 * One payment with its refunds and history (GET /payments/{id}), through the cache: a response
 * with a lower version than what is known never replaces it, and if a list shows a NEWER version
 * than the last detail, the old detail is withheld (`detailOutdated`) instead of shown as current.
 */
export function usePaymentDetail(services: FinanceServices, paymentId: string) {
  const [request, setRequest] = useState<DetailRequest>({
    loading: true,
    failure: null,
    fetchedAt: null,
  });
  const latest = useRef(0);
  const load = useCallback(async () => {
    const ticket = (latest.current += 1);
    setRequest((current) => ({ ...current, loading: true }));
    const result = await services.api.getPayment(paymentId);
    if (ticket !== latest.current) return; // another payment, a newer load, or a sign-out
    if (result.kind === 'success') {
      services.cache.putPaymentDetail(result.data);
      setRequest({
        loading: false,
        failure: null,
        fetchedAt: result.meta.serverDate ?? new Date(),
      });
    } else {
      setRequest((current) => ({ ...current, loading: false, failure: readFailureOf(result) }));
    }
  }, [services, paymentId]);
  useEffect(() => {
    void load();
    return () => {
      latest.current += 1;
    };
  }, [load]);
  useCacheRevision(services);
  return { view: services.cache.paymentView(paymentId), request, reload: load };
}

/** Mensas and tills for the filters, read once per session; an answer for an old session is dropped. */
export function useMensas(services: FinanceServices) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ mensas: Mensa[] | null; failure: ReadFailure | null }>({
    mensas: null,
    failure: null,
  });
  useEffect(() => {
    let current = true;
    void services.api.listMensas().then((result) => {
      if (!current) return;
      setState(
        result.kind === 'success'
          ? { mensas: result.data.items, failure: null }
          : { mensas: null, failure: readFailureOf(result) },
      );
    });
    return () => {
      current = false;
    };
  }, [services, attempt]);
  const reload = useCallback(() => {
    setState({ mensas: null, failure: null });
    setAttempt((count) => count + 1);
  }, []);
  return { ...state, reload };
}

export type ExportState =
  | { phase: 'idle' }
  | { phase: 'running'; key: string; progress: ExportProgress }
  | {
      phase: 'done';
      key: string;
      payments: number;
      pages: number;
      fileName: string;
      /** Whether the browser was asked to save the file; false until the person saves it. */
      saved: boolean;
    }
  | {
      phase: 'failed';
      key: string;
      /** `file`: the pages were read but the browser could not create or offer the file. */
      failure: ExportFailure | { reason: 'file' };
      pages: number;
      payments: number;
    }
  | { phase: 'cancelled'; key: string; why: 'user' | 'filter' };

/**
 * Whether the click that started the export still counts as a user action. Browsers let a page
 * start a download by itself only then; a full export takes long enough that this has run out, and
 * a later scripted download may be held back ("this site wants to download multiple files") while
 * the page would claim it was saved. Without the API (older Safari) the answer is no.
 */
function clickIsRecent(): boolean {
  return (navigator as { userActivation?: UserActivation }).userActivation?.isActive === true;
}

/**
 * A CSV export of every payment matching a filter (collectPayments: one cursor chain, bounded read
 * retries, no partial file). The filter is captured at the start; the screen cancels the export when
 * its filter changes, and leaving the session cancels it too. Only a complete result becomes a file:
 * saved at once while the starting click is recent, otherwise offered with "Save CSV file", so the
 * download is always started by the person and the page never claims a file it did not offer.
 */
export function useExport(services: FinanceServices) {
  const [state, setState] = useState<ExportState>({ phase: 'idle' });
  const running = useRef<{ cancelled: boolean } | null>(null);
  const file = useRef<{ text: string; name: string } | null>(null);

  const offer = useCallback((): boolean => {
    if (!file.current) return false;
    try {
      downloadText(file.current.text, file.current.name);
      return true;
    } catch {
      return false;
    }
  }, []);

  const start = useCallback(
    async (filter: TransactionFilter) => {
      if (running.current) running.current.cancelled = true;
      const run = { cancelled: false };
      running.current = run;
      file.current = null;
      const key = filterKey(filter);
      setState({ phase: 'running', key, progress: { pages: 0, payments: 0 } });
      const outcome = await collectPayments(
        (query) => services.api.listPayments(query),
        toPaymentQuery(filter),
        {
          isCancelled: () => run.cancelled,
          onProgress: (progress) => {
            if (!run.cancelled) setState({ phase: 'running', key, progress });
          },
        },
      );
      if (running.current !== run) return; // cancelled, or a newer export took over
      running.current = null;
      if (outcome.kind === 'complete') {
        const counts = { key, payments: outcome.payments.length, pages: outcome.pages };
        try {
          file.current = {
            text: paymentsToCsv(outcome.payments),
            name: exportFileName(filter, new Date()),
          };
        } catch {
          setState({ phase: 'failed', failure: { reason: 'file' }, ...counts });
          return;
        }
        const saved = clickIsRecent() && offer();
        setState({ phase: 'done', fileName: file.current.name, saved, ...counts });
      } else if (outcome.kind === 'failed') {
        const { failure, pages, payments } = outcome;
        setState({ phase: 'failed', key, failure, pages, payments });
      }
    },
    [services, offer],
  );

  /** Saves the finished file (again); called from the person's click. */
  const save = useCallback(() => {
    if (offer()) {
      setState((current) => (current.phase === 'done' ? { ...current, saved: true } : current));
    } else {
      setState((current) =>
        current.phase === 'done'
          ? {
              phase: 'failed',
              key: current.key,
              failure: { reason: 'file' },
              pages: current.pages,
              payments: current.payments,
            }
          : current,
      );
    }
  }, [offer]);

  const cancel = useCallback((why: 'user' | 'filter') => {
    if (!running.current) return;
    running.current.cancelled = true;
    running.current = null;
    setState((current) =>
      current.phase === 'running' ? { phase: 'cancelled', key: current.key, why } : current,
    );
  }, []);

  // A new session (or leaving the page) ends an export that is still running and drops its file.
  useEffect(
    () => () => {
      if (running.current) running.current.cancelled = true;
      file.current = null;
    },
    [services],
  );

  return { state, start, save, cancel };
}
