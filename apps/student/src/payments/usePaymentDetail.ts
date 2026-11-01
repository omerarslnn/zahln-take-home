// Loads one payment with its refunds and history (GET /payments/{id}). The till has an identical
// copy. The response goes through the controller's cache, so an older answer never replaces a
// newer copy, and the screen shows whatever the cache holds as newest.
import type { HistoryFailure } from '@mensa/domain';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useControllerRevision, usePaymentServices } from './PaymentServices';

export type DetailFailure = HistoryFailure | 'not_found' | 'forbidden';

const REFRESH_MS = 4_000;
/** Automatic refreshes stop after this; a refresh button stays. */
const REFRESH_BUDGET_MS = 3 * 60_000;

export function usePaymentDetail(paymentId: string) {
  const { api, controller } = usePaymentServices();
  useControllerRevision(controller);
  const focused = useIsFocused();
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<DetailFailure | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!api || !controller) return;
    const ticket = (latest.current += 1);
    setLoading(true);
    const result = await api.getPayment(paymentId);
    // A newer load, another payment or a sign-out has superseded this one.
    if (ticket !== latest.current) return;
    setLoading(false);
    if (result.kind === 'success') {
      controller.cache.putPaymentDetail(result.data);
      setFailure(null);
      return;
    }
    setFailure(failureOf(result));
  }, [api, controller, paymentId]);

  const view = controller?.cache.paymentView(paymentId) ?? null;
  const unsettled =
    view?.payment.status === 'pending' || (view?.payment.pendingRefundAmountCents ?? 0) > 0;

  useEffect(() => {
    if (!focused) return;
    void load();
    return () => {
      latest.current += 1; // ignore what is still on its way
    };
  }, [focused, load]);

  // Keep it current while something is still being checked, but not forever and not unseen.
  useEffect(() => {
    if (!focused || !unsettled) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > REFRESH_BUDGET_MS) clearInterval(timer);
      else void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [focused, unsettled, load]);

  return { view, loading, failure, reload: load };
}

function failureOf(result: { kind: string; problem?: { code: string } }): DetailFailure {
  if (result.kind === 'no_response') return 'offline';
  if (result.kind === 'session_unavailable' || result.kind === 'no_session') return 'session';
  if (result.kind === 'problem' && result.problem?.code === 'not_found') return 'not_found';
  if (result.kind === 'problem' && result.problem?.code === 'forbidden') return 'forbidden';
  return 'error';
}
