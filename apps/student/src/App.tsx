import { PAYER_ROLES, type GateChecks } from '@mensa/domain';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { preloadIcons } from './components/ui';
import { AppLanguageProvider } from './language';
import { RootNavigator } from './navigation';
import { deviceConnectivity } from './payments/connectivity';
import { PaymentServicesProvider } from './payments/PaymentServices';

preloadIcons();

/**
 * Payment availability is read again when the connection comes back while the app is in front,
 * and at spaced intervals after a read without an answer (the default retries).
 */
const GATE_CHECKS: GateChecks = { connectivity: deviceConnectivity };

export default function App() {
  return (
    <SafeAreaProvider>
      {/* The device's language; Intl's default locale is not used (in Expo Go on the iOS
          simulator it stayed English with the device set to German). */}
      <AppLanguageProvider>
        {/* Default polling: a payment usually settles in seconds; checking stops after 3 minutes. */}
        <PaymentServicesProvider roles={PAYER_ROLES} gateChecks={GATE_CHECKS}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </PaymentServicesProvider>
        <StatusBar style="dark" />
      </AppLanguageProvider>
    </SafeAreaProvider>
  );
}
