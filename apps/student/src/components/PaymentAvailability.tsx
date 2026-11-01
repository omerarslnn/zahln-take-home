// Whether this app may start NEW payments, from GET /config. Student app only: the API checks the
// payer app's version (X-App-Version on POST /orders/{orderId}/payments), never the till's.
// There is deliberately no "Update" button: the API provides no store URL to send it to.
import type { GateState } from '@mensa/domain';
import type { MessageKey, MessageParams } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { usePaymentGate } from '../payments/PaymentServices';
import { Card } from './Foundation';
import { useAnnouncement, type Tone } from './ui';

const DOT: Record<Tone, string> = {
  ok: 'bg-success',
  pending: 'bg-brand',
  warning: 'bg-warning',
  error: 'bg-danger',
  neutral: 'bg-line',
};

/** The gate state in words; a block that starts while the screen is open is announced. */
export function PaymentAvailability() {
  const { t } = useI18n();
  const gate = usePaymentGate();
  const { tone, key, params } = gateMessage(gate);
  useAnnouncement(gateAnnouncement(gate, t), true);
  return (
    <Card title={t('payments.title')}>
      <View accessible className="flex-row items-start gap-3">
        <View className={`mt-1.5 h-3 w-3 rounded-full ${DOT[tone]}`} />
        <Text className="flex-1 text-base text-ink">{t(key, params)}</Text>
      </View>
    </Card>
  );
}

/**
 * What to say when payments stop being possible (paused, update needed); null while they are open
 * or being checked, because "checking… available" on every screen visit is not news.
 */
export function gateAnnouncement(
  gate: GateState | null,
  t: (key: MessageKey, params?: MessageParams) => string,
): string | null {
  if (gate?.status !== 'blocked') return null;
  const { key, params } = gateMessage(gate);
  return t(key, params);
}

export function gateMessage(gate: GateState | null): {
  tone: Tone;
  key: MessageKey;
  params?: MessageParams;
} {
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
