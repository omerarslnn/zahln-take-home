// A payment's details as the server reports them: place, items, price group, amount, status,
// refunds and the full history. The student app has an identical copy. Times are Berlin time, the
// zone the Studierendenwerk reports in, and labelled as such.
import type { Payment, PaymentDetail } from '@mensa/api';
import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Text, View } from 'react-native';
import { Card, LabelledValue } from './Foundation';
import {
  historyEventKey,
  paymentStatusText,
  priceGroupKey,
  refundStatusText,
} from './payment-text';
import { StatusBadge } from './ui';

export function PaymentDetails({
  payment,
  detail,
}: {
  /** The newest summary (from a list or the detail). */
  payment: Payment;
  /** Refunds and history; null while loading or while only an older detail is known. */
  detail: PaymentDetail | null;
}) {
  const { t, locale } = useI18n();
  const status = paymentStatusText(payment.status);
  return (
    <>
      <Card>
        <StatusBadge tone={status.tone} label={t(status.key)} />
        <LabelledValue
          label={t('payment.amount')}
          value={formatCents(payment.amountCents, locale)}
        />
        <LabelledValue
          label={t('payment.priceGroup')}
          value={t(priceGroupKey(payment.priceGroup))}
        />
        <LabelledValue
          label={t('payment.place')}
          value={`${payment.mensa.name} · ${payment.till.name}`}
        />
        <LabelledValue
          label={t('payment.createdAt')}
          value={`${formatBerlinDateTime(payment.createdAt, locale)} (${t('time.berlin')})`}
        />
      </Card>

      <Card title={t('payment.items')}>
        {payment.items.map((item) => (
          <View
            key={item.itemId}
            accessible
            accessibilityLabel={t('payment.itemLine', {
              quantity: item.quantity,
              name: item.name[locale],
              price: formatCents(item.unitPriceCents, locale),
            })}
            className="flex-row justify-between gap-3"
          >
            <Text className="flex-1 text-base text-ink">
              {item.quantity} × {item.name[locale]}
            </Text>
            <Text className="text-base text-ink-muted">
              {t('payment.each', { price: formatCents(item.unitPriceCents, locale) })}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={t('payment.refunds')}>
        <LabelledValue
          label={t('payment.refunded')}
          value={formatCents(payment.refundedAmountCents, locale)}
        />
        <LabelledValue
          label={t('payment.refundPending')}
          value={formatCents(payment.pendingRefundAmountCents, locale)}
        />
        {detail?.refunds.map((refund) => {
          const text = refundStatusText(refund.status);
          return (
            <View key={refund.id} className="gap-1 border-t border-line pt-2">
              <StatusBadge tone={text.tone} label={t(text.key)} />
              <Text className="text-base text-ink">
                {formatCents(refund.amountCents, locale)} ·{' '}
                {formatBerlinDateTime(refund.createdAt, locale)}
              </Text>
              {refund.reason ? (
                <Text className="text-base text-ink-muted">{refund.reason}</Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card title={t('payment.history')}>
        {detail ? (
          detail.history.map((event, index) => (
            <View
              key={`${event.at}-${index}`}
              accessible
              className="flex-row flex-wrap justify-between gap-2"
            >
              <Text className="text-base text-ink">{t(historyEventKey(event.type))}</Text>
              <Text className="text-base text-ink-muted">
                {event.amountCents !== null ? `${formatCents(event.amountCents, locale)} · ` : ''}
                {formatBerlinDateTime(event.at, locale)}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-base text-ink-muted">{t('payment.historyLoading')}</Text>
        )}
      </Card>
    </>
  );
}
