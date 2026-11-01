import { useEffect, useState } from 'react';
import { serverClock } from '../api';

/** Server time in epoch ms (Date headers); the device clock only until the first response. */
function readServerNow(): number {
  return serverClock.now()?.latest ?? Date.now();
}

/**
 * Server time for display ("today" in Berlin, the age of a flagged payment), kept in state and
 * refreshed every `intervalMs`, so rendering stays pure and the value never goes stale for long.
 */
export function useServerNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(readServerNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(readServerNow()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
