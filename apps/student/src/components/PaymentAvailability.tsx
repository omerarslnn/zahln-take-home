// Whether this app may start NEW payments, from GET /config. Student app only: the API checks the
// payer app's version (X-App-Version on POST /orders/{orderId}/payments), never the till's.
// There is deliberately no "Update" button: the API provides no store URL to send it to.
import type { GateState } from '@mensa/domain';
import { useI18n } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { availabilityNotice, gateAnnouncement, gateMessage } from '../availability';
import { useGateRefreshing, usePaymentGate, usePaymentServices } from '../payments/PaymentServices';
import { Card } from './Foundation';
import { Body, Button, Notice, useAnnouncement, type Tone } from './ui';

const DOT: Record<Tone, string> = {
  ok: 'bg-success',
  pending: 'bg-brand',
  warning: 'bg-warning',
  error: 'bg-danger',
  neutral: 'bg-line',
};

/** The gate state in words (home, diagnostics); a change while the screen is open is announced. */
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
      {availabilityNotice(gate)?.recheck ? <RecheckButton /> : null}
    </Card>
  );
}

/**
 * The one availability notice of a payment screen (review, result), for the gate state the screen
 * renders with; nothing while payments are open. `detail` says what waits for availability.
 */
export function AvailabilityNotice({ gate, detail }: { gate: GateState | null; detail?: string }) {
  const { t } = useI18n();
  const notice = availabilityNotice(gate);
  if (!notice) return null;
  return (
    <View className="gap-2">
      <Notice tone={notice.tone} title={t(notice.key, notice.params)}>
        {detail ? <Body>{detail}</Body> : null}
      </Notice>
      {notice.recheck ? <RecheckButton /> : null}
    </View>
  );
}

/**
 * Reads payment availability again on request. Outside the notice's text group, so screen readers
 * reach it as a button of its own; busy, and so not tappable, while a read is on its way.
 */
function RecheckButton() {
  const { t } = useI18n();
  const { checkPaymentsAgain } = usePaymentServices();
  const checking = useGateRefreshing();
  return (
    <Button
      tone="secondary"
      label={t('payments.recheck')}
      busy={checking}
      onPress={checkPaymentsAgain}
    />
  );
}
