import { useI18n } from '@mensa/shared/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  FoundationBadge,
  FormatPreview,
  LanguageSwitch,
  TokenSwatches,
} from '../components/Foundation';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-4 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          {t('student.title')}
        </Text>
        <FoundationBadge />
      </View>
      <Card>
        <Text className="text-base text-ink">{t('foundation.notice')}</Text>
        <Text className="text-base text-ink-muted">{t('student.next')}</Text>
      </Card>
      <LanguageSwitch />
      <TokenSwatches />
      <FormatPreview />
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Connection')}
        className="min-h-touch items-center justify-center rounded-control bg-brand px-4 active:opacity-80"
      >
        <Text className="font-semibold text-brand-on">{t('student.openConnection')}</Text>
      </Pressable>
    </ScrollView>
  );
}
