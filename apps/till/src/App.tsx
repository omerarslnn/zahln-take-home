import { pickLocale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TillScreen } from './TillScreen';

// The user's preferred system language. Intl's default locale is not reliable for this: in Expo Go
// on the iOS simulator it stayed English with the device set to German.
const deviceLanguage = getLocales()[0]?.languageTag;

/** The till is one screen for now; a navigator is added when refunds get their own flow. */
export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider initialLocale={pickLocale(deviceLanguage)}>
        <TillScreen />
        <StatusBar style="dark" />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
