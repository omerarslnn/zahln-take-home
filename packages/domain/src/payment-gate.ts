import type { ApiResult, AppConfig } from '@mensa/api';
import { compareAppVersions, parseAppVersion } from './app-version';

/**
 * Whether a NEW payment may be started. Only new payments are gated: reading and reconciling
 * earlier payments always stays available, so a blocked app still shows the truth about them.
 */
export type GateState =
  | { status: 'checking' }
  | { status: 'open' }
  | { status: 'blocked'; reason: 'update_required'; current: string; minimum: string }
  | { status: 'blocked'; reason: 'payments_paused' }
  | { status: 'blocked'; reason: 'config_unavailable' }
  | { status: 'blocked'; reason: 'invalid_app_version' }
  | { status: 'blocked'; reason: 'invalid_min_version' };

export type BlockReason = Extract<GateState, { status: 'blocked' }>['reason'];

/**
 * The payment policy as a pure function. It fails closed: a missing or unparsable version, or a
 * configuration that could not be read, blocks new payments rather than letting them through.
 */
export function evaluatePaymentPolicy(
  appVersion: string | undefined,
  config: AppConfig | null,
): GateState {
  const current = parseAppVersion(appVersion);
  if (!current) return { status: 'blocked', reason: 'invalid_app_version' };
  if (!config) return { status: 'blocked', reason: 'config_unavailable' };
  const minimum = parseAppVersion(config.minAppVersion);
  if (!minimum) return { status: 'blocked', reason: 'invalid_min_version' };
  if (compareAppVersions(current, minimum) < 0) {
    return {
      status: 'blocked',
      reason: 'update_required',
      current: appVersion ?? '',
      minimum: config.minAppVersion,
    };
  }
  return config.paymentsEnabled
    ? { status: 'open' }
    : { status: 'blocked', reason: 'payments_paused' };
}

/**
 * Keeps the current gate state, read from GET /config at start-up, before every new payment and
 * whenever `GateRecovery` asks, and tightened when the server refuses a payment despite a passing
 * pre-check (426 app_version_unsupported, 503 payments_disabled), because the server is
 * authoritative.
 *
 * Only the newest read decides. A read overtaken by a newer read or by a refusal changes nothing
 * when it answers late, and whoever awaits it gets the newest outcome instead: an answer to a
 * request sent before the connection dropped, or before a refusal, never reopens payments.
 */
export class PaymentGate {
  private current: GateState = { status: 'checking' };
  /** Grows with every read and refusal; a read's answer counts only while it holds the newest. */
  private ticket = 0;
  /** The newest read while it is on its way. */
  private reading: Promise<GateState> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly appVersion: string | undefined,
    private readonly fetchConfig: () => Promise<ApiResult<AppConfig>>,
  ) {}

  state(): GateState {
    return this.current;
  }

  /** Whether a configuration read is on its way; listeners hear when this changes too. */
  isRefreshing(): boolean {
    return this.reading !== null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Reads the configuration. Callers share the read already on its way, so a burst of triggers
   * sends one request. `fresh` starts a new read that overtakes it, for when that read may have
   * left on a connection that has since gone and could hang until the transport's timeout.
   */
  refresh(options: { fresh?: boolean } = {}): Promise<GateState> {
    if (this.reading && !options.fresh) return this.reading;
    const ticket = (this.ticket += 1);
    const reading = this.fetchConfig().then(
      (result) => this.settle(ticket, result.kind === 'success' ? result.data : null),
      () => this.settle(ticket, null),
    );
    this.reading = reading;
    this.notify();
    return reading;
  }

  /** The server refused a payment for a gate reason; block until a later read says otherwise. */
  noteServerRefusal(code: 'app_version_unsupported' | 'payments_disabled'): void {
    // Reads on their way left before this refusal: their answers no longer count.
    this.ticket += 1;
    this.reading = null;
    this.set(
      code === 'payments_disabled'
        ? { status: 'blocked', reason: 'payments_paused' }
        : // The new minimum is unknown until the next refresh, so it is left empty.
          {
            status: 'blocked',
            reason: 'update_required',
            current: this.appVersion ?? '',
            minimum: '',
          },
    );
  }

  /** Applies a read's answer while it is the newest; an overtaken read defers to the newest. */
  private settle(ticket: number, config: AppConfig | null): GateState | Promise<GateState> {
    if (ticket !== this.ticket) return this.reading ?? this.current;
    this.reading = null;
    this.set(evaluatePaymentPolicy(this.appVersion, config));
    return this.current;
  }

  private set(next: GateState): void {
    this.current = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
