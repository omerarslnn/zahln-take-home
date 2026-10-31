import { monotonicNow } from '@mensa/api';

/**
 * Timers behind an interface, so polling and backoff run on a fake clock in tests. `now` is
 * monotonic: it measures elapsed time and never jumps with the device clock.
 */
export interface Scheduler {
  now(): number;
  /**
   * Runs `callback` once after `delayMs`; returns a function that cancels it. A returned promise is
   * ignored by the real scheduler; the test scheduler awaits it so tests stay deterministic.
   */
  setTimer(callback: () => void | Promise<void>, delayMs: number): () => void;
}

export const realScheduler: Scheduler = {
  now: monotonicNow,
  setTimer(callback, delayMs) {
    const handle = setTimeout(() => void callback(), delayMs);
    return () => clearTimeout(handle);
  },
};
