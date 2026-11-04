// What a payment screen says about payment availability (the payment gate), as pure functions, so
// the rules are tested without React Native: one notice derived from the live gate on every
// render, never a stored copy, and a pay action only while there is no notice.
import type { BlockReason, GateState } from '@mensa/domain';
import type { MessageKey, MessageParams } from '@mensa/shared';
import type { Tone } from './components/ui';

export interface GateMessage {
  tone: Tone;
  key: MessageKey;
  params?: MessageParams;
}

export interface AvailabilityNotice extends GateMessage {
  /** Offer "check again": a new answer from the server could lift this without an app update. */
  recheck: boolean;
}

/** An outdated or invalid app version needs an update, not another read. */
const RECHECKABLE: ReadonlySet<BlockReason> = new Set([
  'config_unavailable',
  'payments_paused',
  'invalid_min_version',
]);

/** New payments, and sending one again, may start: the server's newest answer opened the gate. */
export function paymentsOpen(gate: GateState | null): boolean {
  return gate?.status === 'open';
}

/**
 * The one availability notice of a payment screen; null exactly when `paymentsOpen`, so a screen
 * shows either this notice or its pay action, never both. Derived from the live gate on every
 * render and never stored, so it cannot outlive the state it describes (BUG-01).
 */
export function availabilityNotice(gate: GateState | null): AvailabilityNotice | null {
  if (paymentsOpen(gate)) return null;
  return {
    ...gateMessage(gate),
    recheck: gate?.status === 'blocked' && RECHECKABLE.has(gate.reason),
  };
}

/**
 * What a screen reader hears when availability changes on screen: why payments stopped, or that
 * they are available (the pay action is back). Null while checking. Screens pass it to
 * `useAnnouncement` with `changesOnly`: the state a screen opened with is not news, and an
 * unchanged message (another failed read) is not repeated.
 */
export function gateAnnouncement(
  gate: GateState | null,
  t: (key: MessageKey, params?: MessageParams) => string,
): string | null {
  if (!gate || gate.status === 'checking') return null;
  const { key, params } = gateMessage(gate);
  return t(key, params);
}

export function gateMessage(gate: GateState | null): GateMessage {
  if (!gate) return { tone: 'error', key: 'payments.notConfigured' };
  if (gate.status === 'checking') return { tone: 'neutral', key: 'payments.checking' };
  if (gate.status === 'open') return { tone: 'ok', key: 'payments.open' };
  switch (gate.reason) {
    case 'update_required':
      // An empty minimum means the server refused the version (426) without a config to say
      // which version it needs.
      return gate.minimum
        ? {
            tone: 'error',
            key: 'payments.updateRequired',
            params: { current: gate.current, minimum: gate.minimum },
          }
        : {
            tone: 'error',
            key: 'payments.updateRequiredUnknown',
            params: { current: gate.current },
          };
    case 'payments_paused':
      return { tone: 'warning', key: 'payments.paused' };
    case 'config_unavailable':
      return { tone: 'warning', key: 'payments.configUnavailable' };
    case 'invalid_app_version':
    case 'invalid_min_version':
      return { tone: 'error', key: 'payments.invalidVersion' };
  }
}
