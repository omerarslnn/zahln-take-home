import type { Payment, PaymentDetail } from '@mensa/api';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  DetailLoading,
  ItemsCard,
  PaymentHero,
  RefundsCard,
  TimelineCard,
} from '../components/PaymentSummary';
import { Button, Notice, Screen } from '../components/ui';
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
