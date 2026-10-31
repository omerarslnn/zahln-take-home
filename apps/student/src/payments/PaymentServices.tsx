// Wires the platform-neutral payment domain into the app: one PaymentGate, SessionCoordinator and
// SecureStore-backed IntentStore per app process, and one IntentController per signed-in user.
// The till has an identical copy. Signing in and the payment screens arrive in the next stage;
// until then nobody is signed in, no controller exists and nothing is written.
import {
  createScopedApi,
  IntentController,
  PaymentGate,
  realScheduler,
  SessionCoordinator,
  type GateState,
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
import { apiClient, appVersion, candidateId, serverClock } from '../api';
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

interface PaymentServicesValue {
  /** Null when the build lacks its public API configuration. */
  services: Services | null;
  /** The signed-in user's controller; null while nobody is signed in or it is still loading. */
  controller: IntentController | null;
  /**
   * The signed-in user's saved actions could not be read. No controller is offered then: without
   * its records the app could start a second payment for an order whose first one is unresolved.
   */
  recordsUnavailable: boolean;
}

const PaymentServicesContext = createContext<PaymentServicesValue>({
  services: null,
  controller: null,
  recordsUnavailable: false,
});

export function PaymentServicesProvider({ children }: { children: ReactNode }) {
  const [services] = useState(createServices);
  const [controller, setController] = useState<IntentController | null>(null);
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
    // controller is disposed, so their saved actions are neither submitted nor shown.
    const next = new IntentController({
      scope: { candidateId: services.candidateId, userId },
      role,
      api: createScopedApi(services.client, services.session, userId),
      store: services.store,
      clock: serverClock,
      scheduler: realScheduler,
      newKey: newIntentKey,
      gate: services.gate,
    });
    let current = true;
    next.load().then(
      () => {
        if (!current) return;
        controllerRef.current = next;
        setController(next);
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
      setController(null);
      setRecordsUnavailable(false);
    };
  }, [services, userId, role]);

  // Configuration is read at start-up and on every return to the foreground. Monotonic clocks can
  // pause while the device sleeps, so server time is learned again from the next response.
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

  const value = useMemo(
    () => ({ services, controller, recordsUnavailable }),
    [services, controller, recordsUnavailable],
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

function noop() {
  return undefined;
}
