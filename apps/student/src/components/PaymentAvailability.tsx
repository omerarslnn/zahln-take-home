// Whether this app may start NEW payments, from GET /config. Student app only: the API checks the
// payer app's version (X-App-Version on POST /orders/{orderId}/payments), never the till's.
// There is deliberately no pay button and no "Update" button: paying needs the local authorization
// step of the next stage, and the API provides no store URL to send an update button to.
import type { GateState } from '@mensa/domain';
import { useI18n, type I18nValue } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { usePaymentGate } from '../payments/PaymentServices';
import { Card } from './Foundation';

type Tone = 'neutral' | 'ok' | 'warning' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-line',
  ok: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** The gate state in words; announced politely when it changes (e.g. payments get paused). */
export function PaymentAvailability() {
  const { t } = useI18n();
  const { tone, text } = describeGate(usePaymentGate(), t);
  return (
    <Card title={t('payments.title')}>
      <View accessible accessibilityLiveRegion="polite" className="flex-row items-start gap-3">
        <View className={`mt-1.5 h-3 w-3 rounded-full ${TONE_CLASS[tone]}`} />
        <Text className="flex-1 text-base text-ink">{text}</Text>
      </View>
    </Card>
  );
}

function describeGate(gate: GateState | null, t: I18nValue['t']): { tone: Tone; text: string } {
  if (!gate) return { tone: 'danger', text: t('payments.notConfigured') };
  if (gate.status === 'checking') return { tone: 'neutral', text: t('payments.checking') };
  if (gate.status === 'open') return { tone: 'ok', text: t('payments.open') };
  switch (gate.reason) {
    case 'update_required':
      return {
        tone: 'danger',
        // An empty minimum means the server refused the version (426) without a config to say
        // which version it needs.
        text: gate.minimum
          ? t('payments.updateRequired', { current: gate.current, minimum: gate.minimum })
          : t('payments.updateRequiredUnknown', { current: gate.current }),
      };
    case 'payments_paused':
      return { tone: 'warning', text: t('payments.paused') };
    case 'config_unavailable':
      return { tone: 'warning', text: t('payments.configUnavailable') };
    case 'invalid_app_version':
    case 'invalid_min_version':
      return { tone: 'danger', text: t('payments.invalidVersion') };
  }
}
