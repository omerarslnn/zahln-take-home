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
 * Keeps the current gate state: refreshed from GET /config at start-up and before every new
 * payment, and tightened when the server refuses a payment despite a passing pre-check
 * (426 app_version_unsupported, 503 payments_disabled), because the server is authoritative.
 */
export class PaymentGate {
  private current: GateState = { status: 'checking' };
  private refreshing: Promise<GateState> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly appVersion: string | undefined,
    private readonly fetchConfig: () => Promise<ApiResult<AppConfig>>,
  ) {}

  state(): GateState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the configuration once; concurrent callers share the same request. */
  refresh(): Promise<GateState> {
    this.refreshing ??= this.fetchConfig()
      .then((result) => {
        this.set(
          evaluatePaymentPolicy(this.appVersion, result.kind === 'success' ? result.data : null),
        );
        return this.current;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** The server refused a payment for a gate reason; block until a refresh says otherwise. */
  noteServerRefusal(code: 'app_version_unsupported' | 'payments_disabled'): void {
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

  private set(next: GateState): void {
    this.current = next;
    for (const listener of this.listeners) listener();
  }
}
