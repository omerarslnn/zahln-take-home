import type { GateState, PaymentGate } from './payment-gate';
import type { Scheduler } from './scheduler';

/**
 * The device's network state, as a hint for when to read the configuration again. It never opens
 * payments: only the server's answer to that read can.
 */
export interface ConnectivitySource {
  /**
   * Calls `listener` with whether the device has a network: with the current state once it is
   * known, then on changes. Returns a function that stops the calls.
   */
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface GateChecks {
  /** A connection that comes back while the app is in front starts a fresh read. */
  connectivity?: ConnectivitySource;
  /** Waits before the automatic re-reads after a failed read, in order; `[]` turns them off. */
  retryDelaysMs?: readonly number[];
  /** How long a returned connection must last before it is read: handovers come in bursts. */
  settleMs?: number;
}

/** Four re-reads in about two minutes after a failure; after that, the next event or the user. */
export const GATE_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];
export const CONNECTIVITY_SETTLE_MS = 1_000;

/**
 * Decides WHEN the payment gate reads GET /config again; the gate decides what the answer means.
 * It reads at start-up, on every return to the foreground, when the connection comes back while
 * the app is in front, at spaced intervals after a read that got no usable answer (bounded: then
 * it waits for one of those events), and when the user asks. Nothing runs in the background, and
 * only a configuration read changes the gate: a connectivity event never opens payments.
 * `start()` once, `dispose()` with the app's services.
 */
export class GateRecovery {
  private readonly connectivity: ConnectivitySource | undefined;
  private readonly retryDelays: readonly number[];
  private readonly settleMs: number;
  private foreground = true;
  /** The last connectivity report; null until the first one. */
  private online: boolean | null = null;
  /** The connection came back while the app was away: the next foreground read starts afresh. */
  private regainedAway = false;
  /** Automatic re-reads scheduled since the last event. */
  private retriesUsed = 0;
  private cancelSettle: (() => void) | null = null;
  private cancelRetry: (() => void) | null = null;
  private readonly stops: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly gate: PaymentGate,
    private readonly scheduler: Scheduler,
    checks: GateChecks = {},
  ) {
    this.connectivity = checks.connectivity;
    this.retryDelays = checks.retryDelaysMs ?? GATE_RETRY_DELAYS_MS;
    this.settleMs = checks.settleMs ?? CONNECTIVITY_SETTLE_MS;
  }

  /** Starts listening and reads the configuration for the first time. */
  start(): void {
    if (this.disposed || this.stops.length > 0) return;
    this.stops.push(this.gate.subscribe(() => this.afterGateChange()));
    if (this.connectivity) {
      this.stops.push(this.connectivity.subscribe((online) => this.setOnline(online)));
    }
    void this.gate.refresh();
  }

  /** In front again: read (afresh if the connection came back meanwhile). Away: timers stop. */
  setForeground(active: boolean): void {
    if (this.disposed) return;
    this.foreground = active;
    if (!active) {
      if (this.cancelSettle) this.regainedAway = true;
      this.stopTimers();
      return;
    }
    this.stopTimers();
    this.retriesUsed = 0;
    const fresh = this.regainedAway;
    this.regainedAway = false;
    void this.gate.refresh({ fresh });
  }

  /** The user asked: one read (joining one on its way), and the spaced re-reads start over. */
  checkNow(): Promise<GateState> {
    this.stopTimers();
    this.retriesUsed = 0;
    return this.gate.refresh();
  }

  /** Stops every timer and listener; later events and answers change nothing here. */
  dispose(): void {
    this.disposed = true;
    this.stopTimers();
    for (const stop of this.stops.splice(0)) stop();
  }

  private setOnline(online: boolean): void {
    if (this.disposed) return;
    const before = this.online;
    this.online = online;
    if (!online) {
      // A return that did not last is not read.
      this.cancelSettle?.();
      this.cancelSettle = null;
      return;
    }
    if (before === true) return;
    // The first report is where things stand, not a return: the start-up read covers it, unless
    // that read already failed (the network was not up yet).
    if (before === null && !isUnavailable(this.gate.state())) return;
    if (!this.foreground) {
      this.regainedAway = true;
      return;
    }
    this.cancelSettle?.();
    this.cancelSettle = this.scheduler.setTimer(() => this.afterSettle(), this.settleMs);
  }

  private afterSettle(): Promise<void> | undefined {
    this.cancelSettle = null;
    if (this.disposed || !this.foreground || this.online !== true) return undefined;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.retriesUsed = 0;
    // Fresh: a read still on its way may have left on the connection that dropped.
    return this.gate.refresh({ fresh: true }).then(noop);
  }

  /** After a read without a usable answer, schedules the next spaced re-read while any remain. */
  private afterGateChange(): void {
    if (this.disposed) return;
    if (!isUnavailable(this.gate.state())) {
      this.cancelRetry?.();
      this.cancelRetry = null;
      this.retriesUsed = 0;
      return;
    }
    if (!this.foreground || this.gate.isRefreshing() || this.cancelRetry || this.cancelSettle) {
      return;
    }
    const delay = this.retryDelays[this.retriesUsed];
    if (delay === undefined) return;
    this.retriesUsed += 1;
    this.cancelRetry = this.scheduler.setTimer(() => {
      this.cancelRetry = null;
      if (this.disposed || !this.foreground) return undefined;
      return this.gate.refresh().then(noop);
    }, delay);
  }

  private stopTimers(): void {
    this.cancelSettle?.();
    this.cancelSettle = null;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }
}

/**
 * No usable answer (offline, timeout, server error): the only state worth re-reading on a timer.
 * A paused kill switch or a minimum version is an answer; it changes on the next event or request.
 */
function isUnavailable(state: GateState): boolean {
  return state.status === 'blocked' && state.reason === 'config_unavailable';
}

function noop(): void {}
