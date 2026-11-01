import { useI18n } from '@mensa/shared/react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePaymentServices } from './payments/PaymentServices';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { PaymentDetailScreen } from './screens/PaymentDetailScreen';
import { PaymentsScreen } from './screens/PaymentsScreen';
import { SignInScreen } from './screens/SignInScreen';

export type TillStackParamList = {
  SignIn: undefined;
  Checkout: undefined;
  Payments: undefined;
  PaymentDetail: { paymentId: string };
  Diagnostics: undefined;
};

const Stack = createNativeStackNavigator<TillStackParamList>();

/** The till's screens; the signed-in ones exist only while a cashier session does. */
export function TillNavigator() {
  const { t } = useI18n();
  const { user } = usePaymentServices();
  return (
    <Stack.Navigator>
      {user ? (
        <>
          <Stack.Screen
            name="Checkout"
            component={CheckoutScreen}
            options={{ title: t('till.nav.checkout') }}
          />
          <Stack.Screen
            name="Payments"
            component={PaymentsScreen}
            options={{ title: t('till.nav.payments') }}
          />
          <Stack.Screen
            name="PaymentDetail"
            component={PaymentDetailScreen}
            options={{ title: t('nav.paymentDetail') }}
          />
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: t('nav.signIn') }} />
      )}
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: t('nav.diagnostics') }}
      />
    </Stack.Navigator>
  );
}
