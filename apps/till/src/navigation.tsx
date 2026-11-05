import { useI18n } from '@mensa/shared/react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type * as Catalogue from './screens/DesignCatalogueScreen';
import type * as States from './screens/TillStatesScreen';
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
  /** Development builds only: the design-system catalogue. */
  DesignCatalogue: undefined;
  /** Development builds only: the till's views in each state, with sample data. */
  TillStates: undefined;
  TillStatePreview: { state: string };
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
            // The checkout shows the till's own header (mensa, till, actions) to save height.
            options={{ title: t('till.nav.checkout'), headerShown: false }}
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
        <Stack.Screen
          name="SignIn"
          component={SignInScreen}
          // The screen shows the app's own brand header instead of a navigation bar.
          options={{ title: t('nav.signIn'), headerShown: false }}
        />
      )}
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: t('nav.diagnostics') }}
      />
      {__DEV__ ? (
        // Development only: the requires sit in a branch Metro removes from release bundles.
        <>
          <Stack.Screen
            name="DesignCatalogue"
            getComponent={() =>
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              (require('./screens/DesignCatalogueScreen') as typeof Catalogue).DesignCatalogueScreen
            }
            options={{ title: 'Design system' }}
          />
          <Stack.Screen
            name="TillStates"
            getComponent={() =>
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              (require('./screens/TillStatesScreen') as typeof States).TillStatesScreen
            }
            options={{ title: 'Till screen states' }}
          />
          <Stack.Screen
            name="TillStatePreview"
            getComponent={() =>
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              (require('./screens/TillStatesScreen') as typeof States).TillStatePreviewScreen
            }
            options={{ title: 'Preview (sample data)' }}
          />
        </>
      ) : null}
    </Stack.Navigator>
  );
}
