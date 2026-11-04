import { useI18n } from '@mensa/shared/react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type * as Catalogue from './screens/DesignCatalogueScreen';
import { usePaymentServices } from './payments/PaymentServices';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PaymentDetailScreen } from './screens/PaymentDetailScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ScanScreen } from './screens/ScanScreen';
import { SignInScreen } from './screens/SignInScreen';

/** Every screen and its route parameters; TypeScript checks every `navigate` against this. */
export type RootStackParamList = {
  SignIn: undefined;
  Home: undefined;
  Scan: undefined;
  Review: { orderId: string };
  /** One payment action, by its intent key (never shown to the user). */
  Result: { key: string };
  History: undefined;
  PaymentDetail: { paymentId: string };
  Diagnostics: undefined;
  /** Development builds only: the design-system catalogue. */
  DesignCatalogue: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * A native stack: platform push/pop transitions and back handling, like a navigation controller.
 * The signed-in screens exist only while a session does: signing out or switching the account
 * removes them (and their in-flight reads) and returns to the account choice.
 */
export function RootNavigator() {
  const { t } = useI18n();
  const { user } = usePaymentServices();
  return (
    <Stack.Navigator>
      {user ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t('nav.scan') }} />
          <Stack.Screen
            name="Review"
            component={ReviewScreen}
            options={{ title: t('nav.review') }}
          />
          <Stack.Screen
            name="Result"
            component={ResultScreen}
            options={{ title: t('nav.result') }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: t('nav.history') }}
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
      {__DEV__ ? (
        // Development only: the require sits in a branch Metro removes from release bundles.
        <Stack.Screen
          name="DesignCatalogue"
          getComponent={() =>
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            (require('./screens/DesignCatalogueScreen') as typeof Catalogue).DesignCatalogueScreen
          }
          options={{ title: 'Design system' }}
        />
      ) : null}
    </Stack.Navigator>
  );
}
