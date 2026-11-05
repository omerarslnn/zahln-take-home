import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { appVersion } from '../api';
import { ConnectionCheck } from '../components/ConnectionCheck';
import { LanguageSetting } from '../components/LanguageSetting';
import { SecureStorageCheck } from '../components/SecureStorageCheck';
import { Button, Card, LabelledValue, Screen, Title } from '../components/ui';
import type { TillStackParamList } from '../navigation';

type Props = NativeStackScreenProps<TillStackParamList, 'Diagnostics'>;

/** Secondary: checks for support and testing. Nothing here deletes saved orders or refunds. */
export function DiagnosticsScreen({ navigation }: Props) {
  const { t } = useI18n();
  return (
    <Screen>
      <Title>{t('nav.diagnostics')}</Title>
      <Card>
        <LabelledValue label={t('diagnostics.version')} value={appVersion ?? '–'} />
      </Card>
      <ConnectionCheck />
      <SecureStorageCheck />
      <LanguageSetting />
      {__DEV__ ? (
        <>
          <Button
            tone="tertiary"
            label="Design system (development)"
            onPress={() => navigation.navigate('DesignCatalogue')}
          />
          <Button
            tone="tertiary"
            label="Till screen states (development)"
            onPress={() => navigation.navigate('TillStates')}
          />
        </>
      ) : null}
    </Screen>
  );
}
