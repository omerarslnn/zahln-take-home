import type { Payment, PaymentDetail } from '@mensa/api';
import { formatBerlinDateTime, formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';
import { OrderItemRow } from '../components/OrderParts';
import {
  historyEventKey,
  historyEventVisual,
  paymentStatusText,
  priceGroupKey,
  refundStatusText,
} from '../components/payment-text';
import {
  AmountText,
  Button,
  Caption,
  Card,
  Icon,
  LabelledValue,
  ListRow,
  LoadingIndicator,
  Notice,
  Screen,
  Skeleton,
  StatusPill,
  Tag,
  TONE,
  useAnnouncement,
} from '../components/ui';
import { spokenPhrase } from '../components/ui/a11y-text';
import type { RootStackParamList } from '../navigation';
import { usePaymentDetail, type DetailFailure } from '../payments/usePaymentDetail';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentDetail'>;

/** One payment with its refunds and full server history. Read-only for a payer. */
export function PaymentDetailScreen({ route }: Props) {
  const { view, loading, failure, reload } = usePaymentDetail(route.params.paymentId);
  return (
    <PaymentDetailView
      payment={view?.payment ?? null}
      detail={view?.detail ?? null}
      loading={loading}
      failure={failure}
      onReload={() => void reload()}
    />
  );
}

export interface PaymentDetailViewProps {
  /** The newest copy the cache holds; null until the first answer. */
  payment: Payment | null;
  /** Refunds and history; null while loading or while only an older detail is known. */
  detail: PaymentDetail | null;
  loading: boolean;
  failure: DetailFailure | null;
  onReload: () => void;
}

/**
 * The payment as the server reports it: status and amount as the hero, where and when, refunds
 * with what can still be refunded (the server's figure, not a calculation), the items, a reference
 * for questions at the till, and the server's history as a timeline. A failed refresh keeps what
 * was loaded and says so above it.
 */
export function PaymentDetailView({
  payment,
  detail,
  loading,
  failure,
  onReload,
}: PaymentDetailViewProps) {
  const { t } = useI18n();
  return (
    <Screen>
      {failure ? (
        <Notice
          tone="error"
          title={t(`detail.failure.${failure}`)}
          actions={<Button label={t('common.retry')} busy={loading} onPress={onReload} />}
        />
      ) : null}
      {payment ? (
        <>
          <PaymentHero payment={payment} />
          <RefundsCard payment={payment} detail={detail} />
          <ItemsCard payment={payment} />
          <TimelineCard detail={detail} />
          <Button
            tone="tertiary"
            icon="refresh-outline"
            label={t('detail.refresh')}
            busy={loading}
            onPress={onReload}
          />
        </>
      ) : failure ? null : (
        <DetailLoading />
      )}
    </Screen>
  );
}

function PaymentHero({ payment }: { payment: Payment }) {
  const { t, locale } = useI18n();
  const status = paymentStatusText(payment.status);
  // E.g. pending → confirmed while the screen refreshes: said once, not on every refresh.
  useAnnouncement(t(status.key), true);
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <StatusPill tone={status.tone} label={t(status.key)} />
        <Tag
          icon="pricetag-outline"
          label={t('home.priceGroup', { group: t(priceGroupKey(payment.priceGroup)) })}
        />
      </View>
      <View
        accessible
        accessibilityLabel={`${t('payment.amount')}: ${formatCents(payment.amountCents, locale)}`}
      >
        <AmountText cents={payment.amountCents} size="display" />
      </View>
      <LabelledValue
        label={t('payment.place')}
        value={`${payment.mensa.name} · ${payment.till.name}`}
      />
      <LabelledValue
        label={t('payment.createdAt')}
        value={`${formatBerlinDateTime(payment.createdAt, locale)} (${t('time.berlin')})`}
      />
      <LabelledValue label={t('detail.reference')} value={payment.id} />
    </Card>
  );
}

/** Shown once a refund exists or is on its way; all figures are the server's. */
function RefundsCard({ payment, detail }: { payment: Payment; detail: PaymentDetail | null }) {
  const { t, locale } = useI18n();
  const refunds = detail?.refunds ?? [];
  const touched =
    payment.refundedAmountCents > 0 || payment.pendingRefundAmountCents > 0 || refunds.length > 0;
  if (!touched) return null;
  return (
    <Card title={t('payment.refunds')}>
      <LabelledValue
        label={t('payment.refunded')}
        value={formatCents(payment.refundedAmountCents, locale)}
      />
      {payment.pendingRefundAmountCents > 0 ? (
        <LabelledValue
          label={t('payment.refundPending')}
          value={formatCents(payment.pendingRefundAmountCents, locale)}
        />
      ) : null}
      <LabelledValue
        label={t('detail.refundable')}
        value={formatCents(payment.refundableAmountCents, locale)}
      />
      {refunds.map((refund) => {
        const text = refundStatusText(refund.status);
        return (
          <ListRow
            key={refund.id}
            separated
            title={formatCents(refund.amountCents, locale)}
            status={{ tone: text.tone, label: t(text.key) }}
            subtitle={[formatBerlinDateTime(refund.createdAt, locale), refund.reason]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      })}
    </Card>
  );
}

function ItemsCard({ payment }: { payment: Payment }) {
  const { t, locale } = useI18n();
  return (
    <Card title={t('payment.items')}>
      {payment.items.map((item, index) => (
        <OrderItemRow
          key={item.itemId}
          quantity={item.quantity}
          name={item.name[locale]}
          unitPriceCents={item.unitPriceCents}
          separated={index > 0}
        />
      ))}
    </Card>
  );
}

/**
 * The server's history, oldest first, as a vertical timeline. Each event is one element for
 * screen readers ("Refund completed, €1.00, 04/11/2026, 12:07"); the icon only repeats the words.
 */
function TimelineCard({ detail }: { detail: PaymentDetail | null }) {
  const { t, locale } = useI18n();
  if (!detail) {
    return (
      <Card title={t('payment.history')}>
        <Caption>{t('payment.historyLoading')}</Caption>
      </Card>
    );
  }
  const last = detail.history.length - 1;
  return (
    <Card title={t('payment.history')}>
      {detail.history.map((event, index) => {
        const visual = historyEventVisual(event.type);
        const amount = event.amountCents !== null ? formatCents(event.amountCents, locale) : null;
        const at = formatBerlinDateTime(event.at, locale);
        return (
          <View
            key={`${event.at}-${index}`}
            accessible
            accessibilityLabel={spokenPhrase([t(historyEventKey(event.type)), amount, at])}
            className="flex-row gap-3"
          >
            <View className="w-6 items-center">
              <Icon name={visual.icon} size="md" color={TONE[visual.tone].iconColor} />
              {index < last ? <View className="mt-1 w-0.5 flex-1 bg-line-subtle" /> : null}
            </View>
            <View className={`flex-1 gap-0.5 ${index < last ? 'pb-4' : ''}`}>
              <Text className="text-body font-semibold text-ink">
                {t(historyEventKey(event.type))}
              </Text>
              <Caption>{amount ? `${amount} · ${at}` : at}</Caption>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function DetailLoading() {
  const { t } = useI18n();
  return (
    <>
      <Card>
        <Skeleton width="30%" height={24} rounded="full" />
        <Skeleton width="50%" height={40} />
        <Skeleton width="70%" height={16} />
        <Skeleton width="55%" height={16} />
      </Card>
      <LoadingIndicator label={t('detail.loading')} />
    </>
  );
}
