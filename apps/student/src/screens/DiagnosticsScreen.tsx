import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { appVersion } from '../api';
import { ConnectionCheck } from '../components/ConnectionCheck';
import { LanguageSetting } from '../components/LanguageSetting';
import { PaymentAvailability } from '../components/PaymentAvailability';
import { SecureStorageCheck } from '../components/SecureStorageCheck';
import { Button, Card, LabelledValue, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Diagnostics'>;

/** Secondary: checks for support and testing. Nothing here pays, and nothing deletes saved actions. */
export function DiagnosticsScreen({ navigation }: Props) {
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
      <LanguageSetting />
      {__DEV__ ? (
        <Button
          tone="tertiary"
          label="Design system (development)"
          onPress={() => navigation.navigate('DesignCatalogue')}
        />
      ) : null}
    </Screen>
  );
}
