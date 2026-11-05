import type { IntentController, PayOrderIntent } from '@mensa/domain';
import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { describeOutcome } from '../payment-outcome';
import { ListRow } from './ui';

/**
 * Where a saved payment action was made, when this phone knows it: from the server's payment, or
 * the order it was read from. Undefined after a restart until the server has been asked.
 */
export function actionPlace(controller: IntentController, record: PayOrderIntent) {
  const fromPayment =
    record.resource && controller.cache.paymentView(record.resource.paymentId)?.payment.mensa;
  return (fromPayment ?? controller.cache.order(record.payload.orderId)?.mensa)?.name;
}

/**
 * One payment action saved on this phone, as a list row: where (when known), its truthful state,
 * the amount the payer confirmed and when it was last sent. Opens its result. The state words come
 * from `describeOutcome`, so an unanswered payment is "not known yet", never paid or declined.
 */
export function PaymentActionRow({
  record,
  place,
  onPress,
  separated,
}: {
  record: PayOrderIntent;
  place: string | undefined;
  onPress: () => void;
  separated?: boolean;
}) {
  const { t, locale } = useI18n();
  const outcome = describeOutcome(record);
  const sentAt = record.lastSentAt ?? record.firstSentAt;
  return (
    <ListRow
      title={place ?? t('home.paymentTitle')}
      status={{ tone: outcome.tone, label: t(outcome.title) }}
      value={formatCents(record.payload.amountCents, locale)}
      subtitle={sentAt !== null ? formatBerlinDateTime(new Date(sentAt), locale) : undefined}
      hint={t('home.openResult')}
      separated={separated}
      onPress={onPress}
    />
  );
}
