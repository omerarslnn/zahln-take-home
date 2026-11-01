import { ORDER_LIFETIME_MS, type CallResult } from '@mensa/domain';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppActive } from './components/ui';
import { useControllerRevision, usePaymentServices } from './payments/PaymentServices';

export type OrderFailure = 'not_found' | 'offline' | 'session' | 'error';

const POLL_MS = 3_000;
/** The review follows an order at most for its lifetime plus a minute. */
const POLL_BUDGET_MS = ORDER_LIFETIME_MS + 60_000;

/**
 * The scanned order in the payer's view (mensa, items, the payer's own amount), read while the
 * review is on screen and the app in front. Answers go through the cache, so an older read never
 * replaces a newer one; answers that arrive after the user left, or for another order or account,
 * are ignored.
 */
export function useOrder(orderId: string) {
  const { api, controller } = usePaymentServices();
  useControllerRevision(controller);
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [failure, setFailure] = useState<OrderFailure | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!api || !controller) return;
    const ticket = (latest.current += 1);
    const result = await api.getOrder(orderId);
    if (ticket !== latest.current) return;
    if (result.kind === 'success') {
      controller.cache.putOrder(result.data);
      setFailure(null);
    } else {
      setFailure(orderFailure(result));
    }
  }, [api, controller, orderId]);

  const order = controller?.cache.order(orderId);
  const live = !order || order.status === 'open' || order.status === 'paying';

  useEffect(() => {
    if (!focused || !appActive) return;
    void load();
    if (!live) return () => void (latest.current += 1);
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_BUDGET_MS) clearInterval(timer);
      else void load();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      latest.current += 1; // whatever is still on its way is ignored
    };
  }, [focused, appActive, live, load]);

  return { order, failure, reload: load };
}

function orderFailure(result: Exclude<CallResult<unknown>, { kind: 'success' }>): OrderFailure {
  if (result.kind === 'no_response') return 'offline';
  if (result.kind === 'session_unavailable' || result.kind === 'no_session') return 'session';
  if (result.kind === 'problem' && result.problem.code === 'not_found') return 'not_found';
  return 'error';
}
