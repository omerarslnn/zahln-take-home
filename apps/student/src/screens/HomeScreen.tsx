import { isFinal, type PayOrderIntent } from '@mensa/domain';
import { formatCents } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, Text, View } from 'react-native';
import { PaymentAvailability } from '../components/PaymentAvailability';
import { priceGroupKey } from '../components/payment-text';
import { Body, Button, Card, Notice, Screen, StatusPill } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { describeOutcome } from '../payment-outcome';
import { useControllerRevision, usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { t, locale } = useI18n();
  const { user, controller, recordsUnavailable, signOut } = usePaymentServices();
  useControllerRevision(controller);
  // This user's payment actions that still need attention or whose result was not dismissed.
  const actions = (controller?.list() ?? [])
    .filter((record): record is PayOrderIntent => record.kind === 'payOrder')
    .sort((a, b) => Number(isFinal(a)) - Number(isFinal(b)));

  return (
    <Screen>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          {t('home.title', { name: user?.displayName ?? '' })}
        </Text>
        <Body muted>
          {t('home.account', {
            group: user?.priceGroup ? t(priceGroupKey(user.priceGroup)) : '–',
          })}
        </Body>
      </View>

      {recordsUnavailable ? (
        <Notice
          tone="error"
          title={t('home.recordsUnavailable.title')}
          description={t('home.recordsUnavailable.body')}
        />
      ) : !controller ? (
        <Notice tone="neutral" title={t('home.loadingRecords')} />
      ) : null}

      <PaymentAvailability />

      <Button
        label={t('home.scan')}
        hint={t('home.scanHint')}
        disabled={!controller}
        onPress={() => navigation.navigate('Scan')}
      />

      {actions.length > 0 ? (
        <Card title={t('home.unfinished')}>
          {actions.map((record) => {
            const outcome = describeOutcome(record);
            const amount = formatCents(record.payload.amountCents, locale);
            return (
              <Pressable
                key={record.key}
                accessibilityRole="button"
                accessibilityLabel={`${t(outcome.title)}, ${amount}`}
                accessibilityHint={t('home.openResult')}
                onPress={() => navigation.navigate('Result', { key: record.key })}
                className="min-h-touch gap-1 border-t border-line py-2 active:opacity-80"
              >
                <StatusPill tone={outcome.tone} label={t(outcome.title)} />
                <Text className="text-base text-ink">{amount}</Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Button
        tone="secondary"
        label={t('home.history')}
        disabled={!controller}
        onPress={() => navigation.navigate('History')}
      />
      <Button tone="secondary" label={t('home.switchAccount')} onPress={signOut} />
      <Button
        tone="secondary"
        label={t('nav.diagnostics')}
        onPress={() => navigation.navigate('Diagnostics')}
      />
    </Screen>
  );
}
