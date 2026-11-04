import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DEMO_ACCOUNTS } from '../accounts';
import { missingApiEnvNames, missingEnvNames } from '../api';
import { BrandHeader, SignInForm, useSignIn } from '../components/SignIn';
import { Body, Button, Card, ListRow, Notice, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation';
import { usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

/**
 * Sign-in for payers: a username and password, or one of the mock's demo accounts in one tap.
 * Both end in the same session (role-checked before anyone sees the account); the next screen
 * appears once that session exists. There is no registration: the API cannot create accounts.
 */
export function SignInScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { services } = usePaymentServices();
  const signIn = useSignIn('student');
  const configured = services !== null && missingApiEnvNames.length === 0;

  return (
    <Screen headerless>
      <BrandHeader icon="restaurant" title={t('signIn.welcome')} tagline={t('signIn.tagline')} />

      {missingEnvNames.length > 0 ? (
        <Notice
          tone={configured ? 'warning' : 'error'}
          title={t('signIn.notConfigured')}
          description={missingEnvNames.join(', ')}
        />
      ) : null}

      <SignInForm
        state={signIn}
        title={t('signIn.form.title')}
        footnote={t('signIn.noRegistration')}
        enabled={configured}
      />

      <Card title={t('signIn.demo.title')}>
        <Body muted>{t('signIn.demo.description')}</Body>
        {DEMO_ACCOUNTS.map((account, index) => (
          <ListRow
            key={account.username}
            icon={account.icon}
            title={t(account.title)}
            subtitle={t(account.detail)}
            hint={t('signIn.demo.hint')}
            separated={index > 0}
            busy={signIn.pending === account.username}
            disabled={
              !configured || (signIn.pending !== null && signIn.pending !== account.username)
            }
            onPress={() => void signIn.signInDemo(account.username)}
          />
        ))}
      </Card>

      <Button
        tone="tertiary"
        icon="construct-outline"
        label={t('nav.diagnostics')}
        onPress={() => navigation.navigate('Diagnostics')}
      />
    </Screen>
  );
}
