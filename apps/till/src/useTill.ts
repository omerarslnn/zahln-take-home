import type { Mensa, Till } from '@mensa/api';
import type { HistoryFailure } from '@mensa/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePaymentServices } from './payments/PaymentServices';

/**
 * The signed-in cashier's mensa, till and menu, from `GET /mensas`. Which mensa and till are the
 * cashier's comes from the session (`user.mensaId`, `user.tillId`), not from a choice in the app.
 */
export function useTill() {
  const { api, user } = usePaymentServices();
  const [mensa, setMensa] = useState<Mensa | null>(null);
  const [failure, setFailure] = useState<HistoryFailure | 'unassigned' | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!api || !user) return;
    const ticket = (latest.current += 1);
    const result = await api.listMensas();
    if (ticket !== latest.current) return; // another account or a newer load
    if (result.kind !== 'success') {
      setFailure(result.kind === 'no_response' ? 'offline' : 'error');
      return;
    }
    const own = result.data.items.find((candidate) => candidate.id === user.mensaId) ?? null;
    setMensa(own);
    setFailure(own ? null : 'unassigned');
  }, [api, user]);

  useEffect(() => {
    void load();
    return () => void (latest.current += 1);
  }, [load]);

  const till: Till | null = mensa?.tills.find((candidate) => candidate.id === user?.tillId) ?? null;
  return { mensa, till, failure, reload: load };
}
