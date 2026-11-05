// The Diagnostics language override, for testing both languages without changing the device. The
// till has an identical copy. The normal screens have no language switch: the app follows the
// device language.
import { colors, type LanguageChoice } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Pressable, Text, View } from 'react-native';
import { useLanguageSetting } from '../language';
import { Body, Card, Icon } from './ui';

/**
 * "Device language (Deutsch)", "Deutsch", "English" as one radio group. Each language is named in
 * its own language, so it can be found whatever the current one is. A choice lasts until the app
 * is closed; "Device language" follows the device again.
 */
export function LanguageSetting() {
  const { t } = useI18n();
  const { choice, device, choose } = useLanguageSetting();
  const name = (locale: 'de' | 'en') => t(locale === 'de' ? 'language.de' : 'language.en');
  const options: { value: LanguageChoice; label: string }[] = [
    { value: 'system', label: t('language.system', { language: name(device) }) },
    { value: 'de', label: name('de') },
    { value: 'en', label: name('en') },
  ];
  return (
    <Card title={t('language.label')}>
      <Body muted>{t('language.description')}</Body>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('language.label')}>
        {options.map((option, index) => {
          const selected = option.value === choice;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => choose(option.value)}
              className={`min-h-touch flex-row items-center gap-3 py-3 active:opacity-70 ${index > 0 ? 'border-t border-line-subtle' : ''}`}
            >
              <Icon
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                color={selected ? colors.brand : colors.line}
              />
              <Text className="flex-1 text-body text-ink">{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
