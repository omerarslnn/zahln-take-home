import { useI18n } from '@mensa/shared/react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionCheck } from './components/ConnectionCheck';
import {
  Card,
  FoundationBadge,
  FormatPreview,
  LanguageSwitch,
  TokenSwatches,
} from './components/Foundation';
import { SecureStorageCheck } from './components/SecureStorageCheck';

/**
 * Tablet-first shell. From Tailwind's `md` breakpoint (768 dp, a tablet) the content splits into
 * two columns; on a phone it stacks. Stage 2 puts the order on the left and its QR/status on the right.
 */
export function TillScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View className="flex-row flex-wrap items-center justify-between gap-4 px-6 py-4">
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
            {t('till.title')}
          </Text>
          <FoundationBadge />
        </View>
        <LanguageSwitch />
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-6 md:flex-row md:gap-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="gap-4 md:flex-1">
          <Card>
            <Text className="text-base text-ink">{t('foundation.notice')}</Text>
            <Text className="text-base text-ink-muted">{t('till.next')}</Text>
          </Card>
          <TokenSwatches />
          <FormatPreview />
        </View>
        <View className="gap-4 md:flex-1">
          <ConnectionCheck />
          <SecureStorageCheck />
        </View>
      </ScrollView>
    </View>
  );
}
