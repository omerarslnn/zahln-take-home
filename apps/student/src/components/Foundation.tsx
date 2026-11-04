// Small building blocks shared by the screens. The till has its own copy on purpose: sharing
// React Native components needs a native-only package (see docs/review-guide.md).
import { LOCALES } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Pressable, Text, View } from 'react-native';

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
