import { useEffect, useState } from 'react';

/**
 * The device's current time, refreshed every `intervalMs`, so a displayed "now" never goes stale.
 * Display only: expiry and payment decisions use server time from the Date header, not this.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
