import { CASHIER_ROLES, type PollingOptions } from '@mensa/domain';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { preloadIcons } from './components/ui';
import { AppLanguageProvider } from './language';
import { TillNavigator } from './navigation';
import { PaymentServicesProvider } from './payments/PaymentServices';

preloadIcons();

/**
 * An order lives 5 minutes and its payment can stay pending for minutes after that, so the till
 * follows an order for up to 10 minutes before asking the cashier to check again.
 */
const TILL_POLLING: PollingOptions = { budgetMs: 10 * 60_000 };

export default function App() {
  return (
    <SafeAreaProvider>
      {/* The device's language; Intl's default locale is not used (in Expo Go on the iOS
          simulator it stayed English with the device set to German). */}
      <AppLanguageProvider>
        <PaymentServicesProvider roles={CASHIER_ROLES} polling={TILL_POLLING}>
          <NavigationContainer>
            <TillNavigator />
          </NavigationContainer>
        </PaymentServicesProvider>
        <StatusBar style="dark" />
      </AppLanguageProvider>
    </SafeAreaProvider>
  );
}
