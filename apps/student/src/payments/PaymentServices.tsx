// Wires the platform-neutral payment domain into the app: one PaymentGate, SessionCoordinator and
// SecureStore-backed IntentStore per app process, and one IntentController per signed-in user.
// The till has an identical copy; each app passes its own polling budget.
import type { User } from '@mensa/api';
import {
  createScopedApi,
  IntentController,
  PaymentGate,
  realScheduler,
  SessionCoordinator,
  type GateState,
  type PollingOptions,
  type ScopedApi,
  type ServerTime,
  type SignInResult,
} from '@mensa/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { apiClient, appVersion, candidateId, seededPassword, serverClock } from '../api';
import { newIntentKey } from './ids';
import { createSecureIntentStore } from './secure-intent-store';

function createServices() {
  if (!apiClient || !candidateId) return null;
  const client = apiClient;
  return {
    client,
    candidateId,
    gate: new PaymentGate(appVersion, () => client.getConfig()),
    session: new SessionCoordinator((credentials) => client.createSession(credentials)),
    store: createSecureIntentStore(),
  };
}

type Services = NonNullable<ReturnType<typeof createServices>>;

export type SignInOutcome = SignInResult | { ok: false; reason: 'not_configured' };

interface PaymentServicesValue {
  /** Null when the build lacks its public API configuration. */
  services: Services | null;
  /** The signed-in account, from the session (never stored on the device). */
  user: User | null;
  /** The signed-in user's controller; null while nobody is signed in or its records still load. */
  controller: IntentController | null;
  /** Reads for the signed-in user (menu, orders, payments), through the session coordinator. */
  api: ScopedApi | null;
  /**
   * The signed-in user's saved actions could not be read. No controller is offered then: without
   * its records the app could start a second payment for an order whose first one is unresolved.
   */
  recordsUnavailable: boolean;
  /** Signs a seeded test account in; the password stays in this module. */
  signIn: (username: string) => Promise<SignInOutcome>;
  signOut: () => void;
}

const PaymentServicesContext = createContext<PaymentServicesValue>({
  services: null,
  user: null,
  controller: null,
  api: null,
  recordsUnavailable: false,
  signIn: () => Promise.resolve({ ok: false, reason: 'not_configured' }),
  signOut: () => undefined,
});

export function PaymentServicesProvider({
  children,
  polling,
}: {
  children: ReactNode;
  /** Pass a constant: a new object would rebuild the controller. */
  polling?: PollingOptions;
}) {
  const [services] = useState(createServices);
  const [loaded, setLoaded] = useState<{ controller: IntentController; api: ScopedApi } | null>(
    null,
  );
  const [recordsUnavailable, setRecordsUnavailable] = useState(false);
  const controllerRef = useRef<IntentController | null>(null);
  const user = useSyncExternalStore(
    useCallback(
      (listener: () => void) => services?.session.subscribe(listener) ?? noop,
      [services],
    ),
    () => services?.session.user() ?? null,
  );
  // Keyed by ID and role: a 5-minute re-login replaces the session object but must not replace
  // the controller (it may have an attempt in flight).
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!services || !userId || !role) return;
    // A different user gets a different controller and storage partition; the previous user's
    // controller is disposed, so their saved actions are neither submitted nor shown, and late
    // responses for them update nothing on screen.
    const api = createScopedApi(services.client, services.session, userId);
    const next = new IntentController({
      scope: { candidateId: services.candidateId, userId },
      role,
      api,
      store: services.store,
      clock: serverClock,
      scheduler: realScheduler,
      newKey: newIntentKey,
      gate: services.gate,
      polling,
    });
    let current = true;
    next.load().then(
      () => {
        if (!current) return;
        controllerRef.current = next;
        setLoaded({ controller: next, api });
      },
      () => {
        next.dispose(); // it may already be polling records it did read
        if (current) setRecordsUnavailable(true);
      },
    );
    return () => {
      current = false;
      next.dispose();
      controllerRef.current = null;
      setLoaded(null);
      setRecordsUnavailable(false);
    };
  }, [services, userId, role, polling]);

  // Configuration is read at start-up and on every return to the foreground. Monotonic clocks can
  // pause while the device sleeps, so server time is learned again from the next response. Polling
  // pauses in the background; nothing is ever resent on these events.
  useEffect(() => {
    if (!services) return;
    void services.gate.refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      if (active) {
        serverClock.invalidate();
        void services.gate.refresh();
      }
      controllerRef.current?.setActive(active);
    });
    return () => subscription.remove();
  }, [services]);

  const signIn = useCallback(
    async (username: string): Promise<SignInOutcome> => {
      if (!services || !seededPassword) return { ok: false, reason: 'not_configured' };
      return services.session.signIn({ username, password: seededPassword });
    },
    [services],
  );
  const signOut = useCallback(() => services?.session.signOut(), [services]);

  const value = useMemo(
    () => ({
      services,
      user,
      controller: loaded?.controller ?? null,
      api: loaded?.api ?? null,
      recordsUnavailable,
      signIn,
      signOut,
    }),
    [services, user, loaded, recordsUnavailable, signIn, signOut],
  );
  return (
    <PaymentServicesContext.Provider value={value}>{children}</PaymentServicesContext.Provider>
  );
}

export function usePaymentServices(): PaymentServicesValue {
  return useContext(PaymentServicesContext);
}

/** The payment gate's current state; null when the API is not configured. */
export function usePaymentGate(): GateState | null {
  const { services } = usePaymentServices();
  return useSyncExternalStore(
    useCallback((listener: () => void) => services?.gate.subscribe(listener) ?? noop, [services]),
    () => services?.gate.state() ?? null,
  );
}

/**
 * Re-renders when the controller's records, polling or cached resources change. The snapshot is the
 * controller's change counter, a number: `controller.list()` returns a new array on every call and
 * would make `useSyncExternalStore` render forever. Read records from the controller during render.
 */
export function useControllerRevision(controller: IntentController | null): number {
  return useSyncExternalStore(
    useCallback((listener: () => void) => controller?.subscribe(listener) ?? noop, [controller]),
    () => controller?.revision() ?? 0,
  );
}

/** Server time, re-read every `intervalMs` for countdowns. Null until a response set the clock. */
export function useServerNow(intervalMs = 1_000): ServerTime | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return serverClock.now();
}

function noop() {
  return undefined;
}
