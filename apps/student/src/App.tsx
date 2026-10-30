import { pickLocale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { NavigationContainer } from '@react-navigation/native';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';

// The user's preferred system language. Intl's default locale is not reliable for this: in Expo Go
// on the iOS simulator it stayed English with the device set to German.
const deviceLanguage = getLocales()[0]?.languageTag;

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider initialLocale={pickLocale(deviceLanguage)}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="dark" />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
