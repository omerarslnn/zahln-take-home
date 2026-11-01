import { useI18n } from '@mensa/shared/react';
import { Text } from 'react-native';
import { appVersion } from '../api';
import { ConnectionCheck } from '../components/ConnectionCheck';
import { Card, LabelledValue } from '../components/Foundation';
import { PaymentAvailability } from '../components/PaymentAvailability';
import { SecureStorageCheck } from '../components/SecureStorageCheck';
import { Screen } from '../components/ui';

/** Secondary: checks for support and testing. Nothing here pays, and nothing deletes saved actions. */
export function DiagnosticsScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
        {t('nav.diagnostics')}
      </Text>
      <Card>
        <LabelledValue label={t('diagnostics.version')} value={appVersion ?? '–'} />
      </Card>
      <PaymentAvailability />
      <ConnectionCheck />
      <SecureStorageCheck />
    </Screen>
  );
}
