import { colors } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from './ui';

/**
 * Home's main action: a brand-coloured tile that opens the scanner. One button for screen readers
 * ("Scan to pay", with a hint); grey and not tappable while the saved payments are still loading.
 */
export function ScanToPay({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { t } = useI18n();
  const ink = disabled ? 'text-ink-muted' : 'text-brand-on';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.scan.title')}
      accessibilityHint={t('home.scanHint')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-touch flex-row items-center gap-4 rounded-card p-5 ${disabled ? 'bg-fill' : 'bg-brand active:bg-brand-strong'}`}
    >
      <View
        className={`h-14 w-14 items-center justify-center rounded-full ${disabled ? 'bg-surface' : 'bg-brand-strong'}`}
      >
        <Icon
          name="qr-code-outline"
          size="xl"
          color={disabled ? colors.inkMuted : colors.brandOn}
        />
      </View>
      <View className="flex-1 gap-1">
        <Text className={`text-headline font-bold ${ink}`}>{t('home.scan.title')}</Text>
        <Text className={`text-body ${ink}`}>{t('home.scan.body')}</Text>
      </View>
      <Icon name="arrow-forward" color={disabled ? colors.inkMuted : colors.brandOn} />
    </Pressable>
  );
}
