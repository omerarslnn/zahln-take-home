// Small building blocks of the foundation screen. The student app has its own copy on purpose: sharing
// React Native components needs a native-only package (see docs/review-guide.md).
import { colors, formatBerlinDateTime, formatCents, LOCALES, type ColorToken } from '@mensa/shared';
import { useI18n, useNow } from '@mensa/shared/react';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-2 rounded-card bg-surface p-4">
      {title ? (
        <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function FoundationBadge() {
  const { t } = useI18n();
  return (
    <View className="self-start rounded-control bg-warning px-2 py-1">
      <Text className="text-sm font-semibold text-white">{t('foundation.badge')}</Text>
    </View>
  );
}

/** DE/EN switch announced as a radio group; each label is written in its own language. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('language.label')}
      className="flex-row gap-2"
    >
      {LOCALES.map((option) => {
        const selected = option === locale;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setLocale(option)}
            className={`min-h-touch min-w-touch items-center justify-center rounded-control border-2 px-4 active:opacity-80 ${
              selected ? 'border-brand bg-brand' : 'border-line bg-surface'
            }`}
          >
            <Text className={`font-semibold ${selected ? 'text-brand-on' : 'text-ink'}`}>
              {t(option === 'de' ? 'language.de' : 'language.en')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SWATCHES: ColorToken[] = ['brand', 'ink', 'inkMuted', 'success', 'warning', 'danger'];

export function TokenSwatches() {
  const { t } = useI18n();
  return (
    <Card title={t('foundation.tokens')}>
      <View className="flex-row flex-wrap gap-3">
        {SWATCHES.map((token) => (
          <View
            key={token}
            accessible
            accessibilityLabel={`${token} ${colors[token]}`}
            className="w-36 flex-row items-center gap-2"
          >
            <View
              className="h-8 w-8 rounded-control border border-line"
              style={{ backgroundColor: colors[token] }}
            />
            <Text className="text-ink">{token}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function FormatPreview() {
  const { t, locale } = useI18n();
  const now = useNow();
  return (
    <Card title={t('foundation.formatting')}>
      <LabelledValue label={t('foundation.sampleAmount')} value={formatCents(1250, locale)} />
      <LabelledValue label={t('foundation.berlinTime')} value={formatBerlinDateTime(now, locale)} />
    </Card>
  );
}

/** Read as one phrase by screen readers ("label: value") instead of two separate stops. */
export function LabelledValue({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className="text-ink-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
