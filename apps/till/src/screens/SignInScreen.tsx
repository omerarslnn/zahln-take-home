import { colors } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, useWindowDimensions, View } from 'react-native';
import { CASHIER_LOCATIONS } from '../accounts';
import { missingApiEnvNames, missingEnvNames } from '../api';
import { BrandHeader, SignInForm, useSignIn, type SignInState } from '../components/SignIn';
import { Body, Button, Card, Icon, ListRow, Notice, Screen } from '../components/ui';
import type { TillStackParamList } from '../navigation';
import { usePaymentServices } from '../payments/PaymentServices';

type Props = NativeStackScreenProps<TillStackParamList, 'SignIn'>;

/** Keeps each column one group for Android screen readers (see CheckoutScreen). */
const SCREEN_READER_GROUP = { collapsable: false, importantForAccessibility: 'yes' } as const;

/**
 * Cashier sign-in, laid out for the iPad first: brand and form on the left, the demo cashiers by
 * mensa on the right; one column on narrower screens. The session decides the mensa and the till,
 * and only a cashier account is accepted (checked before anyone sees the account). Checkout
 * appears once the session exists.
 */
export function SignInScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { services } = usePaymentServices();
  const signIn = useSignIn('till');
  const configured = services !== null && missingApiEnvNames.length === 0;

  const intro = (
    <>
      <BrandHeader icon="storefront" title={t('till.title')} tagline={t('till.signIn.tagline')} />
      {missingEnvNames.length > 0 ? (
        <Notice
          tone={configured ? 'warning' : 'error'}
          title={t('signIn.notConfigured')}
          description={missingEnvNames.join(', ')}
        />
      ) : null}
      <SignInForm
        state={signIn}
        title={t('till.signIn.form.title')}
        footnote={`${t('till.signIn.serverAssigns')} ${t('till.signIn.noRegistration')}`}
        enabled={configured}
      />
    </>
  );
  const diagnostics = (
    <Button
      tone="tertiary"
      icon="construct-outline"
      label={t('nav.diagnostics')}
      onPress={() => navigation.navigate('Diagnostics')}
    />
  );

  return (
    <Screen headerless>
      {wide ? (
        <View className="flex-row items-start gap-6">
          <View className="flex-1 gap-4" {...SCREEN_READER_GROUP}>
            {intro}
            {diagnostics}
          </View>
          <View className="flex-1" {...SCREEN_READER_GROUP}>
            <DemoCashiers state={signIn} enabled={configured} />
          </View>
        </View>
      ) : (
        <>
          {intro}
          <DemoCashiers state={signIn} enabled={configured} />
          {diagnostics}
        </>
      )}
    </Screen>
  );
}

/** The published cashier accounts, one group per mensa; a tap signs that cashier in. */
function DemoCashiers({ state, enabled }: { state: SignInState; enabled: boolean }) {
  const { t } = useI18n();
  return (
    <Card title={t('till.signIn.demo.title')}>
      <Body muted>{t('till.signIn.demo.description')}</Body>
      {CASHIER_LOCATIONS.map((location) => (
        <View key={location.place} className="pt-2">
          <View className="flex-row items-center gap-2 pb-1">
            <Icon name="location-outline" size="sm" color={colors.inkMuted} />
            <Text accessibilityRole="header" className="flex-1 text-body font-semibold text-ink">
              {location.place}
            </Text>
          </View>
          {location.cashiers.map((cashier) => (
            <ListRow
              key={cashier.username}
              title={t('till.signIn.demo.cashier', { number: cashier.number })}
              subtitle={cashier.username}
              hint={t('signIn.demo.hint')}
              separated
              busy={state.pending === cashier.username}
              disabled={!enabled || (state.pending !== null && state.pending !== cashier.username)}
              onPress={() => void state.signInDemo(cashier.username)}
            />
          ))}
        </View>
      ))}
    </Card>
  );
}
