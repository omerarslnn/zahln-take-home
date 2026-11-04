import type { PollingOptions } from '@mensa/domain';
import { pickLocale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { NavigationContainer } from '@react-navigation/native';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { preloadIcons } from './components/ui';
import { TillNavigator } from './navigation';
import { PaymentServicesProvider } from './payments/PaymentServices';

// The user's preferred system language. Intl's default locale is not reliable for this: in Expo Go
// on the iOS simulator it stayed English with the device set to German.
const deviceLanguage = getLocales()[0]?.languageTag;

preloadIcons();

/**
 * An order lives 5 minutes and its payment can stay pending for minutes after that, so the till
 * follows an order for up to 10 minutes before asking the cashier to check again.
 */
const TILL_POLLING: PollingOptions = { budgetMs: 10 * 60_000 };

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider initialLocale={pickLocale(deviceLanguage)}>
        <PaymentServicesProvider polling={TILL_POLLING}>
          <NavigationContainer>
            <TillNavigator />
          </NavigationContainer>
        </PaymentServicesProvider>
        <StatusBar style="dark" />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
