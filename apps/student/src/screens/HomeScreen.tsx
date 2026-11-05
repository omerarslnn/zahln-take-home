import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { gateAnnouncement, homeAvailabilityNotice } from '../availability';
import { AvailabilityNotice } from '../components/PaymentAvailability';
import { actionPlace, PaymentActionRow } from '../components/PaymentActionRow';
import { priceGroupKey } from '../components/payment-text';
import { ScanToPay } from '../components/ScanToPay';
import {
  Button,
  Caption,
  Card,
  ListRow,
  LoadingIndicator,
  Notice,
  Screen,
  Tag,
  Title,
  useAnnouncement,
} from '../components/ui';
import { homeActivity } from '../home-activity';
import type { RootStackParamList } from '../navigation';
import {
  useControllerRevision,
  usePaymentGate,
  usePaymentServices,
} from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * The payer's start: who is signed in and at which price (the server's), one dominant "Scan to
 * pay", every payment on this phone that still needs an answer, recent results until dismissed,
 * and the history. The availability warning appears only while payments are unavailable.
 */
export function HomeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { user, controller, recordsUnavailable, signOut } = usePaymentServices();
  useControllerRevision(controller);
  const gate = usePaymentGate();
  // A change while Home is open (paused, back) is said once; the state Home opened with is not.
  useAnnouncement(gateAnnouncement(gate, t), true);
  const { attention, recent } = homeActivity(controller?.list() ?? []);
  const openResult = (key: string) => navigation.navigate('Result', { key });

  return (
    <Screen headerless>
      <View className="gap-2">
        <Title>{t('home.title', { name: user?.displayName ?? '' })}</Title>
        <View className="flex-row flex-wrap items-center gap-2">
          {user?.priceGroup ? (
            <Tag
              icon="pricetag-outline"
              label={t('home.priceGroup', { group: t(priceGroupKey(user.priceGroup)) })}
            />
          ) : null}
          <Caption>{t('home.testAccount')}</Caption>
        </View>
      </View>

      {recordsUnavailable ? (
        <Notice
          tone="error"
          title={t('home.recordsUnavailable.title')}
          description={t('home.recordsUnavailable.body')}
        />
      ) : null}
      {homeAvailabilityNotice(gate) ? <AvailabilityNotice gate={gate} /> : null}

      <ScanToPay disabled={!controller} onPress={() => navigation.navigate('Scan')} />
      {!controller && !recordsUnavailable ? (
        <LoadingIndicator label={t('home.loadingRecords')} />
      ) : null}

      {controller && attention.length > 0 ? (
        <Card title={t('home.attention.title')}>
          <Caption>{t('home.attention.body')}</Caption>
          {attention.map((record) => (
            <PaymentActionRow
              key={record.key}
              record={record}
              place={actionPlace(controller, record)}
              separated
              onPress={() => openResult(record.key)}
            />
          ))}
        </Card>
      ) : null}

      {controller && recent.length > 0 ? (
        <Card title={t('home.recent.title')}>
          {recent.map((record, index) => (
            <PaymentActionRow
              key={record.key}
              record={record}
              place={actionPlace(controller, record)}
              separated={index > 0}
              onPress={() => openResult(record.key)}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <ListRow
          icon="receipt-outline"
          title={t('home.history')}
          subtitle={t('home.historyHint')}
          disabled={!controller}
          onPress={() => navigation.navigate('History')}
        />
      </Card>

      <View className="flex-row flex-wrap justify-center gap-2">
        <Button
          tone="tertiary"
          icon="swap-horizontal-outline"
          label={t('home.switchAccount')}
          onPress={signOut}
        />
        <Button
          tone="tertiary"
          icon="construct-outline"
          label={t('nav.diagnostics')}
          onPress={() => navigation.navigate('Diagnostics')}
        />
      </View>
    </Screen>
  );
}
