import type { ServerDateSample } from '@mensa/api';

/** Bounds on the server's current time, in epoch milliseconds. The truth lies in between. */
export interface ServerTime {
  earliest: number;
  latest: number;
}

/**
 * The server's clock, estimated from HTTP `Date` headers plus a monotonic local clock.
 *
 * The device clock is never used: the user can change it, so it could expire an order early or make
 * an old intent look young enough to replay. Each sample says the server stamped its response at
 * some moment between sending and receiving, and that the stamp is truncated to whole seconds, so
 * one sample gives an interval for `server time − monotonic time`. Samples are intersected to narrow
 * it; a sample that contradicts the interval (the server clock changed or the device slept) replaces it.
 */
export class ServerClock {
  private offset: { low: number; high: number } | null = null;

  constructor(private readonly monotonicNow: () => number) {}

  observe(sample: ServerDateSample): void {
    const stamp = sample.serverDate.getTime();
    if (!Number.isFinite(stamp) || sample.receivedAt < sample.sentAt) return;
    const low = stamp - sample.receivedAt;
    const high = stamp + 999 - sample.sentAt;
    const current = this.offset;
    const merged = current && {
      low: Math.max(current.low, low),
      high: Math.min(current.high, high),
    };
    this.offset = merged && merged.low <= merged.high ? merged : { low, high };
  }

  /**
   * Forgets the estimate, e.g. when the app returns from the background: monotonic clocks can pause
   * while the device sleeps. Until the next response, time-based decisions treat time as unknown.
   */
  invalidate(): void {
    this.offset = null;
  }

  /**
   * The current server time, or null when no valid `Date` header has been seen since start.
   * Bounds are whole milliseconds, rounded outwards: `performance.now()` is fractional, and stored
   * timestamps must be integers (a fractional one once made a saved intent unreadable).
   */
  now(): ServerTime | null {
    if (!this.offset) return null;
    const local = this.monotonicNow();
    return {
      earliest: Math.floor(local + this.offset.low),
      latest: Math.ceil(local + this.offset.high),
    };
  }
}

export type ExpiryState = 'not_expired' | 'expired' | 'uncertain';

/**
 * Whether a server deadline (e.g. an order's `expiresAt`) has passed, by server time. A display
 * hint only: it never decides a payment outcome, because a payment that started before the
 * deadline can still be confirmed after it.
 */
export function expiryState(deadline: number, now: ServerTime | null): ExpiryState {
  if (!now) return 'uncertain';
  if (now.earliest >= deadline) return 'expired';
  if (now.latest < deadline) return 'not_expired';
  return 'uncertain';
}
