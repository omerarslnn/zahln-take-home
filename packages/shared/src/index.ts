// Platform-neutral: plain TypeScript, no React, no react-native, no DOM. React bindings are in
// '@mensa/shared/react' so non-React consumers (scripts, domain) never pull React in.
export {
  berlinDateKey,
  FINANCE_TIME_ZONE,
  formatBerlinDateTime,
  formatBerlinTime,
} from './format/datetime';
export {
  addCalendarDays,
  berlinDayBound,
  berlinDayRange,
  berlinDayStart,
  formatCalendarDay,
  parseCalendarDay,
  toBerlinIso,
  type CalendarDay,
} from './format/berlin-days';
export { parseEuroAmount, type EuroInput } from './format/euro-input';
export { formatCents } from './format/money';
export { de, en, type MessageKey } from './i18n/messages';
export { LOCALES, pickLocale, translate, type Locale, type MessageParams } from './i18n/translate';
export { resolveLocale, systemLocale, type LanguageChoice } from './i18n/language';
export {
  colors,
  iconSize,
  motion,
  radius,
  space,
  touchTarget,
  typeScale,
  type ColorToken,
} from './tokens';
