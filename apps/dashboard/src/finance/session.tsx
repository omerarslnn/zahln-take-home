import type { User } from '@mensa/api';
import { ResourceCache, SessionCoordinator, type SessionFailure } from '@mensa/domain';
import { createFinanceApi, type FinanceApi } from '@mensa/domain/finance';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { apiClient, candidateId, FINANCE_USERNAME, seededPassword } from '../api';

/** Everything that belongs to one signed-in finance user; replaced as a whole on sign-in/out. */
export interface FinanceServices {
  user: User;
  /** Read-only API bound to this user: no result ever reaches another session. */
  api: FinanceApi;
  /** Newest known copy of each payment for this candidate and user (version rules in ResourceCache). */
  cache: ResourceCache;
  /** Changes whenever the cache keeps a newer copy, for re-rendering. */
  cacheRevision: { subscribe: (listener: () => void) => () => void; get: () => number };
  /** `${candidateId}:${userId}`: keys anything kept per session. */
  scope: string;
}

export type SignInFailure = SessionFailure | 'not_finance' | 'not_configured';

type SessionState =
  | { status: 'signed_out'; failure: SignInFailure | null }
  | { status: 'signing_in' }
  | { status: 'signed_in'; services: FinanceServices };

interface FinanceSessionValue {
  state: SessionState;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const FinanceSessionContext = createContext<FinanceSessionValue | null>(null);

/**
 * The finance session. The bearer token and the mock's re-login password live only in memory
 * (SessionCoordinator): nothing goes to localStorage, so a reload asks to sign in again. Signing
 * out (or in again) starts a new generation in the coordinator, so a response still on its way for
 * the previous session reports "account changed" and is never shown; every per-session object
 * (cache, stores, exports) is created anew and the old ones are dropped with their data.
 */
export function FinanceSessionProvider({ children }: { children: ReactNode }) {
  const coordinator = useMemo(() => {
    const client = apiClient;
    return client
      ? new SessionCoordinator((credentials) => client.createSession(credentials))
      : null;
  }, []);
  const [state, setState] = useState<SessionState>({ status: 'signed_out', failure: null });

  const signIn = useCallback(async () => {
    if (!coordinator || !apiClient || !seededPassword || !candidateId) {
      setState({ status: 'signed_out', failure: 'not_configured' });
      return;
    }
    setState({ status: 'signing_in' });
    const result = await coordinator.signIn({
      username: FINANCE_USERNAME,
      password: seededPassword,
    });
    if (!result.ok) {
      if (result.reason !== 'superseded')
        setState({ status: 'signed_out', failure: result.reason });
      return;
    }
    if (result.user.role !== 'finance') {
      coordinator.signOut();
      setState({ status: 'signed_out', failure: 'not_finance' });
      return;
    }
    setState({
      status: 'signed_in',
      services: createServices(
        result.user,
        createFinanceApi(apiClient, coordinator, result.user.id),
        candidateId,
      ),
    });
  }, [coordinator]);

  const signOut = useCallback(() => {
    coordinator?.signOut();
    setState({ status: 'signed_out', failure: null });
  }, [coordinator]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <FinanceSessionContext.Provider value={value}>{children}</FinanceSessionContext.Provider>;
}

function createServices(user: User, api: FinanceApi, candidate: string): FinanceServices {
  let revision = 0;
  const listeners = new Set<() => void>();
  const cache = new ResourceCache(() => {
    revision += 1;
    for (const listener of listeners) listener();
  });
  return {
    user,
    api,
    cache,
    cacheRevision: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      get: () => revision,
    },
    scope: `${candidate}:${user.id}`,
  };
}

export function useFinanceSession(): FinanceSessionValue {
  const value = useContext(FinanceSessionContext);
  if (!value) throw new Error('useFinanceSession must be used inside <FinanceSessionProvider>');
  return value;
}

/** The signed-in services; only for components rendered while signed in. */
export function useFinance(): FinanceServices {
  const { state } = useFinanceSession();
  if (state.status !== 'signed_in') throw new Error('useFinance needs a signed-in session');
  return state.services;
}

/** Re-renders when the payment cache keeps a newer copy of something. */
export function useCacheRevision(services: FinanceServices): number {
  return useSyncExternalStore(services.cacheRevision.subscribe, services.cacheRevision.get);
}
