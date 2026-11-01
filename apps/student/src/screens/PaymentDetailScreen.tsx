import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PaymentDetails } from '../components/PaymentDetails';
import { Button, Notice, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { usePaymentDetail } from '../payments/usePaymentDetail';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentDetail'>;

/** One payment with its refunds and full server history. Read-only for a payer. */
export function PaymentDetailScreen({ route }: Props) {
  const { t } = useI18n();
  const { view, loading, failure, reload } = usePaymentDetail(route.params.paymentId);

  return (
    <Screen>
      {failure ? (
        <Notice tone="error" title={t(`detail.failure.${failure}`)}>
          <Button label={t('common.retry')} busy={loading} onPress={() => void reload()} />
        </Notice>
      ) : null}
      {view ? (
        <>
          <PaymentDetails payment={view.payment} detail={view.detail} />
          <Button
            tone="secondary"
            label={t('detail.refresh')}
            busy={loading}
            onPress={() => void reload()}
          />
        </>
      ) : failure ? null : (
        <Notice tone="neutral" title={t('detail.loading')} />
      )}
    </Screen>
  );
}
