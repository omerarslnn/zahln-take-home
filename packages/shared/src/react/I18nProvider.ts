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

/** Holds the current UI language for one app. */
export function I18nProvider(props: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState(props.initialLocale);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale],
  );
  return createElement(I18nContext.Provider, { value }, props.children);
}

/** Current language, a setter and `t()` for the nearest <I18nProvider>. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
