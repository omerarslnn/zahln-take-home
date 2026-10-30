import { de, en, type MessageKey } from './messages';

export type Locale = 'de' | 'en';
export type MessageParams = Record<string, string | number>;

export const LOCALES: readonly Locale[] = ['de', 'en'];

const catalogues: Record<Locale, Record<MessageKey, string>> = { de, en };

/** Picks the UI language from a BCP 47 tag such as "de-AT". Anything that is not German gets English. */
export function pickLocale(languageTag: string | undefined): Locale {
  return languageTag?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/**
 * Returns the message for `key` in `locale`, replacing `{name}` placeholders from `params`.
 * A placeholder without a value stays visible, so a missing parameter is noticed rather than hidden.
 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = catalogues[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(params[name] ?? placeholder),
  );
}
