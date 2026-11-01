import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { CASHIER_ACCOUNTS } from '../accounts';
import { missingEnvNames } from '../api';
import { LanguageSwitch } from '../components/Foundation';
import { Body, Button, Notice, Screen } from '../components/ui';
import type { TillStackParamList } from '../navigation';
import { usePaymentServices, type SignInOutcome } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<TillStackParamList, 'SignIn'>;
type Failure = Exclude<Exclude<SignInOutcome, { ok: true }>['reason'], 'superseded'>;

/** Picks one of the mock's seeded cashier accounts; the session decides the mensa and the till. */
export function SignInScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { signIn } = usePaymentServices();
  const [pending, setPending] = useState<string | null>(null);
  // 'superseded' (a newer sign-in replaced this one) is not a failure to show.
  const [failure, setFailure] = useState<Failure | null>(null);

  async function choose(username: string) {
    if (pending) return;
    setPending(username);
    setFailure(null);
    const result = await signIn(username);
    setPending(null);
    if (!result.ok && result.reason !== 'superseded') setFailure(result.reason);
  }

  return (
    <Screen>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
          {t('till.title')}
        </Text>
        <Body muted>{t('till.signIn.intro')}</Body>
      </View>

      {missingEnvNames.length > 0 ? (
        <Notice tone="error" title={t('signIn.notConfigured')}>
          <Body>{missingEnvNames.join(', ')}</Body>
        </Notice>
      ) : null}

      <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
        {t('till.signIn.choose')}
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {CASHIER_ACCOUNTS.map((account) => (
          <View key={account.username} style={{ width: width >= 768 ? '48%' : '100%' }}>
            <Button
              label={`${account.username} · ${account.place}`}
              busy={pending === account.username}
              disabled={pending !== null && pending !== account.username}
              onPress={() => void choose(account.username)}
            />
          </View>
        ))}
      </View>

      {failure ? (
        <Notice tone="error" title={t('signIn.failed')}>
          <Body>{t(`signIn.failure.${failure}`)}</Body>
        </Notice>
      ) : null}

      <LanguageSwitch />
      <Button
        tone="secondary"
        label={t('nav.diagnostics')}
        onPress={() => navigation.navigate('Diagnostics')}
      />
    </Screen>
  );
}
