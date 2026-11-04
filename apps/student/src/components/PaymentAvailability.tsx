// Whether this app may start NEW payments, from GET /config. Student app only: the API checks the
// payer app's version (X-App-Version on POST /orders/{orderId}/payments), never the till's.
// There is deliberately no "Update" button: the API provides no store URL to send it to.
import type { GateState } from '@mensa/domain';
import { useI18n } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { availabilityNotice, gateAnnouncement, gateMessage } from '../availability';
import { useGateRefreshing, usePaymentGate, usePaymentServices } from '../payments/PaymentServices';
import { Button, Card, Icon, Notice, toneIcon, useAnnouncement } from './ui';

/** The gate state in words (home, diagnostics); a change while the screen is open is announced. */
export function PaymentAvailability() {
  const { t } = useI18n();
  const gate = usePaymentGate();
  const { tone, key, params } = gateMessage(gate);
  const icon = toneIcon(tone);
  useAnnouncement(gateAnnouncement(gate, t), true);
  return (
    <Card title={t('payments.title')}>
      <View accessible className="flex-row gap-3">
        <View className="h-6 justify-center">
          <Icon name={icon.name} color={icon.color} />
        </View>
        <Text className="flex-1 text-body text-ink">{t(key, params)}</Text>
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
    <Notice
      tone={notice.tone}
      title={t(notice.key, notice.params)}
      description={detail}
      actions={notice.recheck ? <RecheckButton /> : undefined}
    />
  );
}

/**
 * Reads payment availability again on request. A notice action, so screen readers reach it as a
 * button of its own; busy, and so not tappable, while a read is on its way.
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
