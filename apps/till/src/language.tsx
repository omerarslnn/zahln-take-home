// The app's UI language: the device's (or, where the OS offers it, this app's) language preference,
// German or English, with a session-only override in Diagnostics for testing. The student app has
// an identical copy. Nothing is persisted: after a relaunch the app follows the device again.
import { resolveLocale, systemLocale, type LanguageChoice, type Locale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { getLocales, useLocales } from 'expo-localization';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

const deviceLocale = () => systemLocale(getLocales().map((locale) => locale.languageTag));

/** Calls `onChange` on every return to the foreground. */
function subscribeToForeground(onChange: () => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') onChange();
  });
  return () => subscription.remove();
}

/**
 * The language the device prefers for this app, kept current while the app runs:
 * - Android reports a change of the system or per-app language as a configuration change, which
 *   expo-localization turns into an event: `useLocales` re-renders, and the language is read
 *   again. The activity is not recreated (`allowDynamicLocaleChangesAndroid` in app.json), so
 *   nothing on screen is lost.
 * - iOS ends the app when the system or per-app language changes; the next launch reads it.
 * - Every return to the foreground reads it again, in case an event was missed.
 * The snapshot is the resolved language, a string, so an unrelated locale event changes nothing.
 */
function useDeviceLocale(): Locale {
  useLocales();
  return useSyncExternalStore(subscribeToForeground, deviceLocale);
}

interface LanguageSetting {
  /** 'system', or the language Diagnostics fixed for this session. */
  choice: LanguageChoice;
  /** What the device prefers right now. */
  device: Locale;
  choose: (choice: LanguageChoice) => void;
}

const LanguageContext = createContext<LanguageSetting>({
  choice: 'system',
  device: 'en',
  choose: () => undefined,
});

/**
 * Provides translations in the resolved language. A language change re-renders the texts only:
 * the payment services, the session and every controller below keep running untouched.
 */
export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const device = useDeviceLocale();
  // In memory only, on purpose: the override is a testing aid, not a preference to keep.
  const [choice, choose] = useState<LanguageChoice>('system');
  const setting = useMemo(() => ({ choice, device, choose }), [choice, device]);
  return (
    <LanguageContext.Provider value={setting}>
      <I18nProvider locale={resolveLocale(choice, device)} onLocaleChange={choose}>
        {children}
      </I18nProvider>
    </LanguageContext.Provider>
  );
}

/** The language choice and the device language, for the Diagnostics override. */
export function useLanguageSetting(): LanguageSetting {
  return useContext(LanguageContext);
}
