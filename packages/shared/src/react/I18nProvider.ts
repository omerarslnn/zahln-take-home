// React bindings for the shared translations. They use only `react` (no react-native, no react-dom),
// so the native apps and the web dashboard share them. Written with createElement so this package
// needs no JSX setup of its own.
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MessageKey } from '../i18n/messages';
import { translate, type Locale, type MessageParams } from '../i18n/translate';

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The current UI language for one app. With `initialLocale` the provider keeps the language itself
 * and `setLocale` changes it (the dashboard's switch). With `locale` the app decides (the native
 * apps follow the device language) and `setLocale` calls `onLocaleChange`. Changing the language
 * re-renders only what reads translations; nothing below is remounted.
 */
export function I18nProvider(
  props: { children: ReactNode } & (
    { initialLocale: Locale } | { locale: Locale; onLocaleChange: (locale: Locale) => void }
  ),
) {
  const [own, setOwn] = useState('locale' in props ? props.locale : props.initialLocale);
  const locale = 'locale' in props ? props.locale : own;
  const setLocale = 'locale' in props ? props.onLocaleChange : setOwn;
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  );
  return createElement(I18nContext.Provider, { value }, props.children);
}

/** Current language, a setter and `t()` for the nearest <I18nProvider>. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
