import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { TEST_ACCOUNTS } from '../accounts';
import { missingEnvNames } from '../api';
import { LanguageSwitch } from '../components/Foundation';
import { priceGroupKey } from '../components/payment-text';
import { Body, Button, Notice, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { usePaymentServices, type SignInOutcome } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;
type Failure = Exclude<Exclude<SignInOutcome, { ok: true }>['reason'], 'superseded'>;

/** Picks one of the mock's seeded payer accounts. The next screen appears once the session exists. */
export function SignInScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { signIn } = usePaymentServices();
  const [pending, setPending] = useState<string | null>(null);
  // 'superseded' (a newer sign-in replaced this one) is not a failure to show.
  const [failure, setFailure] = useState<Failure | null>(null);

  async function choose(username: string) {
    if (pending) return; // one sign-in at a time
    setPending(username);
    setFailure(null);
    const result = await signIn(username);
    setPending(null);
    if (!result.ok && result.reason !== 'superseded') setFailure(result.reason);
  }

  return (
    <Screen>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          {t('student.title')}
        </Text>
        <Body muted>{t('signIn.intro')}</Body>
      </View>

      {missingEnvNames.length > 0 ? (
        <Notice
          tone="error"
          title={t('signIn.notConfigured')}
          description={missingEnvNames.join(', ')}
        />
      ) : null}

      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
          {t('signIn.choose')}
        </Text>
        {TEST_ACCOUNTS.map((account) => (
          <Button
            key={account.username}
            label={t('signIn.account', {
              name: account.username,
              group: t(priceGroupKey(account.group)),
            })}
            busy={pending === account.username}
            disabled={pending !== null && pending !== account.username}
            onPress={() => void choose(account.username)}
          />
        ))}
      </View>

      {failure ? (
        <Notice
          tone="error"
          title={t('signIn.failed')}
          description={t(`signIn.failure.${failure}`)}
        />
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
