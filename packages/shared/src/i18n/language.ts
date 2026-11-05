import { LOCALES, type Locale } from './translate';

/** Follow the device's language, or a fixed one (a session-only override, for testing). */
export type LanguageChoice = 'system' | Locale;

/**
 * The UI language for the device's (or app's) language preferences, most preferred first, as BCP 47
 * tags such as "de-AT": the first language the app supports, English when none is. Only the
 * primary subtag counts, so every regional German ("de-CH", "de_AT") is German. Taking the first
 * SUPPORTED language, not just the first one, matches how iOS and Android pick an app's own
 * localized resources: with Turkish, then German, both choose German.
 */
export function systemLocale(tags: readonly (string | null | undefined)[]): Locale {
  for (const tag of tags) {
    const language = tag?.split(/[-_]/)[0]?.toLowerCase();
    const supported = LOCALES.find((locale) => locale === language);
    if (supported) return supported;
  }
  return 'en';
}

/** The language to show: the override while there is one, otherwise the device's language. */
export function resolveLocale(choice: LanguageChoice, system: Locale): Locale {
  return choice === 'system' ? system : choice;
}
