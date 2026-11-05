import type { PriceGroup } from '@mensa/api';
import type { GateState, PayOrderIntent } from '@mensa/domain';
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

/** Home's data and actions; `HomeView` renders them. */
export function HomeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { user, controller, recordsUnavailable, signOut } = usePaymentServices();
  useControllerRevision(controller);
  const gate = usePaymentGate();
  // A change while Home is open (paused, back) is said once; the state Home opened with is not.
  useAnnouncement(gateAnnouncement(gate, t), true);
  const { attention, recent } = homeActivity(controller?.list() ?? []);
  const withPlace = (record: PayOrderIntent) => ({
    record,
    place: controller ? actionPlace(controller, record) : undefined,
  });

  return (
    <HomeView
      name={user?.displayName ?? ''}
      priceGroup={user?.priceGroup ?? null}
      ready={controller !== null}
      recordsUnavailable={recordsUnavailable}
      gate={gate}
      attention={attention.map(withPlace)}
      recent={recent.map(withPlace)}
      onScan={() => navigation.navigate('Scan')}
      onOpenResult={(key) => navigation.navigate('Result', { key })}
      onHistory={() => navigation.navigate('History')}
      onSwitchAccount={signOut}
      onDiagnostics={() => navigation.navigate('Diagnostics')}
    />
  );
}

export interface HomeViewProps {
  name: string;
  /** The server's price group for this account; null when it has none. */
  priceGroup: PriceGroup | null;
  /** The saved payments have been read: paying and the history are possible. */
  ready: boolean;
  recordsUnavailable: boolean;
  gate: GateState | null;
  attention: { record: PayOrderIntent; place: string | undefined }[];
  recent: { record: PayOrderIntent; place: string | undefined }[];
  onScan: () => void;
  onOpenResult: (key: string) => void;
  onHistory: () => void;
  onSwitchAccount: () => void;
  onDiagnostics: () => void;
}

/**
 * The payer's start: who is signed in and at which price (the server's), one dominant "Scan to
 * pay", every payment on this phone that still needs an answer, recent results until dismissed,
 * and the history. The availability warning appears only while payments are unavailable.
 */
export function HomeView(props: HomeViewProps) {
  const { t } = useI18n();
  return (
    <Screen headerless>
      <View className="gap-2">
        <Title>{t('home.title', { name: props.name })}</Title>
        <View className="flex-row flex-wrap items-center gap-2">
          {props.priceGroup ? (
            <Tag
              icon="pricetag-outline"
              label={t('home.priceGroup', { group: t(priceGroupKey(props.priceGroup)) })}
            />
          ) : null}
          <Caption>{t('home.testAccount')}</Caption>
        </View>
      </View>

      {props.recordsUnavailable ? (
        <Notice
          tone="error"
          title={t('home.recordsUnavailable.title')}
          description={t('home.recordsUnavailable.body')}
        />
      ) : null}
      {homeAvailabilityNotice(props.gate) ? <AvailabilityNotice gate={props.gate} /> : null}

      <ScanToPay disabled={!props.ready} onPress={props.onScan} />
      {!props.ready && !props.recordsUnavailable ? (
        <LoadingIndicator label={t('home.loadingRecords')} />
      ) : null}

      {props.ready && props.attention.length > 0 ? (
        <Card title={t('home.attention.title')}>
          <Caption>{t('home.attention.body')}</Caption>
          {props.attention.map(({ record, place }) => (
            <PaymentActionRow
              key={record.key}
              record={record}
              place={place}
              separated
              onPress={() => props.onOpenResult(record.key)}
            />
          ))}
        </Card>
      ) : null}

      {props.ready && props.recent.length > 0 ? (
        <Card title={t('home.recent.title')}>
          {props.recent.map(({ record, place }, index) => (
            <PaymentActionRow
              key={record.key}
              record={record}
              place={place}
              separated={index > 0}
              onPress={() => props.onOpenResult(record.key)}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <ListRow
          icon="receipt-outline"
          title={t('home.history')}
          subtitle={t('home.historyHint')}
          disabled={!props.ready}
          onPress={props.onHistory}
        />
      </Card>

      <View className="flex-row flex-wrap justify-center gap-2">
        <Button
          tone="tertiary"
          icon="swap-horizontal-outline"
          label={t('home.switchAccount')}
          onPress={props.onSwitchAccount}
        />
        <Button
          tone="tertiary"
          icon="construct-outline"
          label={t('nav.diagnostics')}
          onPress={props.onDiagnostics}
        />
      </View>
    </Screen>
  );
}
